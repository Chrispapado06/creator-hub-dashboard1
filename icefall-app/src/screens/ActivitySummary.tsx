import { BarChart3, Play, Share2 } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Badge, Button, Card, Divider, SectionLabel, Metric } from "@/components/ui/primitives";
import { ElevationProfile } from "@/components/ui/charts";
import { RouteMap } from "@/components/ui/RouteMap";
import { TerrainMap } from "@/components/map/TerrainMap";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
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
import { useActivityById } from "@/tracking/feed";
import { SessionPanels } from "@/components/domain/SessionSummary";
import { useRecordedActivities } from "@/tracking/feed";
import { useSettings } from "@/settings/store";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";
import { activityById as trackedType } from "@/tracking/activities";

/** Screen 05 — what the mountain gave back. Works for recorded and seeded activities alike. */
export default function ActivitySummary() {
  const { id } = useParams<{ id: string }>();
  const { activity, recorded } = useActivityById(id);
  const { settings } = useSettings();
  const allRecorded = useRecordedActivities();
  const { goals } = useApp();
  const goal = goals.find((g) => g.status === "active");
  const analytics = useUpgradeCopy("analytics"); // before any early return — it's a hook

  if (!activity) return <Navigate to="/activity" replace />;

  const maxSplit = Math.max(...activity.splits.map((s) => s.durationSec), 1);

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

        {/* Points earned — only recorded activities are scored. */}
        {recorded?.points_awarded != null && (
          <Rise className="pt-5">
            <Card className="border-azure/20 bg-azure/[0.04]">
              <div className="flex items-baseline justify-between">
                <p className="section-label text-azure/80">ICEFALL points</p>
                <p className="tnum text-[22px] font-light text-azure">
                  +{recorded.points_awarded.toLocaleString("en-GB")}
                </p>
              </div>
            </Card>
          </Rise>
        )}

        {/* Headline metrics */}
        <Rise className="pt-5">
          <Card>
            <div className="grid grid-cols-3 gap-3">
              <Metric size="md" value={fmtDistance(activity.distanceKm)} unit="km" label="Distance" />
              <Metric size="md" value={fmtElevation(activity.elevationGainM)} unit="m" label="Ascent" />
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
              <Metric
                size="sm"
                value={activity.avgHr ? String(activity.avgHr) : "—"}
                unit="bpm"
                label="Avg HR"
              />
              <Metric
                size="sm"
                value={activity.calories ? String(activity.calories) : "—"}
                unit="kcal"
                label={
                  recorded?.caloriesForKg
                    ? `Energy · est. for ${recorded.caloriesForKg} kg`
                    : "Energy · estimate"
                }
              />
            </div>
          </Card>
        </Rise>

        {/* ---- The signature panels ---------------------------------------
            Your best today · why it mattered · your journey · milestones ·
            personal bests · what's next. Built to the mockup, and each one
            allowed to be absent when the data does not support it. */}
        {/* Always rendered: the panels decide for themselves what the data
            supports, rather than the whole set vanishing without a track. */}
        {true && (
          <Rise className="pt-6">
            <SessionPanels
              activity={recorded ?? undefined}
              all={allRecorded}
              goal={goal}
              packKg={settings.packWeightKg}
            />
          </Rise>
        )}

        {/* Route */}
        <Rise className="pt-6">
          <SectionLabel>Route</SectionLabel>
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
        </Rise>

        {/* Elevation */}
        <Rise className="pt-6">
          <SectionLabel>Elevation profile</SectionLabel>
          <Card className="mt-3">
            <ElevationProfile track={activity.track} height={100} />
          </Card>
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

        {/* Splits */}
        <Rise className="pt-6">
          <SectionLabel>Splits</SectionLabel>
          <Card className="mt-3" inset={false}>
            <div className="px-4 py-1">
              {activity.splits.map((s) => (
                <div
                  key={s.km}
                  className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-0"
                >
                  <span className="tnum w-6 shrink-0 text-[12px] text-mist-dim">{s.km}</span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-azure/70"
                      style={{ width: `${(s.durationSec / maxSplit) * 100}%` }}
                    />
                  </div>
                  <span className="tnum w-12 shrink-0 text-right text-[12px] text-snow">
                    {fmtDuration(s.durationSec)}
                  </span>
                  <span className="tnum w-12 shrink-0 text-right text-[11px] text-mist-dim">
                    +{s.elevationGainM}m
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </Rise>

        {/* Coach */}
        {activity.insight && (
          <Rise className="pt-6">
            <CoachInsight>{activity.insight}</CoachInsight>
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
          className="sticky bottom-0 z-20 flex gap-2 border-t border-hairline bg-obsidian/95 px-5 pb-5 pt-3 backdrop-blur"
          style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
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


