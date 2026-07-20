"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createQrScanSession } from "../actions";
import { AnalysisSteps, QR_WAITING_STEPS } from "@/components/analysis-steps";

type QrSession = {
  scanUrl: string;
  qrCodeDataUrl: string;
  expiresAt: string;
  minutesLeft: number;
};

export function QrScanPanel({ travelRequestId }: { travelRequestId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<QrSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "creating">("idle");

  // Dès qu'une session existe, on écoute les changements de ce dossier en
  // Realtime : quand le téléphone envoie la photo, le statut du dossier
  // change côté serveur et cette page se met à jour toute seule (sans
  // reload manuel). Nécessite travel_requests dans la publication Realtime
  // (cf. db/realtime-setup.sql) — respecte la RLS existante (travel_requests_select).
  useEffect(() => {
    if (!session) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`travel_request_${travelRequestId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "travel_requests",
          filter: `id=eq.${travelRequestId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, travelRequestId, router]);

  // Filet de sécurité : le WebSocket Realtime peut se couper silencieusement
  // (onglet mis en veille, réseau mobile instable) sans que le navigateur ne
  // le signale. Un polling toutes les 3s garantit une mise à jour même si
  // Realtime ne s'est pas (re)connecté.
  useEffect(() => {
    if (!session) return;

    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [session, router]);

  async function handleCreateSession() {
    setStatus("creating");
    setError(null);
    try {
      const result = await createQrScanSession(travelRequestId);
      const minutesLeft = Math.max(
        1,
        Math.round((new Date(result.expiresAt).getTime() - Date.now()) / 60000),
      );
      setSession({ ...result, minutesLeft });
    } catch {
      setError("Impossible de générer le QR code. Réessayez.");
    } finally {
      setStatus("idle");
    }
  }

  if (session) {
    return (
      <div className="mt-4 rounded-lg border border-black/10 p-4 text-center dark:border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={session.qrCodeDataUrl} alt="QR code de scan" className="mx-auto h-48 w-48" />
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">
          Scannez ce QR code avec l&apos;appareil photo de votre téléphone.
        </p>
        <p className="mt-1 break-all text-xs text-black/40 dark:text-white/40">
          Ou ouvrez ce lien : {session.scanUrl}
        </p>

        <AnalysisSteps active={true} steps={QR_WAITING_STEPS} />

        <p className="mt-2 text-xs text-black/40 dark:text-white/40">
          Expire dans {session.minutesLeft} min. Cette page se mettra à jour automatiquement une fois la
          photo envoyée et analysée.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleCreateSession}
        disabled={status === "creating"}
        className="w-full rounded-full border border-black/10 px-5 py-2.5 text-sm font-medium disabled:opacity-60 dark:border-white/10"
      >
        {status === "creating" ? "Génération…" : "Scanner avec mon téléphone"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
