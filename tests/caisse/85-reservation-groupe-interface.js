// Reservation a plusieurs - interface : logique pure (raccourcis « a la suite », creneaux retenus) + rendu reel (jsdom)
// avec une API simulee + branchement dans rdv.html / compte.html.
// Lancer : NODE_PATH=/tmp/claude-0/jd/node_modules node tests/caisse/85-reservation-groupe-interface.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..', '..');
const GB = require(path.join(root, 'public/group-booking.js'));
let n = 0; const ok = (m) => { n++; console.log('OK  ' + m); };

const services = [{ id: 's1', name: 'Coupe', price_cents: 2000, duration_min: 30 }, { id: 's2', name: 'Barbe', price_cents: 1000, duration_min: 15 }];
const extras = [{ id: 'e1', name: 'Soin', price_cents: 500, duration_min: 10 }];
const barbers = [{ id: 'b1', name: 'Karim' }, { id: 'b2', name: 'Léo' }];

// --- logique pure
const p1 = { serviceId: 's1', extraIds: ['e1'], date: '2030-01-10', slot: { time: '10:00', barberId: 'b1' } };
assert.strictEqual(GB.personDuration(p1, services, extras), 40); assert.strictEqual(GB.personPrice(p1, services, extras), 2500);
ok('duree et prix = prestation + supplements');
assert.strictEqual(GB.heldParam([p1, { serviceId: 's2', extraIds: [], date: '2030-01-10' }], 1, '2030-01-10', services, extras), 'b1|2030-01-10|10:00|40');
assert.strictEqual(GB.heldParam([p1, {}], 0, '2030-01-10', services, extras), '');
assert.strictEqual(GB.heldParam([p1, {}], 1, '2030-01-11', services, extras), '');
ok('heldParam : seulement les AUTRES personnes, meme jour');
const sg = GB.computeSuggestions({ date: '2030-01-10', pref: '', slots: [{ time: '10:00', barber_id: 'b2' }, { time: '10:40', barber_id: 'b1' }],
  barberSlots: { b1: [{ time: '10:20', barber_id: 'b1' }, { time: '10:40', barber_id: 'b1' }, { time: '11:00', barber_id: 'b1' }] },
  others: [{ name: 'Lucas', date: '2030-01-10', time: '10:00', barberId: 'b1', duration: 40 }] });
assert.deepStrictEqual(sg.map((x) => x.kind + ':' + x.time + ':' + x.barberId), ['after:10:40:b1', 'same:10:00:b2']);
ok('raccourcis : « à la suite » (même coiffeur, ≥ fin) et « en même temps » (autre coiffeur)');
assert.deepStrictEqual(GB.computeSuggestions({ date: '2030-01-10', pref: 'b2', slots: [{ time: '10:00', barber_id: 'b2' }], others: [{ name: 'L', date: '2030-01-10', time: '10:00', barberId: 'b1', duration: 40 }] }).map((x) => x.kind), ['same']);
ok('coiffeur imposé différent : pas de « à la suite »');
const pl = GB.buildPayload([{ isSelf: true, name: '', serviceId: 's1', extraIds: [], date: 'd', slot: { time: '10:00', barberId: 'b1' } }, { name: ' Lucas ', serviceId: 's2', extraIds: ['e1'], date: 'd', slot: { time: '10:30', barberId: 'b2' } }]);
assert.deepStrictEqual(pl[1], { name: 'Lucas', service_id: 's2', extras: ['e1'], barber_id: 'b2', date: 'd', time: '10:30' }); assert.strictEqual(pl[0].name, '');
ok('buildPayload');

