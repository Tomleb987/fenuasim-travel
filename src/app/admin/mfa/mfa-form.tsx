"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Phase = "checking" | "enroll" | "challenge" | "verifying" | "denied";

export function MfaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/admin/dashboard";

  const [phase, setPhase] = useState<Phase>("checking");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function init() {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") {
        router.replace(next);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: staff } = user
        ? await supabase
            .from("admin_users")
            .select("id")
            .eq("auth_user_id", user.id)
            .eq("is_active", true)
            .maybeSingle()
        : { data: null };
      if (!staff) {
        setPhase("denied");
        return;
      }

      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const verifiedTotp = factorsData?.totp?.find((f) => f.status === "verified");

      if (verifiedTotp) {
        setFactorId(verifiedTotp.id);
        setPhase("challenge");
        return;
      }

      const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });
      if (enrollError || !enrollData) {
        setError("Impossible d'initialiser la double authentification.");
        return;
      }
      setFactorId(enrollData.id);
      setQrCode(enrollData.totp.qr_code);
      setSecret(enrollData.totp.secret);
      setPhase("enroll");
    }

    init();
  }, [router, next]);

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setPhase("verifying");
    setError(null);

    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeError || !challenge) {
      setError("Erreur lors de la vérification. Réessayez.");
      setPhase(qrCode ? "enroll" : "challenge");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });

    if (verifyError) {
      setError("Code incorrect. Réessayez.");
      setPhase(qrCode ? "enroll" : "challenge");
      return;
    }

    await supabase
      .from("admin_users")
      .update({ mfa_enabled: true, last_login_at: new Date().toISOString() })
      .eq("auth_user_id", (await supabase.auth.getUser()).data.user?.id ?? "");

    router.replace(next);
  }

  if (phase === "checking") {
    return <p className="mx-auto max-w-md px-4 py-16 text-sm text-black/60">Vérification…</p>;
  }

  if (phase === "denied") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Accès refusé</h1>
        <p className="mt-3 text-black/60 dark:text-white/60">
          Ce compte n&apos;a pas d&apos;accès back-office.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Double authentification</h1>

      {qrCode && (
        <>
          <p className="mt-3 text-black/60 dark:text-white/60">
            Scannez ce QR code avec votre application d&apos;authentification (Google
            Authenticator, 1Password…).
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCode} alt="QR code TOTP" className="mx-auto mt-6 h-48 w-48" />
          {secret && (
            <p className="mt-3 break-all text-center text-xs text-black/40 dark:text-white/40">
              Ou saisissez manuellement : {secret}
            </p>
          )}
        </>
      )}

      {!qrCode && phase !== "verifying" && (
        <p className="mt-3 text-black/60 dark:text-white/60">
          Saisissez le code généré par votre application d&apos;authentification.
        </p>
      )}

      <form onSubmit={handleVerify} className="mt-6 space-y-3">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          required
          autoFocus
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-lg border border-black/10 px-4 py-2.5 text-center text-lg tracking-widest outline-none focus:border-fenua-violet dark:border-white/10"
        />
        <button
          type="submit"
          disabled={phase === "verifying"}
          className="w-full rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-60"
          style={{
            background: "linear-gradient(90deg, #A020F0, #FF7F11)",
            boxShadow: "0 2px 10px rgba(160,32,240,.3)",
          }}
        >
          {phase === "verifying" ? "Vérification…" : "Valider"}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </div>
  );
}
