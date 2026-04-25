import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FileText,
  LogOut,
  LogIn,
  MapPin,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createDependency,
  createEmptyProject,
  deleteProject,
  isProjectReady,
  loadProjects,
  saveProject,
  sanitizeLineList,
  upsertProject,
  validateProjectForPublish,
} from "./lib/projects";
import {
  createGoogleMapsEmbedUrl,
  createGoogleMapsUrl,
  hasCoordinates,
  parseGoogleMapsPosition,
  type MapPosition,
} from "./lib/maps";
import type { AyudaProject, DependencyItem, Location, ProjectStatus, PublishState } from "./types";

declare global {
  interface Window {
    google?: any;
  }
}

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";
const AUTH_STORAGE_KEY = "ayuda-admin-authenticated";

const statusLabels: Record<ProjectStatus, string> = {
  upcoming: "Upcoming",
  active: "Active",
  archived: "Archived",
};

const publishLabels: Record<PublishState, string> = {
  draft: "Draft",
  published: "Published",
};

const DEFAULT_MAP_POSITION: MapPosition = {
  lat: 14.5995,
  lng: 120.9842,
};

let googleMapsPromise: Promise<any> | null = null;

function loadGoogleMaps(apiKey: string): Promise<any> {
  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById("google-maps-script");

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google), { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(window.google), { once: true });
    script.addEventListener("error", reject, { once: true });
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(7));
}

function cloneProject(project: AyudaProject): AyudaProject {
  return JSON.parse(JSON.stringify(project)) as AyudaProject;
}

function formatDateTime(value: string): string {
  if (!value) {
    return "No schedule";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatScheduleRange(startValue: string, endValue: string): string {
  if (!startValue && !endValue) {
    return "No schedule";
  }

  if (!endValue) {
    return formatDateTime(startValue);
  }

  if (!startValue) {
    return formatDateTime(endValue);
  }

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startValue} - ${endValue}`;
  }

  const sameDay = start.toDateString() === end.toDateString();
  const dateFormatter = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-PH", {
    timeStyle: "short",
  });

  if (sameDay) {
    return `${dateFormatter.format(start)}, ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
  }

  return `${formatDateTime(startValue)} - ${formatDateTime(endValue)}`;
}

function isNumericOnly(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value.trim());
}

