# Pont local caisse ↔ TPE (Concert v3 IP)

## Pourquoi ce pont existe

L'app de caisse est hébergée **en ligne** (xCloud), mais le terminal de
paiement vit sur le **réseau local du salon** (ex. `192.168.1.125`, IP fixe
imprimée sur le ticket de config du TPE). Un serveur distant ne peut
**jamais** joindre une adresse privée `192.168.x.x` — c'est pour ça que le
paiement carte échouait systématiquement alors que tout le reste fonctionne.

La solution : ce petit pont tourne **dans le salon**, sur n'importe quel
ordinateur allumé pendant les heures d'ouverture (PC de caisse, mini-PC,
Raspberry Pi…). La page de caisse lui délègue l'envoi du montant, et lui
parle au TPE en TCP local, avec le protocole **Concert version 3 IP**
(annoncé `PROTOCOL: ConcertV3 IP` sur le ticket de configuration du
terminal).

```
Navigateur caisse ──HTTPS──> app xCloud (ventes, données)
       │
       └─ http://<pont>:7788/charge ──> ce pont ── TCP 8888 ──> TPE
          (réseau local du salon)                    (Concert v3)
```

## Installation (une seule fois, ~5 minutes)

1. **Installer Node.js** (>= 18) sur l'ordinateur choisi : https://nodejs.org
2. **Copier ce dossier** (`tools/tpe-bridge/`) sur cet ordinateur
3. **Lancer le pont** avec l'IP du TPE (celle du ticket de config) :

```bash
node tpe-bridge.js --tpe 192.168.1.125 --port 8888 --pos 2
```

- `--tpe` : **obligatoire**, l'IP du terminal (`Adresse IP` sur le ticket)
- `--port` : port d'écoute Concert du TPE (défaut `8888`)
- `--pos` : numéro de caisse (`Numéro de caisse` sur le ticket, ex. `2`)
- `--listen` : port HTTP du pont (défaut `7788`)

4. **Rendre l'IP de l'ordinateur fixe** (réservation DHCP dans la box, ou
   IP fixe) — sinon le lien dans la caisse cassera au prochain redémarrage.
5. **Dans la caisse** : Dashboard → Réglages → Terminal de paiement →
   **Pont local** : `http://<ip-de-cet-ordinateur>:7788` → Enregistrer.
   Protocole : **Concert v3 IP**, IP du TPE : `192.168.1.125`, port `8888`,
   numéro de caisse : `2`.

## Démarrage automatique (recommandé)

Le pont doit tourner en permanence pendant les heures d'ouverture.

**Windows** : créer un raccourci dans `shell:startup` avec :
```
"C:\Program Files\nodejs\node.exe" "C:\tpe-bridge\tpe-bridge.js" --tpe 192.168.1.125 --pos 2
```

**macOS / Linux** : une ligne dans le crontab (`crontab -e`) :
```
@reboot /usr/local/bin/node /chemin/vers/tpe-bridge.js --tpe 192.168.1.125 --pos 2 >> /tmp/tpe-bridge.log 2>&1
```

## Vérifier que tout communique

```bash
# 1. Le pont répond-il ?
curl http://localhost:7788/health
# -> {"ok":true,"tpe":"192.168.1.125","pos":"2"}

# 2. Le TPE est-il joignable depuis cet ordinateur ?
nc -zv 192.168.1.125 8888
```

Puis faire un paiement test de 0,01 € depuis la caisse (bouton CB).

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `ECONNREFUSED` dans le pont | TPE en veille, ou mauvais port — vérifier le ticket de config, désactiver la veille (Panneau de contrôle → Mode ECO → délai 99999) |
| Timeout sans réponse | TPE pas en protocole Concert v3 IP (voir ticket), ou IP fausse |
| La caisse ne trouve pas le pont | Le navigateur de la caisse est sur un autre réseau (4G/invité) — doit être le même LAN |
| `Pont local` inaccessible depuis la caisse | Pare-feu Windows : autoriser Node sur le port 7788 (réseau privé) |

## Notes techniques

- **Zéro dépendance** : Node >= 18 seul suffit (`http` et `net` natifs).
- CORS ouvert volontairement : la caisse (HTTPS) appelle ce pont (HTTP
  local) — cross-origin assumé, limité au réseau local, aucun secret
  ne transite (juste un montant en centimes).
- La trame Concert (33 caractères, `STX + msg + ETX + LRC`) est
  identique à celle de `src/lib/tpeConcert.js` côté serveur — le pont
  existe uniquement pour la proximité réseau.
- La réponse attendue vient sur la **même connexion TCP** (comportement
  standard Concert IP) ; le pont accepte aussi une fermeture suivie de
  la réponse (certains firmwares).
- Testable **sans vrai TPE** grâce au simulateur `tools/tpe-simulator/`.