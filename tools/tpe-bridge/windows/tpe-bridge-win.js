#!/usr/bin/env node
/**
 * TPE Bridge — lanceur Windows convivial.
 *
 * Objectif : sur le mini-PC du salon, le coiffeur double-clique sur
 * "TPE Bridge" et n'a RIEN d'autre à faire. Ce wrapper :
 *
 *  1. Lit la configuration dans %APPDATA%\TPE-Bridge\config.json
 *  2. Si elle n'existe pas (premier lancement) : ouvre un petit assistant
 *     dans la console (URL de l'app, slug du salon, clé du pont,
 *     imprimante facultative), la sauvegarde, et ne redemande jamais plus
 *  3. Démarre le pont (polling serveur + option TPE) en arrière-plan,
 *     avec relance automatique en cas de crash, et une icône système
 *     discret (console minimisée)
 *
 * L'installateur (install.bat) crée un raccourci dans le menu Démarrer
 * et le lance au démarrage de Windows — le coiffeur n'y touche jamais.
 *
 * Ce fichier EST le pont : il embarque toute la logique de
 * tpe-bridge.js (chargé par require si présent à côté, sinon il
 * fonctionne en mode autonome impression seule).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const os = require('os');

const CONFIG_DIR = path.join(process.env.APPDATA || os.homedir(), 'TPE-Bridge');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/* ---------- Configuration ---------- */

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

function ask(rl, question, def) {
  return new Promise((resolve) => {
    const suffix = def ? ` (${def})` : '';
    rl.question(question + suffix + ' : ', (answer) => {
      resolve(String(answer || '').trim() || def || '');
    });
  });
}

/**
 * Partage automatiquement l'imprimante par défaut de Windows via
 * PowerShell (Set-Printer -Shared), pour éviter la manipulation
 * manuelle (Propriétés de l'imprimante > Partage > cocher la case,
 * parfois difficile à trouver). Retourne le nom de partage utilisé, ou
 * null si ça échoue (imprimante introuvable, droits insuffisants...) -
 * dans ce cas l'utilisateur peut toujours partager manuellement
 * (voir windows/README.md) et saisir le nom de partage à la question
 * suivante.
 */
function autoShareDefaultPrinter() {
  try {
    const script =
      '$p = Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1; ' +
      'if ($p) { ' +
      '  $share = ($p.Name -replace "[^a-zA-Z0-9_-]", "_"); ' +
      '  if ($share.Length -eq 0) { $share = "TicketPrinter" }; ' +
      '  Set-Printer -Name $p.Name -Shared $true -ShareName $share -ErrorAction Stop; ' +
      '  Write-Output ($p.Name + "|" + $share) ' +
      '}';
    const out = execSync('powershell.exe -NoProfile -Command "' + script.replace(/"/g, '\\"') + '"', { encoding: 'utf8', timeout: 10000 }).trim();
    if (!out) return null;
    const [printerName, shareName] = out.split('|');
    return { printerName, shareName };
  } catch (e) {
    return null;
  }
}

/** Assistant de premier lancement : pose les 4 questions et sauvegarde. */
async function firstRunWizard() {
  console.log('');
  console.log('================================================');
  console.log('   TPE Bridge - Premiere configuration');
  console.log('================================================');
  console.log('');
  console.log('Bienvenue ! Ce programme relie votre caisse en ligne a');
  console.log('votre imprimante et terminal de paiement. Repondez aux');
  console.log('3 questions suivantes (une seule fois).');
  console.log('');
  console.log('(Astuce : les 2 dernieres vous sont donnees par votre');
  console.log(' support, dans le Dashboard > Reglages > Terminal de');
  console.log(' paiement, bouton "Generer la cle du pont".)');
  console.log('');

  console.log('[..] Partage de l\'imprimante par defaut (impression silencieuse)...');
  const shared = autoShareDefaultPrinter();
  let defaultPrinterAnswer = '';
  if (shared) {
    console.log('[OK] "' + shared.printerName + '" partagee sous le nom "' + shared.shareName + '".');
    defaultPrinterAnswer = shared.shareName;
  } else {
    console.log('[!] Partage automatique impossible (aucune imprimante par defaut, ou droits');
    console.log('    insuffisants - relancez en tant qu\'administrateur). Vous pouvez partager');
    console.log('    l\'imprimante manuellement (voir windows/README.md) et indiquer son nom');
    console.log('    de partage a la question suivante, ou reessayer plus tard.');
  }
  console.log('');

  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const server = await ask(rl, 'Adresse de votre application (ex: https://rdv.handsgraphic.com)', 'https://rdv.handsgraphic.com');
  const salon = await ask(rl, 'Identifiant du salon (celui dans l\'URL ?salon=...)', '');
  const key = await ask(rl, 'Cle du pont', '');
  const printer = await ask(rl, 'Nom de partage de l\'imprimante', defaultPrinterAnswer);
  const tpeIp = await ask(rl, 'IP du TPE (Entree si aucun TPE pour le moment)', '');
  rl.close();

  if (!salon || !key) {
    console.log('');
    console.log('[!] L\'identifiant du salon et la cle du pont sont obligatoires.');
    console.log('    Relancez ce programme pour recommencer.');
    process.exit(1);
  }

  const cfg = { server, salon, key, printer, tpeIp };
  saveConfig(cfg);
  console.log('');
  console.log('[OK] Configuration sauvegardee : ' + CONFIG_FILE);
  console.log('');
  return cfg;
}

/* ---------- Démarrage du pont ---------- */

function startBridge(cfg) {
  const args = [
    '--server', cfg.server,
    '--salon', cfg.salon,
    '--key', cfg.key
  ];
  if (cfg.printer) args.push('--printer', cfg.printer);
  if (cfg.tpeIp) args.push('--tpe', cfg.tpeIp);

  // Relance automatique : si le process meurt (crash, MAJ réseau...),
  // on le relance après 5 s, indéfiniment.
  const child = spawn(process.execPath, [path.join(__dirname, 'bridge-core.js'), ...args], {
    stdio: 'inherit',
    windowsHide: false
  });

  child.on('exit', (code) => {
    console.log(`[i] Pont arrêté (code ${code}) — relance dans 5 s... (Ctrl+C deux fois pour quitter)`);
    setTimeout(() => startBridge(cfg), 5000);
  });
}

/* ---------- Main ---------- */

async function main() {
  let cfg = loadConfig();
  if (!cfg) {
    cfg = await firstRunWizard();
  }

  console.log('');
  console.log('=== TPE Bridge ===');
  console.log(`App      : ${cfg.server}`);
  console.log(`Salon    : ${cfg.salon}`);
  console.log(`Config   : ${CONFIG_FILE}`);
  console.log('');

  // Le cœur du pont est dans bridge-core.js (même dossier) : c'est le
  // tpe-bridge.js standard renommé. S'il est absent, on l'extrait depuis
  // le fichier pont embarqué (tpe-bridge.js) fourni par l'installateur.
  const corePath = path.join(__dirname, 'bridge-core.js');
  if (!fs.existsSync(corePath)) {
    const src = path.join(__dirname, 'tpe-bridge.js');
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, corePath);
    } else {
      console.error('[!] bridge-core.js introuvable — réinstallez TPE Bridge.');
      process.exit(1);
    }
  }

  startBridge(cfg);
}

main().catch((err) => {
  console.error('[!] Erreur fatale :', err.message);
  process.exit(1);
});