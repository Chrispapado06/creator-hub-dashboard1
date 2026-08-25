import { useCallback, useEffect, useState } from "react";
import {
  Activity as ActivityIcon,
  Footprints,
  Flame,
  HeartPulse,
  Moon,
  Mountain,
  Smartphone,
} from "lucide-react";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { MiniBars, ProgressRing } from "@/components/ui/charts";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import {
  HEALTH_METRIC_LABELS,
  REQUESTED_HEALTH_METRICS,
  healthService,
  type HealthDaySummary,
  type HealthSeriesPoint,
  type HealthState,
  type HealthValue,
} from "@/tracking/sources/health";

/**
 * Daily health — steps, energy, floors, resting heart rate and sleep from
 * Apple Health or Android Health Connect.
 *
 * No browser can read a step count, so on the web this screen explains exactly
 * what is needed instead of showing invented numbers. Every value carries its
 * own availability state.
 */

const STEP_GOAL = 10_000;

export default function Health() {
  const [state, setState] = useState<HealthState>(healthService.state);
  const [day, setDay] = useState<HealthDaySummary | null>(null);
  const [series, setSeries] = useState<HealthSeriesPoint[]>([]);

  useEffect(() => healthService.subscribe(setState), []);

  const refresh = useCallback(async () => {
    setDay(await healthService.daySummary());
    setSeries(await healthService.stepSeries(7));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, state.status, state.sample]);

  const connected = state.status === "connected";
  const steps = day?.steps.value ?? null;
  const pct = steps ? Math.min(100, (steps / STEP_GOAL) * 100) : 0;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Daily"
          subtitle="Everything outside a recorded activity"
          back="/profile"
          action={state.sample ? <Badge tone="alert">Sample data</Badge> : undefined}
        />
      </div>

      <Stagger className="px-5">
        {/* Connection state */}
        {!connected && (
          <Rise>
            <Card>
              <div className="flex items-start gap-3">
                <Smartphone size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
                <div className="min-w-0">
                  <p className="text-[14px] text-snow">
                    {state.status === "unsupported" ? "Not available on the web" : "Not connected"}
                  </p>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                    {state.detail ??
                      "Connect Apple Health or Health Connect to bring your daily movement into ICEFALL."}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                {state.status !== "unsupported" && (
                  <Button className="w-full" onClick={() => healthService.connect()}>
                    Connect{" "}
                    {state.platform === "health-connect" ? "Health Connect" : "Apple Health"}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => healthService.useSampleData(true)}
                >
                  Preview with sample data
                </Button>
              </div>
            </Card>
          </Rise>
        )}

        {/* Steps */}
        <Rise className={connected ? "" : "pt-6"}>
          <SectionLabel
            action={
              state.sample ? (
                <button
                  type="button"
                  onClick={() => healthService.useSampleData(false)}
                  className="section-label transition-colors hover:text-azure"
                >
                  Clear sample
                </button>
              ) : undefined
            }
          >
            Today
          </SectionLabel>
          <Card className="mt-3">
            <div className="flex items-center gap-6">
              <ProgressRing value={pct} size={104} stroke={4}>
                <div className="text-center">
                  <div className="tnum text-[20px] font-light leading-none text-snow">
                    {steps === null ? "—" : steps.toLocaleString("en-GB")}
                  </div>
                  <div className="tnum mt-1 text-[10px] text-mist-dim">
                    {steps === null ? "no data" : `/ ${STEP_GOAL.toLocaleString("en-GB")}`}
                  </div>
                </div>
              </ProgressRing>
              <div className="min-w-0 flex-1 space-y-3">
                <Row
                  icon={Footprints}
                  label="Steps"
                  v={day?.steps}
                  fmt={(n) => n.toLocaleString("en-GB")}
                />
                <Row
                  icon={ActivityIcon}
                  label="Walking"
                  v={day?.distance}
                  fmt={(n) => `${(n / 1000).toFixed(1)} km`}
                />
                <Row
                  icon={Mountain}
                  label="Floors"
                  v={day?.floors}
                  fmt={(n) => String(Math.round(n))}
                />
              </div>
            </div>
          </Card>
        </Rise>

        {/* Seven-day steps */}
        <Rise className="pt-6">
          <SectionLabel>Last seven days</SectionLabel>
          <Card className="mt-3">
            {series.some((p) => p.steps !== null) ? (
              <MiniBars
                data={series.map((p) => p.steps ?? 0)}
                activeIndex={series.reduce((last, p, i) => (p.steps !== null ? i : last), -1)}
              />
            ) : (
              <p className="py-4 text-center text-[12px] text-mist-dim">
                No step history available yet.
              </p>
            )}
          </Card>
        </Rise>

        {/* Recovery */}
        <Rise className="pt-6">
          <SectionLabel>Recovery</SectionLabel>
          <Card className="mt-3">
            <div className="grid grid-cols-2 gap-5">
              <Tile
                icon={Flame}
                label="Active energy"
                v={day?.activeEnergy}
                fmt={(n) => `${Math.round(n)}`}
                unit="kcal"
              />
              <Tile
                icon={ActivityIcon}
                label="Exercise"
                v={day?.exerciseMinutes}
                fmt={(n) => `${Math.round(n)}`}
                unit="min"
              />
              <Tile
                icon={HeartPulse}
                label="Resting HR"
                v={day?.restingHeartRate}
                fmt={(n) => `${Math.round(n)}`}
                unit="bpm"
              />
              <Tile
                icon={Moon}
                label="Sleep"
                v={day?.sleep}
                fmt={(n) => `${Math.floor(n / 60)}h ${Math.round(n % 60)}m`}
              />
            </div>
          </Card>
        </Rise>

        {/* What ICEFALL asks for */}
        <Rise className="pt-6">
          <SectionLabel>What ICEFALL reads</SectionLabel>
          <Card className="mt-3" inset={false}>
            <div className="px-4">
              {REQUESTED_HEALTH_METRICS.map((m) => (
                <div key={m} className="border-b border-hairline py-3 last:border-0">
                  <p className="text-[13px] text-snow">{HEALTH_METRIC_LABELS[m].label}</p>
                  <p className="mt-0.5 text-[11px] text-mist-dim">{HEALTH_METRIC_LABELS[m].why}</p>
                </div>
              ))}
            </div>
          </Card>
          <Disclaimer className="mt-4">
            ICEFALL reads only these values and only with your permission. It never writes to your
            health record, and nothing is sent anywhere without you choosing to share it.
          </Disclaimer>
        </Rise>

        {state.sample && (
          <Rise className="pt-5">
            <Disclaimer>
              You are viewing a sample dataset so the screen can be reviewed without a phone. These
              are not your measurements.
            </Disclaimer>
          </Rise>
        )}
      </Stagger>
    </Screen>
  );
}

