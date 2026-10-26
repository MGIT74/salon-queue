#!/usr/bin/env node
/**
 * Diagnostic Concert : envoie UNE demande de paiement au TPE et affiche
 * TOUS les octets qu'il renvoie (le pont, lui, ignore en silence tout ce
 * qui n'est pas une trame STX...ETX complète : un ACK/NAK du terminal
 * passe inaperçu).
 *
 * Usage :
 *   node tpe-diag.js <ip> [port=8888] [pos=2] [mode=raw34] [montant_centimes=1]
 *
 * Modes :
 *   raw33  trame actuelle du pont (n° de caisse sur 1 caractère, 33 car.)
 *   raw34  n° de caisse sur 2 caractères ("02"), 34 car.
 *   enq34  comme raw34, précédé de la poignée de main ENQ/ACK puis EOT,
 *          et acquittement (ACK) de ce que le TPE renvoie
 *
 * Chaque essai peut afficher le montant sur le TPE : annuler sur le
 * terminal entre deux essais.
 */
const net = require('net');

const STX = 0x02, ETX = 0x03, EOT = 0x04, ENQ = 0x05, ACK = 0x06, NAK = 0x15;
const NAMES = { 0x02: 'STX', 0x03: 'ETX', 0x04: 'EOT', 0x05: 'ENQ', 0x06: 'ACK', 0x15: 'NAK' };

const [ip, port = '8888', pos = '2', mode = 'raw34', amount = '1'] = process.argv.slice(2);
if (!ip || !['raw33', 'raw34', 'enq34'].includes(mode)) {
  console.log('Usage : node tpe-diag.js <ip> [port=8888] [pos=2] [raw33|raw34|enq34] [montant_centimes=1]');
  process.exit(1);
}

function frame(posField) {
  const msg = posField + String(amount).padStart(8, '0') +
    '0' + '1' + '0' + '978' + ' '.repeat(10) + 'A010' + 'B010';
  const body = Buffer.concat([Buffer.from(msg, 'ascii'), Buffer.from([ETX])]);
  let lrc = 0;
  for (const b of body) lrc ^= b;
  return { msg, buf: Buffer.concat([Buffer.from([STX]), body, Buffer.from([lrc])]) };
}

function show(buf) {
  return [...buf].map((b) => NAMES[b] ? `<${NAMES[b]}>` :
    (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : `<0x${b.toString(16).padStart(2, '0')}>`)).join('');
}

const t0 = Date.now();
const log = (s) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

const { msg, buf } = frame(mode === 'raw33' ? String(pos).slice(0, 1) : String(pos).padStart(2, '0').slice(-2));
log(`mode ${mode} - ${ip}:${port} - message (${msg.length} car.) : "${msg}"`);

const socket = net.createConnection({ host: ip, port: Number(port) });
let step = mode === 'enq34' ? 'wait-ack-enq' : 'sent';

socket.on('connect', () => {
  log('connecté');
  if (mode === 'enq34') { log('-> <ENQ>'); socket.write(Buffer.from([ENQ])); }
  else { log('-> ' + show(buf)); socket.write(buf); }
});

socket.on('data', (chunk) => {
  log('<- ' + show(chunk) + `   (hex ${chunk.toString('hex')})`);
  if (mode !== 'enq34') return;
  if (step === 'wait-ack-enq' && chunk.includes(ACK)) {
    step = 'wait-ack-frame'; log('-> ' + show(buf)); socket.write(buf);
  } else if (step === 'wait-ack-frame' && chunk.includes(ACK)) {
    step = 'wait-answer'; log('-> <EOT>'); socket.write(Buffer.from([EOT]));
  } else if (step === 'wait-answer' && chunk.includes(ENQ)) {
    log('-> <ACK>'); socket.write(Buffer.from([ACK]));
  } else if (step === 'wait-answer' && chunk.includes(ETX)) {
    step = 'done'; log('-> <ACK> (réponse reçue, fin du diagnostic)'); socket.write(Buffer.from([ACK]));
    setTimeout(() => { socket.destroy(); process.exit(0); }, 2000);
  }
  if (chunk.includes(NAK)) log('!! NAK : le TPE refuse la trame');
});

socket.on('close', () => { log('connexion fermée par le TPE'); process.exit(0); });
socket.on('error', (e) => { log('erreur : ' + e.message); process.exit(1); });
setTimeout(() => { log('fin (90 s sans conclusion)'); socket.destroy(); process.exit(0); }, 90000);
