# Training data

`training.jsonl` holds **synthetic, hand-written example prompts** created for this
portfolio demo. They are not collected from real users, contain no personal data and are
not a representative sample of real AI-assistant traffic.

Each line is one JSON object:

```json
{"text": "Translate 'Where is the train station?' into Spanish", "label": "translation"}
```

| label | what it covers |
| --- | --- |
| `conversation` | small talk, personal advice, opinions, jokes, venting |
| `writing` | emails, essays, stories, poems, marketing copy, editing prose |
| `coding` | writing, explaining, debugging or reviewing code and dev tooling |
| `image_generation` | requests to draw, paint, render or design an image |
| `summarization` | condensing a given text, transcript or document |
| `translation` | translating or explaining words and text between languages |
| `research` | factual, scientific, historical or market questions |

There are 50 prompts per label (350 total), of mixed length and phrasing. A few are
deliberately ambiguous (for example "Summarize the key points of the Paris Agreement" or
"Compare PostgreSQL and MongoDB for a large analytics workload") so the cross-validated
accuracy stays honest rather than perfect.

Changing this file changes the `model_version` reported by the API
(`tfidf-logreg-<first 8 hex chars of a SHA-256 over the rows>`).
