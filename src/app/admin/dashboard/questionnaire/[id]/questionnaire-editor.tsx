"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  QUESTION_KEY_PATTERN,
  QUESTION_TYPE_LABELS,
  type QuestionType,
  type QuestionnaireQuestion,
} from "@/lib/questionnaire/types";
import { activateQuestionnaireVersion, saveQuestionnaireSchema } from "../actions";

const QUESTION_TYPES: QuestionType[] = ["boolean", "text", "select", "date"];

function emptyQuestion(): QuestionnaireQuestion {
  return { key: "", label: "", type: "boolean", required: true };
}

export function QuestionnaireEditor({
  questionnaireId,
  initialTitle,
  initialSchema,
  isActive,
}: {
  questionnaireId: string;
  initialTitle: string;
  initialSchema: QuestionnaireQuestion[];
  isActive: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [questions, setQuestions] = useState<QuestionnaireQuestion[]>(initialSchema);
  const [status, setStatus] = useState<"idle" | "saving" | "activating">("idle");
  const [error, setError] = useState<string | null>(null);

  function updateQuestion(index: number, patch: Partial<QuestionnaireQuestion>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function validateBeforeSave(): string | null {
    if (questions.length === 0) return "Ajoutez au moins une question";
    const keys = new Set<string>();
    for (const q of questions) {
      if (!QUESTION_KEY_PATTERN.test(q.key)) {
        return `Clé invalide : "${q.key}" (minuscules, chiffres, underscore, doit commencer par une lettre)`;
      }
      if (keys.has(q.key)) return `Clé dupliquée : "${q.key}"`;
      keys.add(q.key);
      if (!q.label.trim()) return "Chaque question doit avoir un libellé";
      if (q.type === "select" && (!q.options || q.options.filter((o) => o.trim()).length === 0)) {
        return `« ${q.label} » : une question à choix unique nécessite au moins une option`;
      }
    }
    return null;
  }

  async function handleSave() {
    const validationError = validateBeforeSave();
    if (validationError) {
      setError(validationError);
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      const cleaned = questions.map((q) => ({
        ...q,
        options: q.type === "select" ? q.options?.map((o) => o.trim()).filter(Boolean) : undefined,
      }));
      await saveQuestionnaireSchema(questionnaireId, title, cleaned);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setStatus("idle");
    }
  }

  async function handleActivate() {
    if (!confirm("Activer cette version désactivera la version actuellement active. Continuer ?")) return;
    setStatus("activating");
    setError(null);
    try {
      await activateQuestionnaireVersion(questionnaireId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation impossible");
    } finally {
      setStatus("idle");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-fenua-violet dark:border-white/10 dark:bg-transparent";

  return (
    <div className="mt-6 space-y-6">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-black/60 dark:text-white/60">Titre</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </label>

      <div className="space-y-4">
        {questions.map((question, index) => (
          <div key={index} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-medium text-black/50 dark:text-white/50">Question {index + 1}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => moveQuestion(index, -1)}
                  disabled={index === 0}
                  className="rounded px-2 py-1 text-xs disabled:opacity-30"
                  aria-label="Monter"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveQuestion(index, 1)}
                  disabled={index === questions.length - 1}
                  className="rounded px-2 py-1 text-xs disabled:opacity-30"
                  aria-label="Descendre"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeQuestion(index)}
                  className="rounded px-2 py-1 text-xs text-red-700"
                >
                  Supprimer
                </button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-black/60 dark:text-white/60">Clé (identifiant)</span>
                <input
                  value={question.key}
                  onChange={(e) => updateQuestion(index, { key: e.target.value })}
                  className={inputClass}
                  placeholder="ex. communicable_disease"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-black/60 dark:text-white/60">Type</span>
                <select
                  value={question.type}
                  onChange={(e) => updateQuestion(index, { type: e.target.value as QuestionType })}
                  className={inputClass}
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-3 block space-y-1">
              <span className="text-xs font-medium text-black/60 dark:text-white/60">Libellé (affiché au client)</span>
              <textarea
                value={question.label}
                onChange={(e) => updateQuestion(index, { label: e.target.value })}
                className={inputClass}
                rows={2}
              />
            </label>

            {question.type === "select" && (
              <label className="mt-3 block space-y-1">
                <span className="text-xs font-medium text-black/60 dark:text-white/60">
                  Options (une par ligne)
                </span>
                <textarea
                  value={(question.options ?? []).join("\n")}
                  onChange={(e) => updateQuestion(index, { options: e.target.value.split("\n") })}
                  className={inputClass}
                  rows={3}
                />
              </label>
            )}

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) => updateQuestion(index, { required: e.target.checked })}
              />
              Obligatoire
            </label>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addQuestion}
        className="rounded-lg border border-dashed border-black/20 px-4 py-2 text-sm dark:border-white/20"
      >
        + Ajouter une question
      </button>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={status !== "idle"}
          className="rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-60"
          style={{
            background: "linear-gradient(90deg, #A020F0, #FF7F11)",
            boxShadow: "0 2px 10px rgba(160,32,240,.3)",
          }}
        >
          {status === "saving" ? "Enregistrement…" : "Enregistrer"}
        </button>

        {!isActive && (
          <button
            type="button"
            onClick={handleActivate}
            disabled={status !== "idle"}
            className="rounded-full border border-black/10 px-5 py-2.5 text-sm font-bold disabled:opacity-60 dark:border-white/10"
          >
            {status === "activating" ? "Activation…" : "Activer cette version"}
          </button>
        )}
      </div>
    </div>
  );
}
