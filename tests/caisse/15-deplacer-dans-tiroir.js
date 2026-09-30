const { JSDOM } = require('jsdom');
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8');

// Extrait le HTML exact du conteneur #drawer-appt-actions tel qu'il est
// vraiment dans le fichier (pas une recopie a la main).
const start = src.indexOf('<div id="drawer-appt-actions"');
const end = src.indexOf('</div>', start) + 6;
const html = src.slice(start, end);

const dom = new JSDOM('<!doctype html><html><body>' + html + '</body></html>', { runScripts: 'dangerously' });
const d = dom.window.document;

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

const buttons = d.querySelectorAll('#drawer-appt-actions button');
check('exactement 2 boutons dans le conteneur', buttons.length === 2, buttons.length);
check('le 1er bouton dit "Deplacer"', buttons[0].textContent.trim() === 'Déplacer', buttons[0].textContent);
check('le 1er bouton appelle openRescheduleAppointment() SANS argument', buttons[0].getAttribute('onclick') === 'openRescheduleAppointment()');
check('le 2e bouton dit toujours "Annuler le RDV" (inchange)', buttons[1].textContent.trim() === 'Annuler le RDV', buttons[1].textContent);
check('le 2e bouton appelle toujours cancelAppointmentByAdmin() (inchange)', buttons[1].getAttribute('onclick') === 'cancelAppointmentByAdmin()');

// Simule reellement le clic (comme un navigateur le ferait) et verifie que
// la BONNE fonction globale est appelee, avec les BONS arguments (aucun).
dom.window.openRescheduleAppointment = function () { dom.window.__called = ['reschedule', arguments.length]; };
dom.window.cancelAppointmentByAdmin = function () { dom.window.__called = ['cancel', arguments.length]; };
buttons[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
check('clic sur "Deplacer" -> appelle bien openRescheduleAppointment(), 0 argument', JSON.stringify(dom.window.__called) === '["reschedule",0]', JSON.stringify(dom.window.__called));
dom.window.__called = null;
buttons[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
check('clic sur "Annuler le RDV" -> toujours cancelAppointmentByAdmin() (inchange)', JSON.stringify(dom.window.__called) === '["cancel",0]', JSON.stringify(dom.window.__called));

console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
process.exit(fail ? 1 : 0);
