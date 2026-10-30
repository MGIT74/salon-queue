// RDV en ligne SANS compte : l'email est vérifié par un code à 6 chiffres avant d'enregistrer le RDV.
// Code valable 60 s, 3 codes en tout (le premier + 2 renvois), 3 essais par code. Le créneau est gardé
// pendant la validité du code, puis libéré. Compte connecté (email déjà vérifié) : pas de code.
// Vraie base + vrai serveur (port 3999) ; les emails partent vers un petit serveur SMTP du test.
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path'), fs = require('fs'), net = require('net'), crypto = require('crypto');
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const SMTP_PORT = 2526;
const PUB = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test' };
const ADMIN = Object.assign({ 'X-Admin-Password': 'adminpw' }, PUB);
const call = async (method, p, body, h) => { const r = await fetch(BASE + p, { method, headers: h || PUB, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + String(x).slice(0, 240) + ']' : '')); };

// Mini serveur SMTP : garde le texte de chaque email reçu.
const mails = [];
const smtp = net.createServer((sock) => {
  let buf = '', inData = false;
  sock.write('220 test\r\n');
  sock.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while (true) {
      if (inData) {
        i = buf.indexOf('\r\n.\r\n'); if (i < 0) break;
        mails.push(buf.slice(0, i)); buf = buf.slice(i + 5); inData = false; sock.write('250 ok\r\n'); continue;
      }
      i = buf.indexOf('\r\n'); if (i < 0) break;
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250 test\r\n');
      else if (cmd === 'DATA') { inData = true; sock.write('354 go\r\n'); }
      else if (cmd === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 ok\r\n');
    }
  });
  sock.on('error', () => {});
});
const decode = (raw) => raw.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
const lastCode = () => { const m = decode(mails[mails.length - 1] || '').match(/Subject: =\?UTF-8\?Q\?(\d{3})_(\d{3})|Subject: (\d{3}) (\d{3})/); return m ? (m[1] || m[3]) + (m[2] || m[4]) : null; };
const waitMail = async (n) => { for (let k = 0; k < 40 && mails.length < n; k++) await new Promise((r) => setTimeout(r, 50)); };

const d = new Date(Date.now() + 43 * 864e5);
const DAY = d.toISOString().slice(0, 10);
const EMAIL = 'karim159@client.test';
const booking = (time, extra) => Object.assign({ client_name: 'T159 Karim', email: EMAIL, phone: '0612345678', service_id: 'sv1', extras: [], products: [], barber_id: 'b1', date: DAY, time, base_url: 'http://x.test/rdv.html' }, extra || {});
const slotsB1 = async () => (await call('GET', '/api/appointments/availability?date=' + DAY + '&service_id=sv1&barber_id=b1')).data.slots || [];
const hasSlot = (slots, t) => slots.some((s) => (s.time || s) === t);
const expire = (id) => pool.query('UPDATE booking_verifications SET expires_at = NOW() - INTERVAL 1 SECOND WHERE id = ?', [id]);