function normalizeProject(project: AyudaProject): AyudaProject {
  return {
    ...project,
    name: project.name.trim(),
    description: project.description.trim(),
    requirements: sanitizeLineList(project.requirements.join("\n")),
    eligibility: sanitizeLineList(project.eligibility.join("\n")),
    location: {
      ...project.location,
      address: project.location.address.trim(),
      city: project.location.city?.trim() ?? "",
      mapsUrl: project.location.mapsUrl?.trim() ?? "",
    },
    schedule: project.schedule,
    scheduleEnd: project.scheduleEnd,
    dependencies: project.dependencies
      .map((item) => ({ ...item, label: item.label.trim() }))
      .filter((item) => item.label),
    beneficiaryTarget: project.beneficiaryTarget.trim(),
    statusNote: project.statusNote.trim(),
  };
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => window.sessionStorage.getItem(AUTH_STORAGE_KEY) === "true",
  );
  const [projects, setProjects] = useState<AyudaProject[]>([]);
  const [draft, setDraft] = useState<AyudaProject>(() => createEmptyProject());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus>("active");
  const [readinessFilter, setReadinessFilter] = useState<"all" | "ready" | "not-ready">("all");
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [formMessage, setFormMessage] = useState("");
  const [newDependencyLabel, setNewDependencyLabel] = useState("");
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void refreshProjects();
  }, [isAuthenticated]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesQuery =
        !normalizedQuery ||
        project.name.toLowerCase().includes(normalizedQuery) ||
        project.description.toLowerCase().includes(normalizedQuery) ||
        project.location.address.toLowerCase().includes(normalizedQuery) ||
        (project.location.city ?? "").toLowerCase().includes(normalizedQuery);
      const matchesStatus = project.status === statusFilter;
      const ready = isProjectReady(project);
      const matchesReadiness =
        readinessFilter === "all" ||
        (readinessFilter === "ready" && ready) ||
        (readinessFilter === "not-ready" && !ready);

      return matchesQuery && matchesStatus && matchesReadiness;
    });
  }, [projects, query, readinessFilter, statusFilter]);

  const publishValidation = useMemo(() => validateProjectForPublish(normalizeProject(draft)), [draft]);
  const draftIsSaved = projects.some((project) => project.id === draft.id);
  const activeProjects = projects.filter((project) => project.status === "active").length;
  const upcomingProjects = projects.filter((project) => project.status === "upcoming").length;
  const archivedProjects = projects.filter((project) => project.status === "archived").length;

  function handleLogin() {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, "true");
    setIsAuthenticated(true);
  }

  function handleLogout() {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    setIsAuthenticated(false);
  }

  async function refreshProjects() {
    try {
      setIsLoadingProjects(true);
      setFormErrors([]);
      const loadedProjects = await loadProjects();
      setProjects(loadedProjects);
    } catch {
      setFormErrors(["Could not load projects from the database."]);
      setFormMessage("");
    } finally {
      setIsLoadingProjects(false);
    }
  }

  function startNewProject() {
    setDraft(createEmptyProject());
    setSelectedProjectId(null);
    setFormErrors([]);
    setFormMessage("");
    setNewDependencyLabel("");
  }

  function editProject(project: AyudaProject) {
    setDraft(cloneProject(project));
    setSelectedProjectId(project.id);
    setFormErrors([]);
    setFormMessage("");
    setNewDependencyLabel("");
  }

  async function persistProject(project: AyudaProject, message: string) {
    const normalized = normalizeProject(project);

    try {
      setIsSyncing(true);
      const savedProject = await saveProject(normalized);
      setProjects((current) => upsertProject(current, savedProject));
      setDraft(cloneProject(savedProject));
      setSelectedProjectId(savedProject.id);
      setFormErrors([]);
      setFormMessage(message);
    } catch {
      setFormErrors(["Could not save the project to the database."]);
      setFormMessage("");
    } finally {
      setIsSyncing(false);
    }
  }

  async function saveDraft() {
    const normalized = normalizeProject(draft);

    if (!normalized.name) {
      setFormErrors(["Project name is required to save."]);
      setFormMessage("");
      return;
    }

    if (normalized.beneficiaryTarget && isNumericOnly(normalized.beneficiaryTarget)) {
      setFormErrors(["Beneficiary target must be a classification, not a number."]);
      setFormMessage("");
      return;
    }

    if (normalized.publishState === "published") {
      const validation = validateProjectForPublish(normalized);

      if (!validation.isValid) {
        setFormErrors(validation.errors);
        setFormMessage("");
        return;
      }
    }

    await persistProject(
      normalized,
      normalized.publishState === "published" ? "Changes saved to database." : "Draft saved to database.",
    );
  }

  async function publishProject() {
    const normalized = normalizeProject(draft);
    const validation = validateProjectForPublish(normalized);

    if (!validation.isValid) {
      setFormErrors(validation.errors);
      setFormMessage("");
      return;
    }

    await persistProject(
      {
        ...normalized,
        publishState: "published",
        status: normalized.status || "upcoming",
      },
      "Ayuda announcement published.",
    );
  }

  async function deleteCurrentProject() {
    if (!draftIsSaved) {
      return;
    }

    const shouldDelete = window.confirm(`Delete "${draft.name || "this project"}"? This action cannot be undone.`);

    if (!shouldDelete) {
      return;
    }

    try {
      setIsSyncing(true);
      await deleteProject(draft.id);
      setProjects((current) => current.filter((project) => project.id !== draft.id));
      setDraft(createEmptyProject());
      setSelectedProjectId(null);
      setFormErrors([]);
      setFormMessage("Project deleted from database.");
      setNewDependencyLabel("");
    } catch {
      setFormErrors(["Could not delete the project from the database."]);
      setFormMessage("");
    } finally {
      setIsSyncing(false);
    }
  }

  function updateDraftField<K extends keyof AyudaProject>(key: K, value: AyudaProject[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setFormMessage("");
  }

  function updateDependency(id: string, updates: Partial<DependencyItem>) {
    setDraft((current) => ({
      ...current,
      dependencies: current.dependencies.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    }));
    setFormMessage("");
  }

  function removeDependency(id: string) {
    setDraft((current) => ({
      ...current,
      dependencies: current.dependencies.filter((item) => item.id !== id),
    }));
    setFormMessage("");
  }

  function addDependency() {
    const label = newDependencyLabel.trim();

    if (!label) {
      return;
    }

    setDraft((current) => ({
      ...current,
      dependencies: [...current.dependencies, createDependency(label)],
    }));
    setNewDependencyLabel("");
    setFormMessage("");
  }

  if (!isAuthenticated) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Admin Console</p>
          <h1>Ayuda Project Manager</h1>
        </div>
        <div className="topbar-actions">
          <Metric label="Active" value={activeProjects} />
          <Metric label="Upcoming" value={upcomingProjects} />
          <Metric label="Archived" value={archivedProjects} />
          <button className="button ghost" onClick={handleLogout} type="button">
            <LogOut aria-hidden="true" size={18} />
            Logout
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="project-panel" aria-label="Ayuda projects">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Announcements</p>
              <h2>Project Queue</h2>
            </div>
            <button className="icon-button" onClick={startNewProject} title="New project" type="button">
              <Plus aria-hidden="true" size={20} />
            </button>
          </div>

          <label className="search-box">
            <Search aria-hidden="true" size={18} />
            <input
              aria-label="Search projects"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, venue, or city"
              value={query}
            />
          </label>

          <div className="filters" aria-label="Project filters">
            <select
              aria-label="Status filter"
              onChange={(event) => setStatusFilter(event.target.value as ProjectStatus)}
              value={statusFilter}
            >
              <option value="active">Active</option>
              <option value="upcoming">Upcoming</option>
              <option value="archived">Archived</option>
            </select>
            <select
              aria-label="Readiness filter"
              onChange={(event) => setReadinessFilter(event.target.value as "all" | "ready" | "not-ready")}
              value={readinessFilter}
            >
              <option value="all">All</option>
              <option value="ready">All ready</option>
              <option value="not-ready">Missing items</option>
            </select>
          </div>

          <div className="project-list">
            {isLoadingProjects ? (
              <div className="empty-state">
                <FileText aria-hidden="true" size={28} />
                <p>Loading projects...</p>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="empty-state">
                <FileText aria-hidden="true" size={28} />
                <p>No projects match the current filters.</p>
              </div>
            ) : (
              filteredProjects.map((project) => (
                <button
                  className={`project-row ${selectedProjectId === project.id ? "active" : ""}`}
                  key={project.id}
                  onClick={() => editProject(project)}
                  type="button"
                >
                  <span className="project-row-main">
                    <strong>{project.name}</strong>
                    <span>
                      <MapPin aria-hidden="true" size={14} />
                      {project.location.address || "No venue"}
                      {project.location.city ? `, ${project.location.city}` : ""}
                    </span>
                    <span>
                      <CalendarClock aria-hidden="true" size={14} />
                      {formatScheduleRange(project.schedule, project.scheduleEnd)}
                    </span>
                  </span>
                  <span className="project-row-meta">
                    <span className={`badge ${project.publishState}`}>{publishLabels[project.publishState]}</span>
                    <span className={`badge status-${project.status}`}>{statusLabels[project.status]}</span>
                    <span className={`readiness ${isProjectReady(project) ? "ready" : "blocked"}`}>
                      {isProjectReady(project) ? "Ready" : "Missing"}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="editor-panel" aria-label="Project editor">
          <div className="editor-title">
            <div>
              <p className="eyebrow">{draftIsSaved ? "Editing Project" : "New Project"}</p>
              <h2>{draft.name || "Untitled Ayuda"}</h2>
            </div>
            <div className="editor-actions">
              {draftIsSaved ? (
                <button className="button danger" disabled={isSyncing} onClick={() => void deleteCurrentProject()} type="button">
                  <Trash2 aria-hidden="true" size={18} />
                  Delete
                </button>
              ) : null}
              <button className="button secondary" disabled={isSyncing} onClick={() => void saveDraft()} type="button">
                <Save aria-hidden="true" size={18} />
                {draft.publishState === "published" ? "Save Changes" : "Save Draft"}
              </button>
              <button
                className="button primary"
                disabled={draft.publishState === "published" || !publishValidation.isValid || isSyncing}
                onClick={() => void publishProject()}
                type="button"
              >
                <Send aria-hidden="true" size={18} />
                {draft.publishState === "published" ? "Published" : "Publish"}
              </button>
            </div>
          </div>

          {formMessage ? <div className="message success">{formMessage}</div> : null}
          {formErrors.length > 0 ? (
            <div className="message error">
              <AlertCircle aria-hidden="true" size={18} />
              <div>
                {formErrors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="editor-grid">
            <section className="form-section wide">
              <div className="section-heading">
                <Edit3 aria-hidden="true" size={18} />
                <h3>Announcement Details</h3>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Name</span>
                  <input
                    onChange={(event) => updateDraftField("name", event.target.value)}
                    placeholder="Example: Senior Citizen Cash Assistance"
                    value={draft.name}
                  />
                </label>

                <label className="field">
                  <span>Start Date & Time</span>
                  <input
                    onChange={(event) => updateDraftField("schedule", event.target.value)}
                    type="datetime-local"
                    value={draft.schedule}
                  />
                </label>

                <label className="field">
                  <span>End Date & Time</span>
                  <input
                    onChange={(event) => updateDraftField("scheduleEnd", event.target.value)}
                    type="datetime-local"
                    value={draft.scheduleEnd}
                  />
                </label>

                <label className="field">
                  <span>Beneficiary Classification</span>
                  <input
                    list="beneficiary-classifications"
                    onChange={(event) => updateDraftField("beneficiaryTarget", event.target.value)}
                    placeholder="Example: PWDs, Senior Citizen"
                    value={draft.beneficiaryTarget}
                  />
                  <datalist id="beneficiary-classifications">
                    <option value="PWDs" />
                    <option value="Senior Citizen" />
                    <option value="Solo Parents" />
                    <option value="Students" />
                    <option value="Fisherfolk" />
                  </datalist>
                </label>
              </div>
            </section>

            <section className="form-section wide">
              <div className="section-heading">
                <MapPin aria-hidden="true" size={18} />
                <h3>Venue</h3>
              </div>
              <GoogleMapsLocationField
                location={draft.location}
                onChange={(location) => updateDraftField("location", location)}
              />
            </section>

            <section className="form-section wide">
              <div className="section-heading">
                <FileText aria-hidden="true" size={18} />
                <h3>Description</h3>
              </div>
              <label className="field full">
                <span>Details</span>
                <textarea
                  onChange={(event) => updateDraftField("description", event.target.value)}
                  placeholder="Add announcement details for beneficiaries."
                  rows={3}
                  value={draft.description}
                />
              </label>
            </section>

            <section className="form-section">
              <div className="section-heading">
                <FileText aria-hidden="true" size={18} />
                <h3>Requirements</h3>
              </div>
              <label className="field">
                <span>One item per line</span>
                <textarea
                  onChange={(event) => updateDraftField("requirements", event.target.value.split(/\r?\n/))}
                  placeholder="Valid ID&#10;Proof of residency"
                  rows={7}
                  value={draft.requirements.join("\n")}
                />
              </label>
            </section>

            <section className="form-section">
              <div className="section-heading">
                <Users aria-hidden="true" size={18} />
                <h3>Eligibility</h3>
              </div>
              <label className="field">
                <span>One rule per line</span>
                <textarea
                  onChange={(event) => updateDraftField("eligibility", event.target.value.split(/\r?\n/))}
                  placeholder="Resident of the barangay&#10;Registered beneficiary group"
                  rows={7}
                  value={draft.eligibility.join("\n")}
                />
              </label>
            </section>

            <section className="form-section">
              <div className="section-heading">
                <ClipboardCheck aria-hidden="true" size={18} />
                <h3>Dependency Checklist</h3>
              </div>
              <div className="dependency-list">
                {draft.dependencies.map((dependency) => (
                  <div className="dependency-row" key={dependency.id}>
                    <label>
                      <input
                        checked={dependency.ready}
                        onChange={(event) => updateDependency(dependency.id, { ready: event.target.checked })}
                        type="checkbox"
                      />
                      <span>{dependency.label}</span>
                    </label>
                    <button
                      className="text-button"
                      onClick={() => removeDependency(dependency.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="inline-control">
                <input
                  onChange={(event) => setNewDependencyLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addDependency();
                    }
                  }}
                  placeholder="Add checklist item"
                  value={newDependencyLabel}
                />
                <button className="button compact" onClick={addDependency} type="button">
                  <Plus aria-hidden="true" size={16} />
                  Add
                </button>
              </div>
              <div className={`readiness-summary ${isProjectReady(draft) ? "ready" : "blocked"}`}>
                {isProjectReady(draft) ? (
                  <CheckCircle2 aria-hidden="true" size={18} />
                ) : (
                  <AlertCircle aria-hidden="true" size={18} />
                )}
                {isProjectReady(draft) ? "All dependencies are ready." : "Some dependencies still need action."}
              </div>
            </section>

            <section className="form-section">
              <div className="section-heading">
                <CalendarClock aria-hidden="true" size={18} />
                <h3>Status Updates</h3>
              </div>
              <div className="form-grid single">
                <label className="field">
                  <span>Status</span>
                  <select
                    disabled={draft.publishState === "draft"}
                    onChange={(event) => updateDraftField("status", event.target.value as ProjectStatus)}
                    value={draft.status}
                  >
                    <option value="active">Active</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>

                <label className="field">
                  <span>Status Note</span>
                  <textarea
                    disabled={draft.publishState === "draft"}
                    onChange={(event) => updateDraftField("statusNote", event.target.value)}
                    placeholder="Reason, new schedule, or advisory"
                    rows={4}
                    value={draft.statusNote}
                  />
                </label>
              </div>
            </section>
          </div>

          {!publishValidation.isValid ? (
            <div className="publish-checklist">
              <strong>Publish requirements</strong>
              {publishValidation.errors.map((error) => (
                <span key={error}>{error}</span>
              ))}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

interface LoginViewProps {
  onLogin: () => void;
}

function LoginView({ onLogin }: LoginViewProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      setError("");
      onLogin();
      return;
    }

    setError("Invalid admin credentials.");
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Ayuda Admin</p>
          <h1>Sign in</h1>
        </div>
        <label className="field">
          <span>Username</span>
          <input autoComplete="username" onChange={(event) => setUsername(event.target.value)} value={username} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>
        {error ? <div className="message error">{error}</div> : null}
        <button className="button primary full" type="submit">
          <LogIn aria-hidden="true" size={18} />
          Login
        </button>
      </form>
    </main>
  );
}

interface MetricProps {
  label: string;
  value: number;
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

interface GoogleMapsLocationFieldProps {
  location: Location;
  onChange: (location: Location) => void;
}

function GoogleMapsLocationField({ location, onChange }: GoogleMapsLocationFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const locationRef = useRef(location);
  const onChangeRef = useRef(onChange);
  const [mapsState, setMapsState] = useState<"manual" | "loading" | "ready" | "error">("manual");
  const [mapTilesLoaded, setMapTilesLoaded] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  const embedUrl = createGoogleMapsEmbedUrl(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!apiKey) {
      setMapsState("manual");
      setMapTilesLoaded(false);
      return;
    }

    setMapsState("loading");
    setMapTilesLoaded(false);
    loadGoogleMaps(apiKey)
      .then(() => setMapsState("ready"))
      .catch(() => setMapsState("error"));
  }, [apiKey]);

  useEffect(() => {
    if (mapsState !== "ready" || !inputRef.current || !window.google?.maps?.places) {
      return;
    }

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "geometry", "name", "place_id", "url"],
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const lat = place.geometry?.location?.lat();
      const lng = place.geometry?.location?.lng();
      const address = place.formatted_address || place.name || inputRef.current?.value || "";
      const selectedPosition =
        typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)
          ? { lat: roundCoordinate(lat), lng: roundCoordinate(lng) }
          : null;
      const currentLocation = locationRef.current;

      onChangeRef.current({
        ...currentLocation,
        address,
        placeId: place.place_id,
        lat: selectedPosition?.lat,
        lng: selectedPosition?.lng,
        mapsUrl: place.url || (selectedPosition ? createGoogleMapsUrl(selectedPosition) : currentLocation.mapsUrl || ""),
      });
    });

    return () => listener.remove();
  }, [mapsState]);

  useEffect(() => {
    if (mapsState !== "ready" || !mapRef.current || !window.google?.maps) {
      return;
    }

    if (!mapInstanceRef.current) {
      const initialCenter = hasCoordinates(locationRef.current) ? locationRef.current : DEFAULT_MAP_POSITION;

      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: initialCenter,
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
      });

      window.google.maps.event.addListenerOnce(mapInstanceRef.current, "tilesloaded", () => {
        setMapTilesLoaded(true);
      });
    }

    const listener = mapInstanceRef.current.addListener("click", (event: any) => {
      if (!event.latLng) {
        return;
      }

      const clickedPosition: MapPosition = {
        lat: roundCoordinate(event.latLng.lat()),
        lng: roundCoordinate(event.latLng.lng()),
      };
      const currentLocation = locationRef.current;
      const fallbackAddress = currentLocation.address || `${clickedPosition.lat}, ${clickedPosition.lng}`;
      const mapsUrl = createGoogleMapsUrl(clickedPosition);

      onChangeRef.current({
        ...currentLocation,
        address: fallbackAddress,
        placeId: undefined,
        lat: clickedPosition.lat,
        lng: clickedPosition.lng,
        mapsUrl,
      });

      mapInstanceRef.current.panTo(clickedPosition);

      if (!geocoderRef.current && window.google?.maps?.Geocoder) {
        geocoderRef.current = new window.google.maps.Geocoder();
      }

      geocoderRef.current?.geocode({ location: clickedPosition }, (results: any[] | null, status: string) => {
        const result = status === "OK" ? results?.[0] : null;

        if (!result) {
          return;
        }

        const latestLocation = locationRef.current;

        if (latestLocation.lat !== clickedPosition.lat || latestLocation.lng !== clickedPosition.lng) {
          return;
        }

        onChangeRef.current({
          ...latestLocation,
          address: result.formatted_address || latestLocation.address,
          placeId: result.place_id,
          mapsUrl,
        });
      });
    });

    return () => listener.remove();
  }, [mapsState]);

  useEffect(() => {
    if (mapsState !== "ready" || !window.google?.maps || !mapInstanceRef.current) {
      return;
    }

    if (!hasCoordinates(location)) {
      mapInstanceRef.current.setCenter(DEFAULT_MAP_POSITION);

      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }

      return;
    }

    const center = { lat: location.lat, lng: location.lng };

    mapInstanceRef.current.setCenter(center);

    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        map: mapInstanceRef.current,
        position: center,
        title: location.address || "Selected venue",
      });
    } else {
      markerRef.current.setMap(mapInstanceRef.current);
      markerRef.current.setPosition(center);
      markerRef.current.setTitle(location.address || "Selected venue");
    }
  }, [location.address, location.lat, location.lng, mapsState]);

  const showEmbedPreview = Boolean(embedUrl);
  const showPlaceholder = !embedUrl && (mapsState !== "ready" || !mapTilesLoaded);
  const showInteractiveMap = mapsState === "ready" && mapTilesLoaded && !embedUrl;

  return (
    <div className="location-grid">
      <div className="location-fields">
        <label className="field">
          <span>Venue Address</span>
          <input
            onChange={(event) => onChange({ ...location, address: event.target.value })}
            placeholder="Search or enter venue address"
            ref={inputRef}
            value={location.address}
          />
        </label>
        <label className="field">
          <span>City</span>
          <input
            onChange={(event) => onChange({ ...location, city: event.target.value })}
            placeholder="Example: Manila"
            value={location.city ?? ""}
          />
        </label>
        <label className="field">
          <span>Google Maps URL</span>
          <input
            onChange={(event) => {
              const mapsUrl = event.target.value;
              const position = parseGoogleMapsPosition(mapsUrl);

              onChange({
                ...location,
                lat: position?.lat ?? location.lat,
                lng: position?.lng ?? location.lng,
                mapsUrl,
              });
            }}
            placeholder="https://maps.google.com/..."
            value={location.mapsUrl ?? ""}
          />
        </label>
        <div className="location-meta">
          <span className={`map-state ${mapsState}`}>
            {mapsState === "ready"
              ? "Google Maps ready"
              : mapsState === "loading"
                ? "Loading Google Maps"
                : mapsState === "error"
                  ? "Google Maps failed to load"
                  : "Manual address mode"}
          </span>
          {location.mapsUrl ? (
            <a className="button link-button" href={location.mapsUrl} rel="noreferrer" target="_blank">
              <MapPin aria-hidden="true" size={16} />
              Open Map
            </a>
          ) : null}
        </div>
      </div>
      <div className="map-preview">
        {showEmbedPreview ? (
          <iframe
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={embedUrl}
            title="Google Maps venue preview"
          />
        ) : null}
        {showPlaceholder ? (
          <div className="map-placeholder">
            <MapPin aria-hidden="true" size={28} />
            <span>{location.address || "No venue selected"}</span>
          </div>
        ) : null}
        {mapsState === "ready" ? (
          <div
            aria-label="Interactive Google Maps venue selector"
            className={`map-canvas ${showInteractiveMap ? "is-visible" : ""}`}
            ref={mapRef}
          />
        ) : null}
      </div>
    </div>
  );
}

export default App;
