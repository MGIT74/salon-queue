# Genere Guide-installation-TPE-THE-BARBER.pdf (necessite : pip install reportlab)
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, CondPageBreak)

F = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("Sans", F + "DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", F + "DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Mono", F + "DejaVuSansMono.ttf"))
pdfmetrics.registerFontFamily("Sans", normal="Sans", bold="Sans-Bold")

INK = colors.HexColor("#1f2328")
MUTED = colors.HexColor("#59636e")
ACCENT = colors.HexColor("#0b5cad")
LINE = colors.HexColor("#d0d7de")
SOFT = colors.HexColor("#f3f6f9")
WARN_BG = colors.HexColor("#fff6e5")
WARN_BD = colors.HexColor("#f0c36d")
OK_BG = colors.HexColor("#eaf6ee")
OK_BD = colors.HexColor("#9fd3ae")

base = ParagraphStyle("b", fontName="Sans", fontSize=10.5, leading=15, textColor=INK)
h1 = ParagraphStyle("h1", parent=base, fontName="Sans-Bold", fontSize=20, leading=25, spaceAfter=4)
sub = ParagraphStyle("sub", parent=base, fontSize=11.5, leading=16, textColor=MUTED, spaceAfter=10)
h2 = ParagraphStyle("h2", parent=base, fontName="Sans-Bold", fontSize=14, leading=19,
                    textColor=ACCENT, spaceBefore=14, spaceAfter=6)
li = ParagraphStyle("li", parent=base, leftIndent=16, bulletIndent=2, spaceAfter=3)
cell = ParagraphStyle("c", parent=base, fontSize=10, leading=13.5)
cellb = ParagraphStyle("cb", parent=cell, fontName="Sans-Bold")

TPE_IP = "192.168.1.22"
TPE_PORT = "20002"
TPE_POS = "2"
APP_URL = "https://rdv.handsgraphic.com"
AVEM_TEL = "09 74 75 51 25"


def P(t, s=base):
    return Paragraph(t, s)


def bullets(items, numbered=False):
    return [Paragraph(t, li, bulletText=f"{i}." if numbered else "•")
            for i, t in enumerate(items, 1)]


def box(flows, bg=SOFT, border=LINE):
    t = Table([[flows]], colWidths=[170 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.8, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def grid(rows, widths):
    data = [[P(c, cellb if r == 0 else cell) for c in row] for r, row in enumerate(rows)]
    t = Table(data, colWidths=[w * mm for w in widths])
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), SOFT),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def code(t):
    return f'<font name="Mono" size="9.5">{t}</font>'


def footer(c, doc):
    c.saveState()
    c.setFont("Sans", 8.5)
    c.setFillColor(MUTED)
    c.drawString(20 * mm, 12 * mm, "Guide d'installation - Paiement carte et impression des tickets")
    c.drawRightString(190 * mm, 12 * mm, f"Page {doc.page}")
    c.restoreState()


s = []
s += [P("Paiement par carte et impression des tickets", h1),
      P("Guide d'installation pour le salon THE BARBER - terminal Ingenico AXIUM DX8000", sub)]
s.append(P("Ce guide relie votre application de caisse à votre terminal de paiement (TPE) "
           "et à votre imprimante de tickets. Une fois terminé, le montant du ticket est envoyé "
           "automatiquement au TPE quand le client paie par carte : plus besoin de le retaper. "
           "Comptez environ <b>20 minutes</b>. Tout se fait une seule fois."))

s.append(P("Avant de commencer", h2))
s += bullets([
    "L'<b>ordinateur Windows du salon</b> : celui qui reste allumé pendant les heures d'ouverture "
    "et qui est relié à l'imprimante de tickets.",
    "Cet ordinateur doit être sur <b>la même box Internet que le TPE</b> (même Wi-Fi ou câble), "
    "pas sur un réseau invité ni en partage 4G.",
    "Le <b>TPE allumé</b> et branché.",
    "Votre <b>accès au Dashboard</b> de l'application (identifiant et mot de passe administrateur).",
    "Le fichier <b>TPE-Bridge-Installeur.bat</b>, envoyé par votre développeur avec ce guide.",
])

