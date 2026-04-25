import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { MOCK_PROJECTS } from "./mock-projects.js";

dotenv.config();

const DB_HOST = process.env.DB_HOST ?? "127.0.0.1";
const DB_PORT = Number.parseInt(process.env.DB_PORT ?? "3306", 10);
const DB_USER = process.env.DB_USER ?? "root";
const DB_PASSWORD = process.env.DB_PASSWORD ?? "";
const DB_NAME = process.env.DB_NAME ?? "ayuda";

const dbConfig = {
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  charset: "utf8mb4",
};

function formatTwoDigits(value) {
  return String(value).padStart(2, "0");
}

function toSqlDateTime(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const year = parsed.getFullYear();
  const month = formatTwoDigits(parsed.getMonth() + 1);
  const day = formatTwoDigits(parsed.getDate());
  const hours = formatTwoDigits(parsed.getHours());
  const minutes = formatTwoDigits(parsed.getMinutes());
  const seconds = formatTwoDigits(parsed.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id VARCHAR(80) NOT NULL,
      name VARCHAR(255) NOT NULL,
      address VARCHAR(500) NOT NULL,
      place_id VARCHAR(255) NULL,
      lat DECIMAL(10,7) NULL,
      lng DECIMAL(10,7) NULL,
      maps_url VARCHAR(500) NULL,
      schedule_at DATETIME NULL,
      beneficiary_target INT UNSIGNED NOT NULL,
      publish_state ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
      status ENUM('upcoming', 'ongoing', 'moved', 'cancelled') NOT NULL DEFAULT 'upcoming',
      status_note TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_projects_schedule_at (schedule_at),
      KEY idx_projects_publish_state (publish_state),
      KEY idx_projects_status (status)
    ) ENGINE=InnoDB
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`ALTER TABLE projects MODIFY schedule_at DATETIME NULL`);
}

async function main() {
  const bootstrapConnection = await mysql.createConnection(dbConfig);

  try {
    await bootstrapConnection.query(
      `CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await bootstrapConnection.end();
  }

  const pool = mysql.createPool({
    ...dbConfig,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  try {
    await ensureSchema(pool);

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.query("SET FOREIGN_KEY_CHECKS = 0");
      await connection.query("TRUNCATE TABLE project_dependencies");
      await connection.query("TRUNCATE TABLE project_eligibility");
      await connection.query("TRUNCATE TABLE project_requirements");
      await connection.query("TRUNCATE TABLE projects");
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");

      for (const project of MOCK_PROJECTS) {
        await connection.query(
          `
            INSERT INTO projects (
              id,
              name,
              address,
              place_id,
              lat,
              lng,
              maps_url,
              schedule_at,
              beneficiary_target,
              publish_state,
              status,
              status_note,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            project.id,
            project.name,
            project.location.address,
            project.location.placeId ?? null,
            project.location.lat ?? null,
            project.location.lng ?? null,
            project.location.mapsUrl ?? "",
            toSqlDateTime(project.schedule),
            project.beneficiaryTarget,
            project.publishState,
            project.status,
            project.statusNote,
            toSqlDateTime(project.createdAt),
            toSqlDateTime(project.updatedAt),
          ],
        );

        for (let index = 0; index < project.requirements.length; index += 1) {
          await connection.query(
            `
              INSERT INTO project_requirements (project_id, requirement_text, sort_order)
              VALUES (?, ?, ?)
            `,
            [project.id, project.requirements[index], index],
          );
        }

        for (let index = 0; index < project.eligibility.length; index += 1) {
          await connection.query(
            `
              INSERT INTO project_eligibility (project_id, rule_text, sort_order)
              VALUES (?, ?, ?)
            `,
            [project.id, project.eligibility[index], index],
          );
        }

        for (let index = 0; index < project.dependencies.length; index += 1) {
          const dependency = project.dependencies[index];

          await connection.query(
            `
              INSERT INTO project_dependencies (id, project_id, label, ready, sort_order)
              VALUES (?, ?, ?, ?, ?)
            `,
            [dependency.id, project.id, dependency.label, dependency.ready ? 1 : 0, index],
          );
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [rows] = await pool.query(
      `
        SELECT
          COUNT(*) AS totalProjects,
          SUM(CASE WHEN publish_state = 'published' THEN 1 ELSE 0 END) AS publishedProjects,
          SUM(CASE WHEN publish_state = 'draft' THEN 1 ELSE 0 END) AS draftProjects
        FROM projects
      `,
    );

    const summary = rows[0];
    console.log("Database seeded successfully.");
    console.log(`Total projects: ${summary.totalProjects}`);
    console.log(`Published projects: ${summary.publishedProjects}`);
    console.log(`Draft projects: ${summary.draftProjects}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to seed database.");
  console.error(error);
  process.exit(1);
});
