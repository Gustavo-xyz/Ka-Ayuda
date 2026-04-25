from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"

load_dotenv(REPO_ROOT / ".env")
load_dotenv(BACKEND_DIR / ".env", override=True)


def _read_int_env(name: str, fallback: int) -> int:
    value = os.getenv(name)

    if value is None:
        return fallback

    try:
        return int(value)
    except ValueError:
        return fallback


API_PORT = _read_int_env("API_PORT", 3001)

# PostgreSQL via DATABASE_URL (Render) or individual vars
DATABASE_URL = os.getenv("DATABASE_URL", "")

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = _read_int_env("DB_PORT", 5432)
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "ayuda")
