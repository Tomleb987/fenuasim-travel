"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitQuestionnaireAnswers } from "../actions";
import type { QuestionnaireSchema } from "@/lib/questionnaire/types";

export function QuestionnaireForm({
  travelerId,
  questionnaireId,
  schema,
  initialAnswers,
}: {
  travelerId: string;
  questionnaireId: string;
  schema: QuestionnaireSchema;
  initialAnswers: Record<string, unknown>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    try {
      await submitQuestionnaireAnswers(travelerId, questionnaireId, new FormData(event.currentTarget));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible. Réessayez.");
      setStatus("idle");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-black/10 px-4 py-2.5 text-sm outline-none focus:border-fenua-violet dark:border-white/10";
  const labelClass = "text-sm font-medium";

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-black/60 dark:text-white/60">
        Questionnaire d&apos;éligibilité ESTA
      </h2>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Répondez honnêtement à chaque question. Une réponse positive n&apos;entraîne pas
        automatiquement un refus mais peut nécessiter une procédure différente.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {schema.map((question) => {
          const initial = initialAnswers[question.key];
          return (
            <div key={question.key} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
              <label className={labelClass}>
                {question.label}
                {question.required && <span className="text-fenua-violet"> *</span>}
              </label>
              {question.helpText && (
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">{question.helpText}</p>
              )}

              <div className="mt-3">
                {question.type === "boolean" && (
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={question.key}
                        value="true"
                        required={question.required}
                        defaultChecked={initial === true}
                      />
                      Oui
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={question.key}
                        value="false"
                        required={question.required}
                        defaultChecked={initial === false}
                      />
                      Non
                    </label>
                  </div>
                )}

                {question.type === "text" && (
                  <input
                    name={question.key}
                    required={question.required}
                    defaultValue={typeof initial === "string" ? initial : ""}
                    className={inputClass}
                  />
                )}

                {question.type === "select" && (
                  <select
                    name={question.key}
                    required={question.required}
                    defaultValue={typeof initial === "string" ? initial : ""}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Sélectionner
                    </option>
                    {question.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}

                {question.type === "date" && (
                  <input
                    type="date"
                    name={question.key}
                    required={question.required}
                    defaultValue={typeof initial === "string" ? initial : ""}
                    className={inputClass}
                  />
                )}
              </div>
            </div>
          );
        })}

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-60"
          style={{
            background: "linear-gradient(90deg, #A020F0, #FF7F11)",
            boxShadow: "0 2px 10px rgba(160,32,240,.3)",
          }}
        >
          {status === "saving" ? "Enregistrement…" : "Valider mes réponses"}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
    </div>
  );
}
