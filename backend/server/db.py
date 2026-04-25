from __future__ import annotations

import math
import re
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

import pymysql
from pymysql.cursors import DictCursor

from .config import DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER

PROJECT_STATUSES = {"upcoming", "active", "archived"}
LEGACY_STATUS_MAP = {
    "ongoing": "active",
    "moved": "archived",
    "cancelled": "archived",
}


def _quote_identifier(value: str) -> str:
    if not value:
        raise ValueError("Database name cannot be empty.")

    return f"`{value.replace('`', '``')}`"


def _connection_kwargs(database: bool = True, dict_cursor: bool = False) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "host": DB_HOST,
        "port": DB_PORT,
        "user": DB_USER,
        "password": DB_PASSWORD,
        "charset": "utf8mb4",
        "autocommit": False,
    }

    if database:
        kwargs["database"] = DB_NAME

    if dict_cursor:
        kwargs["cursorclass"] = DictCursor

    return kwargs


def get_connection(*, database: bool = True, dict_cursor: bool = False) -> pymysql.connections.Connection:
    return pymysql.connect(**_connection_kwargs(database=database, dict_cursor=dict_cursor))


def _local_tz():
    return datetime.now().astimezone().tzinfo


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime(value.year, value.month, value.day)
    elif isinstance(value, str):
        text = value.strip()

        if not text:
            return None

        normalized = text[:-1] + "+00:00" if text.endswith("Z") else text

        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is not None:
        return parsed.astimezone(_local_tz()).replace(tzinfo=None)

    return parsed


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _normalize_status(value: Any) -> str:
    if isinstance(value, str):
        status = value.strip()
        status = LEGACY_STATUS_MAP.get(status, status)

        if status in PROJECT_STATUSES:
            return status

    return "upcoming"


def _normalize_beneficiary_target(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, (int, float)) and math.isfinite(value):
        return str(int(value)) if float(value).is_integer() else str(value)

    return ""


def _parse_google_maps_position(value: Any) -> tuple[float, float] | None:
    if not isinstance(value, str):
        return None

    patterns = [
        r"@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)",
        r"[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)",
        r"[?&]query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)",
    ]

    for pattern in patterns:
        match = re.search(pattern, value)

        if not match:
            continue

        lat = float(match.group(1))
        lng = float(match.group(2))

        if math.isfinite(lat) and math.isfinite(lng):
            return (lat, lng)

    return None


def to_sql_datetime(value: Any) -> str | None:
    parsed = _parse_datetime(value)

    if parsed is None:
        return None

    return parsed.strftime("%Y-%m-%d %H:%M:%S")


def to_ui_datetime(value: Any) -> str:
    if not value:
        return ""

    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%dT%H:%M")

    return str(value).replace(" ", "T")[:16]


