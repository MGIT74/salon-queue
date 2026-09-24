#!/usr/bin/env node
/**
 * Pont local caisse <-> TPE (protocole Concert v3 IP).
 *
 * PROBLÈME RÉSOLU : l'app de caisse est hébergée en ligne (xCloud), mais
 * le TPE vit sur le réseau local du salon (ex. 192.168.1.125). Un serveur
 * distant ne peut JAMAIS joindre une IP privée - le paiement carte
 * échouait donc invariablement. Ce petit pont tourne sur n'importe quel
 * ordinateur du salon (PC de caisse, mini-PC, même un Raspberry Pi) :
 * le navigateur de la caisse lui délègue l'envoi, et lui parle au TPE
 * en TCP local.
 *
 * AUCUNE DÉPENDANCE : Node.js >= 18 suffit (fetch et http natifs).
 *
 * Usage :
 *   node tpe-bridge.js --tpe 192.168.1.125 [--port 8888] [--listen 7788] [--pos 2]
 *
 *   --tpe <ip>      Adresse IP du terminal (obligatoire - celle du ticket
 *                   de config, ex. 192.168.1.125)
 *   --port <n>      Port d'écoute Concert du TPE (défaut : 8888)
 *   --listen <n>    Port HTTP du pont (défaut : 7788)
 *   --pos <n>       Numéro de caisse (défaut : celui du ticket, ex. 2)
 *
 * La caisse (Réglages > Terminal de paiement > Pont local) doit pointer
 * vers http://<ip-de-cet-ordinateur>:7788
 *
 * Endpoints :
 *   GET  /health   -> { ok: true } (test de communication depuis la caisse)
 *   POST /charge   -> { amount_cents: 1500 } - envoie le paiement au TPE,
 *                     attend la réponse, renvoie { success, ... }
 *
 * CORS est ouvert : la page de caisse (hébergée en https://...) appelle
 * ce pont en http://ip-locale - c'est un cross-origin assumé, limité au
 * réseau local. Aucune donnée sensible ne transite ici (juste un montant).
 */

'use strict';

const http = require('http');
const net = require('net');

/* ---------- Lecture des arguments ---------- */

