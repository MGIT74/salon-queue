// Horaires de la caisse (base et serveur reels, voir README) : ouverture + fermeture automatique, chacune
// activable ; Z pas fait avant la fermeture -> caisse verrouillee jusqu'au Z de l'admin ou a son deblocage par mot de passe.
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

  console.log('\n[D] Fermeture automatique passee sans cloture Z : la caisse reste verrouillee');
  sql("UPDATE sales SET created_at = UTC_TIMESTAMP() - INTERVAL 30 MINUTE WHERE salon_id='s1'");
  await setHours({ caisse_open_enabled: '1', caisse_open_hour: hm(now - 120), caisse_close_enabled: '1', caisse_close_hour: hm(now - 10) });
  p = await pub();
  check('verrou « z_pending » (aucune reouverture automatique)', p.caisse_lock_reason === 'z_pending' && p.caisse_locked_until === 'z_pending' && /clôture Z/.test(p.caisse_lock_message) && /mot de passe/.test(p.caisse_lock_message), p);
  r = await sell();
  check('vente refusee avec le message de la cloture Z', r.status === 423 && /clôture Z/.test(r.body.error), r.body);
  r = await api('GET', '/api/owner/caisse/current-period', null, ADMIN);
  check('dashboard : periode en cours signale la cloture Z en attente', r.body.caisse_lock && r.body.caisse_lock.reason === 'z_pending', r.body.caisse_lock);

  console.log('\n[E] L\'admin debloque la caisse avec son mot de passe');
  r = await fetch(BASE + '/api/settings/caisse/force-open', { method: 'POST', headers: ADMIN });
  check('« Forcer l\'ouverture » : caisse debloquee', r.status === 200 && !(await pub()).caisse_locked_until);
  r = await api('POST', '/api/owner/caisse/close', { starting_cash_cents: 0 });
  check('le coiffeur peut alors faire le Z depuis la caisse (bouton Cloture garde)', r.status === 200, r.body);

  console.log('\n[F] Z de rattrapage fait par l\'admin le lendemain : la journee en cours n\'est pas bloquee');
  sql("DELETE FROM sales; DELETE FROM cash_closings; DELETE FROM settings WHERE salon_id='s1' AND \\`key\\`='caisse_force_reopen_at'");
  sql("INSERT INTO sales (id,salon_id,barber_id,payment_method,total_price_cents,ticket_number,created_at) VALUES ('old1','s1','b1','especes',2000,1,UTC_TIMESTAMP() - INTERVAL 25 HOUR)");
  await setHours({ caisse_close_hour: hm(now + 60) });
  p = await pub();
  check('vente d\'hier jamais cloturee : verrou « z_pending » ce matin', p.caisse_lock_reason === 'z_pending', p);
  r = await api('POST', '/api/owner/caisse/close', { starting_cash_cents: 0 }, ADMIN);
  check('l\'admin fait le Z depuis le dashboard', r.status === 200, r.body);
  p = await pub();
  check('caisse ouverte tout de suite (Z de rattrapage)', !p.caisse_locked_until, p);

  console.log('\n[G] Z fait pendant la journee : fermee jusqu\'a la prochaine ouverture (comme avant)');
  await new Promise((res) => setTimeout(res, 1200)); // la vente doit etre posterieure (a la seconde) au Z precedent
  r = await sell();
  check('vente de la journee', r.status === 200, r.body);
  r = await api('POST', '/api/owner/caisse/close', { starting_cash_cents: 0 });
  check('Z par le coiffeur', r.status === 200, r.body);
  p = await pub();
  check('caisse fermee jusqu\'a demain a l\'heure d\'ouverture', p.caisse_lock_reason === 'closed' && p.caisse_locked_until && p.caisse_locked_until !== 'z_pending' && new Date(p.caisse_locked_until) > new Date(Date.now() + 60 * 60 * 1000), p);

  console.log('\n[H] Ancien fonctionnement tant que rien n\'est regle');
  sql("DELETE FROM settings WHERE salon_id='s1' AND \\`key\\` LIKE 'caisse_%'");
  p = await pub();
  check('Z fait aujourd\'hui, sans reglage : fermee jusqu\'au lendemain (comme avant)', p.caisse_lock_reason === 'closed' && p.caisse_locked_until !== 'z_pending', p);

  console.log('\n[I] Ecrans');
  const caisse = fs.readFileSync(__dirname + '/../../public/caisse.html', 'utf8');
  const dash = fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8');
  check('caisse : onglet Cloture garde, message de verrouillage du serveur affiche', /<button id="nav-cloture" onclick="switchCaisseTab\('cloture'\)">/.test(caisse) && (caisse.match(/caisseLockText\(d\)/g) || []).length >= 3);
  check('caisse fermee pendant une session : deconnexion, le code PIN sera redemande a l\'ouverture', /if \(me && !paymentInFlight\) \{ logout\(\); showLoginOrLocked\(\); \}/.test(caisse) && /sessionStorage\.removeItem\('caisse-session'\); \} catch \(e\) \{\}\n        document\.documentElement\.classList\.remove\('auth-checking'\);/.test(caisse));
  check('dashboard : 2 interrupteurs + 2 heures, plus de « deconnexion automatique »', /id="caisse-open-switch"/.test(dash) && /id="caisse-close-switch"/.test(dash) && /id="caisse-open-hour"/.test(dash) && /id="caisse-close-hour"/.test(dash) && !/id="caisse-inactivity"/.test(dash));

  sql("DELETE FROM sales; DELETE FROM cash_closings; DELETE FROM settings WHERE salon_id='s1' AND \\`key\\` LIKE 'caisse_%'");
  if (oldTz) await setHours({ timezone: oldTz }); else sql("DELETE FROM settings WHERE salon_id='s1' AND \\`key\\`='timezone'");
  console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
