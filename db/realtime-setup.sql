-- ============================================================================
-- FENUASIM TRAVEL — Realtime : réplication sur travel_requests
-- À exécuter une fois (donnée/config, pas une migration de schéma applicative).
-- ============================================================================
-- Permet au desktop de s'abonner (postgres_changes) aux changements de statut
-- de son propre dossier pendant le relais QR desktop → mobile, sans avoir à
-- recharger la page manuellement. Realtime applique la RLS existante
-- (travel_requests_select) : un client ne reçoit que les changements des
-- dossiers qu'il possède déjà le droit de lire.

alter publication supabase_realtime add table travel_requests;
