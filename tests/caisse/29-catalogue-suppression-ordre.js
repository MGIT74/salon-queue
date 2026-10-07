// Catalogue (prestations / supplements / produits) : SUPPRIMER (pas seulement archiver)
// et DEPLACER (l'ordre choisi est celui que lisent caisse, borne et reservation).
// Contre la vraie base. Le point critique : supprimer un article DEJA UTILISE ne doit
// jamais faire perdre de l'historique (passages, rendez-vous) - appointments.service_id est
// en ON DELETE CASCADE et queue.service_id n'a aucune protection.
const { execSync } = require('child_process');
const BASE = 'http://127.0.0.1:3999';
const sql = (q) => execSync(`mariadb -uroot salonq -e "${q.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
const sqlOne = (q) => execSync(`mariadb -uroot -N salonq -e "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };
const H = (slug) => ({ 'Content-Type': 'application/json', 'X-Salon-Slug': slug || 'test', 'X-Admin-Password': 'adminpw' });
const call = async (method, p, body, slug, noAuth) => {
  const h = H(slug); if (noAuth) delete h['X-Admin-Password'];
  const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, b: await r.json().catch(() => ({})) };
};
const names = async (table, q, slug) => (await call('GET', '/api/catalog/' + table + (q || ''), null, slug)).b.items.map((x) => x.name);
const mk = async (table, name, extra) => (await call('POST', '/api/catalog/' + table, Object.assign({ name, price_cents: 1000, duration_min: 10 }, extra || {}))).b.item;

