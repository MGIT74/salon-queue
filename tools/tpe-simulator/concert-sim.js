#!/usr/bin/env node
/**
 * Simulateur TPE Concert v3 IP — outil de dev, aucun risque.
 * Se comporte comme le terminal : écoute sur un port, lit la trame
 * de demande, l'affiche, répond "ACCEPTÉ" (ou refusé avec --refuse).
 *
 * Usage : node concert-sim.js [--port 8888] [--refuse] [--delay 2000]
 */
'use strict';
const net = require('net');

let port = 8888, refuse = false, delay = 2000;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--port') port = parseInt(argv[++i], 10);
  else if (argv[i] === '--refuse') refuse = true;
  else if (argv[i] === '--delay') delay = parseInt(argv[++i], 10);
}

const STX = 0x02, ETX = 0x03;
function lrc(buf) { let l = 0; for (const b of buf) l ^= b; return l; }

net.createServer((s) => {
  const from = s.remoteAddress;
  let buf = Buffer.alloc(0);
  s.on('error', () => {});
  s.on('data', (c) => {
    buf = Buffer.concat([buf, c]);
    setTimeout(() => {
      const msg = buf.subarray(1, buf.length - 2).toString('ascii');
      if (!msg) return;
      console.log('\n[>] Trame reçue (' + msg.length + ' caractères) : ' + JSON.stringify(msg));
      console.log('    pos=' + msg.slice(0, 1)
        + '  montant=' + (parseInt(msg.slice(1, 9), 10) / 100).toFixed(2) + ' €'
        + '  type=' + (msg.slice(11, 12) === '1' ? 'remboursement' : 'paiement'));
      const result = refuse ? '3' : '0';
      const label = refuse ? 'REFUSÉ' : 'ACCEPTÉ';
      console.log('[<] Réponse programmée : ' + label + ' dans ' + delay + ' ms');
      const resp = msg.slice(0, 1) + result + msg.slice(1, 9) + '1' + '978' + ' '.repeat(10);
      const body = Buffer.concat([Buffer.from(resp, 'ascii'), Buffer.from([ETX])]);
      setTimeout(() => {
        s.write(Buffer.concat([Buffer.from([STX]), body, Buffer.from([lrc(body)])]));
        setTimeout(() => s.destroy(), 200);
      }, delay);
    }, 100);
  });
}).listen(port, () => console.log('[sim] TPE Concert simulé sur le port ' + port + (refuse ? ' (toujours REFUSÉ)' : ' (toujours ACCEPTÉ)')));

