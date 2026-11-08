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

- Navigation en place (`src/navigation/`) : Accueil → Client (onglets : File, Rendez-vous, Compte),
  Coiffeur (Ma journée), Caisse (Encaissement, Journées) et Administration (Dashboard, Catalogue,
  Coiffeurs, Réglages), avec navigation typée (`src/navigation/types.ts`).
- Écrans en préparation (`src/screens/`) : chaque écran affiche son périmètre, ses endpoints visés
  et l'authentification requise, tirés de l'audit `docs/API_AUDIT.md`.
- Couche transport API (`src/api/transport.ts`) : squelette typé (en-têtes `X-Salon-Slug`,
  auth admin/coiffeur/client) — aucun appel effectué pour l'instant.
- **Nepting (`/api/tpe`) volontairement débranché** sur le mobile (aucun appel, aucune clé).
- Aucune authentification connectée : PIN coiffeur, mot de passe propriétaire et compte client
  s'ajouteront à l'étape de branchement (stockage expo-secure-store).
- La base MySQL reste côté serveur : le mobile communiquera uniquement avec les API HTTPS de TBO.
- Les accès caisse, coiffeur et admin doivent être autorisés **côté serveur** selon le compte
  connecté. Ne pas exposer les clés TPE dans l'application.
- Ne pas déployer cette branche sur l'environnement web XCloud.

## Arborescence mobile

```
mobile/
  App.tsx                  NavigationContainer + thème clair/sombre + RootNavigator
  src/
    api/transport.ts       transport API typé (X-Salon-Slug, 3 sessions) — non branché
    auth/session.ts        persistance des sessions via expo-secure-store (Keychain/Keystore)
    components/            composants partagés (ScreenPlaceholder…)
    docs/API_AUDIT.md      audit des endpoints et mécanismes d'authentification
    hooks/useTheme.ts      palette claire/sombre selon le mode système
    navigation/            RootNavigator + 4 navigateurs d'espace (types dans navigation/types.ts)
    screens/               Accueil + écrans par espace (placeholders documentés)
    theme/theme.ts         design system : palettes, espacements, arrondis
    types/api.ts           formes de réponses auditée du serveur (client-auth pour l'instant)
    utils/format.ts        formatage affichage (prix en centimes, durées)
```

## Consignes OpenCode

Travailler uniquement sur `feat/mobile-app` et principalement dans `mobile/`. Ne pas modifier `main`, `test`, `server.js` ni les écrans web sans validation explicite. Avant toute connexion API, inventorier les endpoints et mécanismes d'authentification existants. Ne jamais mettre de secret dans le bundle Expo. Faire des commits ciblés et vérifier `npm run typecheck`.
