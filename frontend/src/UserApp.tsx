import {
  CalendarClock,
  CheckCircle2,
  FileText,
  ListChecks,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { loadPublishedProjects } from "./lib/projects";
import { createGoogleMapsEmbedUrl, createGoogleMapsUrl, hasCoordinates } from "./lib/maps";
import {
  createDistanceDetailState,
  getLocationButtonLabel,
  getLocationStatusMessage,
  getProjectDistanceLabel,
  requestUserLocation,
  type UserLocationStatus,
} from "./lib/userLocation";
import type { AyudaProject, ProjectStatus } from "./types";

type PublishedStatusFilter = "" | Extract<ProjectStatus, "upcoming" | "active">;
type CityFilter = "" | string;
type BeneficiaryFilter = "" | string;
type UserCoordinates = { accuracyMeters?: number; lat: number; lng: number };

interface CityFilterOption {
  label: string;
  value: string;
}

interface BeneficiaryFilterOption {
  label: string;
  value: string;
}

const statusLabels: Record<ProjectStatus, string> = {
  upcoming: "Upcoming",
  active: "Active",
  archived: "Archived",
};

const claimingSteps = ["Registration", "Submit Requirements", "Verification", "Claim Ayuda"];

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

function formatScheduleSummary(startValue: string, endValue: string): string {
  if (!endValue) {
    return formatDateTime(startValue);
  }

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return formatDateTime(startValue);
  }

  const sameDay = start.toDateString() === end.toDateString();
  const timeFormatter = new Intl.DateTimeFormat("en-PH", {
    timeStyle: "short",
  });

  if (sameDay) {
    return `${formatDateTime(startValue)} - ${timeFormatter.format(end)}`;
  }

  return `${formatDateTime(startValue)} - ${formatDateTime(endValue)}`;
}

function formatScheduleDate(value: string): string {
  if (!value) {
    return "No schedule";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "full",
  }).format(date);
}

