-- ============================================================
--  Salon — file d'attente temps réel — schéma MySQL
--  À exécuter une fois sur la base créée pour l'app.
-- ============================================================

CREATE TABLE IF NOT EXISTS barbers (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  pin_code VARCHAR(10) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pour une base deja existante (deploiement precedent) : ajoute la colonne
-- si elle n'existe pas encore, sans casser les donnees existantes.
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS pin_code VARCHAR(10) NULL;

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
  name VARCHAR(255) NOT NULL,
  duration_min INT NOT NULL DEFAULT 30,
  price_cents INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS extras (
  id VARCHAR(60) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  duration_min INT NOT NULL DEFAULT 0,
  price_cents INT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS queue (
  id CHAR(36) PRIMARY KEY,
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
  FOREIGN KEY (service_id) REFERENCES services(id),
  FOREIGN KEY (barber_id) REFERENCES barbers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS queue_extras (
  queue_id CHAR(36) NOT NULL,
  extra_id VARCHAR(60) NOT NULL,
  PRIMARY KEY (queue_id, extra_id),
  FOREIGN KEY (queue_id) REFERENCES queue(id) ON DELETE CASCADE,
  FOREIGN KEY (extra_id) REFERENCES extras(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_queue_status ON queue(status);
CREATE INDEX idx_queue_checkin ON queue(checkin_at);

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Données de départ ----------
INSERT INTO services (id, name, duration_min, price_cents, sort_order) VALUES
  ('coupe',       'Coupe',          30, 2000, 1),
  ('barbe',       'Barbe',          15, 1200, 2),
  ('coupe_barbe', 'Coupe et barbe', 45, 2800, 3),
  ('enfant',      'Coupe enfant',   20, 1500, 4)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO extras (id, name, duration_min, price_cents, sort_order) VALUES
  ('shampoing',  'Shampooing',            5,  300, 1),
  ('serviette',  'Serviette chaude',     10,  800, 2),
  ('contour',    'Contour / traçage',     5,  500, 3),
  ('degrade',    'Dégradé américain',    10,  500, 4),
  ('coloration', 'Coloration',           25, 2000, 5),
  ('soin',       'Soin barbe à l\'huile', 10, 1000, 6)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO settings (`key`, value) VALUES
  ('notify_before_min', '30'),
  ('salon_name',        'Le Salon'),
  ('smtp_host',         ''),
  ('smtp_port',         '587'),
  ('smtp_user',         ''),
  ('smtp_pass',         ''),
  ('smtp_from',         '')
ON DUPLICATE KEY UPDATE `key` = VALUES(`key`);
