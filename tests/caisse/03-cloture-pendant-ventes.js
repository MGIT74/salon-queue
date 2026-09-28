const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -N -e "${q.replace(/"/g,'\\"')}"`).toString().trim();
const H = { 'Content-Type':'application/json','X-Salon-Slug':'test','X-Barber-Id':'b1','X-Barber-Pin':'1111' };
async function api(method, path, body, headers = H) {
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}
const sale = () => api('POST','/api/sales',{ payment_method:'especes', items:[{item_type:'service',item_id:'sv1',item_name:'Coupe',unit_price_cents:1000,quantity:1}] });
(async () => {
  let lostRuns = 0, runs = 8;
  for (let run = 1; run <= runs; run++) {
    // remise a zero : plus de cloture, plus de vente
    sql("DELETE FROM cash_closings WHERE salon_id='s1'"); sql("DELETE FROM sales WHERE salon_id='s1'");
    // 40 ventes lancees en rafale, et une cloture lancee au milieu
    const pending = [];
    for (let i = 0; i < 40; i++) {
      pending.push(sale());
      if (i === 12) pending.push(api('POST','/api/owner/caisse/close',{ starting_cash_cents: 0 }));
      await new Promise(r => setTimeout(r, 4));
    }
    const out = await Promise.all(pending);
    const ok = out.filter(x => x.status === 200 && x.body && x.body.sale).length;
    const closing = sql("SELECT sales_count, total_cents, period_end FROM cash_closings WHERE salon_id='s1' ORDER BY period_end DESC LIMIT 1").split('\t');
    if (!closing[0]) { console.log(`run ${run}: pas de cloture creee`); continue; }
    const inWindow = Number(sql(`SELECT COUNT(*) FROM sales WHERE salon_id='s1' AND created_at <= '${closing[2]}'`));
    const afterWindow = Number(sql(`SELECT COUNT(*) FROM sales WHERE salon_id='s1' AND created_at > '${closing[2]}'`));
    const lost = inWindow - Number(closing[0]);
    if (lost > 0) lostRuns++;
    console.log(`run ${run}: ventes acceptees=${ok} | comptees dans le Z=${closing[0]} | ventes datees <= fin de periode=${inWindow} | apres=${afterWindow} ${lost>0?'  <-- '+lost+' VENTE(S) EN DEHORS DE TOUT Z':''}`);
  }
  console.log(`\nruns avec vente perdue : ${lostRuns}/${runs}`);
})().catch(e => { console.error('ERREUR TEST', e); process.exit(1); });