(async () => {
  await new Promise((r) => smtp.listen(SMTP_PORT, '127.0.0.1', r));
  const KEYS = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_from', 'rdv_guest_email_code', 'rdv_buffer_min'];
  const [old] = await pool.query('SELECT `key`, value FROM settings WHERE salon_id = ? AND `key` IN (?)', ['s1', KEYS]);
  try {
    await pool.query("DELETE FROM appointments WHERE email = ? OR client_name LIKE 'T159%'", [EMAIL]);
    await pool.query("DELETE FROM booking_verifications WHERE email LIKE '%159@client.test'");
    await pool.query("UPDATE barbers SET accepts_appointments = 1 WHERE id = 'b1'");
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b1'");
    for (let w = 0; w <= 6; w++) await pool.query("INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active) VALUES (UUID(), 'b1', ?, '09:00:00', '19:00:00', 1)", [w]);
    await pool.query("DELETE FROM settings WHERE salon_id = 's1' AND `key` = 'rdv_guest_email_code'");   // réglage par défaut : code demandé
    const put = await call('PUT', '/api/settings', { smtp_host: '127.0.0.1', smtp_port: String(SMTP_PORT), smtp_user: '', smtp_from: 'salon@test.test', rdv_buffer_min: '0' }, ADMIN);
    check('réglages SMTP du test enregistrés', put.status === 200, JSON.stringify(put.data));

    // --- Sans code, la réservation publique est refusée ---
    let r = await call('POST', '/api/appointments', booking('10:00'));
    check('POST /api/appointments sans code : refusé (verify_required)', r.status === 403 && r.data.code === 'verify_required', JSON.stringify(r.data));
    r = await call('POST', '/api/appointments/group', { client_name: 'T159 Karim', email: EMAIL, phone: '0612345678', people: [{ name: 'T159 Karim', service_id: 'sv1', barber_id: 'b1', date: DAY, time: '10:00' }] });
    check('POST /group sans code : refusé (verify_required)', r.status === 403 && r.data.code === 'verify_required', JSON.stringify(r.data));
    const [[none]] = await pool.query('SELECT COUNT(*) n FROM appointments WHERE email = ?', [EMAIL]);
    check('aucun RDV enregistré', none.n === 0);

    // --- 1) Envoi du code : créneau gardé ---
    check('10:00 libre au départ', hasSlot(await slotsB1(), '10:00'));
    r = await call('POST', '/api/appointments/verify/start', { kind: 'single', booking: booking('10:00') });
    check('start : ok, 60 s, 2 renvois, 3 essais', r.status === 200 && r.data.expires_in === 60 && r.data.sends_left === 2 && r.data.attempts_left === 3 && r.data.email === EMAIL, JSON.stringify(r.data));
    const vid = r.data.verification_id;
    await waitMail(1);
    const code1 = lastCode();
    check('email reçu avec un code à 6 chiffres dans l\'objet', mails.length === 1 && /^\d{6}$/.test(code1 || ''), (decode(mails[0] || '').match(/Subject:.*/) || [''])[0]);
    check('email : valable 60 secondes + le RDV', /Valable 60 secondes/.test(decode(mails[0] || '')) && /avec Alice/.test(decode(mails[0] || '')));
    check('pendant le code : 10:00 n\'est plus proposé aux autres', !hasSlot(await slotsB1(), '10:00'));
    r = await call('POST', '/api/appointments/verify/start', { kind: 'single', booking: booking('10:00', { email: 'autre159@client.test', client_name: 'T159 Autre' }) });
    check('un autre client ne peut pas prendre le même créneau', r.status >= 400, JSON.stringify(r.data));

    // --- 2) Mauvais codes : 3 essais puis bloqué ---
    const wrong = code1 === '000000' ? '111111' : '000000';
    r = await call('POST', '/api/appointments/verify/confirm', { verification_id: vid, code: wrong });
    check('mauvais code : il reste 2 essais', r.status === 400 && r.data.code === 'wrong' && r.data.attempts_left === 2, JSON.stringify(r.data));
    r = await call('POST', '/api/appointments/verify/confirm', { verification_id: vid, code: wrong });
    check('mauvais code : il reste 1 essai', r.data.code === 'wrong' && r.data.attempts_left === 1, JSON.stringify(r.data));
    r = await call('POST', '/api/appointments/verify/confirm', { verification_id: vid, code: wrong });
    check('3e mauvais code : bloqué, 2 renvois possibles', r.data.code === 'locked' && r.data.sends_left === 2, JSON.stringify(r.data));
    r = await call('POST', '/api/appointments/verify/confirm', { verification_id: vid, code: code1 });
    check('après blocage, même le bon code ne passe plus', r.status >= 400 && r.data.code === 'locked', JSON.stringify(r.data));

    // --- 3) Renvoi : nouveau code, essais remis à 3 ---
    r = await call('POST', '/api/appointments/verify/resend', { verification_id: vid });
    check('renvoi n°1 : ok, 1 renvoi restant', r.status === 200 && r.data.sends_left === 1 && r.data.expires_in === 60, JSON.stringify(r.data));
    await waitMail(2);
    const code2 = lastCode();
    check('nouveau code reçu', mails.length === 2 && /^\d{6}$/.test(code2 || ''));

    // --- 4) Code expiré (60 s) ---
    await expire(vid);
    r = await call('POST', '/api/appointments/verify/confirm', { verification_id: vid, code: code2 });
    check('code expiré : refusé (expired), 1 renvoi possible', r.status === 410 && r.data.code === 'expired' && r.data.sends_left === 1, JSON.stringify(r.data));
    check('code expiré : le créneau est libéré pour les autres', hasSlot(await slotsB1(), '10:00'));

    // --- 5) Dernier code : le bon code enregistre le RDV ---
    r = await call('POST', '/api/appointments/verify/resend', { verification_id: vid });
    check('renvoi n°2 : ok, plus aucun renvoi', r.status === 200 && r.data.sends_left === 0, JSON.stringify(r.data));
    await waitMail(3);
    const code3 = lastCode();
    check('créneau regardé pendant le nouveau code', !hasSlot(await slotsB1(), '10:00'));
    r = await call('POST', '/api/appointments/verify/confirm', { verification_id: vid, code: code3.slice(0, 3) + ' ' + code3.slice(3) });
    check('bon code (avec espace) : RDV enregistré', r.status === 200 && r.data.id && r.data.barber_name === 'Alice', JSON.stringify(r.data));
    const [[appt]] = await pool.query('SELECT client_name, barber_id, scheduled_at, status FROM appointments WHERE email = ?', [EMAIL]);
    check('RDV en base : Karim, Alice, 10:00', appt && appt.client_name === 'T159 Karim' && appt.barber_id === 'b1' && /10:00/.test(String(appt.scheduled_at.toISOString ? appt.scheduled_at.toTimeString() : appt.scheduled_at)), JSON.stringify(appt));
    r = await call('POST', '/api/appointments/verify/confirm', { verification_id: vid, code: code3 });
    check('code déjà utilisé : terminé (pas de 2e RDV)', r.status === 410 && r.data.code === 'closed', JSON.stringify(r.data));
    const [[cnt]] = await pool.query('SELECT COUNT(*) n FROM appointments WHERE email = ?', [EMAIL]);
    check('un seul RDV', cnt.n === 1);

    // --- 6) 3 codes épuisés : créneau libéré, plus de renvoi ---
    r = await call('POST', '/api/appointments/verify/start', { kind: 'single', booking: booking('11:00') });
    const v2 = r.data.verification_id;
    await call('POST', '/api/appointments/verify/resend', { verification_id: v2 });
    await call('POST', '/api/appointments/verify/resend', { verification_id: v2 });
    r = await call('POST', '/api/appointments/verify/resend', { verification_id: v2 });
    check('4e code refusé (no_more)', r.status === 410 && r.data.code === 'no_more', JSON.stringify(r.data));
    check('créneau 11:00 libéré', hasSlot(await slotsB1(), '11:00'));
    r = await call('POST', '/api/appointments/verify/confirm', { verification_id: v2, code: lastCode() });
    check('après 3 codes, même le dernier code ne marche plus', r.status === 410 && r.data.code === 'closed', JSON.stringify(r.data));

    // --- 7) Créneau pris entre-temps par le salon : le renvoi le dit ---
    r = await call('POST', '/api/appointments/verify/start', { kind: 'single', booking: booking('12:00') });
    const v3 = r.data.verification_id;
    await expire(v3);
    await pool.query("INSERT INTO appointments (id, salon_id, barber_id, client_name, service_id, scheduled_at, status, cancel_token) VALUES ('t159-pris','s1','b1','T159 Salon','sv1',?, 'confirmed','tokt159')", [DAY + ' 12:00:00']);
    r = await call('POST', '/api/appointments/verify/resend', { verification_id: v3 });
    check('créneau pris pendant l\'attente : renvoi refusé (slot_taken)', r.status === 409 && r.data.code === 'slot_taken', JSON.stringify(r.data));

    // --- 8) À plusieurs (sans compte) ---
    r = await call('POST', '/api/appointments/verify/start', { kind: 'group', booking: { client_name: 'T159 Karim', email: EMAIL, phone: '0612345678', people: [{ name: 'T159 Karim', service_id: 'sv1', barber_id: 'b1', date: DAY, time: '14:00' }, { name: 'T159 Lina', service_id: 'sv1', barber_id: 'b1', date: DAY, time: '14:30' }] } });
    check('groupe : code envoyé', r.status === 200 && r.data.verification_id, JSON.stringify(r.data));
    const [[noGrp]] = await pool.query("SELECT COUNT(*) n FROM appointments WHERE client_name IN ('T159 Lina') OR (email = ? AND scheduled_at >= ?)", [EMAIL, DAY + ' 14:00:00']);
    check('groupe : rien d\'enregistré avant le code (le test à blanc ne laisse rien)', noGrp.n === 0);
    const sl = await slotsB1();
    check('groupe : 14:00 et 14:30 gardés', !hasSlot(sl, '14:00') && !hasSlot(sl, '14:30'));
    await waitMail(mails.length);
    r = await call('POST', '/api/appointments/verify/confirm', { verification_id: r.data.verification_id, code: lastCode() });
    check('groupe : bon code -> 2 RDV', r.status === 200 && (r.data.appointments || []).length === 2, JSON.stringify(r.data));

    // --- 9) Compte connecté, email vérifié : pas de code ---
    await pool.query("DELETE FROM clients WHERE email = 'compte159@client.test'");
    await pool.query("INSERT INTO clients (id, owner_id, salon_id, name, email, phone, password_hash, email_verified) VALUES ('t159-cl','o1','s1','T159 Compte','compte159@client.test','0611111111','x',1)");
    await pool.query("INSERT INTO client_sessions (token, client_id, expires_at) VALUES ('t159tok','t159-cl', NOW() + INTERVAL 1 DAY)");
    r = await call('POST', '/api/appointments', booking('16:00', { email: 'compte159@client.test', client_name: 'T159 Compte' }), Object.assign({ 'X-Client-Token': 't159tok' }, PUB));
    check('compte connecté : RDV direct, sans code', r.status === 200 && r.data.id, JSON.stringify(r.data));
    r = await call('POST', '/api/appointments', booking('16:30', { email: 'compte159@client.test', client_name: 'T159 Compte' }), Object.assign({ 'X-Client-Token': 'faux' }, PUB));
    check('jeton invalide : code demandé', r.status === 403 && r.data.code === 'verify_required', JSON.stringify(r.data));

    // --- 10) Réglage rdv_guest_email_code = 0 : désactivé ---
    await pool.query("INSERT INTO settings (salon_id, `key`, value) VALUES ('s1','rdv_guest_email_code','0')");
    r = await call('POST', '/api/appointments', booking('17:00'));
    check('réglage à 0 : RDV direct comme avant', r.status === 200 && r.data.id, JSON.stringify(r.data));
  } finally {
    await pool.query("DELETE FROM appointments WHERE email LIKE '%159@client.test' OR client_name LIKE 'T159%'");
    await pool.query("DELETE FROM booking_verifications WHERE email LIKE '%159@client.test'");
    await pool.query("DELETE FROM client_sessions WHERE token = 't159tok'");
    await pool.query("DELETE FROM clients WHERE id = 't159-cl'");
    await pool.query("DELETE FROM barber_schedules WHERE barber_id = 'b1'");
    await pool.query("UPDATE barbers SET accepts_appointments = 0 WHERE id = 'b1'");
    await pool.query('DELETE FROM settings WHERE salon_id = ? AND `key` IN (?)', ['s1', KEYS]);
    if (old.length) await pool.query('INSERT INTO settings (salon_id, `key`, value, updated_at) VALUES ' + old.map(() => '(?, ?, ?, NOW())').join(', '), old.flatMap((x) => ['s1', x.key, x.value]));
    await call('PUT', '/api/settings', {}, ADMIN);   // oublie le transport SMTP du test
    smtp.close();
  }

  // --- Page rdv.html ---
  const h = fs.readFileSync(path.join(__dirname, '../../public/rdv.html'), 'utf8');
  check('rdv.html : panneau « Vérifiez votre email » + 6 cases', h.includes('id="p-verify"') && h.includes('Vérifiez votre email') && h.includes("autocomplete=\"one-time-code\"") && /for \(var i = 0; i < 6; i\+\+\)/.test(h));
  check('rdv.html : compte à rebours et renvois', h.includes('id="vf-left"') && h.includes('Renvoyer un code') && h.includes('Recevoir un nouveau code'));
  check('rdv.html : écran « Le temps est écoulé » + recommencer', h.includes('Le temps est écoulé') && h.includes('Recommencer la réservation'));
  check('rdv.html : RDV seul et à plusieurs passent par le code', h.includes("vfStart('single'") && h.includes("vfStart('group'"));
  check('rdv.html : RDV pris par le salon (pont) sans code', h.includes("STAFF_BRIDGE.api('/api/appointments/admin-group'"));
  const c = fs.readFileSync(path.join(__dirname, '../../public/compte.html'), 'utf8');
  check('compte.html : réservation avec le jeton du compte', /function apiForBooking[\s\S]{0,600}X-Client-Token/.test(c));
  await pool.end();
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
