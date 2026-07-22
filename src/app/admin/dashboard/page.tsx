import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStaffMember } from "@/lib/admin/require-staff";
import { TRAVEL_REQUEST_STATUS_LABELS, type TravelRequestStatus } from "@/lib/status";
import { RealtimeListRefresher } from "./realtime-list-refresher";

const STATUSES = Object.keys(TRAVEL_REQUEST_STATUS_LABELS) as TravelRequestStatus[];

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; email?: string }>;
}) {
  const staff = await getStaffMember();
  if (!staff) redirect("/admin/connexion?error=acces_refuse");

  const { status, email } = await searchParams;
  const statusFilter = status && status in TRAVEL_REQUEST_STATUS_LABELS ? (status as TravelRequestStatus) : "";
  const emailFilter = email?.trim() ?? "";

  const supabase = await createClient();
  // customers!inner : requis pour pouvoir filtrer sur customers.email dans la
  // même requête (un inner join classique, pas de traveler sans customer de
  // toute façon vu la contrainte not null sur travel_requests.customer_id).
  let query = supabase
    .from("travel_requests")
    .select("id, status, created_at, traveler_count, customers!inner(email)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (statusFilter) query = query.eq("status", statusFilter);
  if (emailFilter) query = query.ilike("customers.email", `%${emailFilter}%`);

  const { data: travelRequests } = await query;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <RealtimeListRefresher />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dossiers ESTA</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Connecté en tant que staff ({staff.role})
          </p>
        </div>
        <Link
          href="/admin/dashboard/questionnaire"
          className="text-sm text-fenua-violet hover:underline"
        >
          Questionnaire ESTA →
        </Link>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-black/60 dark:text-white/60">Statut</span>
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-transparent"
          >
            <option value="">Tous</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {TRAVEL_REQUEST_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-black/60 dark:text-white/60">Email client</span>
          <input
            type="text"
            name="email"
            defaultValue={emailFilter}
            placeholder="ex. client@exemple.com"
            className="rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-transparent"
          />
        </label>
        <button
          type="submit"
          className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium dark:border-white/10"
        >
          Filtrer
        </button>
        {(statusFilter || emailFilter) && (
          <Link href="/admin/dashboard" className="text-sm text-black/60 hover:underline dark:text-white/60">
            Réinitialiser
          </Link>
        )}
      </form>

      <div className="mt-6 overflow-x-auto">
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
                <td className="py-3 pr-4">
                  <Link href={`/admin/dashboard/${tr.id}`} className="hover:underline">
                    {tr.customers?.email ?? "—"}
                  </Link>
                </td>
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
                  Aucun dossier ne correspond aux filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
