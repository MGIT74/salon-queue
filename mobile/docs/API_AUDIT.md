# Audit API & authentification — The Barber One

Étude en lecture seule du backend `salon-queue` (branche feat/mobile-app, code serveur identique à `main`),
réalisée avant le branchement du mobile. **Aucun fichier serveur n'a été modifié.**

## 1. Contexte général

- Base URL applicative (production) : `https://app.thebarberone.com` (cf. `mobile/app.json > extra.apiBaseUrl`).
- Toutes les routes applicative sont sous `/api/*` ; `/healthz` (public) pour la sonde de disponibilité.
- Le corps JSON est accepté jusqu'à **5 Mo** (photos coiffeurs transmises en base64).
- **Aucun middleware CORS n'est configuré** (le web est same-origin). React Native utilise le `fetch`
  natif (hors navigateur), donc pas besoin de CORS — mais tout client web tiers sera bloqué à juste titre.
- **Multi-salons (SaaS)** : chaque appel doit préciser le salon via l'en-tête **`X-Salon-Slug`**
  (résolu par `src/middleware/resolveSalon.js`, avec alias via `salon_slug_aliases`). Sur une plateforme
  hébergeant plusieurs salons, un appel sans salon est refusé : `400 { needs_salon: true }`
  (`requireExplicitSalon`, appliqué à queue/barbers/client-auth ; les autres familles tombent sur le salon
  par défaut — à considérer comme déprécié pour le mobile : **toujours envoyer `X-Salon-Slug`**).

## 2. Mécanismes d'authentification existants (non modifiés)

Trois univers d'authentification **strictement séparés** (aucun jeton ne fait double emploi) :

### 2.1 Propriétaire / administration — `requireAdmin` (`src/middleware/auth.js`)

| Élément | Détail |
|---|---|
| En-tête | `X-Admin-Password` (le `?pw=` en URL a été supprimé de partout) |
| Secret | mot de passe du **propriétaire** (enseigne), hashé scrypt dans `owners.password_hash` ; ancien stockage en clair migré à la volée à la première connexion |
| Support | `X-Impersonate-Token` (jeton court terme créé par le super admin, voir 2.4) — contournement du mot de passe |
| Limitation | compteur par enseigne+IP : 8 échecs → 429 + `Retry-After` (persisté en base `security_attempts`) |
| Cas particulier | `403` si l'email du propriétaire n'est pas vérifié (`owner_email_verified = 0`) |
| Route login | `POST /api/login` (rate limité) — écran de connexion du dashboard |

### 2.2 Coiffeur — `requireAdminOrBarber` (`src/middleware/barberAuth.js`)

| Élément | Détail |
|---|---|
| En-têtes | `X-Barber-Id` + `X-Barber-Pin` (PIN 4-8 chiffres, coiffeur actif) |
| Ouverture de session | `POST /api/barbers/login` avec `{ pin, source }` → renvoie l'identité du coiffeur (rate limité `barber-pin-login`) |
| Delegation | `X-Acting-As-Barber-Id` : une fois un PIN validé, la tablette caisse partagée agit « pour » un autre coiffeur du salon (sans retaper de PIN) |
| Fallback | l'admin passera toujours sur ces routes en envoyant `X-Admin-Password` |
| Limitation | deux compteurs **découplés** : `pin:{salon}:{ip}` (le PIN est propre au salon) et `admin:{owner}:{ip}` |

Utilisé par : file d'attente opérateur (`/api/queue/:id/start|finish|cancel|quick-finish`, `reorder`…),
lecture des RDV (`/api/appointments` en lecture), partie caisse (`/api/sales/*`), stats salon
(`/api/owner/*` en lecture), calendrier salon (lecture).

### 2.3 Client — `requireClient` (`src/routes/clientAuth.js`)

