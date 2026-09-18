/*
 * Jeu de données complet pour les tests UI/UX d'Atelier Nova.
 *
 * Pré-requis : npm run seed:uiux-auth
 * Les identifiants fixes ci-dessous permettent de rejouer la commande sans
 * créer de doublons. Seules les lignes de démonstration de ce salon sont
 * créées ou mises à jour.
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/db');
const { hashPassword } = require('../src/lib/password');

const DEMO_EMAIL = 'demo@atelier-nova.test';
const ids = {
  barbers: ['a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000003'],
  services: ['a2000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000004'],
  extras: ['a3000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000003'],
  products: ['a4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000003'],
  queue: ['a5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000003', 'a5000000-0000-4000-8000-000000000004', 'a5000000-0000-4000-8000-000000000005'],
  appointments: ['a6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002'],
  sales: ['a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002'],
  gift: 'a8000000-0000-4000-8000-000000000001',
  loyalty: 'a9000000-0000-4000-8000-000000000001',
  client: 'aa000000-0000-4000-8000-000000000001'
};

async function upsert(connection, sql, values) {
  await connection.query(sql, values);
}

async function seed() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[salon]] = await connection.query(
      `SELECT s.id, s.owner_id FROM salons s
       JOIN owners o ON o.id = s.owner_id WHERE o.email = ? AND s.slug = 'atelier-nova'`,
      [DEMO_EMAIL]
    );
    if (!salon) throw new Error('Compte UI/UX introuvable. Lancez d’abord : npm run seed:uiux-auth');

    const barbers = [
      [ids.barbers[0], salon.id, 'Nadia', 1, 1, '2580', 1, 1, '#A855F7'],
      [ids.barbers[1], salon.id, 'Thomas', 1, 2, '4312', 0, 0, '#0EA5E9'],
      [ids.barbers[2], salon.id, 'Inès', 1, 3, '9076', 0, 0, '#F97316']
    ];
    for (const row of barbers) {
      await upsert(connection,
        `INSERT INTO barbers (id, salon_id, name, active, sort_order, pin_code, accepts_appointments, kiosk_hidden, color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), active = VALUES(active), sort_order = VALUES(sort_order),
           pin_code = VALUES(pin_code), accepts_appointments = VALUES(accepts_appointments),
           kiosk_hidden = VALUES(kiosk_hidden), color = VALUES(color)`, row);
    }

    for (const barberId of ids.barbers) {
      for (let weekday = 1; weekday <= 6; weekday++) {
        await upsert(connection,
          `INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active)
           VALUES (UUID(), ?, ?, '09:00:00', '18:00:00', 1)
           ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time), active = 1`,
          [barberId, weekday]);
      }
    }
    await upsert(connection,
      `INSERT INTO barber_breaks (id, barber_id, weekday, start_time, end_time, active)
       VALUES ('ab000000-0000-4000-8000-000000000001', ?, 1, '13:00:00', '14:00:00', 1)
       ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time), active = 1`, [ids.barbers[0]]);

    const services = [
      [ids.services[0], salon.id, 'Coupe signature', 45, 3200, 1],
      [ids.services[1], salon.id, 'Coupe & barbe', 60, 4500, 2],
      [ids.services[2], salon.id, 'Barbe express', 25, 1900, 3],
      [ids.services[3], salon.id, 'Coupe enfant', 30, 2200, 4]
    ];
    for (const row of services) await upsert(connection,
      `INSERT INTO services (id, salon_id, name, duration_min, price_cents, active, sort_order)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), duration_min = VALUES(duration_min), price_cents = VALUES(price_cents), active = 1, sort_order = VALUES(sort_order)`, row);

    const extras = [
      [ids.extras[0], salon.id, 'Shampooing relaxant', 10, 600, 1],
      [ids.extras[1], salon.id, 'Contour précis', 10, 800, 2],
      [ids.extras[2], salon.id, 'Soin barbe premium', 15, 1200, 3]
    ];
    for (const row of extras) await upsert(connection,
      `INSERT INTO extras (id, salon_id, name, duration_min, price_cents, active, sort_order)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), duration_min = VALUES(duration_min), price_cents = VALUES(price_cents), active = 1, sort_order = VALUES(sort_order)`, row);

    const products = [
      [ids.products[0], salon.id, 'Cire coiffante mate', 1800, 'Coiffage', 1, 1, 12],
      [ids.products[1], salon.id, 'Huile à barbe', 2200, 'Barbe', 2, 1, 8],
      [ids.products[2], salon.id, 'Boisson fraîche', 250, 'Boissons', 3, 1, 24]
    ];
    for (const row of products) await upsert(connection,
      `INSERT INTO products (id, salon_id, name, price_cents, category, active, sort_order, stock_enabled, stock_quantity)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), price_cents = VALUES(price_cents), category = VALUES(category),
         active = 1, sort_order = VALUES(sort_order), stock_enabled = VALUES(stock_enabled), stock_quantity = VALUES(stock_quantity)`, row);

    const settings = {
      salon_name: 'Atelier Nova', timezone: 'Europe/Paris', notify_before_min: '30',
      accent_color: '#7C3AED', caisse_inactivity_sec: '90', caisse_reopen_hour: '08:00'
    };
    for (const [key, value] of Object.entries(settings)) await upsert(connection,
      'INSERT INTO settings (salon_id, `key`, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()',
      [salon.id, key, value]);

    for (let weekday = 1; weekday <= 6; weekday++) await upsert(connection,
      `INSERT INTO salon_schedules (id, salon_id, weekday, start_time, end_time, active)
       VALUES (UUID(), ?, ?, '09:00:00', '18:00:00', 1)
       ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time), active = 1`, [salon.id, weekday]);

    await connection.query('DELETE FROM queue_extras WHERE queue_id IN (?)', [ids.queue]);
    const queue = [
      [ids.queue[0], 'Alexandre Morel', 'alexandre.morel@demo.test', '0601020304', ids.services[1], ids.barbers[1], 'in_progress', 'DATE_SUB(NOW(), INTERVAL 35 MINUTE)', 'DATE_SUB(NOW(), INTERVAL 15 MINUTE)', null, 0, 0, 60, 5300, null, null],
      [ids.queue[1], 'Léa Dupont', 'lea.dupont@demo.test', '0611223344', ids.services[0], ids.barbers[2], 'waiting', 'DATE_SUB(NOW(), INTERVAL 12 MINUTE)', null, null, 1, 20, 55, 4000, null, null],
      [ids.queue[2], 'Karim Benali', 'karim.benali@demo.test', '0622334455', ids.services[2], null, 'waiting', 'DATE_SUB(NOW(), INTERVAL 7 MINUTE)', null, null, 2, 35, 25, 1900, null, null],
      [ids.queue[3], 'Sophie Laurent', 'sophie.laurent@demo.test', '0633445566', ids.services[3], ids.barbers[2], 'done', 'DATE_SUB(NOW(), INTERVAL 90 MINUTE)', 'DATE_SUB(NOW(), INTERVAL 70 MINUTE)', 'DATE_SUB(NOW(), INTERVAL 40 MINUTE)', null, null, 30, 2200, null, null],
      [ids.queue[4], 'Julien Robert', 'julien.robert@demo.test', '0644556677', ids.services[0], ids.barbers[1], 'done', 'DATE_SUB(NOW(), INTERVAL 180 MINUTE)', 'DATE_SUB(NOW(), INTERVAL 165 MINUTE)', 'DATE_SUB(NOW(), INTERVAL 120 MINUTE)', null, null, 45, 3200, 'DATE_SUB(NOW(), INTERVAL 115 MINUTE)', null]
    ];
    for (const row of queue) {
      const [id, name, email, phone, serviceId, barberId, status, checkin, start, end, position, wait, duration, price, paid, deferred] = row;
      await connection.query(
        `INSERT INTO queue (id, salon_id, client_name, email, phone, service_id, barber_id, status, checkin_at, start_at, end_at, queue_position, estimated_wait_min, total_duration_min, total_price_cents, paid_at, payment_deferred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${checkin}, ${start || 'NULL'}, ${end || 'NULL'}, ?, ?, ?, ?, ${paid || 'NULL'}, ${deferred || 'NULL'})
         ON DUPLICATE KEY UPDATE client_name = VALUES(client_name), email = VALUES(email), phone = VALUES(phone), service_id = VALUES(service_id), barber_id = VALUES(barber_id), status = VALUES(status), checkin_at = VALUES(checkin_at), start_at = VALUES(start_at), end_at = VALUES(end_at), queue_position = VALUES(queue_position), estimated_wait_min = VALUES(estimated_wait_min), total_duration_min = VALUES(total_duration_min), total_price_cents = VALUES(total_price_cents), paid_at = VALUES(paid_at), payment_deferred_at = VALUES(payment_deferred_at)`,
        [id, salon.id, name, email, phone, serviceId, barberId, status, position, wait, duration, price]
      );
    }
    await connection.query('INSERT INTO queue_extras (queue_id, extra_id) VALUES (?, ?), (?, ?), (?, ?)', [ids.queue[0], ids.extras[0], ids.queue[1], ids.extras[1], ids.queue[2], ids.extras[2]]);

    await connection.query('DELETE FROM appointment_extras WHERE appointment_id IN (?)', [ids.appointments]);
    const appointments = [
      [ids.appointments[0], salon.id, ids.barbers[0], 'Maya Ravel', 'maya.ravel@demo.test', '0655667788', ids.services[0], 'DATE_ADD(CURDATE(), INTERVAL 1 DAY) + INTERVAL 10 HOUR', 'confirmed', 'demo-cancel-maya', 'Préfère une coupe légère sur les côtés.'],
      [ids.appointments[1], salon.id, ids.barbers[0], 'Nicolas Petit', 'nicolas.petit@demo.test', '0666778899', ids.services[1], 'DATE_ADD(CURDATE(), INTERVAL 2 DAY) + INTERVAL 14 HOUR', 'confirmed', 'demo-cancel-nicolas', 'Allergie signalée aux produits parfumés.']
    ];
    for (const row of appointments) {
      const [id, salonId, barberId, name, email, phone, serviceId, scheduled, status, token, note] = row;
      await connection.query(
        `INSERT INTO appointments (id, salon_id, barber_id, client_name, email, phone, service_id, scheduled_at, status, cancel_token, client_note, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ${scheduled}, ?, ?, ?, 'online')
         ON DUPLICATE KEY UPDATE barber_id = VALUES(barber_id), client_name = VALUES(client_name), email = VALUES(email), phone = VALUES(phone), service_id = VALUES(service_id), scheduled_at = VALUES(scheduled_at), status = VALUES(status), cancel_token = VALUES(cancel_token), client_note = VALUES(client_note), source = 'online'`,
        [id, salonId, barberId, name, email, phone, serviceId, status, token, note]);
    }
    await connection.query('INSERT INTO appointment_extras (appointment_id, extra_id) VALUES (?, ?), (?, ?)', [ids.appointments[0], ids.extras[0], ids.appointments[1], ids.extras[2]]);

    const clientPassword = await hashPassword('Client2026!');
    await upsert(connection,
      `INSERT INTO clients (id, owner_id, salon_id, name, email, phone, password_hash, email_verified)
       VALUES (?, ?, ?, 'Léa Dupont', 'lea.dupont@demo.test', '0611223344', ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), password_hash = VALUES(password_hash), email_verified = 1, verify_token = NULL, verify_token_expires = NULL`,
      [ids.client, salon.owner_id, salon.id, clientPassword]);
    await upsert(connection,
      `INSERT INTO loyalty_accounts (id, owner_id, salon_id, client_key, client_name, points, rewards_available, activated_at, recipient_email)
       VALUES (?, ?, ?, 'lea.dupont@demo.test', 'Léa Dupont', 8, 0, DATE_SUB(NOW(), INTERVAL 30 DAY), 'lea.dupont@demo.test')
       ON DUPLICATE KEY UPDATE client_name = VALUES(client_name), points = VALUES(points), rewards_available = VALUES(rewards_available), activated_at = VALUES(activated_at), recipient_email = VALUES(recipient_email)`,
      [ids.loyalty, salon.owner_id, salon.id]);
    await upsert(connection,
      `INSERT INTO client_notes (id, salon_id, client_key, note) VALUES ('ac000000-0000-4000-8000-000000000001', ?, 'lea.dupont@demo.test', 'Préférence : dégradé doux et sans parfum fort.')
       ON DUPLICATE KEY UPDATE note = VALUES(note), updated_at = NOW()`, [salon.id]);

    await connection.query('DELETE FROM sale_items WHERE sale_id IN (?)', [ids.sales]);
    const sales = [
      [ids.sales[0], salon.id, ids.barbers[1], 'cb', 2050, 'DATE_SUB(NOW(), INTERVAL 2 DAY)'],
      [ids.sales[1], salon.id, ids.barbers[2], 'especes', 2200, 'DATE_SUB(NOW(), INTERVAL 1 DAY)']
    ];
    for (const [id, salonId, barberId, payment, total, created] of sales) await connection.query(
      `INSERT INTO sales (id, salon_id, barber_id, payment_method, total_price_cents, created_at) VALUES (?, ?, ?, ?, ?, ${created})
       ON DUPLICATE KEY UPDATE barber_id = VALUES(barber_id), payment_method = VALUES(payment_method), total_price_cents = VALUES(total_price_cents), created_at = VALUES(created_at)`,
      [id, salonId, barberId, payment, total]);
    await connection.query(
      `INSERT INTO sale_items (id, sale_id, item_type, item_id, item_name, unit_price_cents, quantity) VALUES
       ('ad000000-0000-4000-8000-000000000001', ?, 'product', ?, 'Cire coiffante mate', 1800, 1),
       ('ad000000-0000-4000-8000-000000000002', ?, 'product', ?, 'Boisson fraîche', 250, 1),
       ('ad000000-0000-4000-8000-000000000003', ?, 'product', ?, 'Huile à barbe', 2200, 1)`,
      [ids.sales[0], ids.products[0], ids.sales[0], ids.products[2], ids.sales[1], ids.products[1]]);
    await upsert(connection,
      `INSERT INTO gift_cards (id, salon_id, sale_id, recipient_name, recipient_phone, recipient_email, amount_cents, items_json, code)
       VALUES (?, ?, ?, 'Emma Durand', '0677889900', 'emma.durand@demo.test', 3200, '[{"item_name":"Coupe signature","quantity":1}]', 'NOVA2026')
       ON DUPLICATE KEY UPDATE recipient_name = VALUES(recipient_name), recipient_phone = VALUES(recipient_phone), recipient_email = VALUES(recipient_email), amount_cents = VALUES(amount_cents), items_json = VALUES(items_json), code = VALUES(code), used_at = NULL, used_queue_id = NULL`,
      [ids.gift, salon.id, ids.sales[1]]);

    await connection.commit();
    console.log('Jeu UI/UX prêt : 3 coiffeurs, 4 prestations, 3 options, 3 produits, 5 clients en file, 2 rendez-vous, ventes, bon cadeau et fidélité.');
    console.log('Compte client fictif : lea.dupont@demo.test / Client2026!');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  seed().catch((error) => {
    console.error('Impossible de préparer les données UI/UX : ' + error.message);
    process.exitCode = 1;
  }).finally(() => pool.end());
}

module.exports = { seed };
