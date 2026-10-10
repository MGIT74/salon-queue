// Credits SMS : dotation mensuelle remise a zero le 1er du mois (non cumulable), bonus valable le mois.
const fs = require('fs'), path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };

// Base simulee : on verifie le SQL emis par la remise a zero.
const calls = [];
const dbPath = require.resolve('../../src/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: { query: async (sql, params) => { calls.push({ sql, params }); return [[{ ok: 1 }]]; } } } };
const c = require('../../src/lib/smsCredits');
const month = c.currentMonth();
check('mois courant au format AAAA-MM', /^\d{4}-\d{2}$/.test(month));
(async () => {
  await c.rollover('salon-1');
  const u = calls.find(x => /UPDATE sms_credits SET credits_used = 0, credits_bonus = 0, period_month = \?/.test(x.sql));
  check('remise a zero = usage + bonus, uniquement si le mois a change', !!u && /period_month IS NULL OR period_month <> \?/.test(u.sql) && u.params[0] === month && u.params[1] === month && u.params[2] === 'salon-1');
  calls.length = 0;
  await c.rollover();
  check('remise a zero de tous les salons (super admin)', calls.length === 1 && calls[0].params.length === 2);
  const sql = rd('sql/schema.sql'), sa = rd('src/routes/salons.js'), st = rd('src/routes/settings.js'), au = rd('src/routes/automation.js'),
    sp = rd('public/super-admin.html');
  check('schema : colonnes credits_bonus et period_month', /ADD COLUMN credits_bonus INT NOT NULL DEFAULT 0/.test(sql) && /ADD COLUMN period_month CHAR\(7\)/.test(sql));
  check('toutes les lectures de credits passent par getSmsCredits (remise a zero a la volee)', /getSmsCredits/.test(st) && /getSmsCredits\(salon\.id\)|const credits = await getSmsCredits/.test(au) && /getSmsCredits\(salonId\)/.test(sa));
  check('super admin : bonus du mois (credits_bonus) et non plus ajout permanent', /credits_bonus = credits_bonus \+ \?/.test(sa) && !/credits_granted = credits_granted \+ \?/.test(sa));
  check('interface super admin : dotation par mois', /PAR MOIS/.test(sp) && /Bonus du mois/.test(sp));
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
})();
