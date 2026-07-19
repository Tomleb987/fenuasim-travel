"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ERROR_MESSAGES: Record<string, string> = {
  lien_invalide: "Ce lien de connexion n'est plus valide. Merci d'en redemander un.",
  acces_refuse: "Ce compte n'a pas d'accès back-office. Contactez un administrateur.",
};

export function AdminConnexionForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/admin/dashboard";
  const errorMessage = ERROR_MESSAGES[searchParams.get("error") ?? ""];

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/admin/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Vérifiez vos emails</h1>
        <p className="mt-3 text-black/60 dark:text-white/60">
          Un lien de connexion a été envoyé à <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Back-office FenuaSIM Travel</h1>
      <p className="mt-3 text-black/60 dark:text-white/60">
        Accès réservé au staff. Saisissez votre email professionnel.
      </p>

      {errorMessage && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <input
          type="email"
          required
          autoFocus
          placeholder="vous@fenuasim.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-sm outline-none focus:border-fenua-violet dark:border-white/10"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-60"
          style={{
            background: "linear-gradient(90deg, #A020F0, #FF7F11)",
            boxShadow: "0 2px 10px rgba(160,32,240,.3)",
          }}
        >
          {status === "sending" ? "Envoi…" : "Recevoir le lien de connexion"}
        </button>
        {status === "error" && (
          <p className="text-sm text-red-700">Une erreur est survenue. Merci de réessayer.</p>
        )}
      </form>
    </div>
  );
}
