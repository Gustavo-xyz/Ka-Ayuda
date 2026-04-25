import {
  Bell,
  Bookmark,
  BookmarkCheck,
  CalendarClock,
  CheckCircle2,
  FileText,
  ListChecks,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadPublishedProjects } from "./lib/projects";
import { createGoogleMapsEmbedUrl } from "./lib/maps";
import type { AyudaProject, ProjectStatus } from "./types";

const USER_BOOKMARKS_KEY = "ayuda-user-bookmarks";

const statusLabels: Record<ProjectStatus, string> = {
  upcoming: "Upcoming",
  active: "Active",
  archived: "Archived",
};

const statusMessages: Record<ProjectStatus, string> = {
  upcoming: "Prepare your requirements before the scheduled distribution.",
  active: "Distribution is currently open at the announced venue.",
  archived: "This ayuda announcement has been archived.",
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

function loadBookmarkIds(): string[] {
  try {
    const raw = window.localStorage.getItem(USER_BOOKMARKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function saveBookmarkIds(ids: string[]): void {
  window.localStorage.setItem(USER_BOOKMARKS_KEY, JSON.stringify(ids));
}

function UserApp() {
  const [projects, setProjects] = useState<AyudaProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus>("active");
  const [savedOnly, setSavedOnly] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => new Set(loadBookmarkIds()));
  const [eligibilityAnswers, setEligibilityAnswers] = useState<Record<string, Record<number, boolean>>>({});
  const [documentChecks, setDocumentChecks] = useState<Record<string, Record<number, boolean>>>({});
  const [loadError, setLoadError] = useState("");

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

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesQuery =
        !normalizedQuery ||
        project.name.toLowerCase().includes(normalizedQuery) ||
        project.location.address.toLowerCase().includes(normalizedQuery) ||
        project.requirements.some((requirement) => requirement.toLowerCase().includes(normalizedQuery)) ||
        project.eligibility.some((rule) => rule.toLowerCase().includes(normalizedQuery));
      const matchesStatus = project.status === statusFilter;
      const matchesSaved = !savedOnly || bookmarks.has(project.id);

      return matchesQuery && matchesStatus && matchesSaved;
    });
  }, [bookmarks, projects, query, savedOnly, statusFilter]);

  const selectedProject = useMemo(() => {
    return filteredProjects.find((project) => project.id === selectedProjectId) ?? filteredProjects[0] ?? null;
  }, [filteredProjects, selectedProjectId]);

  const bookmarkedCount = projects.filter((project) => bookmarks.has(project.id)).length;

  async function refreshProjects() {
    try {
      setLoadError("");
      const publishedProjects = await loadPublishedProjects();
      setProjects(publishedProjects);
    } catch {
      setLoadError("Could not load published ayuda from the database.");
    }
  }

  function toggleBookmark(projectId: string) {
    setBookmarks((current) => {
      const next = new Set(current);

      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }

      saveBookmarkIds(Array.from(next));
      return next;
    });
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
          <Metric label="Available" value={projects.length} />
          <Metric label="Saved" value={bookmarkedCount} />
          <button className="button ghost" onClick={() => void refreshProjects()} type="button">
            <RefreshCw aria-hidden="true" size={18} />
            Refresh
          </button>
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

          <div className="filters user-filters" aria-label="Ayuda filters">
            <select
              aria-label="Status filter"
              onChange={(event) => setStatusFilter(event.target.value as ProjectStatus)}
              value={statusFilter}
            >
              <option value="active">Active</option>
              <option value="upcoming">Upcoming</option>
              <option value="archived">Archived</option>
            </select>
            <label className="toggle-filter">
              <input checked={savedOnly} onChange={(event) => setSavedOnly(event.target.checked)} type="checkbox" />
              <span>Saved only</span>
            </label>
          </div>

          <div className="project-list">
            {filteredProjects.length === 0 ? (
              <div className="empty-state">
                <FileText aria-hidden="true" size={28} />
                <p>No published ayuda matches the current filters.</p>
              </div>
            ) : (
              filteredProjects.map((project) => {
                const isSelected = selectedProject?.id === project.id;
                const isBookmarked = bookmarks.has(project.id);

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
                      </span>
                      <span>
                        <CalendarClock aria-hidden="true" size={14} />
                        {formatDateTime(project.schedule)}
                      </span>
                    </span>
                    <span className="project-row-meta">
                      <span className={`badge status-${project.status}`}>{statusLabels[project.status]}</span>
                      {isBookmarked ? <BookmarkCheck aria-hidden="true" size={17} /> : null}
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
              isBookmarked={bookmarks.has(selectedProject.id)}
              onDocumentCheck={(index, value) => updateDocumentCheck(selectedProject.id, index, value)}
              onEligibilityCheck={(index, value) => updateEligibility(selectedProject.id, index, value)}
              onToggleBookmark={() => toggleBookmark(selectedProject.id)}
              project={selectedProject}
            />
          ) : (
            <div className="empty-state user-empty-detail">
              <FileText aria-hidden="true" size={32} />
              <p>No published ayuda announcements yet.</p>
            </div>
          )}
        </section>
      </main>
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
  isBookmarked: boolean;
  onDocumentCheck: (index: number, value: boolean) => void;
  onEligibilityCheck: (index: number, value: boolean) => void;
  onToggleBookmark: () => void;
  project: AyudaProject;
}

function AyudaDetails({
  documentChecks,
  eligibilityAnswers,
  isBookmarked,
  onDocumentCheck,
  onEligibilityCheck,
  onToggleBookmark,
  project,
}: AyudaDetailsProps) {
  const eligibilityTouched = Object.keys(eligibilityAnswers).length > 0;
  const eligible =
    project.eligibility.length > 0 && project.eligibility.every((_, index) => eligibilityAnswers[index] === true);
  const documentsReady =
    project.requirements.length > 0 && project.requirements.every((_, index) => documentChecks[index] === true);
  const statusNote = project.statusNote || statusMessages[project.status];
  const embedUrl = createGoogleMapsEmbedUrl(project.location);

  return (
    <>
      <div className="editor-title user-detail-title">
        <div>
          <p className="eyebrow">Selected Ayuda</p>
          <h2>{project.name}</h2>
        </div>
        <button className="button secondary" onClick={onToggleBookmark} type="button">
          {isBookmarked ? <BookmarkCheck aria-hidden="true" size={18} /> : <Bookmark aria-hidden="true" size={18} />}
          {isBookmarked ? "Saved" : "Save"}
        </button>
      </div>

      <div className={`status-banner status-${project.status}`}>
        <Bell aria-hidden="true" size={19} />
        <div>
          <strong>{statusLabels[project.status]}</strong>
          <span>{statusNote}</span>
        </div>
      </div>

      <div className="user-detail-grid">
        <section className="detail-section schedule-section">
          <div className="section-heading">
            <CalendarClock aria-hidden="true" size={18} />
            <h3>Schedule</h3>
          </div>
          <div className="detail-stat">
            <strong>{formatDateTime(project.schedule)}</strong>
            <span>{project.beneficiaryTarget || "Beneficiary classification to be announced"}</span>
          </div>
        </section>

        <section className="detail-section wide">
          <div className="section-heading">
            <MapPin aria-hidden="true" size={18} />
            <h3>Venue</h3>
          </div>
          <div className="user-map-layout">
            <div className="map-preview user-map-preview">
              {embedUrl ? (
                <iframe
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={embedUrl}
                  title="Google Maps venue preview"
                />
              ) : (
                <div>
                  <MapPin aria-hidden="true" size={28} />
                  <span>{project.location.address || "No venue selected"}</span>
                </div>
              )}
            </div>
            <div className="venue-actions">
              <strong>{project.location.address || "Venue to be announced"}</strong>
              {project.location.mapsUrl ? (
                <a className="button link-button" href={project.location.mapsUrl} rel="noreferrer" target="_blank">
                  <Navigation aria-hidden="true" size={16} />
                  Open Map
                </a>
              ) : null}
            </div>
          </div>
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

export default UserApp;
