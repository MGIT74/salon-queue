// Calcul de l'heure de reouverture de la caisse apres une cloture : fuseaux et
// changements d'heure. Appelle directement getCaisseLockedUntil() sur la base.
// Les clotures sont placees dans le FUTUR (oct. 2026 / mars 2027) pour que
// "maintenant < reouverture" et que la fonction renvoie l'instant calcule.
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path');
const { pool, getCaisseLockedUntil } = require(path.join(__dirname, '../../src/db'));
let pass = 0, fail = 0, z = 100;
const check = (n, got, want) => { const ok = got === want; ok ? pass++ : fail++; console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + '\n         obtenu : ' + got + (ok ? '' : '\n         attendu: ' + want)); };

async function reopen(closingUtc, settings) {
  await pool.query("DELETE FROM cash_closings WHERE salon_id='s1'");
  await pool.query("INSERT INTO cash_closings (id, salon_id, period_end, total_cents, sales_count, z_number, starting_cash_cents) VALUES (UUID(), 's1', ?, 1000, 1, ?, 0)", [closingUtc, ++z]);
  return getCaisseLockedUntil('s1', settings);
}
const P = { caisse_reopen_hour: '08:00', timezone: 'Europe/Paris' };

(async () => {
  console.log('\n[Ete] cloture 19:00 heure de Paris (CEST = UTC+2), reouverture 08:00');
  check('reouvre le lendemain 08:00 Paris = 06:00 UTC',
    await reopen('2026-10-20 17:00:00', P), '2026-10-21T06:00:00.000Z');

  console.log('\n[Fin d\'heure d\'ete] cloture samedi 24/10 19:00 Paris, le changement d\'heure a lieu dans la nuit');
  check('dimanche 08:00 Paris = 07:00 UTC (UTC+1 apres le changement, pas 06:00)',
    await reopen('2026-10-24 17:00:00', P), '2026-10-25T07:00:00.000Z');

  console.log('\n[Debut d\'heure d\'ete] cloture samedi 27/03/2027 19:00 Paris (CET = UTC+1)');
  check('dimanche 28/03 08:00 Paris = 06:00 UTC (UTC+2 apres le changement)',
    await reopen('2027-03-27 18:00:00', P), '2027-03-28T06:00:00.000Z');

  console.log('\n[Heure qui n\'existe pas] reouverture 02:30 le jour du passage a l\'heure d\'ete (02:00 -> 03:00)');
  const nonexist = await reopen('2027-03-27 18:00:00', { caisse_reopen_hour: '02:30', timezone: 'Europe/Paris' });
  check('renvoie une date valide (pas d\'exception ni de NaN), dans la nuit du 28/03',
    String(nonexist && nonexist.startsWith('2027-03-28T0') && !nonexist.includes('NaN')), 'true');

  console.log('\n[Heure repetee] reouverture 02:30 le jour du retour a l\'heure d\'hiver (2h30 arrive deux fois)');
  const twice = await reopen('2026-10-24 17:00:00', { caisse_reopen_hour: '02:30', timezone: 'Europe/Paris' });
  check('renvoie une date valide dans la nuit du 25/10',
    String(twice && (twice === '2026-10-25T00:30:00.000Z' || twice === '2026-10-25T01:30:00.000Z')), 'true');

  console.log('\n[Reglage par defaut] pas d\'heure configuree -> minuit');
  check('reouvre a 00:00 heure de Paris le lendemain (22:00 UTC la veille en ete)',
    await reopen('2026-10-20 17:00:00', { timezone: 'Europe/Paris' }), '2026-10-20T22:00:00.000Z');
  check('un reglage invalide ("8h") retombe sur minuit, sans planter',
    await reopen('2026-10-20 17:00:00', { caisse_reopen_hour: '8h', timezone: 'Europe/Paris' }), '2026-10-20T22:00:00.000Z');

  console.log('\n[Autre fuseau] salon a Toronto (EDT = UTC-4 en octobre)');
  check('cloture 19:00 Toronto (23:00 UTC), reouverture 08:00 Toronto = 12:00 UTC',
    await reopen('2026-10-20 23:00:00', { caisse_reopen_hour: '08:00', timezone: 'America/Toronto' }), '2026-10-21T12:00:00.000Z');

  console.log('\n[Cloture juste avant minuit / juste apres minuit, heure de Paris]');
  check('23:30 Paris (21:30 UTC) le 20/10 -> reouvre le 21/10 08:00 Paris',
    await reopen('2026-10-20 21:30:00', P), '2026-10-21T06:00:00.000Z');
  const late = await reopen('2026-10-20 22:30:00', P);
  console.log('  INFO  00:30 Paris le 21/10 (22:30 UTC le 20) -> ' + late + '  (= 22/10 08:00 Paris : verrouille ~31 h)');

  console.log('\n[Forcage par l\'administrateur]');
  const forced = { caisse_reopen_hour: '08:00', timezone: 'Europe/Paris', caisse_force_reopen_at: '2026-10-20T18:00:00.000Z' };
  check('reouverture forcee APRES la cloture -> caisse ouverte (null)', String(await reopen('2026-10-20 17:00:00', forced)), 'null');
  const stale = { caisse_reopen_hour: '08:00', timezone: 'Europe/Paris', caisse_force_reopen_at: '2026-10-19T18:00:00.000Z' };
  check('forcage ANCIEN (avant la cloture) ne compte plus -> toujours verrouille', await reopen('2026-10-20 17:00:00', stale), '2026-10-21T06:00:00.000Z');

  console.log('\n[Aucune cloture]');
  await pool.query("DELETE FROM cash_closings WHERE salon_id='s1'");
  check('jamais cloture -> caisse ouverte (null)', String(await getCaisseLockedUntil('s1', P)), 'null');

  await pool.query("DELETE FROM cash_closings WHERE salon_id='s1'");
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
