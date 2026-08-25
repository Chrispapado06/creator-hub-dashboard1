import type { GeoSample, MetricId, SensorSource, SourceState } from "../types";
import { activityById } from "../activities";
import type { ActivityTypeId } from "../types";

/**
 * Labelled GPS simulator.
 *
 * Real device GPS is the default and always preferred. This exists so the
 * tracker can be demonstrated and reviewed indoors, on a desktop, or wherever
 * location is unavailable — and every surface that renders simulated data shows
 * a persistent SIMULATED badge. It is never presented as a real measurement.
 */
export class SimulatedGpsSource implements SensorSource<GeoSample> {
  readonly id = "simulator";
  readonly label = "Simulated track";
  readonly provides: MetricId[] = [];

  private timer: ReturnType<typeof setInterval> | null = null;
  private state: SourceState = { status: "idle" };
  private onState?: (s: SourceState) => void;
  private step = 0;

  /** Chamonix valley floor — a plausible origin for the ICEFALL athlete. */
  private origin = { lat: 45.9237, lon: 6.8694, alt: 1035 };

  constructor(private activityTypeId: ActivityTypeId) {}

  getState() {
    return this.state;
  }

  async start(onSample: (s: GeoSample) => void, onState: (s: SourceState) => void) {
    this.onState = onState;
    this.state = { status: "live", detail: "Simulated route — not a real GPS fix." };
    onState(this.state);

    const type = activityById(this.activityTypeId);
    // Roughly the sustainable speed for the discipline.
    const speed = Math.min(type.maxSpeedMps * 0.35, type.family === "cycling" ? 7.5 : 2.2);

    this.timer = setInterval(() => {
      this.step++;
      const t = this.step;

      // A meandering climb: bearing swings slowly, altitude rises then falls.
      const bearing = Math.sin(t / 55) * 1.4 + t / 260;
      const dLat = (Math.cos(bearing) * speed) / 111_320;
      const dLon =
        (Math.sin(bearing) * speed) / (111_320 * Math.cos((this.origin.lat * Math.PI) / 180));

      this.origin.lat += dLat;
      this.origin.lon += dLon;

      const climbPhase = Math.sin((t / 900) * Math.PI);
      this.origin.alt += climbPhase * 1.15 + Math.sin(t / 7) * 0.12;

      onSample({
        t: Date.now(),
        lat: this.origin.lat,
        lon: this.origin.lon,
        accuracy: 5 + Math.sin(t / 13) * 2.5,
        altitude: this.origin.alt,
        altitudeAccuracy: 4,
        speed,
        heading: ((bearing * 180) / Math.PI + 360) % 360,
        simulated: true,
      });
    }, 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.state = { status: "idle" };
    this.onState?.(this.state);
  }
}
