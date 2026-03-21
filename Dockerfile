# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.17.0

# ── Étape 1 : Build TypeScript ──────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /usr/src/app

# Copier les manifestes et installer TOUTES les dépendances (dev incluses)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copier les sources et compiler
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Étape 2 : Image de production ───────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine

ENV NODE_ENV=production

WORKDIR /usr/src/app

# Installer uniquement les dépendances de production + curl pour le healthcheck
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && \
    apk add --no-cache curl

# Copier le build compilé depuis l'étape builder
COPY --from=builder /usr/src/app/dist ./dist

# Exécuter en tant qu'utilisateur non-root
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

CMD ["node", "dist/server.js"]