function parseArgs(argv) {
  const opts = { tpe: null, port: 8888, listen: 7788, pos: '2', printer: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--tpe') opts.tpe = next();
    else if (a === '--port') opts.port = parseInt(next(), 10);
    else if (a === '--listen') opts.listen = parseInt(next(), 10);
    else if (a === '--pos') opts.pos = String(next()).slice(0, 1);
    else if (a === '--printer') opts.printer = String(next());
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  return opts;
}

function printHelp() {
  console.log(`
Pont local caisse <-> TPE + impression silencieuse

  node tpe-bridge.js --tpe <ip du TPE> [options]

  --tpe <ip>         IP du terminal (facultatif si impression seule)
  --port <n>         Port Concert du TPE (defaut : 8888)
  --listen <n>       Port HTTP de ce pont (defaut : 7788)
  --pos <n>          Numero de caisse (defaut : 2)
  --printer <nom>    Imprimante CUPS pour les tickets (defaut : imprimante
                     par defaut du systeme). Liste : lpstat -p | grep imprimante
`);
}

/* ---------- Trame Concert v3 (même logique que src/lib/tpeConcert.js) ---------- */

const STX = 0x02;
const ETX = 0x03;

function computeLrc(buf) {
  let lrc = 0;
  for (const b of buf) lrc ^= b;
  return lrc;
}

function buildConcertFrame(posNumber, amountCents, transactionType) {
  const amount = String(amountCents).padStart(8, '0');
  const msg =
    String(posNumber).slice(0, 1) +
    amount +
    '0' +                                     // answer_flag
    '1' +                                     // payment_mode CB
    (transactionType === 'credit' ? '1' : '0') +
    '978' +                                   // EUR
    ' '.repeat(10) +                          // private
    'A010' +                                  // réponse fin de transaction
    'B010';                                   // autorisation auto
  const body = Buffer.concat([Buffer.from(msg, 'ascii'), Buffer.from([ETX])]);
  return Buffer.concat([Buffer.from([STX]), body, Buffer.from([computeLrc(body)])]);
}

const RESULT_LABELS = {
  '0': 'Accepté',
  '1': 'Appel autorisation requis',
  '2': 'Forçage',
  '3': 'Refusé',
  '4': 'Carte interdite',
  '5': 'Annulé',
  '6': 'Transaction non effectuée',
  '7': 'Transaction impossible',
  '8': 'Erreur inconnue'
};

function interpretResponse(frame) {
  const t = frame.replace(/\r/g, '');
  if (t.length < 14) throw new Error('Réponse TPE trop courte (' + t.length + ')');
  return {
    success: t.charAt(1) === '0',
    resultCode: t.charAt(1),
    failureReason: t.charAt(1) === '0' ? null : (RESULT_LABELS[t.charAt(1)] || 'Échec (code ' + t.charAt(1) + ')'),
    amountCents: parseInt(t.slice(2, 10), 10),
    currency: t.slice(11, 14)
  };
}

/**
 * Envoie la demande au TPE et résout avec le résultat une fois la
 * réponse lue (même connexion TCP). Le paiement carte dure typiquement
 * 10-30 s (présentation de la carte, PIN...), d'où un timeout large.
 */
function concertCharge(host, port, pos, amountCents, timeoutMs) {
  return new Promise((resolve, reject) => {
    const frame = buildConcertFrame(pos, amountCents, 'debit');
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error("Le TPE n'a pas répondu à temps (terminal en veille ? hors ligne ?)"));
    }, timeoutMs);

    const settle = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      socket.destroy();
      fn(v);
    };

    socket.on('connect', () => {
      console.log(`[>] Demande de ${(amountCents / 100).toFixed(2)} € envoyée à ${host}:${port}`);
      socket.write(frame);
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const start = buffer.indexOf(STX);
      if (start === -1) return;
      const end = buffer.indexOf(ETX, start + 1);
      if (end === -1) return;
      const payload = buffer.subarray(start + 1, end).toString('ascii');
      try {
        settle(resolve, interpretResponse(payload));
      } catch (err) {
        settle(reject, err);
      }
    });

    socket.once('close', () => {
      if (settled) return;
      const start = buffer.indexOf(STX);
      const end = buffer.indexOf(ETX, start + 1);
      if (start !== -1 && end !== -1) {
        try {
          settle(resolve, interpretResponse(buffer.subarray(start + 1, end).toString('ascii')));
        } catch (err) { settle(reject, err); }
      }
    });

    socket.on('error', (err) => settle(reject, err));
  });
}

/* ---------- Impression silencieuse ---------- */

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Imprime du texte brut via CUPS (macOS/Linux) SANS aucune boîte de
 * dialogue : on écrit un fichier temporaire et on le soumet à `lp`.
 * Deux modes :
 *  - "escpos"  (défaut) : l'imprimante est une thermique 58/80 mm ;
 *    on lui envoie du texte brut + commande de découpe. `lp -o raw`
 *    est requis (file "raw" activée par défaut sur la plupart des
 *    pilotes thermiques).
 *  - "text" : imprimante classique (A4...) - lp rendra le texte
 *    proprement avec ses filtres standards.
 * printer : nom CUPS (ex. "EPSON_TM-T20III"). Vide = imprimante par
 * défaut du système.
 * Le retour contient l'identifiant de job CUPS (ex. "EPSON-123") pour
 * tracer l'impression.
 */
function printTicket(text, printer, mode) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), 'ticket-' + Date.now() + '.txt');
    fs.writeFile(tmpFile, text, 'utf8', (err) => {
      if (err) return reject(new Error('Écriture du ticket impossible : ' + err.message));

      const args = [];
      if (printer) args.push('-d', printer);
      if (mode === 'escpos') args.push('-o', 'raw');
      args.push('-t', 'Ticket-caisse');
      args.push(tmpFile);

      execFile('lp', args, { timeout: 15000 }, (err2, stdout, stderr) => {
        // Le fichier temporaire est soumis : on le supprime quoi qu'il arrive
        fs.unlink(tmpFile, () => {});
        if (err2) {
          const msg = (stderr || err2.message || '').trim();
          reject(new Error('Impression refusée par le système : ' + msg));
        } else {
          resolve({ jobId: (stdout || '').trim() });
        }
      });
    });
  });
}