s.append(P("Vos réglages", h2))
s.append(grid([
    ["Réglage", "Valeur"],
    ["Adresse IP du TPE", f"<b>{TPE_IP}</b>"],
    ["Port du TPE (« Port d'écoute TPE »)", f"<b>{TPE_PORT}</b>"],
    ["Numéro de caisse", f"<b>{TPE_POS}</b>"],
    ["Protocole caisse", "<b>Concert</b>, avec la case <b>Version 3</b> cochée, lien <b>IP</b>"],
    ["Adresse de l'application", APP_URL],
], [70, 100]))

# ---------------- Etape 1
s.append(P("Étape 1 - Régler le protocole caisse sur le TPE", h2))
s.append(P("Le TPE doit savoir qu'une caisse va lui envoyer les montants. Sans ce réglage, "
           "il n'écoute pas la caisse et rien ne fonctionne."))
s.append(Spacer(1, 4))
s += bullets([
    "Sur le TPE, ouvrez le menu de l'application Nepting, puis <b>Paramètres fonctionnels</b>.",
    "Descendez jusqu'à la partie <b>Caisse</b> et touchez <b>Protocole caisse</b>.",
    "Cochez <b>Concert</b>, puis cochez la case <b>Version 3</b> juste en dessous. "
    "(Ne choisissez <b>pas</b> « Aucun » ni « Nepting ».)",
    f"Vérifiez le <b>Port d'écoute TPE</b> : il doit être <b>{TPE_PORT}</b>. "
    "S'il est différent, notez le chiffre affiché et prévenez votre développeur.",
    "Dans la partie <b>Lien</b>, laissez <b>IP</b> coché.",
    "Touchez <b>VALIDER</b>. Si le TPE le propose, redémarrez-le.",
], numbered=True)
s.append(Spacer(1, 6))
s.append(box([P("Pour vérifier, imprimez un ticket de configuration : il doit afficher "
                "<b>PROTOCOL: ConcertV3 IP</b>. Envoyez-en une photo à votre développeur.")],
             bg=OK_BG, border=OK_BD))

# ---------------- Etape 2
s.append(P("Étape 2 - Tester la communication entre l'ordinateur et le TPE", h2))
s.append(P("On vérifie maintenant que l'ordinateur du salon arrive à « parler » au TPE. "
           "Le TPE doit être allumé et sur l'écran d'accueil (pas en veille)."))
s.append(Spacer(1, 4))
s += bullets([
    "Sur l'ordinateur du salon, appuyez sur la touche <b>Windows</b>, tapez <b>PowerShell</b> "
    "et appuyez sur <b>Entrée</b>. Une fenêtre bleue ou noire s'ouvre.",
    "Tapez la commande suivante, puis Entrée : " + code("ipconfig") + "<br/>"
    "Repérez la ligne <b>Adresse IPv4</b> et notez-la : elle doit commencer par <b>192.168.1.</b> "
    "Sinon, l'ordinateur n'est pas sur la même box que le TPE : branchez-le sur la bonne box "
    "ou le bon Wi-Fi, puis recommencez.",
    "Tapez ensuite cette commande (en respectant les espaces), puis Entrée :<br/>"
    + code(f"Test-NetConnection {TPE_IP} -Port {TPE_PORT}"),
    "Attendez la fin (jusqu'à 30 secondes), prenez une <b>photo ou capture d'écran</b> du résultat "
    "et envoyez-la à votre développeur.",
], numbered=True)
s.append(Spacer(1, 6))
s.append(grid([
    ["Résultat affiché", "Ce que ça veut dire", "Suite"],
    ["<b>TcpTestSucceeded : True</b>", "Tout communique.", "Passez directement à l'<b>étape 3</b>."],
    ["PingSucceeded : True<br/>TcpTestSucceeded : False",
     f"Le TPE répond, mais n'écoute pas la caisse sur le port {TPE_PORT}.",
     "Refaites l'étape 1 : protocole <b>Concert</b> + <b>Version 3</b>, puis VALIDER."],
    ["PingSucceeded : False<br/>TcpTestSucceeded : False",
     "L'ordinateur ne trouve pas le TPE.",
     "Vérifiez que le TPE est allumé et pas en veille, puis refaites le test. "
     "Si c'est toujours False, voir « Corriger le réseau du TPE » ci-dessous."],
], [52, 55, 63]))
s.append(Spacer(1, 6))
s.append(P("<b>Test dans l'autre sens (facultatif) :</b> sur le TPE, menu <b>Diagnostics</b>, "
           "<b>Test réseau (Ping)</b>. Tapez l'adresse IPv4 de l'ordinateur notée ci-dessus, "
           "puis VALIDER. Le test doit réussir."))

