import { describe, expect, it, vi } from "vitest";
import type { Location } from "../types";
import {
  USER_LOCATION_OPTIONS,
  createDistanceDetailState,
  getProjectDistanceLabel,
  requestUserLocation,
} from "./userLocation";

function createLocation(overrides: Partial<Location> = {}): Location {
  return {
    address: "Municipal Hall",
    city: "Manila",
    mapsUrl: "https://maps.google.com/?q=14.5995,120.9842",
    ...overrides,
  };
}

describe("user location helpers", () => {
  it("requests browser geolocation and returns granted coordinates on success", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          accuracy: 18,
          latitude: 14.5995,
          longitude: 120.9842,
        },
      } as GeolocationPosition);
    });

    const result = await requestUserLocation({ getCurrentPosition });

    expect(result).toEqual({
      position: { accuracyMeters: 18, lat: 14.5995, lng: 120.9842 },
      status: "granted",
    });
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      USER_LOCATION_OPTIONS,
    );
  });

  it("returns denied status when location permission is blocked", async () => {
    const getCurrentPosition = vi.fn((_: PositionCallback, error?: PositionErrorCallback | null) => {
      error?.({
        code: 1,
      } as GeolocationPositionError);
    });

    const result = await requestUserLocation({ getCurrentPosition });

    expect(result.status).toBe("denied");
    expect(result).toMatchObject({
      errorMessage: "Permission denied. Allow location access to view distance.",
    });
  });

  it("returns unsupported status when browser geolocation is unavailable", async () => {
    const result = await requestUserLocation(undefined);

    expect(result).toEqual({
      errorMessage: "Geolocation is not supported in this browser.",
      status: "unsupported",
    });
  });

  it("returns error status when browser geolocation throws synchronously", async () => {
    const getCurrentPosition = vi.fn(() => {
      throw new Error("Security error");
    });

    const result = await requestUserLocation({ getCurrentPosition });

    expect(result.status).toBe("error");
    expect(result).toMatchObject({
      errorMessage: "Location access failed. Use localhost or HTTPS, then try again.",
    });
  });

  it("returns list and detail distance output when user location and venue coordinates exist", () => {
    const userLocation = { lat: 14.5995, lng: 120.9842 };
    const location = createLocation({ lat: 14.6095, lng: 120.9942 });

    const listDistance = getProjectDistanceLabel(userLocation, location);
    const detailState = createDistanceDetailState(userLocation, location, "granted");

    expect(listDistance).not.toBeNull();
    expect(detailState.tone).toBe("ready");
    expect(detailState.value).toContain("away");
  });

  it("returns unavailable detail state when venue coordinates are missing", () => {
    const userLocation = { lat: 14.5995, lng: 120.9842 };
    const location = createLocation({ lat: undefined, lng: undefined });

    const detailState = createDistanceDetailState(userLocation, location, "granted");

    expect(detailState.tone).toBe("blocked");
    expect(detailState.subtitle).toBe("Distance unavailable for this ayuda.");
  });

  it("returns blocked detail state with permission message when denied", () => {
    const detailState = createDistanceDetailState(
      null,
      createLocation({ lat: 14.6095, lng: 120.9942 }),
      "denied",
      "Permission denied. Allow location access to view distance.",
    );

    expect(detailState.tone).toBe("blocked");
    expect(detailState.value).toBe("Distance not available");
    expect(detailState.subtitle).toContain("Permission denied");
  });
});
