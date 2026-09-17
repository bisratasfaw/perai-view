"""Prompt -> activity-type classifier.

A deliberately small, fully reproducible text classifier:

    FeatureUnion(word TF-IDF 1-2 grams, char_wb TF-IDF 3-5 grams) -> LogisticRegression

It is trained from ``app/data/training.jsonl`` when the service starts (a few hundred
rows; training plus cross-validation takes one to two seconds) and evaluated once with
stratified k-fold cross-validation so ``/model-info`` can report an honest accuracy
estimate. The same data and code always produce the same model and the same scores.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import FeatureUnion, Pipeline

# Shared with the backend and frontend - do not rename.
LABELS: Final[tuple[str, ...]] = (
    "conversation",
    "writing",
    "coding",
    "image_generation",
    "summarization",
    "translation",
    "research",
)

DEFAULT_TRAINING_DATA: Final[Path] = Path(__file__).parent / "data" / "training.jsonl"
ALGORITHM: Final[str] = (
    "TF-IDF (word 1-2 grams + char_wb 3-5 grams, sublinear tf) + LogisticRegression"
)
RANDOM_STATE: Final[int] = 42
CV_FOLDS: Final[int] = 5
SCORE_DECIMALS: Final[int] = 4


@dataclass(frozen=True, slots=True)
class TrainingExample:
    text: str
    label: str


@dataclass(frozen=True, slots=True)
class Prediction:
    activity_type: str
    confidence: float
    scores: dict[str, float]


def load_training_data(path: Path = DEFAULT_TRAINING_DATA) -> list[TrainingExample]:
    """Read and validate the JSONL training file (one ``{"text", "label"}`` object per line)."""
    examples: list[TrainingExample] = []
    with path.open(encoding="utf-8") as fh:
        for line_no, raw in enumerate(fh, start=1):
            line = raw.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path.name}:{line_no}: invalid JSON ({exc.msg})") from exc
            if not isinstance(row, dict):
                raise ValueError(f"{path.name}:{line_no}: expected a JSON object")
            text, label = row.get("text"), row.get("label")
            if not isinstance(text, str) or not text.strip():
                raise ValueError(f"{path.name}:{line_no}: 'text' must be a non-empty string")
            if label not in LABELS:
                raise ValueError(f"{path.name}:{line_no}: unknown label {label!r}")
            examples.append(TrainingExample(text=text.strip(), label=label))

    counts = Counter(example.label for example in examples)
    missing = [label for label in LABELS if counts[label] < CV_FOLDS]
    if missing:
        raise ValueError(
            f"{path.name}: every label needs at least {CV_FOLDS} examples; too few for {missing}"
        )
    return examples


def training_data_fingerprint(examples: Sequence[TrainingExample]) -> str:
    """Short content hash of the training set (stable across line endings / whitespace)."""
    digest = hashlib.sha256()
    for example in examples:
        digest.update(json.dumps([example.text, example.label], ensure_ascii=False).encode())
        digest.update(b"\n")
    return digest.hexdigest()[:8]


def build_pipeline() -> Pipeline:
    """Unfitted scikit-learn pipeline. Deterministic: fixed random_state, no parallelism."""
    features = FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=(1, 2),
                    lowercase=True,
                    sublinear_tf=True,
                    # The default pattern drops 1-char tokens; keep them ("C", "R").
                    token_pattern=r"(?u)\b\w+\b",  # noqa: S106 (a regex, not a password)
                ),
            ),
            (
                "char",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    lowercase=True,
                    sublinear_tf=True,
                ),
            ),
        ]
    )
    classifier = LogisticRegression(
        C=10.0, solver="newton-cg", max_iter=5000, random_state=RANDOM_STATE
    )
    return Pipeline([("features", features), ("classifier", classifier)])


class ActivityClassifier:
    """A trained pipeline plus the metadata exposed by the API."""

    labels: Final[tuple[str, ...]] = LABELS
    algorithm: Final[str] = ALGORITHM

    def __init__(
        self,
        pipeline: Pipeline,
        *,
        model_version: str,
        training_examples: int,
        cv_accuracy: float,
        cv_folds: int,
    ) -> None:
        classes = [str(label) for label in pipeline.classes_]
        if sorted(classes) != sorted(LABELS):
            raise ValueError(f"pipeline classes {classes} do not match {list(LABELS)}")
        self._pipeline = pipeline
        # Column index of each label in predict_proba output (sklearn sorts classes_).
        self._columns = [classes.index(label) for label in LABELS]
        self.model_version = model_version
        self.training_examples = training_examples
        self.cv_accuracy = cv_accuracy
        self.cv_folds = cv_folds

    @classmethod
    def train(
        cls, data_path: Path = DEFAULT_TRAINING_DATA, *, cv_folds: int = CV_FOLDS
    ) -> ActivityClassifier:
        examples = load_training_data(data_path)
        texts = [example.text for example in examples]
        targets = [example.label for example in examples]

        folds = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=RANDOM_STATE)
        fold_scores = cross_val_score(build_pipeline(), texts, targets, cv=folds)

        pipeline = build_pipeline().fit(texts, targets)
        return cls(
            pipeline,
            model_version=f"tfidf-logreg-{training_data_fingerprint(examples)}",
            training_examples=len(examples),
            cv_accuracy=round(float(np.mean(fold_scores)), SCORE_DECIMALS),
            cv_folds=cv_folds,
        )

    def predict_many(self, texts: Sequence[str]) -> list[Prediction]:
        if not texts:
            return []
        probabilities = self._pipeline.predict_proba(list(texts))[:, self._columns]
        predictions: list[Prediction] = []
        for row in probabilities:
            best = int(np.argmax(row))  # ties resolve to the first label in LABELS order
            scores = {
                label: round(float(p), SCORE_DECIMALS) for label, p in zip(LABELS, row, strict=True)
            }
            predictions.append(
                Prediction(
                    activity_type=LABELS[best],
                    confidence=scores[LABELS[best]],
                    scores=scores,
                )
            )
        return predictions

    def predict(self, text: str) -> Prediction:
        return self.predict_many([text])[0]
