import { useMemo, useState, useEffect, useRef} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bluetooth,
  ChevronLeft,
  HeartPulse,
  MapPin,
  Pause,
  Play,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Navigate, useNavigate, useParams, useSearchParams} from "react-router-dom";
import { Badge, Button, Card, Disclaimer } from "@/components/ui/primitives";
import { TerrainMap } from "@/components/map/TerrainMap";
import {
  CueToast,
  GpsBadge,
  MetricTile,
  SignalWarning,
  SimulatedBadge,
} from "@/components/tracker/parts";
import { ACTIVITY_ICON } from "@/components/tracker/activityIcons";
import { useLiveCoach } from "@/coach/useLiveCoach";
import { intentById, type IntentId } from "@/coach/sessionIntent";
import { useSettings } from "@/settings/store";
import { savedMapStyle } from "@/components/map/icefallStyle";
import { cn } from "@/lib/utils";
import { activityById } from "@/tracking/activities";
import { readMetric } from "@/tracking/metrics";
import { projectTrack } from "@/tracking/adapt";
import { finalizeActivity } from "@/tracking/finalize";
import { useRecorder, type GpsMode } from "@/tracking/useRecorder";
import type { ActivityTypeId } from "@/tracking/types";
import { useApp } from "@/state/AppState";
import { usePrimaryGoalWithProgress } from "@/tracking/training";
import { sync } from "@/services/repository";

/**
 * Screens 02–05 — live tracking, pause and finish confirmation.
 *
 * Built for a gloved hand in glare: the map dominates, three primary numbers
 * are enormous, and there are exactly three controls.
 */
