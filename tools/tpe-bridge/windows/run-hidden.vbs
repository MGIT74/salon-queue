' Lance le pont TPE Bridge sans aucune fenetre visible. Utilise par le dossier
' Demarrage de Windows, par le lien tpebridge://start (bouton "Connecter") et
' par install.bat/Configurer.bat.
'
' - Ne lance JAMAIS un 2e pont si un tourne deja (deux ponts = tickets imprimes
'   en double : ils interrogent tous les deux le serveur).
' - Ecrit une ligne dans %APPDATA%\TPE-Bridge\launch.log a chaque execution,
'   avec QUI l'a declenchee et depuis combien de temps la session Windows est
'   ouverte. Un lancement automatique au demarrage tombe dans les secondes qui
'   suivent l'ouverture de session ; un clic arrive bien plus tard.
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

' Qui a lance ce script ? Le fichier depose dans le dossier Demarrage de Windows
' s'appelle TPE-Bridge.vbs ; les autres appelants passent un mot en argument
' (bouton, installeur, configuration). Sans rien de tout cela : lance a la main.
Function Declencheur()
  Declencheur = "manuel"
  If LCase(WScript.ScriptName) = "tpe-bridge.vbs" Then
    Declencheur = "demarrage Windows (dossier Demarrage)"
  ElseIf WScript.Arguments.Count > 0 Then
    Declencheur = WScript.Arguments(0)
  End If
End Function

' Secondes ecoulees depuis une date au format WMI ("20260928145002.000000+120"),
' ou -1 si la date est illisible.
Function SecondesDepuis(dateWmi)
  Dim d
  SecondesDepuis = -1
  On Error Resume Next
  d = DateSerial(CInt(Mid(dateWmi, 1, 4)), CInt(Mid(dateWmi, 5, 2)), CInt(Mid(dateWmi, 7, 2))) + TimeSerial(CInt(Mid(dateWmi, 9, 2)), CInt(Mid(dateWmi, 11, 2)), CInt(Mid(dateWmi, 13, 2)))
  ' Une date VBScript est un nombre de jours : la difference x 86400 = des secondes.
  If Err.Number = 0 Then SecondesDepuis = CLng((Now - d) * 86400)
End Function

' Depuis combien de secondes la session Windows est ouverte (-1 si inconnu).
' On prend le plus ancien explorer.exe : c'est l'interface, lancee a l'ouverture
' de session.
Function SecondesDepuisOuvertureSession()
  Dim wmi, procs, p, ds, best
  best = -1
  ' La valeur de retour est fixee AVANT toute lecture : si Windows n'a pas son
  ' service d'informations systeme (WMI) ou si la lecture echoue en cours de
  ' route, on rend -1 (inconnu) au lieu de ne rien rendre.
  SecondesDepuisOuvertureSession = -1
  On Error Resume Next
  Set wmi = GetObject("winmgmts:\\.\root\cimv2")
  Set procs = wmi.ExecQuery("SELECT CreationDate FROM Win32_Process WHERE Name = 'explorer.exe'")
  For Each p In procs
    ds = SecondesDepuis(p.CreationDate)
    If ds > best Then
      best = ds
      SecondesDepuisOuvertureSession = best
    End If
  Next
End Function

Function Duree(secs)
  If IsEmpty(secs) Or Not IsNumeric(secs) Then
    Duree = "inconnue"
  ElseIf secs < 0 Then
    Duree = "inconnue"
  ElseIf secs < 180 Then
    Duree = secs & " s"
  Else
    Duree = Int(secs / 60) & " min"
  End If
End Function

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

Journal "lanceur execute (declencheur : " & Declencheur() & ", session Windows ouverte depuis " & Duree(SecondesDepuisOuvertureSession()) & ")"
If PontDejaEnCours() Then
  Journal "le pont tourne deja - rien a faire"
Else
  ' Le "0" = fenetre cachee, le "False" = ne pas attendre (le pont tourne indefiniment).
  On Error Resume Next
  Dim nodePath, shellPath
  nodePath = ""
  shellPath = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\\nodejs\\node.exe"
  If fso.FileExists(shellPath) Then nodePath = shellPath
  If nodePath = "" Then
    shellPath = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\\nodejs\\node.exe"
    If fso.FileExists(shellPath) Then nodePath = shellPath
  End If
  If nodePath = "" Then
    shellPath = sh.ExpandEnvironmentStrings("%ProgramW6432%") & "\\nodejs\\node.exe"
    If fso.FileExists(shellPath) Then nodePath = shellPath
  End If
  If nodePath = "" Then
    Journal "ECHEC : node.exe introuvable dans Program Files ou Program Files (x86)"
  Else
    sh.Run Chr(34) & nodePath & Chr(34) & " " & Chr(34) & "C:\\TPE-Bridge\\tpe-bridge-win.js" & Chr(34), 0, False
  End If
  If Err.Number <> 0 Then
    Journal "ECHEC du lancement : " & Err.Description
    Err.Clear
  Else
    Journal "pont lance"
  End If
  On Error GoTo 0
End If