s.append(P("Corriger le réseau du TPE (seulement si le test échoue)", h2))
s.append(P("Le plus simple est de passer le TPE en <b>DHCP</b> : la box lui donne alors "
           "automatiquement des réglages corrects, sans rien taper. Essayez dans cet ordre :"))
s.append(Spacer(1, 4))
s += bullets([
    "<b>Dans l'application de paiement du TPE</b> : cherchez un menu <b>Paramètres</b> ou "
    "<b>Configuration</b>, puis <b>Paramètres réseaux</b>. Activez <b>DHCP</b>.",
    "<b>Sinon, dans les réglages Android du TPE</b> : faites glisser le doigt depuis le haut de "
    "l'écran, touchez l'<b>engrenage</b>, puis <b>Wi-Fi</b> (ou Ethernet). Sur le réseau utilisé, "
    "choisissez <b>Modifier</b>, puis <b>Options avancées</b>, puis <b>Paramètres IP</b>, "
    "et choisissez <b>DHCP</b>.",
    "Imprimez un <b>nouveau ticket de configuration</b> : l'adresse IP du TPE a peut-être changé. "
    f"Notez-la : c'est elle qu'il faudra utiliser dans le test ci-dessus et à l'étape 5 "
    f"(à la place de {TPE_IP}). Refaites le test.",
], numbered=True)
s.append(Spacer(1, 6))
s.append(box([P("<b>Si le TPE demande un code</b> pour ouvrir ces menus et que vous ne l'avez pas, "
                f"appelez l'<b>assistance technique AVEM au {AVEM_TEL}</b> (numéro au dos du TPE, "
                "appel non surtaxé) et lisez-leur ce message :"),
              Spacer(1, 4),
              P("<i>« Bonjour, j'ai un Ingenico AXIUM DX8000, commerçant THE BARBER, numéro de série "
                "248RKD8K9031. Je relie ma caisse au TPE en <b>Concert version 3, lien IP</b>, "
                f"numéro de caisse {TPE_POS}, port {TPE_PORT}. Mon ordinateur n'arrive pas à joindre "
                "le terminal. Pouvez-vous : 1) passer le terminal en DHCP, ou mettre le masque à "
                "255.255.255.0 et le DNS à 192.168.1.254, 2) confirmer que le protocole caisse "
                "Concert V3 IP est actif, 3) désactiver la mise en veille, 4) vérifier la mémoire "
                "(0 ko de flash disponible sur le ticket). Merci. »</i>")],
             bg=WARN_BG, border=WARN_BD))

# ---------------- Etape 3
s.append(P("Étape 3 - Générer la clé du pont dans le Dashboard", h2))
s.append(P("Le « pont » est un petit programme installé sur l'ordinateur du salon. Il fait le lien "
           "entre l'application en ligne, le TPE et l'imprimante. La clé lui permet de se connecter "
           "à votre salon."))
