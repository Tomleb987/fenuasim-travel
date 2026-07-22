import "server-only";
import Stripe from "stripe";

// Contrairement à src/lib/ocr/client.ts et src/lib/email/brevo-client.ts (qui
// dégradent silencieusement), une clé Stripe absente lève : un paiement
// silencieusement indisponible sans que l'appelant le sache serait pire
// qu'une erreur explicite — la justesse du paiement prime ici sur la
// résilience. isStripeConfigured() permet aux écrans de vérifier la
// disponibilité *avant* d'afficher un bouton qui échouerait.
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY manquante");

  if (!cachedClient) {
    cachedClient = new Stripe(secretKey);
  }
  return cachedClient;
}
