import math
import re
import typing
from collections import Counter
from pathlib import Path

import pytest

from app.model import (
    LABELS,
    ActivityClassifier,
    TrainingExample,
    load_training_data,
    training_data_fingerprint,
)
from app.schemas import ActivityType
from tests.prompts import UNSEEN_PROMPTS


def test_labels_match_api_schema() -> None:
    assert tuple(typing.get_args(ActivityType)) == LABELS


def test_training_data_is_balanced_and_clean() -> None:
    examples = load_training_data()
    counts = Counter(example.label for example in examples)

    assert set(counts) == set(LABELS)
    assert all(counts[label] >= 45 for label in LABELS), counts
    assert len(examples) >= 315
    texts = [example.text.lower() for example in examples]
    assert len(texts) == len(set(texts)), "duplicate prompts in training data"


def test_unseen_prompts_are_not_in_training_data() -> None:
    training_texts = {example.text.strip().lower() for example in load_training_data()}
    for prompts in UNSEEN_PROMPTS.values():
        for prompt in prompts:
            assert prompt.strip().lower() not in training_texts, prompt


def test_cross_validated_accuracy(classifier: ActivityClassifier) -> None:
    assert classifier.cv_folds == 5
    assert classifier.cv_accuracy >= 0.80
    assert classifier.training_examples == len(load_training_data())


def test_model_version_format(classifier: ActivityClassifier) -> None:
    assert re.fullmatch(r"tfidf-logreg-[0-9a-f]{8}", classifier.model_version)


@pytest.mark.parametrize(
    ("expected", "prompt"),
    [(label, prompt) for label, prompts in UNSEEN_PROMPTS.items() for prompt in prompts],
)
def test_classifies_unseen_prompts(
    classifier: ActivityClassifier, expected: str, prompt: str
) -> None:
    assert classifier.predict(prompt).activity_type == expected


def test_scores_are_a_probability_distribution(classifier: ActivityClassifier) -> None:
    prediction = classifier.predict("Could you turn this press release into three bullet points?")

    assert list(prediction.scores) == list(LABELS)
    assert all(0.0 <= score <= 1.0 for score in prediction.scores.values())
    assert math.isclose(sum(prediction.scores.values()), 1.0, abs_tol=1e-3)
    assert prediction.confidence == max(prediction.scores.values())
    assert prediction.scores[prediction.activity_type] == prediction.confidence


def test_predict_many_matches_predict(classifier: ActivityClassifier) -> None:
    prompts = [prompts[0] for prompts in UNSEEN_PROMPTS.values()]
    assert classifier.predict_many(prompts) == [classifier.predict(p) for p in prompts]
    assert classifier.predict_many([]) == []


def test_training_is_deterministic(classifier: ActivityClassifier) -> None:
    retrained = ActivityClassifier.train()
    prompt = "Explain how photosynthesis works and cite a few sources"

    assert retrained.model_version == classifier.model_version
    assert retrained.cv_accuracy == classifier.cv_accuracy
    assert retrained.predict(prompt) == classifier.predict(prompt)


def test_model_version_tracks_training_data(classifier: ActivityClassifier) -> None:
    examples = load_training_data()
    fingerprint = training_data_fingerprint(examples)
    extra = TrainingExample(text="Paint a lighthouse in a storm", label="image_generation")

    assert classifier.model_version == f"tfidf-logreg-{fingerprint}"
    assert training_data_fingerprint([*examples, extra]) != fingerprint


@pytest.mark.parametrize(
    ("line", "message"),
    [
        ('{"text": "hello", "label": "chitchat"}', "unknown label"),
        ('{"text": "   ", "label": "conversation"}', "non-empty string"),
        ("not json", "invalid JSON"),
    ],
)
def test_load_training_data_rejects_bad_rows(tmp_path: Path, line: str, message: str) -> None:
    path = tmp_path / "training.jsonl"
    path.write_text(line + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        load_training_data(path)
