"use client";

import { useState, type FormEvent } from "react";
import { createCheckoutSession } from "../actions";
import { computeLineAmounts, type Pricing } from "@/lib/pricing";

function formatAmount(amount: number, currency: "eur" | "xpf") {
  return currency === "eur" ? `${(amount / 100).toFixed(2)} €` : `${amount.toLocaleString("fr-FR")} XPF`;
}

export function PaymentForm({ travelRequestId, pricing }: { travelRequestId: string; pricing: Pricing }) {
  const [currency, setCurrency] = useState<"eur" | "xpf">("eur");
  const [status, setStatus] = useState<"idle" | "redirecting">("idle");
  const [error, setError] = useState<string | null>(null);

  const amounts = computeLineAmounts(currency, pricing);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("redirecting");
    setError(null);

    try {
      await createCheckoutSession(travelRequestId, currency);
      // createCheckoutSession redirige côté serveur en cas de succès ; on
      // n'atteint ce point que si une erreur a été levée avant la redirection.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paiement impossible. Réessayez.");
      setStatus("idle");
    }
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">Paiement</h2>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="currency"
              value="eur"
              checked={currency === "eur"}
              onChange={() => setCurrency("eur")}
            />
            Euros (EUR)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="currency"
              value="xpf"
              checked={currency === "xpf"}
              onChange={() => setCurrency("xpf")}
            />
            Francs pacifique (XPF)
          </label>
        </div>

        <dl className="space-y-1 rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
          <div className="flex justify-between">
            <dt className="text-black/60 dark:text-white/60">Frais de service FenuaSIM</dt>
            <dd>{formatAmount(amounts.serviceFeeAmount, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-black/60 dark:text-white/60">Frais officiels du gouvernement américain (40 USD)</dt>
            <dd>{formatAmount(amounts.officialFeeAmount, currency)}</dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-black/10 pt-2 font-semibold dark:border-white/10">
            <dt>Total</dt>
            <dd>{formatAmount(amounts.amountTotal, currency)}</dd>
          </div>
        </dl>

        <button
          type="submit"
          disabled={status === "redirecting"}
          className="w-full rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-60"
          style={{
            background: "linear-gradient(90deg, #A020F0, #FF7F11)",
            boxShadow: "0 2px 10px rgba(160,32,240,.3)",
          }}
        >
          {status === "redirecting" ? "Redirection…" : "Payer"}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </div>
  );
}
