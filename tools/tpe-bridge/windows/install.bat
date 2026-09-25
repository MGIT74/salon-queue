@echo off
REM ============================================================
REM  TPE Bridge - Installeur Windows (mini-PC des salons)
REM
REM  Ce que fait ce script (a executer UNE fois, clic droit ->
REM  "Executer en tant qu'administrateur") :
REM   1. Verifie/installe Node.js (silencieux, via winget)
REM   2. Copie les fichiers du pont dans C:\TPE-Bridge
REM   3. Cree une regle de pare-feu entrante (TPE / impression locale)
REM   4. Cree une tache planifiee : le pont demarre tout seul au boot,
REM      tourne en arriere-plan, redemarre en cas de crash
REM   5. Lance l'assistant de premiere configuration
REM
REM  Fichiers requis a cote de ce script :
REM   - tpe-bridge-win.js  (lanceur + assistant)
REM   - tpe-bridge.js      (coeur du pont)
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo    TPE Bridge - Installation pour le salon
echo ============================================================
echo.

REM --- Verifier les droits administrateur ---
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Ce script doit etre lance en tant qu'administrateur.
    echo     Clic droit sur install.bat -^> "Executer en tant qu'administrateur"
    pause
    exit /b 1
)

set BRIDGE_DIR=C:\TPE-Bridge
set LAUNCHER=%~dp0tpe-bridge-win.js
set CORE=%~dp0tpe-bridge.js
set WIZARD=%~dp0config-wizard.ps1
set WIZARD_LAUNCHER=%~dp0Configurer.bat

REM --- 1. Node.js ---
where node >nul 2>nul
if %errorLevel% equ 0 (
    echo [OK] Node.js deja installe :
    node --version
) else (
    echo [..] Installation de Node.js...
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    if %errorLevel% neq 0 (
        echo [!] winget a echoue. Installez Node.js manuellement depuis
        echo     https://nodejs.org puis relancez ce script.
        pause
        exit /b 1
    )
    echo [OK] Node.js installe.
    REM Le PATH n'est pas rafraichi dans cette session - utiliser le chemin connu
    set "PATH=%PATH%;C:\Program Files\nodejs"
)

REM --- 2. Copier les fichiers ---
echo [..] Installation des fichiers dans %BRIDGE_DIR%...
if not exist "%BRIDGE_DIR%" mkdir "%BRIDGE_DIR%"
copy /Y "%LAUNCHER%" "%BRIDGE_DIR%\tpe-bridge-win.js" >nul
copy /Y "%CORE%" "%BRIDGE_DIR%\tpe-bridge.js" >nul
copy /Y "%WIZARD%" "%BRIDGE_DIR%\config-wizard.ps1" >nul
copy /Y "%WIZARD_LAUNCHER%" "%BRIDGE_DIR%\Configurer.bat" >nul
echo [OK] Fichiers installes.

REM --- 3. Pare-feu : autoriser le pont en reseau local (TPE, impression)
echo [..] Configuration du pare-feu...
netsh advfirewall firewall delete rule name="TPE Bridge" >nul 2>&1
netsh advfirewall firewall add rule name="TPE Bridge" dir=in action=allow program="C:\Program Files\nodejs\node.exe" enable=yes profile=any >nul 2>&1
echo [OK] Pare-feu configure.

REM --- 4. Tache planifiee au demarrage de Windows (au login, sans UAC)
echo [..] Creation du demarrage automatique...
schtasks /Create /F /TN "TPE-Bridge" /TR "\"C:\Program Files\nodejs\node.exe\" \"%BRIDGE_DIR%\tpe-bridge-win.js\"" /SC ONLOGON /RL HIGHEST /F >nul 2>&1
if %errorLevel% equ 0 (
    echo [OK] Demarrage automatique configure - tache "TPE-Bridge".
) else (
    echo [!] Tache planifiee non creee - le pont devra etre lance a la main
    echo     double-clic sur %BRIDGE_DIR%\tpe-bridge-win.js ou raccourci bureau.
)

REM --- 5. Configuration (formulaire graphique - pas de terminal a manipuler)
echo.
echo ============================================================
echo    Derniere etape : une fenetre de configuration va s'ouvrir
echo ============================================================
echo.
cd /d "%BRIDGE_DIR%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BRIDGE_DIR%\config-wizard.ps1"
if not exist "%APPDATA%\TPE-Bridge\config.json" (
    echo.
    echo [!] Configuration annulee ou non terminee.
    echo     Relancez ce programme pour reessayer, ou double-cliquez sur
    echo     %BRIDGE_DIR%\config-wizard.ps1 pour ouvrir juste le formulaire.
    pause
    exit /b 1
)
echo [OK] Configuration enregistree.
echo.
start "" "C:\Program Files\nodejs\node.exe" "%BRIDGE_DIR%\tpe-bridge-win.js"

echo.
echo ============================================================
echo    Installation terminee !
echo    Le pont demarrera automatiquement a chaque demarrage.
echo    Ce fichier peut etre ferme.
echo ============================================================
pause