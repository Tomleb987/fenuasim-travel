"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptPassportField } from "@/lib/crypto/passport-encryption";
import { bytesToPgHex } from "@/lib/postgres-bytea";
import type { Database } from "@/lib/supabase/database.types";

type TravelRequestStatus = Database["public"]["Enums"]["travel_request_status"];
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo, cohérent avec db/storage-setup.sql

// app_settings n'a aucune policy de lecture pour un client authentifié
// (cf. db/schema.sql, section RLS) : ces valeurs sont lues côté serveur via
// service_role, jamais exposées en direct au front (docs section 9).
async function getEstaPriceCents(): Promise<number> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("app_settings")
    .select("value")
    .eq("key", "esta_price_cents")
    .single();

  if (error || !data) throw new Error("Impossible de lire le prix ESTA (app_settings)");
  return Number(data.value);
}

async function getPassportRetentionDays(): Promise<number> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("app_settings")
    .select("value")
    .eq("key", "passport_retention_days")
    .single();

  if (error || !data) throw new Error("Impossible de lire la durée de rétention (app_settings)");
  return Number(data.value);
}

type TimelineEventType = Database["public"]["Enums"]["timeline_event_type"];

async function transitionStatus(
  supabase: SupabaseServerClient,
  travelRequestId: string,
  fromStatus: TravelRequestStatus,
  toStatus: TravelRequestStatus,
  eventType: TimelineEventType,
  actorId: string,
  message: string,
) {
  const { error } = await supabase
    .from("travel_requests")
    .update({ status: toStatus })
    .eq("id", travelRequestId);
  if (error) throw new Error(`Transition de statut impossible (${fromStatus} → ${toStatus})`);

  await supabase.from("timeline").insert({
    travel_request_id: travelRequestId,
    event_type: eventType,
    from_status: fromStatus,
    to_status: toStatus,
    actor_type: "customer",
    actor_id: actorId,
    message,
  });
}

export async function createTravelRequest() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  // Un utilisateur authentifié (ex. session admin/back-office) mais sans
  // ligne `customers` liée n'est pas un client : redirection plutôt qu'un
  // 500 brut, cohérent avec le `!user` ci-dessus.
  if (customerError || !customer) redirect("/connexion");

  const priceAmountCents = await getEstaPriceCents();

  const { data: travelRequest, error: insertError } = await supabase
    .from("travel_requests")
    .insert({
      customer_id: customer.id,
      destination_code: "ESTA_US",
      price_amount_cents: priceAmountCents,
      source_platform: "desktop",
    })
    .select("id")
    .single();
  if (insertError || !travelRequest) throw new Error("Création du dossier impossible");

  // traveler_count vaut 1 par défaut : pas encore d'UI de sélection du nombre
  // de voyageurs, ce parcours ne gère qu'un seul voyageur pour le moment.
  const { error: travelerError } = await supabase.from("travelers").insert({
    travel_request_id: travelRequest.id,
  });
  if (travelerError) throw new Error("Création du voyageur impossible");

  await supabase.from("timeline").insert({
    travel_request_id: travelRequest.id,
    event_type: "status_change",
    to_status: "draft",
    actor_type: "customer",
    actor_id: customer.id,
    message: "Dossier créé",
  });

  redirect(`/dashboard/${travelRequest.id}`);
}

