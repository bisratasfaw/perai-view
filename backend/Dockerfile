# syntax=docker/dockerfile:1
#
# PerAI View API. The build context is the REPOSITORY ROOT because the backend
# bundles code from ../shared:
#
#   docker build -f backend/Dockerfile -t perai-view-api .
#   docker run --rm -p 4000:4000 -e CORS_ORIGINS=https://your-frontend.example perai-view-api
#
# backend/Dockerfile.dockerignore limits what is sent from the context.

# ── Build: install all deps and bundle src + shared into dist/server.js ──────────
FROM node:26-alpine AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY shared/ /app/shared/
COPY backend/ ./
RUN npm run build

# ── Runtime: production deps only, non-root ─────────────────────────────────────
FROM node:26-alpine AS runtime
# HOST defaults to 127.0.0.1 outside Docker; a container must listen on all interfaces.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/backend/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/server.js"]
