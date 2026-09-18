# Contributing to PerAI View

Thanks for your interest. Bug reports, fixes, tests, documentation and accessibility improvements
are all welcome.

One ground rule: PerAI View shows a **simulation** and **published, aggregated datasets**, each
labelled as such. Changes that collect, store or display data about individual people, or that
blur which numbers are simulated and which are measured, will not be accepted. A new real-data
source must be free to use, carry a licence the UI can show, and go through the pipeline with a
schema in `shared/realData.ts`.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Security problems go through a private advisory, not an issue. See [SECURITY.md](SECURITY.md).
- Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Set up

The full guide, with environment variables and troubleshooting, is
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). The short version, using the
[GitHub CLI](https://cli.github.com/) to fork and clone:

```bash
gh repo fork bisratasfaw/perai-view --clone
cd perai-view
npm install          # root tooling
npm run setup        # frontend and backend dependencies
npm run dev          # API on http://localhost:4000, app on http://localhost:5173
```

Without the GitHub CLI, fork the repository on github.com and `git clone` your fork.

Optional pieces:

```bash
npm run classifier:setup                       # Python venv for ai-classifier (Python 3.11-3.13)
cd frontend && npx playwright install chromium # browser for end-to-end tests
npm ci --prefix data-pipeline                  # only if you work on the real-data pipeline
```

## Make a change

1. Create a branch from `main`, for example `git checkout -b fix/city-card-focus`.
2. Keep the change focused. Add or update tests for new behaviour.
3. Update the docs when you change behaviour, endpoints, environment variables or scripts.
4. Run the checks below.
5. Open a pull request and fill in the template.

Where things live:

| Change | Location | Notes |
| --- | --- | --- |
| Simulation, cities, assistants | `shared/` | Keep it deterministic and free of browser- or Node-only APIs; both apps import it. Add tests in `shared/*.test.ts`. |
| UI and globe | `frontend/src/` | Cesium code stays in `globe/engine.ts`; React talks to it through its methods. Respect reduced motion and keep controls keyboard-accessible. |
| API and WebSocket | `backend/src/` | Validate input with zod, return the standard error envelope, add supertest tests in `backend/test/`. |
| Classifier | `ai-classifier/` | Activity-type ids must match `shared/programs.ts`. Changing the training data changes `model_version`. |
| Real-data pipeline | `data-pipeline/src/` | One fetcher per source in `sources/`; declare provenance in its `meta`, return data that parses with `shared/realData.ts`, and add tests with recorded fixtures in `data-pipeline/test/` (no network in tests). Changing a schema means changing it for both the pipeline and the UI. |
| Snapshots | `data/real/` | Written by the pipeline and the nightly workflow only; never hand-edit them. If a snapshot needs to change, fix the fetcher and re-run `npm run data:refresh`. |

Map colours are deliberately limited to three assistant hues plus a neutral grey so they stay
distinguishable for colour-blind viewers. Please do not add hues without checking that.

## Run the checks

From the repository root:

```bash
npm run lint         # ESLint, backend and frontend, zero warnings
npm run typecheck    # tsc --noEmit, backend and frontend
npm test             # Vitest: backend, then frontend + shared
npm run test:e2e     # Playwright against a production build (needs port 4173 free)
```

Classifier, if you touched `ai-classifier/`:

```bash
npm run classifier:lint   # ruff check + ruff format --check
npm run classifier:test   # pytest
```

and, inside `ai-classifier/` with its virtual environment active, `pip-audit -r requirements.txt`
when you change dependencies.

Data pipeline, if you touched `data-pipeline/` or `shared/realData.ts`:

```bash
npm run data:test         # Vitest against recorded fixtures, no network
npm run data:validate     # every file in data/real must still parse with the shared schemas
cd data-pipeline && npm run lint && npm run typecheck
```

Individual suites can also run on their own, for example `npm test --prefix backend` or, inside
`frontend/`, `npx vitest run src/globe` and `npx playwright test e2e/realdata.spec.ts`.

CI runs all of these on every pull request, plus a Docker Compose build and smoke test. The
`data-pipeline` job also validates the committed snapshots in `data/real/`, so a schema change
that the existing files no longer satisfy fails CI until the snapshots are regenerated (run the
pipeline locally and commit the result, or let the nightly workflow do it after the merge if the
change is backwards compatible).

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <summary in the imperative mood>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `style`, `build`, `ci`, `chore`.
Scopes: `frontend`, `globe`, `backend`, `shared`, `classifier`, `pipeline`, `data`, `docker`,
`docs`, `deps`.

Examples:

```
feat(frontend): add a time slider to replay the last 24 hours
fix(globe): keep the selected city highlighted after switching layers
docs: explain VITE_SITE_URL for GitHub Pages
test(shared): cover midnight wrap-around in the daily curve
```

Give the pull request title the same format; it becomes the commit message if the pull request is
squash-merged.

## Reporting bugs and requesting features

Use the issue templates. For globe problems, include your browser, operating system and graphics
card, and a link with the query string that reproduces the view (for example
`?layer=heat&theme=cyber&city=Tokyo`).
