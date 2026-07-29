# Salon — file d'attente en temps réel (MySQL)

File d'attente pour salon de coiffure **sans réservation en ligne** : les clients
s'enregistrent sur une borne tactile une fois sur place, consultent leur position
en direct, et reçoivent un email quand leur tour approche.

Cette version utilise **MySQL/MariaDB** comme base de données — pas de dépendance
à un service externe comme Supabase. Tout tourne sur un seul serveur.

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

Pas de realtime poussé par la base ici (contrairement à Supabase) : les trois
écrans interrogent l'API toutes les 4 secondes. Largement suffisant pour une file
d'attente physique où quelques secondes de latence ne se voient pas.

## Installation

### 1. Base de données

Créez une base et un utilisateur dédié (adaptez le mot de passe) :

```sql
CREATE DATABASE salon_queue CHARACTER SET utf8mb4;
CREATE USER 'salon'@'%' IDENTIFIED BY 'un-mot-de-passe-solide';
GRANT ALL PRIVILEGES ON salon_queue.* TO 'salon'@'%';
FLUSH PRIVILEGES;
```

Puis exécutez `sql/schema.sql` sur cette base — il crée les tables et insère un
catalogue de départ (4 prestations, 6 suppléments). Aucun coiffeur n'est créé,
ajoutez-les depuis le dashboard, onglet **Coiffeurs**.

### 2. Variables d'environnement

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DB_HOST`, `DB_PORT` | Adresse du serveur MySQL/MariaDB |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Identifiants créés à l'étape 1 |
| `ADMIN_PASSWORD` | Mot de passe d'accès au dashboard, à choisir |
| `PORT` | 3000 par défaut |

Le SMTP se configure depuis le dashboard, onglet Réglages, et se stocke en base.

### 3. Lancement

```bash
npm install
npm start
```

Le serveur expose `/healthz` pour les sondes de disponibilité.

## Sécurité — à connaître avant la mise en production

- Le dashboard est protégé par **un mot de passe partagé** (en-tête `X-Admin-Password`).
  Adapté à une tablette posée dans le salon, mais sans traçabilité par personne.
- Les routes de lecture (`GET /api/queue`, catalogue, coiffeurs) sont **publiques** :
  la borne et l'écran d'attente en ont besoin sans mot de passe.
- Le mot de passe SMTP est stocké en clair dans la table `settings`. Restreignez
  l'accès réseau à la base MySQL au seul serveur applicatif.

## Structure

```
server.js                  point d'entrée Express
sql/schema.sql             tables MySQL et données de départ
src/
  db.js                    pool mysql2 + helpers settings
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
  app.js                   helpers, thème, appels API, polling
  kiosk.html               borne
  display.html             écran salle d'attente
  dashboard.html           interface coiffeur et administration
```
