// Mon poste > Agenda > Jour (proposition C) : recherche client, coup d'œil de l'equipe, agenda en colonnes.
// Les vues Mois/Semaine et leur planning (renderAgendaTimeline) restent inchanges.
const fs = require('fs'), path = require('path'), vm = require('vm');
const poste = fs.readFileSync(path.join(__dirname, '../../public/poste.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const fnSrc = (name) => { const i = poste.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = poste.indexOf('\nfunction ', i + 10); const k = poste.indexOf('\n/**', i + 10); return poste.slice(i, Math.min.apply(null, [j, k].filter((x) => x > -1))); };
const ctx = vm.createContext({});
vm.runInContext(['pdMin', 'pdHM', 'pdDur', 'pdFg', 'pdState', 'pdBarberDay', 'pdLayout', 'pdLaneCss', 'pdTimeScale'].map(fnSrc).join('\n'), ctx);

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
check('recherche client (nom, telephone, email) + resultats « Ce jour » / « Autres jours »', /id="pd-search"/.test(poste) && /pLabel = 'Ce jour'/.test(poste) && /pLabel = 'Cette semaine'/.test(poste) && /pLabel = 'Ce mois'/.test(poste) && /Autres jours<\/div>/.test(poste) && /function pdRunSearch/.test(poste));

console.log('\n[C] Semaine et Mois au meme style');
check('semaine : recherche + coup d\'œil des 7 jours (une piste par coiffeur) + 7 colonnes', /document\.getElementById\('cal-days'\)\.innerHTML = pdWeekHtml\(start\);/.test(poste) && /La semaine en un coup d’œil/.test(poste) && /pd-wk-cols/.test(poste));
check('semaine : clic RDV = fiche, clic vide = ajouter pour moi ce jour-la, clic en-tete = vue Jour', /pd-wk-block[\s\S]{0,800}openPosteClientDrawer/.test(poste) && /pdColClickAttr\(meB, d\)/.test(poste) && /pd-wk-head[\s\S]{0,300}pdShowDay/.test(poste));
check('mois : recherche + chiffres du mois + cartes (RDV, les miens, couleurs) ; toucher = vue Jour', /document\.getElementById\('cal-days'\)\.innerHTML = pdMonthHtml\(\);/.test(poste) && /RDV ce mois/.test(poste) && /pd-mchip/.test(poste) && /onclick="pdShowDay\(/.test(poste));
check('un seul champ de recherche dans la page (l\'autre vue est videe)', /document\.getElementById\('cal-days'\)\.innerHTML = '';   \/\/ un seul champ/.test(poste) && (poste.match(/document\.getElementById\('cal-day-view'\)\.innerHTML = '';/g) || []).length >= 2);
check('Moi seulement / Equipe et zoom redessinent la vue affichee', /function pdRerender\(\)/.test(poste) && /pdSetOnlyMe[\s\S]{0,300}pdRerender\(\)/.test(poste) && /pdZoom[\s\S]{0,400}pdRerender\(\)/.test(poste));
check('RDV trouves allumes dans l\'agenda, les autres pâlis', /classList\.toggle\('pd-hit'/.test(poste) && /classList\.toggle\('pd-dim'/.test(poste));
check('« + Nouveau RDV pour … » pre-remplit le nom (ou tel / email)', /function pdNewForQuery/.test(poste) && /nameEl\.value = q/.test(poste));
check('coup d\'œil : une barre par coiffeur, trait « maintenant », resume', /La journée en un coup d’œil/.test(poste) && /pdGlanceSegHtml\(it, 'st-'/.test(poste) && /Libre jusqu’à /.test(poste));
check('agenda en colonnes : clic RDV = fiche (tiroir), clic vide = meme regle que la frise', /openPosteClientDrawer\(\\'' \+ a\.id/.test(poste) && /pdColClickAttr\(b, dateStr\)/.test(poste) && /barberOffReason\(rowB, dateStr\)/.test(fnSrc('pdColClickAttr')));
check('jour passe / salon ferme : pas d\'ajout', /if \(rdvIsSalonClosed\(dateStr\) \|\| isPastDay\(dateStr\)\) return '';/.test(fnSrc('pdColClickAttr')) && /\(!closed && !past \? '<button type="button" class="btn btn-primary pd-add-top"/.test(poste));
check('plus de colonne de cote : l\'agenda prend toute la largeur ; Moi seulement / Equipe, zoom et « + Ajouter un RDV » dans sa barre ; creneaux libres + prochain dans l\'agenda', !/<h4>Mes créneaux libres/.test(poste) && !/<aside class="pd-side">/.test(poste) && /return html \+ cal;/.test(poste) && /pd-cal-tools-r[\s\S]{0,400}pdSetOnlyMe\(true\)/.test(fnSrc('posteDayHtml')) && /function pdZoom/.test(poste) && /concat\(meDay \? meDay\.breaks : \[\]\)/.test(poste) && /class="pd-free/.test(poste) && /isNext \? 'Prochain'/.test(poste));
check('telephone : une seule colonne (la sienne ou celle touchee)', /if \(pdIsPhone\(\)\) \{\n    var fid = pdFocusId/.test(poste));
check('preferences gardees sans casser si le stockage est bloque (try/catch)', /try \{ localStorage\.setItem\('poste_day_only_me'/.test(poste) && /try \{\n  pdOnlyMe = localStorage\.getItem/.test(poste));
check('Mois / Semaine : planning du jour choisi inchange (renderAgendaTimeline)', /posteAddBtnHtml\(dateStr\) \+\n    renderAgendaTimeline\(dateStr\)/.test(poste) && /function renderAgendaTimeline\(dateStr\)/.test(poste));
check('mois : chaque jour = seulement les pastilles de couleur des coiffeurs avec leur nombre de RDV (plus de texte)', /'<span class="pd-mchips">' \+ chips \+ '<\/span>'/.test(poste) && !/pd-mcount/.test(poste));
console.log('\n[D] Finitions (Mois / Semaine / Jour)');
const L = ctx.pdLayout([{ start: 600, end: 630 }, { start: 615, end: 645 }, { start: 630, end: 660 }, { start: 700, end: 730 }]);
check('RDV qui se chevauchent : cote a cote (voies), les autres en pleine largeur', L[0].lanes === 2 && L[1].lanes === 2 && L[2].lanes === 2 && L[0].lane === 0 && L[1].lane === 1 && L[2].lane === 0 && L[3].lanes === 1 && ctx.pdLaneCss(L[3]) === '' && /width:calc\(50\.000% - 2px\)/.test(ctx.pdLaneCss(L[1])));
check('voies utilisees dans le Jour (par coiffeur) et la Semaine (par jour)', /pdLayout\(items\.filter\(function \(it\) \{ return it\.barberId === b\.id; \}\)\)/.test(poste) && /pdLayout\(shown\.filter\(function \(it\) \{ return it\.day === d; \}\)\)/.test(poste) && (poste.match(/pdLaneCss\(it\)/g) || []).length >= 2);
check('RDV passes / termines : gardent la couleur du coiffeur (plus pales), plus de gris', /\.pd-block\.st-done, \.pd-block\.st-past \{ opacity: \.5; \}/.test(poste) && !/\.pd-block\.st-done, \.pd-block\.st-past \{ background: var\(--card\)/.test(poste));
check('semaine sur telephone : initiale du client dans le bloc', /String\(a\.client_name \|\| '\?'\)\.charAt\(0\)\.toUpperCase\(\)/.test(poste));
check('mois : pastilles toujours dans le meme ordre (moi d\'abord, puis l\'equipe)', /Object\.keys\(byB\)\.sort\(function \(x, y\) \{ return order\(x\) - order\(y\); \}\)/.test(poste));
check('jour : un trait entre chaque colonne de coiffeur + largeur mini -> defilement a droite / a gauche (heures collees a gauche, noms en haut)', /\.pd-cols \.pd-col \+ \.pd-col::before \{/.test(poste) && /\.pd-cal-scroll\.pd-xs \{ overflow: auto;/.test(poste) && /\.pd-gutter \{ position: sticky; left: 0;/.test(poste) && /\.pd-xs-head \{ position: sticky; top: 0;/.test(poste) && /var colW = function \(\) \{ return single \? 0 : 190; \};/.test(poste) && /return 'flex:1 1 ' \+ colW\(b\)/.test(poste) && /style="min-width:' \+ minW \+ 'px"/.test(poste));
check('zoom : un curseur (Jour et Semaine) a la place des boutons − / +, apercu pendant le glissement, meme heure gardee en haut', (poste.match(/pdZoomSliderHtml\(\) \+/g) || []).length === 2 && !/onclick="pdZoom\(-1\)"/.test(poste) && /type="range" min="0\.8" max="6"/.test(poste) && /oninput="pdZoomPreview\(this\.value\)" onchange="pdSetZoom\(this\.value\)"/.test(poste) && /sc2\.scrollTop = Math\.round\(topMin \* pdPx\)/.test(poste));
ctx.rdvSlotStepMin = 5;
const tsA = ctx.pdTimeScale(540, 600, 1.3), tsB = ctx.pdTimeScale(540, 600, 4.5);
check('heures de l\'agenda selon le « pas des creneaux » (Rendez-vous > Parametres) : 5 min -> 09:30 a petit zoom, 09:05 a grand zoom', /09:30/.test(tsA.hours) && !/09:05/.test(tsA.hours) && !/09:20/.test(tsA.hours) && /09:05/.test(tsB.hours) && /09:55/.test(tsB.hours) && /10:00/.test(tsB.hours) && (poste.match(/= pdTimeScale\(R0, R1, PX\)/g) || []).length === 2 && /max="6" step="0\.1"/.test(poste));
ctx.rdvSlotStepMin = 15;
check('pas de 15 min : 09:15 / 09:30 / 09:45 quand la place le permet', /09:15/.test(ctx.pdTimeScale(540, 600, 2).hours) && /09:45/.test(ctx.pdTimeScale(540, 600, 2).hours));
check('coup d\'œil du jour : photo seule a gauche (nom en info-bulle), icone RDV / Sans RDV de l\'app a droite', /'<span class="pd-g-name" title="' \+ esc\(isMe \? b\.name \+ ' \(moi\)' : b\.name\) \+ '">' \+ pdAvatarHtml\(b\) \+ '<\/span>'/.test(poste) && /rdvModeIconSvg\(walkMode, 16\)/.test(poste) && /var walkMode = !!\(rowB && \(walkDay \|\| !rowB\.kiosk_hidden\)\);/.test(poste) && /class="pd-glance pd-g-day"/.test(poste));
check('« Moi seulement » : le coup d\'œil du jour ne montre que ma ligne (pas sur telephone)', /var glanceTeam = pdOnlyMe && !pdIsPhone\(\)[\s\S]{0,120}team\.filter\(function \(b\) \{ return b\.id === myId; \}\) : team;\n  var rows = glanceTeam\.map/.test(poste));
check('coup d\'œil de la semaine : icone RDV / Sans RDV (mon mode ce jour-la) a droite, le nombre de RDV en info-bulle', /rdvModeIconSvg\(wkWalk, 16\)/.test(poste) && /class="pd-glance pd-g-week"/.test(poste) && /var wkWalk = !!\(meRow && \(isWalkinOn\(meRow, d\) \|\| !meRow\.kiosk_hidden\)\)/.test(poste));
check('coup d\'œil (jour + semaine) : toucher un creneau = fiche du client tout de suite (sans descendre ni changer de vue), heure + nom en petit dedans', /onclick="event\.stopPropagation\(\);openPosteClientDrawer/.test(fnSrc('pdGlanceSegHtml')) && /<span class="pd-g-txt/.test(fnSrc('pdGlanceSegHtml')) && (poste.match(/return pdGlanceSegHtml\(it,/g) || []).length === 2 && /var dayLanes = lanes\.filter/.test(poste));
check('coup d\'œil du jour : toucher un espace libre = prise de RDV de ce coiffeur (heure touchee mise en avant), memes refus', /class="pd-g-bar pd-g-add"[^\n]*onclick="pdGlanceAdd\(event/.test(poste) && /ev\.stopPropagation\(\);/.test(fnSrc('pdGlanceAdd')) && /barberOffReason/.test(fnSrc('pdGlanceAdd')) && /isWalkinOn/.test(fnSrc('pdGlanceAdd')) && /pdPrefTime = pdHM\(m\);\n  openPosteAddAppointment\(dateStr, barberId\);/.test(poste) && /var prefTime = typeof pdPrefTime !== 'undefined' \? pdPrefTime : null;/.test(poste) && /near\.classList\.add\('pref'\)/.test(poste));
check('coup d\'œil (jour + semaine) : un tiret a chaque pas des creneaux sous les heures', (poste.match(/ticks \+= pdGlanceStepTicks\(R0, R1, pct\);/g) || []).length === 2 && /var step = rdvSlotStepMin > 0 \? rdvSlotStepMin : 15/.test(fnSrc('pdGlanceStepTicks')));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