s.append(Spacer(1, 4))
s += bullets([
    "Sur l'ordinateur du salon, ouvrez le <b>Dashboard</b> de l'application et connectez-vous.",
    "Allez dans <b>Réglages</b>, puis dans la partie <b>Terminal de paiement (TPE)</b>.",
    "Cliquez sur <b>Générer la clé du pont</b>.",
    "Copiez la <b>clé</b> affichée dans le premier champ (pas la longue commande affichée en dessous) "
    "et collez-la dans un fichier Bloc-notes. <b>Elle ne sera plus jamais affichée.</b>",
    "Notez aussi votre <b>identifiant de salon</b> : c'est le mot qui suit <b>?salon=</b> dans "
    "l'adresse de votre page de caisse ou de réservation.",
], numbered=True)
s.append(Spacer(1, 6))
s.append(box([P("<b>Attention :</b> si vous cliquez une deuxième fois sur « Générer la clé du pont », "
                "l'ancienne clé ne marche plus. Le pont s'arrête alors jusqu'à ce que vous saisissiez "
                "la nouvelle clé (voir « Reconfigurer plus tard » à la fin).")],
             bg=WARN_BG, border=WARN_BD))

# ---------------- Etape 4
s.append(P("Étape 4 - Installer le pont sur l'ordinateur du salon", h2))
s += bullets([
    "Enregistrez le fichier <b>TPE-Bridge-Installeur.bat</b> sur le Bureau de l'ordinateur du salon.",
    "Faites un <b>clic droit</b> dessus, puis choisissez <b>« Exécuter en tant qu'administrateur »</b>, "
    "puis <b>Oui</b>.",
    "Si Windows affiche un écran bleu « Windows a protégé votre ordinateur », cliquez sur "
    "<b>Informations complémentaires</b>, puis sur <b>Exécuter quand même</b>.",
    "Laissez l'installation se faire. Elle installe Node.js si besoin, copie le pont dans "
    + code("C:\\TPE-Bridge") + ", autorise le pont dans le pare-feu et le programme pour qu'il "
    "démarre tout seul avec Windows. Cela peut prendre quelques minutes.",
    "Si une fenêtre du pare-feu Windows apparaît, cliquez sur <b>Autoriser</b> (réseau privé).",
], numbered=True)

# ---------------- Etape 5
s.append(P("Étape 5 - Remplir la fenêtre de configuration", h2))
s.append(P("À la fin de l'installation, une fenêtre <b>« TPE Bridge - Configuration »</b> s'ouvre. "
           "Le copier-coller y fonctionne normalement (Ctrl+V)."))
s.append(Spacer(1, 6))
s.append(grid([
    ["Champ", "Ce qu'il faut mettre"],
    ["Adresse de votre application", f"Déjà rempli : {APP_URL}. Ne pas modifier."],
    ["Identifiant du salon", "Celui noté à l'étape 3 (le mot après ?salon=)."],
    ["Clé du pont", "La clé copiée à l'étape 3 (Ctrl+V)."],
    ["Nom de partage de l'imprimante", "Normalement déjà rempli. S'il est vide, voir le dépannage."],
    ["IP du TPE", f"<b>{TPE_IP}</b>"],
    ["Numéro de caisse du TPE", f"<b>{TPE_POS}</b>"],
    ["Port du TPE", f"<b>{TPE_PORT}</b> (le champ affiche 8888 par défaut : remplacez-le)"],
], [62, 108]))
s.append(Spacer(1, 6))
s.append(P("Cliquez sur <b>« Valider et demarrer »</b>. Le pont démarre aussitôt, en arrière-plan : "
           "aucune fenêtre ne reste ouverte, c'est normal."))

# ---------------- Etape 6
s.append(P("Étape 6 - Vérifier depuis la caisse", h2))
s += bullets([
    "Sur l'ordinateur du salon, ouvrez la page <b>Caisse</b>.",
    "Dans l'onglet Caisse, cliquez sur l'icône de réglages <b>« Connexion TPE / imprimante »</b> en haut.",
    "Les deux pastilles <b>Imprimante</b> et <b>Terminal de paiement</b> doivent être <b>vertes</b>. "
    "Si un bouton <b>Connecter</b> apparaît, cliquez dessus puis acceptez l'ouverture du programme.",
    "Faites une vente test avec un petit montant et choisissez le paiement par <b>carte</b> : le montant "
    "doit s'afficher tout seul sur le TPE. Passez une carte. Le ticket doit ensuite s'imprimer.",
], numbered=True)
s.append(Spacer(1, 6))
s.append(box([P("<b>C'est terminé.</b> Au quotidien, il n'y a rien à faire : le pont démarre avec "
                "Windows et redémarre tout seul en cas de problème. Il faut seulement que l'ordinateur "
                "du salon et le TPE soient allumés.")], bg=OK_BG, border=OK_BD))

