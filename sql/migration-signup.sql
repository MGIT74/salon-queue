-- ============================================================
--  Migration : inscription par email/mot de passe + correctif du bug
--  "Field 'admin_password' doesn't have a default value"
--  À exécuter UNE SEULE FOIS sur la base de production.
-- ============================================================

ALTER TABLE owners ADD COLUMN email VARCHAR(255) NULL;
ALTER TABLE owners ADD UNIQUE KEY uniq_owner_email (email);
ALTER TABLE owners ADD COLUMN password_hash VARCHAR(255) NULL;

-- Corrige le bug : cette colonne n'est plus utilisée que pour les comptes
-- provisionnés à l'ancienne (super admin / partage manuel de mot de passe).
-- La rendre nullable évite l'erreur lors de la création d'un nouveau salon.
ALTER TABLE owners MODIFY admin_password VARCHAR(255) NULL;
ALTER TABLE salons MODIFY admin_password VARCHAR(255) NULL;
