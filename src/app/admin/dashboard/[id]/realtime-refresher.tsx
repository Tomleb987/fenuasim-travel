"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Même pattern que src/app/dashboard/[id]/qr-scan-panel.tsx : un paiement qui
// arrive (webhook) ou un changement fait par un autre membre du staff se
// reflète sans reload manuel.
export function RealtimeRefresher({ travelRequestId }: { travelRequestId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`admin_travel_request_${travelRequestId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "travel_requests", filter: `id=eq.${travelRequestId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [travelRequestId, router]);

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
