/**
 * Health platform integration — Apple Health (HealthKit) and Android Health
 * Connect, for daily steps, energy, floors, resting heart rate and sleep.
 *
 * There is no browser API for any of this. Reading HealthKit or Health Connect
 * requires a native container, so this module defines the bridge contract, and
 * detects and drives it when one is present. In a plain browser it reports
 * `unsupported` with an honest explanation rather than inventing step counts.
 *
 * Wiring it up for real (Capacitor):
 *   iOS      — `@perfood/capacitor-healthkit`, plus HealthKit capability and
 *              NSHealthShareUsageDescription in Info.plist
 *   Android  — `capacitor-health-connect`, plus the Health Connect permissions
 *              block in AndroidManifest.xml
 * Either plugin is adapted to `HealthBridge` below; nothing else changes.
 */

export type HealthMetricId =
  | "steps"
  | "distance"
  | "floors"
  | "activeEnergy"
  | "exerciseMinutes"
  | "restingHeartRate"
  | "sleep";

export type HealthPlatform = "apple-health" | "health-connect" | "none";

export interface HealthValue {
  value: number | null;
  /** Absent value carries a reason, never a zero. */
  reason?: "not-connected" | "unsupported" | "no-data" | "needs-permission";
}

export interface HealthDaySummary {
  date: string;
  steps: HealthValue;
  /** Metres. */
  distance: HealthValue;
  floors: HealthValue;
  /** Kilocalories. */
  activeEnergy: HealthValue;
  exerciseMinutes: HealthValue;
  restingHeartRate: HealthValue;
  /** Minutes. */
  sleep: HealthValue;
}

export interface HealthSeriesPoint {
  date: string;
  steps: number | null;
}

/**
 * The contract a native plugin must satisfy. Deliberately small — everything
 * ICEFALL needs, nothing it doesn't, so permission requests stay minimal.
 */
export interface HealthBridge {
  isAvailable(): Promise<boolean>;
  requestAuthorization(
    read: HealthMetricId[],
  ): Promise<{ granted: boolean; denied?: HealthMetricId[] }>;
  daySummary(dateIso: string): Promise<Partial<Record<HealthMetricId, number | null>>>;
  stepSeries(fromIso: string, toIso: string): Promise<{ date: string; steps: number | null }[]>;
}

/** The metrics ICEFALL asks for. Kept short on purpose. */
export const REQUESTED_HEALTH_METRICS: HealthMetricId[] = [
  "steps",
  "distance",
  "floors",
  "activeEnergy",
  "exerciseMinutes",
  "restingHeartRate",
  "sleep",
];

export const HEALTH_METRIC_LABELS: Record<
  HealthMetricId,
  { label: string; unit: string; why: string }
> = {
  steps: { label: "Steps", unit: "", why: "Daily movement outside recorded activities" },
  distance: { label: "Walking distance", unit: "km", why: "Everyday distance on foot" },
  floors: { label: "Floors climbed", unit: "", why: "Counts toward your vertical" },
  activeEnergy: { label: "Active energy", unit: "kcal", why: "Whole-day energy for training load" },
  exerciseMinutes: { label: "Exercise minutes", unit: "min", why: "Time spent active" },
  restingHeartRate: {
    label: "Resting heart rate",
    unit: "bpm",
    why: "The clearest signal of recovery",
  },
  sleep: { label: "Sleep", unit: "h", why: "Recovery context for the coach" },
};

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Finds a Capacitor-style bridge on the window, if the app is running natively. */
function detectBridge(): { bridge: HealthBridge | null; platform: HealthPlatform } {
  if (typeof window === "undefined") return { bridge: null, platform: "none" };

  const w = window as unknown as {
    Capacitor?: { getPlatform?: () => string; Plugins?: Record<string, unknown> };
    IcefallHealth?: HealthBridge;
  };

  // An explicit bridge injected by the native shell always wins.
  if (w.IcefallHealth && typeof w.IcefallHealth.isAvailable === "function") {
    const p = w.Capacitor?.getPlatform?.();
    return {
      bridge: w.IcefallHealth,
      platform: p === "android" ? "health-connect" : "apple-health",
    };
  }

  const plugins = w.Capacitor?.Plugins;
  const platform = w.Capacitor?.getPlatform?.();
  if (!plugins || !platform || platform === "web") return { bridge: null, platform: "none" };

  const candidate = (plugins.Health ?? plugins.CapacitorHealthkit ?? plugins.HealthConnect) as
    | HealthBridge
    | undefined;
  if (!candidate || typeof candidate.isAvailable !== "function")
    return { bridge: null, platform: "none" };

  return {
    bridge: candidate,
    platform: platform === "android" ? "health-connect" : "apple-health",
  };
}

export type HealthStatus =
  | "unsupported"
  | "disconnected"
  | "connecting"
  | "connected"
  | "denied"
  | "error";

export interface HealthState {
  status: HealthStatus;
  platform: HealthPlatform;
  detail?: string;
  /** True when values come from the labelled sample dataset, not a device. */
  sample: boolean;
}

