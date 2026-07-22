-- ============================================================================
-- FENUASIM TRAVEL — MVP ESTA
-- Schéma de base de données — DRAFT POUR VALIDATION (Étape 0, révision 2)
-- Ne pas appliquer en production avant validation finale par le client.
-- Cible : Supabase (PostgreSQL 15+)
-- ============================================================================
-- À exécuter dans un nouveau projet Supabase dédié (isolé du Supabase FENUASIM
-- principal). Copier-coller tout ce fichier dans l'éditeur SQL Supabase,
-- ou via : supabase db execute -f db/schema.sql
--
-- Révision 2 — changements suite au retour de validation :
--   - Token QR : stocké hashé (SHA-256), jamais en clair (cf. table qr_scan_sessions)
--   - Chiffrement passeport/MRZ : effectué côté application (Node, AES-256-GCM),
--     la base ne reçoit jamais de valeur en clair (cf. note en fin de fichier)
--   - Mécanisme d'accès client posé : Supabase Auth magic link (OTP email),
--     aucune policy RLS ne repose sur un mot de passe
--   - Paiement : double ligne (frais de service FENUASIM / frais officiels ESTA),
--     devises EUR et XPF (XPF = devise zero-decimal chez Stripe)
--   - timeline : rendu strictement append-only (plus de updated_at/deleted_at)
--   - Policies RLS écrites pour toutes les tables (cf. section dédiée en fin de fichier)
--
-- Durcissement appliqué au Sprint 0 (suite aux Security Advisors Supabase, après
-- application initiale du schéma) : les fonctions utilitaires de policies
-- (auth_customer_id, staff_role, is_staff, is_admin_or_above, is_superadmin,
-- owns_travel_request) sont déplacées dans un schéma `private` non exposé par
-- l'API PostgREST, pour empêcher tout appel HTTP direct (`/rest/v1/rpc/...`) ;
-- `search_path` fixé explicitement sur chaque fonction.
-- ============================================================================

create extension if not exists pgcrypto; -- utilisé pour gen_random_uuid() ; le chiffrement
                                          -- des données passeport n'est PAS fait en SQL (voir plus bas)

-- ----------------------------------------------------------------------------
-- Fonction commune : mise à jour automatique de updated_at
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- Types énumérés
-- ----------------------------------------------------------------------------

-- Statuts du dossier (cf. section "Statuts" du document de cadrage — transitions
-- de re-scan et de remboursement après refus ajoutées en révision 2)
create type travel_request_status as enum (
  'draft',                       -- Brouillon
  'scan_pending',                -- Scan en attente
  'ocr_done',                    -- OCR terminé
  'to_verify',                   -- À vérifier
  'payment_pending',             -- Paiement en attente
  'paid',                        -- Payé
  'to_submit',                   -- À déposer
  'submitted',                   -- Déposé
  'additional_info_requested',   -- Complément demandé
  'accepted',                    -- Accepté
  'rejected',                    -- Refusé
  'cancelled',                   -- Annulé
  'refunded',                    -- Remboursé
  'closed'                       -- Clôturé
);

-- Destination : un seul type au MVP, structure prête pour NZeTA / ETA UK / AVE Canada en V2
-- (ajout via `alter type destination_code add value 'NZETA'` etc.)
create type destination_code as enum ('ESTA_US');

create type ocr_status as enum ('pending', 'success', 'low_confidence', 'failed', 'manual');

create type document_type as enum ('passport_photo', 'selfie', 'other');

create type capture_method as enum ('camera_mobile', 'qr_scan', 'desktop_upload');

create type payment_status as enum (
  'pending', 'requires_action', 'succeeded', 'failed',
  'refunded', 'partially_refunded', 'cancelled'
);

create type admin_role as enum ('operator', 'admin', 'superadmin');

-- 'email_sent' ajouté en révision 2 pour tracer les envois Brevo (Sprint 4)
create type timeline_event_type as enum (
  'status_change', 'note', 'document_uploaded', 'ocr_processed',
  'payment_event', 'mandate_signed', 'admin_action', 'system_event', 'email_sent'
);

create type actor_type as enum ('customer', 'admin', 'system');

create type esta_outcome as enum ('pending', 'accepted', 'rejected', 'additional_info_requested');

