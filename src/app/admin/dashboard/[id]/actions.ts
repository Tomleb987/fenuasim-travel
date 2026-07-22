"use server";

import { revalidatePath } from "next/cache";
import { requireAdminOrAbove } from "@/lib/admin/require-staff";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe/client";
import { sendTransactionalEmail } from "@/lib/email/brevo-client";

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
