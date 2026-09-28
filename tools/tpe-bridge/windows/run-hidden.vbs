' Lance le pont TPE Bridge sans aucune fenetre visible. Utilise par le dossier
' Demarrage de Windows, par le lien tpebridge://start (bouton du dashboard) et
' par install.bat/Configurer.bat.
'
' - Ne lance JAMAIS un 2e pont si un tourne deja (deux ponts = tickets imprimes
'   en double : ils interrogent tous les deux le serveur).
' - Ecrit une ligne dans %APPDATA%\TPE-Bridge\launch.log a chaque execution :
'   si Windows ne lance pas ce fichier au demarrage, le journal n'aura AUCUNE
'   ligne a l'heure de l'ouverture de session - c'est la preuve qu'il manquait.
Option Explicit

Dim sh, fso
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Sub Journal(msg)
  On Error Resume Next
  Dim dossier, chemin, f
  dossier = sh.ExpandEnvironmentStrings("%APPDATA%") & "\TPE-Bridge"
  If Not fso.FolderExists(dossier) Then fso.CreateFolder dossier
  chemin = dossier & "\launch.log"
  If fso.FileExists(chemin) Then
    If fso.GetFile(chemin).Size > 100000 Then fso.DeleteFile chemin, True
  End If
  Set f = fso.OpenTextFile(chemin, 8, True)
  f.WriteLine Now & "  " & msg
  f.Close
End Sub

Function PontDejaEnCours()
  Dim wmi, procs, p
  PontDejaEnCours = False
  On Error Resume Next
  Set wmi = GetObject("winmgmts:\\.\root\cimv2")
  Set procs = wmi.ExecQuery("SELECT CommandLine FROM Win32_Process WHERE Name = 'node.exe'")
  For Each p In procs
    If Not IsNull(p.CommandLine) Then
      If InStr(1, p.CommandLine, "tpe-bridge-win.js", vbTextCompare) > 0 Then PontDejaEnCours = True
    End If
  Next
End Function

Journal "lanceur execute"
If PontDejaEnCours() Then
  Journal "le pont tourne deja - rien a faire"
Else
  ' Le "0" = fenetre cachee, le "False" = ne pas attendre (le pont tourne indefiniment).
  On Error Resume Next
  sh.Run Chr(34) & "C:\Program Files\nodejs\node.exe" & Chr(34) & " " & Chr(34) & "C:\TPE-Bridge\tpe-bridge-win.js" & Chr(34), 0, False
  If Err.Number <> 0 Then
    Journal "ECHEC du lancement : " & Err.Description
    Err.Clear
  Else
    Journal "pont lance"
  End If
  On Error GoTo 0
End If
