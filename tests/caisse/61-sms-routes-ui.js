// Rappel SMS : schema, routes automation / reglages / super admin, interface.
const fs = require('fs'), path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const sql = rd('sql/schema.sql'), a = rd('src/routes/automation.js'), st = rd('src/routes/settings.js'),
  sa = rd('src/routes/salons.js'), d = rd('public/dashboard.html'), s = rd('public/super-admin.html');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('table sms_credits (2000 par defaut)', /CREATE TABLE IF NOT EXISTS sms_credits/.test(sql) && /credits_granted[^,]*DEFAULT 2000/i.test(sql));
check('table sms_log + statut no_credit + unicite RDV', /CREATE TABLE IF NOT EXISTS sms_log/.test(sql) && /no_credit/.test(sql) && /UNIQUE KEY uq_sms_log_appt_kind \(appointment_id, kind\)/.test(sql));
check('route /sms-reminders/due protegee par la cle', /router\.get\('\/sms-reminders\/due', requireAutomationKey/.test(a));
check('route /sms-reminders/result protegee par la cle', /router\.post\('\/sms-reminders\/result', requireAutomationKey/.test(a));
check('envoi bloque sans credit (no_credit)', /no_credit/.test(a) && /credits_used/.test(a));
check('rappel quotidien : RDV de demain (date du salon)', /const tomorrow = addHoursLocal\(nowLocal, 24\)\.slice\(0, 10\)/.test(a) && !/too_late_booking/.test(a));
check('rappel desactive par defaut (opt-in)', /sms_reminder_enabled/.test(a));
check('reglages SMS editables + validation expediteur', /sms_sender/.test(st) && /sms_reminder_template/.test(st) && /\/sms\/preview/.test(st));
check('super admin : overview, credits, remise a zero', /\/sms\/overview/.test(sa) && /add_credits/.test(sa) && /reset-usage/.test(sa));
check('dashboard : accordeon SMS + apercu + etiquette non envoye', /id="sms-card"/.test(d) && /saveSmsSettings/.test(d) && /plus de crédits/.test(d));
check('super admin : onglet SMS', /data-t="sms"/.test(s) && /id="t-sms"/.test(s) && /loadSmsOverview/.test(s));
const lib = rd('src/lib/sms.js');
check('SMS de test : routes salon + super admin protegees', /router\.post\('\/sms\/test', requireAdmin/.test(st) && /router\.post\('\/sms\/test', requireSuperAdmin/.test(sa));
check('SMS de test : limite 5/heure et numero valide', /hits\.length >= 5/.test(st) && /normalizePhone\(req\.body\.to\)/.test(st));
check('SMS de test : passe par le webhook n8n (pas de cle Brevo dans l\'app)', /tbo-sms-test/.test(lib) && !/api\.brevo\.com/.test(lib));
check('SMS de test : boutons salon + super admin', /onclick="testSms\(\)"/.test(d) && /onclick="sendTestSms\(\)"/.test(s));
check('SMS de test salon : trace dans l\'historique (kind test) et consomme les credits', /'test', 'Test'/.test(st) && /credits_used = credits_used \+ \?/.test(st) && /MODIFY appointment_id CHAR\(36\) NULL/.test(sql));
check('SMS de test salon : bloque sans credit', /Plus de credits SMS/.test(st));
check('historique : ligne marquee SMS de test', /SMS de test ·/.test(d));
check('rappel : nom du coiffeur dans le message, plus de lien court', /coiffeur: a\.barber_name/.test(a) && !/shortCancelLink|smsPublicBase/.test(a) && !fs.existsSync(path.join(__dirname, '../../src/routes/shortLinks.js')));
check('interface : pastille {coiffeur}, pas de {lien}', /smsInsert\('\{coiffeur\}'\)/.test(d) && !/smsInsert\('\{lien\}'\)/.test(d));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
