import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronRight, Flag, Plus, X } from "lucide-react";
import { Badge, Button, Card, SectionLabel } from "@/components/ui/primitives";
import { ProgressRing } from "@/components/ui/charts";
import { cn } from "@/lib/utils";
import { fmtCountdown, fmtDate } from "@/lib/format";
import { monthsAhead } from "@/data/mock/clock";
import { useApp } from "@/state/AppState";
import { useGoalsWithProgress } from "@/tracking/training";
import { REFERENCE_NO_READINESS } from "@/services/peakTier";

/**
 * The two things you can do with a mountain, in one place.
 *
 *   Objective — a shortlist entry. Cheap, reversible, many at a time.
 *   Goal      — the objective you are actually training for. It generates a
 *               plan, drives preparation, and gives the Coach its context.
 *
 * These were previously unreachable from a mountain page: you could only create
 * a goal by typing a name on the Goals screen, which meant the mountain you were
 * looking at could never become the thing you trained for.
 */

export interface MountainRef {
  /** `curated:<id>` for the ten, or the OSM peak id. */
  id: string;
  name: string;
  elevationM: number;
  lat: number;
  lon: number;
  curatedId?: string;
  photo?: string;
  subtitle?: string;
  /** OSM `wikipedia` tag — resolves the peak's photograph. */
  wikipedia?: string;
  /** OSM `wikidata` tag — the exact entity, resolving facts and photograph. */
  wikidata?: string;
  country?: string;
}

const HORIZONS = [
  { label: "6 months", months: 6 },
  { label: "1 year", months: 12 },
  { label: "2 years", months: 24 },
];

export function ObjectiveActions({ mountain }: { mountain: MountainRef }) {
  const { objectives, addObjective, removeObjective, toggleSummited, hasObjective, addGoal } =
    useApp();
  const goals = useGoalsWithProgress();
  const [choosing, setChoosing] = useState(false);

  const saved = hasObjective(mountain.id);
  const entry = objectives.find((o) => o.id === mountain.id);
  const climbed = Boolean(entry?.summitedAt);

  // A mountain is "your goal" if an active goal points at it.
  const goal = goals.find(
    (g) =>
      g.status === "active" &&
      ((mountain.curatedId && g.mountainId === mountain.curatedId) ||
        g.name.toLowerCase() === mountain.name.toLowerCase()),
  );

  function setGoal(months: number) {
    addGoal({
      name: mountain.name,
      subtitle: mountain.subtitle ?? "Objective",
      elevationM: mountain.elevationM,
      mountainId: mountain.curatedId,
      wikipedia: mountain.wikipedia,
      wikidata: mountain.wikidata,
      lat: mountain.lat,
      lon: mountain.lon,
      country: mountain.country,
      targetDate: monthsAhead(months),
      trainingStartedAt: new Date().toISOString(),
      photo: mountain.photo,
      gaps: [
        "Training plan just created — complete sessions to build preparation",
        "Baseline fitness assessment outstanding",
      ],
    });
    // Keeping the goal on the shortlist too means it stays visible in Explore.
    if (!saved) {
      addObjective({
        id: mountain.id,
        name: mountain.name,
        elevationM: mountain.elevationM,
        lat: mountain.lat,
        lon: mountain.lon,
        curatedId: mountain.curatedId,
        photo: mountain.photo,
        wikipedia: mountain.wikipedia,
        wikidata: mountain.wikidata,
      });
    }
    setChoosing(false);
  }

  return (
    <Card>
      <SectionLabel>Your plans</SectionLabel>

      {/* ---- Goal ---------------------------------------------------- */}
      {goal ? (
        <>
          <Link
            to={`/goals/${goal.id}`}
            className="mt-3 flex items-center gap-4 rounded-tile border border-azure/30 bg-azure/[0.06] p-3.5"
          >
            {/*
              * THE READINESS RING IS FOR SURVEYED MOUNTAINS ONLY.
              *
              * Readiness is the smaller of two ratios and one of them needs a
              * route's vertical gain. For a peak ICEFALL has not surveyed there
              * is no route, so `tracking/training.ts:289` substitutes
              * `goal.elevationM * 0.45` — a coefficient with no source. The
              * percentage is therefore measured against a number the app made
              * up, and drawing it as a confident ring is the exact failure the
              * peak page was rebuilt to stop. The countdown and the target date
              * stay: the athlete set those, so they are real.
              */}
            {mountain.curatedId && (
              <ProgressRing value={goal.preparation} size={46} stroke={2.5} />
            )}
            <div className="min-w-0 flex-1">
              <p className="section-label text-azure/80">Your goal</p>
              <p className="mt-1 truncate text-[13px] text-snow">{fmtCountdown(goal.targetDate)}</p>
              <p className="tnum text-[11px] text-mist-dim">Target {fmtDate(goal.targetDate)}</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-mist-dim" />
          </Link>
          {!mountain.curatedId && (
            <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
              {REFERENCE_NO_READINESS}
            </p>
          )}
        </>
      ) : (
        <div className="mt-3">
          <Button className="w-full" onClick={() => setChoosing((c) => !c)}>
            <Flag size={15} strokeWidth={1.9} />
            Set as my goal
          </Button>

          <AnimatePresence>
            {choosing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <p className="pt-3.5 text-[11px] leading-relaxed text-mist">
                  When do you want to climb it? ICEFALL builds the training plan backwards from that
                  date.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {HORIZONS.map((h) => (
                    <button
                      key={h.months}
                      type="button"
                      onClick={() => setGoal(h.months)}
                      className="rounded-tile border border-hairline px-2 py-2.5 text-[12px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ---- Objective (shortlist) ------------------------------------ */}
      <div className="mt-4 border-t border-hairline pt-4">
        {saved ? (
          <div className="flex items-center gap-2.5">
            <Badge tone={climbed ? "summit" : "azure"} size="md">
              {climbed
                ? `Climbed ${fmtDate(entry!.summitedAt!, { year: undefined })}`
                : "In your objectives"}
            </Badge>
            <div className="flex-1" />
            <Button
              size="sm"
              variant={climbed ? "primary" : "secondary"}
              onClick={() => toggleSummited(mountain.id)}
            >
              <Check size={14} strokeWidth={2.2} />
              {climbed ? "Climbed" : "Mark climbed"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label="Remove from objectives"
              onClick={() => removeObjective(mountain.id)}
              className={cn("px-2.5")}
            >
              <X size={15} strokeWidth={2} />
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() =>
              addObjective({
                id: mountain.id,
                name: mountain.name,
                elevationM: mountain.elevationM,
                lat: mountain.lat,
                lon: mountain.lon,
                curatedId: mountain.curatedId,
                photo: mountain.photo,
                wikipedia: mountain.wikipedia,
                wikidata: mountain.wikidata,
              })
            }
          >
            <Plus size={15} strokeWidth={2} />
            Add to my objectives
          </Button>
        )}
      </div>
    </Card>
  );
}
