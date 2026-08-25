import type { GeoSample, MetricId, SensorSource, SourceState } from "../types";

/**
 * Real device GPS via the Geolocation API.
 *
 * `watchPosition` with `enableHighAccuracy` is the best a web app can do; it is
 * genuine device data, including altitude and accuracy where the hardware
 * reports them. Nothing here synthesises a value — if the browser gives us
 * `null` altitude, the recorder is told altitude is unavailable.
 */
export class GeolocationSource implements SensorSource<GeoSample> {
  readonly id = "geolocation";
  readonly label = "Device GPS";
  readonly provides: MetricId[] = ["distance", "pace", "speed", "elevationGain", "altitude"];

  private watchId: number | null = null;
  private state: SourceState = { status: "idle" };
  private onState?: (s: SourceState) => void;

  getState() {
    return this.state;
  }

  private set(status: SourceState["status"], detail?: string) {
    this.state = { status, detail };
    this.onState?.(this.state);
  }

  async start(onSample: (s: GeoSample) => void, onState: (s: SourceState) => void) {
    this.onState = onState;

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      this.set("unsupported", "This browser has no Geolocation API.");
      return;
    }

    // A secure context is required by every modern browser.
    if (
      typeof window !== "undefined" &&
      !window.isSecureContext &&
      location.hostname !== "localhost"
    ) {
      this.set("unsupported", "Location needs HTTPS. Open ICEFALL over a secure connection.");
      return;
    }

    this.set("connecting", "Acquiring satellites…");

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (this.state.status !== "live") this.set("live");
        const c = pos.coords;
        onSample({
          t: pos.timestamp,
          lat: c.latitude,
          lon: c.longitude,
          accuracy: c.accuracy,
          altitude: Number.isFinite(c.altitude as number) ? (c.altitude as number) : null,
          altitudeAccuracy: Number.isFinite(c.altitudeAccuracy as number)
            ? (c.altitudeAccuracy as number)
            : null,
          speed: Number.isFinite(c.speed as number) ? (c.speed as number) : null,
          heading: Number.isFinite(c.heading as number) ? (c.heading as number) : null,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          this.set(
            "denied",
            "Location permission was declined. ICEFALL cannot record a route without it.",
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          this.set("error", "No position available — no satellite fix yet.");
        } else {
          this.set("error", err.message || "Location error.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }

  stop() {
    if (this.watchId !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
    this.set("idle");
  }
}

/** Permission state without prompting, where the browser supports it. */
export async function peekLocationPermission(): Promise<PermissionState | "unknown"> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
    const r = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return r.state;
  } catch {
    return "unknown";
  }
}
