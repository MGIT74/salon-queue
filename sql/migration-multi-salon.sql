-- ============================================================
--  Migration : passage au multi-salon
--  A executer UNE SEULE FOIS sur la base de production existante
--  (deploiement mono-salon precedent). Ne pas relancer.
--
--  IMPORTANT : remplacez 'change-moi' ligne ~14 par le mot de passe
--  admin actuellement utilise sur le dashboard, pour ne RIEN changer
--  pour le salon deja en place.
-- ============================================================

CREATE TABLE IF NOT EXISTS salons (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  admin_password VARCHAR(255) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO salons (id, name, slug, admin_password, is_default)
VALUES (UUID(), 'Le Salon', 'le-salon', 'change-moi', 1);

SET @default_salon_id = (SELECT id FROM salons WHERE slug = 'le-salon' LIMIT 1);

-- barbers
ALTER TABLE barbers ADD COLUMN salon_id CHAR(36) NULL;
UPDATE barbers SET salon_id = @default_salon_id;
ALTER TABLE barbers MODIFY salon_id CHAR(36) NOT NULL;
ALTER TABLE barbers ADD CONSTRAINT fk_barbers_salon FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE;
ALTER TABLE barbers ADD UNIQUE KEY uniq_salon_pin (salon_id, pin_code);

-- services
ALTER TABLE services ADD COLUMN salon_id CHAR(36) NULL;
UPDATE services SET salon_id = @default_salon_id;
ALTER TABLE services MODIFY salon_id CHAR(36) NOT NULL;
ALTER TABLE services ADD CONSTRAINT fk_services_salon FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE;

-- extras
ALTER TABLE extras ADD COLUMN salon_id CHAR(36) NULL;
UPDATE extras SET salon_id = @default_salon_id;
ALTER TABLE extras MODIFY salon_id CHAR(36) NOT NULL;
ALTER TABLE extras ADD CONSTRAINT fk_extras_salon FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE;

-- queue
ALTER TABLE queue ADD COLUMN salon_id CHAR(36) NULL;
UPDATE queue SET salon_id = @default_salon_id;
ALTER TABLE queue MODIFY salon_id CHAR(36) NOT NULL;
ALTER TABLE queue ADD CONSTRAINT fk_queue_salon FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE;
CREATE INDEX idx_queue_salon ON queue(salon_id);

-- settings : la cle primaire devient (salon_id, key)
ALTER TABLE settings ADD COLUMN salon_id CHAR(36) NULL;
UPDATE settings SET salon_id = @default_salon_id;
ALTER TABLE settings MODIFY salon_id CHAR(36) NOT NULL;
ALTER TABLE settings DROP PRIMARY KEY;
ALTER TABLE settings ADD PRIMARY KEY (salon_id, `key`);
ALTER TABLE settings ADD CONSTRAINT fk_settings_salon FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE;

-- Verification : tout doit afficher un nombre de lignes > 0 (sauf si
-- vous partiez d'une base vraiment vide)
SELECT 'salons' AS table_name, COUNT(*) AS rows FROM salons
UNION ALL SELECT 'barbers', COUNT(*) FROM barbers
UNION ALL SELECT 'services', COUNT(*) FROM services
UNION ALL SELECT 'extras', COUNT(*) FROM extras
UNION ALL SELECT 'queue', COUNT(*) FROM queue
UNION ALL SELECT 'settings', COUNT(*) FROM settings;
