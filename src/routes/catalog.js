const express = require('express');
const { pool } = require('../db');
const requireAdmin = require('../middleware/auth');
const { logActivity } = require('../lib/activityLog');
const { wrap } = require('../lib/wrap');

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
    res.json({ ok: true, items: rows });
  }));

  router.post('/' + table, requireAdmin, wrap(async (req, res) => {
    const { name, duration_min, price_cents, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Le nom est requis' });
    const id = await uniqueId(table, slugify(name));
    const { salon } = req;
    const rank = sort_order !== undefined && sort_order !== null && sort_order !== '' ? Number(sort_order) || 0 : await nextSortOrder(table, salon.id);
    await pool.query(
      `INSERT INTO ${table} (id, salon_id, name, duration_min, price_cents, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, salon.id, name, Number(duration_min) || 0, Number(price_cents) || 0, rank]
    );
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
  res.json({ ok: true, items: rows });
}));

router.post('/products', requireAdmin, wrap(async (req, res) => {
  const { name, price_cents, category, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Le nom est requis' });
  const stockEnabled = req.body.stock_enabled ? 1 : 0;
  const stockQuantity = Math.max(0, Number(req.body.stock_quantity) || 0);
  // Vide -> NULL (jamais une chaine vide, pour laisser plusieurs produits
  // sans code coexister sous la contrainte d'unicite par salon).
  const barcode = req.body.barcode ? String(req.body.barcode).trim().slice(0, 64) || null : null;
  const id = await uniqueId('products', slugify(name));
  try {
    await pool.query(
      'INSERT INTO products (id, salon_id, name, price_cents, category, sort_order, stock_enabled, stock_quantity, barcode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.salon.id, name, Number(price_cents) || 0, category || null, sort_order !== undefined && sort_order !== null && sort_order !== '' ? Number(sort_order) || 0 : await nextSortOrder('products', req.salon.id), stockEnabled, stockQuantity, barcode]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Ce code-barres est déjà utilisé par un autre produit' });
    throw err;
  }
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
  const [[item]] = await pool.query(`SELECT id, name FROM ${table} WHERE id = ? AND salon_id = ? AND deleted_at IS NULL`, [req.params.id, req.salon.id]);
  if (!item) return res.status(404).json({ error: 'Élément introuvable' });

  const usage = await catalogUsage(table, item.id);
  if (usage.total === 0) {
    if (table === 'services') await pool.query('DELETE FROM barber_service_exclusions WHERE service_id = ?', [item.id]);
    if (table === 'extras') await pool.query('DELETE FROM barber_extra_exclusions WHERE extra_id = ?', [item.id]);
    await pool.query(`DELETE FROM ${table} WHERE id = ? AND salon_id = ?`, [item.id, req.salon.id]);
  } else {
    await pool.query(`UPDATE ${table} SET active = 0, deleted_at = NOW() WHERE id = ? AND salon_id = ?`, [item.id, req.salon.id]);
  }
  logActivity(req.salon.id, 'catalog_delete', TABLE_LABEL[table] + ' "' + item.name + '" supprimé' + (usage.total ? ' (conservé dans l\'historique)' : ''));
  res.json({ ok: true, deleted: true, kept_for_history: usage.total > 0, usage });
}

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
