# Correspondance web ↔ mobile — fidélité à l'application originale

Audit des interfaces de `public/` (web TBO) et reproduction décidée dans le mobile.
Principe : **aucun design inventé** — mêmes écrans, mêmes parcours, mêmes tokens.

## 1. Design tokens (public/app.css)

| Token CSS | Clair | Sombre | Usage |
|---|---|---|---|
| `--bg` | `#eef0f2` | `#000000` | fond applicatif |
| `--card` | `#ffffff` | `#1c1c1e` | cartes, barres |
| `--ink` | `#1d1d1f` | `#f5f5f7` | texte principal |
| `--grey` | `#66666b` | `#98989d` | texte secondaire |
| `--sep` | `#bcbdc6` | `#38383a` | séparateurs |
| `--fill/--fill-2` | `#e4e5eb/#d6d7df` | `#2c2c2e/#3a3a3c` | fonds creux, boutons doux |
| `--blue/--accent` | `#0062c4` | `#0a84ff` | accents, actions (iOS blue) |
| `--blue-soft` | `#e3eefb` | `#0a2540` | fonds accentués doux |
| `--green/--red/--orange` | `#1e7e34/#c4001b/#b35a00` | `#30d158/#ff453a/#ff9f0a` | statuts |

Police : système (SF Pro iOS / Roboto Android), comme le web (`-apple-system…`).
Reproduit dans `src/theme/theme.ts` (palettes claire/sombre identiques) ; le thème
suit le réglage système, comme `[data-theme=dark]` du web.

## 2. Correspondance des écrans

| Web (URL) | Mobile | État |
|---|---|---|
| `/admin` (connexion) | `AdminLoginScreen` : carton Email + Mot de passe, « Entrer », mot de passe oublié, « Créer mon salon » si ouvert | ✅ réel (`POST /api/signup/login-lookup` → salons) |
| `/admin/…` (**Dashboard**) | `DashboardScreen` : Bienvenue + KPI (congé/actifs/clients/RDV) + pastilles clientèle + période Jour/Semaine/Mois ‹› + Classement CA/Rapidité/Produits + CA & Manque à gagner + Prochains RDV + Catalogue + Encaissé (courbe) + journée en un coup d'œil (planning par coiffeur, heures du salon) | ✅ réel (`barbers/salon-stats`, `owner/client-stats`, `queue/history`, `appointments[?month&caisse_view]`, `owner/profile`, `settings/public`), Plage ⏳ |
| `/admin/…` (Dashboard → File d'attente) | `QueueBoard` : En cours / À suivre + commencer/terminer/annuler | ✅ réel (polling 4 s) |
| `/admin/…` (11 autres sections) | `ScreenPlaceholder` (menu exact du web) | ⏳ sections suivantes |
| `/poste.html` (login PIN) | `PostePinScreen` : pastilles + pavé numérique | ✅ réel (`POST /api/barbers/login`) |
| `/poste.html` (app) | `PosteShell` : topbar (nom du salon en capitales, prénom), zones « À suivre »/« En cours » | shell ✅, file réelle : Phase 4 |
| `/compte.html` (login) | `ClientLoginScreen` (email + mot de passe, « Renvoyer le lien de confirmation ») | ✅ réel (`/api/client-auth/login`, `resend-verification`) |
| `/compte.html` (#p-signup, #p-check-email) | `ClientLoginScreen` panneau « Créer un compte » : nom, email, téléphone avec indicatif, mot de passe, case CGU + confidentialité **obligatoire** | ✅ réel (`/api/client-auth/signup`, `accept_terms: true`, 400 `needs_terms`) |
| `/compte.html` (app) | `CompteShell` : barre du bas du web **Accueil / Réserver / Compte / Déconnexion**. Accueil = fidélité + RDV + cadeaux (données réelles), Réserver = assistant réel, Compte = profil (Phase 3+). Sélecteur « Salon » (si compte confirmé dans ≥ 2 salons de l'enseigne) ; jeton d'un autre salon refusé (`wrong_salon`) → déconnexion | ✅/partiel (`/api/client-auth/salons`, `/switch`) |
| `/rdv.html` (réservation) | intégré dans l'onglet « Réserver » (assistant 4 étapes) | ✅ réel |
| `display.html` / `kiosk.html` | hors périmètre mobile (TV salle, borne tactile du salon) | — |
| `super-admin.html` | hors périmètre (web dédié) | — |

## 3. Navigation selon les sessions (comme le web)

- Session **admin** résolue par email (`login-lookup`) → Dashboard ; sélecteur de salon
  de l'enseigne stocké dans la session (web : `#salon-switcher`) ;
  `POST /api/login` valide `X-Admin-Password` pour le salon retenu.
- Session **coiffeur** (PIN) → Mon poste. Session **client** (jeton) → Espace client.
- Priorité au lancement si plusieurs sessions : admin > coiffeur > client (l'utilisateur
  métier est prioritaire ; les autres sessions restent valides et reconnectables).
- Aucun choix de rôle manuel à l'ouverture : le routeur de session (`RootNavigator`)
  impose l'écran de la session en cours, comme les URL du web imposent leur page.

## 4. Fonctionnalités sensibles

- **Nepting** : toujours NON branché (aucun appel `/api/tpe`, aucune clé) — intégration
  spécifique à valider avant activation.
- **Impression** : réservée au pont du salon, hors périmètre mobile en Phase 1-5.

| `dashboard.html #t-rdv` (Rendez-vous) | `RendezVousScreen` : Jour / Semaine / Mois, bandeau semaine, filtres Statut et Coiffeur, créneaux teintés à la couleur du coiffeur ; `AppointmentSheet` : prestation + prix, Déplacer (coiffeur, date, créneau), Annuler (message par défaut / personnalisé), coordonnées, note interne | ✅ réel (`GET /api/appointments?month&all`, `availability?exclude_appointment_id`, `PUT :id/reschedule`, `POST :id/admin-cancel`, `PUT :id/contact`, `PUT :id/note`) — à venir : Modifier la prestation, Ajouter un RDV, Paramètres, import / exports, sélection multiple, historique et marketing dans la fiche |
| Rendez-vous (suite, maquette-agenda validée) | Semaine : `WeekAgenda` (coup d'œil de la semaine + 7 colonnes) ; Jour : flèches ▲ ▼ (décalage 5 min), pastilles ⇅ + `MovedSheet` (Remettre), ordre des colonnes par glisser du nom du coiffeur (maintenir puis glisser sur téléphone, glisser direct sur tablette ; animations ressort + vibrations légères ; gardé sur l'appareil) ; `AppointmentSheet` : décaler ±5, Modifier la prestation, historique, fidélité / cadeaux, Supprimer ; `RdvSettingsSheet` ; `UpcomingSheet` (bouton liste à côté de ⚙ : filtres, pagination, sélection, CSV / PDF / Annuler / Supprimer, import CSV) | ✅ réel (`PUT :id/nudge`, `PUT :id/services`, `DELETE :id`, `GET /api/queue/client-history*`, `GET /api/owner/client-marketing`, `GET|PUT /api/settings`, `GET /api/appointments?all=1`, `POST /api/appointments/import`) — à venir : forcer un créneau pris |
