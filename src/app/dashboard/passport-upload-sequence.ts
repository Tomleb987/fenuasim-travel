import "server-only";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/database.types";

// Partagé entre l'upload direct (src/app/dashboard/actions.ts, session client
// authentifiée) et le relais QR (src/app/scan/actions.ts, aucune session —
// l'accès est prouvé par un token). Les deux appelants doivent avoir déjà
// vérifié le droit d'accès (RLS pour le desktop, hash de token pour le QR)
// avant d'appeler cette fonction : elle-même écrit exclusivement via
// service_role et ne revérifie aucun droit, cf. note dans db/schema.sql sur
// l'usage de service_role pour ce type de route serveur dédiée.

type TravelRequestStatus = Database["public"]["Enums"]["travel_request_status"];
type CaptureMethod = Database["public"]["Enums"]["capture_method"];
type TimelineEventType = Database["public"]["Enums"]["timeline_event_type"];
type ServiceClient = ReturnType<typeof createServiceClient>;

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo, cohérent avec db/storage-setup.sql

// app_settings n'a aucune policy de lecture pour un client authentifié
// (cf. db/schema.sql, section RLS) : ces valeurs sont lues côté serveur via
// service_role, jamais exposées en direct au front (docs section 9).
export async function getPassportRetentionDays(): Promise<number> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("app_settings")
    .select("value")
    .eq("key", "passport_retention_days")
    .single();

  if (error || !data) throw new Error("Impossible de lire la durée de rétention (app_settings)");
  return Number(data.value);
}

async function transitionStatus(
  service: ServiceClient,
  travelRequestId: string,
  fromStatus: TravelRequestStatus,
  toStatus: TravelRequestStatus,
  eventType: TimelineEventType,
  actorId: string,
  message: string,
) {
  const { error } = await service
    .from("travel_requests")
    .update({ status: toStatus })
    .eq("id", travelRequestId);
  if (error) throw new Error(`Transition de statut impossible (${fromStatus} → ${toStatus})`);

  await service.from("timeline").insert({
    travel_request_id: travelRequestId,
    event_type: eventType,
    from_status: fromStatus,
    to_status: toStatus,
    actor_type: "customer",
    actor_id: actorId,
    message,
  });
}

export async function runPassportUploadSequence({
  travelRequestId,
  travelerId,
  currentStatus,
  file,
  captureMethod,
  actorId,
}: {
  travelRequestId: string;
  travelerId: string;
  currentStatus: TravelRequestStatus;
  file: File;
  captureMethod: CaptureMethod;
  actorId: string;
}): Promise<void> {
  if (currentStatus !== "draft" && currentStatus !== "to_verify") {
    throw new Error("Ce dossier n'accepte pas de nouvelle photo à ce stade");
  }
  if (file.size === 0) throw new Error("Aucune photo fournie");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Photo trop volumineuse (10 Mo max)");
  const extension = MIME_TO_EXTENSION[file.type];
  if (!extension) throw new Error("Format de photo non supporté (jpeg, png, webp ou heic)");

  const service = createServiceClient();
  const storagePath = `${travelRequestId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await service.storage
    .from("passports")
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error("Envoi de la photo impossible");

  const retentionDays = await getPassportRetentionDays();
  const scheduledDeletionAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const { error: documentError } = await service.from("documents").insert({
    travel_request_id: travelRequestId,
    traveler_id: travelerId,
    document_type: "passport_photo",
    storage_bucket: "passports",
    storage_path: storagePath,
    mime_type: file.type,
    file_size_bytes: file.size,
    capture_method: captureMethod,
    scheduled_deletion_at: scheduledDeletionAt,
  });
  if (documentError) throw new Error("Enregistrement de la photo impossible");

  await service.from("timeline").insert({
    travel_request_id: travelRequestId,
    event_type: "document_uploaded",
    actor_type: "customer",
    actor_id: actorId,
    message:
      captureMethod === "qr_scan" ? "Photo du passeport envoyée (scan QR)" : "Photo du passeport envoyée",
  });

  // Pas de microservice OCR dans cette tranche : fallback manuel immédiat,
  // mais en respectant la même séquence de statuts que le vrai OCR aurait
  // produite (cf. docs/etape-0-mvp-esta.md, section 5 — pas de raccourci
  // direct scan_pending → to_verify).
  await transitionStatus(
    service,
    travelRequestId,
    currentStatus,
    "scan_pending",
    "status_change",
    actorId,
    "Photo reçue, en attente de traitement",
  );

  await service
    .from("travelers")
    .update({ ocr_status: "manual", ocr_confidence_score: null, data_validated_by_customer: false })
    .eq("id", travelerId);

  await transitionStatus(
    service,
    travelRequestId,
    "scan_pending",
    "ocr_done",
    "ocr_processed",
    actorId,
    "OCR indisponible dans cette version — saisie manuelle requise",
  );

  await transitionStatus(
    service,
    travelRequestId,
    "ocr_done",
    "to_verify",
    "status_change",
    actorId,
    "En attente de validation des informations par le client",
  );
}
