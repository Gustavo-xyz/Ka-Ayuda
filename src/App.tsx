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
  Users,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createDependency,
  createEmptyProject,
  isProjectReady,
  loadProjects,
  saveProject,
  sanitizeLineList,
  upsertProject,
  validateProjectForPublish,
} from "./lib/projects";
import { createGoogleMapsEmbedUrl, createGoogleMapsUrl, hasCoordinates, type MapPosition } from "./lib/maps";
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

<<<<<<< Updated upstream
const DEFAULT_MAP_CENTER = { lat: 14.5995, lng: 120.9842 };
=======
const DEFAULT_MAP_POSITION: MapPosition = {
  lat: 14.5995,
  lng: 120.9842,
};
>>>>>>> Stashed changes

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

function createMapsSearchUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function normalizeProject(project: AyudaProject): AyudaProject {
  return {
    ...project,
    name: project.name.trim(),
    requirements: sanitizeLineList(project.requirements.join("\n")),
    eligibility: sanitizeLineList(project.eligibility.join("\n")),
    location: {
      ...project.location,
      address: project.location.address.trim(),
      mapsUrl: project.location.mapsUrl?.trim() ?? "",
    },
    dependencies: project.dependencies
      .map((item) => ({ ...item, label: item.label.trim() }))
      .filter((item) => item.label),
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
        project.location.address.toLowerCase().includes(normalizedQuery);
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
  const publishedProjects = projects.filter((project) => project.publishState === "published").length;
  const readyProjects = projects.filter(isProjectReady).length;

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
          <Metric label="Projects" value={projects.length} />
          <Metric label="Published" value={publishedProjects} />
          <Metric label="Ready" value={readyProjects} />
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
              placeholder="Search name or venue"
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
              <option value="all">All readiness</option>
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
                    </span>
                    <span>
                      <CalendarClock aria-hidden="true" size={14} />
                      {formatDateTime(project.schedule)}
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
                  <span>Date & Time</span>
                  <input
                    onChange={(event) => updateDraftField("schedule", event.target.value)}
                    type="datetime-local"
                    value={draft.schedule}
                  />
                </label>

                <label className="field">
                  <span>Beneficiary Target</span>
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

                <label className="field">
                  <span>Publish State</span>
                  <input readOnly value={publishLabels[draft.publishState]} />
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
      return;
    }

    setMapsState("loading");
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
<<<<<<< Updated upstream
=======
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

>>>>>>> Stashed changes
      return;
    }

    const hasLocation = location.lat != null && location.lng != null;
    const center = hasLocation ? { lat: location.lat!, lng: location.lng! } : DEFAULT_MAP_CENTER;

    mapInstanceRef.current.setCenter(center);

    if (hasLocation && !markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        map: mapInstanceRef.current,
        position: center,
        title: location.address || "Selected venue",
      });
    } else if (hasLocation) {
      markerRef.current.setMap(mapInstanceRef.current);
      markerRef.current.setPosition(center);
<<<<<<< Updated upstream
    } else if (markerRef.current) {
      markerRef.current.setMap(null);
    }

    const clickListener = mapInstanceRef.current.addListener("click", (event: any) => {
      if (!event.latLng) {
        return;
      }

      const clickedPos = {
        lat: event.latLng.lat(),
        lng: event.latLng.lng(),
      };

      onChange({
        ...location,
        lat: clickedPos.lat,
        lng: clickedPos.lng,
        placeId: undefined,
        mapsUrl: createMapsSearchUrl(clickedPos.lat, clickedPos.lng),
      });

      console.log(`Clicked at: ${clickedPos.lat}, ${clickedPos.lng}`);
    });

    return () => clickListener.remove();
  }, [location, mapsState, onChange]);
=======
      markerRef.current.setTitle(location.address || "Selected venue");
    }
  }, [location.address, location.lat, location.lng, mapsState]);
>>>>>>> Stashed changes

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
          <span>Google Maps URL</span>
          <input
            onChange={(event) => onChange({ ...location, mapsUrl: event.target.value })}
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
      <div className="map-preview" ref={mapRef}>
<<<<<<< Updated upstream
        {mapsState !== "ready" ? (
=======
        {mapsState !== "ready" && embedUrl ? (
          <iframe
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={embedUrl}
            title="Google Maps venue preview"
          />
        ) : mapsState !== "ready" ? (
>>>>>>> Stashed changes
          <div>
            <MapPin aria-hidden="true" size={28} />
            <span>{location.address || "No venue selected"}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default App;
