// Horaires de la caisse (base et serveur reels, voir README) : ouverture + fermeture automatique, chacune
// activable ; a la fermeture, la cloture Z reste en attente et seule l'admin peut la faire.
const { execSync } = require('child_process');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BARBER = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Barber-Id': 'b1', 'X-Barber-Pin': '1111' };
const ADMIN = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
async function api(method, path, body, headers) {
  const r = await fetch(BASE + path, { method, headers: headers || BARBER, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const svc = { item_type: 'service', item_id: 'sv1', item_name: 'Coupe', unit_price_cents: 2000, quantity: 1 };
// Heure du salon (Europe/Paris) +/- n minutes, bornee a la journee.
// Le test se place dans un fuseau ou il est entre 6h et 18h (pour pouvoir mettre des heures avant/apres « maintenant »).
const ZONES = ['Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Kolkata', 'Pacific/Auckland', 'America/Sao_Paulo', 'Asia/Dubai'];
const minIn = (tz) => { const t = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()); return Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); };
const TZ = ZONES.find((z) => minIn(z) >= 6 * 60 && minIn(z) <= 18 * 60) || 'Europe/Paris';
const parisMin = () => { const t = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()); return Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); };
const hm = (m) => { m = Math.max(0, Math.min(23 * 60 + 59, m)); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const setHours = (o) => api('PUT', '/api/settings', o, ADMIN);
const pub = async () => (await api('GET', '/api/settings/public')).body;
const sell = () => api('POST', '/api/sales', { payment_method: 'especes', items: [svc] });

(async () => {
  const now = parisMin();
  if (now < 125 || now > 23 * 60 - 125) { console.log('Test saute pres de minuit (heures relatives impossibles)'); console.log('\nRESULTAT : 0 verifications reussies, 0 echec(s)'); return; }
  sql("DELETE FROM sales; DELETE FROM cash_closings; DELETE FROM settings WHERE salon_id='s1' AND \\`key\\` LIKE 'caisse_%'");
  const oldTz = sql("SELECT value FROM settings WHERE salon_id='s1' AND \\`key\\`='timezone'");
  await setHours({ timezone: TZ });
  console.log('(fuseau du test : ' + TZ + ')');

  console.log('\n[A] Reglages');
  let r = await setHours({ caisse_open_enabled: '1', caisse_open_hour: '18:00', caisse_close_enabled: '1', caisse_close_hour: '09:00' });
  check('fermeture avant l\'ouverture refusee', r.status === 400, r.body);
  r = await setHours({ caisse_open_hour: '9h' });
  check('heure mal ecrite refusee', r.status === 400);

  console.log('\n[B] Avant l\'heure d\'ouverture');
  await setHours({ caisse_open_enabled: '1', caisse_open_hour: hm(now + 60), caisse_close_enabled: '0', caisse_close_hour: hm(now + 120) });
  let p = await pub();
  check('caisse fermee : « La caisse ouvre a ... »', p.caisse_lock_reason === 'before_open' && /ouvre à/.test(p.caisse_lock_message), p);
  r = await sell();
  check('vente refusee (423)', r.status === 423, r.body);

  console.log('\n[C] Ouverture desactivee : caisse ouverte');
  await setHours({ caisse_open_enabled: '0' });
  p = await pub();
  check('plus de verrou', !p.caisse_locked_until, p);
  r = await sell();
  check('vente acceptee', r.status === 200, r.body);

  console.log('\n[D] Fermeture automatique passee avec des ventes : cloture Z en attente');
  sql("UPDATE sales SET created_at = UTC_TIMESTAMP() - INTERVAL 30 MINUTE WHERE salon_id='s1'");
  await setHours({ caisse_open_enabled: '1', caisse_open_hour: hm(now - 120), caisse_close_enabled: '1', caisse_close_hour: hm(now - 10) });
  p = await pub();
  check('verrou « z_pending » (aucune reouverture automatique)', p.caisse_lock_reason === 'z_pending' && p.caisse_locked_until === 'z_pending' && /clôture Z/.test(p.caisse_lock_message), p);
  r = await sell();
  check('vente refusee avec le message de la cloture Z', r.status === 423 && /clôture Z/.test(r.body.error), r.body);
  r = await api('GET', '/api/owner/caisse/current-period', null, ADMIN);
  check('dashboard : periode en cours signale la cloture Z en attente', r.body.caisse_lock && r.body.caisse_lock.reason === 'z_pending', r.body.caisse_lock);

  console.log('\n[E] Cloture Z reservee a l\'admin');
  r = await api('POST', '/api/owner/caisse/close', { starting_cash_cents: 0 });
  check('un coiffeur (code PIN) ne peut plus cloturer', r.status === 401 || r.status === 403, r.status);
  r = await api('POST', '/api/owner/caisse/close', { starting_cash_cents: 0 }, ADMIN);
  check('l\'admin cloture', r.status === 200, r.body);
  p = await pub();
  check('apres le Z : simplement « fermee » jusqu\'a la prochaine ouverture (demain)', p.caisse_lock_reason === 'closed' && p.caisse_locked_until && p.caisse_locked_until !== 'z_pending', p);

  console.log('\n[F] Pendant la journee, apres le Z');
  await setHours({ caisse_close_hour: hm(now + 60) });
  p = await pub();
  check('avant la fermeture et Z fait : caisse ouverte', !p.caisse_locked_until, p);

  console.log('\n[G] Forcer l\'ouverture (admin)');
  await setHours({ caisse_open_hour: hm(now + 30), caisse_close_hour: hm(now + 90) });
  check('avant ouverture : fermee', (await pub()).caisse_lock_reason === 'before_open');
  r = await fetch(BASE + '/api/settings/caisse/force-open', { method: 'POST', headers: ADMIN });
  check('forcage avec le mot de passe admin : ouverte', r.status === 200 && !(await pub()).caisse_locked_until);

  console.log('\n[H] Ancien fonctionnement tant que rien n\'est regle');
  sql("DELETE FROM settings WHERE salon_id='s1' AND \\`key\\` LIKE 'caisse_%'");
  p = await pub();
  check('Z fait aujourd\'hui, sans reglage : fermee jusqu\'au lendemain (comme avant)', p.caisse_lock_reason === 'closed' && p.caisse_locked_until !== 'z_pending', p);

  console.log('\n[I] Ecrans');
  const caisse = fs.readFileSync(__dirname + '/../../public/caisse.html', 'utf8');
  const dash = fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8');
  check('caisse : onglet Cloture retire, message de verrouillage du serveur affiche', /id="nav-cloture" onclick="switchCaisseTab\('cloture'\)" style="display:none"/.test(caisse) && (caisse.match(/caisseLockText\(d\)/g) || []).length >= 3);
  check('caisse fermee pendant une session : deconnexion, le code PIN sera redemande a l\'ouverture', /if \(me && !paymentInFlight\) \{ logout\(\); showLoginOrLocked\(\); \}/.test(caisse) && /sessionStorage\.removeItem\('caisse-session'\); \} catch \(e\) \{\}\n        document\.documentElement\.classList\.remove\('auth-checking'\);/.test(caisse));
  check('dashboard : 2 interrupteurs + 2 heures, plus de « deconnexion automatique »', /id="caisse-open-switch"/.test(dash) && /id="caisse-close-switch"/.test(dash) && /id="caisse-open-hour"/.test(dash) && /id="caisse-close-hour"/.test(dash) && !/id="caisse-inactivity"/.test(dash));

  sql("DELETE FROM sales; DELETE FROM cash_closings; DELETE FROM settings WHERE salon_id='s1' AND \\`key\\` LIKE 'caisse_%'");
  if (oldTz) await setHours({ timezone: oldTz }); else sql("DELETE FROM settings WHERE salon_id='s1' AND \\`key\\`='timezone'");
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