export async function uploadPassportPhoto(travelRequestId: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!customer) redirect("/connexion");

  // Le select ci-dessous respecte la RLS (travel_requests_select) : si ce
  // dossier n'appartient pas au client courant, aucune ligne n'est retournée.
  const { data: travelRequest } = await supabase
    .from("travel_requests")
    .select("id, status")
    .eq("id", travelRequestId)
    .single();
  if (!travelRequest) throw new Error("Dossier introuvable");
  if (travelRequest.status !== "draft" && travelRequest.status !== "to_verify") {
    throw new Error("Ce dossier n'accepte pas de nouvelle photo à ce stade");
  }

  const { data: traveler } = await supabase
    .from("travelers")
    .select("id")
    .eq("travel_request_id", travelRequestId)
    .single();
  if (!traveler) throw new Error("Voyageur introuvable");

  const file = formData.get("passport_photo");
  if (!(file instanceof File) || file.size === 0) throw new Error("Aucune photo fournie");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Photo trop volumineuse (10 Mo max)");
  const extension = MIME_TO_EXTENSION[file.type];
  if (!extension) throw new Error("Format de photo non supporté (jpeg, png, webp ou heic)");

  const storagePath = `${travelRequestId}/${randomUUID()}.${extension}`;
  const service = createServiceClient();
  const { error: uploadError } = await service.storage
    .from("passports")
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error("Envoi de la photo impossible");

  const retentionDays = await getPassportRetentionDays();
  const scheduledDeletionAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const { error: documentError } = await supabase.from("documents").insert({
    travel_request_id: travelRequestId,
    traveler_id: traveler.id,
    document_type: "passport_photo",
    storage_bucket: "passports",
    storage_path: storagePath,
    mime_type: file.type,
    file_size_bytes: file.size,
    capture_method: "desktop_upload",
    scheduled_deletion_at: scheduledDeletionAt,
  });
  if (documentError) throw new Error("Enregistrement de la photo impossible");

  await supabase.from("timeline").insert({
    travel_request_id: travelRequestId,
    event_type: "document_uploaded",
    actor_type: "customer",
    actor_id: customer.id,
    message: "Photo du passeport envoyée",
  });

  // Pas de microservice OCR dans cette tranche : fallback manuel immédiat,
  // mais en respectant la même séquence de statuts que le vrai OCR aurait
  // produite (cf. docs/etape-0-mvp-esta.md, section 5 — pas de raccourci
  // direct scan_pending → to_verify).
  await transitionStatus(
    supabase,
    travelRequestId,
    travelRequest.status,
    "scan_pending",
    "status_change",
    customer.id,
    "Photo reçue, en attente de traitement",
  );

  await supabase
    .from("travelers")
    .update({ ocr_status: "manual", ocr_confidence_score: null, data_validated_by_customer: false })
    .eq("id", traveler.id);

  await transitionStatus(
    supabase,
    travelRequestId,
    "scan_pending",
    "ocr_done",
    "ocr_processed",
    customer.id,
    "OCR indisponible dans cette version — saisie manuelle requise",
  );

  await transitionStatus(
    supabase,
    travelRequestId,
    "ocr_done",
    "to_verify",
    "status_change",
    customer.id,
    "En attente de validation des informations par le client",
  );

  revalidatePath(`/dashboard/${travelRequestId}`);
}

export async function submitTravelerDetails(travelerId: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!customer) redirect("/connexion");

  // travelers_select (owns_travel_request) garantit que cette ligne n'est
  // retournée que si le voyageur appartient à un dossier du client courant.
  const { data: traveler } = await supabase
    .from("travelers")
    .select("id, travel_request_id")
    .eq("id", travelerId)
    .single();
  if (!traveler) throw new Error("Voyageur introuvable");

  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const sex = String(formData.get("sex") ?? "");
  const dateOfBirth = String(formData.get("date_of_birth") ?? "");
  const nationality = String(formData.get("nationality") ?? "").trim();
  const passportNumber = String(formData.get("passport_number") ?? "").trim();
  const passportIssuingCountry = String(formData.get("passport_issuing_country") ?? "").trim();
  const passportExpiryDate = String(formData.get("passport_expiry_date") ?? "");

  if (
    !firstName ||
    !lastName ||
    !["M", "F", "X"].includes(sex) ||
    !dateOfBirth ||
    !nationality ||
    !passportNumber ||
    !passportIssuingCountry ||
    !passportExpiryDate
  ) {
    throw new Error("Tous les champs sont requis");
  }

  const { encrypted, keyVersion } = encryptPassportField(passportNumber);

  const { error: updateError } = await supabase
    .from("travelers")
    .update({
      first_name: firstName,
      last_name: lastName,
      sex,
      date_of_birth: dateOfBirth,
      nationality,
      passport_number_encrypted: bytesToPgHex(encrypted),
      passport_number_last4: passportNumber.slice(-4),
      passport_issuing_country: passportIssuingCountry,
      passport_expiry_date: passportExpiryDate,
      encryption_key_version: keyVersion,
      data_validated_by_customer: true,
      data_validated_at: new Date().toISOString(),
    })
    .eq("id", travelerId);
  if (updateError) throw new Error("Enregistrement des informations impossible");

  await supabase.from("timeline").insert({
    travel_request_id: traveler.travel_request_id,
    event_type: "note",
    actor_type: "customer",
    actor_id: customer.id,
    message: "Informations passeport validées par le client",
  });

  revalidatePath(`/dashboard/${traveler.travel_request_id}`);
}

export async function getPassportPreviewUrl(documentId: string): Promise<string | null> {
  const supabase = await createClient();

  // documents_select (owns_travel_request) garantit que ce document
  // n'est retourné que s'il appartient à un dossier du client courant.
  const { data: document } = await supabase
    .from("documents")
    .select("storage_bucket, storage_path")
    .eq("id", documentId)
    .single();
  if (!document) return null;

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 300);
  if (error || !data) return null;

  return data.signedUrl;
}
