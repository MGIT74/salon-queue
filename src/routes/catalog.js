const express = require('express');
const { pool } = require('../db');
const requireAdmin = require('../middleware/auth');
const { logActivity } = require('../lib/activityLog');
const { wrap } = require('../lib/wrap');
const crypto = require('crypto');
const { annotateItems, normalizeVatRateId } = require('../lib/vat');

const router = express.Router();

const TABLE_LABEL = { services: 'Prestation', extras: 'Supplément', products: 'Produit' };

// L'interface normale (uploadCatalogImage côté dashboard) ne génère
// jamais que des data: URLs image/jpeg via un <canvas> - mais cette
// route accepte du JSON brut, donc un appel direct à l'API (hors
// interface) pourrait y glisser n'importe quelle chaîne. Cette valeur
// est ensuite injectée dans un attribut style="background:url(...)"
// côté dashboard ET kiosk.html sans échapper les guillemets - une
// chaîne comme `x" onmouseover="...` pourrait y exécuter du HTML/JS
// pour quiconque regarde le catalogue. On restreint donc strictement
// le format accepté, en plus de l'échappement corrigé côté front.
const SAFE_IMAGE_URL = /^(data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+|https:\/\/[^\s"'<>]+)$/i;

function isSafeImageUrl(url) {
  return typeof url === 'string' && SAFE_IMAGE_URL.test(url);
}


// ---- Catégories (familles d'articles) ----
const KINDS = ['services', 'extras', 'products'];

/** '' -> null ; id d'une catégorie de CE type et CE salon -> id ; sinon false. */
async function normalizeCategoryId(salonId, kind, value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const [[row]] = await pool.query('SELECT id FROM catalog_categories WHERE id = ? AND salon_id = ? AND kind = ?', [String(value), salonId, kind]);
  return row ? row.id : false;
}

// Liste (publique comme le catalogue : la caisse et la borne en ont besoin)
router.get('/categories', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, kind, name, sort_order FROM catalog_categories WHERE salon_id = ? ORDER BY sort_order, name', [req.salon.id]);
  const out = { services: [], extras: [], products: [] };
  rows.forEach((r) => { if (out[r.kind]) out[r.kind].push({ id: r.id, name: r.name }); });
  res.json({ ok: true, categories: out });
}));

// Remplace la liste d'un type : { categories: [{ id?, name }] }. Une catégorie retirée
// de la liste est supprimée ; ses articles repassent « sans catégorie ».
router.put('/categories/:kind', requireAdmin, wrap(async (req, res) => {
  const kind = req.params.kind;
  if (!KINDS.includes(kind)) return res.status(404).json({ error: 'Type inconnu' });
  const input = Array.isArray(req.body.categories) ? req.body.categories : null;
  if (!input) return res.status(400).json({ error: 'Liste invalide' });
  if (input.length > 50) return res.status(400).json({ error: '50 catégories maximum' });
  const names = new Set();
  const clean = [];
  for (const c of input) {
    const name = String(c.name || '').trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: 'Chaque catégorie doit avoir un nom' });
    const key = name.toLowerCase();
    if (names.has(key)) return res.status(400).json({ error: 'Deux catégories portent le même nom : « ' + name + ' »' });
    names.add(key);
    clean.push({ id: typeof c.id === 'string' ? c.id : null, name });
  }
  const [existing] = await pool.query('SELECT id FROM catalog_categories WHERE salon_id = ? AND kind = ?', [req.salon.id, kind]);
  const existingIds = new Set(existing.map((r) => r.id));
  const keep = new Set();
  const finalList = clean.map((c) => {
    const id = c.id && existingIds.has(c.id) && !keep.has(c.id) ? c.id : crypto.randomUUID();
    keep.add(id);
    return { id, name: c.name };
  });
  for (let i = 0; i < finalList.length; i++) {
    await pool.query(
      'INSERT INTO catalog_categories (id, salon_id, kind, name, sort_order) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order)',
      [finalList[i].id, req.salon.id, kind, finalList[i].name, i]
    );
  }
  const removed = existing.map((r) => r.id).filter((id) => !keep.has(id));
  if (removed.length) {
    await pool.query(`UPDATE ${kind} SET category_id = NULL WHERE salon_id = ? AND category_id IN (?)`, [req.salon.id, removed]);
    await pool.query('DELETE FROM catalog_categories WHERE salon_id = ? AND kind = ? AND id IN (?)', [req.salon.id, kind, removed]);
  }
  logActivity(req.salon.id, 'catalog_categories', 'Catégories (' + TABLE_LABEL[kind].toLowerCase() + 's) : ' + (finalList.map((c) => c.name).join(', ') || 'aucune'));
  res.json({ ok: true, categories: finalList });
}));

