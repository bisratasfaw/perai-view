"""Request and response models (pydantic v2)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

MAX_TEXT_LENGTH = 2000
MAX_BATCH_ITEMS = 100

# Keep in sync with app.model.LABELS (checked by the test-suite).
ActivityType = Literal[
    "conversation",
    "writing",
    "coding",
    "image_generation",
    "summarization",
    "translation",
    "research",
]

PromptText = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TEXT_LENGTH),
    Field(
        description=f"Prompt a user sent to an AI assistant (1-{MAX_TEXT_LENGTH} characters "
        "after trimming whitespace).",
        examples=["Translate 'where is the train station?' into Portuguese"],
    ),
]


class ClassifyRequest(BaseModel):
    text: PromptText


class BatchClassifyRequest(BaseModel):
    items: Annotated[
        list[ClassifyRequest],
        Field(min_length=1, max_length=MAX_BATCH_ITEMS, description="1-100 prompts."),
    ]


class ClassificationResult(BaseModel):
    activity_type: ActivityType
    confidence: Annotated[float, Field(ge=0, le=1, description="Probability of activity_type.")]
    scores: Annotated[
        dict[ActivityType, float],
        Field(description="Probability for every label, rounded to 4 decimals (sums to ~1)."),
    ]
    model_version: str
    source: Literal["model"] = "model"


class BatchClassifyResponse(BaseModel):
    results: list[ClassificationResult]


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    model_version: str
    labels: list[ActivityType]


class ModelInfoResponse(BaseModel):
    model_version: str
    algorithm: str
    labels: list[ActivityType]
    training_examples: int
    cv_accuracy: Annotated[float, Field(description="Mean stratified k-fold CV accuracy.")]
    cv_folds: int
