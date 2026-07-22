"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Le retour Stripe (?payment=success) atterrit avant que le webhook n'ait
// forcément fini de traiter l'événement — un seul rafraîchissement différé
// suffit à refléter le passage à "paid" sans mettre en place un polling
// continu pour un cas qui se résout normalement en quelques secondes.
export function PaymentPendingRefresher() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.refresh(), 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return null;
}
