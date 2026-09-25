#!/bin/bash
# Regenere TPE-Bridge-Installeur.bat : un .bat autonome qui embarque
# (encodes en base64, decodes via certutil au lancement) tpe-bridge.js,
# tpe-bridge-win.js, config-wizard.ps1, Configurer.bat et run-hidden.vbs,
# pour que l'installation ne necessite plus qu'un seul fichier telecharge.
# A relancer a chaque fois que l'un de ces fichiers change.
set -euo pipefail
cd "$(dirname "$0")"
WIN_DIR=".."
CORE="$WIN_DIR/../tpe-bridge.js"
OUT="TPE-Bridge-Installeur.bat"

base64 -w 64 "$CORE" > core.b64
base64 -w 64 "$WIN_DIR/tpe-bridge-win.js" > win.b64
base64 -w 64 "$WIN_DIR/config-wizard.ps1" > wizard.b64
base64 -w 64 "$WIN_DIR/Configurer.bat" > configurer.b64
base64 -w 64 "$WIN_DIR/run-hidden.vbs" > hidden.b64

make_block() {
  local marker="$1" b64file="$2"
  echo ":${marker}_BEGIN"
  echo "-----BEGIN CERTIFICATE-----"
  cat "$b64file"
  echo "-----END CERTIFICATE-----"
  echo ":${marker}_END"
}

{
  cat part1_header.txt
  echo "REM ============================================================"
  echo "REM  Donnees embarquees ci-dessous (ne pas modifier a la main)."
  echo "REM  Le script s'arrete toujours avant d'atteindre cette zone -"
  echo "REM  elle n'est lue que comme donnees par extract_payload."
  echo "REM ============================================================"
  make_block "TPE_BRIDGE_CORE" core.b64
  make_block "TPE_BRIDGE_WIN" win.b64
  make_block "CONFIG_WIZARD" wizard.b64
  make_block "CONFIGURER_BAT" configurer.b64
  make_block "RUN_HIDDEN_VBS" hidden.b64
} > "$OUT"

sed -i 's/$/\r/' "$OUT"
rm -f core.b64 win.b64 wizard.b64 configurer.b64 hidden.b64
echo "Genere: $WIN_DIR/standalone/$OUT"
