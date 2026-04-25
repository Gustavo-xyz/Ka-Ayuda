import crypto from "node:crypto";
import process from "node:process";
import dotenv from "dotenv";
import express from "express";
import mysql from "mysql2/promise";

dotenv.config();

const API_PORT = Number.parseInt(process.env.API_PORT ?? "3001", 10);
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

let pool;

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

function toUiDateTime(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = formatTwoDigits(value.getMonth() + 1);
    const day = formatTwoDigits(value.getDate());
    const hours = formatTwoDigits(value.getHours());
    const minutes = formatTwoDigits(value.getMinutes());

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  const text = String(value);
  return text.replace(" ", "T").slice(0, 16);
}

function toIsoLike(value) {
  if (!value) {
    return new Date().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const normalized = String(value).replace(" ", "T");
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toISOString();
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeDependencies(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const id = typeof item?.id === "string" && item.id.trim() ? item.id.trim() : `dep-${crypto.randomUUID()}`;
      const label = typeof item?.label === "string" ? item.label.trim() : "";

      return {
        id,
        label,
        ready: Boolean(item?.ready),
      };
    })
    .filter((item) => item.label.length > 0);
}

function normalizeStatus(value) {
  if (value === "active" || value === "ongoing") {
    return "active";
  }

  if (value === "archived" || value === "moved" || value === "cancelled") {
    return "archived";
  }

  return "upcoming";
}

function normalizeProjectPayload(input) {
  const now = new Date().toISOString();
  const id = typeof input?.id === "string" && input.id.trim() ? input.id.trim() : `ayuda-${crypto.randomUUID()}`;

  return {
    id,
    name: typeof input?.name === "string" ? input.name.trim() : "",
    requirements: normalizeList(input?.requirements),
    eligibility: normalizeList(input?.eligibility),
    location: {
      address: typeof input?.location?.address === "string" ? input.location.address.trim() : "",
      placeId: typeof input?.location?.placeId === "string" ? input.location.placeId.trim() : null,
      lat: Number.isFinite(input?.location?.lat) ? Number(input.location.lat) : null,
      lng: Number.isFinite(input?.location?.lng) ? Number(input.location.lng) : null,
      mapsUrl: typeof input?.location?.mapsUrl === "string" ? input.location.mapsUrl.trim() : "",
    },
    schedule: typeof input?.schedule === "string" ? input.schedule : "",
    beneficiaryTarget: typeof input?.beneficiaryTarget === "string" ? input.beneficiaryTarget.trim() : "",
    dependencies: normalizeDependencies(input?.dependencies),
    publishState: input?.publishState === "published" ? "published" : "draft",
    status: normalizeStatus(input?.status),
    statusNote: typeof input?.statusNote === "string" ? input.statusNote.trim() : "",
    createdAt: typeof input?.createdAt === "string" && input.createdAt ? input.createdAt : now,
    updatedAt: now,
  };
}