# ---------------- Depannage
s.append(P("Si quelque chose ne marche pas", h2))
s.append(grid([
    ["Ce que vous voyez", "Ce qu'il faut faire"],
    ["La pastille <b>Terminal de paiement</b> est rouge",
     "Vérifiez que le TPE est allumé et pas en veille, et qu'il est sur la même box que l'ordinateur. "
     "Refaites le test de l'étape 2."],
    ["Les deux pastilles sont rouges",
     "Le pont ne tourne pas. Double-cliquez sur " + code("C:\\TPE-Bridge\\run-hidden.vbs") +
     ", attendez 30 secondes et regardez de nouveau."],
    ["Le montant n'arrive pas sur le TPE",
     "Sur le TPE, vérifiez que le protocole caisse est toujours <b>Concert + Version 3</b> (étape 1). "
     f"Vérifiez que le port saisi à l'étape 5 est bien {TPE_PORT} (voir « Reconfigurer plus tard »)."],
    ["Les tickets ne s'impriment pas",
     "Vérifiez que l'imprimante est allumée et définie comme <b>imprimante par défaut</b> dans Windows, "
     "puis relancez la configuration (ci-dessous)."],
    ["Le champ « Nom de partage de l'imprimante » était vide",
     "Paramètres Windows, puis Bluetooth et appareils, puis Imprimantes et scanners : choisissez "
     "l'imprimante, puis Propriétés de l'imprimante, onglet Partage. Cochez « Partager cette "
     "imprimante » et recopiez le nom dans la configuration."],
    ["Vous avez régénéré la clé par erreur",
     "Relancez la configuration (ci-dessous) et collez la nouvelle clé."],
], [55, 115]))

s.append(P("Reconfigurer plus tard", h2))
s.append(P("Double-cliquez sur " + code("C:\\TPE-Bridge\\Configurer.bat") + ". La même fenêtre "
           "s'ouvre, déjà remplie avec vos réglages actuels. Modifiez ce qu'il faut, puis cliquez "
           "sur « Valider et demarrer »."))

s.append(P("Ce qu'il faut envoyer à votre développeur en cas de problème", h2))
s += bullets([
    "Une <b>photo du ticket de configuration</b> du TPE et une photo de l'écran <b>Protocole caisse</b>.",
    "La <b>capture d'écran</b> du test PowerShell de l'étape 2.",
    "Une <b>capture d'écran</b> de la fenêtre « Connexion TPE / imprimante » de la caisse.",
    "Les deux fichiers <b>launch.log</b> et <b>bridge.log</b> : dans l'Explorateur de fichiers, "
    "collez " + code("%APPDATA%\\TPE-Bridge") + " dans la barre d'adresse, puis appuyez sur Entrée.",
])
s.append(Spacer(1, 8))
s.append(box([P("<b>Le plus simple : une prise en main à distance.</b> Installez <b>AnyDesk</b> "
                "(gratuit, anydesk.com) sur l'ordinateur du salon et envoyez le numéro affiché à votre "
                "développeur. Il pourra alors faire les étapes 2 à 6 à votre place pendant que vous "
                "regardez. Il ne restera que le réglage du TPE (étape 1) et le passage de la carte test.")]))

import os
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Guide-installation-TPE-THE-BARBER.pdf")
doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm,
                        topMargin=18 * mm, bottomMargin=20 * mm,
                        title="Guide d'installation - Paiement carte et tickets",
                        author="Rakotoarinosy")
# Un titre de section ne reste jamais seul en bas de page.
s = [x for f in s for x in ([CondPageBreak(45 * mm), f] if getattr(f, "style", None) is h2 else [f])]
doc.build(s, onFirstPage=footer, onLaterPages=footer)
print(out)
