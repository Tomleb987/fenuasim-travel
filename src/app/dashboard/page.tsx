import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TRAVEL_REQUEST_STATUS_LABELS } from "@/lib/status";
import { createTravelRequest } from "./actions";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: customer } = await supabase
    .from("customers")
    .select("id, email")
    .eq("auth_user_id", user.id)
    .single();

  const { data: travelRequests } = customer
    ? await supabase
        .from("travel_requests")
        .select("id, status, created_at")
        .eq("customer_id", customer.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mes dossiers ESTA</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">{customer?.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm text-black/60 hover:underline dark:text-white/60">
            Se déconnecter
          </button>
        </form>
      </div>

      <form action={createTravelRequest} className="mt-8">
        <button
          type="submit"
          className="rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-md"
          style={{
            background: "linear-gradient(90deg, #A020F0, #FF7F11)",
            boxShadow: "0 2px 10px rgba(160,32,240,.3)",
          }}
        >
          Nouvelle demande ESTA
        </button>
      </form>

      <ul className="mt-8 divide-y divide-black/10 dark:divide-white/10">
        {(travelRequests ?? []).map((tr) => (
          <li key={tr.id}>
            <Link
              href={`/dashboard/${tr.id}`}
              className="flex items-center justify-between py-4 hover:opacity-70"
            >
              <span className="text-sm font-medium">
                ESTA — États-Unis
              </span>
              <span className="text-sm text-black/60 dark:text-white/60">
                {TRAVEL_REQUEST_STATUS_LABELS[tr.status] ?? tr.status}
              </span>
            </Link>
          </li>
        ))}
        {(travelRequests ?? []).length === 0 && (
          <li className="py-4 text-sm text-black/60 dark:text-white/60">
            Aucun dossier pour le moment.
          </li>
        )}
      </ul>
    </div>
  );
}
