import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

const DB_HOST = process.env.DB_HOST ?? "127.0.0.1";
const DB_PORT = Number.parseInt(process.env.DB_PORT ?? "3306", 10);
const DB_USER = process.env.DB_USER ?? "root";
const DB_PASSWORD = process.env.DB_PASSWORD ?? "";
const DB_NAME = process.env.DB_NAME ?? "ayuda";

const repeatArg = process.argv.find((item) => item.startsWith("--repeat="));
const repeatCount = repeatArg ? Number.parseInt(repeatArg.split("=")[1] ?? "1", 10) : 1;

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runChecks(pool, iteration) {
  const [projectSummaryRows] = await pool.query(
    `
      SELECT
        COUNT(*) AS totalProjects,
        SUM(CASE WHEN publish_state = 'published' THEN 1 ELSE 0 END) AS publishedProjects,
        SUM(CASE WHEN publish_state = 'draft' THEN 1 ELSE 0 END) AS draftProjects,
        SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END) AS upcomingProjects,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS activeProjects,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archivedProjects,
        SUM(CASE WHEN schedule_at IS NULL THEN 1 ELSE 0 END) AS unscheduledProjects,
        SUM(CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 1 ELSE 0 END) AS geocodedProjects,
        SUM(CASE WHEN maps_url IS NOT NULL AND maps_url <> '' THEN 1 ELSE 0 END) AS withMapsUrl
      FROM projects
    `,
  );

  const summary = projectSummaryRows[0];

  assertCondition(Number(summary.totalProjects) >= 8, "Expected at least 8 projects.");
  assertCondition(Number(summary.publishedProjects) >= 1, "Expected at least one published project.");
  assertCondition(Number(summary.draftProjects) >= 1, "Expected at least one draft project.");
  assertCondition(Number(summary.upcomingProjects) >= 1, "Expected at least one upcoming project.");
  assertCondition(Number(summary.activeProjects) >= 1, "Expected at least one active project.");
  assertCondition(Number(summary.archivedProjects) >= 1, "Expected at least one archived project.");
  assertCondition(Number(summary.unscheduledProjects) >= 1, "Expected at least one unscheduled draft project.");
  assertCondition(Number(summary.geocodedProjects) >= 1, "Expected at least one geocoded location.");
  assertCondition(Number(summary.withMapsUrl) >= 1, "Expected at least one project with maps URL.");

  const [requirementRows] = await pool.query("SELECT COUNT(*) AS countValue FROM project_requirements");
  const [eligibilityRows] = await pool.query("SELECT COUNT(*) AS countValue FROM project_eligibility");
  const [dependencyRows] = await pool.query("SELECT COUNT(*) AS countValue FROM project_dependencies");

  assertCondition(Number(requirementRows[0].countValue) >= 8, "Expected mock requirements to be populated.");
  assertCondition(Number(eligibilityRows[0].countValue) >= 8, "Expected mock eligibility rules to be populated.");
  assertCondition(Number(dependencyRows[0].countValue) >= 8, "Expected mock dependencies to be populated.");

  const [readyStateRows] = await pool.query(
    `
      SELECT
        SUM(CASE WHEN ready_summary.all_ready = 1 THEN 1 ELSE 0 END) AS readyProjects,
        SUM(CASE WHEN ready_summary.all_ready = 0 THEN 1 ELSE 0 END) AS blockedProjects
      FROM (
        SELECT p.id, MIN(COALESCE(d.ready, 0)) AS all_ready
        FROM projects p
        LEFT JOIN project_dependencies d ON d.project_id = p.id
        GROUP BY p.id
      ) ready_summary
    `,
  );

  const readiness = readyStateRows[0];
  assertCondition(Number(readiness.readyProjects) >= 1, "Expected at least one ready project.");
  assertCondition(Number(readiness.blockedProjects) >= 1, "Expected at least one blocked project.");

  const [publishedReadyRows] = await pool.query(
    `
      SELECT COUNT(*) AS countValue
      FROM projects p
      WHERE p.publish_state = 'published'
        AND EXISTS (
          SELECT 1
          FROM project_dependencies d
          WHERE d.project_id = p.id
        )
    `,
  );

  assertCondition(
    Number(publishedReadyRows[0].countValue) >= 1,
    "Expected published projects to have dependency checklist values.",
  );

  console.log(
    `Iteration ${iteration}: OK (projects=${summary.totalProjects}, published=${summary.publishedProjects}, draft=${summary.draftProjects})`,
  );
}

async function main() {
  if (!Number.isFinite(repeatCount) || repeatCount < 1) {
    throw new Error("Repeat count must be a positive integer.");
  }

  const pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 8,
    queueLimit: 0,
  });

  try {
    for (let iteration = 1; iteration <= repeatCount; iteration += 1) {
      await runChecks(pool, iteration);
    }

    console.log(`All checks passed ${repeatCount} time(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Database verification failed.");
  console.error(error.message);
  process.exit(1);
});
