import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TRAVEL_REQUEST_STATUS_LABELS } from "@/lib/status";
import { getPassportPreviewUrl } from "../actions";
import { PassportUploadForm } from "./passport-upload-form";
import { TravelerDetailsForm } from "./traveler-details-form";
import { QrScanPanel } from "./qr-scan-panel";

export default async function TravelRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
    .select("id, data_validated_by_customer")
    .eq("travel_request_id", id)
    .single();

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
          <TravelerDetailsForm travelerId={traveler.id} previewUrl={previewUrl} />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-black/60 hover:underline dark:text-white/60">
              La photo n&apos;est pas exploitable ? Remplacez-la
            </summary>
            <PassportUploadForm travelRequestId={travelRequest.id} />
            <QrScanPanel travelRequestId={travelRequest.id} />
          </details>
        </>
      )}

      {travelRequest.status === "to_verify" && traveler?.data_validated_by_customer && (
        <p className="mt-6 text-sm text-black/60 dark:text-white/60">
          Informations enregistrées. La suite du parcours (questionnaire, paiement) arrive au
          Sprint 3.
        </p>
      )}

      {travelRequest.status !== "draft" && travelRequest.status !== "to_verify" && (
        <p className="mt-6 text-sm text-black/60 dark:text-white/60">
          La suite du parcours (questionnaire, paiement) arrive au Sprint 3.
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
