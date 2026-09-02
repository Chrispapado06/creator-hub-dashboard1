import { Loader2, Mountain as MountainIcon, Plus, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { ProgressRing } from "@/components/ui/charts";
import { Rise, Screen, ScreenHeader, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { GearCard, GoalCard } from "@/components/domain/cards";
import { fmtCountdown, fmtDate, fmtElevation } from "@/lib/format";
import { sync } from "@/services/repository";
import { useApp } from "@/state/AppState";
import type { Goal } from "@/types";
import { useGoalsWithProgress, useTraining } from "@/tracking/training";
import { monthsAhead } from "@/data/mock/clock";
import { cn } from "@/lib/utils";
import { assessPeak } from "@/services/peakAssessment";
import { MountainThumb } from "@/components/domain/MountainImage";
import { MountainPage } from "@/components/domain/MountainPage";
import { searchPeaks, type Peak } from "@/services/peaks";

const HORIZONS = [
  { label: "6 months", months: 6 },
  { label: "1 year", months: 12 },
  { label: "2 years", months: 24 },
];

const TABS = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
] as const;

/** Screen 06 — objectives. */
export default function Goals() {
  const { addGoal } = useApp();
  const goals = useGoalsWithProgress();
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [creating, setCreating] = useState(false);

  // The form searches the mountain library rather than taking free text. Typing
  // "Annapurna" used to create a goal with no elevation, no coordinates and no
  // image — nothing downstream could work with it.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Peak[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Peak | null>(null);

  // Ranked by elevation, tallest first — the biggest objective should lead.
  // Goals with no elevation recorded sort to the bottom.
  const list = useMemo(
    () =>
      goals
        .filter((g) => g.status === tab)
        .sort((a, b) => (b.elevationM ?? -1) - (a.elevationM ?? -1)),
    [goals, tab],
  );

  useEffect(() => {
    const q = query.trim();
    if (picked || q.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    // Debounced: the geocoder allows one request a second.
    const t = setTimeout(() => {
      searchPeaks(q, ctrl.signal)
        .then((r) => setResults(r.slice(0, 8)))
        .finally(() => setSearching(false));
    }, 550);
    return () => {
      clearTimeout(t);
      ctrl.abort();
      setSearching(false);
    };
  }, [query, picked]);

  function reset() {
    setQuery("");
    setResults([]);
    setPicked(null);
    setCreating(false);
  }

  function createFromPeak(peak: Peak, months: number) {
    const curated = peak.curatedId ? sync.mountainById(peak.curatedId) : undefined;
    addGoal({
      name: peak.name,
      subtitle: curated?.difficultyLabel ?? assessPeak(peak.elevationM, peak.lat, peak.lon).label,
      elevationM: peak.elevationM,
      mountainId: peak.curatedId,
      wikipedia: peak.wikipedia,
      lat: peak.lat,
      lon: peak.lon,
      country: peak.country,
      targetDate: monthsAhead(months),
      trainingStartedAt: new Date().toISOString(),
      photo: curated?.photo,
      gaps: [
        "Training plan just created — complete sessions to build preparation",
        "Baseline fitness assessment outstanding",
      ],
    });
    reset();
  }

  /** For objectives that aren't a mountain at all. */
  function createCustom(months: number) {
    addGoal({
      name: query.trim(),
      subtitle: "Custom objective",
      targetDate: monthsAhead(months),
      trainingStartedAt: new Date().toISOString(),
    });
    reset();
  }

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="My Goals"
          action={
            <Button
              size="icon"
              variant="secondary"
              aria-label={creating ? "Cancel" : "Create a goal"}
              onClick={() => (creating ? reset() : setCreating(true))}
            >
              {creating ? <X size={17} strokeWidth={1.8} /> : <Plus size={18} strokeWidth={1.8} />}
            </Button>
          }
        />

        <AnimatePresence>
          {creating && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <Card className="mb-5">
                <SectionLabel>New objective</SectionLabel>

                {picked ? (
                  <>
                    <div className="mt-3 flex items-center gap-3 rounded-tile border border-azure/40 bg-azure/[0.06] p-3">
                      <MountainThumb peak={picked} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] text-snow">{picked.name}</p>
                        <p className="tnum text-[11px] text-mist-dim">
                          {fmtElevation(picked.elevationM)} m ·{" "}
                          {assessPeak(picked.elevationM, picked.lat, picked.lon).label}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPicked(null)}
                        aria-label="Choose a different mountain"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-mist hover:text-snow"
                      >
                        <X size={14} strokeWidth={2} />
                      </button>
                    </div>
                    <p className="mt-3.5 text-[11px] leading-relaxed text-mist">
                      When do you want to climb it? The training plan is built backwards from that
                      date.
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {HORIZONS.map((h) => (
                        <button
                          key={h.months}
                          type="button"
                          onClick={() => createFromPeak(picked, h.months)}
                          className="rounded-tile border border-hairline px-2 py-2.5 text-[12px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
                        >
                          {h.label}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="relative mt-3">
                      <Search
                        size={15}
                        strokeWidth={1.6}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
                      />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search any mountain — Ama Dablam, Eiger…"
                        autoFocus
                        className="h-11 w-full rounded-tile border border-hairline bg-elevated/40 pl-9 pr-9 text-[14px] text-snow outline-none placeholder:text-mist-dim focus:border-azure/50"
                      />
                      {searching && (
                        <Loader2
                          size={14}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-mist-dim"
                        />
                      )}
                    </div>

                    {results.length > 0 && (
                      <div className="mt-2.5 overflow-hidden rounded-tile border border-hairline">
                        {results.map((p, i) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPicked(p)}
                            className={cn(
                              "flex w-full items-center gap-3 bg-graphite px-3.5 py-3 text-left transition-colors hover:bg-white/[0.04]",
                              i !== 0 && "border-t border-hairline",
                            )}
                          >
                            <MountainThumb peak={p} size={38} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] text-snow">{p.name}</span>
                              <span className="tnum block text-[11px] text-mist-dim">
                                {fmtElevation(p.elevationM)} m{p.country ? ` · ${p.country}` : ""}
                              </span>
                            </span>
                            {p.curatedId && <Badge tone="azure">ICEFALL</Badge>}
                          </button>
                        ))}
                      </div>
                    )}

                    {query.trim().length >= 2 && !searching && results.length === 0 && (
                      <div className="mt-3">
                        <p className="text-[12px] leading-relaxed text-mist">
                          No mountain found for “{query.trim()}”. You can still set it as a custom
                          objective — it just won't carry an elevation or a grade.
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {HORIZONS.map((h) => (
                            <button
                              key={h.months}
                              type="button"
                              onClick={() => createCustom(h.months)}
                              className="rounded-tile border border-hairline px-2 py-2.5 text-[12px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
                            >
                              {h.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />

        <Stagger className="mt-5 space-y-3">
          {list.map((g) => (
            <Rise key={g.id}>
              <GoalCard goal={g} />
            </Rise>
          ))}
          {list.length === 0 && (
            <p className="py-12 text-center text-[13px] text-mist-dim">
              {tab === "active"
                ? "No active objectives yet."
                : "Nothing completed yet — it starts with one."}
            </p>
          )}
        </Stagger>
      </div>
    </Screen>
  );
}

/**
 * A peak's image in a list row. Curated mountains show their own photograph;
 * everything else shows terrain for its altitude band, dimmed so it reads as a
 * category cue rather than a picture of that summit.
 */

/** Goal detail — the honest gap list is the point of this screen. */
export function GoalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { removeGoal, canRemoveGoal } = useApp();
  const goals = useGoalsWithProgress();
  const goal = goals.find((g) => g.id === id);

  if (!goal) return <Navigate to="/goals" replace />;

  const curated = goal.mountainId ? sync.mountainById(goal.mountainId) : undefined;

  // A custom objective with no elevation isn't a mountain — there's nothing to
  // brief on, so it keeps the plain card layout.
  if (goal.elevationM === undefined) {
    return (
      <Screen padded={false}>
        <div className="px-5">
          <ScreenHeader title={goal.name} subtitle={goal.subtitle} back="/goals" />
        </div>
        <Stagger className="px-5">
          <Rise>
            <Card>
              <div className="flex items-center gap-5">
                <ProgressRing value={goal.preparation} size={78} stroke={3} />
                <div className="min-w-0">
                  <p className="section-label">Preparation</p>
                  <p className="mt-1.5 text-[15px] text-snow">
                    {goal.status === "completed" ? "Completed" : fmtCountdown(goal.targetDate)}
                  </p>
                  <p className="tnum mt-1 text-[12px] text-mist-dim">
                    Target {fmtDate(goal.targetDate)}
                  </p>
                </div>
              </div>
            </Card>
          </Rise>
          <RemoveGoal goal={goal} />
        </Stagger>
      </Screen>
    );
  }

  return (
    <MountainPage
      data={{
        name: goal.name,
        elevationM: goal.elevationM,
        lat: goal.lat ?? curated?.coords.lat,
        lon: goal.lon ?? curated?.coords.lon,
        country: goal.country ?? curated?.country,
        region: curated?.range,
        wikipedia: goal.wikipedia,
        curatedId: goal.mountainId,
        photo: goal.photo ?? curated?.photo,
        photoCredit: curated?.photoCredit,
        curated,
        goal,
        objectiveId: goal.mountainId ? `curated:${goal.mountainId}` : undefined,
        backTo: "/goals",
        preparationFooter: canRemoveGoal(goal.id) ? (
          <>
            <Button
              variant="danger"
              className="w-full"
              onClick={() => {
                removeGoal(goal.id);
                navigate("/goals", { replace: true });
              }}
            >
              Remove this goal
            </Button>
            <p className="mt-3 text-center text-[11px] text-mist-dim">
              The training plan built around it goes too.
            </p>
          </>
        ) : undefined,
      }}
    />
  );
}

/** Shared by the custom-objective layout, which has no mountain page to sit on. */
function RemoveGoal({ goal }: { goal: Goal }) {
  const navigate = useNavigate();
  const { removeGoal, canRemoveGoal } = useApp();
  if (!canRemoveGoal(goal.id)) return null;
  return (
    <Rise className="pt-8">
      <Button
        variant="danger"
        className="w-full"
        onClick={() => {
          removeGoal(goal.id);
          navigate("/goals", { replace: true });
        }}
      >
        Remove this goal
      </Button>
      <p className="mt-3 text-center text-[11px] text-mist-dim">
        The training plan built around it goes too.
      </p>
    </Rise>
  );
}