-- ============================================================================
-- 1. customers — comptes clients
--    Créés via Supabase Auth magic link (OTP email) — pas de mot de passe.
--    Le flux : le client saisit son email -> Supabase envoie un lien/OTP ->
--    à la première validation, auth.users est créé -> la ligne customers est
--    créée (ou liée) avec auth_user_id renseigné. Toutes les policies RLS
--    des tables dépendantes découlent de ce lien customers.auth_user_id = auth.uid().
-- ============================================================================
create table customers (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid references auth.users(id),  -- renseigné dès la validation du magic link
  email           text not null,
  phone           text,
  first_name      text,
  last_name       text,
  locale          text not null default 'fr',
  marketing_opt_in boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create unique index customers_email_unique_idx on customers (lower(email)) where deleted_at is null;
create index customers_auth_user_id_idx on customers (auth_user_id);

create trigger trg_customers_updated_at before update on customers
  for each row execute function set_updated_at();

-- ============================================================================
-- 2. travel_requests — le "dossier" (une demande ESTA, potentiellement pour
--    plusieurs voyageurs, un seul paiement, un seul mandat)
-- ============================================================================
create table travel_requests (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references customers(id),
  destination_code    destination_code not null default 'ESTA_US',
  status              travel_request_status not null default 'draft',
  traveler_count      integer not null default 1,
  price_amount_cents  integer not null,       -- snapshot du frais de service FENUASIM en EUR
                                                -- (cf. app_settings.esta_price_cents = 3000 = 30,00 €)
                                                -- valeur de référence uniquement : la devise et le
                                                -- détail définitif (service + frais officiels) sont
                                                -- fixés au moment du paiement, cf. table payments
  source_platform     text,                   -- 'mobile' | 'desktop', informatif uniquement
  submitted_at        timestamptz,            -- date de dépôt manuel par l'opérateur sur le site gouvernemental
  closed_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index travel_requests_customer_id_idx on travel_requests (customer_id);
create index travel_requests_status_idx on travel_requests (status) where deleted_at is null;
-- utilisé par le job de nettoyage des dossiers abandonnés (brouillons anciens)
create index travel_requests_draft_cleanup_idx on travel_requests (created_at) where status = 'draft' and deleted_at is null;

create trigger trg_travel_requests_updated_at before update on travel_requests
  for each row execute function set_updated_at();

-- ============================================================================
-- 3. travelers — un voyageur au sein d'un dossier (données passeport + ESTA)
--
--    CHIFFREMENT (révision 2) : passport_number_encrypted et mrz_encrypted sont
--    chiffrés côté application (Node, AES-256-GCM) AVANT l'insert. La base ne
--    reçoit et ne voit jamais la valeur en clair (aucun pgp_sym_encrypt en SQL,
--    pour ne jamais exposer le texte clair dans une requête ou un log Postgres).
--    Format stocké : bytea = nonce (12 octets) || ciphertext || authTag (16 octets),
--    produit par crypto.createCipheriv('aes-256-gcm', key, iv) côté serveur.
--
--    Clé et rotation :
--      - La clé (32 octets) vit uniquement en variable d'environnement serveur
--        (ex. PASSPORT_ENCRYPTION_KEY_V1), jamais exposée au client (pas de préfixe
--        NEXT_PUBLIC_), jamais commitée.
--      - encryption_key_version identifie la version de clé utilisée pour CHAQUE
--        ligne, ce qui permet un trousseau de clés (courante + précédentes) côté
--        serveur pendant une rotation.
--      - Procédure de rotation : générer PASSPORT_ENCRYPTION_KEY_V{n+1} -> déployer
--        avec les deux clés actives dans le trousseau serveur -> les nouvelles
--        écritures utilisent la clé la plus récente -> job de fond qui déchiffre
--        avec l'ancienne clé et rechiffre avec la nouvelle, ligne par ligne,
--        incrémentant encryption_key_version -> une fois 100% migré, retrait de
--        l'ancienne clé du trousseau et de l'environnement.
-- ============================================================================
create table travelers (
  id                        uuid primary key default gen_random_uuid(),
  travel_request_id         uuid not null references travel_requests(id),
  first_name                text,
  last_name                 text,
  sex                       text check (sex in ('M', 'F', 'X')),
  date_of_birth             date,
  nationality               text,              -- code pays ISO 3166-1 alpha-3 (issu du MRZ)
  passport_number_encrypted bytea,              -- chiffré côté application (AES-256-GCM), cf. note ci-dessus
  passport_number_last4     text,               -- 4 derniers caractères en clair, pour affichage/recherche uniquement
  passport_issuing_country  text,
  passport_expiry_date      date,
  mrz_encrypted             bytea,              -- ligne MRZ complète, chiffrée côté application
  encryption_key_version    smallint not null default 1,  -- version de PASSPORT_ENCRYPTION_KEY utilisée
  ocr_confidence_score      numeric(4,3),       -- 0.000 à 1.000
  ocr_status                ocr_status not null default 'pending',
  data_validated_by_customer boolean not null default false,
  data_validated_at         timestamptz,
  esta_outcome              esta_outcome not null default 'pending',
  esta_application_number   text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  deleted_at                timestamptz
);

create index travelers_travel_request_id_idx on travelers (travel_request_id);

create trigger trg_travelers_updated_at before update on travelers
  for each row execute function set_updated_at();

-- ============================================================================
-- 4. documents — fichiers uploadés (photo passeport, selfie éventuel)
--    Stockage Storage privé Supabase — jamais d'URL publique.
-- ============================================================================
create table documents (
  id                   uuid primary key default gen_random_uuid(),
  travel_request_id    uuid not null references travel_requests(id),
  traveler_id          uuid references travelers(id),
  document_type        document_type not null default 'passport_photo',
  storage_bucket       text not null default 'passports',
  storage_path         text not null,
  mime_type            text not null,
  file_size_bytes      integer,
  capture_method       capture_method not null,
  ocr_processed_at     timestamptz,
  scheduled_deletion_at timestamptz,           -- calculé à l'upload = now() + app_settings.passport_retention_days
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz             -- soft delete ; la purge effective du fichier Storage est déclenchée par le job de nettoyage
);

create index documents_travel_request_id_idx on documents (travel_request_id);
create index documents_scheduled_deletion_idx on documents (scheduled_deletion_at) where deleted_at is null;

create trigger trg_documents_updated_at before update on documents
  for each row execute function set_updated_at();

-- ============================================================================
-- 5. questionnaires — définition versionnée des questions ESTA (admin)
-- ============================================================================
create table questionnaires (
  id                uuid primary key default gen_random_uuid(),
  destination_code  destination_code not null default 'ESTA_US',
  version           integer not null,
  title             text,
  schema_json       jsonb not null,     -- structure des questions (clé, libellé, type, options, obligatoire...)
  is_active         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (destination_code, version)
);

create index questionnaires_active_idx on questionnaires (destination_code) where is_active = true and deleted_at is null;

create trigger trg_questionnaires_updated_at before update on questionnaires
  for each row execute function set_updated_at();

-- ============================================================================
-- 6. answers — réponses au questionnaire (jamais générées automatiquement)
-- ============================================================================
create table answers (
  id                     uuid primary key default gen_random_uuid(),
  travel_request_id      uuid not null references travel_requests(id),
  traveler_id            uuid not null references travelers(id),
  questionnaire_id       uuid not null references questionnaires(id),
  question_key           text not null,
  question_label_snapshot text,          -- copie du libellé au moment de la réponse (traçabilité si le questionnaire évolue)
  answer_value           jsonb not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);

create index answers_travel_request_id_idx on answers (travel_request_id);
create index answers_traveler_id_idx on answers (traveler_id);
create unique index answers_unique_question_idx on answers (traveler_id, questionnaire_id, question_key) where deleted_at is null;

create trigger trg_answers_updated_at before update on answers
  for each row execute function set_updated_at();

-- ============================================================================
-- 7. payments — paiements Stripe (validation uniquement via webhook)
--
--    DOUBLE LIGNE (révision 2) : chaque paiement facture deux montants distincts
--    affichés séparément au client :
--      - service_fee_amount      : "Frais de service FENUASIM" (30 €, cf. app_settings.esta_price_cents)
--      - official_fee_amount     : "Frais officiels du gouvernement américain" (40 USD, convertis)
--    Les deux sont prélevés ensemble dans un seul PaymentIntent, dans `currency`
--    (devise choisie par le client : EUR ou XPF).
--
--    DEVISES (révision 2) : XPF est une devise "zero-decimal" chez Stripe — pour
--    currency = 'xpf', tous les montants ci-dessous sont en UNITÉS ENTIÈRES de XPF
--    (pas de centimes), alors que pour 'eur' ils restent en centimes. Le nom des
--    colonnes (*_cents) est conservé par cohérence avec le reste du schéma mais
--    ne doit pas être pris littéralement pour les lignes en XPF.
-- ============================================================================
create table payments (
  id                      uuid primary key default gen_random_uuid(),
  travel_request_id       uuid not null references travel_requests(id),
  stripe_payment_intent_id text unique,
  stripe_customer_id      text,
  currency                text not null default 'eur' check (currency in ('eur', 'xpf')),  -- devise choisie par le client
  amount_cents            integer not null,   -- montant total prélevé = service_fee_amount + official_fee_amount, dans `currency`
  service_fee_amount      integer not null,    -- part "frais de service FENUASIM", dans `currency`
  official_fee_amount     integer not null,    -- part "frais officiels ESTA", dans `currency`
  official_fee_amount_usd_cents integer not null,  -- référence figée en USD (montant officiel réel, ex. 4000 = 40 USD), pour audit indépendant du taux de change
  fx_rate_eur_xpf         numeric(10,4),       -- parité fixe utilisée si currency = 'xpf' (valeur de référence : 119.3317)
  fx_rate_usd_eur         numeric(10,6),       -- taux utilisé pour convertir les frais officiels USD -> EUR au moment du paiement (source à définir, cf. points à valider)
  status                  payment_status not null default 'pending',
  payment_method_type     text,               -- 'card' | 'apple_pay' | 'google_pay'
  idempotency_key         text not null unique,
  metadata                jsonb not null default '{}'::jsonb,  -- extensible V2 (ex: option traitement urgent) sans migration
  refunded_amount_cents   integer not null default 0,
  refunded_at             timestamptz,
  refund_reason           text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);

create index payments_travel_request_id_idx on payments (travel_request_id);
create index payments_status_idx on payments (status);

create trigger trg_payments_updated_at before update on payments
  for each row execute function set_updated_at();

-- ============================================================================
-- 8. mandates — mandat électronique (preuve d'acceptation)
-- ============================================================================
create table mandates (
  id                uuid primary key default gen_random_uuid(),
  travel_request_id uuid not null references travel_requests(id),
  customer_id       uuid not null references customers(id),
  version           text not null,          -- version du texte du mandat accepté
  content_snapshot  text not null,          -- texte exact présenté et accepté (traçabilité)
  signer_full_name  text not null,
  ip_address        inet,
  user_agent        text,
  accepted_at       timestamptz not null default now(),
  proof_hash        text,                   -- sha256(content_snapshot || données clés) pour intégrité
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index mandates_travel_request_id_idx on mandates (travel_request_id);

create trigger trg_mandates_updated_at before update on mandates
  for each row execute function set_updated_at();

-- ============================================================================
-- 9. timeline — historique des statuts + notes internes + événements
--    STRICTEMENT APPEND-ONLY (révision 2) : pas de updated_at ni deleted_at,
--    UPDATE/DELETE révoqués explicitement pour tous les rôles en fin de fichier
--    (y compris service_role, qui contourne pourtant RLS par défaut).
-- ============================================================================
create table timeline (
  id                 uuid primary key default gen_random_uuid(),
  travel_request_id  uuid not null references travel_requests(id),
  event_type         timeline_event_type not null,
  from_status        travel_request_status,
  to_status          travel_request_status,
  actor_type         actor_type not null,
  actor_id           uuid,        -- customers.id ou admin_users.id selon actor_type
  message            text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index timeline_travel_request_id_idx on timeline (travel_request_id, created_at);

-- ============================================================================
-- 10. admin_users — opérateurs / administrateurs back-office
--     MFA (révision 2) : activé dès le MVP (V1), via TOTP natif Supabase Auth
--     (mfa_enabled reflète l'état d'enrôlement, l'exigence MFA elle-même est
--     appliquée côté Supabase Auth / middleware d'accès back-office).
-- ============================================================================
create table admin_users (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid not null unique references auth.users(id),
  email          text not null,
  full_name      text,
  role           admin_role not null default 'operator',
  is_active      boolean not null default true,
  mfa_enabled    boolean not null default false,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create trigger trg_admin_users_updated_at before update on admin_users
  for each row execute function set_updated_at();

-- ============================================================================
-- TABLES COMPLÉMENTAIRES (au-delà du minimum demandé, nécessaires au parcours
-- décrit dans le brief)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 11. qr_scan_sessions — relais desktop → mobile pour le scan passeport
--
--     TOKEN HASHÉ (révision 2) : le token en clair n'est JAMAIS stocké. Il est
--     généré côté serveur, inséré uniquement dans le QR code / lien transmis au
--     client, puis immédiatement jeté. Seul son hash SHA-256 (token_hash) est
--     persisté. La vérification (côté serveur, jamais côté client) recalcule le
--     hash du token reçu et le compare à token_hash.
--
--     ACCÈS : cette table n'est JAMAIS interrogée directement par le client via
--     la clé anon (RLS ci-dessous ne définit aucune policy pour anon/authenticated
--     -> accès refusé par défaut). Toute création/consommation de session passe
--     par une route serveur dédiée utilisant la clé service_role.
-- ----------------------------------------------------------------------------
create table qr_scan_sessions (
  id                 uuid primary key default gen_random_uuid(),
  travel_request_id  uuid not null references travel_requests(id),
  token_hash         text not null unique,   -- sha256(token), hex (64 caractères)
  status             text not null default 'pending',  -- pending | scanned | completed | expired
  expires_at         timestamptz not null,    -- now() + app_settings.qr_session_ttl_minutes (15 min par défaut)
  consumed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index qr_scan_sessions_expires_idx on qr_scan_sessions (expires_at);

create trigger trg_qr_scan_sessions_updated_at before update on qr_scan_sessions
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 12. app_settings — configuration ajustable depuis le back-office
--     ACCÈS : aucune policy de lecture pour anon/authenticated (cf. RLS plus bas)
--     -> le front lit ces valeurs via une route serveur (jamais de requête
--     Supabase directe côté client sur cette table).
-- ----------------------------------------------------------------------------
create table app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references admin_users(id)
);

insert into app_settings (key, value, description) values
  ('esta_price_cents', '3000', 'Frais de service FENUASIM par dossier, en centimes EUR (30,00 €)'),
  ('esta_official_fee_usd_cents', '4000', 'Frais officiels ESTA (gouvernement US), en centimes USD (40 USD)'),
  ('eur_xpf_fixed_rate', '119.3317', 'Parité fixe officielle EUR -> XPF (CFP), ne varie pas'),
  ('usd_eur_fx_rate', '0.95', 'Taux USD -> EUR pour convertir les frais officiels ESTA. Saisie manuelle périodique par un opérateur (pas d''API de taux de change au MVP), modifiable en back-office comme les autres app_settings (updated_by tracé). Valeur initiale avec léger buffer au-dessus du marché pour absorber les frais de change bancaires réels ; à recaler après le premier dépôt réel.'),
  ('ocr_confidence_threshold', '0.85', 'Seuil de confiance OCR sous lequel le fallback saisie manuelle est déclenché'),
  ('passport_retention_days', '30', 'Durée de conservation des photos de passeport avant purge automatique'),
  ('abandoned_draft_retention_days', '30', 'Durée avant suppression automatique des dossiers en brouillon abandonnés'),
  ('qr_session_ttl_minutes', '15', 'Durée de validité du token de scan QR desktop → mobile');

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table customers enable row level security;
alter table travel_requests enable row level security;
alter table travelers enable row level security;
alter table documents enable row level security;
alter table questionnaires enable row level security;
alter table answers enable row level security;
alter table payments enable row level security;
alter table mandates enable row level security;
alter table timeline enable row level security;
alter table admin_users enable row level security;
alter table qr_scan_sessions enable row level security;
alter table app_settings enable row level security;

-- ----------------------------------------------------------------------------
-- Fonctions utilitaires pour les policies, isolées dans le schéma `private`.
--
-- Pourquoi un schéma dédié : PostgREST expose automatiquement en RPC HTTP
-- (`/rest/v1/rpc/...`) toute fonction du schéma `public`, y compris les
-- fonctions SECURITY DEFINER. Ces fonctions ne sont destinées qu'à un usage
-- interne aux policies RLS ci-dessous — les isoler dans `private` (schéma non
-- exposé par l'API PostgREST par défaut) empêche tout appel HTTP direct
-- (anon ou authenticated) tout en restant utilisables depuis les policies,
-- qui résolvent les fonctions par OID et non par nom.
--
-- `set search_path` : fixé explicitement sur chaque fonction (bonne pratique
-- de sécurité, en particulier pour les fonctions SECURITY DEFINER) — inclut
-- `private` quand la fonction appelle un autre helper du même schéma.
-- ----------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

-- id du customer courant (basé sur le magic link / auth.uid()), ou null
create or replace function private.auth_customer_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from customers where auth_user_id = auth.uid() and deleted_at is null limit 1;
$$;

-- rôle staff courant (operator/admin/superadmin), ou null si pas un compte staff actif
create or replace function private.staff_role()
returns admin_role
language sql stable security definer
set search_path = public
as $$
  select role from admin_users where auth_user_id = auth.uid() and is_active = true and deleted_at is null limit 1;
$$;

create or replace function private.is_staff()
returns boolean
language sql stable
set search_path = private, public
as $$
  select private.staff_role() is not null;
$$;

create or replace function private.is_admin_or_above()
returns boolean
language sql stable
set search_path = private, public
as $$
  select private.staff_role() in ('admin', 'superadmin');
$$;

create or replace function private.is_superadmin()
returns boolean
language sql stable
set search_path = private, public
as $$
  select private.staff_role() = 'superadmin';
$$;

-- vrai si le travel_request appartient au client actuellement authentifié
create or replace function private.owns_travel_request(p_travel_request_id uuid)
returns boolean
language sql stable security definer
set search_path = private, public
as $$
  select exists (
    select 1 from travel_requests
    where id = p_travel_request_id and customer_id = private.auth_customer_id()
  );
$$;

-- ----------------------------------------------------------------------------
-- Policies — customers
-- ----------------------------------------------------------------------------
create policy customers_select on customers for select
  using (auth_user_id = auth.uid() or private.is_staff());
create policy customers_insert on customers for insert
  with check (auth_user_id = auth.uid());
create policy customers_update on customers for update
  using (auth_user_id = auth.uid() or private.is_staff())
  with check (auth_user_id = auth.uid() or private.is_staff());

-- ----------------------------------------------------------------------------
-- Policies — travel_requests
-- ----------------------------------------------------------------------------
create policy travel_requests_select on travel_requests for select
  using (customer_id = private.auth_customer_id() or private.is_staff());
create policy travel_requests_insert on travel_requests for insert
  with check (customer_id = private.auth_customer_id());
create policy travel_requests_update on travel_requests for update
  using (customer_id = private.auth_customer_id() or private.is_staff())
  with check (customer_id = private.auth_customer_id() or private.is_staff());

-- ----------------------------------------------------------------------------
-- Policies — travelers
-- ----------------------------------------------------------------------------
create policy travelers_select on travelers for select
  using (private.is_staff() or private.owns_travel_request(travel_request_id));
create policy travelers_insert on travelers for insert
  with check (private.owns_travel_request(travel_request_id));
create policy travelers_update on travelers for update
  using (private.is_staff() or private.owns_travel_request(travel_request_id))
  with check (private.is_staff() or private.owns_travel_request(travel_request_id));

-- ----------------------------------------------------------------------------
-- Policies — documents (upload client autorisé, correction/suppression réservée au staff)
-- ----------------------------------------------------------------------------
create policy documents_select on documents for select
  using (private.is_staff() or private.owns_travel_request(travel_request_id));
create policy documents_insert on documents for insert
  with check (private.owns_travel_request(travel_request_id));
create policy documents_update on documents for update
  using (private.is_staff())
  with check (private.is_staff());

-- ----------------------------------------------------------------------------
-- Policies — questionnaires (lecture publique des versions actives, écriture admin)
-- ----------------------------------------------------------------------------
create policy questionnaires_select on questionnaires for select
  using (is_active = true or private.is_staff());
create policy questionnaires_write on questionnaires for all
  using (private.is_admin_or_above())
  with check (private.is_admin_or_above());

-- ----------------------------------------------------------------------------
-- Policies — answers
-- ----------------------------------------------------------------------------
create policy answers_select on answers for select
  using (private.is_staff() or private.owns_travel_request(travel_request_id));
create policy answers_insert on answers for insert
  with check (private.owns_travel_request(travel_request_id));
create policy answers_update on answers for update
  using (private.is_staff() or private.owns_travel_request(travel_request_id))
  with check (private.is_staff() or private.owns_travel_request(travel_request_id));

-- ----------------------------------------------------------------------------
-- Policies — payments (lecture client, écriture exclusivement via service_role
-- côté webhook Stripe / actions serveur — le staff peut lire pour le back-office,
-- une action de remboursement déclenche un appel serveur qui utilise service_role)
-- ----------------------------------------------------------------------------
create policy payments_select on payments for select
  using (private.is_staff() or private.owns_travel_request(travel_request_id));

-- ----------------------------------------------------------------------------
-- Policies — mandates (le client signe/insère, mais ne peut jamais modifier
-- ou supprimer une preuve d'acceptation déjà enregistrée)
-- ----------------------------------------------------------------------------
create policy mandates_select on mandates for select
  using (private.is_staff() or private.owns_travel_request(travel_request_id));
create policy mandates_insert on mandates for insert
  with check (private.owns_travel_request(travel_request_id));

-- ----------------------------------------------------------------------------
-- Policies — timeline (lecture client + staff, écriture insert seulement,
-- jamais d'update/delete — cf. revoke explicite ci-dessous)
-- ----------------------------------------------------------------------------
create policy timeline_select on timeline for select
  using (private.is_staff() or private.owns_travel_request(travel_request_id));
create policy timeline_insert on timeline for insert
  with check (private.is_staff() or private.owns_travel_request(travel_request_id));

-- append-only strict : révoqué pour TOUS les rôles, y compris service_role
-- (bypass RLS ne donne pas le privilège si celui-ci est explicitement révoqué)
revoke update, delete on timeline from public, anon, authenticated, service_role;
grant select, insert on timeline to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Policies — admin_users (gestion des comptes staff réservée au superadmin ;
-- chaque membre du staff peut lire/mettre à jour sa propre ligne, ex. enrôlement MFA)
-- ----------------------------------------------------------------------------
create policy admin_users_select on admin_users for select
  using (auth_user_id = auth.uid() or private.is_staff());
create policy admin_users_update on admin_users for update
  using (auth_user_id = auth.uid() or private.is_superadmin())
  with check (auth_user_id = auth.uid() or private.is_superadmin());
create policy admin_users_insert on admin_users for insert
  with check (private.is_superadmin());
create policy admin_users_delete on admin_users for delete
  using (private.is_superadmin());

-- ----------------------------------------------------------------------------
-- Policies — qr_scan_sessions : AUCUNE (RLS activée sans policy = accès refusé
-- pour anon/authenticated ; seule la route serveur, via service_role, y accède).
-- L'advisor de sécurité Supabase signale ce cas en INFO ("RLS Enabled No Policy") :
-- c'est le comportement voulu, pas une omission.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Policies — app_settings : lecture réservée au staff (le front public passe par
-- une route serveur qui expose uniquement les clés nécessaires), écriture admin+
-- ----------------------------------------------------------------------------
create policy app_settings_select on app_settings for select
  using (private.is_staff());
create policy app_settings_write on app_settings for all
  using (private.is_admin_or_above())
  with check (private.is_admin_or_above());

-- ----------------------------------------------------------------------------
-- Fonction — activate_questionnaire_version (Sprint 3)
--
-- Vit dans `public` (et non `private`) car appelée en RPC depuis le serveur
-- applicatif (supabase.rpc(...)) : seul le schéma exposé par PostgREST est
-- atteignable ainsi, contrairement à `private`. `security invoker` : aucune
-- nouvelle surface de privilège, l'appelant reste entièrement soumis à la RLS
-- existante (questionnaires_write / private.is_admin_or_above()) — cette
-- fonction ne fait qu'atomiser deux updates qui, exécutés séquentiellement
-- depuis Next.js, risqueraient une situation de course entre deux admins
-- activant des versions différentes en même temps.
-- ----------------------------------------------------------------------------
create or replace function activate_questionnaire_version(p_questionnaire_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_destination destination_code;
begin
  select destination_code into v_destination
  from questionnaires
  where id = p_questionnaire_id and deleted_at is null;

  if v_destination is null then
    raise exception 'Questionnaire introuvable';
  end if;

  -- verrouille les lignes actives de cette destination pour sérialiser les
  -- activations concurrentes (un 2e appel attend le commit du 1er)
  perform 1 from questionnaires
  where destination_code = v_destination and is_active = true and deleted_at is null
  for update;

  update questionnaires set is_active = false
  where destination_code = v_destination and is_active = true
    and id <> p_questionnaire_id and deleted_at is null;

  update questionnaires set is_active = true where id = p_questionnaire_id;
end;
$$;

revoke all on function activate_questionnaire_version(uuid) from public;
grant execute on function activate_questionnaire_version(uuid) to authenticated;
