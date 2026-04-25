import { describe, expect, it, vi } from "vitest";
import {
  PROJECTS_API_PATH,
  createEmptyProject,
  loadProjects,
  loadPublishedProjects,
  saveProject,
  saveProjects,
  sanitizeLineList,
  upsertProject,
  validateProjectForPublish,
} from "./projects";
import type { AyudaProject } from "../types";

function createProject(overrides: Partial<AyudaProject> = {}): AyudaProject {
  return {
    ...createEmptyProject(),
    id: "ayuda-test-1",
    name: "Senior Citizen Cash Assistance",
    requirements: ["Valid ID"],
    eligibility: ["Barangay resident"],
    location: {
      address: "Municipal Hall",
      mapsUrl: "",
    },
    schedule: "2026-05-01T09:00",
    beneficiaryTarget: 100,
    dependencies: [
      {
        id: "dep-1",
        label: "Funds Ready",
        ready: true,
      },
    ],
    publishState: "draft",
    status: "upcoming",
    statusNote: "",
    createdAt: "2026-04-25T10:00:00.000Z",
    updatedAt: "2026-04-25T10:00:00.000Z",
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as unknown as Response;
}

describe("project helpers", () => {
  it("validates required fields before publishing", () => {
    const project = createEmptyProject();
    const result = validateProjectForPublish(project);

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Project name is required.");

    const valid = {
      ...project,
      name: "Senior Citizen Cash Assistance",
      requirements: ["Valid ID"],
      eligibility: ["Resident of the barangay"],
      location: { address: "Municipal Hall" },
      schedule: "2026-05-01T09:00",
      beneficiaryTarget: 100,
    };

    expect(validateProjectForPublish(valid).isValid).toBe(true);
  });

  it("sanitizes multiline requirement and eligibility input", () => {
    expect(sanitizeLineList("Valid ID\n\n Proof of residency \r\n")).toEqual([
      "Valid ID",
      "Proof of residency",
    ]);
  });

  it("fetches all projects from the API", async () => {
    const project = createProject();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([project]));

    const loaded = await loadProjects(fetchMock as unknown as typeof fetch);

    expect(fetchMock).toHaveBeenCalledWith(
      PROJECTS_API_PATH,
      expect.objectContaining({ method: "GET" }),
    );
    expect(loaded).toEqual([project]);
  });

  it("fetches only published projects from the API", async () => {
    const project = createProject({ publishState: "published" });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([project]));

    const loaded = await loadPublishedProjects(fetchMock as unknown as typeof fetch);

    expect(fetchMock).toHaveBeenCalledWith(
      `${PROJECTS_API_PATH}?published=true`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(loaded).toEqual([project]);
  });

  it("posts a single project to store it", async () => {
    const project = createProject();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(project));

    const saved = await saveProject(project, fetchMock as unknown as typeof fetch);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(PROJECTS_API_PATH);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      id: project.id,
      name: project.name,
      publishState: project.publishState,
    });
    expect(saved).toEqual(project);
  });

  it("stores multiple projects by posting each one", async () => {
    const first = createProject({ id: "ayuda-test-1" });
    const second = createProject({ id: "ayuda-test-2", name: "PWD Assistance" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(first))
      .mockResolvedValueOnce(jsonResponse(second));

    const saved = await saveProjects([first, second], fetchMock as unknown as typeof fetch);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(saved).toEqual([first, second]);
  });

  it("throws when API responds with an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "db error" }, 500));

    await expect(loadProjects(fetchMock as unknown as typeof fetch)).rejects.toThrow(
      "Project API request failed (500).",
    );
  });

  it("upserts project entries without overriding server timestamps", () => {
    const original = createProject({ id: "ayuda-test-1", updatedAt: "2026-04-25T10:00:00.000Z" });
    const updated = createProject({ id: "ayuda-test-1", updatedAt: "2026-04-25T12:00:00.000Z" });

    const result = upsertProject([original], updated);

    expect(result).toHaveLength(1);
    expect(result[0].updatedAt).toBe("2026-04-25T12:00:00.000Z");
  });
});
