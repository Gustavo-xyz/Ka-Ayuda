from __future__ import annotations

from .db import LEGACY_STATUS_MAP, PROJECT_STATUSES, ensure_schema, get_connection, to_sql_datetime
from .mock_projects import MOCK_PROJECTS


def _normalize_seed_status(value: object) -> str:
    if isinstance(value, str):
        status = LEGACY_STATUS_MAP.get(value.strip(), value.strip())

        if status in PROJECT_STATUSES:
            return status

    return "upcoming"


def main() -> None:
    ensure_schema()
    connection = get_connection(dict_cursor=True)

    try:
        with connection.cursor() as cursor:
            connection.begin()
            cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
            cursor.execute("TRUNCATE TABLE project_dependencies")
            cursor.execute("TRUNCATE TABLE project_eligibility")
            cursor.execute("TRUNCATE TABLE project_requirements")
            cursor.execute("TRUNCATE TABLE projects")
            cursor.execute("SET FOREIGN_KEY_CHECKS = 1")

            for project in MOCK_PROJECTS:
                location = project["location"]
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
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    [
                        project["id"],
                        project["name"],
                        project.get("description", ""),
                        location["address"],
                        location.get("city", ""),
                        location.get("placeId"),
                        location.get("lat"),
                        location.get("lng"),
                        location.get("mapsUrl", ""),
                        to_sql_datetime(project["schedule"]),
                        to_sql_datetime(project.get("scheduleEnd", "")),
                        project["beneficiaryTarget"],
                        "published" if project.get("publishState") == "published" else "draft",
                        _normalize_seed_status(project.get("status")),
                        project["statusNote"],
                        to_sql_datetime(project["createdAt"]),
                        to_sql_datetime(project["updatedAt"]),
                    ],
                )

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
                        [
                            dependency["id"],
                            project["id"],
                            dependency["label"],
                            1 if dependency["ready"] else 0,
                            index,
                        ],
                    )

            connection.commit()

            cursor.execute(
                """
                SELECT
                  COUNT(*) AS totalProjects,
                  SUM(CASE WHEN publish_state = 'published' THEN 1 ELSE 0 END) AS publishedProjects,
                  SUM(CASE WHEN publish_state = 'draft' THEN 1 ELSE 0 END) AS draftProjects
                FROM projects
                """
            )
            summary = cursor.fetchone()

        print("Database seeded successfully.")
        print(f"Total projects: {summary['totalProjects']}")
        print(f"Published projects: {summary['publishedProjects']}")
        print(f"Draft projects: {summary['draftProjects']}")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Failed to seed database.")
        print(error)
        raise SystemExit(1) from error
