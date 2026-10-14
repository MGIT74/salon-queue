// Selecteur de periode (Du / Au) : raccourcis, libelle, ouverture, Appliquer/Annuler, compatibilite avec les champs date d'origine (jsdom si dispo).
const fs = require('fs');
let pass = 0, fail = 0;
const check = (n, ok, extra) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (ok || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
const src = fs.readFileSync(__dirname + '/../../public/daterange.js', 'utf8');
const dash = fs.readFileSync(__dirname + '/../../public/dashboard.html', 'utf8');

// Branchement dans le dashboard : 6 couples Du/Au
const ids = ['sales-detail', 'closings', 'rdv-filter', 'client-date', 'stats', 'asc'];
check('dashboard : script charge + 6 couples Du/Au branches (data-range-to)', /<script src="\/daterange.js\?v=\d+"><\/script>/.test(dash) && (dash.match(/data-range-to=/g) || []).length === 6, (dash.match(/data-range-to=/g) || []).length);
check('dashboard : plus aucun champ "Du" natif sans selecteur', (dash.match(/<label[^>]*>Du<\/label><input[^>]*>/g) || []).every((x) => /data-range-to/.test(x)) && !/<label[^>]*>Du<\/label>\s*<input[^>]*type="date"(?![^>]*data-range-to)/.test(dash));

let JSDOM = null; try { JSDOM = require('jsdom').JSDOM; } catch (_) { /* absent */ }
if (!JSDOM) { console.log('  (jsdom absent : comportement non teste)'); console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)'); process.exit(fail ? 1 : 0); }

const dom = new JSDOM('<body><div class="fld"><label>Du</label><input id="a" type="date" value="2026-10-01" data-range-to="b"></div><div class="fld"><label>Au</label><input id="b" type="date" value="2026-10-31"></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.nowSalonDatetimeString = () => '2026-10-14 16:00:00'; // mercredi
w.eval(src);
const DR = w.DateRange; DR.scan(w.document);
const P = Object.fromEntries(DR.presets(new w.Date(2026, 9, 14)).map((p) => [p.id, p]));
check('raccourcis : aujourd\'hui / demain / hier', P.today.from === '2026-10-14' && P.tomorrow.from === '2026-10-15' && P.yesterday.to === '2026-10-13');
check('raccourcis : cette semaine = lundi 12 au dimanche 18', P.week.from === '2026-10-12' && P.week.to === '2026-10-18', P.week);
check('raccourcis : 7/30 prochains et derniers jours', P.next7.to === '2026-10-20' && P.next30.to === '2026-11-12' && P.last7.from === '2026-10-08' && P.last30.from === '2026-09-15');
check('raccourcis : mois en cours / suivant / dernier / annee', P.month.from === '2026-10-01' && P.month.to === '2026-10-31' && P.nextmonth.to === '2026-11-30' && P.lastmonth.from === '2026-09-01' && P.lastmonth.to === '2026-09-30' && P.year.from === '2026-01-01' && P.year.to === '2026-12-31');
check('raccourci "Toutes les dates" = vide', P.all.from === '' && P.all.to === '');
check('libelles', DR.label('', '') === 'Toutes les dates' && DR.label('2026-10-05', '2026-10-05') === '5 oct. 2026' && DR.label('2026-10-01', '2026-10-31') === '1 oct. → 31 oct. 2026' && /^Depuis le/.test(DR.label('2026-10-01', '')));

const doc = w.document, a = doc.getElementById('a'), b = doc.getElementById('b');
const btn = doc.querySelector('.dr-btn');
check('un bouton remplace les deux champs (caches), libelle affiche', !!btn && a.parentNode.style.display === 'none' && b.parentNode.style.display === 'none' && /1 oct\. → 31 oct\. 2026/.test(btn.textContent));
check('bouton range dans un champ "Période" (meme gabarit que Statut / Coiffeur)', !!btn.parentNode.classList.contains('fld') && /Période/.test(btn.parentNode.textContent.slice(0, 8)));
let fired = 0; b.addEventListener('change', () => fired++); a.addEventListener('change', () => fired += 100);
btn.click();
const pop = () => doc.querySelector('.dr-pop');
check('clic : fenetre ouverte, 2 mois, 13 raccourcis', !!pop() && pop().querySelectorAll('.dr-cal').length === 2 && pop().querySelectorAll('.dr-preset').length === 13);
check('raccourci actif surligne (Mois en cours)', pop().querySelector('.dr-preset.on').textContent === 'Mois en cours');
pop().querySelector('.dr-preset[data-p="last7"]').click();
check('raccourci : choisit la periode sans l\'appliquer encore', a.value === '2026-10-01' && /8 oct\. → 14 oct\. 2026/.test(pop().querySelector('#dr-sum').textContent));
pop().querySelector('.dr-d[data-v="2026-10-20"]').click();
pop().querySelector('.dr-d[data-v="2026-10-16"]').click();
check('2 clics (dans le desordre) : debut/fin ordonnes', /16 oct\. → 20 oct\. 2026/.test(pop().querySelector('#dr-sum').textContent) && pop().querySelectorAll('.dr-d.in').length >= 5);
pop().querySelector('.dr-apply').click();
check('Appliquer : champs d\'origine mis a jour, change emis UNE fois sur "Au" seulement', a.value === '2026-10-16' && b.value === '2026-10-20' && fired === 1 && !pop(), [a.value, b.value, fired]);
check('libelle du bouton mis a jour', /16 oct\. → 20 oct\. 2026/.test(btn.textContent));
btn.click(); pop().querySelector('.dr-preset[data-p="today"]').click(); pop().querySelector('.dr-cancel').click();
check('Annuler : rien ne change', a.value === '2026-10-16' && fired === 1 && !pop());
a.value = ''; b.value = '';
check('modification de .value par le code existant : libelle suivi', /Toutes les dates/.test(btn.textContent));
btn.click(); pop().querySelector('.dr-d[data-v="2026-10-10"]').click(); pop().querySelector('.dr-apply').click();
check('un seul jour choisi : debut = fin', a.value === '2026-10-10' && b.value === '2026-10-10');
btn.click(); pop().querySelector('.dr-preset[data-p="all"]').click(); pop().querySelector('.dr-apply').click();
check('"Toutes les dates" : efface la periode et previent le code (change)', a.value === '' && b.value === '' && fired === 3, fired);
btn.click(); w.dispatchEvent(new w.Event('scroll')); doc.dispatchEvent(new w.Event('scroll', { bubbles: true }));
check('defilement de la page : la fenetre reste ouverte', !!pop());
btn.click(); btn.click(); btn.click(); doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
check('Echap ferme la fenetre', !pop());

// champs ajoutes plus tard par un rendu (ex. statistiques par coiffeur)
doc.body.insertAdjacentHTML('beforeend', '<div class="stats-range-picker"><div class="fld"><input type="date" id="s1" data-range-to="s2" value="2026-10-14"></div><div class="fld"><input type="date" id="s2" value="2026-10-14"></div></div>');
DR.scan(doc);
check('champs ajoutes apres coup : repares et branches', doc.querySelectorAll('.dr-btn').length === 2 && /14 oct\. 2026/.test(doc.querySelectorAll('.dr-btn')[1].textContent));
console.log('\nRESULTAT : ' + pass + ' verifications reussies, ' + fail + ' echec(s)');
process.exit(fail ? 1 : 0);
