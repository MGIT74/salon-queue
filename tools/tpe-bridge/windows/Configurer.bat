@echo off
REM Lance le formulaire graphique de configuration (config-wizard.ps1).
REM Double-clic direct sur ce fichier - contrairement a un .ps1, Windows
REM sait executer un .bat sans poser de question.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0config-wizard.ps1"
