# Pont TPE sur Windows — guide salon

Pour les mini-PC Windows des salons : une installation, le pont tourne
tout seul à chaque démarrage, impression silencieuse + TPE sans aucune
manipulation quotidienne.

## Installation (5 minutes, une seule fois par salon)

1. **Copier le dossier `windows/`** sur le mini-PC (clé USB, email...)
   - `install.bat`
   - `tpe-bridge-win.js`
   - `tpe-bridge.js`
   - `config-wizard.ps1`
2. **Clic droit sur `install.bat`** → **"Exécuter en tant qu'administrateur"**
3. L'installeur :
   - installe Node.js si absent (automatique)
   - copie le pont dans `C:\TPE-Bridge`
   - ouvre le pare-feu pour le TPE/l'impression
   - programme le **démarrage automatique** à chaque boot de Windows
4. Une **petite fenêtre** (pas un terminal) s'ouvre pour les derniers
   réglages — copier/coller normal (Ctrl+V ou clic droit fonctionnent,
   contrairement à un terminal classique) :
   - Adresse de l'app : déjà pré-remplie (`https://rdv.handsgraphic.com`)
   - Identifiant du salon : celui de l'URL `?salon=...` (ex. `oyonnax`)
   - Clé du pont : depuis le Dashboard → Réglages → Terminal de paiement →
     **"Générer la clé du pont"** (copier le tout premier champ affiché,
     pas la ligne de commande en dessous)
   - Nom de partage de l'imprimante : déjà pré-rempli si le partage
     automatique a réussi
   - IP du TPE : facultatif à ce stade
   - Numéro de caisse du TPE : celui du ticket de config (souvent `2`)
   - Port du TPE : le « Port d'écoute TPE » du menu **Protocole caisse** du
     terminal (`8888` par défaut ; `20002` sur les DX8000 Nepting). Le TPE
     doit être réglé sur **Concert** + case **Version 3**, lien **IP**.
5. Cliquer sur **"Valider et démarrer"** — le pont se lance immédiatement.

C'est fini. Le pont tourne en arrière-plan, tout de suite et à chaque
démarrage du PC.

