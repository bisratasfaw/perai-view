# Copilot instructions for PerAI View

PerAI View is an interactive 3D globe of **simulated** AI-assistant activity. There is no
database, no authentication and no real user data. Never add code that collects, stores or
displays real usage data.

## Layout

- `shared/`: plain TypeScript used by both apps (no package.json). `simulation.ts` is the single
  source of every number; `programs.ts` and `cities.ts` hold the registries; `classify.ts` is the
  keyword fallback classifier. Keep it deterministic and free of Node- or browser-only APIs.
- `frontend/`: React 18, TypeScript, Vite, CesiumJS, Zustand. The globe lives in
  `src/globe/engine.ts` (imperative Cesium code, no React). Data comes through the `DataSource`
  interface in `src/data/`: `localSource.ts` runs the simulation in the browser,
  `apiSource.ts` uses the backend. UI state and URL deep links are in `src/store.ts`.
- `backend/`: Express 5 read-only API and WebSocket feed. Validate all input with zod
  (`parseInput`), return errors as `{ error: { code, message, details? } }`, and add tests in
  `backend/test/` with supertest.
- `ai-classifier/`: FastAPI + scikit-learn service. Activity-type ids must match
  `ACTIVITY_TYPES` in `shared/programs.ts`.

## Conventions

- TypeScript strict mode; no `any` without a reason in a comment.
- Map colours: only ChatGPT, Gemini and Claude have their own hue; everything else uses the shared
  "Other" colour so the palette stays colour-blind safe. Do not add hues without re-validating.
- Respect `prefers-reduced-motion` and keep controls keyboard-accessible with ARIA labels.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Commands (from the repository root)

```bash
npm run setup        # install frontend and backend dependencies
npm run dev          # backend :4000 + frontend :5173
npm run lint && npm run typecheck && npm test
npm run test:e2e     # Playwright
npm run classifier:test
```

See `docs/DEVELOPMENT.md` and `docs/ARCHITECTURE.md` for details.
