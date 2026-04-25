from __future__ import annotations

import argparse
from typing import Any

from .db import get_connection


def _as_number(value: Any) -> int:
    return int(value or 0)


def assert_condition(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def run_checks(cursor, iteration: int) -> None:
    cursor.execute(
        """
        SELECT
          COUNT(*) AS totalProjects,
          SUM(CASE WHEN publish_state = 'published' THEN 1 ELSE 0 END) AS publishedProjects,
          SUM(CASE WHEN publish_state = 'draft' THEN 1 ELSE 0 END) AS draftProjects,
          SUM(CASE WHEN publish_state NOT IN ('draft', 'published') OR publish_state IS NULL OR publish_state = '' THEN 1 ELSE 0 END) AS invalidPublishStateProjects,
          SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END) AS upcomingProjects,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeProjects,
          SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archivedProjects,
          SUM(CASE WHEN status NOT IN ('upcoming', 'active', 'archived') OR status IS NULL OR status = '' THEN 1 ELSE 0 END) AS invalidStatusProjects,
          SUM(CASE WHEN schedule_at IS NULL THEN 1 ELSE 0 END) AS unscheduledProjects,
          SUM(CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 1 ELSE 0 END) AS geocodedProjects,
          SUM(CASE WHEN maps_url IS NOT NULL AND maps_url <> '' THEN 1 ELSE 0 END) AS withMapsUrl
        FROM projects
        """
    )
    summary = cursor.fetchone()

    assert_condition(_as_number(summary["totalProjects"]) >= 8, "Expected at least 8 projects.")
    assert_condition(_as_number(summary["publishedProjects"]) >= 1, "Expected at least one published project.")
    assert_condition(_as_number(summary["draftProjects"]) >= 1, "Expected at least one draft project.")
    assert_condition(_as_number(summary["invalidPublishStateProjects"]) == 0, "Expected no invalid publish_state values.")
    assert_condition(_as_number(summary["upcomingProjects"]) >= 1, "Expected at least one upcoming project.")
    assert_condition(_as_number(summary["activeProjects"]) >= 1, "Expected at least one active project.")
    assert_condition(_as_number(summary["archivedProjects"]) >= 1, "Expected at least one archived project.")
    assert_condition(_as_number(summary["invalidStatusProjects"]) == 0, "Expected no invalid status values.")
    assert_condition(_as_number(summary["unscheduledProjects"]) >= 1, "Expected at least one unscheduled draft project.")
    assert_condition(_as_number(summary["geocodedProjects"]) >= 1, "Expected at least one geocoded location.")
    assert_condition(_as_number(summary["withMapsUrl"]) >= 1, "Expected at least one project with maps URL.")

    cursor.execute("SELECT COUNT(*) AS countValue FROM project_requirements")
    requirement_count = cursor.fetchone()
    cursor.execute("SELECT COUNT(*) AS countValue FROM project_eligibility")
    eligibility_count = cursor.fetchone()
    cursor.execute("SELECT COUNT(*) AS countValue FROM project_dependencies")
    dependency_count = cursor.fetchone()

    assert_condition(_as_number(requirement_count["countValue"]) >= 8, "Expected mock requirements to be populated.")
    assert_condition(_as_number(eligibility_count["countValue"]) >= 8, "Expected mock eligibility rules to be populated.")
    assert_condition(_as_number(dependency_count["countValue"]) >= 8, "Expected mock dependencies to be populated.")

    cursor.execute(
        """
        SELECT
          SUM(CASE WHEN ready_summary.all_ready = 1 THEN 1 ELSE 0 END) AS readyProjects,
          SUM(CASE WHEN ready_summary.all_ready = 0 THEN 1 ELSE 0 END) AS blockedProjects
        FROM (
          SELECT p.id, MIN(COALESCE(d.ready, 0)) AS all_ready
          FROM projects p
          LEFT JOIN project_dependencies d ON d.project_id = p.id
          GROUP BY p.id
        ) ready_summary
        """
    )
    readiness = cursor.fetchone()
    assert_condition(_as_number(readiness["readyProjects"]) >= 1, "Expected at least one ready project.")
    assert_condition(_as_number(readiness["blockedProjects"]) >= 1, "Expected at least one blocked project.")

    cursor.execute(
        """
        SELECT COUNT(*) AS countValue
        FROM projects p
        WHERE p.publish_state = 'published'
          AND EXISTS (
            SELECT 1
            FROM project_dependencies d
            WHERE d.project_id = p.id
          )
        """
    )
    published_ready = cursor.fetchone()
    assert_condition(
        _as_number(published_ready["countValue"]) >= 1,
        "Expected published projects to have dependency checklist values.",
    )

    print(
        "Iteration "
        f"{iteration}: OK (projects={summary['totalProjects']}, "
        f"published={summary['publishedProjects']}, draft={summary['draftProjects']})"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify seeded Ayuda database data.")
    parser.add_argument("--repeat", type=int, default=1)
    args = parser.parse_args()

    if args.repeat < 1:
        raise RuntimeError("Repeat count must be a positive integer.")

    connection = get_connection(dict_cursor=True)

    try:
        with connection.cursor() as cursor:
            for iteration in range(1, args.repeat + 1):
                run_checks(cursor, iteration)

        print(f"All checks passed {args.repeat} time(s).")
    finally:
        connection.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("Database verification failed.")
        print(error)
        raise SystemExit(1) from error
