// Lien « agenda » (Mes salons) : la tablette partagée des coiffeurs. C'est la page caisse en mode Agenda + Timer :
// ni Caisse ni Clôture, un bouton Déconnexion, et elle reste ouverte même quand la caisse est clôturée.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
(async () => {
  const r = await fetch('http://127.0.0.1:3999/agenda.html?salon=test');
  const html = await r.text();
  check('/agenda.html sert la page caisse (même code, rien en double)', r.status === 200 && html.includes('id="caisse-footer"') && html.includes('var AGENDA_MODE = '));
  const c = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
  const d = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
  check('menu du bas : Caisse, Clôture et réglages terminal cachés ; Déconnexion seulement en mode agenda',
    c.includes('html.agenda-mode #nav-caisse, html.agenda-mode #nav-cloture, html.agenda-mode #conn-btn { display: none !important; }') &&
    c.includes('html:not(.agenda-mode) #nav-logout { display: none !important; }') && c.includes('id="nav-logout" onclick="agendaLogout()"'));
  check('impossible d\'ouvrir Caisse / Clôture en mode agenda (retour au Timer)', c.includes("if (AGENDA_MODE && (tab === 'caisse' || tab === 'cloture')) tab = 'timer';"));
  check('reste ouverte quand la caisse est clôturée (pas d\'écran « Caisse fermée », session gardée)', c.includes('if (AGENDA_MODE) return;   // tablette « agenda »') &&
    c.includes("var locked = Boolean(d.caisse_locked_until) && !AGENDA_MODE;") && c.includes('if (d.caisse_locked_until && !AGENDA_MODE) {'));
  check('session gardée jusqu\'à « Déconnexion » (même après fermeture du navigateur)', c.includes("var CAISSE_SESSION_KEY = AGENDA_MODE ? 'agenda-session' : 'caisse-session';") && c.includes('AGENDA_MODE ? window.localStorage : window.sessionStorage'));
  check('pas de fond de caisse ni de terminal sur la tablette', c.includes('if (!AGENDA_MODE) checkPendingRecount(') && c.includes('if (!AGENDA_MODE) { pollConnection(); setConnPollInterval(15000); }'));
  check('ouvre sur le Timer', c.includes("if (AGENDA_MODE) doSwitchCaisseTab('timer');"));
  check('écran du code PIN : « Agenda » (et plus « Caisse »)', c.includes("if (window.AGENDA_MODE) document.getElementById('login-title').textContent = 'Agenda';"));
  check('Mes salons : lien « agenda »', d.includes("'caisse.html', 'agenda.html', 'rdv.html'"));
  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
