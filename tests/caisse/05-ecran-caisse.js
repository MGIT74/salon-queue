const { JSDOM } = require('jsdom');
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g,'\\"')}"`).toString().trim();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, extra='') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + name + (extra ? '  [' + extra + ']' : '')); };

async function openCaisse({ preloadStorage = {}, saleBehaviour }) {
  const calls = { charge: 0, sales: [], other: 0 };
  let saleCall = 0;
  const dom = await JSDOM.fromURL(BASE + '/caisse.html?salon=test', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    beforeParse(window) {
      window.sessionStorage.setItem('caisse-session', JSON.stringify({ id:'b1', pin:'1111', name:'Alice' }));
      Object.entries(preloadStorage).forEach(([k, v]) => window.sessionStorage.setItem(k, v));
      window.fetch = async (url, opts = {}) => {
        const u = String(url); const full = u.startsWith('http') ? u : BASE + u;
        if (u.startsWith('/api/tpe/charge')) { calls.charge++; return new Response(JSON.stringify({ ok:true, success:true, auth_number:'A1' }), { status:200, headers:{'Content-Type':'application/json'} }); }
        if (u.startsWith('/api/sales') && (opts.method || 'GET') === 'POST') {
          saleCall++; calls.sales.push(JSON.parse(opts.body).client_request_id);
          const behaviour = saleBehaviour(saleCall);
          if (behaviour === 'network-down') throw new TypeError('Failed to fetch');
          if (behaviour === 'lost-response') { await fetch(full, opts); throw new TypeError('Failed to fetch'); } // le serveur a enregistre, la reponse se perd
        } else { calls.other++; }
        return fetch(full, opts);
      };
      window.HTMLElement.prototype.scrollIntoView = function () {};
    }
  });
  await sleep(1800);
  return { dom, w: dom.window, calls };
}
const T = (w) => ({ overlayOn: w.document.getElementById('tpe-overlay').classList.contains('on'),
  amount: w.document.getElementById('tpe-amount').textContent, msg: w.document.getElementById('tpe-msg').textContent,
  saveBtns: w.document.getElementById('tpe-actions-save').style.display, retryBtns: w.document.getElementById('tpe-actions').style.display,
  payDisabled: w.document.getElementById('pay-cb').disabled });
const setTicket = (w) => { w.ticket = [{ item_type:'service', item_id:'sv1', item_name:'Coupe', unit_price_cents:2000, quantity:1 }]; w.renderTicket(); };

