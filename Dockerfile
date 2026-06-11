# syntax=docker/dockerfile:1

# ============================================================
# Stage 1 — build
# ============================================================
FROM node:22-alpine AS build
WORKDIR /app

# sharp necesita libc/vips; en alpine usa prebuilds, pero aseguramos toolchain
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev

# ============================================================
# Stage 2 — runtime
# ============================================================
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Usuario no root
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist ./dist
COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs
EXPOSE 3000

# Healthcheck simple contra el endpoint /health

CMD ["node", "dist/main.js"]
