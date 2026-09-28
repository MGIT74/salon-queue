#!/bin/bash
# Teste tools/tpe-bridge/windows/run-hidden.vbs (le VRAI script) dans Wine :
# syntaxe, journal, declencheur, parse des dates, chemins de succes et d'echec.
# Prerequis : apt install wine64.
#
# Limites de Wine, contournees ici (le reste du code teste est le vrai texte) :
#  - ExpandEnvironmentStrings("%APPDATA%") y renvoie un caractere nul en trop :
#    les copies de test remplacent CET appel par un dossier fixe (C:\work\appdata).
#  - Wine ne lit pas correctement un .vbs aux fins de ligne LF : tout est en CRLF.
#  - WMI est incomplet : l'anti-doublon n'est PAS teste ici ; il a ete verifie sur
#    un vrai Windows (le journal du client contient "le pont tourne deja").
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/tools/tpe-bridge/windows/run-hidden.vbs"
export WINEPREFIX=/tmp/wp-lanceur WINEDEBUG=-all WINEARCH=win64 DISPLAY=
WINE=/usr/lib/wine/wine64
pass=0; fail=0
ok() { if [ "$2" = "1" ]; then echo "  OK   $1"; pass=$((pass+1)); else echo "  ECHEC $1  [$3]"; fail=$((fail+1)); fi; }

rm -rf "$WINEPREFIX"; timeout 120 $WINE wineboot --init >/dev/null 2>&1
W="$WINEPREFIX/drive_c/work"; mkdir -p "$W/appdata"
LOG="$W/appdata/TPE-Bridge/launch.log"
# Copies de test : seul l'appel a ExpandEnvironmentStrings est remplace (voir plus haut).
patch() { sed 's#sh.ExpandEnvironmentStrings("%APPDATA%")#"C:\\work\\appdata"#' "$SRC"; }
patch > "$W/run-hidden.vbs"; patch > "$W/TPE-Bridge.vbs"

