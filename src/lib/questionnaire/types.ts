export type QuestionType = "boolean" | "text" | "select" | "date";

export interface QuestionnaireQuestion {
  key: string; // slug stable, ex. "communicable_disease" — identité stockée dans answers.question_key
  label: string;
  helpText?: string;
  type: QuestionType;
  required: boolean;
  options?: string[]; // requis (≥1) si type === "select"
}

export type QuestionnaireSchema = QuestionnaireQuestion[];

export const QUESTION_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  boolean: "Oui / Non",
  text: "Texte libre",
  select: "Choix unique",
  date: "Date",
};

function isQuestionType(value: unknown): value is QuestionType {
  return value === "boolean" || value === "text" || value === "select" || value === "date";
}

function assertValidQuestion(value: unknown, index: number): QuestionnaireQuestion {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Question #${index + 1} invalide`);
  }
  const q = value as Record<string, unknown>;

  if (typeof q.key !== "string" || !QUESTION_KEY_PATTERN.test(q.key)) {
    throw new Error(`Question #${index + 1} : clé invalide`);
  }
  if (typeof q.label !== "string" || q.label.trim().length === 0) {
    throw new Error(`Question #${index + 1} : libellé requis`);
  }
  if (!isQuestionType(q.type)) {
    throw new Error(`Question #${index + 1} : type invalide`);
  }
  if (typeof q.required !== "boolean") {
    throw new Error(`Question #${index + 1} : "required" doit être un booléen`);
  }
  if (q.helpText !== undefined && typeof q.helpText !== "string") {
    throw new Error(`Question #${index + 1} : "helpText" invalide`);
  }

  let options: string[] | undefined;
  if (q.type === "select") {
    if (!Array.isArray(q.options) || q.options.length === 0 || !q.options.every((o) => typeof o === "string")) {
      throw new Error(`Question #${index + 1} : une question à choix unique nécessite au moins une option`);
    }
    options = q.options as string[];
  }

  return {
    key: q.key,
    label: q.label,
    helpText: typeof q.helpText === "string" ? q.helpText : undefined,
    type: q.type,
    required: q.required,
    options,
  };
}

export function parseQuestionnaireSchema(json: unknown): QuestionnaireSchema {
  if (!Array.isArray(json)) {
    throw new Error("Le schéma du questionnaire doit être une liste de questions");
  }
  const questions = json.map((q, index) => assertValidQuestion(q, index));

  const keys = new Set<string>();
  for (const question of questions) {
    if (keys.has(question.key)) {
      throw new Error(`Clé de question dupliquée : "${question.key}"`);
    }
    keys.add(question.key);
  }

  return questions;
}

export function formatAnswerValue(value: unknown, type: QuestionType): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "boolean") {
    if (value === true || value === "true") return "Oui";
    if (value === false || value === "false") return "Non";
    return "—";
  }
  return String(value);
}
