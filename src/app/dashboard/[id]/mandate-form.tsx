"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitMandate } from "../actions";
import { MANDATE_TEXT } from "@/lib/mandate/content";

export function MandateForm({
  travelerId,
  suggestedSignerName,
}: {
  travelerId: string;
  suggestedSignerName: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    try {
      await submitMandate(travelerId, new FormData(event.currentTarget));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signature impossible. Réessayez.");
      setStatus("idle");
    }
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
        Mandat électronique
      </h2>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Lisez et acceptez le mandat ci-dessous pour autoriser FenuaSIM à déposer votre demande
        ESTA, puis passez au paiement.
      </p>

      <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-black/10 p-4 text-sm whitespace-pre-line dark:border-white/10">
        {MANDATE_TEXT}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Nom complet (signature)</span>
          <input
            name="signer_full_name"
            required
            defaultValue={suggestedSignerName}
            className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-sm outline-none focus:border-fenua-violet dark:border-white/10"
          />
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" required className="mt-0.5" />
          <span>J&apos;ai lu et j&apos;accepte les termes du mandat ci-dessus.</span>
        </label>

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-60"
          style={{
            background: "linear-gradient(90deg, #A020F0, #FF7F11)",
            boxShadow: "0 2px 10px rgba(160,32,240,.3)",
          }}
        >
          {status === "saving" ? "Signature…" : "Signer et payer"}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </div>
  );
}
