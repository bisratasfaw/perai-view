from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.model import ActivityClassifier

TEST_SETTINGS = Settings(cors_origins=("http://localhost:5173",), log_level="WARNING")


@pytest.fixture(scope="session")
def classifier() -> ActivityClassifier:
    return ActivityClassifier.train()


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    # The context manager runs the FastAPI lifespan, i.e. trains the model.
    with TestClient(create_app(TEST_SETTINGS)) as test_client:
        yield test_client
