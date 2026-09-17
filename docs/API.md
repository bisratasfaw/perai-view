# API reference

PerAI View has two HTTP services:

- **Backend API** (`backend/`, port 4000): read-only REST endpoints and a WebSocket feed over the
  shared simulation, plus one `POST` endpoint that classifies text.
- **Classifier** (`ai-classifier/`, port 8000): the FastAPI model service the backend calls.
  Browsers never talk to it directly.

Every number these services return is **simulated**. There is no authentication because there
is no user data. The example responses below were captured from a local run and shortened.

## Backend API

Base URL: `http://localhost:4000/api` in development, `/api` behind the Docker nginx proxy.

### Conventions

- JSON in and out. Request bodies are limited to **16 KB**.
- CORS: only origins listed in `CORS_ORIGINS` receive `Access-Control-Allow-Origin`. Allowed
  methods are `GET`, `HEAD` and `POST`; the only allowed request header is `Content-Type`.
  Requests without an `Origin` header (curl, server-to-server) are not affected.
- Security headers come from helmet with a JSON-only policy
  (`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; ...`), and
  `X-Powered-By` is removed.
- Query parameters are validated with zod. Unknown parameters are ignored.
- Timestamps are ISO 8601 strings in UTC. Responses that describe simulated data include
  `"simulated": true`.

### Rate limits

| Scope | Default limit | Variable |
| --- | --- | --- |
| All routes except `GET /api/health` | 300 requests per IP per 15 minutes | `RATE_LIMIT_MAX` |
| `POST /api/classify` (in addition to the above) | 30 requests per IP per minute | `CLASSIFY_RATE_LIMIT_MAX` |

Responses carry the IETF draft `RateLimit` and `RateLimit-Policy` headers, for example
`RateLimit: "general"; r=280; t=468`. When a limit is exceeded the API answers `429` with a
`Retry-After` header and the standard error body. Behind a reverse proxy, set `TRUST_PROXY` so
limits apply to the real client IP. WebSocket connections are not rate limited; they are capped at
`WS_MAX_CLIENTS` in total and `WS_MAX_CLIENTS_PER_IP` per client IP instead.

### Errors

Every error uses the same envelope:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Invalid query parameters",
    "details": [{ "path": ["limit"], "code": "too_big", "message": "Too big: expected number to be <=100" }]
  }
}
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `bad_request` | Invalid query or body (`details` lists each problem), malformed JSON (`"Malformed JSON body"`) |
| 404 | `not_found` | Unknown route or method, unknown program, activity or city |
| 413 | `payload_too_large` | Body over 16 KB |
| 429 | `rate_limited` | Rate limit exceeded |
| 500 | `internal` | Unexpected error. Stack traces are included in `details` only when `NODE_ENV=development` and `EXPOSE_ERROR_DETAILS=true` |

### Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | [`/api/health`](#get-apihealth) | Liveness and versions |
| `GET` | [`/api/programs`](#get-apiprograms) | All simulated AI assistants |
| `GET` | [`/api/programs/:id`](#get-apiprogramsid) | One assistant |
| `GET` | [`/api/activities`](#get-apiactivities) | Most recent live events |
| `GET` | [`/api/activities/:id`](#get-apiactivitiesid) | One recent event |
| `GET` | [`/api/analytics/global`](#get-apianalyticsglobal) | 24-hour global totals and rankings |
| `GET` | [`/api/analytics/trends`](#get-apianalyticstrends) | Hourly activity for the last N hours |
| `GET` | [`/api/analytics/regional`](#get-apianalyticsregional) | Statistics for one city |
| `GET` | [`/api/analytics/heatmap`](#get-apianalyticsheatmap) | Current intensity of every city as GeoJSON |
| `POST` | [`/api/classify`](#post-apiclassify) | Classify a prompt into an activity type |
| WS | [`/api/ws/activities`](#websocket-apiwsactivities) | Live event stream |

#### `GET /api/health`

Not rate limited. `Cache-Control: no-store`.

```json
{ "status": "ok", "version": "2.0.0", "simulation_version": "2.0.0", "uptime_seconds": 561, "simulated": true }
```

#### `GET /api/programs`

```json
{
  "data": [
    {
      "id": "chatgpt",
      "name": "ChatGPT",
      "provider": "OpenAI",
      "share": 32,
      "color": "#199e70",
      "highlighted": true,
      "activityMix": { "conversation": 26, "writing": 22, "coding": 16, "summarization": 12, "research": 10, "image_generation": 8, "translation": 6 }
    }
  ]
}
```

Program ids: `chatgpt`, `gemini`, `claude`, `copilot`, `midjourney`, `mistral`, `llama`,
`perplexity`, `other`. `share` is a relative weight, not measured market share. Only the three
`highlighted` assistants have their own map `color`; the rest share the neutral "Other" colour.

#### `GET /api/programs/:id`

Returns a single program object (not wrapped in `data`), or `404 not_found`.

#### `GET /api/activities`

The server generates one simulated event every 3 seconds and keeps the latest 200 in memory.
`Cache-Control: no-store`.

| Query | Type | Default | Notes |
| --- | --- | --- | --- |
| `limit` | integer 1-100 | 20 | |
| `program` | program id | | Exact id, see above |
| `country` | ISO 3166-1 alpha-2 | | Case-insensitive, for example `us` |

```json
{
  "data": [
    {
      "id": "mu5hsu54-5o-3s72",
      "program_id": "mistral",
      "program_name": "Mistral",
      "city": "Paris",
      "country": "FR",
      "country_name": "France",
      "latitude": 48.8394,
      "longitude": 2.4522,
      "activity_type": "coding",
      "duration_seconds": 518,
      "created_at": "2026-09-17T12:15:09.976Z"
    }
  ],
  "total": 200
}
```

Events are newest first. `total` is the number of buffered events that match the filters.
Coordinates are jittered slightly around the city centre. `activity_type` is one of
`conversation`, `writing`, `coding`, `image_generation`, `summarization`, `translation`, `research`.

#### `GET /api/activities/:id`

Returns one activity object, or `404` with
`"Activity not found (only the most recent events are kept)"`.

#### `GET /api/analytics/global`

Totals for the last 24 hours, computed from each city's time-of-day curve.

```json
{
  "total_activities_24h": 25006560,
  "active_users_24h": 7752034,
  "total_programs": 9,
  "active_cities": 241,
  "active_countries": 185,
  "top_programs": [
    { "program_id": "chatgpt", "program_name": "ChatGPT", "activity_count": 10315774, "percentage": 41.3 }
  ],
  "top_regions": [
    { "city": "San Francisco", "country": "US", "country_name": "United States", "latitude": 37.7749, "longitude": -122.4194, "activity_count": 314938 }
  ],
  "activity_by_type": [{ "type": "coding", "label": "Coding", "count": 6070030 }],
  "timestamp": "2026-09-17T12:15:13.100Z",
  "simulated": true
}
```

`top_programs` contains all nine assistants sorted by count, `top_regions` the ten busiest
cities, and `activity_by_type` all seven types sorted by count. A small per-minute noise factor
(up to ±1.5%) keeps the totals from looking frozen.

#### `GET /api/analytics/trends`

| Query | Type | Default |
| --- | --- | --- |
| `hours` | integer 1-72 | 24 |

Returns one point per complete hour, oldest first:

```json
{
  "interval": "hour",
  "data": [
    { "timestamp": "2026-09-17T10:00:00.000Z", "activity_count": 1272496, "unique_users": 749500 },
    { "timestamp": "2026-09-17T11:00:00.000Z", "activity_count": 1315630, "unique_users": 774906 }
  ]
}
```

#### `GET /api/analytics/regional`

| Query | Type | Notes |
| --- | --- | --- |
| `city` | string, 1-100 characters, required | Case-insensitive exact city name, for example `tokyo` or `São Paulo` |

```json
{
  "region": { "city": "Tokyo", "country": "JP", "country_name": "Japan", "latitude": 35.6762, "longitude": 139.6503 },
  "statistics": {
    "activity_24h": 292891,
    "active_users_24h": 90796,
    "leading_program": "chatgpt",
    "top_activity_type": "conversation",
    "local_hour": 21.6,
    "current_intensity": 0.415
  },
  "timestamp": "2026-09-17T12:15:13.625Z",
  "simulated": true
}
```

`local_hour` is solar time from the city's longitude (0-24). `current_intensity` (0-1) is the
city's activity right now relative to the busiest possible city at its daily peak. A missing
`city` returns `400`; an unknown one returns `404 "City not found in the simulation"`.

#### `GET /api/analytics/heatmap`

A GeoJSON `FeatureCollection` with one `Point` feature per city (241), used by the globe layers:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "city": "San Francisco", "country": "US", "activity_24h": 314938, "intensity": 0.145 },
      "geometry": { "type": "Point", "coordinates": [-122.4194, 37.7749] }
    }
  ],
  "simulated": true
}
```

#### `POST /api/classify`

Classifies a prompt someone might send to an AI assistant. In API mode the web app's **Try the
activity classifier** box (in the About dialog) calls this endpoint; the static demo runs the same
keyword fallback in the browser instead. Either way the UI shows which classifier answered.

Request body: `{ "text": "..." }`, 1-2000 characters after trimming. A body sent with a
non-JSON content type is treated as missing and returns `400`.

```bash
curl -s -X POST http://localhost:4000/api/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "Fix this Python bug in my function"}'
```

```json
{
  "activity_type": "coding",
  "confidence": 0.9732,
  "scores": { "conversation": 0.0034, "writing": 0.0032, "coding": 0.9732, "image_generation": 0.0022, "summarization": 0.0109, "translation": 0.0046, "research": 0.0024 },
  "model_version": "tfidf-logreg-63b9d6cc",
  "source": "model"
}
```

The same request with the classifier stopped:

```json
{
  "activity_type": "coding",
  "confidence": 0.727,
  "scores": { "conversation": 0.045, "writing": 0.045, "coding": 0.727, "image_generation": 0.045, "summarization": 0.045, "translation": 0.045, "research": 0.045 },
  "model_version": "keywords-1",
  "source": "keyword-fallback"
}
```

How the backend answers:

1. If a classifier URL is configured (`AI_CLASSIFIER_URL`, which defaults to
   `http://127.0.0.1:8000` outside production), it forwards the trimmed text to `<url>/classify`
   with a 2.5-second timeout, refuses redirects and responses over 64 KB, and validates the
   response shape with zod.
2. If the classifier is not configured, unreachable, slow, returns an error or returns an
   unexpected shape, the backend answers with the shared keyword classifier instead. Those
   responses have `"source": "keyword-fallback"` and `"model_version": "keywords-1"`.

`scores` always contains all seven activity types and `confidence` equals the score of
`activity_type`.

### WebSocket: `/api/ws/activities`

A push-only stream of the same events as `GET /api/activities`.

```js
const socket = new WebSocket('ws://localhost:4000/api/ws/activities')
socket.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.type === 'activity') console.log(message.data.city, message.data.program_name)
}
```

**Server to client**

| `type` | `data` | When |
| --- | --- | --- |
| `hello` | `{ "simulated": true, "interval_ms": 3000, "version": "2.0.0" }` | Immediately after connecting |
| `activity` | an activity object (see `GET /api/activities`) | First a replay of up to 5 recent events, oldest first, then every new event |
| `pong` | none | In reply to a client `ping` |

**Client to server**

| Message | Effect |
| --- | --- |
| `{"type":"ping"}` | The server answers `{"type":"pong"}` |
| anything else | Ignored (including binary frames and invalid JSON) |

**Limits and behaviour**

- The handshake is checked before upgrading: wrong path `404`, `Origin` header present but not in
  `CORS_ORIGINS` `403`, already `WS_MAX_CLIENTS_PER_IP` connections from the same client IP `429`,
  `WS_MAX_CLIENTS` clients in total or server shutting down `503`, unparseable URL `400`. The client
  IP is derived like the HTTP rate limiter's (honouring `TRUST_PROXY`; IPv6 grouped by /56). Clients that send no `Origin` header (non-browser clients) are accepted.
- Frames over 1 KB close the connection with code `1009`.
- The server sends a protocol-level ping every 30 seconds and terminates clients that did not
  answer the previous one. Browsers answer automatically.
- Clients with more than 256 KB of unsent data are dropped instead of buffering without limit.
- On shutdown every client is closed with code `1001`.
- Per-message compression is disabled.

## Classifier service

The FastAPI service in `ai-classifier/` (see its [README](../ai-classifier/README.md) for the
model and its limitations). Interactive OpenAPI docs are served at `/docs` when it runs.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/health` | | `{ "status": "ok", "model_version", "labels" }` |
| `GET` | `/model-info` | | `{ "model_version", "algorithm", "labels", "training_examples", "cv_accuracy", "cv_folds" }` |
| `POST` | `/classify` | `{ "text" }`, 1-2000 characters after trimming | `{ "activity_type", "confidence", "scores", "model_version", "source": "model" }` |
| `POST` | `/batch-classify` | `{ "items": [{ "text" }] }`, 1-100 items | `{ "results": [...] }` in input order |

Invalid input returns `422` with FastAPI's standard validation body, for example
`{"detail":[{"type":"string_too_short","loc":["body","text"],"msg":"String should have at least 1 character",...}]}`.
`GET /model-info` currently reports `training_examples: 350`, `cv_folds: 5` and
`cv_accuracy: 0.8514`. CORS allows `GET` and `POST` from the origins in
the classifier's `CORS_ORIGINS`, without credentials. The service has no rate limiting of its own,
so keep it on a private network and expose it only through the backend.
