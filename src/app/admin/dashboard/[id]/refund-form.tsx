"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { refundPayment } from "./actions";

export function RefundForm({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirm("Rembourser intégralement ce paiement ? Cette action est irréversible.")) return;

    setStatus("saving");
    setError(null);
    try {
      await refundPayment(paymentId, reason);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remboursement impossible");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        required
        placeholder="Motif du remboursement"
        rows={2}
        className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-fenua-violet dark:border-white/10 dark:bg-transparent"
      />
      <button
        type="submit"
        disabled={status === "saving"}
        className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-60 dark:border-white/10"
      >
        {status === "saving" ? "Remboursement…" : "Rembourser"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
