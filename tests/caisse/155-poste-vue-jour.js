// Mon poste > Agenda > Jour (proposition C) : recherche client, coup d'œil de l'equipe, agenda en colonnes.
// Les vues Mois/Semaine et leur planning (renderAgendaTimeline) restent inchanges.
const fs = require('fs'), path = require('path'), vm = require('vm');
const poste = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const fnSrc = (name) => { const i = poste.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = poste.indexOf('\nfunction ', i + 10); const k = poste.indexOf('\n/**', i + 10); return poste.slice(i, Math.min.apply(null, [j, k].filter((x) => x > -1))); };
const ctx = vm.createContext({});
vm.runInContext(['pdMin', 'pdHM', 'pdDur', 'pdFg', 'pdState', 'pdBarberDay'].map(fnSrc).join('\n'), ctx);

console.log('\n[A] Logique');
check('etat : absent / termine / en cours / passe / a venir', ctx.pdState({ display_status: 'no_show' }, 0, true, false, 0) === 'absent' && ctx.pdState({ display_status: 'completed' }, 0, true, false, 0) === 'done'
  && ctx.pdState({ queue_status: 'in_progress' }, 999, true, false, 0) === 'inprogress' && ctx.pdState({}, 600, true, false, 700) === 'past' && ctx.pdState({}, 800, true, false, 700) === 'todo' && ctx.pdState({}, 800, false, true, 0) === 'past');
check('texte lisible : fonce sur jaune, blanc sur bleu', ctx.pdFg('#f5b800') === '#1a1a1a' && ctx.pdFg('#2f4bff') === '#ffffff' && ctx.pdFg('hsl(1,2%,3%)') === '#ffffff');
const b = { schedules: [{ weekday: 3, active: 1, start_time: '09:00:00', end_time: '19:00:00' }], breaks: [{ weekday: 3, active: 1, start_time: '12:30:00', end_time: '13:30:00' }] };
const d = ctx.pdBarberDay(b, '2026-10-28');
check('horaires + pauses du coiffeur ce jour-la', d && d.start === 540 && d.end === 1140 && d.breaks.length === 1 && d.breaks[0][0] === 750);
check('jour non travaille / horaires inconnus : null', ctx.pdBarberDay(b, '2026-10-29') === null && ctx.pdBarberDay({}, '2026-10-28') === null);
check('durees : 37 min, 1 h 35', ctx.pdDur(37) === '37 min' && ctx.pdDur(95) === '1 h 35');

console.log('\n[B] Vue Jour');
check('la vue Jour utilise la nouvelle mise en page', /view\.innerHTML = posteDayHtml\(dateStr\);/.test(poste));
check('recherche client (nom, telephone, email) + resultats « Ce jour » / « Autres jours »', /id="pd-search"/.test(poste) && /Ce jour<\/div>/.test(poste) && /Autres jours<\/div>/.test(poste) && /function pdRunSearch/.test(poste));
check('RDV trouves allumes dans l\'agenda, les autres pâlis', /classList\.toggle\('pd-hit'/.test(poste) && /classList\.toggle\('pd-dim'/.test(poste));
check('« + Nouveau RDV pour … » pre-remplit le nom (ou tel / email)', /function pdNewForQuery/.test(poste) && /nameEl\.value = q/.test(poste));
check('coup d\'œil : une barre par coiffeur, trait « maintenant », resume', /La journée en un coup d’œil/.test(poste) && /pd-g-seg st-/.test(poste) && /Libre jusqu’à /.test(poste));
check('agenda en colonnes : clic RDV = fiche (tiroir), clic vide = meme regle que la frise', /openPosteClientDrawer\(\\'' \+ a\.id/.test(poste) && /pdColClickAttr\(b, dateStr\)/.test(poste) && /barberOffReason\(rowB, dateStr\)/.test(fnSrc('pdColClickAttr')));
check('jour passe / salon ferme : pas d\'ajout', /if \(rdvIsSalonClosed\(dateStr\) \|\| isPastDay\(dateStr\)\) return '';/.test(fnSrc('pdColClickAttr')) && /if \(!closed && !past\) side \+=/.test(poste));
check('mes creneaux libres (sans pauses), prochain client, Moi seulement / Equipe, zoom', /Mes créneaux libres/.test(poste) && /Mon prochain client/.test(poste) && /function pdSetOnlyMe/.test(poste) && /function pdZoom/.test(poste) && /concat\(meDay \? meDay\.breaks : \[\]\)/.test(poste));
check('telephone : une seule colonne (la sienne ou celle touchee)', /if \(pdIsPhone\(\)\) \{\n    var fid = pdFocusId/.test(poste));
check('preferences gardees sans casser si le stockage est bloque (try/catch)', /try \{ localStorage\.setItem\('poste_day_only_me'/.test(poste) && /try \{\n  pdOnlyMe = localStorage\.getItem/.test(poste));
check('Mois / Semaine : planning du jour choisi inchange (renderAgendaTimeline)', /posteAddBtnHtml\(dateStr\) \+\n    renderAgendaTimeline\(dateStr\)/.test(poste) && /function renderAgendaTimeline\(dateStr\)/.test(poste));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
