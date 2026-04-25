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

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return null;
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
