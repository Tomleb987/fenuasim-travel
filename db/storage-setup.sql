-- ============================================================================
-- FENUASIM TRAVEL — Storage : bucket privé "passports"
-- À exécuter une fois (donnée, pas une migration de schéma applicative).
-- ============================================================================
-- Aucune policy storage.objects n'est ajoutée : tous les accès (upload et
-- lecture, via URL signée courte durée) passent exclusivement par le client
-- service_role côté serveur (src/app/dashboard/actions.ts), après vérification
-- manuelle de propriété du dossier. Cohérent avec le cadrage : "jamais d'URL
-- publique" (docs/etape-0-mvp-esta.md, section 1).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'passports',
  'passports',
  false,
  10485760, -- 10 Mo
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
