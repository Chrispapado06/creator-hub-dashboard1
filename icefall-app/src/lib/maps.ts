/**
 * Handing a place off to the phone's maps app.
 *
 * These are Google's official Maps URLs, not the Maps API: no key, no billing,
 * no quota. On a phone they open the Google Maps app when it is installed and
 * the website when it is not, and on a Mac they open the website. That is the
 * whole feature — ICEFALL does not need to become a navigation app to get
 * someone to a trailhead.
 *
 * https://developers.google.com/maps/documentation/urls/get-started
 */

export interface Spot {
  lat: number;
  lon: number;
  /** Used as the pin's label where Google will accept one. */
  name?: string;
}

/**
 * Drops a pin on the spot.
 *
 * The query is the coordinates, never the name: a trail called "Nature Trail"
 * would land Google somewhere else entirely, and the coordinates are the one
 * thing here that is unambiguous.
 */
export function mapsPinUrl({ lat, lon }: Spot): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/**
 * Directions from wherever the athlete is now to the spot.
 *
 * Origin is deliberately omitted: Google fills it from the device, which is
 * both more accurate than anything ICEFALL could pass and keeps the athlete's
 * position out of a URL.
 */
export function mapsDirectionsUrl({ lat, lon }: Spot, mode: "driving" | "walking" = "driving"): string {
  return (
    "https://www.google.com/maps/dir/?api=1" +
    `&destination=${lat.toFixed(6)},${lon.toFixed(6)}` +
    `&travelmode=${mode}`
  );
}

/** Opens a maps URL in a new tab / the maps app. */
export function openMaps(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