// --- rendu reel
let JSDOM; try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('jsdom absent : rendu ignoré'); }
(async () => {
  if (JSDOM) {
    const dom = new JSDOM('<div id="m"></div>', { pretendToBeVisual: true });
    global.document = dom.window.document; global.window = dom.window; global.self = dom.window;
    delete require.cache[require.resolve(path.join(root, 'public/group-booking.js'))];
    const GB2 = require(path.join(root, 'public/group-booking.js'));
    const calls = [];
    const api = (u) => { calls.push(u); const q = new URL('http://x' + u).searchParams; const bid = q.get('barber_id');
      const times = ['10:00', '10:20', '10:40', '11:00']; const held = q.get('held') || '';
      const slots = []; (bid ? [bid] : ['b1']).forEach((b) => times.forEach((t) => { if (held.indexOf(b + '|') === 0 && t === '10:00') return; slots.push({ time: t, barber_id: b }); }));
      return Promise.resolve({ slots }); };
    let done = null, solo = 0;
    GB2.create({ mount: document.getElementById('m'), api, services, extras, barbers, relatives: [{ id: 'r1', name: 'Lucas' }], eur: (c) => c / 100 + '€',
      today: () => '2030-01-10', onSolo: () => { solo++; }, onContinue: (p, payload) => { done = payload; } });
    const m = document.getElementById('m'), wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const clickEl = (sel) => { const e = m.querySelector(sel); assert(e, 'introuvable : ' + sel); click(e); };
    const eyebrow = () => (m.querySelector('.eyebrow') || {}).textContent || '';
    const goBtn = () => m.querySelector('.step-bar .go');

    assert(/Pour qui est le rendez-vous/.test(eyebrow()) && m.querySelector('[data-act=solo]') && m.querySelector('[data-act=multi]') && !m.querySelector('[data-act=who-self]'));
    ok('1er écran « Pour qui est le rendez-vous ? » : Juste moi / Plusieurs personnes');
    clickEl('[data-act=solo]'); assert(solo === 1); ok('« Juste moi » repart sur la réservation normale');
    clickEl('[data-act=multi]');
    assert(m.querySelector('[data-act=who-self].on') && m.querySelector('[data-act=who-rel]') && !m.querySelector('[data-act=who-rel].on') && !goBtn().disabled); ok('« Plusieurs personnes » : « Moi » (1re personne) déjà coché, les proches à cocher');
    clickEl('[data-act=who-rel]'); assert(/2 personnes/.test(goBtn().textContent)); clickEl('[data-act=who-next]');

    assert(/Que faites-vous/.test(eyebrow()) && m.querySelectorAll('.gb-pb').length === 2 && goBtn().disabled);
    ok('« Que fait chacun ? » : barre des personnes, rien de choisi');
    clickEl('[data-pick=service][data-id=s1]');
    assert(/Suivant : Lucas/.test(goBtn().textContent) && !goBtn().disabled); clickEl('[data-act=person-next]');
    assert(/Que fait Lucas/.test(eyebrow()) && m.querySelector('.gb-pb.done') && m.querySelector('[data-act=copy]'));
    ok('on passe à la personne suivante, avec « Même chose que ... »');
    clickEl('[data-act=copy]'); assert(m.querySelector('[data-pick=service][data-id=s1].sel, [data-pick=service].sel'));
    assert(/Choisir l'horaire/.test(goBtn().textContent)); ok('« Même chose que » recopie la prestation');
    clickEl('[data-act=person-next]'); await wait(80);

    assert(/Quand venez-vous/.test(eyebrow()) && m.querySelectorAll('.gb-day').length === 14);
    const plans = () => [...m.querySelectorAll('.gb-plan')].map((x) => x.textContent.replace(/\s+/g, ' '));
    assert(/10:00 → 11:10/.test(plans()[0]), plans()[0]); ok('horaires proposés « les uns après les autres » (10:00 → 11:10)');
    clickEl('[data-act=plan-mode][data-mode=same]'); await wait(80);
    assert(/10:00 → 10:30/.test(plans()[0]) && /Karim/.test(plans()[0]) && /Léo/.test(plans()[0]), plans()[0]); ok('« En même temps » : même heure, deux coiffeurs différents');
    assert(goBtn().disabled); clickEl('.gb-plan'); assert(!goBtn().disabled); ok('choisir un horaire active « Continuer »');
    clickEl('[data-act=to-recap]');
    assert(/On vérifie ensemble/.test(eyebrow()) && m.querySelectorAll('.gb-row').length === 2); ok('récapitulatif des 2 personnes');

    clickEl('.gb-row:last-child [data-act=edit]'); assert(/Que fait Lucas/.test(eyebrow()) && /Valider/.test(goBtn().textContent));
    clickEl('[data-pick=service][data-id=s2]'); assert(/Choisir l'horaire/.test(goBtn().textContent)); ok('modifier une prestation efface l’horaire choisi');
    clickEl('[data-act=person-next]'); await wait(80);
    clickEl('[data-act=sep]'); await wait(80);
    assert(/Date et heure/.test(eyebrow()) && m.querySelector('.slot-btn')); clickEl('.slot-btn[data-time="10:00"]'); clickEl('[data-act=dt-next]'); await wait(200);
    assert(/Lucas — Date et heure/.test(eyebrow())); assert(calls.some((u) => /held=b1%7C/.test(u)), 'held envoyé');
    ok('« Choisir l’heure de chacun séparément » : personne par personne, en tenant compte des autres (held)');
    assert(m.querySelector('.gb-chip.sugg')); clickEl('.gb-chip.sugg[data-act=sugg]'); clickEl('[data-act=dt-next]');
    assert(/On vérifie ensemble/.test(eyebrow())); ok('raccourci « à la suite » puis retour au récapitulatif');
    clickEl('.gb-row [data-act=rm]'); assert(m.querySelectorAll('.gb-row').length === 1); ok('la croix retire une personne');
    const btn = m.querySelector('[data-act=continue]'); assert(btn && !btn.disabled); click(btn); await wait(20);
    assert(done && done.length === 1); ok('réservation possible pour une seule personne restante');

    // logique pure des horaires proposes
    const o = (t, b, d) => ({ time: t, min: +t.slice(0, 2) * 60 + +t.slice(3), barberId: b, dur: d });
    const opts = [[o('10:00', 'a', 30), o('10:00', 'b', 30)], [o('10:30', 'a', 20), o('10:30', 'b', 20)]];
    assert.strictEqual(GB.buildPlans(opts, 'seq', 0)[0].items.map((x) => x.time + x.barberId).join(), '10:00a,10:30a');
    assert.strictEqual(GB.buildPlans(opts, 'seq', 15)[0].items.map((x) => x.time + x.barberId).join(), '10:00a,10:30b');
    assert.strictEqual(GB.buildPlans([[o('10:00', 'a', 30)], [o('10:00', 'a', 30)]], 'same', 0).length, 0);
    ok('buildPlans : même coiffeur à la suite, marge tampon respectée, jamais deux personnes en même temps chez le même coiffeur');
  }
  const rdv = fs.readFileSync(path.join(root, 'public/rdv.html'), 'utf8'), cmp = fs.readFileSync(path.join(root, 'public/compte.html'), 'utf8');
  for (const [f, h] of [['rdv', rdv], ['compte', cmp]]) {
    assert(/group-booking\.js/.test(h) && /GroupBooking\.create/.test(h) && /appointments\/group/.test(h), f); }
  assert(/cancel-group/.test(rdv) && /get\('all'\)/.test(rdv)); assert(/relatives/.test(cmp) && /person_name/.test(cmp));
  ok('rdv.html / compte.html branchés (groupe, annulation groupée, proches, prénom sur les RDV)');
  assert(/<section class="panel flow on gb-pick" id="p-start">/.test(rdv) && /<section class="panel flow gb-pick" id="p-group">/.test(rdv) && /onSolo: STAFF_BRIDGE \? null/.test(rdv) && !/GroupBooking\.tileHtml/.test(rdv) && !/GroupBooking\.tileHtml/.test(cmp));
  assert(/onSolo: function \(\) \{ bkSoloMode\(\); show\('p-book-barber'\); \}/.test(cmp) && /openBookGroup\(true\)/.test(cmp));
  ok('« Pour qui est le rendez-vous ? » juste apres le choix du compte (rdv.html) / en premier (Mon compte), plus de tuile dans la grille des coiffeurs');
  assert((rdv.match(/class="login-hint"/g) || []).length === 2 && /function accountUrl\(extra\)[\s\S]*?'\/compte\.html'/.test(rdv) && /function goLogin\(e, book\)/.test(rdv) && /staff-mode \.login-hint\{display:none/.test(rdv.replace(/,body\.staff-mode /g, ' ').replace(/body\.staff-mode \.gift-summary-box /, 'staff-mode ')) || /body\.staff-mode[^{]*\.login-hint\{display:none/.test(rdv));
  ok('réservation sans compte : « Vous avez un compte ? Se connecter » sur les deux formulaires (caché en mode salon)');
  console.log('\n' + n + ' vérifications OK');
})().catch((e) => { console.error('ECHEC', e); process.exit(1); });
