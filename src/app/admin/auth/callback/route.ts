import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Aucune auto-inscription staff : admin_users.auth_user_id est NOT NULL et la
// policy d'insert exige is_superadmin() (cf. db/schema.sql). Un compte staff
// n'existe donc que si un superadmin l'a créé au préalable ; sinon on
// déconnecte immédiatement et on refuse l'accès.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const { data: staff } = await supabase
        .from("admin_users")
        .select("id")
        .eq("auth_user_id", data.user.id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();

      if (staff) {
        return NextResponse.redirect(
          `${origin}/admin/mfa?next=${encodeURIComponent(next)}`,
        );
      }

      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/admin/connexion?error=acces_refuse`);
    }
  }

  return NextResponse.redirect(`${origin}/admin/connexion?error=lien_invalide`);
}