(async () => {
  sql("DELETE FROM cash_closings; DELETE FROM sales; DELETE FROM queue;");

  console.log('\n[U1] Carte acceptee, puis RESEAU COUPE pendant l\'enregistrement de la vente');
  let { w, calls } = await openCaisse({ saleBehaviour: (n) => n === 1 ? 'network-down' : 'ok' });
  setTicket(w); w.pay('cb'); await sleep(900);
  let t = T(w);
  check('la carte n\'est debitee qu\'UNE fois', calls.charge === 1, 'debits=' + calls.charge);
  check('ecran "Carte debitee - vente NON enregistree"', t.overlayOn && /NON enregistr/.test(t.amount), t.amount);
  check('le message dit de NE PAS repasser la carte', /NE REPASSEZ PAS/.test(t.msg));
  check('seuls les boutons de reprise sont proposes (pas "Reessayer" le paiement)', t.saveBtns === 'flex' && t.retryBtns === 'none');
  check('boutons de paiement verrouilles', t.payDisabled === true);
  check('la vente est memorisee pour survivre a un rechargement', !!w.sessionStorage.getItem('card-charged-sale'));
  check('aucune vente en base a ce stade', sql("SELECT COUNT(*) FROM sales") === '0');
  w.retrySaleSave(); await sleep(900);
  t = T(w);
  check('apres "Reessayer l\'enregistrement" : vente en base', sql("SELECT COUNT(*) FROM sales") === '1');
  check('meme identifiant de demande aux 2 essais', calls.sales.length === 2 && calls.sales[0] === calls.sales[1], calls.sales.map(x=>x&&x.slice(0,8)).join(' / '));
  check('toujours UN SEUL debit de carte', calls.charge === 1);
  check('ecran ferme et memoire effacee', !t.overlayOn && !w.sessionStorage.getItem('card-charged-sale'));
  w.close();

  console.log('\n[U2] Vente ENREGISTREE mais reponse PERDUE (le pire cas : risque de doublon)');
  sql("DELETE FROM sales");
  ({ w, calls } = await openCaisse({ saleBehaviour: (n) => n === 1 ? 'lost-response' : 'ok' }));
  setTicket(w); w.pay('cb'); await sleep(900);
  check('le serveur a bien enregistre la vente du 1er essai', sql("SELECT COUNT(*) FROM sales") === '1');
  check('l\'ecran signale pourtant un echec (reponse perdue)', /NON enregistr/.test(T(w).amount));
  w.retrySaleSave(); await sleep(900);
  check('apres reessai : TOUJOURS UNE SEULE vente (pas de doublon)', sql("SELECT COUNT(*) FROM sales") === '1', 'ventes=' + sql("SELECT COUNT(*) FROM sales"));
  check('ecran ferme', !T(w).overlayOn);
  w.close();

  console.log('\n[U3] Page RECHARGEE pendant que la carte etait debitee');
  sql("DELETE FROM sales");
  const ctx = { method:'cb', total:2000, soldTicket:[{ item_type:'service', item_id:'sv1', item_name:'Coupe', unit_price_cents:2000, quantity:1 }], linkedQueueId:null, gift:null, usedLoyalty:false, requestId:'11111111-2222-4333-8444-555555555555' };
  ({ w, calls } = await openCaisse({ preloadStorage: { 'card-charged-sale': JSON.stringify(ctx) }, saleBehaviour: () => 'ok' }));
  t = T(w);
  check('l\'ecran de reprise reapparait tout seul apres rechargement', t.overlayOn && /NON enregistr/.test(t.amount), t.amount);
  w.retrySaleSave(); await sleep(900);
  check('reprise : vente enregistree une fois', sql("SELECT COUNT(*) FROM sales") === '1');
  check('sans nouveau debit de carte', calls.charge === 0);
  w.close();

  console.log('\n[U4] "Abandonner" : la confirmation est-elle VISIBLE au-dessus de l\'ecran carte ?');
  sql("DELETE FROM sales");
  ({ w, calls } = await openCaisse({ preloadStorage: { 'card-charged-sale': JSON.stringify(ctx) }, saleBehaviour: () => 'ok' }));
  w.abandonChargedSale(); await sleep(300);
  const modal = w.document.querySelector('.modal-overlay');
  const zTpe = 410, zModal = modal ? Number(w.getComputedStyle(modal).zIndex) : 0;
  check('la fenetre de confirmation apparait', !!modal && !!w.document.getElementById('modal-confirm-btn'));
  check('elle est AU-DESSUS de l\'ecran carte', zModal > zTpe, 'z modale=' + zModal + ' > z ecran carte=' + zTpe);
  w.document.getElementById('modal-confirm-btn').click(); await sleep(400);
  t = T(w);
  check('apres confirmation : ecran ferme et memoire effacee', !t.overlayOn && !w.sessionStorage.getItem('card-charged-sale'));
  check('aucune vente creee', sql("SELECT COUNT(*) FROM sales") === '0');
  w.close();

  console.log('\n[U5] Regression : paiement en ESPECES et CB sans incident');
  sql("DELETE FROM sales");
  ({ w, calls } = await openCaisse({ saleBehaviour: () => 'ok' }));
  setTicket(w); w.pay('especes'); await sleep(900);
  check('especes : vente enregistree, ecran ferme', sql("SELECT COUNT(*) FROM sales") === '1' && !T(w).overlayOn);
  setTicket(w); w.pay('cb'); await sleep(900);
  check('cb : 1 debit, 2e vente enregistree, ecran ferme, memoire vide', calls.charge === 1 && sql("SELECT COUNT(*) FROM sales") === '2' && !T(w).overlayOn && !w.sessionStorage.getItem('card-charged-sale'));
  w.close();

  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR TEST UI', e); process.exit(2); });
