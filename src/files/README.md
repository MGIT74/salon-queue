# Service de paiement Nepting / HiPay POS

## Structure

```
nepting-service/
├── config/nepting.config.js      # IP/port TPE, timeouts, version protocole
├── nepting/
│   ├── tlv.builder.js            # Construction des trames de requête
│   ├── tlv.parser.js             # Décodage des trames de réponse
│   └── nepting.client.js         # Connexion TCP (net.Socket) au TPE
├── services/payment.service.js   # Logique métier (interprétation AE/AF, etc.)
├── controllers/payment.controller.js
├── routes/payment.routes.js
└── app.js
```

## ⚠️ Points non tranchés par la documentation fournie

Ces points sont implémentés avec des choix par défaut raisonnables, mais
**ne sont pas garantis par la doc Nepting** — à valider avec le vrai TPE
ou avec Nepting/HiPay avant mise en production :

1. **Fin de trame de réponse (framing TCP)** — La doc dit seulement de ne
   pas attendre de CR/LF, sans indiquer de règle fiable. `nepting.client.js`
   implémente deux stratégies configurables (`idle` par défaut, `close` en
   alternative) — voir les commentaires dans `config/nepting.config.js`.
2. **Version de protocole (tag CZ) en requête** — La doc n'indique pas
   explicitement quelle valeur envoyer ; les exemples de requête et de
   réponse utilisent des valeurs différentes ("0300" vs "0320"). Valeur
   par défaut : `"0300"`, **à confirmer**.
3. **Encodage des caractères** — Non précisé (ASCII supposé ici via
   `socket.write(..., 'ascii')`). Si des caractères accentués (email, etc.)
   posent problème, il faudra clarifier l'encodage attendu par le TPE.
4. **Exemples de trames complètes de la doc source** — Les trames
   concaténées données en exemple (section "Exemples" de la requête, et
   les 3 "cadres de réponse") ne se redécoupent pas proprement selon la
   règle 2+3+N caractères, et le contenu du tag `AK` (reçu, censé être du
   base64) ne ressemble pas à du base64 valide. Le code de ce service
   s'appuie uniquement sur les **exemples unitaires par tag**, cohérents
   entre eux (ex. `CB0011`, `CB003150`, `CB00523570`), et non sur ces
   trames complètes suspectes.
5. **Concurrence / idempotence** — Non documentées par Nepting. Le service
   ne sérialise pas encore les appels par TPE et ne déduplique pas les
   `transactionId` — à ajouter côté applicatif si nécessaire.

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `NEPTING_TPE_HOST` | IP du TPE | `192.168.1.50` |
| `NEPTING_TPE_PORT` | Port d'écoute du TPE | `8888` |
| `NEPTING_PROTOCOL_VERSION` | Valeur du tag CZ | `0300` (à confirmer) |
| `NEPTING_CASH_REGISTER_ID` | Tag CJ (obligatoire) | — |
| `NEPTING_CASH_REGISTER_NUMBER` | Tag CA (obligatoire) | — |
| `NEPTING_CONNECT_TIMEOUT_MS` | Timeout connexion TCP | `5000` |
| `NEPTING_RESPONSE_TIMEOUT_MS` | Timeout attente réponse | `60000` |
| `NEPTING_FRAMING_STRATEGY` | `idle` ou `close` | `idle` |
| `NEPTING_IDLE_TIMEOUT_MS` | Silence avant fin de trame (mode `idle`) | `800` |

## Démarrer et tester localement avec Scalar

Depuis ce dossier, installez les dépendances une seule fois :

```bash
npm install
```

La configuration est lue automatiquement depuis `.env`. Un fichier `.env`
de test est présent pour le simulateur local ; pour un déploiement, copiez
`.env.example` vers `.env` et renseignez les valeurs du vrai TPE. Le fichier
`.env` est ignoré par Git et ne doit pas être partagé.

Dans un premier terminal, démarrez un TPE simulé (il répond sur
`127.0.0.1:20002`) :

```bash
npm run tpe:simulator
```

Dans un deuxième terminal, démarrez le service HTTP (les variables de test
sont déjà présentes dans `.env`) :

```bash
npm start
```

Ouvrez ensuite [http://localhost:3000/reference](http://localhost:3000/reference).
Dans Scalar, choisissez `POST /payments`, cliquez sur **Try it**, puis utilisez
par exemple :

```json
{
  "amount": 25,
  "transactionId": "TEST-2026-00001",
  "operation": "debit",
  "customerReceipt": true
}
```

Le simulateur accepte les paiements par défaut. Pour tester un refus, démarrez-le
avec `node ../../tools/tpe-simulator/simulate-tpe.js --port 20002 --result failure`.

Vérifications rapides : `GET /health` doit retourner `{"status":"ok"}` et la
spécification OpenAPI est disponible sur `/openapi.json`.

Pour le vrai TPE, remplacez l'IP, le port, et surtout les identifiants de caisse
de test par les valeurs fournies/configurées par Nepting/HiPay. Ne conservez pas
les valeurs `127.0.0.1`, `20002` ou `000000000000` en production.

## Exemple d'appel HTTP

```
POST /payments
Content-Type: application/json

{
  "amount": 25.00,
  "transactionId": "SALE-2026-00001",
  "operation": "debit",
  "customerReceipt": true
}
```

Réponses possibles : `200` (paiement accepté), `402` (paiement refusé/échoué,
détail dans le corps), `504` (timeout TPE), `502` (TPE injoignable ou trame
malformée), `500` (erreur de configuration ou inconnue), `400` (requête
invalide).
