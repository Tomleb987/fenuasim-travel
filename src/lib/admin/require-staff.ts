import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getStaffMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("admin_users")
    .select("id, role, mfa_enabled")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  return data;
}

// Garde applicative pour les écrans réservés admin/superadmin (ex. édition du
// questionnaire) : la RLS (questionnaires_write / private.is_admin_or_above())
// bloque déjà les écritures d'un opérateur, mais sans ce contrôle en amont il
// verrait l'écran d'édition puis obtiendrait un échec silencieux (0 ligne
// modifiée) plutôt qu'une redirection claire.
export async function requireAdminOrAbove() {
  const staff = await getStaffMember();
  if (!staff) redirect("/admin/connexion?error=acces_refuse");
  if (staff.role === "operator") redirect("/admin/dashboard?error=acces_reserve_admin");
  return staff;
}