async function ensureSchema() {
  const bootstrapConnection = await mysql.createConnection(dbConfig);

  try {
    await bootstrapConnection.query(
      `CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await bootstrapConnection.end();
  }

  pool = mysql.createPool({
    ...dbConfig,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
  });

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
      beneficiary_target VARCHAR(120) NOT NULL DEFAULT '',
      publish_state ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
      status ENUM('upcoming', 'active', 'archived') NOT NULL DEFAULT 'upcoming',
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
  await pool.query(`ALTER TABLE projects MODIFY beneficiary_target VARCHAR(120) NOT NULL DEFAULT ''`);
  await pool.query(
    `ALTER TABLE projects MODIFY status ENUM('upcoming', 'ongoing', 'moved', 'cancelled', 'active', 'archived') NOT NULL DEFAULT 'upcoming'`,
  );
  await pool.query(`UPDATE projects SET status = 'active' WHERE status = 'ongoing'`);
  await pool.query(`UPDATE projects SET status = 'archived' WHERE status IN ('moved', 'cancelled')`);
  await pool.query(
    `ALTER TABLE projects MODIFY status ENUM('upcoming', 'active', 'archived') NOT NULL DEFAULT 'upcoming'`,
  );
}

function groupItems(rows, textFieldName) {
  const grouped = new Map();

  for (const row of rows) {
    const values = grouped.get(row.project_id) ?? [];
    values.push(String(row[textFieldName]));
    grouped.set(row.project_id, values);
  }

  return grouped;
}

function groupDependencies(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const values = grouped.get(row.project_id) ?? [];
    values.push({
      id: String(row.id),
      label: String(row.label),
      ready: Boolean(row.ready),
    });
    grouped.set(row.project_id, values);
  }

  return grouped;
}

async function listProjects({ publishedOnly = false, projectIds = null } = {}) {
  const whereClauses = [];
  const params = [];

  if (publishedOnly) {
    whereClauses.push("publish_state = 'published'");
  }

  if (Array.isArray(projectIds)) {
    if (projectIds.length === 0) {
      return [];
    }

    whereClauses.push("id IN (?)");
    params.push(projectIds);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const [projectRows] = await pool.query(
    `
      SELECT
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
      FROM projects
      ${whereSql}
      ORDER BY schedule_at IS NULL, schedule_at ASC, name ASC
    `,
    params,
  );

  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    return [];
  }

  const ids = projectRows.map((row) => row.id);

  const [requirementRows] = await pool.query(
    `
      SELECT project_id, requirement_text
      FROM project_requirements
      WHERE project_id IN (?)
      ORDER BY sort_order ASC, id ASC
    `,
    [ids],
  );

  const [eligibilityRows] = await pool.query(
    `
      SELECT project_id, rule_text
      FROM project_eligibility
      WHERE project_id IN (?)
      ORDER BY sort_order ASC, id ASC
    `,
    [ids],
  );

  const [dependencyRows] = await pool.query(
    `
      SELECT project_id, id, label, ready
      FROM project_dependencies
      WHERE project_id IN (?)
      ORDER BY sort_order ASC, id ASC
    `,
    [ids],
  );

  const requirementsByProject = groupItems(requirementRows, "requirement_text");
  const eligibilityByProject = groupItems(eligibilityRows, "rule_text");
  const dependenciesByProject = groupDependencies(dependencyRows);

  return projectRows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    requirements: requirementsByProject.get(row.id) ?? [],
    eligibility: eligibilityByProject.get(row.id) ?? [],
    location: {
      address: String(row.address ?? ""),
      placeId: row.place_id ? String(row.place_id) : undefined,
      lat: row.lat == null ? undefined : Number(row.lat),
      lng: row.lng == null ? undefined : Number(row.lng),
      mapsUrl: row.maps_url ? String(row.maps_url) : "",
    },
    schedule: toUiDateTime(row.schedule_at),
    beneficiaryTarget: String(row.beneficiary_target ?? ""),
    dependencies: dependenciesByProject.get(row.id) ?? [],
    publishState: row.publish_state === "published" ? "published" : "draft",
    status: normalizeStatus(row.status),
    statusNote: String(row.status_note ?? ""),
    createdAt: toIsoLike(row.created_at),
    updatedAt: toIsoLike(row.updated_at),
  }));
}

async function saveProject(projectPayload) {
  const project = normalizeProjectPayload(projectPayload);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          address = VALUES(address),
          place_id = VALUES(place_id),
          lat = VALUES(lat),
          lng = VALUES(lng),
          maps_url = VALUES(maps_url),
          schedule_at = VALUES(schedule_at),
          beneficiary_target = VALUES(beneficiary_target),
          publish_state = VALUES(publish_state),
          status = VALUES(status),
          status_note = VALUES(status_note),
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        project.id,
        project.name,
        project.location.address,
        project.location.placeId,
        project.location.lat,
        project.location.lng,
        project.location.mapsUrl,
        toSqlDateTime(project.schedule),
        project.beneficiaryTarget,
        project.publishState,
        project.status,
        project.statusNote,
        toSqlDateTime(project.createdAt) ?? toSqlDateTime(new Date().toISOString()),
      ],
    );

    await connection.query(`DELETE FROM project_requirements WHERE project_id = ?`, [project.id]);
    await connection.query(`DELETE FROM project_eligibility WHERE project_id = ?`, [project.id]);
    await connection.query(`DELETE FROM project_dependencies WHERE project_id = ?`, [project.id]);

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

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const [savedProject] = await listProjects({ projectIds: [project.id] });
  return savedProject;
}

const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/projects", async (request, response, next) => {
  try {
    const publishedOnly = request.query.published === "true" || request.query.published === "1";
    const projects = await listProjects({ publishedOnly });
    response.json(projects);
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", async (request, response, next) => {
  try {
    const savedProject = await saveProject(request.body);
    response.json(savedProject);
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ message: "Unexpected server error." });
});

async function start() {
  await ensureSchema();

  app.listen(API_PORT, "127.0.0.1", () => {
    console.log(`Ayuda API listening on http://127.0.0.1:${API_PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start API server", error);
  process.exit(1);
});

process.on("SIGINT", async () => {
  if (pool) {
    await pool.end();
  }

  process.exit(0);
});