const unavailable = (reason: HealthValue["reason"]): HealthValue => ({ value: null, reason });

export class HealthService {
  private bridge: HealthBridge | null;
  private platform: HealthPlatform;
  private status: HealthStatus;
  private detail?: string;
  private sampleMode = false;
  private listeners = new Set<(s: HealthState) => void>();

  constructor() {
    const found = detectBridge();
    this.bridge = found.bridge;
    this.platform = found.platform;
    this.status = found.bridge ? "disconnected" : "unsupported";
    this.detail = found.bridge
      ? undefined
      : "Apple Health and Health Connect are only reachable from the ICEFALL mobile app. On the web there is no API that can read your step count.";
  }

  get state(): HealthState {
    return {
      status: this.status,
      platform: this.platform,
      detail: this.detail,
      sample: this.sampleMode,
    };
  }

  subscribe(fn: (s: HealthState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private set(status: HealthStatus, detail?: string) {
    this.status = status;
    this.detail = detail;
    this.listeners.forEach((f) => f(this.state));
  }

  /** Requests read authorisation for the listed metrics. */
  async connect(): Promise<boolean> {
    if (!this.bridge) {
      this.set("unsupported", this.detail);
      return false;
    }
    try {
      this.set("connecting");
      if (!(await this.bridge.isAvailable())) {
        this.set("unsupported", "This device has no health store available.");
        return false;
      }
      const res = await this.bridge.requestAuthorization(REQUESTED_HEALTH_METRICS);
      if (!res.granted) {
        this.set(
          "denied",
          "Health access was declined. You can grant it later in system settings.",
        );
        return false;
      }
      this.sampleMode = false;
      this.set("connected");
      return true;
    } catch (e) {
      this.set("error", e instanceof Error ? e.message : "Could not reach the health store.");
      return false;
    }
  }

  disconnect() {
    this.sampleMode = false;
    this.set(this.bridge ? "disconnected" : "unsupported", this.detail);
  }

  /**
   * Turns on a clearly-labelled sample dataset so the screen can be designed
   * and reviewed without a phone. Every surface that shows it must display the
   * "sample data" marker — this is never presented as the user's real health.
   */
  useSampleData(on: boolean) {
    this.sampleMode = on;
    this.set(
      on ? "connected" : this.bridge ? "disconnected" : "unsupported",
      on ? undefined : this.detail,
    );
  }

  async daySummary(date = new Date()): Promise<HealthDaySummary> {
    const day = isoDay(date);

    if (this.sampleMode) return sampleSummary(day);

    if (this.status !== "connected" || !this.bridge) {
      const reason = this.status === "unsupported" ? "unsupported" : "not-connected";
      return {
        date: day,
        steps: unavailable(reason),
        distance: unavailable(reason),
        floors: unavailable(reason),
        activeEnergy: unavailable(reason),
        exerciseMinutes: unavailable(reason),
        restingHeartRate: unavailable(reason),
        sleep: unavailable(reason),
      };
    }

    try {
      const raw = await this.bridge.daySummary(day);
      const pick = (k: HealthMetricId): HealthValue =>
        raw[k] === null || raw[k] === undefined
          ? unavailable("no-data")
          : { value: raw[k] as number };
      return {
        date: day,
        steps: pick("steps"),
        distance: pick("distance"),
        floors: pick("floors"),
        activeEnergy: pick("activeEnergy"),
        exerciseMinutes: pick("exerciseMinutes"),
        restingHeartRate: pick("restingHeartRate"),
        sleep: pick("sleep"),
      };
    } catch (e) {
      this.set("error", e instanceof Error ? e.message : "Health read failed.");
      return this.daySummary(date);
    }
  }

  async stepSeries(days = 7): Promise<HealthSeriesPoint[]> {
    const out: HealthSeriesPoint[] = [];
    const today = new Date();

    if (this.sampleMode) {
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        out.push({ date: isoDay(d), steps: SAMPLE_STEPS[(days - 1 - i) % SAMPLE_STEPS.length] });
      }
      return out;
    }

    if (this.status !== "connected" || !this.bridge) {
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        out.push({ date: isoDay(d), steps: null });
      }
      return out;
    }

    const from = new Date(today);
    from.setDate(from.getDate() - (days - 1));
    try {
      return await this.bridge.stepSeries(isoDay(from), isoDay(today));
    } catch {
      return out;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Sample dataset — always rendered behind an explicit "sample data" marker    */
/* -------------------------------------------------------------------------- */

const SAMPLE_STEPS = [8420, 11_930, 6540, 14_210, 9080, 18_640, 12_305];

function sampleSummary(day: string): HealthDaySummary {
  return {
    date: day,
    steps: { value: 12_305 },
    distance: { value: 9140 },
    floors: { value: 34 },
    activeEnergy: { value: 742 },
    exerciseMinutes: { value: 96 },
    restingHeartRate: { value: 48 },
    sleep: { value: 437 },
  };
}

export const healthService = new HealthService();
