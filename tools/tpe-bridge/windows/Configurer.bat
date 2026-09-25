@echo off
REM Lance le formulaire graphique de configuration (config-wizard.ps1),
REM puis demarre le pont juste apres si la configuration a bien ete
REM validee (pas besoin d'une etape separee).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0config-wizard.ps1"
if %errorLevel% neq 0 (
    echo Configuration annulee - le pont n'a pas ete demarre.
    pause
    exit /b 1
)
echo Configuration enregistree, demarrage du pont...
start "" "C:\Program Files\nodejs\node.exe" "%~dp0tpe-bridge-win.js"
echo Le pont tourne maintenant dans une autre fenetre (celle-ci peut se fermer).
pause
