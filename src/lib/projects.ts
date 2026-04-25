import type { AyudaProject, DependencyItem, ProjectStatus } from "../types";
import { parseGoogleMapsPosition } from "./maps";

export const PROJECTS_API_PATH = "/api/projects";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export const defaultDependencyLabels = ["Funds Ready", "Venue Ready", "Staff Ready"];

function normalizeStatus(value: unknown): ProjectStatus {
  if (value === "active" || value === "ongoing") {
    return "active";
  }

  if (value === "archived" || value === "moved" || value === "cancelled") {
    return "archived";
  }

  return "upcoming";
}

function normalizeBeneficiaryClassification(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isNumericOnly(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value.trim());
}

function normalizeProject(project: AyudaProject): AyudaProject {
  const mapPosition = parseGoogleMapsPosition(project.location?.mapsUrl);

  return {
    ...project,
    name: typeof project.name === "string" ? project.name : "",
    requirements: Array.isArray(project.requirements)
      ? project.requirements.filter((item): item is string => typeof item === "string")
      : [],
    eligibility: Array.isArray(project.eligibility)
      ? project.eligibility.filter((item): item is string => typeof item === "string")
      : [],
    location: {
      address: project.location?.address ?? "",
      placeId: project.location?.placeId,
      lat: project.location?.lat ?? mapPosition?.lat,
      lng: project.location?.lng ?? mapPosition?.lng,
      mapsUrl: project.location?.mapsUrl ?? "",
    },
    schedule: project.schedule ?? "",
    beneficiaryTarget: normalizeBeneficiaryClassification(project.beneficiaryTarget),
    dependencies: Array.isArray(project.dependencies)
      ? project.dependencies
          .filter((dependency): dependency is DependencyItem => Boolean(dependency?.id && dependency?.label))
          .map((dependency) => ({
            id: dependency.id,
            label: dependency.label,
            ready: Boolean(dependency.ready),
          }))
      : [],
    publishState: project.publishState === "published" ? "published" : "draft",
    status: normalizeStatus(project.status),
    statusNote: project.statusNote ?? "",
    createdAt: project.createdAt ?? new Date().toISOString(),
    updatedAt: project.updatedAt ?? new Date().toISOString(),
  };
}

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createDependency(label: string, ready = false): DependencyItem {
  return {
    id: createId("dep"),
    label,
    ready,
  };
}

export function createEmptyProject(): AyudaProject {
  const now = new Date().toISOString();

  return {
    id: createId("ayuda"),
    name: "",
    requirements: [],
    eligibility: [],
    location: {
      address: "",
      mapsUrl: "",
    },
    schedule: "",
    beneficiaryTarget: "",
    dependencies: defaultDependencyLabels.map((label) => createDependency(label)),
    publishState: "draft",
    status: "upcoming",
    statusNote: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeLineList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateProjectForPublish(project: AyudaProject): ValidationResult {
  const errors: string[] = [];

  if (!project.name.trim()) {
    errors.push("Project name is required.");
  }

  if (!project.location.address.trim()) {
    errors.push("Venue address is required.");
  }

  if (!project.schedule) {
    errors.push("Date and time are required.");
  }

  if (!project.beneficiaryTarget.trim()) {
    errors.push("Beneficiary classification is required.");
  } else if (isNumericOnly(project.beneficiaryTarget)) {
    errors.push("Beneficiary target must be a classification, not a number.");
  }

  if (project.requirements.filter(Boolean).length === 0) {
    errors.push("Add at least one requirement.");
  }

  if (project.eligibility.filter(Boolean).length === 0) {
    errors.push("Add at least one eligibility rule.");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function isProjectReady(project: AyudaProject): boolean {
  return project.dependencies.length > 0 && project.dependencies.every((item) => item.ready);
}

async function requestProjects<T>(
  path: string,
  options: RequestInit,
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  const response = await fetchFn(path, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Project API request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

export async function loadProjects(fetchFn: typeof fetch = fetch): Promise<AyudaProject[]> {
  const projects = await requestProjects<AyudaProject[]>(PROJECTS_API_PATH, { method: "GET" }, fetchFn);
  return Array.isArray(projects) ? projects.map(normalizeProject) : [];
}

export async function loadPublishedProjects(fetchFn: typeof fetch = fetch): Promise<AyudaProject[]> {
  const projects = await requestProjects<AyudaProject[]>(`${PROJECTS_API_PATH}?published=true`, { method: "GET" }, fetchFn);
  return Array.isArray(projects) ? projects.map(normalizeProject) : [];
}

export async function saveProject(project: AyudaProject, fetchFn: typeof fetch = fetch): Promise<AyudaProject> {
  const saved = await requestProjects<AyudaProject>(
    PROJECTS_API_PATH,
    {
      method: "POST",
      body: JSON.stringify(normalizeProject(project)),
    },
    fetchFn,
  );

  return normalizeProject(saved);
}

export async function saveProjects(
  projects: AyudaProject[],
  fetchFn: typeof fetch = fetch,
): Promise<AyudaProject[]> {
  const savedProjects: AyudaProject[] = [];

  for (const project of projects) {
    savedProjects.push(await saveProject(project, fetchFn));
  }

  return savedProjects;
}

export function upsertProject(projects: AyudaProject[], project: AyudaProject): AyudaProject[] {
  const existingIndex = projects.findIndex((item) => item.id === project.id);

  if (existingIndex === -1) {
    return [project, ...projects];
  }

  return projects.map((item) => (item.id === project.id ? project : item));
}
