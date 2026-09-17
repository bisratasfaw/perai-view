import pytest

from app.config import Settings


def test_settings_from_env() -> None:
    settings = Settings.from_env(
        {"PORT": "9001", "LOG_LEVEL": "debug", "CORS_ORIGINS": " https://a.test ,https://b.test,"}
    )
    assert settings.port == 9001
    assert settings.log_level == "DEBUG"
    assert settings.cors_origins == ("https://a.test", "https://b.test")

    defaults = Settings.from_env({})
    assert defaults.port == 8000
    assert defaults.cors_origins == ("http://localhost:4000", "http://localhost:5173")

    with pytest.raises(ValueError, match="PORT"):
        Settings.from_env({"PORT": "eighty"})
    with pytest.raises(ValueError, match="LOG_LEVEL"):
        Settings.from_env({"LOG_LEVEL": "loud"})
