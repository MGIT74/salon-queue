// (1) Limite de tentatives sur la recherche publique de carte cadeau.
// (2) Ecran de caisse : relancer un paiement carte "incertain" demande confirmation.
const { JSDOM } = require('jsdom');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g,'\\"')}"`).toString().trim();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const H = { 'Content-Type':'application/json','X-Salon-Slug':'test','X-Barber-Id':'b1','X-Barber-Pin':'1111' };
let pass = 0, fail = 0;
const check = (n, ok, x='') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const lookup = (code, ip) => fetch(BASE + '/api/sales/gift-cards/lookup?code=' + code, { headers: { 'X-Salon-Slug':'test', 'X-Forwarded-For': ip } }).then(async r => ({ status: r.status, body: await r.json().catch(()=>null) }));

(async () => {
  sql("DELETE FROM cash_closings; DELETE FROM sales; DELETE FROM gift_cards;");
  console.log('\n[G] Recherche de carte cadeau : limite de tentatives');
  const r0 = await fetch(BASE + '/api/sales', { method:'POST', headers: H, body: JSON.stringify({ payment_method:'cb', items:[{item_type:'service',item_id:'sv1',item_name:'Coupe',unit_price_cents:2000,quantity:1}], gift:{recipient_name:'Dest',recipient_phone:'0600000000',recipient_email:'d@test.fr'} }) });
  const code = (await r0.json()).gift.code;
  check('carte cadeau creee', /^[A-Z0-9]{8}$/.test(code), code);
  // Adresses tirees au hasard : le limiteur garde en memoire (15 min) les IP deja
  // bloquees, donc des adresses fixes feraient echouer une 2e execution.
  const rnd = () => Math.floor(Math.random() * 250) + 1;
  const base = '10.' + rnd() + '.' + rnd() + '.';
  const A = base + '1', B = base + '2';
  let r = await lookup(code, A);
  check('un code valide est retrouve', r.status === 200 && r.body.gift.recipient_name === 'Dest');
  let last;
  for (let i = 0; i < 14; i++) last = await lookup('ZZZZ000' + (i % 10), A);
  check('14 mauvais codes : toujours des 404 normaux', last.status === 404, String(last.status));
  r = await lookup(code, A);
  check('un code VALIDE au milieu de la serie fonctionne encore', r.status === 200);
  last = await lookup('ZZZZ9999', A);
  check('15e mauvais code : 404 (le compteur atteint le seuil)', last.status === 404);
  r = await lookup('ZZZZ9998', A);
  check('16e essai : 429 "Trop de tentatives"', r.status === 429 && /Trop de tentatives/.test(r.body.error), r.status + ' ' + (r.body && r.body.error));
  r = await lookup(code, A);
  check('meme le BON code est refuse tant que c\'est bloque (le succes n\'a pas remis le compteur a zero)', r.status === 429, String(r.status));
  r = await lookup(code, B);
  check('une AUTRE adresse IP n\'est pas affectee', r.status === 200, String(r.status));
  const rr = await fetch(BASE + '/api/sales/gift-cards/lookup?code=' + code, { headers: { 'X-Salon-Slug':'test', 'X-Forwarded-For': A } });
  check('en-tete Retry-After present', Number(rr.headers.get('retry-after')) > 0, rr.headers.get('retry-after'));

  console.log('\n[U] Ecran caisse : relancer un paiement carte "incertain"');
  sql("DELETE FROM sales;");
  let charges = 0, mode = 'uncertain';
  const dom = await JSDOM.fromURL(BASE + '/caisse.html?salon=test', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(w) {
      w.sessionStorage.setItem('caisse-session', JSON.stringify({ id:'b1', pin:'1111', name:'Alice' }));
      w.fetch = async (url, opts = {}) => {
        const u = String(url);
        if (u.startsWith('/api/tpe/charge')) {
          charges++;
          const body = mode === 'uncertain'
            ? { status: 504, json: { uncertain: true, error: 'Le terminal n\'a pas répondu à temps. VÉRIFIEZ SUR LE TERMINAL' } }
            : { status: 502, json: { error: 'Paiement impossible : connect ECONNREFUSED' } };
          return new Response(JSON.stringify(body.json), { status: body.status, headers: { 'Content-Type':'application/json' } });
        }
        return fetch(u.startsWith('http') ? u : BASE + u, opts);
      };
      w.HTMLElement.prototype.scrollIntoView = () => {};
    }
  });
  const w = dom.window; await sleep(1800);
  const setTicket = () => { w.ticket = [{ item_type:'service', item_id:'sv1', item_name:'Coupe', unit_price_cents:2000, quantity:1 }]; w.renderTicket(); };
  const modalBtn = (id) => w.document.getElementById(id);

  setTicket(); w.pay('cb'); await sleep(700);
  check('echec affiche avec le bouton "Reessayer"', w.document.getElementById('tpe-actions').style.display === 'flex' && charges === 1);
  w.retryTpePayment(); await sleep(300);
  check('"Reessayer" apres un paiement INCERTAIN ouvre une confirmation', !!modalBtn('modal-confirm-btn') && /peut-être déjà payé/.test(w.document.querySelector('.modal-message').textContent));
  check('le paiement n\'est PAS relance tant qu\'on n\'a pas confirme', charges === 1, 'debits=' + charges);
  modalBtn('modal-cancel-btn').click(); await sleep(300);
  check('"Non, verifier" : aucun nouveau paiement', charges === 1 && w.document.getElementById('tpe-actions').style.display === 'flex');
  w.retryTpePayment(); await sleep(300); modalBtn('modal-confirm-btn').click(); await sleep(700);
  check('"Oui, relancer" : le paiement repart', charges === 2, 'debits=' + charges);

  mode = 'plain';                        // erreur ordinaire (terminal injoignable) : pas d'incertitude
  w.cancelTpePayment(); setTicket(); w.pay('cb'); await sleep(700);
  const before = charges;
  w.retryTpePayment(); await sleep(700);
  check('echec ORDINAIRE : "Reessayer" relance directement, sans confirmation', !modalBtn('modal-confirm-btn') && charges === before + 1, 'debits ' + before + ' -> ' + charges);
  w.close();

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(2); });