function slugify(str) {
  return String(str)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '').slice(0, 40) || 'item';
}

// Ou un article est-il encore REFERENCE par l'historique ? C'est ce qui decide si on peut
// l'effacer pour de bon : la file d'attente (queue.service_id / queue_extras) n'a aucune cle
// etrangere et les ecrans d'historique la relient au catalogue par JOIN, et les rendez-vous
// sont en ON DELETE CASCADE sur la prestation. Un effacement physique ferait donc disparaitre
// ces passages / rendez-vous ou leur nom. Les VENTES (sale_items) gardent leur propre copie
// du nom et du prix : elles ne comptent pas ici.
const HISTORY_TABLES = {
  services: [['queue', 'service_id', 'passages'], ['appointments', 'service_id', 'rendez_vous']],
  extras: [['queue_extras', 'extra_id', 'passages'], ['appointment_extras', 'extra_id', 'rendez_vous']],
  products: [['queue_products', 'product_id', 'passages'], ['appointment_products', 'product_id', 'rendez_vous']]
};

async function catalogUsage(table, id) {
  const usage = { passages: 0, rendez_vous: 0, a_venir: 0 };
  for (const [tbl, col, key] of HISTORY_TABLES[table]) {
    const [[r]] = await pool.query(`SELECT COUNT(*) AS n FROM ${tbl} WHERE ${col} = ?`, [id]);
    usage[key] += r.n;
  }
  // Rendez-vous encore a venir (non annules) qui s'appuient sur cet article - pour avertir avant de supprimer.
  const upcomingSql = {
    services: 'SELECT COUNT(*) AS n FROM appointments WHERE service_id = ? AND status = \'confirmed\' AND scheduled_at >= NOW()',
    extras: 'SELECT COUNT(*) AS n FROM appointment_extras ae JOIN appointments a ON a.id = ae.appointment_id WHERE ae.extra_id = ? AND a.status = \'confirmed\' AND a.scheduled_at >= NOW()',
    products: 'SELECT COUNT(*) AS n FROM appointment_products ap JOIN appointments a ON a.id = ap.appointment_id WHERE ap.product_id = ? AND a.status = \'confirmed\' AND a.scheduled_at >= NOW()'
  }[table];
  const [[u]] = await pool.query(upcomingSql, [id]);
  usage.a_venir = u.n;
  usage.total = usage.passages + usage.rendez_vous;
  return usage;
}

