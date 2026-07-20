"use client";

import { useEffect, useState } from "react";

// Purement cosmétique : la vraie requête (upload + OCR) est un seul appel
// serveur qui ne renvoie aucune progression intermédiaire. Cette séquence
// minutée donne un retour vivant pendant l'attente (jusqu'à ~12s en cas
// d'OCR lent) plutôt qu'un bouton/écran figé. Les délais sont des
// estimations raisonnables, pas une mesure réelle du serveur.
const DEFAULT_STEPS = [
  { label: "Envoi de la photo", delayMs: 0 },
  { label: "Analyse de l'image", delayMs: 1200 },
  { label: "Lecture des informations du passeport", delayMs: 3200 },
  { label: "Vérification des données", delayMs: 6500 },
];

export const QR_WAITING_STEPS = [
  { label: "En attente du scan sur le téléphone", delayMs: 0 },
  { label: "Envoi de la photo", delayMs: 4000 },
  { label: "Analyse de l'image", delayMs: 8000 },
  { label: "Lecture des informations du passeport", delayMs: 12000 },
];

export function AnalysisSteps({
  active,
  steps = DEFAULT_STEPS,
}: {
  active: boolean;
  steps?: { label: string; delayMs: number }[];
}) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!active) return;

    const timers = steps.slice(1).map((step, i) => setTimeout(() => setStepIndex(i + 1), step.delayMs));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  return (
    <ul className="mt-4 space-y-2.5">
      {steps.map((step, i) => {
        const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "pending";
        return (
          <li key={step.label} className="flex items-center gap-2.5 text-sm">
            {state === "done" && (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fenua-violet text-[11px] font-bold text-white">
                ✓
              </span>
            )}
            {state === "active" && (
              <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-fenua-violet border-t-transparent" />
            )}
            {state === "pending" && (
              <span className="h-5 w-5 shrink-0 rounded-full border-2 border-black/10 dark:border-white/10" />
            )}
            <span
              className={
                state === "pending"
                  ? "text-black/40 dark:text-white/40"
                  : "text-black/80 dark:text-white/80"
              }
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
