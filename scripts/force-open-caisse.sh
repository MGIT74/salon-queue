#!/bin/bash
# Force la réouverture de caisse d'un salon (par slug), sans passer par
# le mot de passe admin - utile pour une intervention ponctuelle.
# Usage : bash force-open-caisse.sh <slug-du-salon>
set -e
cd "$(dirname "$0")/.."
set -a
[ -f .env ] && . <(sed 's/\r$//' .env)
[ -f ~/.env.salon-queue ] && . <(sed 's/\r$//' ~/.env.salon-queue)
set +a

SLUG="$1"
if [ -z "$SLUG" ]; then echo "Usage: force-open-caisse.sh <slug>"; exit 1; fi

mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
INSERT INTO settings (salon_id, \`key\`, value, updated_at)
SELECT id, 'caisse_force_reopen_at', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ'), NOW()
FROM salons WHERE slug = '$SLUG'
ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW();
"
echo "Caisse forcée ouverte pour le salon '$SLUG'."

mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
SELECT s.slug, st.value AS caisse_force_reopen_at
FROM settings st JOIN salons s ON s.id = st.salon_id
WHERE s.slug = '$SLUG' AND st.\`key\` = 'caisse_force_reopen_at';
"
