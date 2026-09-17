# PerAI View - Activity Classifier

A small FastAPI service with a real (if tiny) machine-learning model. It takes a short prompt
someone might send to an AI assistant and predicts which of seven **activity types** it is:

`conversation` · `writing` · `coding` · `image_generation` · `summarization` · `translation` · `research`

These ids are shared with the PerAI View backend and frontend.

## How the model works

- **Data:** [`app/data/training.jsonl`](app/data/training.jsonl) holds 350 synthetic,
  hand-written prompts (50 per label). See [`app/data/README.md`](app/data/README.md).
- **Features:** a scikit-learn `FeatureUnion` of word TF-IDF (1-2 grams) and character
  TF-IDF (`char_wb`, 3-5 grams), both with sublinear term frequency. Character n-grams help
  with typos, inflections and unseen words ("summarise", "TL;DR", "photorealistic").
- **Classifier:** multinomial `LogisticRegression` (`C=10`, `newton-cg`, fixed `random_state`).
  `predict_proba` gives a score for every label; the highest one is the `activity_type`.
- **Training:** happens in the FastAPI lifespan at startup - no pickled model files. It takes
  about 1.5-2 s including evaluation. The same data always yields the same model and scores.
- **Evaluation:** 5-fold stratified cross-validation runs once at startup and is exposed by
  `GET /model-info`.
- **Versioning:** `model_version` is `tfidf-logreg-<first 8 hex chars of a SHA-256 of the
  training rows>`, so any change to the data produces a new version string.

**Measured:** 5-fold CV accuracy **0.851** (`tfidf-logreg-63b9d6cc`). Per-label CV recall
ranges from 0.70 (`coding`, whose prompts share little vocabulary across languages and tools)
to 0.96 (`image_generation`).

## Limitations (honest ones)

- The training set is small, synthetic and written by one person; it is not real user traffic.
  CV accuracy on it says little about accuracy on real prompts.
- Seven fixed labels. Every input gets one of them - there is no "other" / out-of-domain class,
  so gibberish still receives a label (usually with low confidence).
- English only. Prompts written in other languages are not supported.
- Bag-of-n-grams features: no word order beyond bigrams, no semantics. Mixed intents
  ("summarize this and translate it to French") get a single label.
- `confidence` is the logistic-regression probability, not a calibrated guarantee.
- The service never stores or logs prompt text.

## Run locally

Requires Python 3.11-3.13.

```bash
cd ai-classifier
python -m venv .venv
# Windows: .venv\Scripts\activate   |   macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt

uvicorn app.main:app --port 8000        # or: python -m app.main  (uses HOST/PORT)
```

Open http://localhost:8000/docs for the interactive OpenAPI docs.

Configuration comes from environment variables (see [`.env.example`](.env.example)):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8000` | Port for `python -m app.main` (the Docker image always uses 8000) |
| `HOST` | `127.0.0.1` | Bind address for `python -m app.main` |
| `CORS_ORIGINS` | `http://localhost:4000,http://localhost:5173` | Comma-separated allowed origins |
| `LOG_LEVEL` | `INFO` | `CRITICAL` / `ERROR` / `WARNING` / `INFO` / `DEBUG` |

### Docker

```bash
docker build -t perai-classifier ./ai-classifier
docker run --rm -p 8000:8000 -e CORS_ORIGINS=http://localhost:5173 perai-classifier
```

The image is `python:3.12-slim`, runs as a non-root user, and has a `HEALTHCHECK` on `/health`.

## Test and lint

```bash
ruff check . && ruff format --check .
pytest -q
pip-audit -r requirements.txt
```

The tests cover response shapes, validation limits, batch ordering, CORS, CV accuracy
(>= 0.80), determinism across app instances, and at least three hand-written prompts per
label that are not in the training data.

## API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/health` | - | `{status: "ok", model_version, labels}` |
| `GET` | `/model-info` | - | `{model_version, algorithm, labels, training_examples, cv_accuracy, cv_folds}` |
| `POST` | `/classify` | `{text}` - 1-2000 chars after trimming | `{activity_type, confidence, scores, model_version, source: "model"}` |
| `POST` | `/batch-classify` | `{items: [{text}]}` - 1-100 items | `{results: [<classify response>, ...]}` in input order |

Invalid input (empty or whitespace-only text, over 2000 characters, wrong types, 0 or more than
100 batch items) returns `422` with FastAPI's standard error body.

Example:

```bash
curl -s -X POST http://localhost:8000/classify \
  -H "Content-Type: application/json" \
  -d '{"text": "Write a Python script that downloads every PDF linked on a web page"}'
```

```json
{
  "activity_type": "coding",
  "confidence": 0.7981,
  "scores": {
    "conversation": 0.0147, "writing": 0.1362, "coding": 0.7981, "image_generation": 0.0168,
    "summarization": 0.0162, "translation": 0.0063, "research": 0.0117
  },
  "model_version": "tfidf-logreg-63b9d6cc",
  "source": "model"
}
```

`scores` always contains all seven labels, rounded to 4 decimals (they sum to ~1), and
`confidence` equals the score of `activity_type`.

## Layout

```
app/
  main.py        FastAPI app factory (create_app) + module-level `app` for uvicorn
  model.py       data loading, pipeline, training, cross-validation, prediction
  schemas.py     pydantic v2 request/response models
  config.py      environment-based settings
  data/          training.jsonl + data card
tests/           pytest suite (API, model, config)
```