def to_iso_like(value: Any) -> str:
    if not value:
        return _now_iso()

    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime(value.year, value.month, value.day)
    elif isinstance(value, str):
        normalized = value.replace(" ", "T")
        parsed = _parse_datetime(normalized)

        if parsed is None:
            return normalized
    else:
        normalized = str(value).replace(" ", "T")
        parsed = _parse_datetime(normalized)

        if parsed is None:
            return normalized

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=_local_tz())

    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _normalize_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _normalize_dependencies(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    dependencies: list[dict[str, Any]] = []

    for item in value:
        if not isinstance(item, dict):
            continue

        dependency_id = item.get("id")
        label = item.get("label")

        normalized_id = dependency_id.strip() if isinstance(dependency_id, str) and dependency_id.strip() else f"dep-{uuid.uuid4()}"
        normalized_label = label.strip() if isinstance(label, str) else ""

        if not normalized_label:
            continue

        dependencies.append(
            {
                "id": normalized_id,
                "label": normalized_label,
                "ready": bool(item.get("ready")),
            }
        )

    return dependencies


def normalize_project_payload(input_data: Any) -> dict[str, Any]:
    payload = input_data if isinstance(input_data, dict) else {}
    location = payload.get("location") if isinstance(payload.get("location"), dict) else {}
    now = _now_iso()

    project_id = payload.get("id")
    normalized_id = project_id.strip() if isinstance(project_id, str) and project_id.strip() else f"ayuda-{uuid.uuid4()}"

    name = payload.get("name")
    address = location.get("address")
    city = location.get("city")
    place_id = location.get("placeId")
    maps_url = location.get("mapsUrl")
    parsed_position = _parse_google_maps_position(maps_url)
    schedule = payload.get("schedule")
    schedule_end = payload.get("scheduleEnd")
    description = payload.get("description")
    beneficiary_target = payload.get("beneficiaryTarget")
    status_note = payload.get("statusNote")
    created_at = payload.get("createdAt")
    lat = float(location.get("lat")) if _is_finite_number(location.get("lat")) else parsed_position[0] if parsed_position else None
    lng = float(location.get("lng")) if _is_finite_number(location.get("lng")) else parsed_position[1] if parsed_position else None

    return {
        "id": normalized_id,
        "name": name.strip() if isinstance(name, str) else "",
        "description": description.strip() if isinstance(description, str) else "",
        "requirements": _normalize_list(payload.get("requirements")),
        "eligibility": _normalize_list(payload.get("eligibility")),
        "location": {
            "address": address.strip() if isinstance(address, str) else "",
            "city": city.strip() if isinstance(city, str) else "",
            "placeId": place_id.strip() if isinstance(place_id, str) and place_id.strip() else None,
            "lat": lat,
            "lng": lng,
            "mapsUrl": maps_url.strip() if isinstance(maps_url, str) else "",
        },
        "schedule": schedule if isinstance(schedule, str) else "",
        "scheduleEnd": schedule_end if isinstance(schedule_end, str) else "",
        "beneficiaryTarget": _normalize_beneficiary_target(beneficiary_target),
        "dependencies": _normalize_dependencies(payload.get("dependencies")),
        "publishState": "published" if payload.get("publishState") == "published" else "draft",
        "status": _normalize_status(payload.get("status")),
        "statusNote": status_note.strip() if isinstance(status_note, str) else "",
        "createdAt": created_at if isinstance(created_at, str) and created_at else now,
        "updatedAt": now,
    }


def ensure_schema() -> None:
    bootstrap_connection = get_connection(database=False)

    try:
        with bootstrap_connection.cursor() as cursor:
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS {_quote_identifier(DB_NAME)} "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        bootstrap_connection.commit()
    finally:
        bootstrap_connection.close()

    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                  id VARCHAR(80) NOT NULL,
                  name VARCHAR(255) NOT NULL,
                  description TEXT NULL,
                  address VARCHAR(500) NOT NULL,
                  city VARCHAR(120) NOT NULL DEFAULT '',
                  place_id VARCHAR(255) NULL,
                  lat DECIMAL(10,7) NULL,
                  lng DECIMAL(10,7) NULL,
                  maps_url VARCHAR(500) NULL,
                  schedule_at DATETIME NULL,
                  schedule_end_at DATETIME NULL,
                  beneficiary_target VARCHAR(120) NOT NULL DEFAULT '',
                  publish_state ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
                  status ENUM('upcoming', 'active', 'archived') NOT NULL DEFAULT 'upcoming',
                  status_note TEXT NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  PRIMARY KEY (id),
                  KEY idx_projects_schedule_at (schedule_at),
                  KEY idx_projects_publish_state (publish_state),
                  KEY idx_projects_status (status),
                  KEY idx_projects_city (city)
                ) ENGINE=InnoDB
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS project_requirements (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                  project_id VARCHAR(80) NOT NULL,
                  requirement_text TEXT NOT NULL,
                  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
                  PRIMARY KEY (id),
                  KEY idx_project_requirements_project_id (project_id),
                  CONSTRAINT fk_requirements_project
                    FOREIGN KEY (project_id)
                    REFERENCES projects(id)
                    ON DELETE CASCADE
                ) ENGINE=InnoDB
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS project_eligibility (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                  project_id VARCHAR(80) NOT NULL,
                  rule_text TEXT NOT NULL,
                  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
                  PRIMARY KEY (id),
                  KEY idx_project_eligibility_project_id (project_id),
                  CONSTRAINT fk_eligibility_project
                    FOREIGN KEY (project_id)
                    REFERENCES projects(id)
                    ON DELETE CASCADE
                ) ENGINE=InnoDB
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS project_dependencies (
                  id VARCHAR(80) NOT NULL,
                  project_id VARCHAR(80) NOT NULL,
                  label VARCHAR(255) NOT NULL,
                  ready TINYINT(1) NOT NULL DEFAULT 0,
                  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
                  PRIMARY KEY (id),
                  KEY idx_project_dependencies_project_id (project_id),
                  CONSTRAINT fk_dependencies_project
                    FOREIGN KEY (project_id)
                    REFERENCES projects(id)
                    ON DELETE CASCADE
                ) ENGINE=InnoDB
                """
            )
            cursor.execute("ALTER TABLE projects MODIFY schedule_at DATETIME NULL")
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = %s
                  AND TABLE_NAME = 'projects'
                  AND COLUMN_NAME = 'description'
                """,
                [DB_NAME],
            )
            description_column_exists = cursor.fetchone()[0] > 0

            if not description_column_exists:
                cursor.execute("ALTER TABLE projects ADD COLUMN description TEXT NULL AFTER name")

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = %s
                  AND TABLE_NAME = 'projects'
                  AND COLUMN_NAME = 'city'
                """,
                [DB_NAME],
            )
            city_column_exists = cursor.fetchone()[0] > 0

            if not city_column_exists:
                cursor.execute("ALTER TABLE projects ADD COLUMN city VARCHAR(120) NOT NULL DEFAULT '' AFTER address")

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = %s
                  AND TABLE_NAME = 'projects'
                  AND COLUMN_NAME = 'schedule_end_at'
                """,
                [DB_NAME],
            )
            schedule_end_column_exists = cursor.fetchone()[0] > 0

            if not schedule_end_column_exists:
                cursor.execute("ALTER TABLE projects ADD COLUMN schedule_end_at DATETIME NULL AFTER schedule_at")

            cursor.execute("ALTER TABLE projects MODIFY city VARCHAR(120) NOT NULL DEFAULT ''")
            cursor.execute("ALTER TABLE projects MODIFY beneficiary_target VARCHAR(120) NOT NULL DEFAULT ''")
            cursor.execute(
                "ALTER TABLE projects MODIFY status "
                "ENUM('upcoming', 'ongoing', 'moved', 'cancelled', 'active', 'archived') "
                "NOT NULL DEFAULT 'upcoming'"
            )
            cursor.execute("UPDATE projects SET status = 'active' WHERE status = 'ongoing'")
            cursor.execute("UPDATE projects SET status = 'archived' WHERE status IN ('moved', 'cancelled')")
            cursor.execute(
                "ALTER TABLE projects MODIFY status "
                "ENUM('upcoming', 'active', 'archived') NOT NULL DEFAULT 'upcoming'"
            )
            cursor.execute("UPDATE projects SET status = 'upcoming' WHERE status IS NULL OR status = ''")
            cursor.execute(
                """
                UPDATE projects
                SET publish_state = 'draft'
                WHERE publish_state IS NULL
                  OR publish_state = ''
                  OR publish_state NOT IN ('draft', 'published')
                """
            )
        connection.commit()
    finally:
        connection.close()


