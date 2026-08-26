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

-- CREATE INDEX IF NOT EXISTS n'existe pas en syntaxe MySQL standard
-- (extension propre à MariaDB) - on vérifie via information_schema et
-- on n'exécute la création que si l'index n'existe pas déjà, pour que
-- ce script reste rejouable sans erreur sur MySQL comme sur MariaDB.
SET @idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'queue' AND index_name = 'idx_queue_status');
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_queue_status ON queue(status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'queue' AND index_name = 'idx_queue_checkin');
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_queue_checkin ON queue(checkin_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'queue' AND index_name = 'idx_queue_salon');
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_queue_salon ON queue(salon_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'barber_service_prices' AND column_name = 'duration_min');
SET @sql := IF(@c = 0, "ALTER TABLE barber_service_prices ADD COLUMN duration_min INT NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
ALTER TABLE barber_extra_prices MODIFY price_cents INT NULL;
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'barber_extra_prices' AND column_name = 'duration_min');
SET @sql := IF(@c = 0, "ALTER TABLE barber_extra_prices ADD COLUMN duration_min INT NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Vérification email à l'inscription : le compte reste marqué comme
-- non vérifié tant que le lien envoyé par email n'a pas été cliqué.
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'owners' AND column_name = 'email_verified');
SET @sql := IF(@c = 0, "ALTER TABLE owners ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'owners' AND column_name = 'verify_token');
SET @sql := IF(@c = 0, "ALTER TABLE owners ADD COLUMN verify_token VARCHAR(64) NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'owners' AND column_name = 'verify_token_expires');
SET @sql := IF(@c = 0, "ALTER TABLE owners ADD COLUMN verify_token_expires DATETIME NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
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
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'queue' AND column_name = 'paid_at');
SET @sql := IF(@c = 0, "ALTER TABLE queue ADD COLUMN paid_at DATETIME NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Un encaissement peut etre "mis de cote" (client parti chercher sa
-- carte, urgence...) sans etre perdu ni bloquer le suivant.
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'queue' AND column_name = 'payment_deferred_at');
SET @sql := IF(@c = 0, "ALTER TABLE queue ADD COLUMN payment_deferred_at DATETIME NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'gift_cards' AND column_name = 'items_json');
SET @sql := IF(@c = 0, "ALTER TABLE gift_cards ADD COLUMN items_json TEXT NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Code court a saisir par le beneficiaire (kiosk, futur systeme de
-- rendez-vous en ligne) - plus pratique a taper qu'un identifiant
-- technique. Nullable pour les cadeaux crees avant cette fonctionnalite.
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'gift_cards' AND column_name = 'code');
SET @sql := IF(@c = 0, "ALTER TABLE gift_cards ADD COLUMN code VARCHAR(12) NULL UNIQUE", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Reglages marketing (fidelite) au niveau de l'ENSEIGNE (owner_id),
-- pas du salon - coherent avec le cumul des points deja fait par
-- enseigne. Valeurs par defaut = comportement actuel (seuil 10,
-- -50% prestation, -20% produit).
CREATE TABLE IF NOT EXISTS owner_settings (
  owner_id CHAR(36) NOT NULL,
  `key` VARCHAR(100) NOT NULL,
  value TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_id, `key`),
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- La fidelite ne se declenche plus automatiquement : le coiffeur doit
-- explicitement activer la carte avec l'accord du client (email
-- requis pour la confirmation). Tant que activated_at est NULL, ce
-- client n'accumule aucun point, meme s'il revient plusieurs fois.
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'loyalty_accounts' AND column_name = 'activated_at');
SET @sql := IF(@c = 0, "ALTER TABLE loyalty_accounts ADD COLUMN activated_at DATETIME NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'loyalty_accounts' AND column_name = 'recipient_email');
SET @sql := IF(@c = 0, "ALTER TABLE loyalty_accounts ADD COLUMN recipient_email VARCHAR(255) NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Photo personnalisable pour chaque prestation/supplement/produit,
-- affichee sur le kiosk et en caisse a la place de l'icone par
-- defaut - meme mecanique que les photos de coiffeurs (data URL,
-- redimensionnee/recadree cote navigateur avant envoi).
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name = 'image_url');
SET @sql := IF(@c = 0, "ALTER TABLE services ADD COLUMN image_url LONGTEXT NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'extras' AND column_name = 'image_url');
SET @sql := IF(@c = 0, "ALTER TABLE extras ADD COLUMN image_url LONGTEXT NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'image_url');
SET @sql := IF(@c = 0, "ALTER TABLE products ADD COLUMN image_url LONGTEXT NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Cloture de caisse : fige une periode de ventes (depuis la
-- precedente cloture, ou depuis le debut si jamais fait), avec le
-- detail par mode de paiement pour pouvoir reconcilier. Une fois
-- creee, la periode est consideree "close" - les ventes suivantes
-- constituent une nouvelle periode ouverte.
CREATE TABLE IF NOT EXISTS cash_closings (
  id CHAR(36) PRIMARY KEY,
  salon_id CHAR(36) NOT NULL,
  period_start DATETIME NULL,
  period_end DATETIME NOT NULL,
  total_cents INT NOT NULL,
  sales_count INT NOT NULL,
  breakdown_json TEXT NULL,
  closed_by VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Coiffeur qui accepte les rendez-vous en ligne (en plus ou a la
-- place du sans-rdv). Un coiffeur "non" n'apparait jamais dans le
-- formulaire de reservation en ligne.
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'barbers' AND column_name = 'accepts_appointments');
SET @sql := IF(@c = 0, "ALTER TABLE barbers ADD COLUMN accepts_appointments TINYINT(1) NOT NULL DEFAULT 0", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rendez-vous pris en ligne. Reste dans cette table jusqu'a ce qu'il
-- soit "promu" (transforme en vraie entree de file le jour meme) -
-- promoted_queue_id garde le lien vers cette entree une fois cree.
CREATE TABLE IF NOT EXISTS appointments (
  id CHAR(36) PRIMARY KEY,
  salon_id CHAR(36) NOT NULL,
  barber_id CHAR(36) NULL,
  client_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  service_id CHAR(36) NOT NULL,
  scheduled_at DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  cancel_token VARCHAR(64) NULL,
  promoted_queue_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE,
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE SET NULL,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appointment_extras (
  appointment_id CHAR(36) NOT NULL,
  extra_id CHAR(36) NOT NULL,
  PRIMARY KEY (appointment_id, extra_id),
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (extra_id) REFERENCES extras(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Marque une entree de file comme venant d'un RDV (pas d'un check-in
-- kiosk classique) - permet a l'interface de savoir qu'il faut griser
-- "Commencer" tant que l'heure prevue n'est pas encore arrivee.
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'queue' AND column_name = 'is_appointment');
SET @sql := IF(@c = 0, "ALTER TABLE queue ADD COLUMN is_appointment TINYINT(1) NOT NULL DEFAULT 0", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Origine de l'entrée d'agenda : 'online' = pris en ligne via rdv.html,
-- 'walkin' = client arrivé sans RDV, synchronisé depuis le check-in
-- kiosk. Sert uniquement à l'affichage (badge dans le calendrier).
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'appointments' AND column_name = 'source');
SET @sql := IF(@c = 0, "ALTER TABLE appointments ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'online'", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rattrapage pour les rendez-vous déjà en base avant l'ajout de cette
-- colonne : ils ont tous hérité de la valeur par défaut 'online',
-- walk-ins compris. Un vrai RDV pris en ligne a TOUJOURS un
-- cancel_token (généré à la réservation, pour le lien d'annulation
-- envoyé par email) ; une entrée synchronisée depuis le check-in
-- kiosk n'en a jamais — distinction fiable, sans ambiguïté, quelle que
-- soit la date de création de la ligne.
UPDATE appointments SET source = 'walkin' WHERE cancel_token IS NULL;

-- Coiffeur exclu du kiosk (visible uniquement sur le formulaire de
-- rendez-vous en ligne). A l'inverse, accepts_appointments=0 exclut
-- deja du formulaire en ligne (visible uniquement sur le kiosk).
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'barbers' AND column_name = 'kiosk_hidden');
SET @sql := IF(@c = 0, "ALTER TABLE barbers ADD COLUMN kiosk_hidden TINYINT(1) NOT NULL DEFAULT 0", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Le mode "disponible partout sans l'avoir choisi" (accepts_appointments=1
-- ET kiosk_hidden=0 en même temps, l'ancien réglage par défaut) est
-- retiré : un coiffeur doit désormais choisir explicitement un seul
-- mode (RDV en ligne OU sans rendez-vous). Les coiffeurs qui se
-- trouvaient dans cet état ambigu basculent en "masqué partout"
-- (accepts_appointments=0, kiosk_hidden=1) jusqu'à ce qu'un mode soit
-- choisi - décision confirmée explicitement, pas un effet de bord.
UPDATE barbers SET accepts_appointments = 0, kiosk_hidden = 1 WHERE accepts_appointments = 1 AND kiosk_hidden = 0;

-- Pauses (ex: déjeuner) : comme barber_schedules, mais plusieurs pauses
-- possibles par jour. Bloquent à la fois les RDV en ligne (dans
-- computeSlotsForBarber) ET la disponibilité au kiosk (on_break_now).
CREATE TABLE IF NOT EXISTS barber_breaks (
  id CHAR(36) PRIMARY KEY,
  barber_id CHAR(36) NOT NULL,
  weekday TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'barber_breaks' AND index_name = 'idx_barber_breaks_barber_day');
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_barber_breaks_barber_day ON barber_breaks(barber_id, weekday)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Compte client (espace "compte.html") : rattaché à l'ENSEIGNE
-- (owner_id), pas à un salon précis - même logique que les points de
-- fidélité (loyalty_accounts), un client va parfois dans un salon,
-- parfois dans un autre du même propriétaire.
CREATE TABLE IF NOT EXISTS clients (
  id CHAR(36) PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NULL,
  password_hash VARCHAR(255) NOT NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  verify_token VARCHAR(64) NULL,
  verify_token_expires DATETIME NULL,
  reset_token VARCHAR(64) NULL,
  reset_token_expires DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_owner_client_email (owner_id, email),
  FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Jeton de session du compte client (porté par le navigateur via
-- X-Client-Token), volontairement simple - pas de JWT, juste un jeton
-- aléatoire opaque comme le reste du projet (cf. impersonation.js).
CREATE TABLE IF NOT EXISTS client_sessions (
  token VARCHAR(64) PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'client_sessions' AND index_name = 'idx_client_sessions_client');
SET @sql := IF(@idx = 0, 'CREATE INDEX idx_client_sessions_client ON client_sessions(client_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Note que le CLIENT ajoute lui-même à SON rendez-vous au moment de la
-- réservation (allergie, préférence...) - distincte de la note privée
-- que le coiffeur écrit sur la fiche client (client_notes), qui reste
-- inchangée. Visible des deux côtés : dans le détail dépliable du RDV
-- côté client (compte.html) et dans le tiroir client de l'agenda côté
-- admin (dashboard.html).
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'appointments' AND column_name = 'client_note');
SET @sql := IF(@c = 0, "ALTER TABLE appointments ADD COLUMN client_note VARCHAR(500) NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Rappel par email envoyé N minutes avant l'heure du RDV (réglage
-- notify_before_min), mécanisme SÉPARÉ du "votre tour approche" de la
-- file d'attente physique (qui reste basé sur estimated_wait_min, une
-- estimation dynamique de position en file - inadaptée à un rappel
-- avant un horaire fixé à l'avance).
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'appointments' AND column_name = 'reminder_sent');
SET @sql := IF(@c = 0, "ALTER TABLE appointments ADD COLUMN reminder_sent TINYINT(1) NOT NULL DEFAULT 0", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Changement de modèle demandé explicitement (pour l'instant) : la
-- fidélité et les comptes client passent de "partagés pour toute
-- l'enseigne" (owner_id) à "propres à chaque salon" (salon_id) - un
-- client qui va dans un 2e salon de la même enseigne y suit le
-- parcours naturel (nouveau compte, nouvelle carte), sans lien avec
-- son historique dans le 1er salon.
--
-- Backfill des lignes existantes : faute d'avoir toujours su via quel
-- salon précis un compte/une carte a été créé(e), on rattache au
-- salon le plus ancien de l'enseigne concernée - approximation
-- raisonnable, la quasi-totalité des données existantes provient d'un
-- seul salon actif par enseigne à ce jour.

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'loyalty_accounts' AND column_name = 'salon_id');
SET @sql := IF(@c = 0, "ALTER TABLE loyalty_accounts ADD COLUMN salon_id CHAR(36) NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE loyalty_accounts la
SET la.salon_id = (SELECT s.id FROM salons s WHERE s.owner_id = la.owner_id ORDER BY s.created_at ASC LIMIT 1)
WHERE la.salon_id IS NULL;

SET @idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'loyalty_accounts' AND index_name = 'uniq_owner_client');
-- L'index à supprimer sert aussi de support à la contrainte de clé
-- étrangère sur owner_id (colonne conservée pour l'historique, mais
-- plus utilisée) - MySQL refuse de le supprimer sans index de
-- remplacement sur owner_id seul, donc on le crée juste avant.
SET @idxfk := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'loyalty_accounts' AND index_name = 'idx_loyalty_owner_id');
SET @sql := IF(@idx > 0 AND @idxfk = 0, 'CREATE INDEX idx_loyalty_owner_id ON loyalty_accounts(owner_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(@idx > 0, 'ALTER TABLE loyalty_accounts DROP INDEX uniq_owner_client', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx2 := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'loyalty_accounts' AND index_name = 'uniq_salon_client');
SET @sql := IF(@idx2 = 0, 'ALTER TABLE loyalty_accounts ADD UNIQUE KEY uniq_salon_client (salon_id, client_key)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'clients' AND column_name = 'salon_id');
SET @sql := IF(@c = 0, "ALTER TABLE clients ADD COLUMN salon_id CHAR(36) NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE clients c
SET c.salon_id = (SELECT s.id FROM salons s WHERE s.owner_id = c.owner_id ORDER BY s.created_at ASC LIMIT 1)
WHERE c.salon_id IS NULL;

SET @idx3 := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'clients' AND index_name = 'uniq_owner_client_email');
SET @idxfk2 := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'clients' AND index_name = 'idx_clients_owner_id');
SET @sql := IF(@idx3 > 0 AND @idxfk2 = 0, 'CREATE INDEX idx_clients_owner_id ON clients(owner_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql := IF(@idx3 > 0, 'ALTER TABLE clients DROP INDEX uniq_owner_client_email', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx4 := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'clients' AND index_name = 'uniq_salon_client_email');
SET @sql := IF(@idx4 = 0, 'ALTER TABLE clients ADD UNIQUE KEY uniq_salon_client_email (salon_id, email)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Couleur personnalisable de chaque coiffeur (agenda RDV) - si NULL,
-- une couleur stable est dérivée de son id côté client (jamais de sa
-- position dans une liste triée, qui décalerait les couleurs de tous
-- les autres coiffeurs à chaque ajout/suppression).
SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'barbers' AND column_name = 'color');
SET @sql := IF(@c = 0, "ALTER TABLE barbers ADD COLUMN color VARCHAR(9) NULL", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Horaires généraux du salon (Réglages > Calendrier) - un modèle par
-- défaut global, indépendant des horaires propres à chaque coiffeur.
CREATE TABLE IF NOT EXISTS salon_schedules (
  id CHAR(36) PRIMARY KEY,
  salon_id CHAR(36) NOT NULL,
  weekday TINYINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uniq_salon_day (salon_id, weekday),
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fermetures exceptionnelles du salon entier (férié, fermeture
-- urgente...) - distinct des congés individuels de chaque coiffeur.
CREATE TABLE IF NOT EXISTS salon_closures (
  id CHAR(36) PRIMARY KEY,
  salon_id CHAR(36) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Crédits du chatbot IA (Réglages > toujours 100 gratuits, remis à
-- zéro chaque mois - period_month au format 'YYYY-MM'. Le reset est
-- fait "à la volée" au moment de la première question du mois, pas
-- par une tâche planifiée séparée - plus simple et robuste.
CREATE TABLE IF NOT EXISTS ai_chat_credits (
  salon_id CHAR(36) PRIMARY KEY,
  credits_remaining INT NOT NULL DEFAULT 10,
  period_month CHAR(7) NOT NULL,
  ai_enabled TINYINT(1) NOT NULL DEFAULT 1,
  monthly_credit_limit INT NOT NULL DEFAULT 10,
  unlimited TINYINT(1) NOT NULL DEFAULT 0,
  questions_used_this_month INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (salon_id) REFERENCES salons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Colonnes ajoutées après coup (activation/désactivation par salon +
-- limite de crédits personnalisable, gérées par le super admin) - le
-- CREATE TABLE ci-dessus suffit pour une base neuve, ce bloc rattrape
-- les bases existantes qui avaient déjà la table sans ces 2 colonnes.
SET @c1 := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_chat_credits' AND column_name = 'ai_enabled');
SET @sql := IF(@c1 = 0, 'ALTER TABLE ai_chat_credits ADD COLUMN ai_enabled TINYINT(1) NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c2 := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_chat_credits' AND column_name = 'monthly_credit_limit');
SET @sql := IF(@c2 = 0, 'ALTER TABLE ai_chat_credits ADD COLUMN monthly_credit_limit INT NOT NULL DEFAULT 10', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Gratuit/illimité par salon (ignore la limite de crédits) + compteur
-- d'usage réel qui continue d'avancer même en illimité (pour les
-- statistiques du super admin, indépendant du système de blocage).
SET @c3 := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_chat_credits' AND column_name = 'unlimited');
SET @sql := IF(@c3 = 0, 'ALTER TABLE ai_chat_credits ADD COLUMN unlimited TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c4 := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_chat_credits' AND column_name = 'questions_used_this_month');
SET @sql := IF(@c4 = 0, 'ALTER TABLE ai_chat_credits ADD COLUMN questions_used_this_month INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Clés d'API d'automatisation (n8n, projets futurs...) - jamais la
-- valeur en clair stockée, seulement une empreinte à sens unique
-- (SHA-256) : même en cas de fuite de la base, aucune vraie clé n'en
-- est extractible. La clé en clair n'est montrée qu'une seule fois,
-- au moment de sa génération.
CREATE TABLE IF NOT EXISTS api_keys (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  key_preview VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  last_used_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migration en douceur de la clé déjà en service (AUTOMATION_API_KEY,
-- utilisée par les workflows n8n existants) - jamais changée, juste
-- enregistrée ici comme "clé historique" pour rentrer dans le
-- nouveau système de gestion sans rien casser.
INSERT INTO api_keys (id, name, key_hash, key_preview, created_at)
SELECT UUID(), 'Clé historique (n8n)', '37fd11ef357895fedc4726d7367cae4ce9a4e285946eaed4d0981ba0d01bc22f', '735d830b...', NOW()
WHERE NOT EXISTS (SELECT 1 FROM api_keys WHERE key_hash = '37fd11ef357895fedc4726d7367cae4ce9a4e285946eaed4d0981ba0d01bc22f');
