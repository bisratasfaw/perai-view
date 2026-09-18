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
| A GitHub token (`gh auth token` works) | optional | the data pipeline's GitHub source; the other sources need no credentials |

CI and the Docker images use Node 22 and Python 3.12. The data pipeline requires Node 22 (it
uses `tsx` and the built-in `fetch`).

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

Optional, for refreshing the real-data snapshots (the repository already contains a committed
set, so the app works without this):

```bash
cd data-pipeline && npm ci
```

## Real-data pipeline

`data-pipeline/` fetches five free public sources and writes validated JSON snapshots to
`data/real/`, which the frontend serves as static files. [`data/real/README.md`](../data/real/README.md)
describes every file, its source, licence and caveats; [ARCHITECTURE.md](ARCHITECTURE.md#real-data)
explains the design. Day to day:

```bash
cd data-pipeline
GITHUB_TOKEN=$(gh auth token) npm run refresh      # every source
npm run refresh -- --only wikipedia                 # one source; ids: anthropic, openai, wikipedia, pypi, github
npm run refresh -- --skip pypi,github              # everything except these
npm run refresh -- --force                         # ignore the fingerprint and per-day caches, re-download everything
npm run refresh -- --data-dir /tmp/real            # write somewhere else (tests and experiments)
npm run validate                                   # parse every file in data/real against shared/realData.ts
npm test                                           # 112 tests against recorded fixtures, no network
npm run lint && npm run typecheck
```

The same commands exist at the repository root as `npm run data:refresh -- <flags>`,
`npm run data:validate` and `npm run data:test`. Sources run independently: a failing one keeps
its previous file and is marked `failed` in `manifest.json`; the exit code is 1 only when a
produced file fails validation or when no source succeeded. A source left out with `--only` or
`--skip` keeps its previous snapshot and manifest entry untouched.

What each run does, in order: `countries.json` is rebuilt offline from the `world-countries`
package; Anthropic lists the Hugging Face dataset, compares the newest release CSV's object id
with the cached one and only streams the 219 MB file when it changed; OpenAI writes its static
transcription; Wikipedia fetches 30 days of per-article views for 8 articles across all language
editions and downloads only the days of the country dataset that are not yet cached; PyPI runs a
BigQuery query when credentials exist, otherwise writes `status: "not_configured"`; GitHub pages
through the newest 6,000 forks of each of 8 SDK repositories and geocodes the owners' profile
locations offline. The run ends by validating every file and writing `manifest.json`.

Two files in `data/real/` are special: `manifest.json` is the provenance record the UI reads, and
`.pipeline-state.json` is a cache (object ids, per-day sums, freshness dates) that is git-ignored
and kept in the GitHub Actions cache instead. Delete it (or use `--force`) to start from scratch.
Never hand-edit the snapshots; change the fetcher in `data-pipeline/src/sources/` and re-run.

In development, Vite serves `../data/real` at `/data/real` (with `Cache-Control: no-cache`, so a
fresh run shows up on reload), and `npm run build` copies the `.json` files into
`frontend/dist/data/real`. The browser validates each file with the shared schemas before
rendering it, and the layer menu disables a real layer whose source is `not_configured` or has
never succeeded.

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

### Data pipeline (`data-pipeline/`)

Read from the process environment only (no `.env` file). Nothing is required for the Anthropic,
OpenAI, Wikipedia and countries sources.

| Variable | Default | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` | unset | Required for `developer-cities.json`: the GraphQL API needs authentication. Only public data is read, so a token without extra scopes is enough (`gh auth token` locally; the automatic `secrets.GITHUB_TOKEN` in Actions). Without it the GitHub source fails and keeps its previous file |
| `BIGQUERY_PROJECT` | unset | Google Cloud project id that runs the PyPI query. Without it `sdk-downloads-by-country.json` is written with `status: "not_configured"` and the SDK layer is disabled |
| `GCP_SERVICE_ACCOUNT_KEY` | unset | Contents of a service-account JSON key (used by the workflow secret) |
| `GOOGLE_APPLICATION_CREDENTIALS` | unset | Path to the same key file, the usual choice locally. Either this or `GCP_SERVICE_ACCOUNT_KEY` is needed together with `BIGQUERY_PROJECT` |

The pipeline identifies itself to every service with a fixed `User-Agent`
(`PerAI-View-data-pipeline/1.0 (https://github.com/bisratasfaw/perai-view; ...)`, in
`data-pipeline/src/lib/http.ts`), as the Wikimedia and GitHub API policies ask. If you fork the
project and run the pipeline under your own name, change the contact URL in that constant.

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
| `npm run data:refresh -- [flags]` / `data:validate` / `data:test` | Run the real-data pipeline (`--only`, `--skip`, `--force`, `--data-dir`), validate `data/real/`, run its tests |
| `npm run classifier:setup` / `classifier:dev` / `classifier:test` / `classifier:lint` | Create the venv, run uvicorn with reload, pytest, ruff (works on Windows, macOS and Linux) |

### Packages

| Package | Scripts |
| --- | --- |
| `frontend/` | `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `test:watch`, `test:e2e`, `screenshots` |
| `backend/` | `dev` (tsx watch), `build` (esbuild bundle to `dist/server.js`), `start`, `typecheck`, `lint`, `test`, `test:watch` |
| `data-pipeline/` | `refresh` (tsx, accepts `--only`, `--skip`, `--force`, `--data-dir`), `validate`, `typecheck`, `lint`, `test`, `test:watch` |
| `ai-classifier/` | no npm scripts; use `pytest`, `ruff check .`, `ruff format --check .`, `pip-audit -r requirements.txt` inside the venv |

## Testing

| Suite | Location | Run with | Covers |
| --- | --- | --- | --- |
| Backend | `backend/test/` | `npm test --prefix backend` | Every endpoint with supertest, validation and error envelope, body limits, helmet headers, CORS, rate limits, WebSocket protocol (replay, ping/pong, origin check, client cap, payload limit, heartbeat, shutdown), config parsing, classifier proxy and fallback |
| Frontend + shared | `frontend/src/**/*.test.ts(x)`, `shared/*.test.ts` | `npm test --prefix frontend` | Simulation invariants (determinism, totals, time of day, event generation), city and program registries, keyword classifier, in-browser data source, real-data loader (fetch, zod validation, caching), choropleth scaling, colour and heat-ramp helpers, formatting, key components |
| End-to-end | `frontend/e2e/` | `npm run test:e2e` | Real Chromium against a production build: globe and imagery load without console errors, layer/style switching and deep links, analytics and city details, keyboard controls, axe accessibility scan, reduced motion, phone layout and touch-target sizes; `realdata.spec.ts` switches to the real layers, opens the Real data tab and the country card and checks the provenance labels against the committed snapshots |
| Classifier | `ai-classifier/tests/` | `npm run classifier:test` | API shapes and validation limits, batch ordering, CORS, cross-validated accuracy floor, determinism, unseen prompts per label, training-data checks |
| Data pipeline | `data-pipeline/test/` | `npm run data:test` | CSV/TSV parsing and streaming against recorded fixtures (`test/fixtures/`), the offline geocoder, per-source extraction and aggregation (Anthropic, Wikipedia, GitHub, PyPI, activity series), manifest status rules (`ok`, `stale`, `failed`, `not_configured`, kept-when-skipped), snapshot validation. No network access |

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

**The Real data layers are greyed out or the analytics tab says "snapshots unavailable".**
The browser could not fetch or validate `data/real/manifest.json`. Check that `data/real/` exists
at the repository root (the Vite plugin serves it from there) and run `npm run data:validate`;
a file that fails the shared schema is reported with its path. A layer that shows "not
configured" is the PyPI layer without BigQuery credentials, which is expected.

**The first pipeline run is slow or seems stuck on `anthropic`.**
The Anthropic Economic Index CSV is about 219 MB. It is streamed line by line (a few kilobytes of
memory) and processed once per release; afterwards the run only compares the file's Hugging Face
object id and reuses the cached extraction in `.pipeline-state.json`. How long the first run
takes depends on your connection; use `--only wikipedia,github` while working on other sources.

**`github: FAILED ... GITHUB_TOKEN is not set`, `HTTP 401` or `HTTP 403`.**
The source refuses to run without `GITHUB_TOKEN`; 401 means the token is invalid or expired, and
403 with `Retry-After` is GitHub's secondary rate limit, which the client waits for
automatically. The source logs a warning when fewer than 100 GraphQL points remain; the limit
resets hourly. In every case the previous `developer-cities.json` is kept.

**`wikipedia: FAILED ... HTTP 403` or `429`.**
Wikimedia's APIs require a descriptive `User-Agent` with a contact address
([policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy))
and throttle bursts. The pipeline sends one and retries with backoff; if you changed
`USER_AGENT` in `data-pipeline/src/lib/http.ts`, keep a contact URL or e-mail in it. Only the
missing days of the country dataset are fetched, so a retry a minute later is cheap.

**`pypi` reports `not_configured`.**
Expected without `BIGQUERY_PROJECT` and credentials; the SDK downloads layer is disabled and
everything else works. The setup steps are in `data/real/README.md`.
