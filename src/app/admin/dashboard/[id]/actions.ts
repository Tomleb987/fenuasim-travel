"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getStaffMember, requireAdminOrAbove } from "@/lib/admin/require-staff";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe/client";
import { sendTransactionalEmail } from "@/lib/email/brevo-client";
import { encryptPassportField } from "@/lib/crypto/passport-encryption";
import { bytesToPgHex } from "@/lib/postgres-bytea";
import { TRAVEL_REQUEST_STATUS_LABELS, type TravelRequestStatus } from "@/lib/status";

// Remboursement total uniquement (V1) : payments.refunded_amount_cents /
// refund_reason existent dans le schéma pour un remboursement partiel futur,
// mais le cas d'usage couvert ici (ESTA refusé) est toujours un remboursement
// intégral.
export async function refundPayment(paymentId: string, reason: string) {
  const staff = await requireAdminOrAbove();

  if (!isStripeConfigured()) {
    throw new Error("Le remboursement en ligne n'est pas encore disponible.");
  }

  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Un motif est requis pour le remboursement");

  // payments n'a aucune policy d'écriture pour authenticated (cf. db/schema.sql :
  // écriture exclusivement service_role) — le staff lit via RLS (is_staff()),
  // mais toute écriture passe ici par service_role comme pour le webhook.
  const service = createServiceClient();

  const { data: payment } = await service
    .from("payments")
    .select("id, travel_request_id, stripe_payment_intent_id, amount_cents, status")
    .eq("id", paymentId)
    .single();
  if (!payment) throw new Error("Paiement introuvable");
  if (payment.status !== "succeeded") throw new Error("Ce paiement n'est pas remboursable");
  if (!payment.stripe_payment_intent_id) throw new Error("Paiement Stripe introuvable pour ce remboursement");

  const stripe = getStripeClient();
  try {
    await stripe.refunds.create({ payment_intent: payment.stripe_payment_intent_id });
  } catch (error) {
    console.error("Stripe: remboursement en échec", error);
    throw new Error("Le remboursement a échoué côté Stripe");
  }

  const { error: paymentError } = await service
    .from("payments")
    .update({
      status: "refunded",
      refunded_amount_cents: payment.amount_cents,
      refunded_at: new Date().toISOString(),
      refund_reason: trimmedReason,
    })
    .eq("id", paymentId);
  if (paymentError) throw new Error("Mise à jour du paiement impossible");

  await service.from("travel_requests").update({ status: "refunded" }).eq("id", payment.travel_request_id);

  await service.from("timeline").insert({
    travel_request_id: payment.travel_request_id,
    event_type: "payment_event",
    to_status: "refunded",
    actor_type: "admin",
    actor_id: staff.id,
    message: `Remboursement effectué : ${trimmedReason}`,
  });

  const { data: travelRequest } = await service
    .from("travel_requests")
    .select("customers(email)")
    .eq("id", payment.travel_request_id)
    .single();
  const customerEmail = travelRequest?.customers?.email;
  if (customerEmail) {
    const { success } = await sendTransactionalEmail({
      to: customerEmail,
      subject: "Remboursement effectué — dossier ESTA FenuaSIM",
      htmlContent: `<p>Bonjour,</p><p>Votre paiement a été remboursé. Motif : ${trimmedReason}</p>`,
    });
    if (success) {
      await service.from("timeline").insert({
        travel_request_id: payment.travel_request_id,
        event_type: "email_sent",
        actor_type: "system",
        message: "Email de confirmation de remboursement envoyé",
      });
    }
  }

  revalidatePath(`/admin/dashboard/${payment.travel_request_id}`);
}

// Disponible à tout le staff (y compris operator) : ce sont eux qui suivent
// l'avancement au quotidien (dépôt, retour des autorités, etc.) — contrairement
// au remboursement, réservé admin+. Aucune restriction sur les transitions
// autorisées (choix confirmé) : le staff peut corriger une erreur même sur un
// statut lié au paiement, la véracité du paiement lui-même reste garantie par
// ailleurs (webhook Stripe signé, jamais recalculée ici).
export async function changeTravelRequestStatus(travelRequestId: string, newStatus: string, note: string) {
  const staff = await getStaffMember();
  if (!staff) redirect("/admin/connexion?error=acces_refuse");

  if (!(newStatus in TRAVEL_REQUEST_STATUS_LABELS)) throw new Error("Statut invalide");
  const status = newStatus as TravelRequestStatus;

  const service = createServiceClient();
  const { data: current } = await service
    .from("travel_requests")
    .select("status")
    .eq("id", travelRequestId)
    .single();
  if (!current) throw new Error("Dossier introuvable");
  if (current.status === status) throw new Error("Le dossier est déjà à ce statut");

  const { error: updateError } = await service
    .from("travel_requests")
    .update({ status })
    .eq("id", travelRequestId);
  if (updateError) throw new Error("Changement de statut impossible");

  const trimmedNote = note.trim();
  await service.from("timeline").insert({
    travel_request_id: travelRequestId,
    event_type: "status_change",
    from_status: current.status,
    to_status: status,
    actor_type: "admin",
    actor_id: staff.id,
    message: trimmedNote || `Statut changé manuellement : ${TRAVEL_REQUEST_STATUS_LABELS[status]}`,
  });

  revalidatePath(`/admin/dashboard/${travelRequestId}`);
}

// Note interne : jamais visible du client (cf. le filtre correspondant dans
// src/app/dashboard/[id]/page.tsx, event_type 'note' + actor_type 'admin').
export async function addInternalNote(travelRequestId: string, note: string) {
  const staff = await getStaffMember();
  if (!staff) redirect("/admin/connexion?error=acces_refuse");

  const trimmedNote = note.trim();
  if (!trimmedNote) throw new Error("La note ne peut pas être vide");

  const service = createServiceClient();
  await service.from("timeline").insert({
    travel_request_id: travelRequestId,
    event_type: "note",
    actor_type: "admin",
    actor_id: staff.id,
    message: trimmedNote,
  });

  revalidatePath(`/admin/dashboard/${travelRequestId}`);
}

// Correction opérateur des informations voyageur/passeport. Ne touche jamais
// data_validated_by_customer : ce champ atteste que LE CLIENT a validé ces
// informations, une correction opérateur est un fait distinct. Journalisé en
// 'admin_action' (et non 'note') pour rester filtré côté client comme les
// notes internes, sans se confondre avec un vrai commentaire libre.
export async function correctTravelerDetails(travelerId: string, formData: FormData) {
  const staff = await getStaffMember();
  if (!staff) redirect("/admin/connexion?error=acces_refuse");

  const service = createServiceClient();
  const { data: traveler } = await service
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

  const { error: updateError } = await service
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
    })
    .eq("id", travelerId);
  if (updateError) throw new Error("Enregistrement des informations impossible");

  await service.from("timeline").insert({
    travel_request_id: traveler.travel_request_id,
    event_type: "admin_action",
    actor_type: "admin",
    actor_id: staff.id,
    message: "Informations voyageur corrigées par le staff",
  });

  revalidatePath(`/admin/dashboard/${traveler.travel_request_id}`);
}
