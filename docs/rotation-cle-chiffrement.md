# Rotation de la clé de chiffrement passeport/MRZ

Contexte complet : `db/schema.sql`, table `travelers` (colonnes `passport_number_encrypted`,
`mrz_encrypted`, `encryption_key_version`).

## Où vit la clé

- `PASSPORT_ENCRYPTION_KEY_V1` : 32 octets encodés en base64, variable d'environnement
  **serveur uniquement** (jamais de préfixe `NEXT_PUBLIC_`, jamais commitée).
- En local : `.env.local` (gitignore, généré au Sprint 0).
- En production : variable d'environnement Vercel, scope "Production"/"Preview" selon le
  cas, jamais exposée au bundle client.
- `PASSPORT_ENCRYPTION_KEY_CURRENT_VERSION` indique la version utilisée pour les
  **nouvelles** écritures. Chaque ligne `travelers` stocke la version qui a servi à la
  chiffrer (`encryption_key_version`), ce qui permet de faire cohabiter plusieurs
  générations de clé le temps d'une rotation.

## Format stocké

`bytea` = `nonce (12 octets) || ciphertext || authTag (16 octets)`, produit par
`crypto.createCipheriv('aes-256-gcm', key, iv)` côté serveur (Node). Le déchiffrement
utilise la clé correspondant à `encryption_key_version`.

## Procédure de rotation

1. Générer la nouvelle clé :
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. Déployer avec **les deux clés actives** dans le trousseau serveur :
   `PASSPORT_ENCRYPTION_KEY_V1` (ancienne) + `PASSPORT_ENCRYPTION_KEY_V2` (nouvelle),
   et passer `PASSPORT_ENCRYPTION_KEY_CURRENT_VERSION=2`.
3. Les nouvelles écritures utilisent automatiquement la clé courante (V2) ; le code
   serveur doit choisir la clé de déchiffrement en fonction de `encryption_key_version`
   sur chaque ligne lue, jamais une clé unique codée en dur.
4. Lancer un job de fond qui parcourt les lignes `encryption_key_version = 1`, déchiffre
   avec V1, rechiffre avec V2, et met à jour `encryption_key_version = 2`.
5. Une fois 100 % des lignes migrées (vérifier `select count(*) from travelers where
   encryption_key_version < 2`), retirer `PASSPORT_ENCRYPTION_KEY_V1` de l'environnement.

## Ce que cette procédure ne couvre pas

- Elle ne rechiffre pas rétroactivement les documents Storage (photos de passeport) —
  ceux-ci sont soumis à leur propre purge automatique (`app_settings.passport_retention_days`)
  et ne contiennent pas de texte en clair réutilisable indépendamment de l'image.
- Le choix du service de gestion de secrets (Vercel env vars au MVP) pourra être revu en
  V2 si un coffre-fort dédié (ex. Vault) devient nécessaire — pas de changement de schéma
  requis pour cette évolution.
