import { BarChart3, Play, Share2, Watch } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Badge, Button, Card, Divider, SectionLabel, Metric } from "@/components/ui/primitives";
import { RouteMap } from "@/components/ui/RouteMap";
import { TerrainMap } from "@/components/map/TerrainMap";
import {
  Rise,
  Screen,
  ScreenHeader,
  Stagger,
  TABBAR_STICKY_BOTTOM,
} from "@/components/layout/chrome";
import { CoachInsight, WeatherStrip } from "@/components/domain/cards";
import { UpgradePrompt } from "@/components/growth/UpgradePrompt";
import { useUpgradeCopy } from "@/growth/upgradeCopy";
import {
  MODE_LABELS,
  fmtDate,
  fmtDistance,
  fmtDuration,
  fmtElevation,
  fmtPace,
  fmtTime,
} from "@/lib/format";
import { formatReading } from "@/tracking/metrics";
import { useActivityById } from "@/tracking/feed";
import { useRecordedActivities } from "@/tracking/feed";
import { DEFAULT_BODY_MASS_KG, useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";
import { SendToStrava } from "@/strava/SendToStrava";
import { activityById as trackedType } from "@/tracking/activities";
import { WATCH_PROVIDER_NAME } from "@/watch/types";

/** Screen 05 — what the mountain gave back. Works for recorded and seeded activities alike. */
export default function ActivitySummary() {
  const { id } = useParams<{ id: string }>();
  const { activity, recorded } = useActivityById(id);
  const { goals, bodyMassKgSet } = useApp();
  const analytics = useUpgradeCopy("analytics"); // before any early return — it's a hook

  if (!activity) return <Navigate to="/activity" replace />;

  /*
   * AVERAGE HEART RATE — a reading, not a bare dash.
   *
   * This tile printed "—" under a flat "bpm" while the pace tile beside it
   * correctly printed "—" under "no GPS". Two tiles, one screen, two standards,
   * and a dash with nothing attached to it is exactly what the doctrine
   * forbids: an absence has to say why.
   *
   * The reason is not decided here. `readMetric("avgHeartRate", …)` already
   * answers a missing average with `not-connected` for the live tracker, and
   * `formatReading` already turns a reading into text and a unit — so the same
   * two functions answer for a finished activity and the two screens cannot
   * drift apart. Nothing is inferred from `recorded.capabilities`: a strap that
   * connected and then read nothing is still, for this figure, not connected.
   */
  const avgHr = formatReading(
    "avgHeartRate",
    activity.avgHr ? { value: activity.avgHr } : { value: null, reason: "not-connected" },
  );

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title={activity.title}
          subtitle={`${activity.location} · ${fmtDate(activity.startedAt)} · ${fmtTime(activity.startedAt)}`}
          back="/activity"
          action={
            <Button asChild size="icon" variant="secondary" aria-label="Share activity">
              <Link to={`/activity/${activity.id}/share`}>
                <Share2 size={16} strokeWidth={1.6} />
              </Link>
            </Button>
          }
        />
      </div>

      <Stagger className="px-5">
        <Rise>
          <div className="flex items-center gap-2.5">
            <p className="section-label text-azure">Activity complete</p>
            {recorded?.simulated && <Badge tone="alert">Simulated</Badge>}
          </div>
          {/* Recorded activities know exactly what they were; only fall back to
              the coarse family label for seeded ones. */}
          <p className="mt-2 text-[13px] text-mist">
            {recorded ? trackedType(recorded.activityTypeId).label : MODE_LABELS[activity.mode]}
          </p>
        </Rise>

        {/* PH-01 — the "ICEFALL points" card is gone. D5, answered by the
            owner on 2026-08-31: "Nothing, no points." Nothing replaces it; the
            screen stops claiming progression rather than substituting another
            figure. */}

        {/* IMPORTED PROVENANCE — flat, above the fold, never behind a tap.
            Garmin's own brand guidelines will require exactly this placement
            the day a Garmin adapter exists ("Never bury the Garmin
            attribution in tooltips, footnotes or expandable containers"); for
            the other three vendors it is just honesty about what ICEFALL did
            and did not measure. */}
        {recorded?.origin.kind === "imported" && (
          <Rise className="pt-5">
            <div className="flex items-start gap-2.5">
              <Watch size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-mist" />
              <div className="min-w-0">
                <p className="text-[13px] text-snow">
                  Imported from {WATCH_PROVIDER_NAME[recorded.origin.provider]}
                  {recorded.origin.deviceName ? ` ${recorded.origin.deviceName}` : ""}
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">
                  ICEFALL did not record this activity. The figures are the ones your watch service
                  reported.
                </p>
                {recorded.origin.vendorEntered === true && (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">
                    {WATCH_PROVIDER_NAME[recorded.origin.provider]} marks this activity as entered
                    or edited by hand.
                  </p>
                )}
              </div>
            </div>
          </Rise>
        )}

        {/* Headline metrics */}
        <Rise className="pt-5">
          <Card>
            <div className="grid grid-cols-3 gap-3">
              <Metric
                size="md"
                value={fmtDistance(activity.distanceKm)}
                unit="km"
                label="Distance"
              />
              <Metric
                size="md"
                value={fmtElevation(activity.elevationGainM)}
                unit="m"
                label="Ascent"
              />
              <Metric size="md" value={fmtDuration(activity.durationSec)} label="Time" />
            </div>
            <Divider className="my-4" />
            <div className="grid grid-cols-3 gap-3">
              <Metric
                size="sm"
                value={activity.avgPaceSecPerKm ? fmtPace(activity.avgPaceSecPerKm) : "—"}
                unit={activity.avgPaceSecPerKm ? "/km" : "no GPS"}
                label="Avg pace"
              />
              <Metric size="sm" value={avgHr.text} unit={avgHr.unit} label="Avg HR" />
              <Metric
                size="sm"
                value={activity.calories ? String(activity.calories) : "—"}
                unit="kcal"
                label={
                  recorded?.caloriesForKg
                    ? bodyMassKgSet === null
                      ? // The stored `caloriesForKg` is whatever the recorder was
                        // handed, and the recorder is handed the DEFAULTED mass —
                        // so a figure computed for a body nobody described reads
                        // identically to one computed for a real weight. Said
                        // plainly rather than dressed as a measurement.
                        `Energy · est. for an assumed ${recorded.caloriesForKg} kg`
                      : `Energy · est. for ${recorded.caloriesForKg} kg`
                    : "Energy · estimate"
                }
              />
            </div>

            {/* The caveat is a route to the fix, not just a warning. It drops
                the moment a real weight exists — a caveat that outlives its
                cause teaches people to ignore caveats. */}
            {activity.calories !== undefined && bodyMassKgSet === null && (
              <p className="mt-4 border-t border-hairline pt-3.5 text-[11.5px] leading-relaxed text-mist-dim">
                Energy is estimated against an assumed {DEFAULT_BODY_MASS_KG} kg because you have
                not set a weight.{" "}
                <Link to="/settings" className="text-azure underline underline-offset-2">
                  Set your weight
                </Link>{" "}
                and it will be calculated for you.
              </p>
            )}
          </Card>
        </Rise>

        {/* PH-01 — THE SIX PANELS ARE GONE. "Your best today", "why it
            mattered", "your journey", milestones, personal bests and "what's
            next" were all removed at the owner's request: *"Lot of unnecessary
            details and info that are not needed"*. `SessionSummary.tsx` was
            their only home and is deleted with them. */}

        {/* Route */}
        <Rise className="pt-6">
          <SectionLabel>Route</SectionLabel>
          {recorded?.origin.kind === "imported" && recorded.points.length === 0 ? (
            /* v1 imports NO TRACK — there is nothing to draw, real or seeded.
               A synthetic route under a real imported activity would be a
               fabricated map, not a fallback. */
            <p className="mt-3 rounded-card border border-hairline bg-graphite p-4 text-[12px] leading-relaxed text-mist-dim">
              No GPS track — ICEFALL brings across the summary of an imported activity, not the
              route.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-card border border-hairline">
              {recorded && recorded.points.length > 1 ? (
                // Recorded activities carry real coordinates, so they get real
                // terrain. Tilt it and the climb is visible in the landform.
                <TerrainMap
                  track={recorded.points.map((p) => ({ lat: p.lat, lon: p.lon }))}
                  follow={false}
                  start3D
                  fallbackTrack={activity.track}
                  fallbackSeed={activity.id}
                  className="aspect-square w-full"
                />
              ) : (
                <RouteMap
                  track={activity.track}
                  seed={activity.id}
                  className="aspect-square w-full"
                />
              )}
            </div>
          )}
        </Rise>

        {/* Conditions — only when something actually recorded them. */}
        {activity.conditions && (
          <Rise className="pt-6">
            <SectionLabel>Conditions</SectionLabel>
            <Card className="mt-3">
              <WeatherStrip conditions={activity.conditions} />
              {activity.conditions.visibilityKm && (
                <p className="tnum mt-3 text-[12px] text-mist-dim">
                  Visibility {activity.conditions.visibilityKm} km
                </p>
              )}
            </Card>
          </Rise>
        )}

        {/* PH-01 — the splits table and the elevation profile came out here
            too. The route map and the conditions stay: those are what the
            activity WAS, rather than an analysis of it. */}

        {/* Coach */}
        {activity.insight && (
          <Rise className="pt-6">
            <CoachInsight>{activity.insight}</CoachInsight>
          </Rise>
        )}

        {/* Sending to Strava lives HERE, on the activity it would send, rather
            than in the sticky bar below: the bar is three ways of looking at
            this recording, and this is the one control that leaves the app with
            data attached. It draws nothing at all when Strava cannot work for
            this person — see the component. */}
        {recorded && (
          <Rise className="pt-6">
            <SendToStrava activity={recorded} />
          </Rise>
        )}

        {/* Post-activity is peak motivation — the honest moment to show the
            analytics layer a free athlete doesn't have yet. Self-hides on Pro. */}
        <Rise className="pt-6">
          <UpgradePrompt featureId="data.analytics" title={analytics.title} body={analytics.body} />
        </Rise>
      </Stagger>

      {/* ---- The mockup's persistent action bar -------------------------
          Sticky rather than a one-off row near the top: the whole point of
          the screen is that Replay stays one tap away however far down you
          have scrolled. Withheld when the recording carries no track. */}
      {recorded && recorded.points.length > 1 && (
        <div
          className="sticky z-20 flex gap-2 border-t border-hairline bg-obsidian/95 px-5 pb-5 pt-3 backdrop-blur"
          /* Rests just above the floating tab bar, not under it. */
          style={{ bottom: TABBAR_STICKY_BOTTOM }}
        >
          <Button asChild className="flex-1">
            <Link to={`/activity/${activity.id}/replay`}>
              <Play size={15} strokeWidth={2} fill="currentColor" />
              Replay
            </Link>
          </Button>
          <Button asChild variant="secondary" className="flex-1">
            <Link to={`/activity/${activity.id}/analysis`}>
              <BarChart3 size={15} strokeWidth={1.8} />
              Analyse
            </Link>
          </Button>
          <Button asChild variant="secondary" className="flex-1">
            <Link to={`/activity/${activity.id}/share`}>
              <Share2 size={15} strokeWidth={1.7} />
              Share
            </Link>
          </Button>
        </div>
      )}
    </Screen>
  );
}
