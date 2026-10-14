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
    let done = null;
    GB2.create({ mount: document.getElementById('m'), api, services, extras, barbers, relatives: [{ id: 'r1', name: 'Lucas' }], eur: (c) => c / 100 + '€', onContinue: (p, payload) => { done = payload; } });
    const m = document.getElementById('m'), wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    const clickEl = (sel) => { const e = m.querySelector(sel); assert(e, 'introuvable : ' + sel); click(e); };
    const eyebrow = () => (m.querySelector('.eyebrow') || {}).textContent || '';
    assert(/Choisissez le coiffeur/.test(eyebrow())); ok('on démarre comme la réservation normale : étape coiffeur');
    clickEl('[data-pick=barber][data-id=""]'); clickEl('[data-act=next]');
    assert(/Prestation/.test(eyebrow())); ok('coiffeur → prestation (une étape par écran)');
    clickEl('[data-pick=service][data-id=s1]'); clickEl('[data-act=next]');
    assert(/Suppléments/.test(eyebrow())); clickEl('[data-act=next]');
    assert(/Date et heure/.test(eyebrow())); ok('prestation → suppléments → date et heure');
    await wait(60);
    assert(m.querySelector('.slot-btn')); clickEl('.slot-btn[data-time="10:00"]'); clickEl('[data-act=next]');
    assert(/Réserver pour plusieurs/.test(eyebrow()) && m.querySelectorAll('.gb-row').length === 1); ok('créneau validé → récapitulatif des personnes');
    assert(m.querySelector('[data-act=add-rel]')); ok('proches proposés en un clic');
    clickEl('[data-act=add]');
    assert(/Qui vient/.test(eyebrow())); const nm = m.querySelector('#gb-name');
    assert(m.querySelector('[data-act=next]').disabled); nm.value = 'Tom'; nm.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert(!m.querySelector('[data-act=next]').disabled); clickEl('[data-act=next]'); ok('nouvelle personne : prénom puis mêmes étapes');
    assert(m.querySelector('[data-pick=barber].sel'), 'coiffeur pré-sélectionné'); clickEl('[data-act=next]');
    assert(m.querySelector('[data-pick=service].sel')); clickEl('[data-pick=service][data-id=s2]'); clickEl('[data-act=next]'); clickEl('[data-act=next]');
    await wait(400);
    assert(calls.some((u) => /held=b1%7C/.test(u)), 'held envoyé'); ok('les créneaux de la 2e personne tiennent compte de la 1re (held)');
    assert(m.querySelector('.gb-chip.sugg'), 'raccourci'); ok('raccourci « à la suite » affiché');
    clickEl('.gb-chip.sugg[data-act=sugg]'); assert(m.querySelector('.slot-btn.sel, .gb-ok')); clickEl('[data-act=next]');
    const btn = m.querySelector('[data-act=continue]'); assert(btn && !btn.disabled, 'continuer actif'); click(btn); await wait(20);
    assert(done && done.length === 2 && done[1].name === 'Tom' && done[1].service_id === 's2' && done[0].time === '10:00'); ok('Continuer envoie le bon payload');
  }
  const rdv = fs.readFileSync(path.join(root, 'public/rdv.html'), 'utf8'), cmp = fs.readFileSync(path.join(root, 'public/compte.html'), 'utf8');
  for (const [f, h] of [['rdv', rdv], ['compte', cmp]]) {
    assert(/group-booking\.js/.test(h) && /GroupBooking\.create/.test(h) && /appointments\/group/.test(h), f); }
  assert(/cancel-group/.test(rdv) && /get\('all'\)/.test(rdv)); assert(/relatives/.test(cmp) && /person_name/.test(cmp));
  ok('rdv.html / compte.html branchés (groupe, annulation groupée, proches, prénom sur les RDV)');
  console.log('\n' + n + ' vérifications OK');
})().catch((e) => { console.error('ECHEC', e); process.exit(1); });
