import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Client service_role : contourne RLS. Réservé aux routes serveur qui en ont
// explicitement besoin (liaison customers ↔ auth_user_id, webhooks, jobs de
// fond). Ne jamais utiliser pour une requête qui peut passer par le client
// authentifié standard (cf. src/lib/supabase/server.ts).
export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
