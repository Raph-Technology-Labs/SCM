"""
Application configuration.

Reads settings from environment variables (and an optional .env file).
The one setting that matters right now is DATABASE_URL.
"""

from __future__ import annotations

import os

try:
    # Optional: load a local .env if python-dotenv is installed.
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - dotenv is optional
    pass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    """Plain settings object (no extra dependency required)."""

    # postgresql+psycopg2://USER:PASSWORD@HOST:PORT/DBNAME
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://scm_user:scm_password@localhost:5432/scm",
    )

    # Log every SQL statement (handy during development).
    SQL_ECHO: bool = _as_bool(os.getenv("SQL_ECHO"), default=False)

    # Directory holding the AI model weight files (e.g. bolt.pt, nut.pt).
    MODELS_DIR: str = os.getenv("MODELS_DIR", "./models")

    # Free-form app metadata.
    APP_NAME: str = os.getenv("APP_NAME", "MV Desktop API")


settings = Settings()
