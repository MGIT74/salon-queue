# Tests d'intégration de la caisse

Ils lancent de **vraies requêtes** contre l'application et une **vraie base**
(schéma réel `sql/schema.sql`). À n'utiliser que sur une base de TEST : ils
suppriment les ventes, clôtures et files d'attente.

## Mise en place (MariaDB/MySQL local)

```bash
mariadb -uroot -e "CREATE DATABASE salonq CHARACTER SET utf8mb4;
  CREATE USER 'sq'@'127.0.0.1' IDENTIFIED BY 'sqpass'; GRANT ALL ON salonq.* TO 'sq'@'127.0.0.1';"
mariadb -uroot salonq < sql/schema.sql
mariadb -uroot salonq < tests/caisse/seed.sql

DB_HOST=127.0.0.1 DB_USER=sq DB_PASSWORD=sqpass DB_NAME=salonq PORT=3999 \
SETTINGS_ENCRYPTION_KEY=testkeytestkeytestkeytestkey123456 node server.js &
```

Les scripts appellent `mariadb -uroot salonq` et l'application sur `127.0.0.1:3999`.

## Lancer

```bash
node tests/caisse/01-ventes.js                     # numéros de ticket, file d'attente + stock, quantités, prix
node tests/caisse/02-pont-cloture-recomptage.js    # pont, paiement CB, vieux tickets, clôture Z, recomptage
node tests/caisse/03-cloture-pendant-ventes.js     # clôture lancée en pleine rafale de ventes (attendu : 0 vente perdue)
node tests/caisse/04-rejouabilite-stock-cloture.js # même demande rejouée, cadeau, stock cumulé, cohérence du Z
npm i --no-save jsdom && node tests/caisse/05-ecran-caisse.js   # l'écran de caisse : carte débitée mais vente non enregistrée
```

Lecture des résultats : 01 doit afficher « numeros en double : aucun » et un
client resté non encaissé après un refus de stock ; 03 « runs avec vente perdue : 0/8 » ;
05 « 0 échec ».
