import type { Location } from "../types";
import { calculateDistanceKm, formatDistance, hasCoordinates, type MapPosition } from "./maps";

export type UserLocationStatus = "idle" | "requesting" | "granted" | "denied" | "unsupported" | "error";

export interface LocationRequestSuccess {
  position: MapPosition & { accuracyMeters?: number };
  status: "granted";
}

export interface LocationRequestFailure {
  errorMessage: string;
  status: Exclude<UserLocationStatus, "idle" | "requesting" | "granted">;
}

export type LocationRequestResult = LocationRequestSuccess | LocationRequestFailure;

export interface GeolocationReader {
  getCurrentPosition: (
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions,
  ) => void;
}

export interface DistanceDetailState {
  subtitle: string;
  tone: "ready" | "neutral" | "blocked";
  value: string;
}

export const USER_LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 10000,
};

function getLocationErrorMessage(code: number): string {
  if (code === 1) {
    return "Permission denied. Allow location access to view distance.";
  }

  if (code === 2) {
    return "Location unavailable. Try again in an open area.";
  }

  if (code === 3) {
    return "Location request timed out. Try again.";
  }

  return "Could not determine your location.";
}

export async function requestUserLocation(geolocation: GeolocationReader | null | undefined): Promise<LocationRequestResult> {
  if (!geolocation) {
    return {
      errorMessage: "Geolocation is not supported in this browser.",
      status: "unsupported",
    };
  }

  return new Promise<LocationRequestResult>((resolve) => {
    try {
      geolocation.getCurrentPosition(
        (position) => {
        resolve({
          position: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
          },
          status: "granted",
        });
        },
        (error) => {
          const status: LocationRequestFailure["status"] = error.code === 1 ? "denied" : "error";
          resolve({
            errorMessage: getLocationErrorMessage(error.code),
            status,
          });
        },
        USER_LOCATION_OPTIONS,
      );
    } catch {
      resolve({
        errorMessage: "Location access failed. Use localhost or HTTPS, then try again.",
        status: "error",
      });
    }
  });
}

export function getLocationButtonLabel(status: UserLocationStatus): string {
  if (status === "granted") {
    return "Update location";
  }

  if (status === "requesting") {
    return "Locating...";
  }

  return "Use my location";
}

export function getLocationStatusMessage(status: UserLocationStatus, errorMessage: string): string {
  if (status === "granted") {
    return "Location ready. Distance updates are visible below.";
  }

  if (status === "requesting") {
    return "Requesting your current location...";
  }

  if (status === "unsupported") {
    return "Geolocation is not supported in this browser.";
  }

  if (status === "denied") {
    return errorMessage || "Permission denied. Allow location access to view distance.";
  }

  if (status === "error") {
    return errorMessage || "Could not determine your location.";
  }

  return "Tap Use my location to see distance from each ayuda venue.";
}

export function getProjectDistanceLabel(userLocation: MapPosition | null, location: Location): string | null {
  if (!userLocation || !hasCoordinates(location)) {
    return null;
  }

  return formatDistance(calculateDistanceKm(userLocation, { lat: location.lat, lng: location.lng }));
}

export function createDistanceDetailState(
  userLocation: MapPosition | null,
  location: Location,
  status: UserLocationStatus = "idle",
  errorMessage = "",
): DistanceDetailState {
  if (status === "requesting") {
    return {
      subtitle: "Requesting your current location...",
      tone: "neutral",
      value: "Locating...",
    };
  }

  if (status === "unsupported") {
    return {
      subtitle: "Geolocation is not supported in this browser.",
      tone: "blocked",
      value: "Distance not available",
    };
  }

  if (status === "denied" || status === "error") {
    return {
      subtitle: errorMessage || getLocationStatusMessage(status, errorMessage),
      tone: "blocked",
      value: "Distance not available",
    };
  }

  if (!userLocation) {
    return {
      subtitle: "Enable location to see your distance from this venue.",
      tone: "neutral",
      value: "Distance not available",
    };
  }

  if (!hasCoordinates(location)) {
    return {
      subtitle: "Distance unavailable for this ayuda.",
      tone: "blocked",
      value: "Distance unavailable",
    };
  }

  const label = formatDistance(calculateDistanceKm(userLocation, { lat: location.lat, lng: location.lng }));

  return {
    subtitle: "From your current location",
    tone: "ready",
    value: `${label} away`,
  };
}
