"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminOrAbove } from "@/lib/admin/require-staff";
import { createClient } from "@/lib/supabase/server";
import { parseQuestionnaireSchema, type QuestionnaireSchema } from "@/lib/questionnaire/types";

export async function createDraftQuestionnaireVersion() {
  await requireAdminOrAbove();
  const supabase = await createClient();

  const { data: versions } = await supabase
    .from("questionnaires")
    .select("version, schema_json, title, is_active")
    .eq("destination_code", "ESTA_US")
    .is("deleted_at", null)
    .order("version", { ascending: false });

  const nextVersion = (versions?.[0]?.version ?? 0) + 1;
  // Point de départ le plus utile pour l'admin : partir du schéma de la
  // version actuellement active plutôt que d'une liste vide.
  const activeVersion = versions?.find((v) => v.is_active);

  const { data: created, error } = await supabase
    .from("questionnaires")
    .insert({
      destination_code: "ESTA_US",
      version: nextVersion,
      title: activeVersion?.title ?? "Questionnaire d'éligibilité ESTA",
      schema_json: activeVersion?.schema_json ?? [],
      is_active: false,
    })
    .select("id")
    .single();
  if (error || !created) throw new Error("Création du brouillon impossible");

  redirect(`/admin/dashboard/questionnaire/${created.id}`);
}

export async function saveQuestionnaireSchema(questionnaireId: string, title: string, schema: QuestionnaireSchema) {
  await requireAdminOrAbove();
  const supabase = await createClient();

  // Revalide côté serveur (clés uniques, pattern, options non vides pour un
  // "select") — ne fait jamais confiance à ce que le client a assemblé.
  const validated = parseQuestionnaireSchema(schema);
  if (validated.length === 0) throw new Error("Le questionnaire doit contenir au moins une question");

  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error("Le titre est requis");

  // Round-trip JSON : QuestionnaireQuestion (interface avec champs optionnels)
  // ne satisfait pas structurellement le type Json généré par Supabase — ce
  // round-trip produit un objet plain-JSON équivalent (et élimine au passage
  // les champs "undefined", ex. `options` sur une question booléenne).
  const schemaJson = JSON.parse(JSON.stringify(validated));

  const { error } = await supabase
    .from("questionnaires")
    .update({ title: trimmedTitle, schema_json: schemaJson })
    .eq("id", questionnaireId);
  if (error) throw new Error("Enregistrement impossible");

  revalidatePath(`/admin/dashboard/questionnaire/${questionnaireId}`);
  revalidatePath("/admin/dashboard/questionnaire");
}

export async function activateQuestionnaireVersion(questionnaireId: string) {
  await requireAdminOrAbove();
  const supabase = await createClient();

  const { error } = await supabase.rpc("activate_questionnaire_version", {
    p_questionnaire_id: questionnaireId,
  });
  if (error) throw new Error("Activation impossible");

  revalidatePath("/admin/dashboard/questionnaire");
  revalidatePath(`/admin/dashboard/questionnaire/${questionnaireId}`);
}
