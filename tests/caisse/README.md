# Tests d'intégration (caisse et plateforme)

Ils lancent de **vraies requêtes** contre l'application et une **vraie base**
(schéma réel `sql/schema.sql`). À n'utiliser que sur une base de TEST : ils
suppriment les ventes, clôtures et files d'attente.

## Mise en place (MariaDB/MySQL local)

```bash
mariadb -uroot -e "CREATE DATABASE salonq CHARACTER SET utf8mb4;
  CREATE USER 'sq'@'127.0.0.1' IDENTIFIED BY 'sqpass'; GRANT ALL ON salonq.* TO 'sq'@'127.0.0.1';"
mariadb -uroot salonq < sql/schema.sql
mariadb -uroot salonq < tests/caisse/seed.sql

# TPE_CHARGE_WAIT_MS raccourcit l'attente d'un paiement carte (110 s par defaut) pour le test 06
DB_HOST=127.0.0.1 DB_USER=sq DB_PASSWORD=sqpass DB_NAME=salonq PORT=3999 \
SETTINGS_ENCRYPTION_KEY=testkeytestkeytestkeytestkey123456 TPE_CHARGE_WAIT_MS=4000 node server.js &
```

Les scripts appellent `mariadb -uroot salonq` et l'application sur `127.0.0.1:3999`.

## Lancer

Tout d'un coup (remet la base de test a zero entre les scripts et **verifie** les resultats) :

```bash
npm i --no-save jsdom          # necessaire aux scripts 05 et 07 (ecran de caisse simule)
node tests/caisse/run-all.js   # code de sortie 0 = tout est OK
```

Ou un par un :

```bash
node tests/caisse/01-ventes.js                       # numeros de ticket, file d'attente + stock, quantites, prix
node tests/caisse/02-pont-cloture-recomptage.js      # pont, paiement CB, vieux tickets, cloture Z, recomptage
node tests/caisse/03-cloture-pendant-ventes.js       # cloture en pleine rafale de ventes (attendu : 0 vente perdue)
node tests/caisse/04-rejouabilite-stock-cloture.js   # meme demande rejouee, cadeau, stock cumule, coherence du Z
node tests/caisse/05-ecran-caisse.js                 # carte debitee mais vente non enregistree (page simulee)
node tests/caisse/06-paiement-cb-bout-en-bout.js     # paiement carte avec un faux pont : accepte, refuse, panne, silence, expiration
node tests/caisse/07-cadeau-limite-et-ecran-incertain.js  # limite de tentatives cadeau + confirmation avant de relancer un paiement incertain
node tests/caisse/08-heure-de-reouverture.js         # heure de reouverture : fuseaux et changements d'heure
node tests/caisse/09-guide-demarrage-pont.js       # guide "Connecter le TPE et l'imprimante" : affichage, lien tpebridge://start, memorisation
node tests/caisse/10-connexion-caisse.js            # icone reglages de la caisse : pastille, fenetre, etats, suivi en direct, droits
node tests/caisse/11-inscription-publique.js       # inscription ouverte / fermee (SIGNUP_ENABLED) ; lance une 2e copie du serveur sur le port 3998
node tests/caisse/12-timer-automatique.js          # demarrage/arret automatique du timer (RDV oublie) ; jamais pour un client absent ou en attente libre
node tests/caisse/13-pastille-pendant-paiement.js  # la pastille TPE ne doit pas passer rouge en pleine transaction carte (pont juste occupe, pas hors ligne)
node tests/caisse/14-scan-code-barres.js           # scanner USB (douchette) : detection par vitesse, ajout au ticket, code inconnu, rupture de stock
node tests/caisse/15-deplacer-dans-tiroir.js       # bouton Deplacer dans le tiroir client (dashboard) - meme fonction que celui de la liste RDV
node tests/caisse/16-alignement-clients.js         # colonnes de la liste Clients ne se decalent pas selon la presence du bouton Terminer
```
