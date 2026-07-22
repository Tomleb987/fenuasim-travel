"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Même pattern que src/app/dashboard/[id]/qr-scan-panel.tsx, sans filtre par id
// cette fois : la liste back-office doit refléter n'importe quel dossier créé
// ou changé, pas un seul. Nécessite travel_requests dans la publication
// Realtime (cf. db/realtime-setup.sql) — RLS is_staff() laisse passer tout le
// staff sur toute la table.
export function RealtimeListRefresher() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin_travel_requests_list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "travel_requests" }, () => router.refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "travel_requests" }, () => router.refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // Filet de sécurité si le WebSocket se coupe silencieusement. Intervalle
  // plus large que qr-scan-panel.tsx (3s) : cette page reste ouverte en
  // continu chez le staff, contrairement à l'attente ponctuelle d'un scan.
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
