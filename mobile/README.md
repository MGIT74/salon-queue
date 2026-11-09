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

- **Phase 3 en cours : réservation réelle dans l'espace client** — assistant en 4 étapes
  (prestation + suppléments → coiffeur (« premier disponible » ou choix) → jour + créneau
  (heures du salon) → récapitulatif + note). Client connecté = sans code de vérification
  (le serveur accepte la session vérifiée). Liste des RDV à venir en direct (polling 6 s)
  + annulation par `cancel_token` (règles serveur : délai, RDV honoré).
- Design system v2 : accueil en héros + cartes icônées, `components/Card.tsx` partagé
  (fidélité, RDV), placeholders en pilule « bientôt », palette claire/sombre affinée.
- L'espace client tient maintenant 2 onglets : **Rendez-vous** et **Compte** — la file
  sans RDV reste sur la borne du salon (hors périmètre mobile client).
- **Phase 2 : authentifications réelles branchées** sur les API TBO :
  - Client : `POST /api/client-auth/login` + session 90 j (`X-Client-Token`); l'onglet Compte affiche
    le profil réel (`GET /api/client-auth/me`) — points de fidélité, RDV à venir, dernier passage,
    cartes cadeaux — avec déconnexion serveur et gestion de session expirée (401).
  - Coiffeur : `POST /api/barbers/login` par code PIN → « Ma journée » (file/réelles : Phase 4).
  - Admin : `POST /api/login` (mot de passe propriétaire, `X-Admin-Password` revalidé à chaque appel).
  - Persistance : `src/auth/session.ts` via expo-secure-store (Keychain iOS / Keystore Android),
    trois univers strictement séparés, salon actif (`X-Salon-Slug`) mémorisé. Gestion des erreurs
    serveur : 429 + Retry-After, 403 email non vérifié, 400 needs_salon (salon non précisé).
  - Gardes d'espace côté app = UX seule : la sécurité reste 100 % côté serveur.
- Navigation en place (`src/navigation/`) : Accueil → Client (onglets : File, Rendez-vous, Compte),
  Coiffeur (Ma journée), Caisse (Encaissement, Journées) et Administration (Dashboard, Catalogue,
  Coiffeurs, Réglages), avec navigation typée (`src/navigation/types.ts`), en-tête racine, retour natif.
- Design system clair/sombre (`src/theme/` + `src/hooks/useTheme.ts`) : palette sombre « barbershop »,
  palette claire équivalente, appliquées aux écrans et au chrome de navigation.
- Écrans en préparation (`src/screens/`) : chaque écran affiche son périmètre, ses endpoints visés
  et l'authentification requise, tirés de l'audit `docs/API_AUDIT.md`.
- Couche transport API (`src/api/transport.ts`, `src/api/endpoints.ts`) : appels typés réels.
- **Nepting (`/api/tpe`) volontairement débranché** sur le mobile (aucun appel, aucune clé) ;
  caisse sans données réelles (Phase 5).
- La base MySQL reste côté serveur : le mobile communiquera uniquement avec les API HTTPS de TBO.
- Ne pas déployer cette branche sur l'environnement web XCloud.

### Tester l'authentification sur iPhone (Expo Go)

1. `cd mobile && npm install && npx expo start`
2. Scanner le QR avec Expo Go.
3. Espace client : email + mot de passe d'un compte client du salon (champ salon : identifiant si plusieurs salons, vide si un seul).
4. Espace coiffeur : code PIN d'un coiffeur actif ; Administration : mot de passe propriétaire.
5. Fermer puis rouvrir l'app : les sessions sont restituées (SecureStore). Le bouton Déconnexion détruit la session côté serveur (client).

## Arborescence mobile

```
mobile/
  App.tsx                  NavigationContainer + thème clair/sombre + RootNavigator
  src/
    api/                   transport typé (X-Salon-Slug, 3 sessions) + endpoints auth réels
    auth/                  contexte d'authentification + persistance expo-secure-store
    components/            composants partagés (ScreenPlaceholder, SessionBanner, AuthForm…)
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
