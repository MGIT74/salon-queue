' Lance le pont TPE Bridge sans aucune fenetre visible (ni console, ni
' popup). Utilise par la tache planifiee au demarrage de Windows, et
' par install.bat/Configurer.bat juste apres une (re)configuration -
' pour que l'utilisateur n'ait plus jamais de fenetre PowerShell/cmd a
' garder ouverte ni a risquer de fermer par erreur.
'
' Le "0" en 2e argument de Run = fenetre cachee. Le "False" en 3e
' argument = ne pas attendre la fin (le pont tourne indefiniment).
Set objShell = CreateObject("WScript.Shell")
objShell.Run Chr(34) & "C:\Program Files\nodejs\node.exe" & Chr(34) & " " & Chr(34) & "C:\TPE-Bridge\tpe-bridge-win.js" & Chr(34), 0, False
