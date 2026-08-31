import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Share2, Trophy, BarChart3, Play} from "lucide-react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, Card, Disclaimer, Metric } from "@/components/ui/primitives";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { fmtDistance, fmtDuration, fmtElevation } from "@/lib/format";
import { loadActivities, loadMeta } from "@/tracking/store";
import { detectAchievements, detectRecords } from "@/tracking/records";
import { activityById } from "@/tracking/activities";

/**
 * Screens 06–08 — completion and achievement.
 *
 * ICEFALL points were removed from this screen (PH-05) and from the product
 * (PH-01). Nothing here reads `points_awarded`.
 *
 * Staged rather than dumped: the athlete gets the result, then the reward, then
 * the option to look deeper. The animation is restrained on purpose — a luxury
 * watch acknowledging a milestone, not a mobile game.
 */
export default function ActivityComplete() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(0);

  const all = useMemo(() => loadActivities(), []);
  const activity = all.find((a) => a.id === id);

  // Records and achievements were computed at finalise time; recompute the
  // display objects from the stored ids so the copy lives in one place.
  const detail = useMemo(() => {
    if (!activity) return { records: [], achievements: [] };
    const history = all.filter((a) => a.id !== activity.id);
    const meta = loadMeta();
    const earnedBefore = meta.earnedAchievements.filter(
      (x) => !(activity.achievements ?? []).includes(x),
    );
    return {
      records: detectRecords(activity, history).filter((r) =>
        (activity.records ?? []).includes(r.id),
      ),
      achievements: detectAchievements(activity, earnedBefore).filter((a) =>
        (activity.achievements ?? []).includes(a.id),
      ),
    };
  }, [activity, all]);


  // Staged reveal.
  useEffect(() => {
    if (!activity) return;
    const timers = [
      setTimeout(() => setStage(1), reduce ? 0 : 900),
      setTimeout(() => setStage(2), reduce ? 0 : 2100),
    ];
    return () => timers.forEach(clearTimeout);
  }, [activity, reduce]);

  if (!activity) return <Navigate to="/activity" replace />;

  const type = activityById(activity.activityTypeId);
  const achievement = detail.achievements[0];

  return (
    <div className="no-scrollbar flex h-full flex-col overflow-y-auto bg-obsidian px-5">
      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        {/* Ring */}
        <motion.div
          initial={{ scale: 0.86, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative grid h-24 w-24 place-items-center"
        >
          <svg viewBox="0 0 96 96" className="absolute inset-0 -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="45"
              fill="none"
              strokeWidth="1.5"
              className="stroke-white/[0.08]"
            />
            <motion.circle
              cx="48"
              cy="48"
              r="45"
              fill="none"
              stroke="var(--ice-azure)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 45}
              initial={{ strokeDashoffset: reduce ? 0 : 2 * Math.PI * 45 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: reduce ? 0 : 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            />
          </svg>
          <Check size={30} strokeWidth={1.3} className="text-azure" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mt-7 text-[26px] font-light leading-tight tracking-[-0.02em] text-snow"
        >
          Activity complete
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-2 text-[13px] text-mist"
        >
          {type.label}
          {activity.simulated && " · simulated"}
        </motion.p>

        {/* Headline numbers */}
        {/* One at a time, 140 ms apart — the spec's "metrics appear one by
            one". `useReducedMotion` collapses the whole stagger to zero, so a
            person who has asked the OS for less movement gets the finished
            state immediately rather than a slower version of the same thing. */}
        <div className="mt-8 flex w-full max-w-[300px] items-start justify-between gap-3">
          {[
            { value: fmtDistance(activity.distanceM / 1000), unit: "km", label: "Distance" },
            { value: fmtDuration(activity.movingSec), unit: undefined, label: "Moving" },
            { value: fmtElevation(activity.elevationGainM), unit: "m", label: "Ascent" },
          ].map((m, i) => (
            <motion.div
              key={m.label}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                delay: reduce ? 0 : 0.65 + i * 0.14,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Metric size="md" value={m.value} unit={m.unit} label={m.label} />
            </motion.div>
          ))}
        </div>

        {/* The route, drawing itself onto the frame. */}
        {activity.points.length > 1 && (
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: reduce ? 0 : 1.1 }}
            className="mt-7 w-full max-w-[320px]"
          >
            <DrawnRoute
              points={activity.points.map((p) => ({ lat: p.lat, lon: p.lon }))}
              reduce={Boolean(reduce)}
            />
          </motion.div>
        )}

        {/* PH-05: the ICEFALL points card is gone. It was the largest thing on
            this screen — "You earned +N ICEFALL points", counted up in azure.
            The owner is removing points from the system, not hiding the badge,
            so the count-up animation and the `points_awarded` read went with
            it rather than being left computing a number nobody sees. */}

        {/* Achievement */}
        {stage >= 2 && achievement && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4 w-full max-w-[320px]"
          >
            <Card>
              <div className="flex items-center gap-3.5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-tile border border-azure/35 bg-azure/[0.07]">
                  <IcefallMark className="h-4 text-azure" />
                </span>
                <div className="min-w-0 text-left">
                  <p className="section-label text-azure/80">Achievement unlocked</p>
                  <p className="mt-1 truncate text-[15px] text-snow">{achievement.name}</p>
                  <p className="mt-0.5 text-[11px] text-mist-dim">{achievement.detail}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Records */}
        {stage >= 2 && detail.records.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="mt-3 w-full max-w-[320px] space-y-2"
          >
            {detail.records.slice(0, 2).map((r) => (
              <Card key={r.id} className="border-summit/25 bg-summit/[0.05]">
                <div className="flex items-center gap-3">
                  <Trophy size={15} strokeWidth={1.5} className="shrink-0 text-summit" />
                  <div className="min-w-0 text-left">
                    <p className="section-label text-summit/80">New personal best</p>
                    <p className="mt-1 truncate text-[13px] text-snow">
                      {r.label} — <span className="tnum">{r.value}</span>
                    </p>
                    {r.previous && (
                      <p className="text-[10px] text-mist-dim">Previous <span className="tnum">{r.previous}</span></p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </motion.div>
        )}

        {/* PH-01 — the points breakdown table and its "capped so there is
            never a reason to stay out longer than is safe" note are gone with
            the rest of the points system. Stage 3 existed ONLY to unveil this
            card, so its timer went too: stage 1 is the metrics, stage 2 the
            achievement and records, and there is no third act. */}

      </div>

      <div
        className="sticky bottom-0 shrink-0 space-y-2.5 bg-obsidian pb-5 pt-4"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* ---- Replay, where the mockup leads --------------------------------
            This is the screen you land on the moment a recording ends, so it
            is where the flyover belongs — putting it only on the summary meant
            finishing an activity and being offered no way to watch it back.
            Withheld, not shown-and-dead, when the track has no positions. */}
        {activity.points.length > 1 && (
          <div className="flex gap-2.5">
            <Button
              size="lg"
              className="flex-1"
              onClick={() => navigate(`/activity/${activity.id}/replay`)}
            >
              <Play size={16} strokeWidth={2} fill="currentColor" />
              Replay
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="flex-1"
              onClick={() => navigate(`/activity/${activity.id}/analysis`)}
            >
              <BarChart3 size={16} strokeWidth={1.7} />
              Analyse
            </Button>
          </div>
        )}

        <Button
          size="lg"
          variant={activity.points.length > 1 ? "secondary" : "primary"}
          className="w-full"
          onClick={() => navigate(`/activity/${activity.id}`)}
        >
          View summary
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="w-full"
          onClick={() => navigate(`/activity/${activity.id}/share`)}
        >
          <Share2 size={16} strokeWidth={1.6} />
          Share activity
        </Button>
      </div>
    </div>
  );
}

/**
 * The recorded line, drawing itself on.
 *
 * An SVG stroke-dash animation rather than anything on a canvas: it is a few
 * hundred bytes of path, it costs nothing next to a terrain mesh, and it is the
 * one moment in the app where the shape of the day appears in front of the
 * athlete. Projected with a cosine correction so a route at 49°N is not drawn
 * stretched sideways.
 */
function DrawnRoute({
  points,
  reduce,
}: {
  points: { lat: number; lon: number }[];
  reduce: boolean;
}) {
  const W = 320;
  const H = 128;
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanX = Math.max((maxLon - minLon) * k, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const scale = Math.min((W - 24) / spanX, (H - 24) / spanY);

  const d = points
    .map((p, i) => {
      const x = W / 2 + ((p.lon - (minLon + maxLon) / 2) * k) * scale;
      const y = H / 2 - (p.lat - (minLat + maxLat) / 2) * scale;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} aria-hidden>
      <motion.path
        d={d}
        fill="none"
        stroke="var(--ice-azure)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 1.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}
