#!/usr/bin/env node
/**
 * Simulateur de TPE (protocole Nepting / trames TLV type "Protocole Caisse").
 *
 * OUTIL DE DEV UNIQUEMENT. Jamais appelé par l'app en prod, jamais déployé
 * sur le serveur xCloud. À lancer à la main sur un poste de dev pour tester
 * l'intégration caisse <-> TPE avant d'avoir accès au vrai terminal.
 *
 * Ce que fait ce script :
 *  - Ouvre un port TCP et se comporte comme le ferait le TPE : il attend
 *    une connexion (celle que la caisse ouvrirait normalement vers le TPE),
 *    lit une trame TLV ("CZ004...CJ012...CA002...CB..."), l'affiche de
 *    façon lisible, puis répond avec une trame de résultat (succès ou
 *    échec, configurable), après un délai simulant le temps de paiement.
 *
 *  - Comme on ne sait pas encore, sur le vrai terminal, si la réponse
 *    revient sur la MÊME connexion ou si le TPE rappelle la caisse sur son
 *    propre port d'écoute (20006 dans la config vue sur le terminal), ce
 *    simulateur supporte les deux modes (voir --reply-mode ci-dessous),
 *    pour qu'on puisse tester les deux hypothèses avec le vrai code plus
 *    tard sans avoir à changer le simulateur.
 *
 * Usage :
 *   node simulate-tpe.js [options]
 *
 * Options :
 *   --port <n>            Port d'écoute du simulateur (= "port d'écoute TPE"
 *                          côté vrai terminal). Défaut : 20002
 *   --result <mode>        success | failure | random. Défaut : success
 *   --delay <ms>            Délai simulant le temps de paiement. Défaut : 3000
 *   --reply-mode <mode>     same | callback. Défaut : same
 *                            same      -> répond sur la même connexion TCP
 *                            callback  -> ouvre une NOUVELLE connexion vers
 *                                         --callback-host:--callback-port
 *                                         pour livrer la réponse (comme le
 *                                         ferait un TPE qui rappelle la
 *                                         caisse sur son port d'écoute)
 *   --callback-host <ip>    Hôte à rappeler en mode callback. Défaut : 127.0.0.1
 *   --callback-port <n>     Port à rappeler en mode callback (= "port
 *                            d'écoute caisse" vu sur le terminal). Défaut : 20006
 *
 * Exemples :
 *   node simulate-tpe.js
 *   node simulate-tpe.js --result failure
 *   node simulate-tpe.js --reply-mode callback --callback-host 192.168.1.50
 */

'use strict';

const net = require('net');

/* ---------- Lecture des arguments ---------- */

