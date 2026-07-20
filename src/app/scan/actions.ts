"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { hashScanToken } from "@/lib/crypto/qr-token";
import { runPassportUploadSequence } from "@/app/dashboard/passport-upload-sequence";

// Aucune session Supabase Auth ici : le token (haute entropie, jamais
// persisté — seul son hash est en base) fait office de preuve d'accès.
// qr_scan_sessions n'a aucune policy RLS (cf. db/schema.sql), donc tout
// passe par service_role après vérification manuelle du hash.

async function loadValidSession(token: string) {
  const service = createServiceClient();
  const tokenHash = hashScanToken(token);

  const { data: session } = await service
    .from("qr_scan_sessions")
    .select("id, travel_request_id, status, expires_at")
    .eq("token_hash", tokenHash)
    .single();

  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;
  // 'pending' : jamais ouvert ; 'scanned' : déjà ouvert mais pas encore
  // complété (relecture de page autorisée). 'completed' = usage unique déjà
  // consommé, tout le reste est rejeté.
  if (session.status !== "pending" && session.status !== "scanned") return null;

  return session;
}

export async function validateAndMarkScanned(
  token: string,
): Promise<{ travelRequestId: string } | null> {
  const service = createServiceClient();
  const session = await loadValidSession(token);
  if (!session) return null;

  if (session.status === "pending") {
    await service.from("qr_scan_sessions").update({ status: "scanned" }).eq("id", session.id);
  }

  return { travelRequestId: session.travel_request_id };
}

export async function uploadPassportPhotoViaQrSession(token: string, formData: FormData) {
  const service = createServiceClient();
  const session = await loadValidSession(token);
  if (!session) throw new Error("Ce lien de scan n'est plus valide.");

  const { data: traveler } = await service
    .from("travelers")
    .select("id")
    .eq("travel_request_id", session.travel_request_id)
    .single();
  if (!traveler) throw new Error("Voyageur introuvable");

  const { data: travelRequest } = await service
    .from("travel_requests")
    .select("id, status, customer_id")
    .eq("id", session.travel_request_id)
    .single();
  if (!travelRequest) throw new Error("Dossier introuvable");

  const file = formData.get("passport_photo");
  if (!(file instanceof File)) throw new Error("Aucune photo fournie");

  await runPassportUploadSequence({
    travelRequestId: session.travel_request_id,
    travelerId: traveler.id,
    currentStatus: travelRequest.status,
    file,
    captureMethod: "qr_scan",
    actorId: travelRequest.customer_id,
  });

  await service
    .from("qr_scan_sessions")
    .update({ status: "completed", consumed_at: new Date().toISOString() })
    .eq("id", session.id);
}
