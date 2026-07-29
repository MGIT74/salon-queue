# Salon — file d'attente en temps réel

File d'attente pour salon de coiffure **sans réservation en ligne** : les clients
s'enregistrent sur une borne tactile une fois sur place, consultent leur position
en direct, et reçoivent un email quand leur tour approche — ce qui leur permet de
sortir pendant l'attente.

## Les trois écrans

| Page | Pour qui | Rôle |
|---|---|---|
| `/kiosk.html` | Client, sur tablette à l'entrée | Choisir coiffeur, prestation, suppléments et rejoindre la file |
| `/display.html` | Salle d'attente, sur TV ou écran | Qui est au fauteuil, qui attend, avec chronos en direct |
| `/dashboard.html` | Coiffeurs, sur tablette ou mobile | Commencer / terminer les coupes, gérer le catalogue et les réglages |

Le dashboard contient cinq onglets : **File d'attente**, **Prestations**,
**Suppléments**, **Coiffeurs** (avec horaires hebdomadaires) et **Réglages** (SMTP).

## Comment le timing est calculé

Chaque client a une **prestation principale** (choix unique) et des **suppléments**
(choix multiple). La durée totale est la somme des deux. À chaque check-in, début
ou fin de coupe, la file est recalculée : les clients sont répartis sur le coiffeur
qui se libère le plus tôt, en tenant compte du temps déjà écoulé sur les coupes en
cours et du nombre de coiffeurs réellement en poste d'après leurs horaires.

Ajouter une coloration en cours de coupe rallonge donc automatiquement l'attente
annoncée à tous ceux qui suivent.

## Installation

### 1. Base de données

Dans le SQL editor de votre Supabase self-host, exécuter `sql/schema.sql`.
Cela crée les tables, active le realtime sur `queue` et `queue_extras`, et insère
un catalogue de départ (4 prestations, 6 suppléments).

Aucun coiffeur n'est créé : ajoutez-les depuis le dashboard, onglet **Coiffeurs**.

### 2. Variables d'environnement

```bash
cp .env.example .env
```

| Variable | Où la trouver |
|---|---|
| `SUPABASE_URL` | L'URL de votre instance |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings > API. **Jamais** exposée au navigateur |
| `SUPABASE_ANON_KEY` | Project Settings > API. Utilisée par les pages pour le realtime |
| `ADMIN_PASSWORD` | Mot de passe d'accès au dashboard, à choisir |
| `PORT` | 3000 par défaut |

Le SMTP n'est **pas** dans le `.env` : il se configure depuis le dashboard,
onglet Réglages, et se stocke en base. Un bouton permet d'envoyer un email de test.

### 3. Lancement

```bash
npm install
npm start
```

## Déploiement sur xCloud

xCloud déploie depuis un dépôt Git. Une fois ce projet poussé sur GitHub :

1. Dans xCloud, sur le serveur voulu : **Create Site → Node.js / Git**
2. Renseigner le dépôt, la branche `main`, la commande de build `npm install`
   et la commande de démarrage `npm start`
3. Ajouter les variables d'environnement listées plus haut
4. Activer le SSL une fois le domaine pointé

Le serveur expose `/healthz` pour les sondes de disponibilité.

## Sécurité — à connaître avant la mise en production

- Le dashboard est protégé par **un mot de passe partagé** (en-tête `X-Admin-Password`).
  Toutes les routes d'écriture le vérifient côté serveur. C'est adapté à une tablette
  posée dans le salon, mais il n'y a **pas de traçabilité par personne** : si vous
  voulez savoir qui a fait quoi, il faut passer à Supabase Auth avec un compte par coiffeur.
- Les routes de lecture (`GET /api/queue`, catalogue, coiffeurs) sont **publiques** :
  la borne et l'écran d'attente en ont besoin sans mot de passe. Elles exposent les
  prénoms des clients et les prestations, pas les emails.
- Si vous activez le **RLS** sur Supabase, autorisez le rôle `anon` en lecture seule
  sur `queue` et `queue_extras` pour que le realtime fonctionne ; toutes les écritures
  passent par le backend avec la clé `service_role`.
- Le mot de passe SMTP est stocké en clair dans la table `settings` et n'est jamais
  renvoyé au navigateur. Restreignez l'accès à cette table.

## Structure

```
server.js                  point d'entrée Express
sql/schema.sql             tables, realtime, données de départ
src/
  supabaseClient.js        client service_role + helpers settings
  middleware/auth.js       vérification du mot de passe admin
  lib/queueMath.js         calcul des positions et temps d'attente
  lib/mailer.js            SMTP lu depuis la base
  routes/queue.js          check-in, start, finish, cancel, modification
  routes/catalog.js        CRUD prestations et suppléments
  routes/barbers.js        CRUD coiffeurs et horaires
  routes/settings.js       réglages et test SMTP
  cron/notify.js           email avant le tour, toutes les minutes
public/
  app.css                  thème clair/sombre partagé
  app.js                   helpers, thème, appels API, realtime
  kiosk.html               borne
  display.html             écran salle d'attente
  dashboard.html           interface coiffeur et administration
```

## Notes

- Les prestations et suppléments sont **archivés**, jamais supprimés : les fiches
  déjà passées en file y font référence et l'historique doit rester lisible.
- Si aucun horaire n'est défini pour un coiffeur, il est considéré comme disponible
  en permanence. Dès qu'un horaire existe, il n'est compté dans la capacité du salon
  que pendant ses heures.
- Le thème clair/sombre suit le réglage système au premier lancement, puis mémorise
  le choix de l'utilisateur.
