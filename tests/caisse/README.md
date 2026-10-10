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
node tests/caisse/17-kiosk-sans-rdv.js             # le kiosque ne compte/affiche que l'attente libre, jamais les RDV programmes
node tests/caisse/18-liste-suivants-timer.js       # onglet Timer : la liste des suivants reste visible pendant une prestation en cours, premier verrouille
node tests/caisse/19-produits-preselectionnes-rdv.js  # produits pre-choisis a la reservation - remontent jusqu'a la file, sans toucher a la duree/au prix
node tests/caisse/20-produits-rdv-dashboard.js     # meme fonctionnalite, formulaire 'Ajouter un RDV' du dashboard (parcours complet, vrai serveur)
node tests/caisse/21-produits-rdv-caisse-poste.js  # meme fonctionnalite, formulaires 'Ajouter un RDV' de caisse.html et poste.html
node tests/caisse/22-produits-rdv-compte.js        # meme fonctionnalite, espace client (compte.html) - derniere des 6 pages
node tests/caisse/23-sans-rdv-sur-frise.js         # client sans RDV demarre : apparait sur la frise de l'Agenda (en cours + termine), jamais en attente
node tests/caisse/24-nom-bienvenue-dashboard.js    # 'Bienvenue, <nom du profil>' (repli sur le nom de l'enseigne), nom de l'enseigne inchange ailleurs
node tests/caisse/25-logo-menu-lateral.js         # menu lateral : logo de l'enseigne a la place du titre redondant (repli sur le nom, jamais de texte provisoire)
node tests/caisse/26-menu-lateral-trois-zones.js  # menu lateral BUREAU : en-tete fixe / navigation qui defile / pied fixe - regles confinees au bloc >= 861px, mobile intact
node tests/caisse/27-retrait-des-photos.js         # TOUTE photo ajoutable (dashboard + super-admin) a son retrait ; logo du salon et photo de coiffeur
node tests/caisse/28-chrono-pas-des-creneaux.js   # chronologies : une heure A CHAQUE PAS des creneaux (5/10/15/20/30), frise assez large pour qu'aucun libelle ne chevauche, zoom coherent
node tests/caisse/29-catalogue-suppression-ordre.js  # catalogue : suppression (effacee si jamais utilisee, CONSERVEE invisible si dans l'historique) + ordre suivi par la caisse (vraie base)
node tests/caisse/30-catalogue-ecran-supprimer-deplacer.js  # catalogue, ecran : bouton Supprimer + messages, enregistrement de l'ordre, deplacement au clavier
node tests/caisse/31-poste-suit-ordre-catalogue.js  # 'Mon poste' : relit le catalogue au plus toutes les 15 s (ordre/prix/stock changes dans l'admin repris sans recharger)
node tests/caisse/32-schema-applique-au-demarrage.js  # le serveur applique schema.sql a chaque demarrage : base ancienne reparee seule, echec de droits toleree (demarre + avertit)
node tests/caisse/33-catalogue-mouvement.js  # deplacement des articles : la ligne suit le pointeur, les autres glissent (FLIP), elle se pose ; 'reduire les animations' respecte
node tests/caisse/34-compte-client-inscription.js  # compte client : inscription sur base STRICTE (owner_id), parcours complet, 'Renvoyer le lien', ecran ; aucune requete INSERT n'oublie une colonne obligatoire
node tests/caisse/35-adresse-sans-salon.js  # compte.html / rdv.html sans ?salon= : 'Lien incomplet' si plusieurs salons (serveur + pages) ; creation de salon fermee ; un seul salon : inchange
node tests/caisse/36-installation-salon-par-defaut.js  # schema rejoue a chaque demarrage : 'Le Salon'/'change-moi' et les donnees de depart ne se creent que sur une base VIERGE (jamais sur une instance en service)
node tests/caisse/37-identifiant-salon-alias.js  # changer l'identifiant (slug) d'un salon : l'ancien reste valable (alias) et reserve ; super-admin seulement
node tests/caisse/38-logo-connexion-et-ecran-identifiant.js  # logo du salon dans l'icone de connexion du dashboard (sans eclair) ; bouton 'Identifiant' du super-admin
node tests/caisse/39-photos-prestations-reservation.js  # reservation en ligne : photos des prestations (comme la borne), selection visible par-dessus la photo
node tests/caisse/40-vitrine-supplements-produits.js  # reservation en ligne : supplements et produits en cartes de vitrine (photo ou icone, recherche, categories, epuise, resume + barre du bas)
node tests/caisse/41-vitrine-compte.js  # meme chose sur la reservation de 'Mon compte' (+ remise a zero d'une nouvelle reservation)
node tests/caisse/42-vitrine-assistants-borne.js  # memes cartes dans l'assistant 'Ajouter un RDV' du tableau de bord et de Mon poste, et sur la borne ; fichiers partages (app.css v6 / app.js v8)
node tests/caisse/43-coiffeurs-en-conge.js  # un coiffeur en conge n'est plus propose (RDV en ligne, Mon compte, borne, planning et assistant du tableau de bord)
node tests/caisse/44-photo-coiffeur-entiere.js  # photo du coiffeur entiere (jamais coupee) sur rdv, Mon compte et la borne ; televersement sans recadrage
node tests/caisse/45-rdv-en-ligne-3-zones.js  # rdv.html en ligne : design 3 zones sur ordinateur (en-tete / liste / pied fixe avec recap), mobile inchange
node tests/caisse/46-calendrier-maison.js  # calendrier maison sur ordinateur (champs date), mobile natif
node tests/caisse/47-caisse-cartes-vitrine.js  # caisse : memes cartes que la page de RDV en ligne (prestations / supplements / produits)
node tests/caisse/48-notifications-email-textes.js  # notifications email : textes d origine ecrits dans les champs, jetons proteges
node tests/caisse/49-vendeur-par-ligne.js  # vendeur/realisateur par ligne (prestation, supplement, produit) + stats
node tests/caisse/50-ticket-etire.js  # ticket desktop : lignes extensibles, boutons compacts
node tests/caisse/51-tiroir-sur-especes.js  # clic Especes = ouverture immediate du tiroir
node tests/caisse/52-paiement-partage.js  # paiement partage especes + carte (bouton Partager)
node tests/caisse/53-lignes-separees.js  # un clic = une ligne separee (un coiffeur par ligne)
node tests/caisse/54-ticket-z-long-defile.js  # ticket Z / recu long : defile, boutons toujours visibles
node tests/caisse/55-ticket-z-pont.js  # ticket Z : impression via le pont (caisse + admin), 32 colonnes
node tests/caisse/56-z-montants-non-coupes.js  # Z / recu : montant + devise jamais coupes
node tests/caisse/57-compose-env-ia.js  # prod Docker : variables IA transmises au conteneur
node tests/caisse/58-ia-base-url.js  # IA : adresse de l'instance transmise a n8n (liste blanche)
node tests/caisse/59-ia-ventes-caisse.js  # IA : outil des ventes reelles de la caisse + register_today
```