export default function LiveTracker() {
  const { typeId } = useParams<{ typeId: string }>();
  const navigate = useNavigate();
  const goal = usePrimaryGoalWithProgress();
  const { bodyMassKg, autoPause } = useApp();
  const { settings } = useSettings();

  const type = typeId ? activityById(typeId as ActivityTypeId) : null;
  const [params] = useSearchParams();
  const [mode, setMode] = useState<GpsMode>(
    params.get("mode") === "simulated" ? "simulated" : "device",
  );
  /*
   * START MEANS START.
   *
   * The settings screen already asked what you are doing, on which mountain,
   * with what pack — and then this screen asked again, behind a permissions
   * explainer and a GPS-mode chooser. Two "start" buttons for one intention.
   * When the previous screen sends `?go=1` the recorder arms immediately and
   * the browser's own permission prompt — which needs a user gesture, and has
   * one, in the tap that got here — is the only thing between the athlete and
   * a running clock.
   *
   * The explainer is not deleted: it is what a first-time athlete sees when
   * they arrive without that flag, and `?mode=simulated` still reaches the
   * indoor-review path.
   */
  const [armed, setArmed] = useState(params.get("go") === "1");
  const [confirming, setConfirming] = useState(false);

  const mountain = goal?.mountainId ? sync.mountainById(goal.mountainId) : undefined;

  const rec = useRecorder({
    activityTypeId: (typeId as ActivityTypeId) ?? "outdoor-run",
    mode,
    autoPause,
    bodyMassKg,
    elevationTargetM: type?.verticalFocus ? 1000 : null,
  });

  const { snapshot: s } = rec;

  /*
   * The spoken coach. No AI and no network: `liveCues` compares the athlete to
   * the pace or vertical rate they themselves settled into, and the browser's
   * own on-device voices say it. Off unless the athlete turns it on — a phone
   * that starts talking unasked in a quiet place is unforgivable.
   */
  const [coachOn, setCoachOn] = useState(false);
  const intent = settings.sessionGoal ? intentById(settings.sessionGoal as IntentId) : null;
  const coach = useLiveCoach({
    snapshot: s,
    intent,
    activity: type ?? activityById("outdoor-run"),
    enabled: coachOn,
  });

  const objectiveProgressPct = useMemo(() => {
    if (!type?.verticalFocus || !mountain || s.altitudeM === null) return null;
    return Math.max(0, Math.min(100, (s.altitudeM / mountain.elevationM) * 100));
  }, [type, mountain, s.altitudeM]);

  const projected = useMemo(() => projectTrack(s.points), [s.points]);
  // `accuracy` rides along so the map's follow camera knows how much of the
  // last fix's movement to believe. See followCameraFor in @/tracking/display.
  const geoTrack = useMemo(
    () => s.points.map((p) => ({ lat: p.lat, lon: p.lon, heading: p.heading, accuracy: p.accuracy })),
    [s.points],
  );

  if (!type) return <Navigate to="/activity" replace />;

  const TypeIcon = ACTIVITY_ICON[type.id];
  const ctx = { indoor: type.indoor, objectiveProgressPct };
  const [m1, m2, m3, ...rest] = type.metrics;

  async function handleStart() {
    setArmed(true);
    await rec.start();
  }

  // Arriving already armed: begin the moment the recorder is ready, once.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!armed || autoStarted.current || s.status !== "idle") return;
    autoStarted.current = true;
    void rec.start();
  }, [armed, s.status, rec]);

  function handleFinish() {
    const raw = rec.finish();
    const result = finalizeActivity(raw);
    navigate(`/activity/complete/${result.activity.id}`, { replace: true });
  }

  /* ---------------------------------------------------------------- */
  /* Pre-start: explain what will be used, and why                    */
  /* ---------------------------------------------------------------- */

  if (!armed) {
    return (
      <div className="flex h-full flex-col bg-obsidian">
        <div
          className="flex shrink-0 items-center gap-3 px-5 pb-4"
          // Full-bleed route (outside AppShell), so this header is the top of
          // the display and must clear the notch itself — the live view below
          // already does.
          style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top, 0px))" }}
        >
          <button
            type="button"
            onClick={() => navigate("/activity/select")}
            aria-label="Back"
            className="-ml-2 grid h-9 w-9 place-items-center rounded-full text-mist hover:text-snow"
          >
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-tile border border-azure/35 bg-azure/[0.07] text-azure">
            <TypeIcon size={19} strokeWidth={1.4} />
          </span>
          <div className="min-w-0">
            <p className="section-label">Ready</p>
            <h1 className="mt-1 truncate text-[20px] font-light text-snow">{type.label}</h1>
          </div>
        </div>

        <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-5">
          <Card>
            <p className="section-label">Permissions ICEFALL will ask for</p>
            <ul className="mt-3 space-y-3">
              {!type.indoor && (
                <Perm
                  icon={MapPin}
                  title="Location, while the activity runs"
                  body="Records your route, distance, altitude and ascent. Nothing is recorded before you press start or after you finish."
                />
              )}
              <Perm
                icon={HeartPulse}
                title="Heart-rate strap (optional)"
                body="Connects directly to a Bluetooth strap. ICEFALL never asks for health data it does not display."
              />
            </ul>
            {type.indoor && (
              <p className="mt-4 text-[11px] leading-relaxed text-mist-dim">
                This is an indoor activity, so ICEFALL will not request location at all.
              </p>
            )}
          </Card>

          {!type.indoor && (
            <Card>
              <p className="section-label">Position source</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ModeButton
                  active={mode === "device"}
                  onClick={() => setMode("device")}
                  title="Device GPS"
                  body="Real satellite fixes"
                />
                <ModeButton
                  active={mode === "simulated"}
                  onClick={() => setMode("simulated")}
                  title="Simulated"
                  body="For indoor review"
                />
              </div>
              {mode === "simulated" && (
                <Disclaimer className="mt-4">
                  Simulated tracks are generated, not measured. Everything recorded in this mode is
                  labelled SIMULATED and never presented as real performance.
                </Disclaimer>
              )}
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] text-snow">Heart-rate strap</p>
                <p className="mt-1 text-[11px] text-mist-dim">
                  {rec.hrState.detail ??
                    (rec.bluetoothSupported
                      ? "Not connected"
                      : "Web Bluetooth unavailable in this browser")}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={!rec.bluetoothSupported}
                onClick={() => rec.connectHeartRate()}
              >
                <Bluetooth size={14} strokeWidth={1.7} />
                Connect
              </Button>
            </div>
          </Card>
        </div>

        <div
          className="shrink-0 border-t border-hairline px-5 pb-5 pt-4"
          style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <Button size="lg" className="w-full" onClick={handleStart}>
            Start {type.label}
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Live                                                             */
  /* ---------------------------------------------------------------- */

  const paused = s.status === "paused";

  return (
    <div className="relative flex h-full flex-col bg-obsidian">
      {/* Real terrain, tilted — as you gain altitude the ground rises with you. */}
      <TerrainMap
        track={geoTrack}
        current={geoTrack[geoTrack.length - 1] ?? null}
        follow
        // A bicycle and a belay want different cameras: see followCameraFor.
        followActivityTypeId={type.id}
        interactive
        showControls
        start3D
        styleId={savedMapStyle()}
        fallbackTrack={projected}
        fallbackSeed={type.id}
        className="absolute inset-0 h-full w-full"
      />
      <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-obsidian via-obsidian/75 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-obsidian via-obsidian/93 to-transparent" />

      {/* Top bar */}
      <div
        className="relative z-20 shrink-0 px-5 pt-6"
        style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-center justify-between gap-2">
          {/* The activity is always legible, even at arm's length in glare —
              and it is never the element that gets truncated. */}
          <span className="flex min-w-0 items-center gap-2 rounded-full border border-hairline-strong bg-obsidian/60 py-1.5 pl-2 pr-3.5 backdrop-blur">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-azure/12 text-azure">
              <TypeIcon size={13} strokeWidth={1.6} />
            </span>
            <span className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-snow">
              {type.label}
            </span>
          </span>
          <GpsBadge quality={s.gpsQuality} accuracyM={s.gpsAccuracyM} indoor={type.indoor} />
        </div>
        {s.simulated && <SimulatedBadge className="mt-2.5" />}
        {rec.gpsState.status === "denied" && (
          <p className="mt-3 text-[11px] leading-relaxed text-danger">{rec.gpsState.detail}</p>
        )}
      </div>

      <CueToast cue={rec.cue} />
      <SignalWarning
        show={s.signalLost}
        message="GPS signal lost. Timing continues — distance will resume when a fix returns."
      />

      <div className="flex-1" />

      {/* Metrics */}
      <div className="relative z-20 shrink-0 px-5 pb-5">
        {s.autoPaused && !paused && (
          <Badge tone="alert" className="mb-3">
            Auto-paused — no movement
          </Badge>
        )}

        <MetricTile id={m1} reading={readMetric(m1, s, ctx)} size="hero" />

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-hairline pt-5">
          <MetricTile id={m2} reading={readMetric(m2, s, ctx)} />
          <MetricTile id={m3} reading={readMetric(m3, s, ctx)} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-hairline pt-5">
          {rest.slice(0, 6).map((id) => (
            <MetricTile key={id} id={id} reading={readMetric(id, s, ctx)} size="sm" />
          ))}
        </div>

        {/* Objective progress — the mountaineering differentiator */}
        {type.verticalFocus && mountain && objectiveProgressPct !== null && (
          <div className="mt-5 border-t border-hairline pt-4">
            <div className="flex items-baseline justify-between">
              <span className="section-label">
                {mountain.name} — {mountain.elevationM.toLocaleString("en-GB")} m
              </span>
              <span className="tnum text-[12px] text-azure">
                {Math.round(objectiveProgressPct)}%
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-azure transition-[width] duration-700"
                style={{ width: `${objectiveProgressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Controls */}
        <div
          className="mt-7 flex items-center justify-between"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <button
            type="button"
            onClick={() => {
              const next = !coachOn;
              setCoachOn(next);
              // Speak once on enabling, so the athlete knows it works and at
              // what volume, rather than finding out mid-climb.
              if (next && coach.supported) coach.say("Coach on.");
            }}
            aria-pressed={coachOn}
            aria-label={coachOn ? "Turn spoken coach off" : "Turn spoken coach on"}
            disabled={!coach.supported}
            className={cn(
              "grid h-12 w-12 place-items-center rounded-full border transition-colors disabled:opacity-35",
              coachOn
                ? "border-azure/50 text-azure"
                : "border-hairline-strong text-mist hover:text-snow",
            )}
          >
            {coachOn ? <Volume2 size={18} strokeWidth={1.5} /> : <VolumeX size={18} strokeWidth={1.5} />}
          </button>

          <button
            type="button"
            onClick={() => (paused ? rec.resume() : rec.pause())}
            aria-label={paused ? "Resume" : "Pause"}
            className="grid h-[76px] w-[76px] place-items-center rounded-full border-2 border-azure text-azure transition-all duration-200 hover:bg-azure hover:text-obsidian active:scale-95 disabled:opacity-40"
          >
            {paused ? (
              <Play size={26} strokeWidth={1.6} className="ml-1" />
            ) : (
              <Pause size={26} strokeWidth={1.6} />
            )}
          </button>

          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label="Finish activity"
            className="grid h-12 w-12 place-items-center rounded-full border border-hairline-strong text-mist transition-colors hover:border-danger/50 hover:text-danger disabled:opacity-40"
          >
            <Square size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Paused overlay */}
      <AnimatePresence>
        {paused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-obsidian/92 px-6 backdrop-blur-md"
          >
            <div className="grid h-20 w-20 place-items-center rounded-full border border-azure/40">
              <Pause size={28} strokeWidth={1.4} className="text-azure" />
            </div>
            <p className="mt-6 text-[13px] uppercase tracking-[0.18em] text-snow">
              Activity paused
            </p>
            <p className="tnum mt-2 text-[26px] font-extralight text-mist">
              {new Date(s.elapsedMs).toISOString().substring(11, 19)}
            </p>

            <div className="mt-8 grid w-full max-w-[280px] grid-cols-2 gap-3">
              <PausedStat id={m1} s={s} ctx={ctx} />
              <PausedStat id={m2} s={s} ctx={ctx} />
              <PausedStat id={m3} s={s} ctx={ctx} />
              {rest[0] && <PausedStat id={rest[0]} s={s} ctx={ctx} />}
            </div>

            <div className="mt-9 w-full max-w-[280px] space-y-2.5">
              <Button size="lg" className="w-full" onClick={() => rec.resume()}>
                Resume
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="w-full"
                onClick={() => setConfirming(true)}
              >
                Finish
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Finish confirmation */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-end bg-obsidian/80 backdrop-blur-sm"
            onClick={() => setConfirming(false)}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Finish your activity?"
              className="w-full rounded-t-card border-t border-hairline-strong bg-graphite p-5"
              style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
            >
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/15" />
              <h2 className="text-[22px] font-light text-snow">Finish your activity?</h2>
              <p className="mt-1.5 text-[13px] text-mist">Good work out there.</p>

              <div className="mt-5 rounded-card border border-hairline bg-obsidian p-4">
                <p className="section-label">{type.label}</p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <MetricTile id={m1} reading={readMetric(m1, s, ctx)} size="sm" />
                  <MetricTile id={m2} reading={readMetric(m2, s, ctx)} size="sm" />
                  <MetricTile id={m3} reading={readMetric(m3, s, ctx)} size="sm" />
                </div>
              </div>

              <div className="mt-5 space-y-2.5">
                <Button size="lg" className="w-full" onClick={handleFinish}>
                  Finish activity
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full"
                  onClick={() => setConfirming(false)}
                >
                  Continue activity
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PausedStat({
  id,
  s,
  ctx,
}: {
  id: Parameters<typeof readMetric>[0];
  s: Parameters<typeof readMetric>[1];
  ctx: Parameters<typeof readMetric>[2];
}) {
  return (
    <div className="rounded-tile border border-hairline bg-graphite/60 p-3">
      <MetricTile id={id} reading={readMetric(id, s, ctx)} size="sm" />
    </div>
  );
}

function Perm({ icon: Icon, title, body }: { icon: typeof MapPin; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <Icon size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
      <div>
        <p className="text-[13px] text-snow">{title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">{body}</p>
      </div>
    </li>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-tile border p-3 text-left transition-colors",
        active ? "border-azure/50 bg-azure/[0.06]" : "border-hairline hover:border-hairline-strong",
      )}
    >
      <p className={cn("text-[13px]", active ? "text-snow" : "text-mist")}>{title}</p>
      <p className="mt-1 text-[10px] text-mist-dim">{body}</p>
    </button>
  );
}