| Élément | Détail |
|---|---|
| En-tête | `X-Client-Token` — jeton opaque stocké en base (`client_sessions`) |
| Session | créée par `POST /api/client-auth/login`, **90 jours**, purgable par déconnexion et par changement de mot de passe |
| Cycle de compte | `signup` (vérification email obligatoire, lien valable 24 h) → `login` → `forgot-password` / `reset-password` → `logout` |
| Limitation | `loginRateLimiter` (5 essais/h par identité **et** par IP, blocage 1 h, persistant) + `signupRateLimiter` |
| Données de `GET /me` | profil, proches, fidélité (points, paliers, récompenses), RDV à venir (chacun avec `cancel_token`), dernier passage payé, cartes cadeaux reçues |

### 2.4 Super admin — `requireSuperAdmin` (`src/routes/salons.js`)

- Monté **avant** `resolveSalon` sur `/api/super/*` (jamais scopé à un salon).
- `POST /api/super/login` vérifie la variable d'env `SUPER_ADMIN_PASSWORD` (compteur d'échecs par IP).
- `POST /api/super/impersonate` → émet un jeton court terme (table `impersonation_tokens`) utilisé
  ensuite via l'en-tête `X-Impersonate-Token` sur les API admin.

### 2.5 Signatures secondaires (à connaître, hors périmètre mobile pour l'instant)

| Environnement | Route | Authentification |
|---|---|---|
| Automatisation n8n | `/api/automation/*` | clé API en `AUTOMATION_API_KEY` (`requireAutomationKey`) |
| Pont TPE Windows | `/api/tpe/bridge/*` | clé de pont (`bridge_keys`, `requireBridgeKey`) — **NEPTING : ne pas brancher sur mobile** |
| Inscription publique | `/api/signup/*` | publique, conditionnée à `SIGNUP_ENABLED=true` (fermée chez les clients mono-salon) |

## 3. Inventaire des endpoints par famille (217 au total)

Montage dans `server.js` : chaque famille vit sous `/api/<famille>` et protège ses route individuellement.
« Admin/Coiff. » = `requireAdminOrBarber` (admin total + coiffeur par PIN).

### File d'attente `/api/queue` (public + Admin/Coiff.)

- Publics (borne) : `GET /` (file en direct), `GET /day-limits`, `POST /checkin` (+ `checkinLimiter`),
  `POST /checkin-group`, `GET /history`…
- Admin/Coiff. : `POST /:id/start|finish|quick-finish|taken|cancel|defer-payment|unstarted-absent`,
  `DELETE /:id/unpaid`, `PUT /:id` (modification), `POST /reorder`, `POST /manual-client(/bulk)`,
  `GET /stats/today|week`, `GET /pending-payment`, `GET /clients-search`, historiques.
- Admin : `DELETE /:id`, `PUT /:id/note`.

### Rendez-vous `/api/appointments`

- Publics (rdv.html) : `GET /availability`, `GET /availability-days`, `POST /` (`bookingRateLimiter`),
  `POST /cancel` (via `cancel_token`/salon), `POST /verify/start|resend|confirm` (code SMS, `codeRateLimiter`).
- Admin/Coiff. : `GET /`, `GET /lookup`, `PUT /:id/reschedule|note|contact|services|nudge`.
- Admin : `POST /admin-create`, `POST /admin-group`, `POST /import`, `POST /:id/admin-cancel`, `DELETE /:id`.

### Catalogue `/api/catalog`

- Publics : `GET /`, `GET /categories` (bornes + rdv.html).
- Admin : `POST/PUT/DELETE` prestations, suppléments, produits, catégories.

### Coiffeurs `/api/barbers` (scopé salon)

- `POST /login` (session PIN coiffeur, publique mais rate limitée).
- Admin : CRUD coiffeurs + `PUT /:id/schedule|capabilities`, congés (`/:id/leaves*`),
  `/:id/walkin-days`, stats salon et par coiffeur.
- `GET /salon-stats|salon-series|:id/stats` : Admin ou Admin/Coiff. selon la route.

