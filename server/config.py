from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()


def _read_int_env(name: str, fallback: int) -> int:
    value = os.getenv(name)

    if value is None:
        return fallback

    try:
        return int(value)
    except ValueError:
        return fallback


API_PORT = _read_int_env("API_PORT", 3001)
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = _read_int_env("DB_PORT", 3306)
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "ayuda")
