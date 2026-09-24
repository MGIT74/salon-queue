# Pont TPE sur Windows — guide salon

Pour les mini-PC Windows des salons : une installation, le pont tourne
tout seul à chaque démarrage, impression silencieuse + TPE sans aucune
manipulation quotidienne.

## Installation (5 minutes, une seule fois par salon)

1. **Copier le dossier `windows/`** sur le mini-PC (clé USB, email...)
   - `install.bat`
   - `tpe-bridge-win.js`
   - `tpe-bridge.js`
2. **Clic droit sur `install.bat`** → **"Exécuter en tant qu'administrateur"**
3. L'installeur :
   - installe Node.js si absent (automatique)
   - copie le pont dans `C:\TPE-Bridge`
   - ouvre le pare-feu pour le TPE/l'impression
   - programme le **démarrage automatique** à chaque boot de Windows
4. **Répondre aux 3 questions** de l'assistant :
   - Adresse de l'app : `https://rdv.handsgraphic.com`
   - Identifiant du salon : celui de l'URL `?salon=...` (ex. `oyonnax`)
   - Clé du pont : depuis le Dashboard → Réglages → Terminal de paiement →
     **"Générer la clé du pont"** (copier la clé qui s'affiche)
   - IP du TPE : facultatif à ce stade (Entree si pas encore de TPE)

C'est fini. Le pont tourne en arrière-plan, tout de suite et à chaque
démarrage du PC.

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
| "Clé du pont invalide" dans les logs | Régénérer la clé dans le dashboard et relancer l'assistant (supprimer `%APPDATA%\TPE-Bridge\config.json` puis relancer le pont) |
| Changer la configuration | Supprimer `%APPDATA%\TPE-Bridge\config.json` → l'assistant se relance au prochain démarrage |
| Pont ne démarre pas au boot | Vérifier la tâche : `schtasks /Query /TN "TPE-Bridge"` |

## Désinstallation

```bat
schtasks /Delete /TN "TPE-Bridge" /F
rmdir /S /Q C:\TPE-Bridge
rmdir /S /Q "%APPDATA%\TPE-Bridge"
```

## Note technique

- `tpe-bridge-win.js` = lanceur : assistant premier lancement, stockage
  de la config dans `%APPDATA%\TPE-Bridge\config.json`, relance
  automatique du pont en cas de crash.
- `tpe-bridge.js` = le pont lui-même (identique à la version macOS/Linux,
  même code, mêmes arguments).
- La tâche planifiée tourne au **login** (pas au boot système) pour que
  l'imprimante réseau soit déjà disponible.
- Le fichier de config contient la clé du pont : il n'est lisible que
  par l'utilisateur Windows du salon (droits par défaut de %APPDATA%).