runvbs() { rm -f "$LOG"; timeout 60 $WINE cscript.exe //nologo "C:\\work\\$1" "${@:2}" >/tmp/lanceur.out 2>&1; }
lastline() { tr -d '\r' < "$LOG" 2>/dev/null | tail -2 | head -1; }
alllines() { tr -d '\r' < "$LOG" 2>/dev/null; }

echo "[1] Le script se charge sans erreur de syntaxe et journalise"
runvbs run-hidden.vbs
ok "aucun message d'erreur de VBScript" "$([ ! -s /tmp/lanceur.out ] && echo 1 || echo 0)" "$(head -c 200 /tmp/lanceur.out)"
ok "le journal est cree" "$([ -f "$LOG" ] && echo 1 || echo 0)" "$LOG"

echo "[2] Declencheur"
runvbs run-hidden.vbs;               ok "sans argument -> manuel"            "$(alllines | grep -c 'declencheur : manuel,')" "$(alllines)"
runvbs run-hidden.vbs bouton;        ok "argument bouton"                    "$(alllines | grep -c 'declencheur : bouton,')" "$(alllines)"
runvbs run-hidden.vbs installeur;    ok "argument installeur"                "$(alllines | grep -c 'declencheur : installeur,')" "$(alllines)"
runvbs run-hidden.vbs configuration; ok "argument configuration"            "$(alllines | grep -c 'declencheur : configuration,')" "$(alllines)"
runvbs TPE-Bridge.vbs;               ok "fichier du dossier Demarrage (TPE-Bridge.vbs) -> demarrage Windows" "$(alllines | grep -c 'declencheur : demarrage Windows')" "$(alllines)"

echo "[3] Chemin d'echec : node introuvable"
runvbs run-hidden.vbs bouton
ok "le journal dit ECHEC du lancement (et pas 'pont lance')" "$(alllines | grep -c 'ECHEC du lancement')" "$(alllines)"
ok "aucune fenetre d'erreur (rien sur la sortie)" "$([ ! -s /tmp/lanceur.out ] && echo 1 || echo 0)" "$(head -c 200 /tmp/lanceur.out)"

echo "[4] Chemin de succes : un executable existe a l'emplacement de node"
patch | sed 's#C:\\Program Files\\nodejs\\node.exe#C:\\windows\\system32\\cmd.exe#' > "$W/ok.vbs"
runvbs ok.vbs bouton
ok "le journal dit 'pont lance'" "$(alllines | grep -c 'pont lance')" "$(alllines)"

echo "[5] Journal quand la lecture de l'heure de session est impossible (WMI absent de Wine)"
runvbs run-hidden.vbs bouton
ok "la duree est 'inconnue' (et pas une chaine vide)" "$(alllines | grep -c 'session Windows ouverte depuis inconnue)')" "$(alllines | head -1)"

echo "[6] Calcul de l'anciennete : le VRAI texte des fonctions, extrait du script"
# Wine ne sait pas Execute/ExecuteGlobal : on assemble un script = fonctions extraites + tests.
blocs() { python3 - "$SRC" "$@" <<'PY'
import sys
src=open(sys.argv[1],encoding='utf-8',newline='').read()
out=[]
for nom in sys.argv[2:]:
    i=src.index('Function '+nom+'(')
    j=src.index('End Function',i)+len('End Function')
    out.append(src[i:j])
sys.stdout.write('\r\n\r\n'.join(out)+'\r\n')
PY
}
{ blocs SecondesDepuis Duree; cat <<'VBS'

Function Wmi(t)
  Wmi = Year(t) & Right("0" & Month(t), 2) & Right("0" & Day(t), 2) & Right("0" & Hour(t), 2) & Right("0" & Minute(t), 2) & Right("0" & Second(t), 2) & ".000000+120"
End Function
WScript.Echo "S45=" & SecondesDepuis(Wmi(DateAdd("s", -45, Now)))
WScript.Echo "S5700=" & SecondesDepuis(Wmi(DateAdd("s", -5700, Now)))
WScript.Echo "ILLISIBLE=" & SecondesDepuis("n'importe quoi")
WScript.Echo "VIDE=" & SecondesDepuis("")
WScript.Echo "D=" & Duree(-1) & "|" & Duree(45) & "|" & Duree(179) & "|" & Duree(180) & "|" & Duree(5700) & "|" & Duree(Empty) & "|" & Duree("abc")
VBS
} | sed 's/\r$//; s/$/\r/' > "$W/fonctions.vbs"
timeout 60 $WINE cscript.exe //nologo 'C:\work\fonctions.vbs' > /tmp/harness.out 2>&1; tr -d '\r' < /tmp/harness.out
v() { grep "^$1=" /tmp/harness.out | tr -d '\r' | cut -d= -f2-; }
s45=$(v S45); s5700=$(v S5700)
ok "il y a 45 s -> environ 45 (entre 44 et 47)"       "$([ "${s45:-0}" -ge 44 ] && [ "${s45:-0}" -le 47 ] && echo 1 || echo 0)" "$s45"
ok "il y a 95 min -> environ 5700 (entre 5699 et 5702)" "$([ "${s5700:-0}" -ge 5699 ] && [ "${s5700:-0}" -le 5702 ] && echo 1 || echo 0)" "$s5700"
ok "date illisible -> -1" "$([ "$(v ILLISIBLE)" = "-1" ] && echo 1 || echo 0)" "$(v ILLISIBLE)"
ok "date vide -> -1"      "$([ "$(v VIDE)" = "-1" ] && echo 1 || echo 0)" "$(v VIDE)"
ok "affichage : inconnue|45 s|179 s|3 min|95 min|inconnue|inconnue" "$([ "$(v D)" = "inconnue|45 s|179 s|3 min|95 min|inconnue|inconnue" ] && echo 1 || echo 0)" "$(v D)"

echo; echo "RESULTAT : $pass verifications reussies, $fail echec(s)"
[ "$fail" -eq 0 ]
