-- Ka'Ayuda PostgreSQL Schema (converted from MariaDB)

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  address VARCHAR(500) NOT NULL DEFAULT '',
  city VARCHAR(120) NOT NULL DEFAULT '',
  place_id VARCHAR(255) DEFAULT NULL,
  lat NUMERIC(10,7) DEFAULT NULL,
  lng NUMERIC(10,7) DEFAULT NULL,
  maps_url VARCHAR(500) DEFAULT NULL,
  schedule_at TIMESTAMP DEFAULT NULL,
  schedule_end_at TIMESTAMP DEFAULT NULL,
  beneficiary_target VARCHAR(120) NOT NULL DEFAULT '',
  publish_state VARCHAR(20) NOT NULL DEFAULT 'draft',
  status VARCHAR(20) NOT NULL DEFAULT 'upcoming',
  status_note TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS project_requirements (
  id BIGSERIAL PRIMARY KEY,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_text TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_eligibility (
  id BIGSERIAL PRIMARY KEY,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_text TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_dependencies (
  id VARCHAR(80) NOT NULL,
  project_id VARCHAR(80) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  ready SMALLINT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_projects_schedule_at ON projects(schedule_at);
CREATE INDEX IF NOT EXISTS idx_projects_publish_state ON projects(publish_state);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_city ON projects(city);
CREATE INDEX IF NOT EXISTS idx_project_requirements_project_id ON project_requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_project_eligibility_project_id ON project_eligibility(project_id);
CREATE INDEX IF NOT EXISTS idx_project_dependencies_project_id ON project_dependencies(project_id);
