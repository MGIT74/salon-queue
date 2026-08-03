-- ============================================================
--  Salon — file d'attente temps réel — schéma MySQL (multi-salon)
--  À exécuter une fois sur une base VIERGE.
--  Pour migrer une base existante (deploiement mono-salon precedent),
--  voir sql/migration-multi-salon.sql a la place.
-- ============================================================

CREATE TABLE IF NOT EXISTS owners (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NULL,
  email VARCHAR(255) UNIQUE NULL,
  password_hash VARCHAR(255) NULL,
  admin_password VARCHAR(255) NULL,
  reset_token VARCHAR(64) NULL,
  reset_token_expires DATETIME NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salons (
  id CHAR(36) PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  admin_password VARCHAR(255) NULL,
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

-- Congés / absences ponctuelles (distinct des horaires hebdomadaires
-- récurrents) : une période où le coiffeur ne travaille pas du tout.
CREATE TABLE IF NOT EXISTS barber_leaves (
  id CHAR(36) PRIMARY KEY,
  barber_id CHAR(36) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Par défaut, un coiffeur fait TOUTES les prestations/suppléments du
-- salon. Ces tables ne listent que les EXCLUSIONS explicites (opt-out),
-- pour qu'un nouveau coiffeur ne se retrouve jamais "sans rien à faire"
-- tant que personne n'a rien configuré.
CREATE TABLE IF NOT EXISTS barber_service_exclusions (
  barber_id CHAR(36) NOT NULL,
  service_id VARCHAR(60) NOT NULL,
  PRIMARY KEY (barber_id, service_id),
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS barber_extra_exclusions (
  barber_id CHAR(36) NOT NULL,
  extra_id VARCHAR(60) NOT NULL,
  PRIMARY KEY (barber_id, extra_id),
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
  value LONGTEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (salon_id, `key`),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Réglages globaux de la plateforme (pas liés à un salon en particulier),
-- ex: SMTP utilisé pour les emails envoyés par la plateforme elle-même
-- (réinitialisation de mot de passe...), distinct du SMTP par salon.
CREATE TABLE IF NOT EXISTS platform_settings (
  `key` VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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

-- Notes sur un client (préférences, habitudes...), pour qu'un coiffeur
-- retrouve l'info la prochaine fois que ce client revient. Rattachées
-- par une clé calculée (email, sinon téléphone, sinon nom) plutôt qu'à
-- une fiche client dédiée — il n'en existe pas dans ce modèle de données.
CREATE TABLE IF NOT EXISTS client_notes (
  id CHAR(36) PRIMARY KEY,
  salon_id CHAR(36) NOT NULL,
  client_key VARCHAR(255) NOT NULL,
  note TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_salon_client (salon_id, client_key),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Prix personnalisé d'un coiffeur pour une prestation/un supplément
-- précis, qui remplace le prix par défaut du catalogue quand défini.
-- Pas de ligne = ce coiffeur applique le tarif par défaut.
CREATE TABLE IF NOT EXISTS barber_service_prices (
  barber_id CHAR(36) NOT NULL,
  service_id CHAR(36) NOT NULL,
  price_cents INT NOT NULL,
  PRIMARY KEY (barber_id, service_id),
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS barber_extra_prices (
  barber_id CHAR(36) NOT NULL,
  extra_id CHAR(36) NOT NULL,
  price_cents INT NOT NULL,
  PRIMARY KEY (barber_id, extra_id),
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
  FOREIGN KEY (extra_id) REFERENCES extras(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ajout de la durée personnalisée aux tarifs par coiffeur (prix ET durée
-- deviennent chacun optionnels indépendamment - une ligne peut ne
-- personnaliser que l'un des deux).
ALTER TABLE barber_service_prices MODIFY price_cents INT NULL;
ALTER TABLE barber_service_prices ADD COLUMN IF NOT EXISTS duration_min INT NULL;
ALTER TABLE barber_extra_prices MODIFY price_cents INT NULL;
ALTER TABLE barber_extra_prices ADD COLUMN IF NOT EXISTS duration_min INT NULL;

-- Vérification email à l'inscription : le compte reste marqué comme
-- non vérifié tant que le lien envoyé par email n'a pas été cliqué.
ALTER TABLE owners ADD COLUMN IF NOT EXISTS email_verified TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS verify_token VARCHAR(64) NULL;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS verify_token_expires DATETIME NULL;
-- Important : les comptes déjà créés avant cette fonctionnalité n'ont
-- jamais eu à confirmer quoi que ce soit - on les marque vérifiés pour
-- ne pas les bloquer soudainement à la connexion.
UPDATE owners SET email_verified = 1 WHERE verify_token IS NULL AND verify_token_expires IS NULL;

-- Catalogue de PRODUITS vendus en caisse (boissons, shampoings a
-- emporter, etc.) - distinct des prestations/supplements car sans duree.
CREATE TABLE IF NOT EXISTS products (
  id CHAR(36) PRIMARY KEY,
  salon_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  price_cents INT NOT NULL,
  category VARCHAR(100) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Une vente en caisse (independante de la file d'attente) : qui l'a
-- faite, comment elle a ete payee, pour quel montant total.
CREATE TABLE IF NOT EXISTS sales (
  id CHAR(36) PRIMARY KEY,
  salon_id CHAR(36) NOT NULL,
  barber_id CHAR(36) NULL,
  payment_method VARCHAR(30) NOT NULL,
  total_price_cents INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE,
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Chaque ligne d'une vente. Le nom et le prix sont "photographies" au
-- moment de la vente (item_name/unit_price_cents), pour que l'historique
-- reste correct meme si le catalogue change ensuite.
CREATE TABLE IF NOT EXISTS sale_items (
  id CHAR(36) PRIMARY KEY,
  sale_id CHAR(36) NOT NULL,
  item_type VARCHAR(20) NOT NULL,
  item_id CHAR(36) NULL,
  item_name VARCHAR(255) NOT NULL,
  unit_price_cents INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Une coupe terminee ('done') reste en attente d'encaissement tant que
-- paid_at est NULL - c'est la caisse qui la marque payee.
ALTER TABLE queue ADD COLUMN IF NOT EXISTS paid_at DATETIME NULL;

-- Un encaissement peut etre "mis de cote" (client parti chercher sa
-- carte, urgence...) sans etre perdu ni bloquer le suivant.
ALTER TABLE queue ADD COLUMN IF NOT EXISTS payment_deferred_at DATETIME NULL;

-- Bon cadeau : achete d'avance pour un beneficiaire precis, reconnu
-- automatiquement quand celui-ci passe par le chemin normal (kiosk ->
-- file -> caisse). L'argent est deja compte a l'achat (sale_id lie a
-- la vente d'origine) - l'utilisation ne recree jamais une 2e vente.
CREATE TABLE IF NOT EXISTS gift_cards (
  id CHAR(36) PRIMARY KEY,
  salon_id CHAR(36) NOT NULL,
  sale_id CHAR(36) NOT NULL,
  recipient_name VARCHAR(255) NOT NULL,
  recipient_phone VARCHAR(50) NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  amount_cents INT NOT NULL,
  used_at DATETIME NULL,
  used_queue_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fidelite : 1 point par passage PAYE (peu importe le salon de
-- l'enseigne, cumule au niveau du PROPRIETAIRE). Tous les 10 points,
-- une recompense s'ajoute au compteur - utilisable a partir du
-- PROCHAIN passage (pas celui qui vient de faire atteindre 10).
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id CHAR(36) PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  client_key VARCHAR(255) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  points INT NOT NULL DEFAULT 0,
  rewards_available INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_owner_client (owner_id, client_key),
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Detail des articles compris dans un bon cadeau (pas seulement le
-- montant total), pour que le coiffeur sache exactement quoi remettre
-- au beneficiaire au moment d'utiliser le cadeau (ex: un produit
-- achete en plus de la coupe, que le kiosk ne connait pas).
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS items_json TEXT NULL;

-- Code court a saisir par le beneficiaire (kiosk, futur systeme de
-- rendez-vous en ligne) - plus pratique a taper qu'un identifiant
-- technique. Nullable pour les cadeaux crees avant cette fonctionnalite.
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS code VARCHAR(12) NULL UNIQUE;
