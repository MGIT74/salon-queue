// Onglet Conges d'un coiffeur : calendrier annuel, glisser pour choisir plusieurs jours, bulle « En congé / Répéter chaque année / Fermer ».
const fs = require('fs'), path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const dash = rd('public/dashboard.html'), br = rd('src/routes/barbers.js'), sql = rd('sql/schema.sql');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('onglet : plus de formulaire Du/Au, un calendrier annuel', /class="lv-year" id="leaves-list-/.test(dash) && !/id="leave-start-/.test(dash));
check('12 mois, navigation d\'annee (‹ 2026 ›)', /LV_MONTHS = \['janvier'/.test(dash) && /data-nav="-1"/.test(dash) && /data-nav="1"/.test(dash));
check('glisser la souris : selection de plusieurs jours (mousedown / mousemove / mouseup)', /box\.onmousedown/.test(dash) && /box\.onmousemove/.test(dash) && /document\.addEventListener\('mouseup'/.test(dash));
check('bulle : « En congé », « Répéter chaque année » (inactive si pas en congé), Fermer', /En congé ce jour/.test(dash) && /Répéter chaque année/.test(dash) && /lvClose\(/.test(dash) && /allOff \? '' : ' disabled'/.test(dash));
check('un clic sur la case enregistre aussitot (API jours)', /\/leaves\/days', \{ method: 'POST', body: \{ dates: st\.sel, on: on, repeat: rep \}/.test(dash));
check('jours en congé en jaune, aujourd\'hui marque, total de l\'annee', /\.lv-day\.off \{ background: #ffc107/.test(dash) && /jour' \+ \(count > 1 \? 's' : ''\) \+ ' de congé en '/.test(dash));
check('Echap et clic en dehors ferment la bulle', /e\.key !== 'Escape'/.test(dash) && /!e\.target\.closest\('\.lv-day'\) && !e\.target\.closest\('\.lv-bubble'\)/.test(dash));
check('serveur : POST /:id/leaves/days (coiffeur du salon, transaction)', /router\.post\('\/:id\/leaves\/days'/.test(br) && /beginTransaction/.test(br) && /owned/.test(br));
check('base : colonne barber_leaves.repeat_yearly', /column_name = 'repeat_yearly'/.test(sql));
check('mobile : appui maintenu + glisser = plusieurs jours, appui court = un jour, balayage rapide = defilement normal', /addEventListener\('touchstart'/.test(dash) && /addEventListener\('touchmove'[\s\S]*\{ passive: false \}/.test(dash) && /setTimeout\(function \(\) \{\s*st\.touchActive = true/.test(dash) && /document\.elementFromPoint/.test(dash) && /function lvExtendSel\(/.test(dash));
check('selection LIBRE : le pointeur peint les jours traverses (diagonale, cercle...), trajet suivi pas a pas', /function lvExtendSel\(id, box, x, y\)/.test(dash) && /Math\.hypot\(x - x0, y - y0\) \/ 5/.test(dash) && /document\.elementFromPoint\(x0 \+ \(x - x0\)/.test(dash) && /box\.onmousemove/.test(dash) && !/getUTCDay\(\) === wd/.test(dash));
check('diagonale : seul le centre de la case compte (bords ignores), les cases voisines frolees ne sont pas prises', /r\.width \* 0\.22/.test(dash) && /px < r\.left \+ mx/.test(dash));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
