import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getStaffMember } from "@/lib/admin/require-staff";
import { createClient } from "@/lib/supabase/server";
import { TRAVEL_REQUEST_STATUS_LABELS } from "@/lib/status";
import { formatAnswerValue, parseQuestionnaireSchema } from "@/lib/questionnaire/types";
import { decryptPassportField } from "@/lib/crypto/passport-encryption";
import { pgHexToBytes } from "@/lib/postgres-bytea";
import { getPassportPreviewUrl } from "@/app/dashboard/actions";
import { RefundForm } from "./refund-form";
import { TravelerCorrectionForm } from "./traveler-correction-form";
import { StatusNoteForm } from "./status-note-form";
import { RealtimeRefresher } from "./realtime-refresher";

export default async function AdminTravelRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffMember();
  if (!staff) redirect("/admin/connexion?error=acces_refuse");

  const { id } = await params;
  const supabase = await createClient();

  const { data: travelRequest } = await supabase
    .from("travel_requests")
    .select("id, status, created_at, customers(email)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (!travelRequest) notFound();

  const { data: traveler } = await supabase
    .from("travelers")
    .select(
      "id, first_name, last_name, sex, date_of_birth, nationality, passport_number_encrypted, passport_issuing_country, passport_expiry_date, encryption_key_version",
    )
    .eq("travel_request_id", id)
    .maybeSingle();

  // Contrairement au gate côté client (ocr_status === 'success'), l'admin doit
  // pouvoir voir/corriger les informations dès qu'elles existent, qu'elles
  // viennent de l'OCR ou d'une saisie manuelle.
  const travelerCorrectionValues = traveler?.passport_number_encrypted
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
    : null;

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
    .select("id, event_type, actor_type, message, created_at")
    .eq("travel_request_id", id)
    .order("created_at", { ascending: false });

  const { data: answers } = traveler
    ? await supabase
        .from("answers")
        .select("id, question_key, question_label_snapshot, answer_value, questionnaire_id, questionnaires(schema_json)")
        .eq("traveler_id", traveler.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
    : { data: null };

  const { data: mandate } = traveler
    ? await supabase
        .from("mandates")
        .select("signer_full_name, version, accepted_at, ip_address")
        .eq("travel_request_id", id)
        .is("deleted_at", null)
        .maybeSingle()
    : { data: null };

  const { data: payment } = await supabase
    .from("payments")
    .select("id, status, amount_cents, currency, refunded_at, refund_reason")
    .eq("travel_request_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <RealtimeRefresher travelRequestId={travelRequest.id} />

      <Link href="/admin/dashboard" className="text-sm text-black/60 hover:underline dark:text-white/60">
        ← Dossiers
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        {travelRequest.customers?.email ?? "—"}
      </h1>
      <p className="mt-1 text-sm font-medium text-fenua-violet">
        {TRAVEL_REQUEST_STATUS_LABELS[travelRequest.status] ?? travelRequest.status}
      </p>
      {traveler?.first_name && (
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Voyageur : {traveler.first_name} {traveler.last_name}
        </p>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
        Statut &amp; notes
      </h2>
      <StatusNoteForm travelRequestId={travelRequest.id} currentStatus={travelRequest.status} />

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
        Passeport
      </h2>
      {previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Photo du passeport envoyée"
          className="mt-3 max-h-64 rounded-lg border border-black/10 dark:border-white/10"
        />
      )}
      {traveler && travelerCorrectionValues ? (
        <TravelerCorrectionForm travelerId={traveler.id} initialValues={travelerCorrectionValues} />
      ) : (
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">
          Aucune information passeport enregistrée pour le moment.
        </p>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
        Réponses au questionnaire
      </h2>

      {(!answers || answers.length === 0) && (
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">
          Aucune réponse enregistrée pour le moment.
        </p>
      )}

      {answers && answers.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-black/60 dark:border-white/10 dark:text-white/60">
                <th className="py-2 pr-4 font-medium">Question</th>
                <th className="py-2 font-medium">Réponse</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {answers.map((answer) => {
                // Retrouve le type de la question dans le schéma figé au moment
                // de la réponse pour formater correctement (Oui/Non, etc.) —
                // le questionnaire a pu évoluer depuis.
                let questionType: "boolean" | "text" | "select" | "date" = "text";
                try {
                  const schema = parseQuestionnaireSchema(answer.questionnaires?.schema_json);
                  questionType = schema.find((q) => q.key === answer.question_key)?.type ?? "text";
                } catch {
                  // schéma illisible : on retombe sur un affichage texte brut
                }
                return (
                  <tr key={answer.id}>
                    <td className="py-3 pr-4">{answer.question_label_snapshot ?? answer.question_key}</td>
                    <td className="py-3">{formatAnswerValue(answer.answer_value, questionType)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
        Mandat électronique
      </h2>
      {mandate ? (
        <dl className="mt-3 space-y-1 text-sm">
          <div>
            <dt className="inline text-black/60 dark:text-white/60">Signataire : </dt>
            <dd className="inline">{mandate.signer_full_name}</dd>
          </div>
          <div>
            <dt className="inline text-black/60 dark:text-white/60">Signé le : </dt>
            <dd className="inline">{new Date(mandate.accepted_at).toLocaleString("fr-FR")}</dd>
          </div>
          <div>
            <dt className="inline text-black/60 dark:text-white/60">Version : </dt>
            <dd className="inline">{mandate.version}</dd>
          </div>
          {mandate.ip_address != null && (
            <div>
              <dt className="inline text-black/60 dark:text-white/60">Adresse IP : </dt>
              <dd className="inline">{String(mandate.ip_address)}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">Pas encore signé.</p>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
        Paiement
      </h2>
      {payment ? (
        <>
          <p className="mt-3 text-sm">
            {(payment.amount_cents / 100).toFixed(2)} {payment.currency.toUpperCase()} —{" "}
            <span className="font-medium">{payment.status}</span>
          </p>
          {payment.status === "refunded" && (
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">
              Remboursé le {payment.refunded_at ? new Date(payment.refunded_at).toLocaleString("fr-FR") : "—"}
              {payment.refund_reason ? ` — ${payment.refund_reason}` : ""}
            </p>
          )}
          {payment.status === "succeeded" && staff.role !== "operator" && <RefundForm paymentId={payment.id} />}
        </>
      ) : (
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">Pas encore de paiement.</p>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
        Historique complet
      </h2>
      <ul className="mt-3 space-y-3">
        {(timeline ?? []).map((event) => (
          <li key={event.id} className="text-sm">
            <span className="text-black/40 dark:text-white/40">
              {new Date(event.created_at).toLocaleString("fr-FR")}
            </span>{" "}
            {event.actor_type === "admin" && (event.event_type === "note" || event.event_type === "admin_action") && (
              <span className="text-xs font-medium text-fenua-violet">[interne] </span>
            )}
            — {event.message ?? event.event_type}
          </li>
        ))}
        {(timeline ?? []).length === 0 && (
          <li className="text-sm text-black/60 dark:text-white/60">Aucun événement pour le moment.</li>
        )}
      </ul>
    </div>
  );
}
