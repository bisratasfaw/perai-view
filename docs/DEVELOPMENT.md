# Development guide

Everything you need to run, test and change PerAI View locally. For how the pieces fit together,
see [ARCHITECTURE.md](ARCHITECTURE.md).

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | 22 LTS recommended (20.19 or newer works) | frontend, backend, root scripts |
| npm | 10 or newer (ships with Node) | installing dependencies |
| Python | 3.11 to 3.13 | only the optional `ai-classifier` service |
| A WebGL-capable browser | current Chrome, Edge, Firefox or Safari | the 3D globe |
| Docker with Compose v2 | optional | running the full stack in containers |

CI and the Docker images use Node 22 and Python 3.12.

## First-time setup

```bash
git clone https://github.com/bisratasfaw/perai-view.git
cd perai-view
npm install          # root tooling (concurrently)
npm run setup        # npm ci in backend/ and frontend/
```

Optional, for the machine-learning classifier:

```bash
npm run classifier:setup   # creates ai-classifier/.venv and installs requirements-dev.txt
```

Optional, for end-to-end tests (downloads a Playwright Chromium build once):

```bash
cd frontend && npx playwright install chromium
```

## Running locally

There are three ways to work, depending on what you are changing.

| Command (from the repo root) | Starts | Data source in the browser |
| --- | --- | --- |
| `npm run dev:web` | Vite dev server on http://localhost:5173 | in-browser simulation (no API found) |
| `npm run dev` | backend on :4000 and Vite on :5173 | the backend API and WebSocket feed |
| `npm run dev:all` | backend, Vite and the classifier on :8000 | the backend, which reaches the local classifier automatically |

The Vite dev server proxies `/api` (including the WebSocket) to `http://localhost:4000` and, in
`auto` mode, checks `GET /api/health` once when the page loads. If the backend is not running it
falls back to the in-browser simulation, so start the backend first or reload the page after it
is up. The status chip in the top bar shows the connection state.

In development the backend sends `POST /api/classify` to `http://127.0.0.1:8000` unless
`AI_CLASSIFIER_URL` says otherwise, so `npm run dev:all` needs no configuration. Without the
classifier running, the backend answers with the keyword fallback. The **Try the activity
classifier** box in the About dialog shows which one answered.

Useful links while developing:

- App: http://localhost:5173 (try `?layer=heat&theme=cyber&city=Tokyo`, or add `&debug` to expose
  the Cesium engine as `window.__globe` in production builds; it is always exposed in dev)
- API health: http://localhost:4000/api/health
- Classifier docs (when running): http://localhost:8000/docs

To test a production build of the static demo:

```bash
npm run build     # builds backend/dist and frontend/dist
npm run preview   # serves frontend/dist on http://localhost:4173
```

## Configuration

No configuration is required for local development: every variable has a working default.

### Frontend (`frontend/`)

Vite inlines these at build time. The first four can live in `frontend/.env.local` or the shell.
`VITE_BASE`, `VITE_SITE_URL` and `VITE_PROXY_TARGET` are read by `vite.config.ts` from the
**shell environment only** (not from `.env` files). None of them is needed for local work or for
GitHub Pages.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_DATA_SOURCE` | `auto` in dev; in builds `local`, or `api` if `VITE_API_URL` is set | `local` runs the simulation in the browser, `api` uses the backend, `auto` tries the API and falls back to `local` |
| `VITE_API_URL` | `/api` | Base URL of the backend API, including `/api`, for example `https://api.example.com/api` |
| `VITE_WS_URL` | derived from `VITE_API_URL` (`ws(s)://…/api/ws/activities`) | Override the live-feed WebSocket URL |
| `VITE_REPO_URL` | `https://github.com/bisratasfaw/perai-view` | Source-code link in the About dialog |
| `VITE_BASE` | `./` (relative asset URLs) | Public base path. The relative default works at a domain root and under any sub-path such as a GitHub Pages project site, so it rarely needs changing |
| `VITE_SITE_URL` | relative (`./`) | Absolute site URL used for the Open Graph and Twitter image tags |
| `VITE_PROXY_TARGET` | `http://localhost:4000` | Where the dev server proxies `/api` |

