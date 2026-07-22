import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptPassportField } from "@/lib/crypto/passport-encryption";
import { bytesToPgHex } from "@/lib/postgres-bytea";
import { callOcrService } from "@/lib/ocr/client";
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

// Défense en profondeur : `file.type` est déclaré par le client (en-tête
// Content-Type de la partie multipart), donc trivialement falsifiable — ce
// contrôle vérifie les premiers octets réels du fichier plutôt que de faire
// confiance à cette déclaration.
const MAGIC_BYTE_VALIDATORS: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) =>
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a,
  "image/webp": (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50, // "WEBP"
  "image/heic": (b) => {
    // Conteneur ISOBMFF : boîte "ftyp" à l'offset 4, marque HEIC/HEIF à l'offset 8.
    const isFtyp = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
    if (!isFtyp) return false;
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    return ["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand);
  },
};

async function assertFileContentMatchesDeclaredMime(file: File): Promise<void> {
  const validator = MAGIC_BYTE_VALIDATORS[file.type];
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!validator || !validator(head)) {
    throw new Error("Le contenu du fichier ne correspond pas à un format d'image supporté");
  }
}

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

export async function getOcrConfidenceThreshold(): Promise<number> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("app_settings")
    .select("value")
    .eq("key", "ocr_confidence_threshold")
    .single();

  if (error || !data) throw new Error("Impossible de lire le seuil de confiance OCR (app_settings)");
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
  await assertFileContentMatchesDeclaredMime(file);

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

  await transitionStatus(
    service,
    travelRequestId,
    currentStatus,
    "scan_pending",
    "status_change",
    actorId,
    "Photo reçue, analyse en cours…",
  );

  const ocrResult = await callOcrService(file);
  const threshold = await getOcrConfidenceThreshold();

  if (ocrResult.success && ocrResult.confidence >= threshold) {
    const { encrypted: encryptedPassportNumber, keyVersion } = encryptPassportField(
      ocrResult.fields.passport_number ?? "",
    );
    const { encrypted: encryptedMrz } = encryptPassportField(ocrResult.mrzRaw);

    await service
      .from("travelers")
      .update({
        first_name: ocrResult.fields.first_name,
        last_name: ocrResult.fields.last_name,
        sex: ocrResult.fields.sex,
        date_of_birth: ocrResult.fields.date_of_birth,
        nationality: ocrResult.fields.nationality,
        passport_number_encrypted: bytesToPgHex(encryptedPassportNumber),
        passport_number_last4: (ocrResult.fields.passport_number ?? "").slice(-4),
        passport_issuing_country: ocrResult.fields.passport_issuing_country,
        passport_expiry_date: ocrResult.fields.passport_expiry_date,
        mrz_encrypted: bytesToPgHex(encryptedMrz),
        encryption_key_version: keyVersion,
        ocr_status: "success",
        ocr_confidence_score: ocrResult.confidence,
        data_validated_by_customer: false,
      })
      .eq("id", travelerId);

    await transitionStatus(
      service,
      travelRequestId,
      "scan_pending",
      "ocr_done",
      "ocr_processed",
      actorId,
      `Lecture automatique réussie (confiance ${Math.round(ocrResult.confidence * 100)}%)`,
    );
  } else {
    // Échec du service, timeout, ou confiance sous le seuil : même
    // comportement que le fallback manuel — champs vides, tout reste à
    // saisir par le client (cf. docs/etape-0-mvp-esta.md, section 3.1 :
    // "confiance < seuil -> champs vides").
    await service
      .from("travelers")
      .update({
        ocr_status: ocrResult.success ? "low_confidence" : "failed",
        ocr_confidence_score: ocrResult.success ? ocrResult.confidence : null,
        data_validated_by_customer: false,
      })
      .eq("id", travelerId);

    await transitionStatus(
      service,
      travelRequestId,
      "scan_pending",
      "ocr_done",
      "ocr_processed",
      actorId,
      ocrResult.success
        ? `Lecture automatique peu fiable (confiance ${Math.round(ocrResult.confidence * 100)}%) — saisie manuelle requise`
        : "Lecture automatique indisponible — saisie manuelle requise",
    );
  }

  await transitionStatus(
    service,
    travelRequestId,
    "ocr_done",
    "to_verify",
    "status_change",
    actorId,
    "En attente de validation des informations par le client",
  );

  // Indispensable pour le relais QR : l'upload arrive via une requête du
  // téléphone (src/app/scan/actions.ts), sur une route Next.js différente
  // de celle affichée sur le desktop. Sans ce revalidatePath ici (dans la
  // fonction partagée), le polling/Realtime du desktop peut réclamer un
  // rafraîchissement (router.refresh()) sans jamais obtenir de données
  // fraîches tant que le cache de la route /dashboard/[id] n'a pas été
  // invalidé côté serveur.
  revalidatePath(`/dashboard/${travelRequestId}`);
}