// Prochain rang : un nouvel article se place a la FIN de la liste (et non en tete, ce que donnait
// sort_order = 0 face aux autres), de sorte que l'ordre choisi dans l'administration - repris
// tel quel par la caisse, la borne et la reservation - ne bouge pas quand on en ajoute un.
async function nextSortOrder(table, salonId) {
  const [[r]] = await pool.query(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM ${table} WHERE salon_id = ? AND deleted_at IS NULL`, [salonId]);
  return r.m + 10;
}

async function uniqueId(table, base) {
  let id = base;
  let n = 2;
  while (true) {
    const [rows] = await pool.query(`SELECT id FROM ${table} WHERE id = ?`, [id]);
    if (rows.length === 0) return id;
    id = base + '_' + n++;
  }
}

['services', 'extras'].forEach((table) => {
  // Liste — publique (la borne du salon résolu en a besoin)
  router.get('/' + table, wrap(async (req, res) => {
    const sql = req.query.all === '1'
      ? `SELECT * FROM ${table} WHERE salon_id = ? AND deleted_at IS NULL ORDER BY sort_order, name`
      : `SELECT * FROM ${table} WHERE salon_id = ? AND active = 1 AND deleted_at IS NULL ORDER BY sort_order, name`;
    const [rows] = await pool.query(sql, [req.salon.id]);
    res.json({ ok: true, items: await annotateItems(req.salon.id, rows) });
  }));

  router.post('/' + table, requireAdmin, wrap(async (req, res) => {
    const { name, duration_min, price_cents, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Le nom est requis' });
    const id = await uniqueId(table, slugify(name));
    const { salon } = req;
    const vatId = await normalizeVatRateId(salon.id, req.body.vat_rate_id);
    if (vatId === false) return res.status(400).json({ error: 'Taux de TVA inconnu' });
    const catId = await normalizeCategoryId(salon.id, table, req.body.category_id);
    if (catId === false) return res.status(400).json({ error: 'Catégorie inconnue' });
    const rank = sort_order !== undefined && sort_order !== null && sort_order !== '' ? Number(sort_order) || 0 : await nextSortOrder(table, salon.id);
    await pool.query(
      `INSERT INTO ${table} (id, salon_id, name, duration_min, price_cents, sort_order, vat_rate_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, salon.id, name, Number(duration_min) || 0, Number(price_cents) || 0, rank, vatId === undefined ? null : vatId]
    );
    if (catId) await pool.query(`UPDATE ${table} SET category_id = ? WHERE id = ?`, [catId, id]);
    const [[item]] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    logActivity(salon.id, 'catalog_create', TABLE_LABEL[table] + ' "' + name + '" créée');
    res.json({ ok: true, item });
  }));

  router.put('/' + table + '/:id', requireAdmin, wrap(async (req, res) => {
    const sets = [];
    const params = [];
    if (req.body.name !== undefined) { sets.push('name = ?'); params.push(req.body.name); }
    if (req.body.active !== undefined) { sets.push('active = ?'); params.push(req.body.active ? 1 : 0); }
    if (req.body.image_url !== undefined) {
      if (req.body.image_url && !isSafeImageUrl(req.body.image_url)) {
        return res.status(400).json({ error: "Format d'image invalide" });
      }
      sets.push('image_url = ?'); params.push(req.body.image_url || null);
    }
    ['duration_min', 'price_cents', 'sort_order'].forEach((k) => {
      if (req.body[k] !== undefined) { sets.push(k + ' = ?'); params.push(Number(req.body[k]) || 0); }
    });
    if (req.body.vat_rate_id !== undefined) {
      const vatId = await normalizeVatRateId(req.salon.id, req.body.vat_rate_id);
      if (vatId === false) return res.status(400).json({ error: 'Taux de TVA inconnu' });
      sets.push('vat_rate_id = ?'); params.push(vatId);
    }
    if (req.body.category_id !== undefined) {
      const catId = await normalizeCategoryId(req.salon.id, table, req.body.category_id);
      if (catId === false) return res.status(400).json({ error: 'Catégorie inconnue' });
      sets.push('category_id = ?'); params.push(catId);
    }
    if (!sets.length) return res.json({ ok: true });

    const [[before]] = await pool.query(`SELECT name FROM ${table} WHERE id = ? AND salon_id = ?`, [req.params.id, req.salon.id]);
    const label = TABLE_LABEL[table] + ' "' + (req.body.name || (before ? before.name : req.params.id)) + '"';

    params.push(req.params.id, req.salon.id);
    await pool.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND salon_id = ?`, params);

    if (req.body.active !== undefined) {
      logActivity(req.salon.id, req.body.active ? 'catalog_restore' : 'catalog_archive', label + (req.body.active ? ' réactivée' : ' archivée'));
    } else if (req.body.image_url !== undefined) {
      logActivity(req.salon.id, req.body.image_url ? 'catalog_image_add' : 'catalog_image_remove', 'Photo ' + (req.body.image_url ? 'ajoutée' : 'supprimée') + ' pour ' + label);
    } else {
      logActivity(req.salon.id, 'catalog_edit', label + ' modifiée');
    }
    res.json({ ok: true });
  }));

  router.delete('/' + table + '/:id', requireAdmin, wrap(async (req, res) => {
    if (req.query.permanent === '1') return deleteCatalogItem(table, req, res);
    const [[before]] = await pool.query(`SELECT name FROM ${table} WHERE id = ? AND salon_id = ?`, [req.params.id, req.salon.id]);
    await pool.query(`UPDATE ${table} SET active = 0 WHERE id = ? AND salon_id = ?`, [req.params.id, req.salon.id]);
    logActivity(req.salon.id, 'catalog_archive', TABLE_LABEL[table] + ' "' + (before ? before.name : req.params.id) + '" archivée');
    res.json({ ok: true, archived: true });
  }));
});

// Produits (boissons, vente à emporter...) — même modèle que services/
// extras, mais sans durée, avec une catégorie libre à la place.
router.get('/products', wrap(async (req, res) => {
  const sql = req.query.all === '1'
    ? 'SELECT * FROM products WHERE salon_id = ? AND deleted_at IS NULL ORDER BY sort_order, name'
    : 'SELECT * FROM products WHERE salon_id = ? AND active = 1 AND deleted_at IS NULL ORDER BY sort_order, name';
  const [rows] = await pool.query(sql, [req.salon.id]);
  res.json({ ok: true, items: await annotateItems(req.salon.id, rows) });
}));

router.post('/products', requireAdmin, wrap(async (req, res) => {
  const { name, price_cents, category, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom est requis' });
  const stockEnabled = req.body.stock_enabled ? 1 : 0;
  const stockQuantity = Math.max(0, Number(req.body.stock_quantity) || 0);
  // Vide -> NULL (jamais une chaine vide, pour laisser plusieurs produits
  // sans code coexister sous la contrainte d'unicite par salon).
  const barcode = req.body.barcode ? String(req.body.barcode).trim().slice(0, 64) || null : null;
  const vatId = await normalizeVatRateId(req.salon.id, req.body.vat_rate_id);
  if (vatId === false) return res.status(400).json({ error: 'Taux de TVA inconnu' });
  const catId = await normalizeCategoryId(req.salon.id, 'products', req.body.category_id);
  if (catId === false) return res.status(400).json({ error: 'Catégorie inconnue' });
  const id = await uniqueId('products', slugify(name));
  try {
    await pool.query(
      'INSERT INTO products (id, salon_id, name, price_cents, category, sort_order, stock_enabled, stock_quantity, barcode, vat_rate_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.salon.id, name, Number(price_cents) || 0, category || null, sort_order !== undefined && sort_order !== null && sort_order !== '' ? Number(sort_order) || 0 : await nextSortOrder('products', req.salon.id), stockEnabled, stockQuantity, barcode, vatId === undefined ? null : vatId]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ce code-barres est déjà utilisé par un autre produit' });
    throw err;
  }
  if (catId) await pool.query('UPDATE products SET category_id = ? WHERE id = ?', [catId, id]);
  const [[item]] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  logActivity(req.salon.id, 'catalog_create', 'Produit "' + name + '" créé');
  res.json({ ok: true, item });
}));

router.put('/products/:id', requireAdmin, wrap(async (req, res) => {
  const sets = [];
  const params = [];
  if (req.body.name !== undefined) { sets.push('name = ?'); params.push(req.body.name); }
  if (req.body.active !== undefined) { sets.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (req.body.category !== undefined) { sets.push('category = ?'); params.push(req.body.category || null); }
  if (req.body.image_url !== undefined) {
    if (req.body.image_url && !isSafeImageUrl(req.body.image_url)) {
      return res.status(400).json({ error: "Format d'image invalide" });
    }
    sets.push('image_url = ?'); params.push(req.body.image_url || null);
  }
  if (req.body.stock_enabled !== undefined) { sets.push('stock_enabled = ?'); params.push(req.body.stock_enabled ? 1 : 0); }
  if (req.body.barcode !== undefined) {
    const barcode = req.body.barcode ? String(req.body.barcode).trim().slice(0, 64) || null : null;
    sets.push('barcode = ?'); params.push(barcode);
  }
  ['price_cents', 'sort_order', 'stock_quantity'].forEach((k) => {
    if (req.body[k] !== undefined) { sets.push(k + ' = ?'); params.push(Math.max(0, Number(req.body[k]) || 0)); }
  });
  if (req.body.vat_rate_id !== undefined) {
    const vatId = await normalizeVatRateId(req.salon.id, req.body.vat_rate_id);
    if (vatId === false) return res.status(400).json({ error: 'Taux de TVA inconnu' });
    sets.push('vat_rate_id = ?'); params.push(vatId);
  }
  if (req.body.category_id !== undefined) {
    const catId = await normalizeCategoryId(req.salon.id, 'products', req.body.category_id);
    if (catId === false) return res.status(400).json({ error: 'Catégorie inconnue' });
    sets.push('category_id = ?'); params.push(catId);
  }
  if (!sets.length) return res.json({ ok: true });

  const [[before]] = await pool.query('SELECT name FROM products WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  const label = 'Produit "' + (req.body.name || (before ? before.name : req.params.id)) + '"';

  params.push(req.params.id, req.salon.id);
  try {
    await pool.query(`UPDATE products SET ${sets.join(', ')} WHERE id = ? AND salon_id = ?`, params);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ce code-barres est déjà utilisé par un autre produit' });
    throw err;
  }

  if (req.body.active !== undefined) {
    logActivity(req.salon.id, req.body.active ? 'catalog_restore' : 'catalog_archive', label + (req.body.active ? ' réactivé' : ' archivé'));
  } else if (req.body.image_url !== undefined) {
    logActivity(req.salon.id, req.body.image_url ? 'catalog_image_add' : 'catalog_image_remove', 'Photo ' + (req.body.image_url ? 'ajoutée' : 'supprimée') + ' pour ' + label);
  } else {
    logActivity(req.salon.id, 'catalog_edit', label + ' modifié');
  }
  res.json({ ok: true });
}));

router.delete('/products/:id', requireAdmin, wrap(async (req, res) => {
  if (req.query.permanent === '1') return deleteCatalogItem('products', req, res);
  const [[before]] = await pool.query('SELECT name FROM products WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  await pool.query('UPDATE products SET active = 0 WHERE id = ? AND salon_id = ?', [req.params.id, req.salon.id]);
  logActivity(req.salon.id, 'catalog_archive', 'Produit "' + (before ? before.name : req.params.id) + '" archivé');
  res.json({ ok: true, archived: true });
}));

/**
 * Suppression DEFINITIVE depuis l'administration (le bouton "Archiver" ne fait que masquer a la
 * borne). Deux cas, decides par l'historique reel :
 *  - jamais utilise  -> efface pour de bon, ainsi que ses reglages par coiffeur ;
 *  - deja dans l'historique (passages, rendez-vous) -> disparait de PARTOUT (admin, caisse, borne,
 *    reservation) mais sa fiche est conservee, invisible : sans elle, les passages perdraient leur
 *    nom et les rendez-vous seraient supprimes en cascade.
 */
async function deleteCatalogItem(table, req, res) {
  const r = await removeCatalogItem(table, req.salon.id, req.params.id);
  if (!r) return res.status(404).json({ error: 'Élément introuvable' });
  res.json({ ok: true, deleted: true, kept_for_history: r.usage.total > 0, usage: r.usage });
}

async function removeCatalogItem(table, salonId, itemId) {
  const [[item]] = await pool.query(`SELECT id, name FROM ${table} WHERE id = ? AND salon_id = ? AND deleted_at IS NULL`, [itemId, salonId]);
  if (!item) return null;

  const usage = await catalogUsage(table, item.id);
  if (usage.total === 0) {
    if (table === 'services') await pool.query('DELETE FROM barber_service_exclusions WHERE service_id = ?', [item.id]);
    if (table === 'extras') await pool.query('DELETE FROM barber_extra_exclusions WHERE extra_id = ?', [item.id]);
    await pool.query(`DELETE FROM ${table} WHERE id = ? AND salon_id = ?`, [item.id, salonId]);
  } else {
    await pool.query(`UPDATE ${table} SET active = 0, deleted_at = NOW() WHERE id = ? AND salon_id = ?`, [item.id, salonId]);
  }
  logActivity(salonId, 'catalog_delete', TABLE_LABEL[table] + ' "' + item.name + '" supprimé' + (usage.total ? ' (conservé dans l\'historique)' : ''));
  return { usage };
}

// Actions groupées sur une sélection : { ids, action: archive|restore|edit|delete, vat_rate_id?, price_cents? }
['services', 'extras', 'products'].forEach((table) => {
  router.post('/' + table + '/bulk', requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? [...new Set(req.body.ids.map(String))].slice(0, 500) : [];
    if (!ids.length) return res.status(400).json({ error: 'Aucun élément sélectionné' });
    const action = req.body.action;
    const salonId = req.salon.id;
    const [owned] = await pool.query(`SELECT id, name FROM ${table} WHERE salon_id = ? AND deleted_at IS NULL AND id IN (?)`, [salonId, ids]);
    const okIds = owned.map((r) => r.id);
    if (!okIds.length) return res.status(404).json({ error: 'Éléments introuvables' });
    if (action === 'archive' || action === 'restore') {
      await pool.query(`UPDATE ${table} SET active = ? WHERE salon_id = ? AND id IN (?)`, [action === 'restore' ? 1 : 0, salonId, okIds]);
      logActivity(salonId, action === 'restore' ? 'catalog_restore' : 'catalog_archive', okIds.length + ' ' + TABLE_LABEL[table].toLowerCase() + '(s) ' + (action === 'restore' ? 'réactivé(s)' : 'archivé(s)'));
    } else if (action === 'edit') {
      const sets = [], params = [];
      if (req.body.vat_rate_id !== undefined && req.body.vat_rate_id !== '') {
        const vatId = await normalizeVatRateId(salonId, req.body.vat_rate_id);
        if (!vatId) return res.status(400).json({ error: 'Taux de TVA inconnu' });
        sets.push('vat_rate_id = ?'); params.push(vatId);
      }
      if (req.body.category_id !== undefined) {
        // '__none' = retirer la catégorie ; autre valeur = une catégorie existante de ce type.
        const catId = req.body.category_id === '__none' ? null : await normalizeCategoryId(salonId, table, req.body.category_id);
        if (catId === false || catId === undefined) return res.status(400).json({ error: 'Catégorie inconnue' });
        sets.push('category_id = ?'); params.push(catId);
      }
      if (req.body.price_cents !== undefined && req.body.price_cents !== null && req.body.price_cents !== '') {
        const price = Math.round(Number(req.body.price_cents));
        if (!Number.isFinite(price) || price < 0 || price > 10000000) return res.status(400).json({ error: 'Prix invalide' });
        sets.push('price_cents = ?'); params.push(price);
      }
      if (!sets.length) return res.status(400).json({ error: 'Rien à modifier' });
      await pool.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE salon_id = ? AND id IN (?)`, params.concat([salonId, okIds]));
      logActivity(salonId, 'catalog_edit', okIds.length + ' ' + TABLE_LABEL[table].toLowerCase() + '(s) modifié(s) en groupe');
    } else if (action === 'delete') {
      let kept = 0;
      for (const id of okIds) {
        const r = await removeCatalogItem(table, salonId, id);
        if (r && r.usage.total > 0) kept += 1;
      }
      return res.json({ ok: true, count: okIds.length, kept_for_history: kept });
    } else {
      return res.status(400).json({ error: 'Action inconnue' });
    }
    res.json({ ok: true, count: okIds.length });
  }));
});

