# Real-data snapshots

JSON snapshots of free public data about AI-assistant usage, written by `data-pipeline/`
and read by the frontend. Every file validates against the zod schemas in
`shared/realData.ts`; `manifest.json` records, per source, when it was fetched, how current
the data is, its licence and any caveats. Numbers here are measurements from third parties,
not the simulation.

| File | What it is | Source | Licence | Refresh |
| --- | --- | --- | --- | --- |
| `manifest.json` | Status (`ok`, `stale`, `not_configured`, `failed`), `fetched_at`, `as_of`, error and notes for each source | pipeline | - | every run |
| `countries.json` | Every country with an ISO numeric code: alpha-2, name, `ccn3` (matches world-atlas `countries-110m` feature ids) and a centroid | [world-countries](https://www.npmjs.com/package/world-countries) npm package (mledoze/countries) | ODbL 1.0 | every run (no network) |
| `ai-usage-by-country.json` | Claude.ai usage share by country and US state for the latest month, plus the per-capita usage index | [Anthropic Economic Index](https://huggingface.co/datasets/Anthropic/EconomicIndex) on Hugging Face (newest `release_*/data/aei_claude_ai_*.csv`) | CC-BY per the release documentation; dataset card says MIT | nightly check; the 219 MB CSV is only streamed when its Hugging Face object id changes |
| `activity-types.json` | "What people use ChatGPT for" (share of consumer messages by topic, July 2025 vs July 2024) and "What people use Claude for" (global share of Claude.ai conversations by major request topic, latest month vs previous) | Chatterji et al., [How People Use ChatGPT](https://www.nber.org/papers/w34255) (NBER WP 34255, transcribed from the Figure 7 discussion; no dataset exists) and the Anthropic Economic Index | Quoted figures / CC-BY | ChatGPT series is static; Claude series follows the Anthropic release |
| `wikipedia-interest.json` | Daily human pageviews of each assistant's Wikipedia article summed across all language editions for the last 30 full days, plus per-country sums | [Wikimedia Pageviews REST API](https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews) (articles found through Wikidata sitelinks) and the differentially private [country_project_page](https://analytics.wikimedia.org/published/datasets/country_project_page/) dataset | CC0 (Wikimedia Analytics datasets) | nightly; only new days of the country dataset are downloaded |
| `sdk-downloads-by-country.json` | Downloads of the `openai`, `anthropic`, `google-genai` and `mistralai` Python packages by country over the last 7 complete days | BigQuery public dataset `bigquery-public-data.pypi.file_downloads` | PyPI download statistics (public dataset) | weekly (Mondays) or on demand; `status: "not_configured"` until BigQuery credentials exist |
| `developer-cities.json` | Self-reported profile locations of people who forked the official OpenAI, Anthropic, Google Gemini, Mistral and Meta Llama SDK repositories, geocoded offline to the globe's cities and to countries | GitHub GraphQL API (`forks` connection, newest 6,000 per repository) | Public profile data via the GitHub API; only aggregated counts are stored | nightly |
| `.pipeline-state.json` | Cache, not data: Hugging Face object ids, per-day country sums, freshness dates | pipeline | - | every run |

## Reading the files

- Assistant ids (`chatgpt`, `claude`, ...) are the `ProgramId`s from `shared/programs.ts`.
  Sources about SDKs or companies (PyPI packages, GitHub repositories, the Mistral and
  Perplexity Wikipedia articles) describe the vendor, so show the `vendor` label rather than the
  product name. `other` never appears in counts.
- Count maps (`views`, `counts`) only list assistants with a value greater than zero; a missing
  key means zero.
- `wikipedia-interest.json` `by_country` is a lower bound: Wikimedia only publishes
  page/country/day cells above a privacy threshold, so small countries are missing rather than
  zero. `by_country_note` states how many of the 30 days were available.
- `ai-usage-by-country.json` only contains countries that met Anthropic's publication
  thresholds (about 120); `usage_tier` and `usage_count` are `null` in the 2026 releases.
- `developer-cities.json` `geocoding` reports which share of fork owners with a location string
  matched a globe city (`matched_city_pct`) or at least a country (`matched_country_pct`).
- A source with `status: "failed"` keeps its previous file; `stale` means the data is older
  than the source's cadence allows (45 days for rolling windows, 120 days for the quarterly
  Anthropic releases; the static ChatGPT transcription never goes stale).

## Running the pipeline

```sh
cd data-pipeline
npm ci
GITHUB_TOKEN=$(gh auth token) npm run refresh            # all sources
npm run refresh -- --only wikipedia,github               # a subset
npm run refresh -- --force                               # ignore the object-id and per-day caches
npm run validate                                         # parse every file against the schemas
```

Sources run independently; a failure keeps the previous file and is recorded in
`manifest.json`. The exit code is 1 only when a produced file fails validation or when no
source succeeded.

Environment:

- `GITHUB_TOKEN`: required for `developer-cities.json` (GraphQL needs authentication).
- `BIGQUERY_PROJECT` plus `GCP_SERVICE_ACCOUNT_KEY` (JSON string) or
  `GOOGLE_APPLICATION_CREDENTIALS` (path): optional, for `sdk-downloads-by-country.json`.
  Setup: create a Google Cloud project, open BigQuery and accept the free sandbox (no billing
  account, 1 TB of queries per month), create a service account with the BigQuery Job User role,
  download a JSON key, add the two repository secrets. The query scans tens of GB, so the
  workflow runs it only on Mondays or when dispatched with `force_pypi`.

The GitHub Actions workflow `.github/workflows/refresh-data.yml` runs every night at 04:15 UTC
and commits `data/real/**` as `github-actions[bot]` when anything changed.
