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
REM Arrete l'ancienne instance avant de relancer, sinon 2 pouvaient tourner
REM en meme temps (l'une visible restante, l'autre nouvelle invisible)
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*tpe-bridge-win.js*' -or $_.CommandLine -like '*tpe-bridge.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 /nobreak >nul
wscript.exe "%~dp0run-hidden.vbs"
echo Le pont tourne maintenant en arriere-plan, sans fenetre visible.
pause