*Pour reconfigurer plus tard (changer de clé, d'imprimante...) : double-
cliquer directement sur `C:\TPE-Bridge\Configurer.bat`, qui rouvre la
même fenêtre pré-remplie avec les valeurs actuelles.*

## Configuration de l'imprimante (automatique)

Windows n'a pas d'équivalent direct à CUPS/`lp` (utilisé sur macOS/Linux)
pour envoyer des octets bruts à une imprimante sans aucune fenêtre. La
méthode fiable et sans dépendance : **partager l'imprimante**, puis lui
copier directement le ticket — ça envoie les données telles quelles au
spouleur, sans jamais ouvrir de dialogue.

**Le formulaire de configuration partage automatiquement l'imprimante par
défaut de Windows** (via PowerShell `Set-Printer`) dès son ouverture — le
champ "Nom de partage de l'imprimante" est déjà rempli dans la plupart
des cas, il n'y a rien à faire.

Si le partage automatique échoue (le champ reste vide à l'ouverture du
formulaire — le plus souvent : pas lancé en administrateur, ou aucune
imprimante par défaut définie), le partager à la main :

1. **Paramètres Windows** → **Bluetooth et appareils** → **Imprimantes et
   scanners** → cliquer sur l'imprimante du ticket → **Propriétés de
   l'imprimante** → onglet **Partage** → cocher **"Partager cette
   imprimante"** → noter le **nom de partage**.
2. Renseigner ce nom de partage dans le formulaire (champ "Nom de partage
   de l'imprimante"), ou directement dans
   `%APPDATA%\TPE-Bridge\config.json`, champ `printer`.
3. Tester : `copy /b n'importe_quel_fichier.txt \\localhost\NomDuPartage`
   dans une invite de commandes — si une page sort de l'imprimante, c'est
   bon.

## Quotidien : rien à faire

Le pont démarre avec Windows, se relance tout seul s'il plante, et
imprime les tickets déposés par la caisse. Aucun icône, aucune fenêtre
à surveiller (le pont tourne en tâche de fond ; une console peut
apparaître au premier boot, on peut la réduire).

## Vérifier que le pont tourne

- **Menu Démarrer** → taper `services.msc`... non : c'est une **tâche
  planifiée**, pas un service. Vérification :
  ```bat
  tasklist | findstr node
  ```
  → une ligne `node.exe` = le pont tourne.
- Ou regarder la **fenêtre console** du pont (si visible).

## Logs / dépannage

Les logs du pont s'affichent dans sa console. Pour les garder dans un
fichier (support) :

```bat
cd C:\TPE-Bridge
node tpe-bridge-win.js > pont.log 2>&1
```

| Problème | Solution |
|---|---|
| Tickets ne sortent pas | Vérifier que l'imprimante est bien installée dans Windows et définie par défaut. Tester : `echo test > \\localhost\NOM` ou une page test Windows |
| "partage introuvable ou non partagé" dans les logs | L'imprimante n'est pas partagée (voir section "Configuration de l'imprimante" ci-dessus), ou le nom de partage renseigné ne correspond pas exactement |
| "Clé du pont invalide" dans les logs | Régénérer la clé dans le dashboard et relancer l'assistant (supprimer `%APPDATA%\TPE-Bridge\config.json` puis relancer le pont) |
| Changer la configuration | Supprimer `%APPDATA%\TPE-Bridge\config.json` → l'assistant se relance au prochain démarrage |
| Pont ne démarre pas au boot | Vérifier que `TPE-Bridge.vbs` existe dans `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` (à coller dans la barre d'adresse de l'Explorateur). Sinon relancer l'installeur. Pour démarrer le pont tout de suite : double-clic sur `C:\TPE-Bridge\run-hidden.vbs` |

## Journaux (pour comprendre un problème de démarrage)

Le pont tourne sans fenêtre : deux fichiers gardent sa trace, dans
`%APPDATA%\TPE-Bridge` (à coller dans la barre d'adresse de l'Explorateur) :

| Fichier | Contenu |
|---|---|
| `launch.log` | Une ligne à CHAQUE exécution du lanceur : `lanceur execute (declencheur : …, session Windows ouverte depuis …)`, puis « pont lance » ou « le pont tourne deja ». Le **déclencheur** est `demarrage Windows (dossier Demarrage)`, `bouton`, `installeur`, `configuration` ou `manuel`. La **durée de session** départage tout cas douteux : un lancement automatique tombe dans les secondes qui suivent l'ouverture de session (« depuis 12 s »), un clic bien plus tard (« depuis 95 min »). Si `TPE-Bridge.vbs` est ouvert à la main, il se déclare « demarrage Windows » mais la durée de session le trahit. Si Windows ne lance pas le lanceur à l'ouverture de session, il n'y a **aucune ligne** à cette heure-là. |
| `bridge.log` | Démarrages et arrêts du pont, et tout ce qu'il affiche (erreurs d'impression, serveur injoignable...). Limité à ~500 Ko. |

Le lanceur ne démarre **jamais un deuxième pont** si un tourne déjà.

## Désinstallation

```bat
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\TPE-Bridge.vbs"
reg delete "HKCU\Software\Classes\tpebridge" /f
rmdir /S /Q C:\TPE-Bridge
rmdir /S /Q "%APPDATA%\TPE-Bridge"
```

## Note technique

- `tpe-bridge-win.js` = lanceur : assistant premier lancement, stockage
  de la config dans `%APPDATA%\TPE-Bridge\config.json`, relance
  automatique du pont en cas de crash.
- `tpe-bridge.js` = le pont lui-même (même fichier que la version macOS/
  Linux ; seule la méthode d'envoi à l'imprimante diffère en interne
  selon le système - RAW via CUPS/`lp` sur macOS/Linux, copie vers un
  partage réseau local sur Windows - le reste du comportement, le
  protocole TPE et la logique de polling sont strictement identiques).
- La tâche planifiée tourne au **login** (pas au boot système) pour que
  l'imprimante réseau soit déjà disponible.
- Le fichier de config contient la clé du pont : il n'est lisible que
  par l'utilisateur Windows du salon (droits par défaut de %APPDATA%).