### Comptes clients `/api/client-auth` (scopé salon)

Voir 2.3 — plus `GET/PUT /me`, `PUT /appointments/:id/note`, `GET/POST/PUT/DELETE /relatives`.

### Caisse `/api/sales` + `/api/owner/caisse/*`

- `POST /api/sales` (Admin/Coiff.) : création vente ; `GET /api/sales` : lecture du jour.
- `POST /api/sales/gift-cards/:id/redeem`, `GET /api/sales/gift-cards/lookup` — cartes cadeaux.
- Périodes de caisse (pont/rotation) : `GET /api/owner/caisse/current-period`,
  `POST /api/owner/caisse/close`, `GET /api/owner/caisse/suggested-float|pending-recount|closings(/:id)`,
  `POST /api/owner/caisse/confirm-recount` — Admin ou Admin/Coiff. `GET /current-period`.
- **TPE `/api/tpe`** : `POST /charge`, `POST /print`, `GET /bridge-status`, polling du pont Windows.
  **NEPTING — désactivé volontairement côté mobile** (aucun appel, aucune clé embarquée).

### Administration salon `/api/owner`, `/api/settings`, `/api/salon-calendar`, `/api/ai-chat`

- `/api/owner` : gérance enseigne (salons multi, clients, journal d'activité, fidélité, cartes cadeaux).
- `/api/settings` : réglages (SMTP chiffré via `SETTINGS_ENCRYPTION_KEY`), TVA, SMS + tests.
  Publics : `GET /public`, `GET /vat-rates` (public).
- `/api/salon-calendar` : horaires salon + fermetures (`GET /public-closures` public, lecture utile au mobile).
- `/api/ai-chat` : crédits/messagerie IA (webhook n8n) — nécessiterait un jeton client : **hors v1 mobile**.

### Super admin `/api/super` (hors périmètre mobile, écran web dédié)

CRUD enseignes/salons/propriétaires, SMTP global, SMS global, impersonation, journalisation.

## 4. Conséquences pour le mobile

1. **Trois sessions distinctes** (admin, coiffeur, client) → stockage via `expo-secure-store`
   (jamais dans le bundle ni dans les logs). Prévoir un cache `X-Salon-Slug` persisté aussi.
2. Toujours envoyer `X-Salon-Slug` ; gérer `400 needs_salon` en demandant le salon à l'utilisateur.
3. Gérer systématiquement `429 + Retry-After` et `403 needs_email_verification` (client) ;
   ne jamais répéter un login en boucle (rate limiting persistant par IP).
4. Là où le web utilise des URLs à `?salon=…` et de longs tokens dans les liens email,
   le mobile utilisera les mêmes API JSON : rien à changer côté serveur.
5. Écrans → endpoints candidats (à confirmer au branchement, un par un) :
   - **Client / File** : `GET /api/queue`, `POST /api/queue/checkin`, `GET /api/appointments/availability`.
   - **Client / RDV** : `POST /api/appointments` (publique), `POST /api/appointments/cancel`, `GET /me`.
   - **Client / Compte** : `/api/client-auth/signup|login|logout|forgot-password|reset-password|me`.
   - **Coiffeur** : `POST /api/barbers/login`, puis `X-Barber-Id/X-Barber-Pin` sur `/api/queue` (start/finish…),
     `/api/appointments` (lecture), `/api/salon-calendar/schedule`.
   - **Caisse** : `/api/sales`, cartes cadeaux, `/api/owner/caisse/*`, `GET /api/settings/vat-rates`.
     **Nepting (`/api/tpe`) exclu.**
   - **Admin** : `X-Admin-Password` sur `/api/owner`, `/api/catalog`, `/api/barbers`, `/api/settings`,
     `/api/queue` (stats), `/api/appointments` (gestion).
6. La date/heure des RDV côté serveur est exprimée en **heure du salon** (`settings.timezone`) —
   le mobile doit afficher sans re-convertir vers l'heure locale du téléphone.
