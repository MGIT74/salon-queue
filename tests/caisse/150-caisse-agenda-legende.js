// Caisse > Agenda : legende des couleurs des coiffeurs sous le calendrier (Mois et Semaine), comme dans l'admin.
const fs = require('fs'), path = require('path'), vm = require('vm');
const caisse = fs.readFileSync(path.join(__dirname, '../../public/caisse.html'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); if (i === -1) throw new Error('introuvable: ' + name); const j = src.indexOf('\nfunction ', i + 10); const k = src.indexOf('\n/**', i + 10); const ends = [j, k].filter((x) => x > -1); return src.slice(i, ends.length ? Math.min.apply(null, ends) : undefined); };
const ctx = vm.createContext({
  allBarbers: [{ id: 'b1', name: 'Alice', color: '#ff0000' }, { id: 'b2', name: 'Bob', color: '#0000ff' }],
  barberColorOf: (id, list) => (list.find((b) => b.id === id) || {}).color || '#888',
  esc: (s) => String(s).replace(/</g, '&lt;'),
});
vm.runInContext(fnSrc(caisse, 'calLegendHtml'), ctx);
const html = ctx.calLegendHtml([{ barber_id: 'b1', barber_name: 'Alice' }, { barber_id: 'b2' }, { barber_id: 'b1', barber_name: 'Alice' }, { barber_id: null }]);
check('un nom par coiffeur ayant un RDV, sans doublon', (html.match(/Alice/g) || []).length === 1 && /Bob/.test(html));
check('meme couleur que les points du calendrier (couleur de la fiche)', /background:#ff0000[^]*Alice/.test(html) && /background:#0000ff[^]*Bob/.test(html));
check('RDV sans coiffeur : « Non assigné » en gris', /background:var\(--grey\)"><\/span>Non assigné/.test(html));
check('aucun RDV : message', /Aucun coiffeur avec un RDV/.test(ctx.calLegendHtml([])));
check('affichee en vue Mois', /html \+= calLegendHtml\(monthAppts\);/.test(caisse));
check('affichee en vue Semaine', /html \+= calLegendHtml\(weekAppts\);/.test(caisse));
check('styles de la legende presents', /\.cal-legend \{/.test(caisse) && /\.cal-legend-dot \{/.test(caisse));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