function formatScheduleDateRange(startValue: string, endValue: string): string {
  if (!startValue) {
    return "Timeframe to be announced";
  }

  if (!endValue) {
    return formatScheduleDate(startValue);
  }

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Timeframe to be announced";
  }

  const formatter = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "full",
  });

  if (start.toDateString() === end.toDateString()) {
    return formatter.format(start);
  }

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatScheduleTimeframe(startValue: string, endValue: string): string {
  if (!startValue) {
    return "Timeframe to be announced";
  }

  const start = new Date(startValue);
  const end = endValue ? new Date(endValue) : null;

  if (Number.isNaN(start.getTime())) {
    return "Timeframe to be announced";
  }

  const formatter = new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (!end || Number.isNaN(end.getTime())) {
    return `${formatter.format(start)} - end time to be announced`;
  }

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function createDescriptionPreview(value: string, maxLength = 180): string {
  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function formatCoordinateLabel(value: UserCoordinates): string {
  return `${value.lat.toFixed(7)}, ${value.lng.toFixed(7)}`;
}

function formatAccuracyLabel(accuracyMeters: number | undefined): string {
  if (typeof accuracyMeters !== "number" || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) {
    return "";
  }

  return `Accuracy ±${Math.round(accuracyMeters)} m`;
}

function getLocationTone(status: UserLocationStatus): "ready" | "neutral" | "blocked" {
  if (status === "granted") {
    return "ready";
  }

  if (status === "denied" || status === "error" || status === "unsupported") {
    return "blocked";
  }

  return "neutral";
}

function UserApp() {
  const [projects, setProjects] = useState<AyudaProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PublishedStatusFilter>("");
  const [cityFilter, setCityFilter] = useState<CityFilter>("");
  const [beneficiaryFilter, setBeneficiaryFilter] = useState<BeneficiaryFilter>("");
  const [eligibilityAnswers, setEligibilityAnswers] = useState<Record<string, Record<number, boolean>>>({});
  const [documentChecks, setDocumentChecks] = useState<Record<string, Record<number, boolean>>>({});
  const [descriptionDialogProject, setDescriptionDialogProject] = useState<AyudaProject | null>(null);
  const [loadError, setLoadError] = useState("");
  const [userLocation, setUserLocation] = useState<UserCoordinates | null>(null);
  const [userLocationStatus, setUserLocationStatus] = useState<UserLocationStatus>("idle");
  const [userLocationError, setUserLocationError] = useState("");

  useEffect(() => {
    void refreshProjects();

    const refreshTimer = window.setInterval(() => {
      void refreshProjects();
    }, 5000);
    const handleFocus = () => {
      void refreshProjects();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  useEffect(() => {
    if (!descriptionDialogProject) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDescriptionDialogProject(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [descriptionDialogProject]);

  useEffect(() => {
    if (userLocationStatus !== "idle") {
      return;
    }

    void handleUseMyLocation();
  }, [userLocationStatus]);

  const cityFilterOptions = useMemo<CityFilterOption[]>(() => {
    const cityMap = new Map<string, string>();

    for (const project of projects) {
      if (project.status !== "upcoming" && project.status !== "active") {
        continue;
      }

      const city = (project.location.city ?? "").trim();

      if (!city) {
        continue;
      }

      const key = city.toLowerCase();

      if (!cityMap.has(key)) {
        cityMap.set(key, city);
      }
    }

    return [...cityMap.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((first, second) => first.label.localeCompare(second.label, "en", { sensitivity: "base" }));
  }, [projects]);

  const beneficiaryFilterOptions = useMemo<BeneficiaryFilterOption[]>(() => {
    const beneficiaryMap = new Map<string, string>();

    for (const project of projects) {
      if (project.status !== "upcoming" && project.status !== "active") {
        continue;
      }

      const beneficiary = project.beneficiaryTarget.trim();

      if (!beneficiary) {
        continue;
      }

      const key = beneficiary.toLowerCase();

      if (!beneficiaryMap.has(key)) {
        beneficiaryMap.set(key, beneficiary);
      }
    }

    return [...beneficiaryMap.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((first, second) => first.label.localeCompare(second.label, "en", { sensitivity: "base" }));
  }, [projects]);

  useEffect(() => {
    if (!cityFilter) {
      return;
    }

    const hasOption = cityFilterOptions.some((option) => option.value === cityFilter);

    if (!hasOption) {
      setCityFilter("");
    }
  }, [cityFilter, cityFilterOptions]);

  useEffect(() => {
    if (!beneficiaryFilter) {
      return;
    }

    const hasOption = beneficiaryFilterOptions.some((option) => option.value === beneficiaryFilter);

    if (!hasOption) {
      setBeneficiaryFilter("");
    }
  }, [beneficiaryFilter, beneficiaryFilterOptions]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesQuery =
        !normalizedQuery ||
        project.name.toLowerCase().includes(normalizedQuery) ||
        project.description.toLowerCase().includes(normalizedQuery) ||
        project.location.address.toLowerCase().includes(normalizedQuery) ||
        (project.location.city ?? "").toLowerCase().includes(normalizedQuery) ||
        project.requirements.some((requirement) => requirement.toLowerCase().includes(normalizedQuery)) ||
        project.eligibility.some((rule) => rule.toLowerCase().includes(normalizedQuery));
      const matchesStatus =
        !statusFilter ? project.status === "upcoming" || project.status === "active" : project.status === statusFilter;
      const matchesCity = !cityFilter || (project.location.city ?? "").trim().toLowerCase() === cityFilter;
      const matchesBeneficiary = !beneficiaryFilter || project.beneficiaryTarget.trim().toLowerCase() === beneficiaryFilter;

      return matchesQuery && matchesStatus && matchesCity && matchesBeneficiary;
    });
  }, [projects, query, statusFilter, cityFilter, beneficiaryFilter]);

  const selectedProject = useMemo(() => {
    return filteredProjects.find((project) => project.id === selectedProjectId) ?? filteredProjects[0] ?? null;
  }, [filteredProjects, selectedProjectId]);

  const activeProjects = projects.filter((project) => project.status === "active").length;
  const upcomingProjects = projects.filter((project) => project.status === "upcoming").length;
  const locationStatusMessage = getLocationStatusMessage(userLocationStatus, userLocationError);
  const locationButtonLabel = getLocationButtonLabel(userLocationStatus);

  async function refreshProjects() {
    try {
      setLoadError("");
      const publishedProjects = await loadPublishedProjects();
      setProjects(publishedProjects);
    } catch {
      setLoadError("Could not load published ayuda from the database.");
    }
  }

  async function handleUseMyLocation() {
    setUserLocationStatus("requesting");
    setUserLocationError("");

    const result = await requestUserLocation(window.navigator.geolocation);

    if (result.status === "granted") {
      setUserLocation(result.position);
      setUserLocationStatus("granted");
      setUserLocationError("");
      return;
    }

    setUserLocation(null);
    setUserLocationStatus(result.status);
    setUserLocationError(result.errorMessage);
  }

  function updateEligibility(projectId: string, index: number, value: boolean) {
    setEligibilityAnswers((current) => ({
      ...current,
      [projectId]: {
        ...(current[projectId] ?? {}),
        [index]: value,
      },
    }));
  }

  function updateDocumentCheck(projectId: string, index: number, value: boolean) {
    setDocumentChecks((current) => ({
      ...current,
      [projectId]: {
        ...(current[projectId] ?? {}),
        [index]: value,
      },
    }));
  }

  return (
    <div className="app user-app">
      <header className="topbar">
        <div>
          <p className="eyebrow">User Portal</p>
          <h1>Ayuda Announcements</h1>
        </div>
        <div className="topbar-actions">
          <Metric label="Active" value={activeProjects} />
          <Metric label="Upcoming" value={upcomingProjects} />
        </div>
      </header>

      {loadError ? <div className="message error">{loadError}</div> : null}

      <main className="user-workspace">
        <aside className="project-panel user-list-panel" aria-label="Published ayuda projects">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Browse</p>
              <h2>Published Ayuda</h2>
            </div>
          </div>

          <label className="search-box">
            <Search aria-hidden="true" size={18} />
            <input
              aria-label="Search ayuda"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search ayuda, venue, requirement"
              value={query}
            />
          </label>

          <div className="filters" aria-label="Published ayuda filters">
            <select
              aria-label="Published ayuda status"
              onChange={(event) => setStatusFilter(event.target.value as PublishedStatusFilter)}
              value={statusFilter}
            >
              <option value="">Select Status</option>
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
            </select>
            <select aria-label="Published ayuda city" onChange={(event) => setCityFilter(event.target.value)} value={cityFilter}>
              <option value="">Select City</option>
              {cityFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Published ayuda beneficiary"
              onChange={(event) => setBeneficiaryFilter(event.target.value)}
              value={beneficiaryFilter}
            >
              <option value="">Select Beneficiary</option>
              {beneficiaryFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="project-list">
            {filteredProjects.length === 0 ? (
              <div className="empty-state">
                <FileText aria-hidden="true" size={28} />
                <p>No published ayuda matches your search.</p>
              </div>
            ) : (
              filteredProjects.map((project) => {
                const isSelected = selectedProject?.id === project.id;
                const distanceLabel = getProjectDistanceLabel(userLocation, project.location);

                return (
                  <button
                    className={`project-row user-project-row ${isSelected ? "active" : ""}`}
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
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
                        {formatScheduleSummary(project.schedule, project.scheduleEnd)}
                      </span>
                    </span>
                    <span className="project-row-meta">
                      {distanceLabel ? <span className="badge distance-chip">{distanceLabel} away</span> : null}
                      <span className={`badge status-${project.status}`}>{statusLabels[project.status]}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="editor-panel user-detail-panel" aria-label="Ayuda details">
          {selectedProject ? (
            <AyudaDetails
              documentChecks={documentChecks[selectedProject.id] ?? {}}
              eligibilityAnswers={eligibilityAnswers[selectedProject.id] ?? {}}
              onDocumentCheck={(index, value) => updateDocumentCheck(selectedProject.id, index, value)}
              onEligibilityCheck={(index, value) => updateEligibility(selectedProject.id, index, value)}
              locationButtonLabel={locationButtonLabel}
              locationError={userLocationError}
              locationStatusMessage={locationStatusMessage}
              locationStatus={userLocationStatus}
              onUseMyLocation={handleUseMyLocation}
              onViewDescription={() => setDescriptionDialogProject(selectedProject)}
              project={selectedProject}
              userLocation={userLocation}
            />
          ) : (
            <div className="empty-state user-empty-detail">
              <FileText aria-hidden="true" size={32} />
              <p>No published ayuda announcements yet.</p>
            </div>
          )}
        </section>
      </main>

      <DescriptionDialog onClose={() => setDescriptionDialogProject(null)} project={descriptionDialogProject} />
    </div>
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

interface AyudaDetailsProps {
  documentChecks: Record<number, boolean>;
  eligibilityAnswers: Record<number, boolean>;
  locationButtonLabel: string;
  locationError: string;
  locationStatusMessage: string;
  locationStatus: UserLocationStatus;
  onDocumentCheck: (index: number, value: boolean) => void;
  onEligibilityCheck: (index: number, value: boolean) => void;
  onUseMyLocation: () => Promise<void>;
  onViewDescription: () => void;
  project: AyudaProject;
  userLocation: UserCoordinates | null;
}

function AyudaDetails({
  documentChecks,
  eligibilityAnswers,
  locationButtonLabel,
  locationError,
  locationStatusMessage,
  locationStatus,
  onDocumentCheck,
  onEligibilityCheck,
  onUseMyLocation,
  onViewDescription,
  project,
  userLocation,
}: AyudaDetailsProps) {
  const eligibilityTouched = Object.keys(eligibilityAnswers).length > 0;
  const eligible =
    project.eligibility.length > 0 && project.eligibility.every((_, index) => eligibilityAnswers[index] === true);
  const documentsReady =
    project.requirements.length > 0 && project.requirements.every((_, index) => documentChecks[index] === true);
  const embedUrl = createGoogleMapsEmbedUrl(project.location);
  const description = project.description.trim();
  const distanceState = createDistanceDetailState(userLocation, project.location, locationStatus, locationError);
  const locationTone = getLocationTone(locationStatus);
  const userLocationLabel = userLocation ? formatCoordinateLabel(userLocation) : "Tap Use my location to pin your position.";
  const userAccuracyLabel = userLocation ? formatAccuracyLabel(userLocation.accuracyMeters) : "";
  const userMapUrl = userLocation ? createGoogleMapsUrl({ lat: userLocation.lat, lng: userLocation.lng }) : "";
  const venueLabel = project.location.city?.trim() ? project.location.city : "City not specified";
  const venueCoordinateLabel = hasCoordinates(project.location)
    ? `${project.location.lat.toFixed(7)}, ${project.location.lng.toFixed(7)}`
    : "Venue coordinates unavailable";

  return (
    <>
      <div className="editor-title user-detail-title">
        <div>
          <p className="eyebrow">Selected Ayuda</p>
          <h2>{project.name}</h2>
        </div>
      </div>

      <div className="user-detail-grid">
        <section className="detail-section schedule-section">
          <div className="section-heading">
            <CalendarClock aria-hidden="true" size={18} />
            <h3>Schedule</h3>
          </div>
          <div className="detail-stat">
            <strong>{formatScheduleDateRange(project.schedule, project.scheduleEnd)}</strong>
            <span>{formatScheduleTimeframe(project.schedule, project.scheduleEnd)}</span>
          </div>
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <Users aria-hidden="true" size={18} />
            <h3>Beneficiary Targets</h3>
          </div>
          <div className="detail-stat">
            <strong>{project.beneficiaryTarget || "To be announced"}</strong>
            <span>Status: {statusLabels[project.status]}</span>
          </div>
        </section>

        <section className="detail-section wide">
          <div className="section-heading">
            <MapPin aria-hidden="true" size={18} />
            <h3>Venue</h3>
          </div>
          <div className="location-grid">
            <div className="venue-actions">
              <strong>{project.location.address || "Venue to be announced"}</strong>
              {project.location.mapsUrl ? (
                <a className="button link-button" href={project.location.mapsUrl} rel="noreferrer" target="_blank">
                  <Navigation aria-hidden="true" size={16} />
                  Open Map
                </a>
              ) : null}
              <div className="venue-location-controls">
                <button
                  className="button secondary location-inline-button"
                  disabled={locationStatus === "requesting"}
                  onClick={() => void onUseMyLocation()}
                  type="button"
                >
                  {locationButtonLabel}
                </button>
                <span className={`venue-location-status ${locationTone}`}>{locationStatusMessage}</span>
              </div>
              <div className="pin-journey" aria-label="Location pins from your location to venue">
                <article className={`pin-node ${userLocation ? "ready" : "pending"}`}>
                  <span className="pin-node-title">
                    <LocateFixed aria-hidden="true" size={15} />
                    Your Pin
                  </span>
                  <strong>{userLocation ? "Current location" : "Your location not set"}</strong>
                  <span className="pin-node-address">{userLocationLabel}</span>
                  {userAccuracyLabel ? <span className="pin-meta">{userAccuracyLabel}</span> : null}
                  {userMapUrl ? (
                    <div className="pin-node-actions">
                      <a className="button link-button" href={userMapUrl} rel="noreferrer" target="_blank">
                        <MapPin aria-hidden="true" size={15} />
                        Open My Pin
                      </a>
                    </div>
                  ) : null}
                </article>
                <div className={`pin-link ${distanceState.tone}`}>
                  <span className="pin-link-line" />
                  <span className="pin-link-label">{distanceState.value}</span>
                </div>
                <article className={`pin-node ${project.location.address ? "ready" : "pending"}`}>
                  <span className="pin-node-title">
                    <MapPin aria-hidden="true" size={15} />
                    Venue Pin
                  </span>
                  <strong>{project.location.address || "Venue to be announced"}</strong>
                  <span className="pin-node-address">{venueLabel}</span>
                  <span className="pin-meta">{venueCoordinateLabel}</span>
                </article>
              </div>
            </div>
            <div className="map-preview">
              {embedUrl ? (
                <iframe
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={embedUrl}
                  title="Google Maps venue preview"
                />
              ) : (
                <div className="map-placeholder">
                  <MapPin aria-hidden="true" size={28} />
                  <span>{project.location.address || "No venue selected"}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="detail-section wide">
          <div className="section-heading">
            <FileText aria-hidden="true" size={18} />
            <h3>Description</h3>
          </div>
          <p className="muted-text">{createDescriptionPreview(description) || "No description posted yet."}</p>
          <button className="button secondary" disabled={!description} onClick={onViewDescription} type="button">
            View Description
          </button>
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <FileText aria-hidden="true" size={18} />
            <h3>Requirements</h3>
          </div>
          <Checklist
            checkedItems={documentChecks}
            emptyLabel="No requirements posted."
            items={project.requirements}
            onChange={onDocumentCheck}
          />
          <div className={`readiness-summary ${documentsReady ? "ready" : "blocked"}`}>
            {documentsReady ? <CheckCircle2 aria-hidden="true" size={18} /> : <ListChecks aria-hidden="true" size={18} />}
            {documentsReady ? "Documents prepared." : "Prepare all required documents."}
          </div>
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <ShieldCheck aria-hidden="true" size={18} />
            <h3>Eligibility Checker</h3>
          </div>
          <Checklist
            checkedItems={eligibilityAnswers}
            emptyLabel="No eligibility rules posted."
            items={project.eligibility}
            onChange={onEligibilityCheck}
          />
          <EligibilityResult eligible={eligible} touched={eligibilityTouched} />
        </section>

        <section className="detail-section wide">
          <div className="section-heading">
            <UserCheck aria-hidden="true" size={18} />
            <h3>Claiming Steps</h3>
          </div>
          <ol className="claiming-steps">
            {claimingSteps.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

interface ChecklistProps {
  checkedItems: Record<number, boolean>;
  emptyLabel: string;
  items: string[];
  onChange: (index: number, value: boolean) => void;
}

function Checklist({ checkedItems, emptyLabel, items, onChange }: ChecklistProps) {
  if (items.length === 0) {
    return <p className="muted-text">{emptyLabel}</p>;
  }

  return (
    <div className="user-checklist">
      {items.map((item, index) => (
        <label className="check-row" key={`${item}-${index}`}>
          <input checked={checkedItems[index] === true} onChange={(event) => onChange(index, event.target.checked)} type="checkbox" />
          <span>{item}</span>
        </label>
      ))}
    </div>
  );
}

interface EligibilityResultProps {
  eligible: boolean;
  touched: boolean;
}

function EligibilityResult({ eligible, touched }: EligibilityResultProps) {
  if (!touched) {
    return (
      <div className="readiness-summary neutral">
        <Users aria-hidden="true" size={18} />
        Eligibility not checked.
      </div>
    );
  }

  if (eligible) {
    return (
      <div className="readiness-summary ready">
        <CheckCircle2 aria-hidden="true" size={18} />
        Eligible. Prepare documents.
      </div>
    );
  }

  return (
    <div className="readiness-summary blocked">
      <XCircle aria-hidden="true" size={18} />
      Not eligible.
    </div>
  );
}

interface DescriptionDialogProps {
  onClose: () => void;
  project: AyudaProject | null;
}

function DescriptionDialog({ onClose, project }: DescriptionDialogProps) {
  if (!project) {
    return null;
  }

  return (
    <div aria-modal="true" className="modal-backdrop" onClick={onClose} role="dialog">
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{project.name}</h3>
          <button className="button ghost" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <p className="muted-text">{project.description.trim() || "No description posted yet."}</p>
      </div>
    </div>
  );
}

export default UserApp;
