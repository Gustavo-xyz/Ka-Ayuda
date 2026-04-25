import { describe, expect, it } from "vitest";
import { calculateDistanceKm, formatDistance, parseGoogleMapsPosition } from "./maps";

describe("map distance helpers", () => {
  it("returns zero distance for the same coordinates", () => {
    expect(calculateDistanceKm({ lat: 14.5995, lng: 120.9842 }, { lat: 14.5995, lng: 120.9842 })).toBe(0);
  });

  it("returns expected haversine distance for known coordinates", () => {
    const distance = calculateDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    expect(distance).toBeGreaterThan(111);
    expect(distance).toBeLessThan(112);
  });

  it("formats meters and kilometers using the configured display rules", () => {
    expect(formatDistance(0.72)).toBe("720 m");
    expect(formatDistance(1.26)).toBe("1.3 km");
  });

  it("rejects invalid latitude/longitude ranges when parsing map URLs", () => {
    expect(parseGoogleMapsPosition("https://maps.google.com/?q=120.9842,14.5995")).toBeNull();
  });
});
