-- ============================================================
--  Migration : statut de connexion spécifique au TPE (en plus du
--  statut général du pont, ajouté par migration-bridge-status.sql).
--  À exécuter UNE SEULE FOIS, sur une base déjà en place.
--  Ne casse rien : ajoute juste une colonne, NULL tant que le pont
--  n'a pas encore réclamé de demande de paiement CB.
-- ============================================================

ALTER TABLE bridge_keys ADD COLUMN last_charge_poll_at DATETIME NULL;
