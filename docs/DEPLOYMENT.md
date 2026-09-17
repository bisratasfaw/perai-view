# Deployment

Every option here can be run for $0. Free tiers change often, so check each provider's current
limits and terms before you rely on them; this guide does not quote quotas.

| Option | What runs | Server needed | Best for |
| --- | --- | --- | --- |
| [GitHub Pages](#recommended-github-pages-static-demo) | Frontend only, simulation in the browser | No | The public demo (recommended) |
| [Netlify or Cloudflare Pages](#alternative-netlify-or-cloudflare-pages) | Same static build | No | If you prefer those hosts or want preview deploys |
| [Docker Compose](#full-stack-with-docker-compose) | Frontend (nginx), backend and classifier | Your own machine | Showing the full stack locally or on a spare machine |
| [Split deployment](#split-deployment-static-frontend-and-a-hosted-api) | Static frontend plus the API on a container host | A free-tier container host | A public demo that uses the real API |

The static build is about 15 MB across roughly 410 files. The largest file is `cesium/Cesium.js`
at about 6 MB (1.8 MB gzipped). Compare that with your host's file-count and file-size limits.

## How the public demo is published

The demo lives on the portfolio site at
**https://bisratasfaw.github.io/Portfolio-HTML-CSS-1/perai-view/**. The portfolio repository's
Pages workflow checks this repository out, runs `npm ci && npm run build` in `frontend/`, and
copies `dist/` into `perai-view/` on the published site. No build output is committed anywhere.

That workflow runs on every push to the portfolio, once a week, and whenever it is started by
hand, so pushing here reaches the live site at the next portfolio deploy (or immediately if you
run the portfolio's **Deploy portfolio to GitHub Pages** workflow yourself).

Requirements: this repository must be **public** and named `perai-view` (the portfolio workflow's
`DEMO_REPO`), and the portfolio's **Settings, Pages, Source** must be **GitHub Actions**.

## Optional: publish a standalone copy from this repository

[`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) can publish the same
build at `https://<owner>.github.io/perai-view/`.

1. Open **Settings, Pages** and set **Source** to **GitHub Actions**.
2. Run **Deploy demo to GitHub Pages** from the **Actions** tab.
3. To redeploy automatically after CI passes, uncomment the `workflow_run` trigger at the top of
   the workflow.

What the workflow sets at build time:

| Variable | Value | Why |
| --- | --- | --- |
| `VITE_SITE_URL` | `https://<owner>.github.io/<repository name>/` | Absolute URLs for social-preview tags |
| `VITE_REPO_URL` | `https://github.com/<owner>/<repository name>` | Source link in the About dialog |
| `VITE_API_URL` | the optional repository variable `VITE_API_URL` | Unset: in-browser simulation. Set: use a hosted API (see below) |

Notes:

- No base path is configured: the build uses relative asset URLs, so it works under
  `/<repository name>/`, for a user site (a repository named `<owner>.github.io`) and on a custom
  domain. For the last two, only change `VITE_SITE_URL` in the workflow to the real URL.
- The values come from the repository name, so renaming the repository keeps working.
- CI checks that `dist/cesium/Cesium.js` exists and is referenced with a relative URL, because an
  absolute `/cesium/...` path would 404 under a sub-path.
- Deployments use the `github-pages` environment, which by default only accepts the default
  branch.

## Alternative: Netlify or Cloudflare Pages

Both can build straight from the GitHub repository. Use these settings:

| Setting | Value |
| --- | --- |
| Base or root directory | `frontend` |
| Build command | `npm run build` |
| Publish or output directory | `dist` (that is, `frontend/dist`) |
| Environment variable | `NODE_VERSION=22` |

Optionally set `VITE_SITE_URL` to the site's URL and `VITE_REPO_URL` to your repository.

The build imports `../shared`, so the whole repository must be available during the build (both
hosts clone the full repository and only change the working directory). If a host only uploads
the chosen folder, build from the repository root instead with
`npm ci --prefix frontend && npm run build --prefix frontend` and publish `frontend/dist`.

GitHub Pages does not let you set response headers. Netlify and Cloudflare Pages do (through a
`_headers` file); the Content Security Policy and other headers in
[`frontend/nginx.conf`](../frontend/nginx.conf) are a tested starting point.

## Full stack with Docker Compose

Requires Docker with Compose v2.

```bash
docker compose up --build
```

| URL | Service |
| --- | --- |
| http://localhost:8080 | Web app (unprivileged nginx on container port 8080, serving the build and proxying `/api` and the WebSocket to the backend) |
| http://127.0.0.1:4000/api/health | Backend API, published on localhost only |
| http://127.0.0.1:8000/docs | Classifier OpenAPI docs, published on localhost only |

How it is wired:

- `frontend` is built with `VITE_DATA_SOURCE=api`, so the browser uses the backend through
  nginx at the same origin. It starts once the backend is healthy.
- `frontend` runs as a non-root user (`nginxinc/nginx-unprivileged`), which is why it listens on
  8080 inside the container.
- `backend` runs with `NODE_ENV=production`, `TRUST_PROXY=1` (nginx is one proxy hop),
  `CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080` and
  `AI_CLASSIFIER_URL=http://ai-classifier:8000`. It does not wait for the classifier to be
  healthy because it falls back to keyword classification.
- `ai-classifier` trains its model at startup (a few seconds) and has its own health check.
- Every service has a health check and `restart: unless-stopped`. There is no database or volume.

Useful commands:

```bash
docker compose up --build -d     # start in the background
docker compose ps                # health status
docker compose logs -f backend   # follow one service
docker compose down              # stop and remove the containers
```

Serving it under another hostname (for example through a reverse proxy or a tunnel that provides
HTTPS):

1. Add the public origin to `CORS_ORIGINS` in `docker-compose.yml`, for example
   `https://perai.example.com`. Browsers send it on WebSocket upgrades; unknown origins get 403.
2. If another proxy sits in front of nginx, raise `TRUST_PROXY` to the number of proxy hops.
3. Terminate TLS at that proxy and add `Strict-Transport-Security` there.

The images can also be built on their own:

```bash
docker build -f frontend/Dockerfile -t perai-view-web .              # context: repository root
docker build -f backend/Dockerfile -t perai-view-api .               # context: repository root
docker build -t perai-view-classifier ai-classifier                  # context: ai-classifier/
```

The frontend image expects a host named `backend` on port 4000 for its `/api` proxy (it resolves
the name through Docker's embedded DNS). For a self-contained static image instead, build it with
`--build-arg VITE_DATA_SOURCE=local`; the proxy then goes unused.

## Split deployment: static frontend and a hosted API

Use this if you want the public demo to use the real API and WebSocket feed.

**1. Deploy the backend** from `backend/Dockerfile` (build context: repository root) to any
container host with a free tier. Configure:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | The port your host expects (many inject `PORT` automatically; the default is 4000) |
| `HOST` | Already `0.0.0.0` in the Docker image. Set it yourself only when running `node dist/server.js` without the image, because the default is `127.0.0.1` |
| `CORS_ORIGINS` | The frontend's **origin only**, for example `https://bisratasfaw.github.io` (no path such as `/perai-view`) |
| `TRUST_PROXY` | `1` if the host puts a load balancer in front of the container (most do) |
| `AI_CLASSIFIER_URL` | Leave unset to use the keyword fallback (in production there is no default), or point it at a privately reachable classifier |

Check it with `curl https://<api-host>/api/health`. The API must be served over HTTPS, because
browsers block `http://` requests and `ws://` connections from an HTTPS page.

The classifier is optional here. It loads scikit-learn and trains at startup, so check your host's
memory limit before deploying it, and do not expose it publicly (it has no rate limiting).

**2. Point the frontend at it.** For GitHub Pages, add a repository variable named `VITE_API_URL`
with the value `https://<api-host>/api` (Settings, Secrets and variables, Actions, Variables) and
re-run the Pages workflow. For other static hosts, set the same build variable. The WebSocket URL is
derived automatically (`wss://<api-host>/api/ws/activities`); set `VITE_WS_URL` only if it lives
elsewhere.

Trade-off: in `api` mode the page does not fall back to the in-browser simulation. Free container
hosts often sleep when idle, so the first visitor may see empty panels and a "Reconnecting" status
until the API wakes up. This is why the static demo is the recommended public link.

## Environment variables for deployment

| Where | Variable | Required | Notes |
| --- | --- | --- | --- |
| Backend | `CORS_ORIGINS` | Yes, when a browser on another origin uses the API | Bare origins, comma-separated |
| Backend | `TRUST_PROXY` | Behind a proxy | Number of proxy hops; wrong values weaken per-IP rate limits |
| Backend | `NODE_ENV` | Recommended | `production` |
| Backend | `PORT`, `HOST` | Host-dependent | Defaults 4000 and `127.0.0.1`; the Docker image sets `HOST=0.0.0.0` |
| Backend | `AI_CLASSIFIER_URL` | No | Unset in production means keyword fallback; `off` disables the classifier everywhere |
| Backend | `RATE_LIMIT_MAX`, `CLASSIFY_RATE_LIMIT_MAX` | No | Defaults 300 per 15 min, 30 per min |
| Backend | `WS_MAX_CLIENTS`, `WS_MAX_CLIENTS_PER_IP` | No | Defaults 500 in total, 10 per client IP |
| Frontend (build) | `VITE_API_URL` | Only for API mode | Include `/api`, for example `https://api.example.com/api` |
| Frontend (build) | `VITE_DATA_SOURCE` | No | Force `local` or `api` |
| Frontend (build) | `VITE_WS_URL` | No | Override the derived WebSocket URL |
| Frontend (build) | `VITE_SITE_URL`, `VITE_REPO_URL` | No | Social-preview URLs and the source link |

The full lists with defaults are in [DEVELOPMENT.md](DEVELOPMENT.md#configuration).

## After deploying

- The page loads without errors in the browser console, the globe shows imagery, and the status
  chip reads **Simulated data · Live**.
- Opening **Analytics** shows totals, the hourly chart and the busiest cities.
- A shared link such as `?layer=heat&theme=cyber&city=Tokyo` restores that view.
- For API deployments: `GET /api/health` returns `"status":"ok"`, and the browser's network tab
  shows the WebSocket upgrade to `/api/ws/activities` with status 101.
