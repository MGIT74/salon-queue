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
node tests/caisse/60-sms-lib.js  # SMS : telephone, segments, message, expediteur
node tests/caisse/61-sms-routes-ui.js  # SMS : schema, routes, reglages, super admin, interface
node tests/caisse/62-sms-credits-mensuels.js  # SMS : dotation mensuelle remise a zero le 1er du mois
node tests/caisse/63-changement-salon-recharge.js  # Dashboard : changer de salon recharge toute la page
node tests/caisse/64-historique-clotures-admin.js  # Caisse : historique des clotures reserve a l'admin
node tests/caisse/65-version-masquee-mobile.js  # Dashboard : version de l'app masquee en mobile
node tests/caisse/66-historique-caisse-du-jour.js  # Caisse : historique du tiroir = journee en cours seulement
node tests/caisse/67-tva-nommees-par-article.js  # TVA nommees (liste admin) choisies par article
node tests/caisse/68-catalogue-selection-multiple.js  # Catalogue : selection multiple (TVA, prix, archiver, supprimer)
node tests/caisse/69-catalogue-recherche.js  # Catalogue : barre de recherche
node tests/caisse/70-apres-cloture-ecran-depart.js  # Caisse : retour auto a l ecran de depart apres cloture
node tests/caisse/71-categories-catalogue.js  # Catalogue : categories (familles) + filtre en caisse
node tests/caisse/72-fidelite-creation-compte.js  # Fidelite : carte activee des la 1re reservation en ligne
node tests/caisse/73-stats-coiffeur-tout-encaissement.js  # Stats coiffeur : tout l encaissement a son nom
node tests/caisse/74-timeline-heure-sur-bloc.js  # Timeline : heure du rdv sur le bloc
node tests/caisse/75-cartes-compte-infos-hors-visuel.js  # Compte client : infos hors du visuel des cartes
node tests/caisse/76-produit-caisse-seulement.js  # Produit caisse seulement (pas en ligne)
node tests/caisse/77-icone-cadeau-partout.js  # Image de la tuile cadeau partout
node tests/caisse/78-fidelite-sans-badge-cadeau.js  # Fidélité sans badge cadeau
node tests/caisse/79-conges-calendrier-lib.js  # Congés : jours <-> plages, répétition annuelle
node tests/caisse/80-conges-calendrier-annuel.js  # Congés : calendrier annuel (glisser, bulle)
node tests/caisse/81-fiche-coiffeur-page.js  # Fiche coiffeur en page + cartes
node tests/caisse/82-onglets-pastille-fondu.js  # Onglets partout : pastille qui glisse + fondu
node tests/caisse/83-groupe-reservation-api.js  # Reservation a plusieurs : API (groupe, annulation groupee)
node tests/caisse/84-proches-compte-api.js  # Mes proches : CRUD du compte client
node tests/caisse/85-reservation-groupe-interface.js  # Reservation a plusieurs : Pour qui ? > Que fait chacun ? > horaires proposes pour le groupe > recap ; connexion facultative
node tests/caisse/86-import-csv-clients.js  # Import CSV clients : lecture du fichier + route en lot (base simulee)
node tests/caisse/87-import-rdv.js  # Import de RDV (CSV type Bookly) : lecture, rapprochement coiffeurs/prestations, route (base simulee)
node tests/caisse/88-selecteur-periode.js  # Selecteur de periode Du/Au (raccourcis, calendrier a deux mois, compatibilite champs d'origine)
node tests/caisse/89-caisse-tiroir-rdv.js  # Caisse : tiroir client d'un RDV (modifier, deplacer, annuler, note) + routes /lookup et /reschedule coiffeur
node tests/caisse/90-actualisation-discrete.js  # Actualisation discrete 15 s (caisse, compte client) : delai d'inactivite, garde occupe, defilement conserve
node tests/caisse/91-audit-securite.js  # Audit securite : liens d'email (base_url), echappement HTML des emails, CSV, verrou de reservation, limite publique
node tests/caisse/92-encaissement-avance.js  # Encaissement a l'avance (serveur + base) : garde sa place, deja paye, reste a payer apres supplement
node tests/caisse/93-fidelite-deux-paliers.js  # Fidelite a deux paliers (prestation / produit), deduction a l'utilisation, reconversion des anciennes recompenses
node tests/caisse/94-horaires-caisse.js  # Horaires de caisse : ouverture / fermeture automatique (interrupteurs), cloture Z en attente reservee a l'admin
node tests/caisse/95-stats-dashboard-ventes.js  # Dashboard : encaisse du jour et CA de la semaine = toutes les ventes de la caisse, par jour du salon
node tests/caisse/96-journal-par-salon.js  # Journal d'activite isole par salon (plus de melange entre salons de l'enseigne)
node tests/caisse/97-onglet-a-encaisser.js  # Caisse : 4e onglet « À encaisser » (liste des encaissements en attente + pastille)
node tests/caisse/98-rdv-groupe-salon.js  # RDV pour plusieurs personnes depuis le dashboard, la caisse et Mon poste (admin-group)
node tests/caisse/99-compte-client-proches-salon.js  # Ajouter un RDV : compte client reconnu (nom, email, telephone) avec ses proches, ajout d'un proche par le salon
node tests/caisse/100-supprimer-passage-non-paye.js  # Caisse « A encaisser » : corbeille (double confirmation) pour un passage non paye, supprime avec sa reservation
node tests/caisse/101-categories-produits-rdv.js  # Etape Produits des reservations : pastilles de categories, seulement les produits disponibles en ligne
node tests/caisse/102-pause-messages-clients.js  # Reglages : pause des emails / SMS aux clients pendant l'import des RDV (faux serveur SMTP)
node tests/caisse/103-manque-a-gagner.js  # Manque a gagner = creneaux libres deja passes (duree prevue, pauses, conges) + RDV annules/absents a leur prix
node tests/caisse/104-stats-coiffeur-courbe.js  # Fiche coiffeur : panier moyen, ventes en plus, par heure, RDV rates, vs periode precedente, courbe 3 lignes
node tests/caisse/105-dashboard-courbe-salon.js  # Tableau de bord : courbe globale « Encaisse du salon » (7 j / 30 j / 3 mois) + periode precedente
node tests/caisse/106-poste-agenda-equipe.js  # Mon poste > Agenda : timeline de tous les coiffeurs, RDV au nom d'un collegue
node tests/caisse/107-date-salon-minuit.js  # « Aujourd'hui » = date du salon (pas UTC) : apres minuit, reservation et agenda passent bien au lendemain
node tests/caisse/108-tarif-coiffeur-reservation.js  # Tarif propre a chaque coiffeur (prix + duree) et prestations qu'il ne fait pas / archivees : creneaux, reservations, ecrans
node tests/caisse/109-agenda-date-passee.js  # Agendas admin / Mon poste / caisse : un jour passe se consulte mais n'est plus proposable a une prise de RDV
node tests/caisse/110-borne-produits-mise-en-page.js  # Borne : produits proposes avant la confirmation (caisse + agenda), barre du bas fixe meme avec beaucoup de prestations
node tests/caisse/111-groupe-une-personne-a-la-fois.js  # RDV a plusieurs : reservation normale personne par personne, panier « Continuer pour Tom » / « Terminer », creneaux retenus
node tests/caisse/112-fermetures-calendrier-annuel.js  # Reglages : fermetures du salon dans le meme calendrier annuel que les conges (cocher / decocher des jours)
node tests/caisse/113-jours-sans-rdv-coiffeur.js  # Coiffeur : jours « sans RDV » dans son calendrier (plus de creneau, visible a la borne, refuse si RDV deja pris)
node tests/caisse/114-supprimer-coiffeur.js  # Supprimer un coiffeur : bloque si RDV / file, historique garde « (supprimé) », code PIN jamais redonne
node tests/caisse/115-premier-disponible.js  # « Premier disponible » : le systeme choisit le coiffeur le plus libre (en ligne, compte, groupe, admin), nom affiche apres confirmation ; pas a la borne
node tests/caisse/116-rdv-indicatif-telephone.js  # Prise de RDV (seul / a plusieurs) : indicatif pays du telephone, comme a la creation de compte
node tests/caisse/117-site-salon-redirection.js  # Reglages > General : site du salon ; redirection apres une prise de RDV en ligne (rdv.html seulement)
node tests/caisse/118-borne-plusieurs-premier-disponible.js  # Borne : « Juste moi / Plusieurs personnes », groupe inscrit en une fois ; « Premier disponible » des 2 coiffeurs (le premier libre le prend)
node tests/caisse/119-file-sans-coiffeur-coiffeurs-sans-rdv.js  # File : client sans coiffeur (sans RDV) pris seulement par les coiffeurs sans RDV du jour (caisse, Mon poste, serveur)
node tests/caisse/120-icones-rdv-sans-rdv-timer.js  # Timer : icone RDV / sans RDV devant chaque client ; etiquette RDV / sans RDV a cote du nom du coiffeur
node tests/caisse/121-timer-ordre-glisser.js  # Timer caisse : glisser les clients sans RDV pour changer leur ordre (les RDV ne bougent pas)
node tests/caisse/122-douchette-caisse-focus.js  # Caisse : la douchette lit toujours, meme apres un clic sur une pastille de coiffeur (focus du champ invisible)
node tests/caisse/123-journal-erreurs-serveur.js  # Journal des erreurs serveur (super admin › Erreurs) : quand, salon, page, cause ; jamais les donnees clients
node tests/caisse/124-supplement-seul.js  # « Seulement un supplement » : RDV / file sans prestation (au moins un supplement), partout
node tests/caisse/125-attente-par-coiffeur.js  # Attente estimee : par coiffeur choisi ; « Premier disponible » sur les coiffeurs sans RDV (ticket borne, TV, emails)
node tests/caisse/126-identifiants-longs.js  # Prestations / supplements au nom long (identifiant > 36 caracteres) : RDV, tarifs coiffeur, ventes
node tests/caisse/127-couleur-coiffeur-partout.js  # Couleur du coiffeur : celle de sa fiche partout (agenda caisse, classement, avatars)
node tests/caisse/128-jours-coiffeur-absent.js  # Calendrier RDV : jours ou le coiffeur choisi est absent grises, premier jour disponible choisi
node tests/caisse/129-admin-adresse-par-menu.js  # Admin : une adresse par menu (/admin/rendez-vous...), retour navigateur, nouvel onglet, anciens liens
node tests/caisse/130-deplacer-rdv-supplement-seul.js  # Deplacer un RDV : ses supplements comptent (RDV « supplement seul » deplacable)
node tests/caisse/131-rdv-ecran-compte.js  # Prise de RDV : premier ecran Se connecter / Creer un compte / Continuer sans compte
node tests/caisse/132-compte-ordinateur-tablette.js  # Compte client ordinateur/tablette : menu lateral, accueil en colonnes, etapes + recapitulatif
node tests/caisse/133-calendrier-sans-scintillement.js  # Calendriers sans scintillement (RDV en ligne, compte, admin, poste)
node tests/caisse/134-zoom-curseur-planning.js  # Planning du jour : zoom par curseur, traits entre les heures toujours visibles
node tests/caisse/135-poste-tablette.js  # Mon poste tablette : page elargie, planning a cote du calendrier en paysage
node tests/caisse/136-groupe-salon-coiffeur-creneaux.js  # RDV a plusieurs (salon) : coiffeur choisi sur l'etape des creneaux
node tests/caisse/137-supplement-seul-direct.js  # « Seulement un supplement » : un appui = etape Supplements, partout
```