/* ---------- Serveur HTTP ---------- */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
  res.end(body);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }

    if (req.method === 'GET' && req.url.split('?')[0] === '/health') {
      return sendJson(res, 200, { ok: true, tpe: opts.tpe, pos: opts.pos });
    }

    // Impression silencieuse d'un ticket (texte brut). La caisse génère
    // le texte du ticket et le pousse ici ; le pont le soumet à lp
    // (CUPS) sans aucune boîte de dialogue.
    // Body : { text: "...", mode: "escpos"|"text" (défaut escpos), printer: "NOM" }
    if (req.method === 'POST' && req.url.split('?')[0] === '/print') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 100_000) req.destroy(); });
      req.on('end', async () => {
        let payload;
        try {
          payload = JSON.parse(body);
        } catch (e) {
          return sendJson(res, 400, { error: 'Requête invalide' });
        }
        const text = typeof payload.text === 'string' ? payload.text : '';
        if (!text.trim()) return sendJson(res, 400, { error: 'Ticket vide' });
        const mode = payload.mode === 'text' ? 'text' : 'escpos';
        const printer = typeof payload.printer === 'string' && payload.printer.trim() ? payload.printer.trim() : opts.printer || '';

        console.log(`[${new Date().toLocaleTimeString()}] Impression (${mode}${printer ? ', ' + printer : ', défaut'}) — ${text.length} caractères`);
        try {
          const out = await printTicket(text, printer, mode);
          console.log('[<] Impression soumise :', out.jobId || '(job CUPS sans id)');
          sendJson(res, 200, Object.assign({ ok: true }, out));
        } catch (err) {
          console.error('[!] Échec impression :', err.message);
          sendJson(res, 502, { error: err.message });
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url.split('?')[0] === '/charge') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 10_000) req.destroy(); });
      req.on('end', async () => {
        let amountCents;
        try {
          amountCents = Number(JSON.parse(body).amount_cents);
        } catch (e) {
          return sendJson(res, 400, { error: 'Requête invalide' });
        }
        if (!Number.isInteger(amountCents) || amountCents <= 0) {
          return sendJson(res, 400, { error: 'Montant invalide' });
        }

        console.log(`[${new Date().toLocaleTimeString()}] Paiement ${(amountCents / 100).toFixed(2)} € -> TPE ${opts.tpe}:${opts.port}`);
        try {
          const result = await concertCharge(opts.tpe, opts.port, opts.pos, amountCents, 120000);
          console.log(`[<] Résultat : ${result.success ? 'ACCEPTÉ' : 'REFUSÉ (' + (result.failureReason || result.resultCode) + ')'}`);
          sendJson(res, 200, Object.assign({ ok: true }, result));
        } catch (err) {
          console.error('[!] Échec :', err.message);
          sendJson(res, 502, { error: err.message });
        }
      });
      return;
    }

    sendJson(res, 404, { error: 'Endpoint inconnu' });
  });

  server.listen(opts.listen, () => {
    console.log('=== Pont TPE Concert v3 + impression ===');
    console.log(`TPE cible     : ${opts.tpe ? opts.tpe + ':' + opts.port + ' (n° caisse ' + opts.pos + ')' : '(impression seule - pas de TPE configuré)'}`);
    console.log(`Imprimante    : ${opts.printer || 'imprimante par défaut du système'}`);
    console.log(`Pont en écoute: http://0.0.0.0:${opts.listen}`);
    console.log(`Santé         : http://localhost:${opts.listen}/health`);
    console.log('');
    console.log('Dans la caisse (Dashboard > Réglages > Terminal de paiement), renseignez :');
    console.log(`  Pont local : http://<ip-de-cet-ordinateur>:${opts.listen}`);
    console.log('');
    console.log('Imprimantes disponibles (lpstat -a) :');
    const { execFile } = require('child_process');
    execFile('lpstat', ['-a'], (err, stdout) => {
      if (err || !stdout.trim()) console.log('  (aucune imprimante détectée)');
      else stdout.trim().split('\n').forEach((l) => console.log('  ' + l));
    });
    console.log('');
    console.log('En attente de paiements et impressions... (Ctrl+C pour arrêter)');
  });

  server.on('error', (err) => {
    console.error('[!] Erreur serveur :', err.message);
    process.exit(1);
  });
}

main();