### Backend (`backend/`)

Documented in [`backend/.env.example`](../backend/.env.example). The server reads `backend/.env`
if it exists (values already set in the environment win), validates everything with zod and exits
with a readable list of problems if a value is invalid. Empty values count as unset.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `production` or `test` |
| `HOST` | `127.0.0.1` | Bind address. Local only by default; the Docker image sets `0.0.0.0` |
| `PORT` | `4000` | HTTP and WebSocket port |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:4173` | Comma-separated bare origins allowed by CORS **and** by the WebSocket origin check |
| `TRUST_PROXY` | `0` | Reverse-proxy hops to trust for the client IP (set `1` behind nginx or a load balancer) |
| `AI_CLASSIFIER_URL` | `http://127.0.0.1:8000` outside production; unset in production | Base URL of the classifier. `off` disables it. Without a reachable classifier the keyword fallback answers |
| `RATE_LIMIT_MAX` | `300` | Requests per IP per 15 minutes, all routes except `/api/health` |
| `CLASSIFY_RATE_LIMIT_MAX` | `30` | Requests per IP per minute to `POST /api/classify` |
| `WS_MAX_CLIENTS` | `500` | Maximum simultaneous WebSocket clients |
| `WS_MAX_CLIENTS_PER_IP` | `10` | Maximum simultaneous WebSocket clients from one IP address |
| `EXPOSE_ERROR_DETAILS` | `false` | Include stack traces in 500 responses; only honoured when `NODE_ENV=development` |

### Classifier (`ai-classifier/`)

Documented in [`ai-classifier/.env.example`](../ai-classifier/.env.example). The service reads the
process environment only; it does not load `.env` files.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8000` | Port for `python -m app.main` (`npm run classifier:dev` uses `CLASSIFIER_PORT`, default 8000) |
| `HOST` | `127.0.0.1` | Bind address for `python -m app.main` |
| `CORS_ORIGINS` | `http://localhost:4000,http://localhost:5173` | Browser origins allowed by CORS |
| `LOG_LEVEL` | `INFO` | `CRITICAL`, `ERROR`, `WARNING`, `INFO` or `DEBUG` |

## Scripts

### Repository root

| Script | What it does |
| --- | --- |
| `npm run setup` | `npm ci` in `backend/` and `frontend/` |
| `npm run dev` / `dev:all` | Backend + frontend (+ classifier) with prefixed, coloured output |
| `npm run dev:api` / `dev:web` | One side only |
| `npm run build` | Bundle the backend (esbuild) and build the frontend (type check + Vite) |
| `npm run preview` | Serve the frontend build on port 4173 |
| `npm run lint` | ESLint in backend and frontend (zero warnings allowed) |
| `npm run typecheck` | `tsc --noEmit` in backend and frontend |
| `npm test` | Vitest in backend, then frontend (the frontend run includes `shared/` tests) |
| `npm run check` | lint, typecheck and test in one go |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run classifier:setup` / `classifier:dev` / `classifier:test` / `classifier:lint` | Create the venv, run uvicorn with reload, pytest, ruff (works on Windows, macOS and Linux) |

### Packages

| Package | Scripts |
| --- | --- |
| `frontend/` | `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `test:watch`, `test:e2e`, `screenshots` |
| `backend/` | `dev` (tsx watch), `build` (esbuild bundle to `dist/server.js`), `start`, `typecheck`, `lint`, `test`, `test:watch` |
| `ai-classifier/` | no npm scripts; use `pytest`, `ruff check .`, `ruff format --check .`, `pip-audit -r requirements.txt` inside the venv |

## Testing