['services', 'extras', 'products'].forEach((table) => {
  // Combien de passages / rendez-vous utilisent cet article ? - pour prevenir AVANT de supprimer.
  router.get('/' + table + '/:id/usage', requireAdmin, wrap(async (req, res) => {
    const [[item]] = await pool.query(`SELECT id, name FROM ${table} WHERE id = ? AND salon_id = ? AND deleted_at IS NULL`, [req.params.id, req.salon.id]);
    if (!item) return res.status(404).json({ error: 'Élément introuvable' });
    res.json({ ok: true, name: item.name, usage: await catalogUsage(table, item.id) });
  }));

  // Nouvel ordre : { ids: [premier, deuxieme, ...] }. L'ordre enregistre est celui qu'affichent aussi la
  // caisse, la borne et la reservation (toutes lisent la liste triee par sort_order).
  router.post('/' + table + '/reorder', requireAdmin, wrap(async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter((x) => typeof x === 'string') : [];
    if (!ids.length || ids.length > 500) return res.status(400).json({ error: 'Liste invalide' });
    const [rows] = await pool.query(`SELECT id FROM ${table} WHERE salon_id = ? AND deleted_at IS NULL AND id IN (?)`, [req.salon.id, ids]);
    const mine = new Set(rows.map((r) => r.id));  // jamais l'article d'un autre salon
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      let rank = 10;
      for (const id of ids) {
        if (!mine.has(id)) continue;
        await conn.query(`UPDATE ${table} SET sort_order = ? WHERE id = ? AND salon_id = ?`, [rank, id, req.salon.id]);
        rank += 10;
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    logActivity(req.salon.id, 'catalog_reorder', TABLE_LABEL[table] + 's réordonné(e)s');
    res.json({ ok: true });
  }));
});

module.exports = router;
