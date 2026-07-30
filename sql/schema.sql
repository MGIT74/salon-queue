-- ============================================================
--  Salon — file d'attente temps réel — schéma MySQL (multi-salon)
--  À exécuter une fois sur une base VIERGE.
--  Pour migrer une base existante (deploiement mono-salon precedent),
--  voir sql/migration-multi-salon.sql a la place.
-- ============================================================

CREATE TABLE IF NOT EXISTS owners (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NULL,
  admin_password VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salons (
  id CHAR(36) PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Le propriétaire et le salon par défaut : sert de secours quand une page
-- est ouverte sans ?salon=... dans l'URL (rétro-compatibilité avec les
-- bornes déjà configurées avant l'ajout du multi-salon).
INSERT INTO owners (id, name, admin_password)
SELECT UUID(), 'Le Salon', 'change-moi'
WHERE NOT EXISTS (SELECT 1 FROM salons WHERE is_default = 1);

SET @seed_owner_id = (SELECT id FROM owners ORDER BY created_at DESC LIMIT 1);

INSERT INTO salons (id, owner_id, name, slug, is_default)
SELECT UUID(), @seed_owner_id, 'Le Salon', 'le-salon', 1
WHERE NOT EXISTS (SELECT 1 FROM salons WHERE is_default = 1);

CREATE TABLE IF NOT EXISTS barbers (
  id CHAR(36) PRIMARY KEY,
  salon_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  pin_code VARCHAR(10) NULL,
  photo_url LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_salon_pin (salon_id, pin_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- weekday : 0 = dimanche ... 6 = samedi (comme Date.getDay() en JS)
CREATE TABLE IF NOT EXISTS barber_schedules (
  id CHAR(36) PRIMARY KEY,
  barber_id CHAR(36) NOT NULL,
  weekday TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uniq_barber_day (barber_id, weekday),
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS services (
  id VARCHAR(60) PRIMARY KEY,
  salon_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  duration_min INT NOT NULL DEFAULT 30,
  price_cents INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS extras (
  id VARCHAR(60) PRIMARY KEY,
  salon_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  duration_min INT NOT NULL DEFAULT 0,
  price_cents INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS queue (
  id CHAR(36) PRIMARY KEY,
  salon_id CHAR(36) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  service_id VARCHAR(60) NULL,
  barber_id CHAR(36) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  checkin_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  start_at DATETIME NULL,
  end_at DATETIME NULL,
  queue_position INT NULL,
  estimated_wait_min INT NULL,
  total_duration_min INT NULL,
  total_price_cents INT NULL,
  notified TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS queue_extras (
  queue_id CHAR(36) NOT NULL,
  extra_id VARCHAR(60) NOT NULL,
  PRIMARY KEY (queue_id, extra_id),
  FOREIGN KEY (queue_id) REFERENCES queue(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_queue_status ON queue(status);
CREATE INDEX idx_queue_checkin ON queue(checkin_at);
CREATE INDEX idx_queue_salon ON queue(salon_id);

CREATE TABLE IF NOT EXISTS settings (
  salon_id CHAR(36) NOT NULL,
  `key` VARCHAR(100) NOT NULL,
  value TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (salon_id, `key`),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Données de départ pour le salon par défaut ----------
SET @default_salon_id = (SELECT id FROM salons WHERE is_default = 1 LIMIT 1);

INSERT INTO services (id, salon_id, name, duration_min, price_cents, sort_order)
SELECT UUID(), @default_salon_id, v.name, v.duration_min, v.price_cents, v.sort_order
FROM (
  SELECT 'Coupe' AS name, 30 AS duration_min, 2000 AS price_cents, 1 AS sort_order
  UNION ALL SELECT 'Barbe', 15, 1200, 2
  UNION ALL SELECT 'Coupe et barbe', 45, 2800, 3
  UNION ALL SELECT 'Coupe enfant', 20, 1500, 4
) v
WHERE NOT EXISTS (SELECT 1 FROM services WHERE salon_id = @default_salon_id);

INSERT INTO extras (id, salon_id, name, duration_min, price_cents, sort_order)
SELECT UUID(), @default_salon_id, v.name, v.duration_min, v.price_cents, v.sort_order
FROM (
  SELECT 'Shampooing' AS name, 5 AS duration_min, 300 AS price_cents, 1 AS sort_order
  UNION ALL SELECT 'Serviette chaude', 10, 800, 2
  UNION ALL SELECT 'Contour / traçage', 5, 500, 3
  UNION ALL SELECT 'Dégradé américain', 10, 500, 4
  UNION ALL SELECT 'Coloration', 25, 2000, 5
  UNION ALL SELECT 'Soin barbe à l''huile', 10, 1000, 6
) v
WHERE NOT EXISTS (SELECT 1 FROM extras WHERE salon_id = @default_salon_id);

INSERT INTO settings (salon_id, `key`, value)
SELECT @default_salon_id, v.k, v.val FROM (
  SELECT 'notify_before_min' AS k, '30' AS val
  UNION ALL SELECT 'salon_name', 'Le Salon'
  UNION ALL SELECT 'smtp_host', ''
  UNION ALL SELECT 'smtp_port', '587'
  UNION ALL SELECT 'smtp_user', ''
  UNION ALL SELECT 'smtp_pass', ''
  UNION ALL SELECT 'smtp_from', ''
) v
ON DUPLICATE KEY UPDATE `key` = VALUES(`key`);
