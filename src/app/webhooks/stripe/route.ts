import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/service";
import { sendTransactionalEmail } from "@/lib/email/brevo-client";

// Premier webhook signé de ce dépôt : la vérification de signature exige le
// corps brut de la requête (avant tout parsing JSON), d'où request.text()
// plutôt qu'un accès à un body déjà interprété.
export async function POST(request: Request) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe non configuré" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature manquante" }, { status: 400 });

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("Stripe webhook: signature invalide", error);
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }

  const service = createServiceClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session.metadata?.payment_id;
    if (!paymentId) {
      console.error("Stripe webhook: checkout.session.completed sans payment_id en metadata");
      return NextResponse.json({ received: true });
    }

    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

    // Idempotent par construction : seule une ligne encore "pending" est
    // affectée. Une redélivraison du même webhook (Stripe ne garantit qu'une
    // livraison au moins une fois) touche 0 ligne au 2e passage -> no-op.
    const { data: updatedPayments, error: updateError } = await service
      .from("payments")
      .update({
        status: "succeeded",
        stripe_payment_intent_id: paymentIntentId ?? null,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
      })
      .eq("id", paymentId)
      .eq("status", "pending")
      .select("id, travel_request_id, amount_cents, currency");

    if (updateError) {
      console.error("Stripe webhook: mise à jour payments en échec", updateError);
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }

    const payment = updatedPayments?.[0];
    if (!payment) return NextResponse.json({ received: true }); // déjà traité

    const { error: statusError } = await service
      .from("travel_requests")
      .update({ status: "paid" })
      .eq("id", payment.travel_request_id)
      .eq("status", "payment_pending");
    if (statusError) console.error("Stripe webhook: mise à jour travel_requests en échec", statusError);

    await service.from("timeline").insert({
      travel_request_id: payment.travel_request_id,
      event_type: "payment_event",
      from_status: "payment_pending",
      to_status: "paid",
      actor_type: "system",
      message: `Paiement confirmé (${(payment.amount_cents / 100).toFixed(2)} ${payment.currency.toUpperCase()})`,
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
        subject: "Paiement confirmé — dossier ESTA FenuaSIM",
        htmlContent: `<p>Bonjour,</p><p>Nous avons bien reçu votre paiement. Votre dossier ESTA va être déposé auprès des autorités américaines.</p>`,
      });
      if (success) {
        await service.from("timeline").insert({
          travel_request_id: payment.travel_request_id,
          event_type: "email_sent",
          actor_type: "system",
          message: "Email de confirmation de paiement envoyé",
        });
      }
    }

    return NextResponse.json({ received: true });
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentId = session.metadata?.payment_id;
    if (paymentId) {
      // Le dossier reste en payment_pending : le client peut simplement
      // réessayer, aucune transition de statut nécessaire ici.
      await service.from("payments").update({ status: "cancelled" }).eq("id", paymentId).eq("status", "pending");
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
