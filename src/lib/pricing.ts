// Partagé entre l'action serveur (source de vérité pour le calcul effectif du
// paiement) et payment-form.tsx (même calcul, affiché côté client sans
// aller-retour serveur quand le client change de devise) — d'où l'absence de
// "server-only" ici, contrairement à src/lib/stripe/client.ts.
export type Pricing = {
  serviceFeeCents: number; // frais de service FENUASIM, en centimes EUR (app_settings.esta_price_cents)
  officialFeeUsdCents: number; // frais officiels ESTA, en cents USD (référence fixe, app_settings.esta_official_fee_usd_cents)
  eurXpfRate: number; // parité fixe EUR -> XPF (app_settings.eur_xpf_fixed_rate)
  usdEurRate: number; // taux USD -> EUR (app_settings.usd_eur_fx_rate)
};

export type LineAmounts = {
  serviceFeeAmount: number;
  officialFeeAmount: number;
  amountTotal: number;
};

// XPF est une devise zero-decimal chez Stripe (montants en unités entières,
// pas de centimes) — cf. docs/etape-0-mvp-esta.md section 8.
export function computeLineAmounts(currency: "eur" | "xpf", pricing: Pricing): LineAmounts {
  if (currency === "eur") {
    const officialFeeAmount = Math.round(pricing.officialFeeUsdCents * pricing.usdEurRate);
    return {
      serviceFeeAmount: pricing.serviceFeeCents,
      officialFeeAmount,
      amountTotal: pricing.serviceFeeCents + officialFeeAmount,
    };
  }

  const serviceFeeAmount = Math.round((pricing.serviceFeeCents * pricing.eurXpfRate) / 100);
  const officialFeeAmount = Math.round(
    (pricing.officialFeeUsdCents * pricing.usdEurRate * pricing.eurXpfRate) / 100,
  );
  return { serviceFeeAmount, officialFeeAmount, amountTotal: serviceFeeAmount + officialFeeAmount };
}
