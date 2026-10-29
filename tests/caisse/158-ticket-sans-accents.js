// Tickets imprimés (Z, reçus) : texte SANS accents, lisible sur toutes les imprimantes thermiques, quelle que soit la
// marque (un « é » sortait en « В » russe -> « Bquipe »). Fait par le serveur avant le pont : rien à mettre à jour au salon.
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'sq';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'sqpass';
process.env.DB_NAME = process.env.DB_NAME || 'salonq';
process.env.SETTINGS_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || 'testkeytestkeytestkeytestkey123456';
const path = require('path');
const { asciiTicket } = require(path.join(__dirname, '../../src/lib/ticketText'));
const { pool } = require(path.join(__dirname, '../../src/db'));
const BASE = 'http://127.0.0.1:3999';
const H = { 'Content-Type': 'application/json', 'X-Salon-Slug': 'test', 'X-Admin-Password': 'adminpw' };
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n + (x ? '  [' + x + ']' : '')); };

(async () => {
  console.log('\n[A] Remplacement');
  check('é è ê à ç ù -> e e e a c u', asciiTicket('équipe crème fête à ça où') === 'equipe creme fete a ca ou');
  check('majuscules : É À Ç -> E A C', asciiTicket('ÉQUIPE À ÇA') === 'EQUIPE A CA');
  check('œ € guillemets apostrophe tirets', asciiTicket('Œuf cœur 2,00 € «Lava» d’eau – fin…') === 'OEuf coeur 2,00 EUR "Lava" d\'eau - fin...', asciiTicket('Œuf cœur 2,00 € «Lava» d’eau – fin…'));
  check('ASCII, chiffres, retours à la ligne et largeur de colonne inchangés', asciiTicket('1 x Coupe homme    20,00 EUR\n----') === '1 x Coupe homme    20,00 EUR\n----');
  check('caractère inconnu -> « ? » (jamais d\'octet bizarre)', asciiTicket('a中b') === 'a?b');
  check('résultat 100 % ASCII', /^[\x00-\x7F]*$/.test(asciiTicket('Bouteille d’eau Équipe ½ ß ø Ł °')));

  console.log('\n[B] Le serveur nettoie avant le pont (ticket), jamais la commande du tiroir');
  const post = async (body) => (await fetch(BASE + '/api/tpe/print', { method: 'POST', headers: H, body: JSON.stringify(body) })).json();
  const r1 = await post({ text: '1 x Bouteille d’eau Équipe   1,00 €', mode: 'escpos' });
  const [[j1]] = await pool.query('SELECT text FROM print_jobs WHERE id = ?', [r1.job_id]);
  check('ticket (escpos) enregistré sans accents', j1 && j1.text === "1 x Bouteille d'eau Equipe   1,00 EUR", j1 && j1.text);
  const drawer = '\x1Bp\x00\x19\xFA';
  const r2 = await post({ text: drawer, mode: 'drawer' });
  const [[j2]] = await pool.query('SELECT text FROM print_jobs WHERE id = ?', [r2.job_id]);
  check('ouverture du tiroir : octets inchangés', j2 && j2.text === drawer);
  await pool.query('DELETE FROM print_jobs WHERE id IN (?, ?)', [r1.job_id, r2.job_id]);

  console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERREUR TEST', e); process.exit(1); });
