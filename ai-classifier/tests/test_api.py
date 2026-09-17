import math
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.model import LABELS
from tests.conftest import TEST_SETTINGS
from tests.prompts import UNSEEN_PROMPTS


def assert_classification_shape(result: dict[str, Any], model_version: str) -> None:
    assert set(result) == {"activity_type", "confidence", "scores", "model_version", "source"}
    assert result["activity_type"] in LABELS
    assert result["source"] == "model"
    assert result["model_version"] == model_version
    assert list(result["scores"]) == list(LABELS)
    assert all(round(score, 4) == score for score in result["scores"].values())
    assert math.isclose(sum(result["scores"].values()), 1.0, abs_tol=1e-3)
    assert result["confidence"] == max(result["scores"].values())
    assert result["scores"][result["activity_type"]] == result["confidence"]


def test_health(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"status", "model_version", "labels"}
    assert body["status"] == "ok"
    assert body["model_version"].startswith("tfidf-logreg-")
    assert body["labels"] == list(LABELS)


def test_model_info(client: TestClient) -> None:
    response = client.get("/model-info")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "model_version",
        "algorithm",
        "labels",
        "training_examples",
        "cv_accuracy",
        "cv_folds",
    }
    assert body["model_version"] == client.get("/health").json()["model_version"]
    assert "LogisticRegression" in body["algorithm"]
    assert body["labels"] == list(LABELS)
    assert body["training_examples"] >= 315
    assert body["cv_folds"] == 5
    assert 0.80 <= body["cv_accuracy"] <= 1.0


@pytest.mark.parametrize(
    ("expected", "prompt"),
    [(label, prompts[0]) for label, prompts in UNSEEN_PROMPTS.items()],
)
def test_classify(client: TestClient, expected: str, prompt: str) -> None:
    response = client.post("/classify", json={"text": prompt})

    assert response.status_code == 200
    body = response.json()
    assert_classification_shape(body, client.get("/health").json()["model_version"])
    assert body["activity_type"] == expected


def test_classify_strips_whitespace(client: TestClient) -> None:
    padded = client.post("/classify", json={"text": "\n  Translate 'hello' into Dutch \t"})
    plain = client.post("/classify", json={"text": "Translate 'hello' into Dutch"})

    assert padded.status_code == 200
    assert padded.json() == plain.json()


def test_classify_accepts_max_length(client: TestClient) -> None:
    response = client.post("/classify", json={"text": "a" * 2000})
    assert response.status_code == 200


@pytest.mark.parametrize(
    "payload",
    [
        {"text": ""},
        {"text": "   \n\t "},
        {"text": "a" * 2001},
        {"text": 123},
        {"text": None},
        {"text": ["write a poem"]},
        {"prompt": "write a poem"},
        {},
        [],
    ],
    ids=[
        "empty",
        "whitespace",
        "too-long",
        "int",
        "null",
        "list",
        "wrong-field",
        "missing-field",
        "array-body",
    ],
)
def test_classify_validation_errors(client: TestClient, payload: object) -> None:
    assert client.post("/classify", json=payload).status_code == 422


def test_classify_rejects_non_json_body(client: TestClient) -> None:
    response = client.post(
        "/classify", content=b"write a poem", headers={"Content-Type": "text/plain"}
    )
    assert response.status_code == 422


def test_batch_classify_preserves_order(client: TestClient) -> None:
    expected = ["research", "coding", "translation", "image_generation", "summarization"]
    prompts = [UNSEEN_PROMPTS[label][1] for label in expected]

    response = client.post("/batch-classify", json={"items": [{"text": p} for p in prompts]})

    assert response.status_code == 200
    results = response.json()["results"]
    assert [result["activity_type"] for result in results] == expected
    model_version = client.get("/health").json()["model_version"]
    for prompt, result in zip(prompts, results, strict=True):
        assert_classification_shape(result, model_version)
        assert result == client.post("/classify", json={"text": prompt}).json()


def test_batch_classify_accepts_100_items(client: TestClient) -> None:
    items = [{"text": f"Write a haiku about the number {i}"} for i in range(100)]
    response = client.post("/batch-classify", json={"items": items})

    assert response.status_code == 200
    assert len(response.json()["results"]) == 100


@pytest.mark.parametrize(
    "payload",
    [
        {"items": []},
        {"items": [{"text": "hello"}] * 101},
        {"items": "hello"},
        {"items": ["hello"]},
        {"items": [{"text": "hello"}, {"text": ""}]},
        {"items": [{"text": "hello"}, {"text": 42}]},
        {"items": [{"text": "a" * 2001}]},
        {},
    ],
    ids=[
        "zero-items",
        "101-items",
        "items-not-list",
        "item-not-object",
        "one-empty-item",
        "one-int-item",
        "one-too-long-item",
        "missing-items",
    ],
)
def test_batch_classify_validation_errors(client: TestClient, payload: object) -> None:
    assert client.post("/batch-classify", json=payload).status_code == 422


def test_same_input_same_output_across_app_instances(client: TestClient) -> None:
    prompts = [
        "Can you explain what a hash map is and show an example in Go?",
        "ok thanks, talk later",
        "Turn this memo into a short paragraph for the newsletter",
    ]
    with TestClient(create_app(TEST_SETTINGS)) as other:
        for prompt in prompts:
            first = client.post("/classify", json={"text": prompt}).json()
            second = other.post("/classify", json={"text": prompt}).json()
            assert first == second
        assert client.get("/model-info").json() == other.get("/model-info").json()


def test_cors_allows_configured_origin_only(client: TestClient) -> None:
    preflight = {"Access-Control-Request-Method": "POST"}

    allowed = client.options("/classify", headers={"Origin": "http://localhost:5173", **preflight})
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-credentials" not in allowed.headers

    denied = client.options("/classify", headers={"Origin": "https://evil.example", **preflight})
    assert "access-control-allow-origin" not in denied.headers

    wrong_method = client.options(
        "/classify",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "DELETE"},
    )
    assert wrong_method.status_code == 400


def test_openapi_docs_available(client: TestClient) -> None:
    assert client.get("/docs").status_code == 200
    paths = client.get("/openapi.json").json()["paths"]
    assert {"/health", "/model-info", "/classify", "/batch-classify"} <= set(paths)
