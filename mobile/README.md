# The Barber One — application mobile

Projet Expo / React Native isolé dans `mobile/`, sur la branche `feat/mobile-app`.

## Démarrer sur Mac avec OpenCode

```bash
git fetch origin
git switch feat/mobile-app
cd mobile
npm install
npx expo install --fix
npx expo start
```

Installer **Expo Go** sur le téléphone et scanner le QR code. Si Expo Go n'est pas compatible avec une fonctionnalité native future (TPE, impression), utiliser un **development build** EAS.

## État actuel

- **FIDÉLITÉ À L'APP WEB (consigne prioritaire)** : l'intérimaire « 4 espaces » est supprimé.
  Routeur de session à la racine : admin → Dashboard, coiffeur → Mon poste, client → Espace
  client, aucune session → parcours public (les 3 URL du web : /admin, /poste.html, /compte.html).
  Aucun choix de rôle manuel à l'ouverture.
- Design = tokens EXACTS de `public/app.css` (bleu iOS `#0062c4` / `#0a84ff`, cartes, séparateurs),
  clair ET sombre, reproduits dans `src/theme/theme` — police système comme le web.
- Dashboard admin : menu latéral du web reproduit à l'identique (13 sections, ordre exact :
  Dashboard, File d'attente, Prestations, Suppléments, Produits, Marketing, Caisse, Rendez-vous,
  Coiffeurs, Clients, Mes salons, Compte, Réglages) + pattern mobile du web (barre du bas +
  « Plus »), sélecteur d'enseigne en tête, `v0.0.1`, Déconnexion en rouge.
- Connexions reproduites : Dashboard = **email + mot de passe** (`POST /api/signup/login-lookup`
  → salons de l'enseigne, comme le sélecteur web) ; Mon poste = **pavé PIN** ; Espace client =
  email/mot de passe. Persistance SecureStore, sessions séparées, restituées au lancement.
- Espace client réel : Accueil (fidélité + RDV à venir + cartes cadeaux), Réserver (assistant
  4 étapes réel, créneaux en heures du salon), Compte (profil : Phase 3+).
- Phase 3 : réservation réelle + annulation via `cancel_token` (règles serveur).
- Nepting `/api/tpe` et impression : non branchés (intégrations spécifiques à valider).
- Correspondance complète web ↔ mobile : `docs/UI_MAPPING.md`.

### Tester sur iPhone (Expo Go)

1. `git pull` puis `npx expo start -c` (+ `npm install` si package.json a changé)
2. Le hub public offre les 3 portes du web : Dashboard / Espace client / Mon poste.
3. Après connexion, l'app ouvre directement l'écran de la session (jamais de choix de rôle).

## Arborescence mobile

```
mobile/
  App.tsx                  AuthProvider + StatusBar (thème système comme app.css)
  src/
    api/                   transport typé (X-Salon-Slug) + endpoints (login-lookup, réservation…)
    auth/                  session admin (email/mdp + salons), PIN coiffeur, client — SecureStore
    components/            ScreenPlaceholder, SessionBanner, Card, AuthForm (connexions)
    docs/                  API_AUDIT.md (endpoints) + UI_MAPPING.md (web ↔ mobile)
    hooks/                 useTheme (palette), usePolling (4-6 s, comme le web)
    navigation/            RootNavigator (routeur de session) + menu.config (13 sections du web)
    screens/               admin/ (login + shell), poste/ (PIN + shell), client/ (login + shell + RDV)
    theme/theme.ts         DESIGN TOKENS de public/app.css (clair/sombre)
    types/api.ts           formes de réponses auditée du serveur
    utils/format.ts        prix centimes, durées, heures du salon (jamais reconverties)
```

## Consignes OpenCode

Travailler uniquement sur `feat/mobile-app` et principalement dans `mobile/`. Ne pas modifier `main`, `test`, `server.js` ni les écrans web sans validation explicite. Avant toute connexion API, inventorier les endpoints et mécanismes d'authentification existants. Ne jamais mettre de secret dans le bundle Expo. Faire des commits ciblés et vérifier `npm run typecheck`.
