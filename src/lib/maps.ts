import type { Location } from "../types";

export interface MapPosition {
  lat: number;
  lng: number;
}

export function hasCoordinates(location: Location): location is Location & MapPosition {
  return (
    typeof location.lat === "number" &&
    Number.isFinite(location.lat) &&
    typeof location.lng === "number" &&
    Number.isFinite(location.lng)
  );
}

export function createGoogleMapsUrl(position: MapPosition): string {
  return `https://maps.google.com/?q=${position.lat},${position.lng}`;
}

export function createGoogleMapsEmbedUrl(location: Location): string {
  if (hasCoordinates(location)) {
    return `https://www.google.com/maps?q=${location.lat},${location.lng}&output=embed`;
  }

  const query = location.address.trim();

  if (query) {
    return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
  }

  return "";
}
