"""FastAPI application for the PerAI View activity classifier."""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings
from app.model import ActivityClassifier, Prediction
from app.schemas import (
    BatchClassifyRequest,
    BatchClassifyResponse,
    ClassificationResult,
    ClassifyRequest,
    HealthResponse,
    ModelInfoResponse,
)

logger = logging.getLogger("perai.classifier")


def _configure_logging(level: str) -> None:
    logger.setLevel(level)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s - %(message)s"))
        logger.addHandler(handler)
        logger.propagate = False


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    started = time.perf_counter()
    classifier = ActivityClassifier.train()
    app.state.classifier = classifier
    logger.info(
        "Trained %s on %d examples in %.2fs (%d-fold CV accuracy %.3f)",
        classifier.model_version,
        classifier.training_examples,
        time.perf_counter() - started,
        classifier.cv_folds,
        classifier.cv_accuracy,
    )
    yield
    # Nothing to release: the model lives in memory only.


def get_classifier(request: Request) -> ActivityClassifier:
    return request.app.state.classifier


Classifier = Annotated[ActivityClassifier, Depends(get_classifier)]


def _to_result(prediction: Prediction, model_version: str) -> ClassificationResult:
    return ClassificationResult(
        activity_type=prediction.activity_type,
        confidence=prediction.confidence,
        scores=prediction.scores,
        model_version=model_version,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    _configure_logging(settings.log_level)

    app = FastAPI(
        title="PerAI View - Activity Classifier",
        description=(
            "Classifies a short prompt sent to an AI assistant into one of seven activity "
            "types using a TF-IDF + logistic regression model trained at startup on a small, "
            "synthetic, hand-written dataset."
        ),
        version="2.0.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    # Endpoints are plain `def`: scikit-learn inference is CPU-bound, so FastAPI runs it in
    # its threadpool instead of blocking the event loop. Prompt text is never logged.

    @app.get("/health", response_model=HealthResponse, tags=["service"])
    def health(classifier: Classifier) -> HealthResponse:
        return HealthResponse(model_version=classifier.model_version, labels=classifier.labels)

    @app.get("/model-info", response_model=ModelInfoResponse, tags=["service"])
    def model_info(classifier: Classifier) -> ModelInfoResponse:
        return ModelInfoResponse(
            model_version=classifier.model_version,
            algorithm=classifier.algorithm,
            labels=classifier.labels,
            training_examples=classifier.training_examples,
            cv_accuracy=classifier.cv_accuracy,
            cv_folds=classifier.cv_folds,
        )

    @app.post("/classify", response_model=ClassificationResult, tags=["classification"])
    def classify(body: ClassifyRequest, classifier: Classifier) -> ClassificationResult:
        return _to_result(classifier.predict(body.text), classifier.model_version)

    @app.post("/batch-classify", response_model=BatchClassifyResponse, tags=["classification"])
    def batch_classify(body: BatchClassifyRequest, classifier: Classifier) -> BatchClassifyResponse:
        predictions = classifier.predict_many([item.text for item in body.items])
        return BatchClassifyResponse(
            results=[_to_result(p, classifier.model_version) for p in predictions]
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    _settings = Settings.from_env()
    uvicorn.run(
        app, host=_settings.host, port=_settings.port, log_level=_settings.log_level.lower()
    )
