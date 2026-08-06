#!/bin/bash
# Rejoue sql/schema.sql sur la base de production, avec les identifiants
# de connexion tels que l'app les résout réellement (mêmes fichiers, même
# ordre de priorité que server.js : ~/.env.salon-queue écrase .env).
# Existe pour être appelé via une commande courte (les commandes exécutées
# depuis xCloud sont limitées en longueur) plutôt que d'écrire toute la
# logique inline dans la tâche planifiée.
set -e
cd "$(dirname "$0")/.."

set -a
[ -f .env ] && . <(sed 's/\r$//' .env)
[ -f ~/.env.salon-queue ] && . <(sed 's/\r$//' ~/.env.salon-queue)
set +a

echo "== Connexion: $DB_HOST:${DB_PORT:-3306}/$DB_NAME (utilisateur $DB_USER) =="

mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < sql/schema.sql
echo "== schema.sql rejoué avec succès =="

echo "== Vérification =="
mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SHOW COLUMNS FROM appointments LIKE 'source';
SELECT client_name, source, cancel_token, promoted_queue_id
FROM appointments ORDER BY created_at DESC LIMIT 10;
"
