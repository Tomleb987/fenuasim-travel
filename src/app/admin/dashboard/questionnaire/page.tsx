import Link from "next/link";
import { requireAdminOrAbove } from "@/lib/admin/require-staff";
import { createClient } from "@/lib/supabase/server";
import { createDraftQuestionnaireVersion } from "./actions";

export default async function QuestionnaireVersionsPage() {
  await requireAdminOrAbove();
  const supabase = await createClient();

  const { data: versions } = await supabase
    .from("questionnaires")
    .select("id, version, title, is_active, updated_at")
    .eq("destination_code", "ESTA_US")
    .is("deleted_at", null)
    .order("version", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/admin/dashboard" className="text-sm text-black/60 hover:underline dark:text-white/60">
        ← Dossiers
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Questionnaire ESTA</h1>
        <form action={createDraftQuestionnaireVersion}>
          <button
            type="submit"
            className="rounded-full px-4 py-2 text-sm font-bold text-white shadow-md"
            style={{
              background: "linear-gradient(90deg, #A020F0, #FF7F11)",
              boxShadow: "0 2px 10px rgba(160,32,240,.3)",
            }}
          >
            Nouvelle version (brouillon)
          </button>
        </form>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-black/60 dark:border-white/10 dark:text-white/60">
              <th className="py-2 pr-4 font-medium">Version</th>
              <th className="py-2 pr-4 font-medium">Titre</th>
              <th className="py-2 pr-4 font-medium">Statut</th>
              <th className="py-2 font-medium">Mise à jour</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {(versions ?? []).map((v) => (
              <tr key={v.id}>
                <td className="py-3 pr-4">
                  <Link href={`/admin/dashboard/questionnaire/${v.id}`} className="hover:underline">
                    v{v.version}
                  </Link>
                </td>
                <td className="py-3 pr-4">{v.title ?? "—"}</td>
                <td className="py-3 pr-4">
                  {v.is_active ? (
                    <span className="text-green-700 dark:text-green-400">Active</span>
                  ) : (
                    <span className="text-black/50 dark:text-white/50">Brouillon</span>
                  )}
                </td>
                <td className="py-3 text-black/60 dark:text-white/60">
                  {new Date(v.updated_at).toLocaleString("fr-FR")}
                </td>
              </tr>
            ))}
            {(versions ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-black/60 dark:text-white/60">
                  Aucune version pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
