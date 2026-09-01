import {
  Check,
  Filter,
  Loader2,
  MapPin,
  Mountain as MountainIcon,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { DifficultyDots, MountainCard } from "@/components/domain/cards";
import { cn } from "@/lib/utils";
import { fmtDate, fmtElevation } from "@/lib/format";
import { sync } from "@/services/repository";
import { useApp, type SavedObjective } from "@/state/AppState";
import { ASSESSMENT_BANDS, assessPeak } from "@/services/peakAssessment";
import { REPRESENTATIVE_CAPTION } from "@/services/peakImagery";
import { useMountainImage } from "@/components/domain/MountainImage";
import { MountainPage } from "@/components/domain/MountainPage";
import { useGoalsWithProgress } from "@/tracking/training";
import {
  PEAK_ATTRIBUTION,
  mergePeaks,
  rememberPeaks,
  searchCatalogueByName,
  type Peak,
} from "@/services/peaks";

/** True when a peak's derived band passes the current chip selection. */
type BandFilter = (elevationM: number, lat: number, lon?: number) => boolean;

/**
 * Screen 10 — mountain discovery.
 *
 * Two ways in: the curated ICEFALL objectives, which carry real route
 * descriptions, and every named peak in OpenStreetMap, which get a derived
 * assessment instead. Search spans both.
 */
export default function Mountains() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Peak[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [bands, setBands] = useState<ReadonlySet<number>>(() => new Set<number>());

  const toggleBand = useCallback((band: number) => {
    setBands((prev) => {
      const next = new Set(prev);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  }, []);

  // No selection means no filter — an empty set is "everything", not "nothing".
  const matchesBand = useCallback<BandFilter>(
    (elevationM, lat, lon) => bands.size === 0 || bands.has(assessPeak(elevationM, lat, lon).band),
    [bands],
  );

  const curated = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const found = needle
      ? sync.mountains.filter((m) =>
          [m.name, m.country, m.range, m.difficultyLabel].join(" ").toLowerCase().includes(needle),
        )
      : sync.mountains;
    return found.filter((m) => matchesBand(m.elevationM, m.coords.lat, m.coords.lon));
  }, [q, matchesBand]);

  // Searching reaches into the full catalogue, not just the ten.
  useEffect(() => {
    let cancelled = false;
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    searchCatalogueByName(q).then((r) => {
      if (cancelled) return;
      rememberPeaks(r);
      setResults(r.filter((p) => !p.curatedId));
    });
    return () => {
      cancelled = true;
    };
  }, [q]);

  const shownResults = useMemo(
    () => results.filter((p) => matchesBand(p.elevationM, p.lat, p.lon)),
    [results, matchesBand],
  );

  return (
    <Screen>
      <div className="flex items-center gap-2.5 pt-5">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            strokeWidth={1.6}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist-dim"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search any mountain by name…"
            aria-label="Search mountains"
            className="h-11 w-full rounded-full border border-hairline bg-elevated pl-11 pr-4 text-[13px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
          />
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen((o) => !o)}
          aria-expanded={filterOpen}
          aria-label="Filter by assessment band"
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-tile border bg-elevated text-azure transition-colors",
            filterOpen || bands.size > 0
              ? "border-azure/60 bg-azure/[0.08]"
              : "border-hairline hover:border-azure/40",
          )}
        >
          <Filter size={16} strokeWidth={1.7} />
        </button>
      </div>

      {filterOpen && <BandChips selected={bands} onToggle={toggleBand} />}

      {q.trim().length >= 2 ? (
        <Stagger className="mt-5 space-y-3">
          {curated.map((m) => (
            <Rise key={m.id}>
              <MountainCard mountain={m} />
            </Rise>
          ))}
          {shownResults.length > 0 && (
            <Rise className="pt-2">
              <span className="section-label">Also on the map</span>
            </Rise>
          )}
          {shownResults.map((p) => (
            <Rise key={p.id}>
              <PeakRow peak={p} />
            </Rise>
          ))}
          {curated.length === 0 && shownResults.length === 0 && (
            <p className="py-12 text-center text-[13px] text-mist-dim">Nothing matches “{q}”.</p>
          )}
        </Stagger>
      ) : (
        /* NEAR ME REMOVED at the owner's request. It was one half of an
           OBJECTIVES / NEAR ME pair, and a tab row with a single tab in it is
           chrome that decides nothing — so the row went with it and the list
           renders directly. Peak search above is untouched and still reaches
           every peak in the catalogue. */
        <ObjectivesList matchesBand={matchesBand} filtered={bands.size > 0} />
      )}
    </Screen>
  );
}

