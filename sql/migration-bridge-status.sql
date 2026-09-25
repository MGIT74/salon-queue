-- ============================================================
--  Migration : statut de connexion en direct du pont TPE
--  À exécuter UNE SEULE FOIS, sur une base déjà en place.
--  Ne casse rien : ajoute juste une colonne, NULL pour les ponts
--  existants tant qu'ils n'ont pas encore fait de nouvelle requête.
-- ============================================================

ALTER TABLE bridge_keys ADD COLUMN last_seen_at DATETIME NULL;
