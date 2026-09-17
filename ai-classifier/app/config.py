"""Service configuration read from environment variables (no .env loading at runtime)."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

DEFAULT_CORS_ORIGINS: tuple[str, ...] = ("http://localhost:4000", "http://localhost:5173")
LOG_LEVELS = ("CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG")


@dataclass(frozen=True, slots=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: tuple[str, ...] = DEFAULT_CORS_ORIGINS
    log_level: str = "INFO"

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> Settings:
        env = os.environ if environ is None else environ

        raw_port = env.get("PORT", "").strip() or "8000"
        try:
            port = int(raw_port)
        except ValueError:
            raise ValueError(f"PORT must be an integer, got {raw_port!r}") from None
        if not 1 <= port <= 65535:
            raise ValueError(f"PORT must be between 1 and 65535, got {port}")

        log_level = (env.get("LOG_LEVEL", "").strip() or "INFO").upper()
        if log_level not in LOG_LEVELS:
            raise ValueError(f"LOG_LEVEL must be one of {', '.join(LOG_LEVELS)}, got {log_level!r}")

        raw_origins = env.get("CORS_ORIGINS")
        if raw_origins is None or not raw_origins.strip():
            origins = DEFAULT_CORS_ORIGINS
        else:
            origins = tuple(origin.strip() for origin in raw_origins.split(",") if origin.strip())

        return cls(
            host=env.get("HOST", "").strip() or "127.0.0.1",
            port=port,
            cors_origins=origins,
            log_level=log_level,
        )
