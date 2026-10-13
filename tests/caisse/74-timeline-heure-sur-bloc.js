// Timeline des rendez-vous : l'heure du rdv est affichee sur le bloc, au-dessus du nom du client.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../../public/dashboard.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const fn = html.slice(html.indexOf('function renderDayTimelineHtml'));
const body = fn.slice(0, fn.indexOf('\nfunction ', 10) > 0 ? fn.indexOf('\nfunction ', 10) : 4000);
check('heure lue sur scheduled_at (HH:MM)', /var time = a\.scheduled_at\.slice\(11, 16\)/.test(body));
check('bloc : span tb-time avant le nom', /<span class="tb-time">' \+ esc\(time\) \+ '<\/span><span class="tb-name">' \+ esc\(a\.client_name\)/.test(body));
check('CSS .tb-time presente', /\.timeline-block \.tb-time\s*\{/.test(html));
check('CSS .tb-name tronque proprement', /\.timeline-block \.tb-name\s*\{[^}]*text-overflow:\s*ellipsis/.test(html));
check('bloc en colonne (heure au-dessus du nom)', /\.timeline-block\s*\{[^}]*flex-direction:\s*column/.test(html));
const cx = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
check('caisse (Agenda) : heure sur le bloc, au-dessus du nom', /<span class="tb-time">' \+ esc\(it\.timeLabel\) \+ '<\/span><span class="tb-name">' \+ esc\(it\.clientName\)/.test(cx));
check('caisse : CSS tb-time + bloc en colonne', /\.timeline-block \.tb-time\s*\{/.test(cx) && /\.timeline-block\s*\{[^}]*flex-direction:\s*column/.test(cx));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
