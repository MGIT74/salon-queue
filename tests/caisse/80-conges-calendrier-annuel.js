// Onglet Conges d'un coiffeur : calendrier annuel, glisser pour choisir plusieurs jours, bulle « En congé / Répéter chaque année / Fermer ».
const fs = require('fs'), path = require('path');
const rd = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const dash = rd('public/dashboard.html'), br = rd('src/routes/barbers.js'), sql = rd('sql/schema.sql');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('onglet : plus de formulaire Du/Au, un calendrier annuel', /class="lv-year" id="leaves-list-/.test(dash) && !/id="leave-start-/.test(dash));
check('12 mois, navigation d\'annee (‹ 2026 ›)', /LV_MONTHS = \['janvier'/.test(dash) && /data-nav="-1"/.test(dash) && /data-nav="1"/.test(dash));
check('glisser la souris : selection de plusieurs jours (mousedown / mouseover / mouseup)', /box\.onmousedown/.test(dash) && /box\.onmouseover/.test(dash) && /document\.addEventListener\('mouseup'/.test(dash));
check('bulle : « En congé », « Répéter chaque année » (inactive si pas en congé), Fermer', /En congé ce jour/.test(dash) && /Répéter chaque année/.test(dash) && /lvClose\(/.test(dash) && /allOff \? '' : ' disabled'/.test(dash));
check('un clic sur la case enregistre aussitot (API jours)', /\/leaves\/days', \{ method: 'POST', body: \{ dates: st\.sel, on: on, repeat: rep \}/.test(dash));
check('jours en congé en jaune, aujourd\'hui marque, total de l\'annee', /\.lv-day\.off \{ background: #ffc107/.test(dash) && /jour' \+ \(count > 1 \? 's' : ''\) \+ ' de congé en '/.test(dash));
check('Echap et clic en dehors ferment la bulle', /e\.key !== 'Escape'/.test(dash) && /!e\.target\.closest\('\.lv-day'\) && !e\.target\.closest\('\.lv-bubble'\)/.test(dash));
check('serveur : POST /:id/leaves/days (coiffeur du salon, transaction)', /router\.post\('\/:id\/leaves\/days'/.test(br) && /beginTransaction/.test(br) && /owned/.test(br));
check('base : colonne barber_leaves.repeat_yearly', /column_name = 'repeat_yearly'/.test(sql));
check('glisse vertical : cases vides / en-tete du mois = jour le plus proche (jamais de selection qui s\'arrete court)', /function lvDateUnder\(el\)/.test(dash) && /data-edge="first"/.test(dash) && /data-edge="last"/.test(dash) && /var b = lvDateUnder\(e\.target\)/.test(dash));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