(async () => {
  const T = 'ZT'; // prefixe des articles de test, nettoyes a la fin
  const clean = () => {
    sql("DELETE FROM queue WHERE client_name LIKE 'ZT %'");
    sql("DELETE FROM appointments WHERE client_name LIKE 'ZT %'");
    for (const t of ['services', 'extras', 'products']) sql(`DELETE FROM ${t} WHERE name LIKE 'ZT %'`);
    sql("DELETE FROM salons WHERE id='s2'");
  };
  clean();
  sql("INSERT INTO salons (id, owner_id, name, slug, admin_password) VALUES ('s2','o1','Salon Deux','salon-deux','')");

  console.log('\n[A] ORDRE : un nouvel article se place a la FIN ; le nouvel ordre est celui que lit tout le monde');
  const z = await mk('services', T + ' Zebre'), a = await mk('services', T + ' Alpha'), m = await mk('services', T + ' Milieu');
  let n = (await names('services')).filter((x) => x.startsWith(T));
  check('crees dans l\'ordre Zebre, Alpha, Milieu -> affiches dans CET ordre (pas alphabetique)', JSON.stringify(n) === JSON.stringify([T + ' Zebre', T + ' Alpha', T + ' Milieu']), n.join(' | '));
  let r = await call('POST', '/api/catalog/services/reorder', { ids: [m.id, z.id, a.id] });
  n = (await names('services')).filter((x) => x.startsWith(T));
  check('reordonner Milieu, Zebre, Alpha -> la liste suit', r.s === 200 && JSON.stringify(n) === JSON.stringify([T + ' Milieu', T + ' Zebre', T + ' Alpha']), n.join(' | '));
  const pub = (await call('GET', '/api/catalog/services')).b.items.map((x) => x.name).filter((x) => x.startsWith(T));
  check('la liste PUBLIQUE (caisse, borne, reservation) suit le meme ordre', JSON.stringify(pub) === JSON.stringify(n), pub.join(' | '));
  // ordre complet de la liste (ce qu'envoie l'ecran : TOUS les articles dans l'ordre affiche), inverse
  const all = (await call('GET', '/api/catalog/services?all=1')).b.items.map((x) => x.id);
  await call('POST', '/api/catalog/services/reorder', { ids: all.slice().reverse() });
  const all2 = (await call('GET', '/api/catalog/services?all=1')).b.items.map((x) => x.id);
  check('liste COMPLETE inversee -> exactement l\'ordre inverse', JSON.stringify(all2) === JSON.stringify(all.slice().reverse()));
  const nouveau = await mk('services', T + ' Dernier');
  const tail = (await call('GET', '/api/catalog/services?all=1')).b.items.map((x) => x.id);
  check('un article cree APRES se place tout a la fin (l\'ordre choisi ne bouge pas)', tail[tail.length - 1] === nouveau.id && JSON.stringify(tail.slice(0, -1)) === JSON.stringify(all2));
  const e1 = await mk('extras', T + ' E1'), e2 = await mk('extras', T + ' E2'); await call('POST', '/api/catalog/extras/reorder', { ids: [e2.id, e1.id] });
  const p1 = await mk('products', T + ' P1'), p2 = await mk('products', T + ' P2'); await call('POST', '/api/catalog/products/reorder', { ids: [p2.id, p1.id] });
  check('meme chose pour les supplements', JSON.stringify((await names('extras')).filter((x) => x.startsWith(T))) === JSON.stringify([T + ' E2', T + ' E1']));
  check('meme chose pour les produits', JSON.stringify((await names('products')).filter((x) => x.startsWith(T))) === JSON.stringify([T + ' P2', T + ' P1']));

  console.log('\n[B] ORDRE : robustesse et isolation entre salons');
  const autre = (await call('POST', '/api/catalog/services', { name: T + ' Autre salon', price_cents: 500, duration_min: 5 }, 'salon-deux')).b.item;
  const avant = sqlOne(`SELECT sort_order FROM services WHERE id='${autre.id}'`);
  r = await call('POST', '/api/catalog/services/reorder', { ids: [autre.id, 'id-inconnu', m.id] });
  check('un article d\'un AUTRE salon (ou inconnu) est ignore, sans erreur', r.s === 200 && sqlOne(`SELECT sort_order FROM services WHERE id='${autre.id}'`) === avant);
  check('liste vide -> refusee (400)', (await call('POST', '/api/catalog/services/reorder', { ids: [] })).s === 400);
  check('sans mot de passe admin -> refuse', [401, 403].includes((await call('POST', '/api/catalog/services/reorder', { ids: [m.id] }, 'test', true)).s));

  console.log('\n[C] SUPPRIMER un article JAMAIS utilise : effacement reel');
  const jet = await mk('services', T + ' Jetable');
  let u = await call('GET', `/api/catalog/services/${jet.id}/usage`);
  check('usage : aucun passage ni rendez-vous', u.s === 200 && u.b.usage.total === 0 && u.b.usage.a_venir === 0, JSON.stringify(u.b.usage));
  r = await call('DELETE', `/api/catalog/services/${jet.id}?permanent=1`);
  check('suppression acceptee, "conserve pour l\'historique" = non', r.s === 200 && r.b.deleted === true && r.b.kept_for_history === false, JSON.stringify(r.b));
  check('la ligne n\'existe plus dans la base', sqlOne(`SELECT COUNT(*) FROM services WHERE id='${jet.id}'`) === '0');
  check('introuvable ensuite (404)', (await call('DELETE', `/api/catalog/services/${jet.id}?permanent=1`)).s === 404);

  console.log('\n[D] SUPPRIMER une prestation DEJA UTILISEE : disparait partout, l\'historique reste INTACT');
  const used = await mk('services', T + ' Utilisee');
  sql(`INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,is_appointment,total_price_cents) VALUES ('zt-q1','s1','ZT Client passage','b1','${used.id}','done',NOW(),0,1000)`);
  sql(`INSERT INTO appointments (id,salon_id,barber_id,client_name,email,phone,service_id,scheduled_at,status,cancel_token) VALUES ('zt-a1','s1','b1','ZT Client RDV','zt@example.com','0600000000','${used.id}',DATE_ADD(NOW(), INTERVAL 2 DAY),'confirmed','zt-token-1')`);
  u = await call('GET', `/api/catalog/services/${used.id}/usage`);
  check('usage : 1 passage + 1 rendez-vous (dont 1 a venir)', u.b.usage.passages === 1 && u.b.usage.rendez_vous === 1 && u.b.usage.a_venir === 1, JSON.stringify(u.b.usage));
  r = await call('DELETE', `/api/catalog/services/${used.id}?permanent=1`);
  check('suppression acceptee, "conserve pour l\'historique" = oui', r.s === 200 && r.b.kept_for_history === true, JSON.stringify(r.b));
  check('LE RENDEZ-VOUS EXISTE TOUJOURS (pas efface en cascade)', sqlOne("SELECT COUNT(*) FROM appointments WHERE id='zt-a1'") === '1');
  check('LE PASSAGE EXISTE TOUJOURS', sqlOne("SELECT COUNT(*) FROM queue WHERE id='zt-q1'") === '1');
  check('la fiche est gardee, invisible : active=0 et deleted_at renseigne', sqlOne(`SELECT CONCAT(active,'/',deleted_at IS NOT NULL) FROM services WHERE id='${used.id}'`) === '0/1');
  check('absente de la liste admin (archives inclus)', !(await names('services', '?all=1')).includes(T + ' Utilisee'));
  check('absente de la liste publique (caisse, borne, reservation)', !(await names('services')).includes(T + ' Utilisee'));
  const q = await call('GET', '/api/queue?include_done=1');
  const row = q.b.queue && q.b.queue.find((x) => x.id === 'zt-q1');
  check('la file d\'attente fonctionne toujours (200) et le passage GARDE le nom de la prestation', q.s === 200 && row && row.service && row.service.name === T + ' Utilisee', q.s + ' / ' + (row && row.service && row.service.name));
  check('suppression refusee sans mot de passe admin', [401, 403].includes((await call('DELETE', `/api/catalog/services/${a.id}?permanent=1`, null, 'test', true)).s));

  console.log('\n[E] Supplements et produits : meme regle');
  const ex = await mk('extras', T + ' Supp utilise');
  sql(`INSERT INTO queue (id,salon_id,client_name,barber_id,service_id,status,checkin_at,is_appointment,total_price_cents) VALUES ('zt-q2','s1','ZT Client supp','b1','sv1','done',NOW(),0,1000)`);
  sql(`INSERT INTO queue_extras (queue_id, extra_id) VALUES ('zt-q2','${ex.id}')`);
  r = await call('DELETE', `/api/catalog/extras/${ex.id}?permanent=1`);
  check('supplement deja utilise : conserve (liaison du passage intacte)', r.b.kept_for_history === true && sqlOne(`SELECT COUNT(*) FROM queue_extras WHERE extra_id='${ex.id}'`) === '1');
  const exJet = await mk('extras', T + ' Supp jetable'); r = await call('DELETE', `/api/catalog/extras/${exJet.id}?permanent=1`);
  check('supplement jamais utilise : efface', r.b.kept_for_history === false && sqlOne(`SELECT COUNT(*) FROM extras WHERE id='${exJet.id}'`) === '0');
  const pr = await mk('products', T + ' Produit utilise');
  sql(`INSERT INTO queue_products (queue_id, product_id, quantity) VALUES ('zt-q2','${pr.id}',1)`);
  r = await call('DELETE', `/api/catalog/products/${pr.id}?permanent=1`);
  check('produit deja utilise : conserve', r.b.kept_for_history === true && sqlOne(`SELECT COUNT(*) FROM queue_products WHERE product_id='${pr.id}'`) === '1');
  const prJet = await mk('products', T + ' Produit jetable'); r = await call('DELETE', `/api/catalog/products/${prJet.id}?permanent=1`);
  check('produit jamais utilise : efface', r.b.kept_for_history === false && sqlOne(`SELECT COUNT(*) FROM products WHERE id='${prJet.id}'`) === '0');

  console.log('\n[F] Isolation entre salons + "Archiver" inchange');
  const mien = await mk('services', T + ' Mon salon');
  check('un AUTRE salon ne peut ni voir l\'usage ni supprimer (404)', (await call('GET', `/api/catalog/services/${mien.id}/usage`, null, 'salon-deux')).s === 404 && (await call('DELETE', `/api/catalog/services/${mien.id}?permanent=1`, null, 'salon-deux')).s === 404 && sqlOne(`SELECT COUNT(*) FROM services WHERE id='${mien.id}'`) === '1');
  r = await call('DELETE', `/api/catalog/services/${mien.id}`);
  check('"Archiver" (sans permanent) : archive, ne supprime pas', r.b.archived === true && sqlOne(`SELECT active FROM services WHERE id='${mien.id}'`) === '0' && sqlOne(`SELECT deleted_at IS NULL FROM services WHERE id='${mien.id}'`) === '1');
  check('un article archive reste dans la liste admin (pour pouvoir le reactiver)', (await names('services', '?all=1')).includes(T + ' Mon salon'));
  r = await call('DELETE', `/api/catalog/services/${mien.id}?permanent=1`);
  check('un article ARCHIVE peut ensuite etre supprime', r.s === 200 && sqlOne(`SELECT COUNT(*) FROM services WHERE id='${mien.id}'`) === '0');

  clean();
  console.log(`\nRESULTAT : ${pass} verifications reussies, ${fail} echec(s)`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERREUR TEST', e); process.exit(2); });
