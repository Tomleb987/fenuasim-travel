import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStaffMember } from "@/lib/admin/require-staff";
import { TRAVEL_REQUEST_STATUS_LABELS } from "@/lib/status";

export default async function AdminDashboardPage() {
  const staff = await getStaffMember();
  if (!staff) redirect("/admin/connexion?error=acces_refuse");

  const supabase = await createClient();
  const { data: travelRequests } = await supabase
    .from("travel_requests")
    .select("id, status, created_at, traveler_count, customers(email)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Dossiers ESTA</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Connecté en tant que staff ({staff.role})
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-black/60 dark:border-white/10 dark:text-white/60">
              <th className="py-2 pr-4 font-medium">Client</th>
              <th className="py-2 pr-4 font-medium">Statut</th>
              <th className="py-2 pr-4 font-medium">Voyageurs</th>
              <th className="py-2 font-medium">Créé le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/10">
            {(travelRequests ?? []).map((tr) => (
              <tr key={tr.id}>
                <td className="py-3 pr-4">{tr.customers?.email ?? "—"}</td>
                <td className="py-3 pr-4">
                  {TRAVEL_REQUEST_STATUS_LABELS[tr.status] ?? tr.status}
                </td>
                <td className="py-3 pr-4">{tr.traveler_count}</td>
                <td className="py-3 text-black/60 dark:text-white/60">
                  {new Date(tr.created_at).toLocaleDateString("fr-FR")}
                </td>
              </tr>
            ))}
            {(travelRequests ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-black/60 dark:text-white/60">
                  Aucun dossier pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
