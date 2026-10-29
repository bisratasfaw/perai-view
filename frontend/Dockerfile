# syntax=docker/dockerfile:1
#
# PerAI View web app: Vite build served by nginx. The build context is the
# REPOSITORY ROOT because the frontend imports code from ../shared:
#
#   docker build -f frontend/Dockerfile -t perai-view-web .
#
# frontend/Dockerfile.dockerignore limits what is sent from the context.
# By default the image talks to the backend through nginx's /api proxy (see
# nginx.conf and docker-compose.yml). For a self-contained image that runs the
# simulation in the browser instead, build with --build-arg VITE_DATA_SOURCE=local.

# ── Build: install deps and bundle src + shared into dist/ ──────────────────────
FROM node:22-alpine AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY shared/ /app/shared/
COPY frontend/ ./
ARG VITE_DATA_SOURCE=api
ARG VITE_REPO_URL=https://github.com/bisratasfaw/perai-view
RUN VITE_DATA_SOURCE="$VITE_DATA_SOURCE" VITE_REPO_URL="$VITE_REPO_URL" npm run build

# ── Runtime: static files + reverse proxy, as a non-root user on port 8080 ──────
FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
