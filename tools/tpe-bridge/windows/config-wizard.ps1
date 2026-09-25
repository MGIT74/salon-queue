# Petite fenetre de configuration du TPE Bridge, pour un client non
# technique : coller le salon + la cle dans deux champs de texte
# normaux (copier/coller standard Windows, pas de terminal, pas de
# fichier a editer a la main). Utilise uniquement WinForms (deja
# present sur tout Windows via .NET), aucune dependance a installer.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$configDir = Join-Path $env:APPDATA "TPE-Bridge"
$configFile = Join-Path $configDir "config.json"

# Tente de partager l'imprimante par defaut automatiquement (impression
# silencieuse, sans jamais ouvrir de fenetre) - voir tpe-bridge.js pour
# le detail de pourquoi c'est necessaire sous Windows. Simple bonus ici :
# si ca reussit, le nom de partage trouve pre-remplit le champ imprimante.
function Get-AutoSharedPrinterName {
    try {
        $p = Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop | Where-Object { $_.Default -eq $true } | Select-Object -First 1
        if ($p) {
            $share = ($p.Name -replace '[^a-zA-Z0-9_-]', '_')
            if ($share.Length -eq 0) { $share = "TicketPrinter" }
            Set-Printer -Name $p.Name -Shared $true -ShareName $share -ErrorAction Stop
            return $share
        }
    } catch {}
    return ""
}

$existingCfg = $null
if (Test-Path $configFile) {
    try { $existingCfg = Get-Content $configFile -Raw | ConvertFrom-Json } catch {}
}

$autoShare = Get-AutoSharedPrinterName
if ([string]::IsNullOrWhiteSpace($autoShare) -and $existingCfg) { $autoShare = $existingCfg.printer }

$form = New-Object System.Windows.Forms.Form
$form.Text = "TPE Bridge - Configuration"
$form.Size = [System.Drawing.Size]::new(480, 460)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$title = New-Object System.Windows.Forms.Label
$title.Text = "Configurer la caisse de ce salon"
$title.Font = [System.Drawing.Font]::new("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$title.Location = [System.Drawing.Point]::new(20, 15)
$title.Size = [System.Drawing.Size]::new(430, 26)
$form.Controls.Add($title)

function Add-Field($labelText, $y, $defaultValue) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $labelText
    $label.Location = [System.Drawing.Point]::new(20, $y)
    $label.Size = [System.Drawing.Size]::new(430, 18)
    $form.Controls.Add($label)

    $textbox = New-Object System.Windows.Forms.TextBox
    $textbox.Location = [System.Drawing.Point]::new(20, $y + 20)
    $textbox.Size = [System.Drawing.Size]::new(420, 24)
    $textbox.Text = $defaultValue
    $textbox.Font = [System.Drawing.Font]::new("Segoe UI", 10)
    $form.Controls.Add($textbox)
    return $textbox
}

$defaultServer = if ($existingCfg) { $existingCfg.server } else { "https://rdv.handsgraphic.com" }
$defaultSalon = if ($existingCfg) { $existingCfg.salon } else { "" }
$defaultTpeIp = if ($existingCfg) { $existingCfg.tpeIp } else { "" }

$tbServer = Add-Field "Adresse de votre application" 55 $defaultServer
$tbSalon = Add-Field "Identifiant du salon (celui dans l'URL ?salon=...)" 105 $defaultSalon
$tbKey = Add-Field "Cle du pont (Dashboard > Reglages > Terminal de paiement)" 155 ""
$tbPrinter = Add-Field "Nom de partage de l'imprimante" 205 $autoShare
$tbTpeIp = Add-Field "IP du TPE (facultatif, laisser vide si pas encore configure)" 255 $defaultTpeIp

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Location = [System.Drawing.Point]::new(20, 300)
$lblStatus.Size = [System.Drawing.Size]::new(430, 20)
$lblStatus.ForeColor = [System.Drawing.Color]::Firebrick
$form.Controls.Add($lblStatus)

$btnOk = New-Object System.Windows.Forms.Button
$btnOk.Text = "Valider et demarrer"
$btnOk.Location = [System.Drawing.Point]::new(20, 330)
$btnOk.Size = [System.Drawing.Size]::new(200, 36)
$btnOk.Font = [System.Drawing.Font]::new("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnOk.Add_Click({
    if ([string]::IsNullOrWhiteSpace($tbSalon.Text) -or [string]::IsNullOrWhiteSpace($tbKey.Text)) {
        $lblStatus.Text = "L'identifiant du salon et la cle du pont sont obligatoires."
        return
    }
    New-Item -ItemType Directory -Force -Path $configDir | Out-Null
    $cfg = [ordered]@{
        server  = $tbServer.Text.Trim()
        salon   = $tbSalon.Text.Trim()
        key     = $tbKey.Text.Trim()
        printer = $tbPrinter.Text.Trim()
        tpeIp   = $tbTpeIp.Text.Trim()
    }
    $json = $cfg | ConvertTo-Json
    # Set-Content -Encoding UTF8 ajoute un BOM invisible en tete de fichier
    # sous Windows PowerShell 5.1, ce qui fait echouer JSON.parse() cote
    # Node.js (tpe-bridge-win.js) - on ecrit donc nous-memes en UTF8 SANS BOM.
    [System.IO.File]::WriteAllText($configFile, $json, [System.Text.UTF8Encoding]::new($false))
    $form.Tag = "ok"
    $form.Close()
})
$form.Controls.Add($btnOk)
$form.AcceptButton = $btnOk

$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Text = "Annuler"
$btnCancel.Location = [System.Drawing.Point]::new(230, 330)
$btnCancel.Size = [System.Drawing.Size]::new(120, 36)
$btnCancel.Add_Click({ $form.Tag = "cancel"; $form.Close() })
$form.Controls.Add($btnCancel)

$lblNote = New-Object System.Windows.Forms.Label
$lblNote.Text = "La cle et l'identifiant du salon se trouvent dans le Dashboard,`nsous Reglages > Terminal de paiement > Generer la cle du pont."
$lblNote.Location = [System.Drawing.Point]::new(20, 375)
$lblNote.Size = [System.Drawing.Size]::new(430, 40)
$lblNote.ForeColor = [System.Drawing.Color]::Gray
$form.Controls.Add($lblNote)

[void]$form.ShowDialog()

if ($form.Tag -eq "ok") { exit 0 } else { exit 1 }
