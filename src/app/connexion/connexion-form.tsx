"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ConnexionForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const linkError = searchParams.get("error") === "lien_invalide";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Vérifiez vos emails</h1>
        <p className="mt-3 text-black/60 dark:text-white/60">
          Un lien de connexion a été envoyé à <strong>{email}</strong>. Cliquez dessus pour
          accéder à votre dossier.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
      <p className="mt-3 text-black/60 dark:text-white/60">
        Saisissez votre email : nous vous envoyons un lien de connexion, sans mot de passe.
      </p>

      {linkError && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          Ce lien de connexion n&apos;est plus valide. Merci d&apos;en redemander un.
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-3">
        <input
          type="email"
          required
          autoFocus
          placeholder="vous@exemple.com"
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
          <p className="text-sm text-red-700">
            Une erreur est survenue. Merci de réessayer.
          </p>
        )}
      </form>
    </div>
  );
}
