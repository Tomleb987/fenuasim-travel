import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Lie/crée la ligne `customers` correspondant à l'utilisateur Supabase Auth
// (cf. docs/etape-0-mvp-esta.md section 2). Requiert service_role : au premier
// login, la ligne éventuellement pré-existante (créée par le staff, email non
// encore lié) n'est pas visible par le client via RLS (auth_user_id ne
// correspond pas encore à auth.uid()).
async function ensureCustomer(authUserId: string, rawEmail: string) {
  const email = rawEmail.toLowerCase();
  const service = createServiceClient();

  const { data: existing } = await service
    .from("customers")
    .select("id, auth_user_id")
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    if (!existing.auth_user_id) {
      await service.from("customers").update({ auth_user_id: authUserId }).eq("id", existing.id);
    }
    return;
  }

  await service.from("customers").insert({ auth_user_id: authUserId, email });
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user?.email) {
      await ensureCustomer(data.user.id, data.user.email);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/connexion?error=lien_invalide`);
}
