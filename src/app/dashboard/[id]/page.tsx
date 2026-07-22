import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TRAVEL_REQUEST_STATUS_LABELS } from "@/lib/status";
import { getPassportPreviewUrl, getPricing } from "../actions";
import { PassportUploadForm } from "./passport-upload-form";
import { TravelerDetailsForm } from "./traveler-details-form";
import { QuestionnaireForm } from "./questionnaire-form";
import { MandateForm } from "./mandate-form";
import { PaymentForm } from "./payment-form";
import { PaymentPendingRefresher } from "./payment-pending-refresher";
import { QrScanPanel } from "./qr-scan-panel";
import { decryptPassportField } from "@/lib/crypto/passport-encryption";
import { pgHexToBytes } from "@/lib/postgres-bytea";
import { parseQuestionnaireSchema } from "@/lib/questionnaire/types";
import { isStripeConfigured } from "@/lib/stripe/client";

export default async function TravelRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { id } = await params;
  const { payment: paymentQueryParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: travelRequest } = await supabase
    .from("travel_requests")
    .select("id, status, created_at")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!travelRequest) notFound();

  const { data: traveler } = await supabase
    .from("travelers")
    .select(
      "id, data_validated_by_customer, ocr_status, ocr_confidence_score, first_name, last_name, sex, date_of_birth, nationality, passport_number_encrypted, passport_issuing_country, passport_expiry_date, encryption_key_version",
    )
    .eq("travel_request_id", id)
    .single();

  // Pré-remplissage du formulaire uniquement quand la lecture automatique a
  // réussi avec une confiance suffisante (ocr_status = 'success') : on
  // déchiffre alors le numéro de passeport pour le réafficher au client —
  // légitime ici, il ne s'agit que de lui montrer ses propres informations.
  const travelerInitialValues =
    traveler?.ocr_status === "success" && traveler.passport_number_encrypted
      ? {
          first_name: traveler.first_name,
          last_name: traveler.last_name,
          sex: traveler.sex,
          date_of_birth: traveler.date_of_birth,
          nationality: traveler.nationality,
          passport_number: decryptPassportField(
            pgHexToBytes(traveler.passport_number_encrypted),
            traveler.encryption_key_version,
          ),
          passport_issuing_country: traveler.passport_issuing_country,
          passport_expiry_date: traveler.passport_expiry_date,
        }
      : undefined;

  const { data: latestDocument } = await supabase
    .from("documents")
    .select("id")
    .eq("travel_request_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previewUrl = latestDocument ? await getPassportPreviewUrl(latestDocument.id) : null;

  const { data: timeline } = await supabase
    .from("timeline")
    .select("id, event_type, message, created_at")
    .eq("travel_request_id", id)
    .order("created_at", { ascending: false });

  // Chargé uniquement quand pertinent (données passeport déjà validées) :
  // évite une requête inutile pour un dossier encore en amont du parcours.
  let questionnaireSchema = null as ReturnType<typeof parseQuestionnaireSchema> | null;
  let activeQuestionnaireId: string | null = null;
  let questionnaireComplete = false;
  let initialAnswers: Record<string, unknown> = {};

  if (traveler?.data_validated_by_customer) {
    const { data: activeQuestionnaire } = await supabase
      .from("questionnaires")
      .select("id, schema_json")
      .eq("destination_code", "ESTA_US")
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (activeQuestionnaire) {
      activeQuestionnaireId = activeQuestionnaire.id;
      questionnaireSchema = parseQuestionnaireSchema(activeQuestionnaire.schema_json);

      const { data: answers } = await supabase
        .from("answers")
        .select("question_key, answer_value")
        .eq("traveler_id", traveler.id)
        .eq("questionnaire_id", activeQuestionnaire.id)
        .is("deleted_at", null);

      initialAnswers = Object.fromEntries((answers ?? []).map((a) => [a.question_key, a.answer_value]));

      // Complétion dérivée, pas stockée : aucune colonne ne trace "questionnaire
      // terminé" — on compare les clés obligatoires du schéma aux réponses déjà
      // enregistrées, cohérent avec la même logique côté serveur (submitQuestionnaireAnswers).
      const answeredKeys = new Set(Object.keys(initialAnswers));
      questionnaireComplete = questionnaireSchema
        .filter((q) => q.required)
        .every((q) => answeredKeys.has(q.key));
    }
  }

  const { data: mandate } = traveler
    ? await supabase
        .from("mandates")
        .select("id")
        .eq("travel_request_id", id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  const stripeConfigured = isStripeConfigured();
  const pricing =
    travelRequest.status === "payment_pending" && stripeConfigured ? await getPricing() : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <Link href="/dashboard" className="text-sm text-black/60 hover:underline dark:text-white/60">
        ← Mes dossiers
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">ESTA — États-Unis</h1>
      <p className="mt-1 text-sm font-medium text-fenua-violet">
        {TRAVEL_REQUEST_STATUS_LABELS[travelRequest.status] ?? travelRequest.status}
      </p>

      {travelRequest.status === "draft" && (
        <>
          <PassportUploadForm travelRequestId={travelRequest.id} />
          <QrScanPanel travelRequestId={travelRequest.id} />
        </>
      )}

      {travelRequest.status === "to_verify" && traveler && !traveler.data_validated_by_customer && (
        <>
          <TravelerDetailsForm
            travelerId={traveler.id}
            previewUrl={previewUrl}
            initialValues={travelerInitialValues}
          />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-black/60 hover:underline dark:text-white/60">
              La photo n&apos;est pas exploitable ? Remplacez-la
            </summary>
            <PassportUploadForm travelRequestId={travelRequest.id} />
            <QrScanPanel travelRequestId={travelRequest.id} />
          </details>
        </>
      )}

      {travelRequest.status === "to_verify" &&
        traveler?.data_validated_by_customer &&
        questionnaireSchema &&
        activeQuestionnaireId &&
        !questionnaireComplete && (
          <QuestionnaireForm
            travelerId={traveler.id}
            questionnaireId={activeQuestionnaireId}
            schema={questionnaireSchema}
            initialAnswers={initialAnswers}
          />
        )}

      {travelRequest.status === "to_verify" &&
        traveler?.data_validated_by_customer &&
        !questionnaireSchema && (
          <p className="mt-6 text-sm text-black/60 dark:text-white/60">
            Le questionnaire d&apos;éligibilité n&apos;est pas disponible pour le moment. Merci de
            réessayer plus tard ou de contacter le support.
          </p>
        )}

      {travelRequest.status === "to_verify" &&
        traveler?.data_validated_by_customer &&
        questionnaireComplete &&
        !mandate && (
          <MandateForm
            travelerId={traveler.id}
            suggestedSignerName={`${traveler.first_name ?? ""} ${traveler.last_name ?? ""}`.trim()}
          />
        )}

      {travelRequest.status === "payment_pending" && pricing && (
        <>
          <PaymentForm travelRequestId={travelRequest.id} pricing={pricing} />
          {paymentQueryParam === "success" && <PaymentPendingRefresher />}
        </>
      )}

      {travelRequest.status === "payment_pending" && !pricing && (
        <p className="mt-6 text-sm text-black/60 dark:text-white/60">
          Le paiement en ligne n&apos;est pas encore disponible. Merci de réessayer plus tard ou de
          contacter le support.
        </p>
      )}

      {travelRequest.status === "payment_pending" && paymentQueryParam === "cancelled" && (
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">
          Paiement annulé, vous pouvez réessayer ci-dessus.
        </p>
      )}

      {travelRequest.status !== "draft" &&
        travelRequest.status !== "to_verify" &&
        travelRequest.status !== "payment_pending" && (
          <p className="mt-6 text-sm text-black/60 dark:text-white/60">
            La suite du parcours arrive dans une prochaine étape.
          </p>
        )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
        Historique
      </h2>
      <ul className="mt-3 space-y-3">
        {(timeline ?? []).map((event) => (
          <li key={event.id} className="text-sm">
            <span className="text-black/40 dark:text-white/40">
              {new Date(event.created_at).toLocaleString("fr-FR")}
            </span>{" "}
            — {event.message ?? event.event_type}
          </li>
        ))}
      </ul>
    </div>
  );
}
