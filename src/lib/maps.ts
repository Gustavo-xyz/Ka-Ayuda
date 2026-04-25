import type { Location } from "../types";

export interface MapPosition {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function hasCoordinates(location: Location): location is Location & MapPosition {
  return typeof location.lat === "number" && isValidLatitude(location.lat) && typeof location.lng === "number" && isValidLongitude(location.lng);
}

export function createGoogleMapsUrl(position: MapPosition): string {
  return `https://maps.google.com/?q=${position.lat},${position.lng}`;
}

export function parseGoogleMapsPosition(value: string | undefined): MapPosition | null {
  if (!value) {
    return null;
  }

  const text = value.trim();
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&]query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const lat = Number(match[1]);
    const lng = Number(match[2]);

    if (isValidLatitude(lat) && isValidLongitude(lng)) {
      return { lat, lng };
    }
  }

  return null;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function calculateDistanceKm(from: MapPosition, to: MapPosition): number {
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const latitudeFrom = toRadians(from.lat);
  const latitudeTo = toRadians(to.lat);

  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(latitudeFrom) *
      Math.cos(latitudeTo) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);
  const angularDistance = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return EARTH_RADIUS_KM * angularDistance;
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) {
    return "";
  }

  const normalizedKm = Math.max(0, km);

  if (normalizedKm < 1) {
    return `${Math.round(normalizedKm * 1000)} m`;
  }

  return `${normalizedKm.toFixed(1)} km`;
}

export function createGoogleMapsEmbedUrl(location: Location): string {
  if (hasCoordinates(location)) {
    return `https://www.google.com/maps?q=${location.lat},${location.lng}&output=embed`;
  }

  const position = parseGoogleMapsPosition(location.mapsUrl);

  if (position) {
    return `https://www.google.com/maps?q=${position.lat},${position.lng}&output=embed`;
  }

  const query = location.address.trim();

  if (query) {
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  }

  return "";
}