def _group_items(rows: list[dict[str, Any]], text_field_name: str) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}

    for row in rows:
        project_id = str(row["project_id"])
        grouped.setdefault(project_id, []).append(str(row[text_field_name]))

    return grouped


def _group_dependencies(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}

    for row in rows:
        project_id = str(row["project_id"])
        grouped.setdefault(project_id, []).append(
            {
                "id": str(row["id"]),
                "label": str(row["label"]),
                "ready": bool(row["ready"]),
            }
        )

    return grouped


def _decimal_to_float(value: Any) -> float:
    if isinstance(value, Decimal):
        return float(value)

    return float(value)


def list_projects(*, published_only: bool = False, project_ids: list[str] | None = None) -> list[dict[str, Any]]:
    where_clauses: list[str] = []
    params: list[Any] = []

    if published_only:
        where_clauses.append("publish_state = 'published'")

    if isinstance(project_ids, list):
        if not project_ids:
            return []

        placeholders = ", ".join(["%s"] * len(project_ids))
        where_clauses.append(f"id IN ({placeholders})")
        params.extend(project_ids)

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    connection = get_connection(dict_cursor=True)

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT
                  id,
                  name,
                  description,
                  address,
                  city,
                  place_id,
                  lat,
                  lng,
                  maps_url,
                  schedule_at,
                  schedule_end_at,
                  beneficiary_target,
                  publish_state,
                  status,
                  status_note,
                  created_at,
                  updated_at
                FROM projects
                {where_sql}
                ORDER BY schedule_at IS NULL, schedule_at ASC, schedule_end_at ASC, name ASC
                """,
                params,
            )
            project_rows = list(cursor.fetchall())

            if not project_rows:
                return []

            project_ids_for_children = [row["id"] for row in project_rows]
            child_placeholders = ", ".join(["%s"] * len(project_ids_for_children))

            cursor.execute(
                f"""
                SELECT project_id, requirement_text
                FROM project_requirements
                WHERE project_id IN ({child_placeholders})
                ORDER BY sort_order ASC, id ASC
                """,
                project_ids_for_children,
            )
            requirement_rows = list(cursor.fetchall())

            cursor.execute(
                f"""
                SELECT project_id, rule_text
                FROM project_eligibility
                WHERE project_id IN ({child_placeholders})
                ORDER BY sort_order ASC, id ASC
                """,
                project_ids_for_children,
            )
            eligibility_rows = list(cursor.fetchall())

            cursor.execute(
                f"""
                SELECT project_id, id, label, ready
                FROM project_dependencies
                WHERE project_id IN ({child_placeholders})
                ORDER BY sort_order ASC, id ASC
                """,
                project_ids_for_children,
            )
            dependency_rows = list(cursor.fetchall())
    finally:
        connection.close()

    requirements_by_project = _group_items(requirement_rows, "requirement_text")
    eligibility_by_project = _group_items(eligibility_rows, "rule_text")
    dependencies_by_project = _group_dependencies(dependency_rows)

    projects: list[dict[str, Any]] = []

    for row in project_rows:
        row_id = str(row["id"])
        location: dict[str, Any] = {
            "address": str(row.get("address") or ""),
            "city": str(row.get("city") or ""),
            "mapsUrl": str(row.get("maps_url") or ""),
        }

        if row.get("place_id"):
            location["placeId"] = str(row["place_id"])

        if row.get("lat") is not None:
            location["lat"] = _decimal_to_float(row["lat"])

        if row.get("lng") is not None:
            location["lng"] = _decimal_to_float(row["lng"])

        if "lat" not in location or "lng" not in location:
            parsed_position = _parse_google_maps_position(row.get("maps_url"))

            if parsed_position:
                location["lat"], location["lng"] = parsed_position

        status = _normalize_status(row.get("status"))

        projects.append(
            {
                "id": row_id,
                "name": str(row.get("name") or ""),
                "description": str(row.get("description") or ""),
                "requirements": requirements_by_project.get(row_id, []),
                "eligibility": eligibility_by_project.get(row_id, []),
                "location": location,
                "schedule": to_ui_datetime(row.get("schedule_at")),
                "scheduleEnd": to_ui_datetime(row.get("schedule_end_at")),
                "beneficiaryTarget": str(row.get("beneficiary_target") or ""),
                "dependencies": dependencies_by_project.get(row_id, []),
                "publishState": "published" if row.get("publish_state") == "published" else "draft",
                "status": status,
                "statusNote": str(row.get("status_note") or ""),
                "createdAt": to_iso_like(row.get("created_at")),
                "updatedAt": to_iso_like(row.get("updated_at")),
            }
        )

    return projects


def delete_project(project_id: Any) -> bool:
    normalized_project_id = project_id.strip() if isinstance(project_id, str) else ""

    if not normalized_project_id:
        return False

    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM projects WHERE id = %s", [normalized_project_id])
            deleted_count = cursor.rowcount
        connection.commit()
    finally:
        connection.close()

    return deleted_count > 0


def save_project(project_payload: Any) -> dict[str, Any]:
    project = normalize_project_payload(project_payload)
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            connection.begin()
            cursor.execute(
                """
                INSERT INTO projects (
                  id,
                  name,
                  description,
                  address,
                  city,
                  place_id,
                  lat,
                  lng,
                  maps_url,
                  schedule_at,
                  schedule_end_at,
                  beneficiary_target,
                  publish_state,
                  status,
                  status_note,
                  created_at,
                  updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE
                  name = VALUES(name),
                  description = VALUES(description),
                  address = VALUES(address),
                  city = VALUES(city),
                  place_id = VALUES(place_id),
                  lat = VALUES(lat),
                  lng = VALUES(lng),
                  maps_url = VALUES(maps_url),
                  schedule_at = VALUES(schedule_at),
                  schedule_end_at = VALUES(schedule_end_at),
                  beneficiary_target = VALUES(beneficiary_target),
                  publish_state = VALUES(publish_state),
                  status = VALUES(status),
                  status_note = VALUES(status_note),
                  updated_at = CURRENT_TIMESTAMP
                """,
                [
                    project["id"],
                    project["name"],
                    project["description"],
                    project["location"]["address"],
                    project["location"]["city"],
                    project["location"]["placeId"],
                    project["location"]["lat"],
                    project["location"]["lng"],
                    project["location"]["mapsUrl"],
                    to_sql_datetime(project["schedule"]),
                    to_sql_datetime(project["scheduleEnd"]),
                    project["beneficiaryTarget"],
                    project["publishState"],
                    project["status"],
                    project["statusNote"],
                    to_sql_datetime(project["createdAt"]) or to_sql_datetime(_now_iso()),
                ],
            )
            cursor.execute("DELETE FROM project_requirements WHERE project_id = %s", [project["id"]])
            cursor.execute("DELETE FROM project_eligibility WHERE project_id = %s", [project["id"]])
            cursor.execute("DELETE FROM project_dependencies WHERE project_id = %s", [project["id"]])

            for index, requirement in enumerate(project["requirements"]):
                cursor.execute(
                    """
                    INSERT INTO project_requirements (project_id, requirement_text, sort_order)
                    VALUES (%s, %s, %s)
                    """,
                    [project["id"], requirement, index],
                )

            for index, eligibility_rule in enumerate(project["eligibility"]):
                cursor.execute(
                    """
                    INSERT INTO project_eligibility (project_id, rule_text, sort_order)
                    VALUES (%s, %s, %s)
                    """,
                    [project["id"], eligibility_rule, index],
                )

            for index, dependency in enumerate(project["dependencies"]):
                cursor.execute(
                    """
                    INSERT INTO project_dependencies (id, project_id, label, ready, sort_order)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    [dependency["id"], project["id"], dependency["label"], 1 if dependency["ready"] else 0, index],
                )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    saved_projects = list_projects(project_ids=[project["id"]])

    if not saved_projects:
        raise RuntimeError("Project was saved but could not be loaded.")

    return saved_projects[0]
