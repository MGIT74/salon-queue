# Image de l'application (Node). La base MariaDB est un service SEPARE
# (voir docker-compose.yml) - jamais dans cette image.
FROM node:20-alpine

ENV NODE_ENV=production \
    TZ=UTC

WORKDIR /app

# Dependances d'abord (couche mise en cache tant que package*.json ne change pas)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

# Verifie que l'app repond vraiment (pas seulement que le processus tourne)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/kiosk.html || exit 1

# 1) applique le schema (idempotent - cree la base vierge au 1er lancement,
#    applique toute nouvelle colonne livree par un redeploiement), 2) demarre.
CMD ["sh", "-c", "node scripts/apply-schema.js && exec node server.js"]