| Suite | Location | Run with | Covers |
| --- | --- | --- | --- |
| Backend | `backend/test/` | `npm test --prefix backend` | Every endpoint with supertest, validation and error envelope, body limits, helmet headers, CORS, rate limits, WebSocket protocol (replay, ping/pong, origin check, client cap, payload limit, heartbeat, shutdown), config parsing, classifier proxy and fallback |
| Frontend + shared | `frontend/src/**/*.test.ts(x)`, `shared/*.test.ts` | `npm test --prefix frontend` | Simulation invariants (determinism, totals, time of day, event generation), city and program registries, keyword classifier, in-browser data source, colour and heat-ramp helpers, formatting, key components |
| End-to-end | `frontend/e2e/` | `npm run test:e2e` | Real Chromium against a production build: globe and imagery load without console errors, layer/style switching and deep links, analytics and city details, keyboard controls, axe accessibility scan, reduced motion, phone layout and touch-target sizes |
| Classifier | `ai-classifier/tests/` | `npm run classifier:test` | API shapes and validation limits, batch ordering, CORS, cross-validated accuracy floor, determinism, unseen prompts per label, training-data checks |

End-to-end notes:

- `playwright.config.ts` runs `npm run build && npm run preview` and tests against
  http://localhost:4173, so that port must be free (an already running preview is reused locally).
- Machines without a usable GPU can force software WebGL with `PW_GPU=swiftshader` (CI does this
  automatically). `PW_CHANNEL=chrome` uses an installed Chrome instead of Playwright's Chromium.
- The tests need internet access for NASA imagery tiles.

## Troubleshooting

**The globe is black or shows "could not start WebGL".**
Open `chrome://gpu` (or `about:support` in Firefox) and check that WebGL is hardware accelerated.
Enable hardware acceleration in the browser settings, update the graphics driver, and on laptops
with two GPUs try the discrete one. Remote desktops and some VMs have no GPU; the page still works
but the globe may be slow or unavailable there.

**"The graphics card ran out of memory and the globe stopped."**
The WebGL context was lost, usually because other tabs or apps are using the GPU. Close them and
press **Restart globe**.

**Imagery looks low-resolution or blurry.**
NASA GIBS tiles could not be loaded (offline, firewall, ad blocker or a GIBS outage). After
repeated tile errors the globe switches to the low-resolution Natural Earth imagery bundled with
CesiumJS. Check that `https://gibs.earthdata.nasa.gov` is reachable.

**The API is not reachable from another device on your network.**
The backend binds to `127.0.0.1` by default. Set `HOST=0.0.0.0` in `backend/.env` to listen on all
interfaces, and add that device's page origin to `CORS_ORIGINS`.

**The status chip says Reconnecting or Offline.**
The page is in API mode but cannot reach the WebSocket. Check that the backend is running and that
the page's exact origin is in `CORS_ORIGINS`: `http://localhost:5173` and `http://127.0.0.1:5173`
are different origins, and the backend rejects unknown origins with HTTP 403.

**The dev server uses the in-browser simulation although the backend is running.**
`auto` mode decides once per page load. Reload the page after the backend has started.

**Backend logs "classifier unavailable, using keyword fallback".**
The backend tried the classifier (by default `http://127.0.0.1:8000` in development) and it is not
running. Start it with `npm run classifier:dev`, or set `AI_CLASSIFIER_URL=off` in `backend/.env`
to use the keyword fallback without the warning. Responses say which one answered in their
`source` field.

**A port is already in use.**
The defaults are 5173 (Vite), 4173 (preview), 4000 (API) and 8000 (classifier). Find the process
with `netstat -ano | findstr :4000` on Windows or `lsof -i :4000` on macOS/Linux, or move the
API with `PORT=4001` and point the dev proxy at it with `VITE_PROXY_TARGET=http://localhost:4001`.

**`npm ci` fails with EPERM or EBUSY on Windows.**
A running dev server or editor is holding a file in `node_modules` (often `esbuild.exe`). Stop
`npm run dev` and try again.

**The backend exits with "Invalid environment configuration".**
The message lists each bad variable. A common cause is a CORS origin that includes a path, such
as `https://example.com/app`; use bare origins such as `https://example.com`.

**`npm run classifier:setup` cannot find Python.**
Install Python 3.11 to 3.13 and make sure `py` (Windows) or `python3` (macOS/Linux) is on `PATH`.
