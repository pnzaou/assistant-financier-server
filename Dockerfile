# syntax=docker/dockerfile:1

# ─── Base : Node 24 LTS + OpenSSL (requis par Prisma) ────────────
FROM node:24-slim AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# ─── Dépendances (cache tant que package*.json ne change pas) ────
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ─── Développement ───────────────────────────────────────────────
# Le code source arrive par bind mount (voir docker-compose.yml) ;
# node_modules vit dans un volume nommé, jamais sur la machine hôte.
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 5000
CMD ["npm", "run", "dev"]

# ─── Build de production ─────────────────────────────────────────
FROM deps AS build
COPY . .
# prisma.config.ts exige que DATABASE_URL existe, mais "generate" ne se
# connecte jamais à la base : une URL factice suffit au moment du build.
RUN DATABASE_URL="postgresql://build:build@build:5432/build?schema=public" npx prisma generate \
  && npx tsc -p tsconfig.json

# ─── Image de production ─────────────────────────────────────────
FROM base AS prod
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# prisma/ (migrations) + prisma.config.ts : nécessaires à "migrate deploy" au démarrage
COPY prisma ./prisma
COPY prisma.config.ts ./
# scripts/ : utilitaires (ex. generer-cles.js pour produire les clés JWT du .env)
COPY scripts ./scripts
EXPOSE 5000
# migrations puis seed (compilé par tsc, idempotent) puis serveur
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/prisma/seed.js && node dist/src/index.js"]
