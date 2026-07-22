import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getStaffMember } from "@/lib/admin/require-staff";
import { createClient } from "@/lib/supabase/server";
import { TRAVEL_REQUEST_STATUS_LABELS } from "@/lib/status";
import { formatAnswerValue, parseQuestionnaireSchema } from "@/lib/questionnaire/types";

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
    .select("id, first_name, last_name")
    .eq("travel_request_id", id)
    .maybeSingle();

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
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
    </div>
  );
}