function BandChips({
  selected,
  onToggle,
}: {
  selected: ReadonlySet<number>;
  onToggle: (band: number) => void;
}) {
  return (
    <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-0.5">
      {ASSESSMENT_BANDS.map((b) => {
        const on = selected.has(b.band);
        return (
          <button
            key={b.band}
            type="button"
            onClick={() => onToggle(b.band)}
            aria-pressed={on}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition-colors",
              on
                ? "border-azure/70 bg-azure/[0.12] text-azure"
                : "border-hairline bg-elevated/60 text-mist hover:text-snow",
            )}
          >
            {b.shortLabel}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Objectives — the athlete's own shortlist                                    */
/* -------------------------------------------------------------------------- */

function ObjectivesList({
  matchesBand,
  filtered,
}: {
  matchesBand: BandFilter;
  filtered: boolean;
}) {
  const { objectives } = useApp();
  const goals = useGoalsWithProgress();
  const [editing, setEditing] = useState(false);

  // Summited objectives sink to the bottom; the rest stay newest-first.
  const ordered = useMemo(
    () =>
      [...objectives].sort((a, b) => {
        if (!!a.summitedAt !== !!b.summitedAt) return a.summitedAt ? 1 : -1;
        return b.addedAt.localeCompare(a.addedAt);
      }),
    [objectives],
  );

  const shown = useMemo(
    () => ordered.filter((o) => matchesBand(o.elevationM, o.lat, o.lon)),
    [ordered, matchesBand],
  );

  const climbed = shown.filter((o) => o.summitedAt).length;

  /**
   * "Current objective" is not a flag anyone sets — it is the soonest active
   * goal, the same one the dashboard leads with. An objective the athlete is
   * not training for gets no pill.
   */
  const currentId = useMemo(() => {
    const g = goals
      .filter((x) => x.status === "active" && x.mountainId)
      .sort((a, b) => +new Date(a.targetDate) - +new Date(b.targetDate))[0];
    return g?.mountainId ? `curated:${g.mountainId}` : undefined;
  }, [goals]);

  /**
   * Preparation, or nothing at all.
   *
   * The percentage is derived from completed training against a real goal. An
   * objective with no goal behind it has no preparation figure — and an empty
   * track with an invented number under it would be a lie about how ready the
   * athlete is for a mountain that can kill them. So: no goal, no bar.
   */
  const progressFor = useCallback(
    (o: SavedObjective): number | null => {
      const goal = goals.find((g) =>
        o.curatedId ? g.mountainId === o.curatedId : g.name.toLowerCase() === o.name.toLowerCase(),
      );
      return goal ? goal.preparation : null;
    },
    [goals],
  );

  if (objectives.length === 0) {
    return (
      <div className="mt-5">
        <Card>
          <p className="text-[14px] text-snow">No objectives yet</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
            Search for one by name above and add it. They'll collect here.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="section-label">
          {shown.length} objective{shown.length === 1 ? "" : "s"}
          {filtered && ` of ${objectives.length}`}
          {climbed > 0 && ` · ${climbed} climbed`}
        </span>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="flex shrink-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-azure transition-colors hover:text-azure-bright"
        >
          {editing ? "Done" : "Edit"}
          {!editing && <Pencil size={11} strokeWidth={1.8} />}
        </button>
      </div>

      <Stagger className="mt-3 space-y-3">
        {shown.map((o) => (
          <Rise key={o.id}>
            <ObjectiveCard
              objective={o}
              editing={editing}
              current={o.id === currentId}
              progress={progressFor(o)}
            />
          </Rise>
        ))}
        {shown.length === 0 && (
          <p className="py-12 text-center text-[13px] text-mist-dim">
            No objectives in the selected bands.
          </p>
        )}
      </Stagger>
    </>
  );
}

function ObjectiveCard({
  objective: o,
  editing,
  current,
  progress,
}: {
  objective: SavedObjective;
  editing: boolean;
  current: boolean;
  /** Real preparation against a real goal, or null when there is no goal. */
  progress: number | null;
}) {
  const { removeObjective, toggleSummited } = useApp();
  const a = assessPeak(o.elevationM, o.lat, o.lon);
  const image = useMountainImage({
    name: o.name,
    elevationM: o.elevationM,
    lat: o.lat,
    lon: o.lon,
    curatedId: o.curatedId,
    wikipedia: o.wikipedia,
    photo: o.photo,
  });
  const done = Boolean(o.summitedAt);
  const to = o.curatedId
    ? `/explore/mountain/${o.curatedId}`
    : `/explore/peak/${encodeURIComponent(o.id)}`;
  const pct = progress == null ? null : Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className={cn("relative", done && "opacity-85")}>
      <Link to={to} className="block">
        <div className="grain relative h-[150px] overflow-hidden rounded-card border border-hairline bg-slate transition-colors hover:border-hairline-strong">
          <img
            src={image.src}
            alt={image.real ? o.name : ""}
            aria-hidden={image.real ? undefined : true}
            loading="lazy"
            /* A verified photograph of this peak runs at full strength; stand-in
               terrain is held back so it reads as texture, never as documentary. */
            className={cn(
              "absolute inset-0 h-full w-full object-cover",
              image.real ? "opacity-100" : "opacity-45",
            )}
          />
          <div aria-hidden className="absolute inset-0 scrim-bottom" />

          {!image.real && (
            // The picture is not of this summit, and the card has to say so.
            <span
              title={image.caption ?? REPRESENTATIVE_CAPTION}
              className="absolute left-3.5 top-3.5 flex items-center gap-1.5 rounded-full border border-hairline-strong bg-obsidian/70 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.14em] text-mist backdrop-blur"
            >
              <MountainIcon size={9} strokeWidth={1.8} />
              Not this peak
            </span>
          )}

          <div className={cn("absolute inset-x-0 bottom-0 px-4", pct == null ? "pb-4" : "pb-6")}>
            {(current || done) && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {current && (
                  <span className="rounded-full border border-azure/45 bg-obsidian/55 px-2.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.16em] text-azure backdrop-blur">
                    Current objective
                  </span>
                )}
                {done && (
                  <Badge tone="summit">
                    Climbed {fmtDate(o.summitedAt!, { year: undefined })}
                  </Badge>
                )}
              </div>
            )}
            <h3 className="truncate pr-14 text-[22px] font-light leading-tight tracking-[-0.015em] text-snow">
              {o.name}
            </h3>
            <p className="tnum mt-1 truncate pr-14 text-[13px] text-mist">
              {fmtElevation(o.elevationM)} m · {a.label}
            </p>
          </div>

          {/* Absent by design when no goal stands behind this objective. */}
          {pct != null && (
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 px-4 pb-2.5">
              <span className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-snow/[0.14]">
                <span className="block h-full rounded-full bg-azure" style={{ width: `${pct}%` }} />
              </span>
              <span className="tnum shrink-0 text-[11px] text-azure">{pct}%</span>
            </div>
          )}
        </div>
      </Link>

      {/* Actions sit above the link so tapping them doesn't navigate. */}
      <div className="absolute right-3 top-3 flex items-center gap-2">
        {editing && (
          <button
            type="button"
            onClick={() => removeObjective(o.id)}
            aria-label={`Remove ${o.name}`}
            className="grid h-9 w-9 place-items-center rounded-full border border-danger/45 bg-obsidian/60 text-danger backdrop-blur transition-colors hover:bg-danger/15"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
        <button
          type="button"
          onClick={() => toggleSummited(o.id)}
          aria-pressed={done}
          aria-label={done ? `Mark ${o.name} not climbed` : `Mark ${o.name} climbed`}
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full border backdrop-blur transition-colors",
            done
              ? "border-summit bg-summit text-obsidian"
              : "border-azure/70 bg-obsidian/55 text-azure hover:bg-azure/15",
          )}
        >
          <Check size={15} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

/** One peak in a list, with its derived grade and a one-tap add. */
function PeakRow({ peak }: { peak: Peak }) {
  const { addObjective, removeObjective, hasObjective } = useApp();
  const a = assessPeak(peak.elevationM, peak.lat, peak.lon);
  const id = peak.curatedId ? `curated:${peak.curatedId}` : peak.id;
  const saved = hasObjective(id);
  const to = peak.curatedId
    ? `/explore/mountain/${peak.curatedId}`
    : `/explore/peak/${encodeURIComponent(peak.id)}`;

  return (
    <div className="relative">
      <Link to={to} className="block">
        <Card className="transition-colors hover:border-hairline-strong">
          <div className="flex items-center gap-3.5 pr-11">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-tile border border-hairline bg-white/[0.02] text-mist">
              <MountainIcon size={16} strokeWidth={1.4} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[14px] text-snow">{peak.name}</p>
                {peak.curatedId && <Badge tone="azure">ICEFALL</Badge>}
              </div>
              <p className="tnum mt-0.5 text-[11px] text-mist-dim">
                {fmtElevation(peak.elevationM)} m
                {peak.distanceM != null && ` · ${(peak.distanceM / 1000).toFixed(1)} km away`}
                {` · ${a.label}`}
              </p>
            </div>
            <DifficultyDots level={a.difficulty} className="shrink-0" />
          </div>
        </Card>
      </Link>

      <button
        type="button"
        onClick={() =>
          saved
            ? removeObjective(id)
            : addObjective({
                id,
                name: peak.name,
                elevationM: peak.elevationM,
                lat: peak.lat,
                lon: peak.lon,
                curatedId: peak.curatedId,
              })
        }
        aria-pressed={saved}
        aria-label={
          saved ? `Remove ${peak.name} from objectives` : `Add ${peak.name} to objectives`
        }
        className={cn(
          "absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border transition-colors",
          saved
            ? "border-azure bg-azure text-obsidian"
            : "border-hairline-strong text-mist hover:border-azure/60 hover:text-azure",
        )}
      >
        {saved ? <Check size={14} strokeWidth={2.5} /> : <Plus size={15} strokeWidth={2} />}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Curated mountain detail                                                     */
/* -------------------------------------------------------------------------- */

export function MountainDetail() {
  const { id } = useParams<{ id: string }>();
  const goals = useGoalsWithProgress();
  const mountain = id ? sync.mountainById(id) : undefined;

  if (!mountain) return <Navigate to="/explore/mountains" replace />;

  // If this mountain is what the athlete is training for, the page shows the
  // preparation ring and gaps rather than a generic "set as goal" prompt.
  const goal = goals.find((g) => g.status === "active" && g.mountainId === mountain.id);

  return (
    <MountainPage
      data={{
        name: mountain.name,
        elevationM: mountain.elevationM,
        lat: mountain.coords.lat,
        lon: mountain.coords.lon,
        country: mountain.country,
        region: mountain.range,
        curatedId: mountain.id,
        photo: mountain.photo,
        curated: mountain,
        goal,
        objectiveId: `curated:${mountain.id}`,
        backTo: "/explore/mountains",
      }}
    />
  );
}

