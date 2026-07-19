"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// app_settings n'a aucune policy de lecture pour un client authentifié
// (cf. db/schema.sql, section RLS) : le prix est lu côté serveur via
// service_role, jamais exposé en direct au front (docs section 9).
async function getEstaPriceCents(): Promise<number> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("app_settings")
    .select("value")
    .eq("key", "esta_price_cents")
    .single();

  if (error || !data) throw new Error("Impossible de lire le prix ESTA (app_settings)");
  return Number(data.value);
}

export async function createTravelRequest() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (customerError || !customer) throw new Error("Dossier client introuvable");

  const priceAmountCents = await getEstaPriceCents();

  const { data: travelRequest, error: insertError } = await supabase
    .from("travel_requests")
    .insert({
      customer_id: customer.id,
      destination_code: "ESTA_US",
      price_amount_cents: priceAmountCents,
      source_platform: "desktop",
    })
    .select("id")
    .single();
  if (insertError || !travelRequest) throw new Error("Création du dossier impossible");

  await supabase.from("timeline").insert({
    travel_request_id: travelRequest.id,
    event_type: "status_change",
    to_status: "draft",
    actor_type: "customer",
    actor_id: customer.id,
    message: "Dossier créé",
  });

  redirect(`/dashboard/${travelRequest.id}`);
}
