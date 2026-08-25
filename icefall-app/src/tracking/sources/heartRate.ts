import type { HeartRateSample, MetricId, SensorSource, SourceState } from "../types";

/**
 * Bluetooth heart-rate straps via Web Bluetooth (GATT 0x180D).
 *
 * This is a real connection to real hardware — Polar, Garmin, Wahoo and most
 * other straps expose the standard Heart Rate service. Chrome and Edge support
 * it; Safari and Firefox do not, and the UI says so rather than pretending.
 *
 * The same `SensorSource` shape is what an Apple Watch, ANT+ or Garmin adapter
 * implements once a native shell exists.
 */

const HEART_RATE_SERVICE = "heart_rate";
const HEART_RATE_MEASUREMENT = "heart_rate_measurement";

interface BluetoothLike {
  requestDevice(opts: unknown): Promise<{
    name?: string;
    gatt?: {
      connect(): Promise<{
        getPrimaryService(s: string): Promise<{
          getCharacteristic(c: string): Promise<{
            startNotifications(): Promise<unknown>;
            stopNotifications(): Promise<unknown>;
            addEventListener(t: string, cb: (e: Event) => void): void;
            removeEventListener(t: string, cb: (e: Event) => void): void;
          }>;
        }>;
      }>;
      disconnect(): void;
      connected: boolean;
    };
    addEventListener(t: string, cb: () => void): void;
  }>;
}

/** Parses the standard Heart Rate Measurement characteristic. */
export function parseHeartRate(view: DataView): HeartRateSample {
  const flags = view.getUint8(0);
  const is16bit = (flags & 0x01) !== 0;
  const bpm = is16bit ? view.getUint16(1, true) : view.getUint8(1);
  return { t: Date.now(), bpm };
}

export class BluetoothHeartRateSource implements SensorSource<HeartRateSample> {
  readonly id = "ble-heart-rate";
  readonly label = "Bluetooth heart-rate strap";
  readonly provides: MetricId[] = ["heartRate", "avgHeartRate"];

  private state: SourceState = { status: "idle" };
  private onState?: (s: SourceState) => void;
  private device: Awaited<ReturnType<BluetoothLike["requestDevice"]>> | null = null;
  private char: {
    stopNotifications(): Promise<unknown>;
    removeEventListener(t: string, cb: (e: Event) => void): void;
  } | null = null;
  private handler: ((e: Event) => void) | null = null;

  static get supported() {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  getState() {
    return this.state;
  }

  private set(status: SourceState["status"], detail?: string) {
    this.state = { status, detail };
    this.onState?.(this.state);
  }

  async start(onSample: (s: HeartRateSample) => void, onState: (s: SourceState) => void) {
    this.onState = onState;

    if (!BluetoothHeartRateSource.supported) {
      this.set(
        "unsupported",
        "Web Bluetooth isn't available in this browser. Chrome or Edge on desktop and Android support heart-rate straps.",
      );
      return;
    }

    try {
      this.set("connecting", "Select your strap…");
      const bt = (navigator as unknown as { bluetooth: BluetoothLike }).bluetooth;
      // Must be triggered by a user gesture — the connect button calls this.
      const device = await bt.requestDevice({ filters: [{ services: [HEART_RATE_SERVICE] }] });
      this.device = device;

      device.addEventListener("gattserverdisconnected", () => {
        this.set("idle", "Strap disconnected.");
      });

      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(HEART_RATE_SERVICE);
      const char = await service.getCharacteristic(HEART_RATE_MEASUREMENT);

      this.handler = (event: Event) => {
        const target = event.target as unknown as { value?: DataView };
        if (target?.value) onSample(parseHeartRate(target.value));
      };

      char.addEventListener("characteristicvaluechanged", this.handler);
      await char.startNotifications();
      this.char = char;

      this.set("live", device.name ? `Connected to ${device.name}` : "Connected");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A cancelled chooser is not an error worth shouting about.
      this.set(/cancell?ed|User cancelled/i.test(msg) ? "idle" : "error", msg);
    }
  }

  stop() {
    try {
      if (this.char && this.handler)
        this.char.removeEventListener("characteristicvaluechanged", this.handler);
      this.char?.stopNotifications().catch(() => {});
      this.device?.gatt?.disconnect();
    } catch {
      /* already gone */
    }
    this.char = null;
    this.handler = null;
    this.device = null;
    this.set("idle");
  }
}