function parseArgs(argv) {
  const opts = {
    port: 20002,
    result: 'success',
    delay: 3000,
    replyMode: 'same',
    callbackHost: '127.0.0.1',
    callbackPort: 20006
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--port') opts.port = parseInt(next(), 10);
    else if (a === '--result') opts.result = next();
    else if (a === '--delay') opts.delay = parseInt(next(), 10);
    else if (a === '--reply-mode') opts.replyMode = next();
    else if (a === '--callback-host') opts.callbackHost = next();
    else if (a === '--callback-port') opts.callbackPort = parseInt(next(), 10);
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  return opts;
}

function printHelp() {
  console.log(`
Simulateur de TPE Nepting - outil de dev

  node simulate-tpe.js [options]

  --port <n>            Port d'écoute (def: 20002)
  --result <mode>        success | failure | random (def: success)
  --delay <ms>            Délai simulé avant réponse (def: 3000)
  --reply-mode <mode>     same | callback (def: same)
  --callback-host <ip>    Hôte rappelé en mode callback (def: 127.0.0.1)
  --callback-port <n>     Port rappelé en mode callback (def: 20006)
`);
}

/* ---------- TLV : parsing et construction de trames ---------- */

/**
 * Parse une trame TLV "CZ0040300CJ012...CA00201..." en objet { TAG: valeur }.
 * Format par tag : 2 caractères de tag + 3 caractères de longueur (numérique)
 * + N caractères de valeur (N = la longueur lue).
 */
function parseFrame(frame) {
  const tags = {};
  let i = 0;
  while (i < frame.length) {
    const tag = frame.slice(i, i + 2);
    const lenStr = frame.slice(i + 2, i + 5);
    const len = parseInt(lenStr, 10);
    if (tag.length < 2 || isNaN(len)) {
      console.warn(`  [!] Trame illisible à partir de l'offset ${i} : "${frame.slice(i)}"`);
      break;
    }
    const value = frame.slice(i + 5, i + 5 + len);
    tags[tag] = value;
    i += 5 + len;
  }
  return tags;
}

/** Construit un tag TLV : "CZ" + longueur sur 3 chiffres + valeur. */
function tlv(tag, value) {
  const str = String(value);
  const len = String(str.length).padStart(3, '0');
  return `${tag}${len}${str}`;
}

const TAG_LABELS = {
  CZ: 'Version du protocole',
  CJ: 'Identifiant de caisse',
  CA: 'Numéro de caisse',
  CB: 'Montant (centimes)',
  CD: 'Opération (0=débit, 1=crédit)',
  CE: 'Devise (978=EUR)',
  BB: 'Forcer demande autorisation',
  CF: 'Identifiant transaction marchand',
  CK: 'Ticket client demandé',
  BH: 'Téléphone client',
  BI: 'Email client'
};

function describeFrame(tags) {
  return Object.entries(tags)
    .map(([tag, val]) => `    ${tag} (${TAG_LABELS[tag] || 'tag inconnu'}) = "${val}"`)
    .join('\n');
}

/* ---------- Construction de la réponse simulée ---------- */

function buildResponse(requestTags, result) {
  const parts = [];
  parts.push(tlv('CZ', requestTags.CZ || '0300'));
  parts.push(tlv('CJ', requestTags.CJ || ''));
  parts.push(tlv('CA', requestTags.CA || '02'));
  parts.push(tlv('CB', requestTags.CB || '0'));
  parts.push(tlv('CD', requestTags.CD || '0'));
  parts.push(tlv('CE', requestTags.CE || '978'));
  if (requestTags.CF) parts.push(tlv('CF', requestTags.CF));

  if (result === 'success') {
    const fakeAuth = String(Math.floor(100000 + Math.random() * 899999));
    parts.push(tlv('AC', fakeAuth));
    parts.push(tlv('AE', '10')); // 10 = opération effectuée
    parts.push(tlv('CC', '00B')); // CB contactless, valeur d'exemple
  } else {
    parts.push(tlv('AE', '01')); // 01 = opération NON effectuée
    parts.push(tlv('AF', '04')); // 04 = refusé
  }

  return parts.join('');
}

/* ---------- Serveur ---------- */

function pickResult(mode) {
  if (mode === 'random') return Math.random() < 0.7 ? 'success' : 'failure';
  return mode === 'failure' ? 'failure' : 'success';
}

function handleConnection(socket, opts) {
  const from = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`\n[+] Connexion entrante de ${from} (comme le ferait la caisse vers le TPE)`);

  // Sans ça, si l'autre côté ferme brutalement la connexion (par ex.
  // juste après avoir reçu la réponse), Node considère l'erreur comme
  // non gérée et plante tout le process. On l'ignore proprement à la
  // place, en la logguant juste pour information.
  socket.on('error', (err) => {
    console.log(`[i] Connexion fermée côté client (${err.code || err.message}) - rien d'anormal si c'était après une réponse`);
  });

  let buffer = '';
  let handled = false;
  let idleTimer = null;

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    // On ne connaît pas de terminateur fiable (le format TLV n'en impose
    // pas), donc on considère la trame complète dès que plus aucune
    // donnée n'arrive pendant un court instant, plutôt que d'attendre que
    // l'autre côté ferme la connexion (elle doit rester ouverte pour
    // recevoir la réponse en mode "same").
    clearTimeout(idleTimer);
    idleTimer = setTimeout(processFrame, 80);
  });

  socket.on('close', () => {
    clearTimeout(idleTimer);
    // Si le client a fermé la connexion très vite après l'envoi (par
    // exemple parce qu'il n'attend pas de réponse sur cette même ligne,
    // comme en mode callback), le petit délai d'inactivité ci-dessus peut
    // ne jamais se déclencher. La fermeture de connexion est en soi un
    // signal sans ambiguïté qu'il n'y a plus rien à recevoir, donc on
    // traite la trame ici aussi dans ce cas.
    processFrame();
  });

  function processFrame() {
    if (handled || !buffer.trim()) return;
    handled = true;

    const frame = buffer.trim();
    console.log(`[>] Trame reçue (brute) : ${frame}`);
    const tags = parseFrame(frame);
    console.log('[>] Trame décodée :');
    console.log(describeFrame(tags));

    const result = pickResult(opts.result);
    const amountCents = parseInt(tags.CB || '0', 10);
    console.log(`[i] Simulation du paiement de ${(amountCents / 100).toFixed(2)} € — résultat programmé : ${result.toUpperCase()} (délai ${opts.delay}ms)`);

    setTimeout(() => {
      const responseFrame = buildResponse(tags, result);
      deliverResponse(socket, responseFrame, opts);
    }, opts.delay);
  }
}

function deliverResponse(requestSocket, responseFrame, opts) {
  if (opts.replyMode === 'callback') {
    console.log(`[<] Envoi de la réponse en RAPPELANT ${opts.callbackHost}:${opts.callbackPort} (mode callback)`);
    const out = net.createConnection({ host: opts.callbackHost, port: opts.callbackPort }, () => {
      out.write(responseFrame);
      out.end();
      console.log(`[<] Trame de réponse envoyée : ${responseFrame}`);
    });
    out.on('error', (err) => {
      console.error(`[!] Impossible de rappeler ${opts.callbackHost}:${opts.callbackPort} : ${err.message}`);
      console.error('    (la caisse doit écouter sur ce port pour recevoir la réponse en mode callback)');
    });
    // La connexion entrante d'origine peut être fermée, elle ne sert plus.
    if (!requestSocket.destroyed) requestSocket.end();
  } else {
    console.log('[<] Envoi de la réponse sur LA MÊME connexion (mode same)');
    if (requestSocket.destroyed) {
      console.error('[!] La connexion entrante est déjà fermée, impossible de répondre en mode "same".');
      console.error('    Essaie --reply-mode callback si le vrai TPE fonctionne ainsi.');
      return;
    }
    requestSocket.write(responseFrame);
    requestSocket.end();
    console.log(`[<] Trame de réponse envoyée : ${responseFrame}`);
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const server = net.createServer((socket) => handleConnection(socket, opts));
  server.listen(opts.port, () => {
    console.log('=== Simulateur de TPE Nepting ===');
    console.log(`Écoute sur le port ${opts.port} (équivalent du "port d'écoute TPE" du vrai terminal)`);
    console.log(`Résultat programmé : ${opts.result}`);
    console.log(`Mode de réponse : ${opts.replyMode}` + (opts.replyMode === 'callback' ? ` (rappelle ${opts.callbackHost}:${opts.callbackPort})` : ''));
    console.log('En attente de connexions... (Ctrl+C pour arrêter)\n');
  });

  server.on('error', (err) => {
    console.error(`[!] Erreur serveur : ${err.message}`);
    process.exit(1);
  });
}

main();
