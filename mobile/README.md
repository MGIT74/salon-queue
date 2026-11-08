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

- Écran d'accueil de démonstration avec quatre espaces : client, coiffeur, caisse, administration.
- Aucune authentification ni opération bancaire n'est encore connectée.
- La base MySQL reste côté serveur : le mobile communiquera uniquement avec les API HTTPS de TBO.
- Les accès caisse, coiffeur et admin devront être autorisés **côté serveur** selon le compte connecté. Ne pas exposer les clés TPE dans l'application.
- Ne pas déployer cette branche sur l'environnement web XCloud.

## Consignes OpenCode

Travailler uniquement sur `feat/mobile-app` et principalement dans `mobile/`. Ne pas modifier `main`, `test`, `server.js` ni les écrans web sans validation explicite. Avant toute connexion API, inventorier les endpoints et mécanismes d'authentification existants. Ne jamais mettre de secret dans le bundle Expo. Faire des commits ciblés et vérifier `npm run typecheck`.