function reasonCopy(v?: HealthValue) {
  if (!v) return "—";
  switch (v.reason) {
    case "unsupported":
      return "Mobile app only";
    case "not-connected":
      return "Not connected";
    case "needs-permission":
      return "Permission needed";
    case "no-data":
      return "No data";
    default:
      return "—";
  }
}

function Row({
  icon: Icon,
  label,
  v,
  fmt,
}: {
  icon: typeof Footprints;
  label: string;
  v?: HealthValue;
  fmt: (n: number) => string;
}) {
  const has = v?.value != null;
  return (
    <div className="flex items-center gap-2.5">
      <Icon
        size={14}
        strokeWidth={1.5}
        className={cn("shrink-0", has ? "text-azure" : "text-mist-dim")}
      />
      <span className="flex-1 text-[12px] text-mist">{label}</span>
      <span className={cn("tnum text-[12px]", has ? "text-snow" : "text-mist-dim")}>
        {has ? fmt(v!.value!) : reasonCopy(v)}
      </span>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  v,
  fmt,
  unit,
}: {
  icon: typeof Footprints;
  label: string;
  v?: HealthValue;
  fmt: (n: number) => string;
  unit?: string;
}) {
  const has = v?.value != null;
  return (
    <div>
      <div className="section-label mb-2 flex items-center gap-1.5">
        <Icon size={11} strokeWidth={1.6} className={has ? "text-azure" : "text-mist-dim"} />
        {label}
      </div>
      <div
        className={cn(
          "tnum text-[19px] font-light leading-none",
          has ? "text-snow" : "text-mist-dim",
        )}
      >
        {has ? fmt(v!.value!) : reasonCopy(v)}
        {has && unit && <span className="ml-1 text-[11px] text-mist">{unit}</span>}
      </div>
    </div>
  );
}
