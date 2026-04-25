export type PublishState = "draft" | "published";

export type ProjectStatus = "upcoming" | "active" | "archived";

export interface Location {
  address: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  mapsUrl?: string;
}

export interface DependencyItem {
  id: string;
  label: string;
  ready: boolean;
}

export interface AyudaProject {
  id: string;
  name: string;
  requirements: string[];
  eligibility: string[];
  location: Location;
  schedule: string;
  beneficiaryTarget: string;
  dependencies: DependencyItem[];
  publishState: PublishState;
  status: ProjectStatus;
  statusNote: string;
  createdAt: string;
  updatedAt: string;
}
