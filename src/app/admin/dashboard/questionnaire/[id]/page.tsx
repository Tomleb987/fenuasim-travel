import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminOrAbove } from "@/lib/admin/require-staff";
import { createClient } from "@/lib/supabase/server";
import { parseQuestionnaireSchema } from "@/lib/questionnaire/types";
import { QuestionnaireEditor } from "./questionnaire-editor";

export default async function QuestionnaireEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminOrAbove();
  const { id } = await params;
  const supabase = await createClient();

  const { data: questionnaire } = await supabase
    .from("questionnaires")
    .select("id, version, title, schema_json, is_active")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (!questionnaire) notFound();

  // Un schéma corrompu ne doit jamais faire planter l'éditeur — c'est
  // justement l'écran qui sert à le corriger.
  let schema: ReturnType<typeof parseQuestionnaireSchema> = [];
  try {
    schema = parseQuestionnaireSchema(questionnaire.schema_json);
  } catch {
    schema = [];
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/admin/dashboard/questionnaire"
        className="text-sm text-black/60 hover:underline dark:text-white/60"
      >
        ← Versions du questionnaire
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Questionnaire ESTA — v{questionnaire.version}
      </h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        {questionnaire.is_active ? "Version active" : "Brouillon (non visible des clients)"}
      </p>

      <QuestionnaireEditor
        questionnaireId={questionnaire.id}
        initialTitle={questionnaire.title ?? ""}
        initialSchema={schema}
        isActive={questionnaire.is_active}
      />
    </div>
  );
}
