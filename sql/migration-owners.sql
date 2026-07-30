-- ============================================================
--  Migration : introduction du "propriétaire" (chaîne de salons)
--  À exécuter UNE SEULE FOIS, après la migration multi-salon initiale.
--  Ne casse rien : salons.admin_password reste en place (juste plus
--  utilisée), le mot de passe existant est repris à l'identique dans
--  le nouvel owner correspondant.
-- ============================================================

CREATE TABLE IF NOT EXISTS owners (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NULL,
  admin_password VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Un owner par salon existant, avec le même mot de passe qu'aujourd'hui —
-- rien ne change pour les salons déjà en place.
INSERT INTO owners (id, name, admin_password)
SELECT UUID(), name, admin_password FROM salons;

ALTER TABLE salons ADD COLUMN owner_id CHAR(36) NULL;

UPDATE salons s
JOIN owners o ON o.admin_password = s.admin_password AND o.name = s.name
SET s.owner_id = o.id;

ALTER TABLE salons MODIFY owner_id CHAR(36) NOT NULL;
ALTER TABLE salons ADD CONSTRAINT fk_salons_owner FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE;

-- Vérification
SELECT s.name AS salon, s.slug, o.name AS owner, o.id AS owner_id
FROM salons s JOIN owners o ON o.id = s.owner_id;
