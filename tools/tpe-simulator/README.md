# Simulateur de TPE (Nepting)

Outil de dev pour tester l'intégration caisse ↔ TPE **sans avoir le vrai
terminal Ingenico sous la main**. Jamais utilisé en production, jamais
déployé sur le serveur.

## Lancer le simulateur

```bash
node tools/tpe-simulator/simulate-tpe.js
```

Il se met alors à écouter sur le port **20002** (comme le "port d'écoute
TPE" vu dans les paramètres du vrai terminal) et affiche tout ce qu'il
reçoit/répond dans la console.

## Options

| Option | Défaut | Description |
|---|---|---|
| `--port <n>` | 20002 | Port d'écoute du simulateur |
| `--result <mode>` | success | `success` \| `failure` \| `random` |
| `--delay <ms>` | 3000 | Délai simulant le temps de paiement |
| `--reply-mode <mode>` | same | `same` (répond sur la connexion entrante) \| `callback` (rappelle la caisse sur son port) |
| `--callback-host <ip>` | 127.0.0.1 | Hôte rappelé en mode callback |
| `--callback-port <n>` | 20006 | Port rappelé en mode callback (= "port d'écoute caisse") |

## Exemples

```bash
# Cas simple : toujours accepté, réponse immédiate (bien pour un dev rapide)
node simulate-tpe.js --delay 100

# Simuler un refus de paiement
node simulate-tpe.js --result failure

# Alterner succès/échec aléatoirement (utile pour tester la gestion d'erreur)
node simulate-tpe.js --result random

# Simuler un TPE qui rappelle la caisse sur son port d'écoute au lieu de
# répondre sur la même connexion (à essayer si le mode "same" ne marche
# pas avec le vrai terminal)
node simulate-tpe.js --reply-mode callback --callback-host 192.168.1.50
```

## Pourquoi deux modes de réponse ?

On ne sait pas encore, sur le vrai terminal Ingenico configuré en
Nepting/IP, si la réponse à une demande de paiement revient sur la **même**
connexion TCP que celle utilisée pour envoyer la demande, ou si le TPE
ouvre lui-même une **nouvelle connexion** vers le port d'écoute de la
caisse (20006 dans la config vue sur l'appareil) pour livrer sa réponse.

Ce simulateur permet de coder et tester le côté caisse dans les deux cas
de figure, sans attendre d'avoir confirmé le comportement exact du vrai
matériel.

## Format des trames

Trames TLV (Type-Length-Value) : chaque information est un tag de 2
caractères + une longueur sur 3 chiffres + la valeur. Exemple, pour un
débit de 1,00 € :

```
CZ0040300CJ012000000000000CA00201CB003100CD0010CE003978
```

| Tag | Signification |
|---|---|
| CZ | Version du protocole (doit être en premier) |
| CJ | Identifiant de caisse |
| CA | Numéro de caisse |
| CB | Montant, en centimes |
| CD | Opération (0=débit, 1=crédit) |
| CE | Devise (978=EUR) |
| AE | (réponse) Résultat : 10=succès, 01=échec |
| AC | (réponse) Numéro d'autorisation |
| AF | (réponse) Code motif si échec |

⚠️ Ce format est basé sur la documentation publique de l'API locale
Nepting (partenaire HiPay). Le vrai terminal pourrait avoir des
particularités non documentées (identifiant de caisse à faire valider par
la société de maintenance monétique, champs additionnels, etc.) — ce
simulateur sert de base de travail, pas de garantie de compatibilité
totale avec le vrai matériel.
