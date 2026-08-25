import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ChevronRight,
  Minus,
  Mountain as MountainIcon,
  Plus,
  SlidersHorizontal,
  Users,
  X,
  Search,
  Loader2,
} from "lucide-react";
import { Button, Card, Disclaimer } from "@/components/ui/primitives";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { MountainBackdrop, MountainThumb } from "@/components/domain/MountainImage";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { EXPERIENCE_LABELS, experienceFromAppLevel, type ExperienceLevel } from "@/network/types";
import { ACCESS_DISCLAIMER } from "@/services/expeditionAccess";
import { rankGuides, type RankedGuide } from "@/guides/matching";
import {
  NO_GUIDES_NOTICE,
  SHOW_DEMO_GUIDES,
  SPECIALITY_LABELS,
  allGuides,
  type Speciality,
} from "@/guides/types";
import { DemoGuidesNotice, GuideRow, GuideVsCompany, SpecialityGrid } from "./shared";
import {
  EXPERIENCE_IDS,
  MAX_GROUP_SIZE,
  activeFilterCount,
  allCountries,
  allLanguages,
  allMountains,
  allSpecialities,
  criteriaFrom,
  defaultGuideFilters,
  guideBounds,
  matchesGuideFilters,
  type Bound,
  type GuideFilters,
} from "./filters";
import { useGuideModeration } from "./guideModeration";
import { useSearchObjective, type SearchObjective } from "./useSearchObjective";
import { searchPeaks, type Peak } from "@/services/peaks";
import { fmtElevation } from "@/lib/format";

/**
 * The guide marketplace — professionals found through the mountain.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT
 *
 * The search, the filters, the matching, the ordering and every empty state are
 * working code against local state. The people are not: `@/guides/types` holds
 * an EMPTY real catalogue and a set of invented demo guides that a production
 * build drops entirely, so a shipped version of this screen shows the honest
 * empty state and points at the registers that are real. Everything a demo
 * guide asserts — licence, ascents, rating, rate, availability — is invented,
 * badged DEMO, and explained before the list starts.
 *
 * THE RULES THIS SCREEN ENFORCES
 *
 *   · The number is compatibility between a request and a listing, captioned
 *     "ICEFALL compatibility" and never a safety judgement. ICEFALL checks no
 *     licence, and the caption travels with every score.
 *   · Nothing renders as verified — credentials are CLAIMED, because nothing in
 *     this build can check one.
 *   · Order is organic and stated: relevance to the objective, recorded ascents,
 *     availability and depth, exactly what `guideMatch` weighs. `featured` is
 *     labelled and takes no part in the ranking.
 *   · No private contact detail exists in the model, so none can leak onto a
 *     card. A guide is reached through the request flow.
 *
 * WHY THE CONTROLS SIT WHERE THEY DO
 *
 * Mountain, dates and party size are the three things a guide actually needs to
 * know, so they are on the screen rather than behind the filter sheet — and all
 * three are DESCRIBING rather than narrowing (see the head of `./filters`).
 * Only the sheet holds controls that remove people from the list, and every one
 * of those is echoed back as a removable chip underneath it, because a filter
 * that excludes people invisibly is indistinguishable from a marketplace with
 * nobody in it.
 */

const ORDERING_NOTE =
  "Ordered on relevance to your objective: recorded ascents of the mountain, whether the guide is taking work, the ground they list and the depth behind it. No position in this list is for sale. A promoted slot, if one is ever sold, is labelled FEATURED and stays out of the ranking — a paid position says nothing about a qualification.";

const NO_OBJECTIVE_NOTE =
  "Guides are matched through the mountain, so without one the comparison has little to work with and the order means little. You can still browse.";

const DATES_NOTE =
  "Carried into the comparison, and they exclude nobody: ICEFALL holds no diary for any guide, so a date range cannot be checked against one. Availability is a standing status the guide set.";

const GROUP_NOTE =
  "Carried into the comparison, and it excludes nobody. ICEFALL holds no client ratio for any guide, so your party is compared against ICEFALL's own guidance for ground of that height — agree the real ratio with the guide in writing.";

const RATE_NOTE =
  "The guide's fee for their time. Permits, huts, lifts and their expenses are on top of it, so neither end of this range is the cost of the trip.";

const YEARS_NOTE =
  "Years the guide records for themselves. ICEFALL has checked none of them, and on a demo guide the figure is invented along with the person.";

/** The photograph behind the heading when the athlete has no objective yet. */
const HERO_FALLBACK = { name: "Mont Blanc", curatedId: "mont-blanc", elevationM: 4806 };

type SheetId = "mountain" | "dates" | "group" | "filters";

export default function Guides() {
  const { user } = useApp();
  const { isBlocked, blockedIds } = useGuideModeration();

  // `?peak=` wins over the athlete's own goal — see `useSearchObjective`.
  const objective = useSearchObjective();
  const athleteExperience = experienceFromAppLevel(user.experience);

  const [filters, setFilters] = useState<GuideFilters>(() =>
    defaultGuideFilters(objective ? { peakName: objective.peakName } : undefined),
  );
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);

  // Arriving from a different mountain re-points the mountain filter. Guarded so
  // it cannot fight with the athlete's own choice on every render.
  const objectiveName = objective?.peakName ?? "";
  useEffect(() => {
    setFilters((f) => (f.mountain === objectiveName ? f : { ...f, mountain: objectiveName }));
  }, [objectiveName]);

  const catalogue = useMemo(() => allGuides(), []);
  const visible = useMemo(() => catalogue.filter((g) => !isBlocked(g.id)), [catalogue, isBlocked]);

  const criteria = useMemo(
    () => criteriaFrom(objective, filters, athleteExperience),
    [objective, filters, athleteExperience],
  );

  const results = useMemo(
    () =>
      rankGuides(
        criteria,
        visible.filter((g) => matchesGuideFilters(g, filters)),
      ),
    [criteria, visible, filters],
  );

  /**
   * When the mountain filter empties the list, the guides who work comparable
   * ground are offered separately rather than silently. "Nobody here has been up
   * your mountain" is a real answer; hiding the near misses is not.
   */
  const widened = useMemo(() => {
    if (results.length > 0 || filters.mountain === "") return [];
    return rankGuides(
      criteria,
      visible.filter((g) => matchesGuideFilters(g, { ...filters, mountain: "" })),
    ).slice(0, 4);
  }, [results, filters, criteria, visible]);

  const options = useMemo(
    () => ({
      mountains: allMountains(catalogue),
      countries: allCountries(catalogue),
      languages: allLanguages(catalogue),
      specialities: allSpecialities(catalogue),
      bounds: guideBounds(catalogue),
    }),
    [catalogue],
  );

  const filterCount = activeFilterCount(filters);
  const reset = () =>
    setFilters(defaultGuideFilters(objective ? { peakName: objective.peakName } : undefined));

  const empty = catalogue.length === 0;

  return (
    <Screen padded={false}>
      <GuidesHero objective={objective} />

      <Stagger className="px-5">
        {empty ? (
          /* The production rendering. No selector and no filter sheet: there is
             nothing to select from, and filter chrome over an empty directory
             would be theatre suggesting guides are being withheld. */
          <Rise className="pt-5">
            <Card>
              <p className="section-label">No guides listed</p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-mist">{NO_GUIDES_NOTICE}</p>
            </Card>
          </Rise>
        ) : (
          <>
            <Rise className="pt-5">
              <SelectorCard filters={filters} onOpen={setSheet} />
              {objective ? (
                <ObjectiveLine objective={objective} />
              ) : (
                <NoObjectiveNote className="mt-3.5" />
              )}
            </Rise>

            <Rise className="pt-3.5">
              <button
                type="button"
                onClick={() => setSheet("filters")}
                className={cn(
                  "flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-tile border text-[13px] transition-colors",
                  filterCount > 0
                    ? "border-azure/45 text-snow"
                    : "border-hairline-strong text-snow hover:border-azure/50",
                )}
              >
                <SlidersHorizontal size={14} strokeWidth={1.7} aria-hidden="true" />
                Filters
                {filterCount > 0 && (
                  <span className="tnum rounded-full border border-azure/40 bg-azure/10 px-1.5 py-[1px] text-[10px] text-azure">
                    {filterCount}
                  </span>
                )}
              </button>

              {filterCount > 0 && <FilterSummary filters={filters} onChange={setFilters} />}
            </Rise>

            {SHOW_DEMO_GUIDES && (
              <Rise className="pt-5">
                <DemoGuidesNotice />
              </Rise>
            )}

            {/* ---- The list --------------------------------------------------- */}
            <Rise className="pt-6">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="section-label">Best matches for you</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
                    {objective
                      ? "Based on your objective and preferences"
                      : "Based on your preferences alone — no objective is set"}
                  </p>
                </div>
                {filterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilters(defaultGuideFilters())}
                    aria-label="Clear every filter and see the whole directory"
                    className="shrink-0 text-[12px] text-azure transition-colors hover:text-azure-bright"
                  >
                    See all
                  </button>
                )}
              </div>
              <p className="tnum mt-2 text-[11px] text-mist-dim">
                {results.length} of {visible.length} guides
              </p>
            </Rise>

            {results.length > 0 ? (
              results.map((entry) => (
                <Rise key={entry.guide.id} className="pt-3">
                  <GuideRow
                    guide={entry.guide}
                    match={entry.match}
                    to={profileHref(entry, objective)}
                  />
                </Rise>
              ))
            ) : (
              <Rise className="pt-4">
                <NoResults
                  filterCount={filterCount}
                  mountain={filters.mountain}
                  onReset={reset}
                  onClearMountain={() => setFilters((f) => ({ ...f, mountain: "" }))}
                />
              </Rise>
            )}

            {widened.length > 0 && (
              <>
                <Rise className="pt-6">
                  <p className="section-label">Guides working other mountains</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
                    Nobody in the directory lists {filters.mountain}. These are the closest matches
                    on everything else — ask what they know of the route, because the directory
                    cannot say.
                  </p>
                </Rise>
                {widened.map((entry) => (
                  <Rise key={entry.guide.id} className="pt-3">
                    <GuideRow
                      guide={entry.guide}
                      match={entry.match}
                      to={profileHref(entry, objective)}
                    />
                  </Rise>
                ))}
              </>
            )}

            <Rise className="pt-6">
              <Disclaimer>{ORDERING_NOTE}</Disclaimer>
            </Rise>

            {blockedIds.length > 0 && (
              <Rise className="pt-4">
                <p className="tnum text-[11px] leading-relaxed text-mist-dim">
                  {blockedIds.length} blocked guide{blockedIds.length === 1 ? "" : "s"} hidden from
                  this list. Open their profile to unblock.
                </p>
              </Rise>
            )}
          </>
        )}

        {/* ---- Guide or company --------------------------------------------- */}
        <Rise className="pt-6">
          <GuideVsCompany
            action={
              <Button asChild variant="secondary" size="sm">
                <Link to="/explore/expeditions">See expedition operators instead</Link>
              </Button>
            }
          />
        </Rise>

        <Rise className="pt-5">
          <Disclaimer>{ACCESS_DISCLAIMER}</Disclaimer>
        </Rise>
      </Stagger>

      {/* ---- The four sheets ------------------------------------------------ */}
      <MountainSheet
        open={sheet === "mountain"}
        onClose={closeSheet}
        mountains={options.mountains}
        objectiveName={objectiveName}
        value={filters.mountain}
        onChange={(mountain) => setFilters((f) => ({ ...f, mountain }))}
      />
      <DatesSheet
        open={sheet === "dates"}
        onClose={closeSheet}
        filters={filters}
        onChange={setFilters}
      />
      <GroupSheet
        open={sheet === "group"}
        onClose={closeSheet}
        value={filters.groupSize}
        onChange={(groupSize) => setFilters((f) => ({ ...f, groupSize }))}
      />
      <FiltersSheet
        open={sheet === "filters"}
        onClose={closeSheet}
        filters={filters}
        onChange={setFilters}
        options={options}
        athleteExperience={athleteExperience}
        matching={results.length}
        total={visible.length}
        onReset={reset}
      />
    </Screen>
  );
}

/**
 * The link to a profile, carrying the objective.
 *
 * `peak`, `elevation` and `goal` are the parameters the profile and request
 * screens read, so the request form opens on the right mountain. Nothing else
 * is passed, and nothing personal ever is.
 */
function profileHref(entry: RankedGuide, objective: SearchObjective | null): string {
  const q = new URLSearchParams();
  if (objective?.peakName) q.set("peak", objective.peakName);
  if (objective?.elevationM !== undefined) {
    q.set("elevation", String(Math.round(objective.elevationM)));
  }
  if (objective?.goalId) q.set("goal", objective.goalId);
  const query = q.toString();
  return `/explore/guides/${encodeURIComponent(entry.guide.id)}${query ? `?${query}` : ""}`;
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The photograph is of a MOUNTAIN.
 *
 * The athlete's objective when they have one, a curated peak when they do not.
 * Not a guide — the hero is always the mountain.
 *
 * No photograph of a REAL guide appears anywhere in this feature. The demo
 * records carry generated faces of people who do not exist (see
 * `Guide.portrait`); a real face against an invented name and an invented
 * licence would present that person as a working guide they are not.
 */
function GuidesHero({ objective }: { objective: SearchObjective | null }) {
  const peak = objective
    ? {
        name: objective.peakName,
        elevationM: objective.elevationM,
        lat: objective.lat,
        lon: objective.lon,
      }
    : HERO_FALLBACK;

  return (
    <div className="relative h-[244px] w-full overflow-hidden bg-slate">
      <MountainBackdrop peak={peak} scrim="vertical" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        <p className="section-label text-azure/85">Mountain guides</p>
        <h1 className="display mt-2.5 text-[40px] uppercase tracking-[0.04em] text-snow">Guides</h1>
        <p className="mt-2.5 max-w-[290px] text-[13px] leading-relaxed text-mist">
          Find the right guide for your mountain objective.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The three things a guide needs to know                                      */
/* -------------------------------------------------------------------------- */

function datesLabel(filters: GuideFilters): string {
  if (!filters.fromIso && !filters.toIso) return "Any dates";
  const from = filters.fromIso ? fmtDate(filters.fromIso) : "any";
  const to = filters.toIso ? fmtDate(filters.toIso) : "any";
  return `${from} – ${to}`;
}

function groupLabel(size: number | null): string {
  if (size === null) return "Not said";
  return `${size} ${size === 1 ? "climber" : "climbers"}`;
}

function SelectorCard({
  filters,
  onOpen,
}: {
  filters: GuideFilters;
  onOpen: (sheet: SheetId) => void;
}) {
  const rows: { id: SheetId; icon: typeof MountainIcon; label: string; value: string }[] = [
    {
      id: "mountain",
      icon: MountainIcon,
      label: "Mountain",
      value: filters.mountain || "Any mountain",
    },
    { id: "dates", icon: CalendarDays, label: "Dates", value: datesLabel(filters) },
    { id: "group", icon: Users, label: "Group size", value: groupLabel(filters.groupSize) },
  ];

  return (
    <Card inset={false} className="overflow-hidden">
      {rows.map((row, i) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onOpen(row.id)}
          className={cn(
            "flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]",
            i > 0 && "border-t border-hairline",
          )}
        >
          <row.icon
            size={14}
            strokeWidth={1.6}
            aria-hidden="true"
            className="shrink-0 text-mist-dim"
          />
          <span className="section-label w-[76px] shrink-0">{row.label}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-snow">{row.value}</span>
          <ChevronRight
            size={15}
            strokeWidth={1.6}
            aria-hidden="true"
            className="shrink-0 text-mist-dim"
          />
        </button>
      ))}
    </Card>
  );
}

/** What the ranking is being made against, and where it came from. */
function ObjectiveLine({ objective }: { objective: SearchObjective }) {
  return (
    <div className="mt-3.5 flex items-center gap-3">
      <MountainThumb
        peak={{
          name: objective.peakName,
          elevationM: objective.elevationM,
          lat: objective.lat,
          lon: objective.lon,
        }}
        size={38}
      />
      <div className="min-w-0 flex-1">
        <p className="section-label">Matching against</p>
        <p className="mt-1.5 truncate text-[13px] text-snow">{objective.peakName}</p>
        <p className="tnum mt-0.5 text-[11px] text-mist-dim">
          {objective.elevationM !== undefined
            ? `${objective.elevationM.toLocaleString("en-GB")} m`
            : "No height recorded"}
          {objective.targetDate ? ` · ${fmtDate(objective.targetDate)}` : " · no date set"}
          {objective.source === "goal" ? " · your active goal" : ""}
        </p>
      </div>
    </div>
  );
}

function NoObjectiveNote({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <p className="section-label">No objective set</p>
      <p className="mt-2.5 text-[13px] leading-relaxed text-mist">{NO_OBJECTIVE_NOTE}</p>
      <Button asChild variant="secondary" size="sm" className="mt-3.5">
        <Link to="/goals">Set an objective</Link>
      </Button>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty result                                                                */
/* -------------------------------------------------------------------------- */

function NoResults({
  filterCount,
  mountain,
  onReset,
  onClearMountain,
}: {
  filterCount: number;
  mountain: string;
  onReset: () => void;
  onClearMountain: () => void;
}) {
  return (
    <Card>
      <p className="section-label">No guide matches</p>
      <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
        {mountain
          ? `No guide in the directory works ${mountain} under the rest of your filters.`
          : "No guide matches these filters."}{" "}
        That is the directory being honest about what it holds, not a judgement on the mountain.
        Widen the search, or find a guide through the national association for that range.
      </p>
      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {mountain && (
          <Button variant="secondary" size="sm" onClick={onClearMountain}>
            Any mountain
          </Button>
        )}
        {filterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            Reset filters
          </Button>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Sheet shell                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Portalled into the phone frame rather than the document body — the same
 * reasoning as `ConnectSheet`: on a desktop the app sits in a 430 px shell, so
 * a `fixed` overlay would spill across the browser window while an `absolute`
 * one inside the scroller would scroll away from under the reader.
 */
function sheetRoot(): Element | null {
  if (typeof document === "undefined") return null;
  return document.querySelector("[data-phone-shell]") ?? document.body;
}

function Sheet({
  open,
  title,
  onClose,
  action,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const root = sheetRoot();
  if (root === null) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <SheetBody
          key={`sheet-${title}`}
          title={title}
          onClose={onClose}
          action={action}
          footer={footer}
        >
          {children}
        </SheetBody>
      )}
    </AnimatePresence>,
    root,
  );
}

function SheetBody({
  title,
  onClose,
  action,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = useId();

  // Escape closes. A sheet a keyboard cannot dismiss is a trap, and every
  // control inside these ones is reachable by keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-end bg-obsidian/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 48 }}
        animate={{ y: 0 }}
        exit={{ y: 48 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[88%] w-full flex-col overflow-hidden rounded-t-[24px] border-t border-hairline-strong bg-graphite"
      >
        <div className="shrink-0 px-5 pt-4">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
            <p id={titleId} className="section-label">
              {title}
            </p>
            <div className="flex items-center gap-2">
              {action}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:text-snow"
              >
                <X size={16} strokeWidth={1.7} />
              </button>
            </div>
          </div>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <div
            className="shrink-0 border-t border-hairline px-5 pt-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
          >
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/** A labelled block inside a sheet. */
function Block({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="section-label">{label}</p>
      <div className="mt-3">{children}</div>
      {hint && <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{hint}</p>}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-[34px] rounded-full border px-3 py-1.5 text-[11.5px] transition-colors",
        active
          ? "border-azure/55 bg-azure/[0.12] text-azure"
          : "border-hairline text-mist hover:text-snow",
      )}
    >
      {children}
    </button>
  );
}

const controlClass =
  "w-full rounded-tile border border-hairline bg-obsidian px-3 py-2.5 text-[13px] text-snow outline-none focus:border-azure/50";

/* -------------------------------------------------------------------------- */
/* Mountain                                                                    */
/* -------------------------------------------------------------------------- */

function MountainSheet({
  open,
  onClose,
  mountains,
  objectiveName,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  mountains: string[];
  objectiveName: string;
  value: string;
  onChange: (mountain: string) => void;
}) {
  // The objective is offered even when no guide lists it — otherwise the athlete
  // cannot ask the question, and "nobody here guides this peak" is a real answer.
  const listed =
    objectiveName && !mountains.includes(objectiveName) ? [objectiveName, ...mountains] : mountains;

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Peak[]>([]);
  const [searching, setSearching] = useState(false);

  const needle = query.trim().toLowerCase();

  // Narrow the mountains guides actually list as the athlete types.
  const list = needle ? listed.filter((m) => m.toLowerCase().includes(needle)) : listed;

  /**
   * Beyond the listed set, search every named peak in OpenStreetMap.
   *
   * A guide directory that can only be filtered by the mountains its own guides
   * named is circular: the athlete cannot ask about the peak they actually care
   * about, and "no guide here lists Ama Dablam" is a useful answer they would
   * never reach. Elevation and position come from OSM, never typed here.
   */
  useEffect(() => {
    if (needle.length < 2) {
      setFound([]);
      return;
    }
    const ctrl = new AbortController();
    // Aborting is not enough to discard a superseded result. `searchPeaks`
    // merges the BUNDLED catalogue with the network lookup, and the catalogue
    // half resolves from memory whatever the signal says — so an aborted search
    // still settles, and a slow "ama" could land after a fresh "ama dablam" and
    // overwrite it. This flag is what actually decides whose results are shown.
    let live = true;
    setSearching(true);
    const t = setTimeout(() => {
      searchPeaks(query.trim(), ctrl.signal)
        .then((r) => {
          if (live) setFound(r.slice(0, 6));
        })
        .catch(() => {
          if (live) setFound([]);
        })
        .finally(() => {
          if (live) setSearching(false);
        });
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
      ctrl.abort();
      setSearching(false);
    };
  }, [query, needle]);

  const choose = (mountain: string) => {
    onChange(mountain);
    setQuery("");
    onClose();
  };

  // Peaks OSM knows about that no listed guide has named.
  const extra = found.filter((p) => !list.some((m) => m.toLowerCase() === p.name.toLowerCase()));

  return (
    <Sheet open={open} title="Mountain" onClose={onClose}>
      <div className="relative mb-3">
        <Search
          size={15}
          strokeWidth={1.6}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any mountain…"
          autoCapitalize="none"
          spellCheck={false}
          className="h-11 w-full rounded-tile border border-hairline bg-elevated/40 pl-9 pr-9 text-[14px] text-snow outline-none placeholder:text-mist-dim focus:border-azure/50"
        />
        {searching && (
          <Loader2
            size={14}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-mist-dim"
          />
        )}
      </div>

      {extra.length > 0 && (
        <div className="mb-3">
          <p className="section-label">Any peak on earth</p>
          <ul className="mt-1.5">
            {extra.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p.name)}
                  className="flex min-h-[46px] w-full items-center justify-between gap-3 border-b border-hairline text-left last:border-b-0"
                >
                  <span className="min-w-0 truncate text-[13px] text-snow">{p.name}</span>
                  <span className="tnum shrink-0 text-[11px] text-mist-dim">
                    {fmtElevation(p.elevationM)} m{p.country ? ` · ${p.country}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {needle.length >= 2 && list.length === 0 && extra.length === 0 && !searching && (
        <p className="mb-3 text-[12px] leading-relaxed text-mist">
          No guide here lists a mountain matching “{query.trim()}”, and no peak by that name was
          found. That is an answer, not an error — this directory is small.
        </p>
      )}

      <ul className="-my-1">
        {["", ...list].map((mountain) => {
          const on = mountain === value;
          return (
            <li key={mountain || "any"}>
              <button
                type="button"
                onClick={() => choose(mountain)}
                aria-pressed={on}
                className="flex min-h-[46px] w-full items-center justify-between gap-3 border-b border-hairline text-left last:border-b-0"
              >
                <span
                  className={cn("min-w-0 truncate text-[13px]", on ? "text-azure" : "text-snow")}
                >
                  {mountain || "Any mountain"}
                </span>
                {mountain === objectiveName && mountain !== "" && (
                  <span className="section-label shrink-0 text-[9px]">Your objective</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] leading-relaxed text-mist-dim">
        Every mountain any listed guide names, plus your own objective. A guide who lists a mountain
        has not necessarily summited it — the profile separates the two.
      </p>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

function DatesSheet({
  open,
  onClose,
  filters,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  filters: GuideFilters;
  onChange: (next: GuideFilters) => void;
}) {
  return (
    <Sheet
      open={open}
      title="Dates"
      onClose={onClose}
      action={
        (filters.fromIso || filters.toIso) && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, fromIso: "", toIso: "" })}
            className="text-[12px] text-mist transition-colors hover:text-snow"
          >
            Clear
          </button>
        )
      }
      footer={
        <Button variant="secondary" size="lg" className="w-full" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <input
          type="date"
          aria-label="From"
          value={filters.fromIso}
          onChange={(e) => onChange({ ...filters, fromIso: e.target.value })}
          className={controlClass}
        />
        <span className="text-[12px] text-mist-dim">to</span>
        <input
          type="date"
          aria-label="To"
          value={filters.toIso}
          onChange={(e) => onChange({ ...filters, toIso: e.target.value })}
          className={controlClass}
        />
      </div>
      {/* Stated on the surface that sets them, not somewhere further on. */}
      <Disclaimer className="mt-4">{DATES_NOTE}</Disclaimer>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Party size                                                                  */
/* -------------------------------------------------------------------------- */

function GroupSheet({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: number | null;
  onChange: (size: number | null) => void;
}) {
  const size = value ?? 1;

  return (
    <Sheet
      open={open}
      title="Group size"
      onClose={onClose}
      action={
        value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[12px] text-mist transition-colors hover:text-snow"
          >
            Clear
          </button>
        )
      }
      footer={
        <Button variant="secondary" size="lg" className="w-full" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex items-center justify-between gap-4">
        <StepButton
          label="One fewer climber"
          onClick={() => onChange(Math.max(1, size - 1))}
          disabled={value !== null && size <= 1}
          icon={Minus}
        />
        <div className="text-center">
          <p className="tnum text-[32px] font-light leading-none text-snow">
            {value === null ? "—" : size}
          </p>
          <p className="section-label mt-2.5">{value === null ? "Not said" : "Climbers"}</p>
        </div>
        <StepButton
          label="One more climber"
          onClick={() => onChange(Math.min(MAX_GROUP_SIZE, size + (value === null ? 0 : 1)))}
          disabled={value !== null && size >= MAX_GROUP_SIZE}
          icon={Plus}
        />
      </div>

      <Disclaimer className="mt-6">{GROUP_NOTE}</Disclaimer>
    </Sheet>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon: typeof Plus;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline-strong text-snow transition-colors hover:border-azure/50 disabled:opacity-35"
    >
      <Icon size={16} strokeWidth={1.7} />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* The range control                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Two native range inputs stacked, rather than a dependency.
 *
 * `input[type=range]` is keyboard-operable for nothing, so arrows, Home and End
 * work on both handles without a line of key handling — which a div with a
 * pointer listener would have had to reimplement, badly. The inputs are
 * transparent and pass pointer events through except on the thumbs, so the two
 * can overlap without the upper one swallowing the lower one's drags.
 */
const RANGE_INPUT = [
  "pointer-events-none absolute left-0 top-1/2 m-0 h-6 w-full -translate-y-1/2 appearance-none bg-transparent outline-none",
  "[&::-webkit-slider-runnable-track]:h-6 [&::-webkit-slider-runnable-track]:bg-transparent",
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6",
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
  "[&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-azure/70 [&::-webkit-slider-thumb]:bg-obsidian",
  "[&::-moz-range-track]:h-6 [&::-moz-range-track]:bg-transparent",
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6",
  "[&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full",
  "[&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-azure/70 [&::-moz-range-thumb]:bg-obsidian",
  // The focus ring is on the thumb, because the input itself is the full width
  // of the track and an outline around it would say nothing about which handle
  // has the keyboard.
  "[&:focus-visible::-webkit-slider-thumb]:border-azure [&:focus-visible::-webkit-slider-thumb]:bg-azure",
  "[&:focus-visible::-moz-range-thumb]:border-azure [&:focus-visible::-moz-range-thumb]:bg-azure",
].join(" ");

function RangeField({
  label,
  bound,
  step,
  low,
  high,
  onChange,
  format,
  hint,
}: {
  label: string;
  bound: Bound;
  step: number;
  /** Null means the handle has not been moved, so it rests on the bound. */
  low: number | null;
  high: number | null;
  onChange: (low: number | null, high: number | null) => void;
  format: (n: number) => string;
  hint?: string;
}) {
  const lo = low ?? bound.min;
  const hi = high ?? bound.max;
  const span = Math.max(1, bound.max - bound.min);
  const pct = (n: number) => ((n - bound.min) / span) * 100;

  /**
   * A handle resting on its bound is stored as null, not as the bound.
   *
   * The difference is the whole honesty of the filter count and the chips: a
   * window of "€220 to €690" over a catalogue whose ends are €220 and €690 is
   * not a choice the athlete made, and counting it as one would tell them they
   * are excluding people when they are not.
   */
  const commit = (nextLo: number, nextHi: number) =>
    onChange(nextLo <= bound.min ? null : nextLo, nextHi >= bound.max ? null : nextHi);

  // When both handles sit on the same value one of them is unreachable by
  // pointer. Whichever one still has somewhere to go is put on top.
  const lowOnTop = lo === hi ? lo > bound.min : false;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="section-label">{label}</p>
        <p className="tnum text-[12px] text-snow">
          {format(lo)} – {format(hi)}
        </p>
      </div>

      <div className="relative mt-4 h-11">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-hairline-strong"
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-px -translate-y-1/2 bg-azure/70"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input
          type="range"
          min={bound.min}
          max={bound.max}
          step={step}
          value={lo}
          aria-label={`${label}, lowest`}
          aria-valuetext={format(lo)}
          onChange={(e) => commit(Math.min(Number(e.target.value), hi), hi)}
          className={RANGE_INPUT}
          style={{ zIndex: lowOnTop ? 2 : 1 }}
        />
        <input
          type="range"
          min={bound.min}
          max={bound.max}
          step={step}
          value={hi}
          aria-label={`${label}, highest`}
          aria-valuetext={format(hi)}
          onChange={(e) => commit(lo, Math.max(Number(e.target.value), lo))}
          className={RANGE_INPUT}
          style={{ zIndex: lowOnTop ? 1 : 2 }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="tnum text-[11px] text-mist-dim">{format(bound.min)}</span>
        <span className="tnum text-[11px] text-mist-dim">{format(bound.max)}</span>
      </div>

      {hint && <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

function FiltersSheet({
  open,
  onClose,
  filters,
  onChange,
  options,
  athleteExperience,
  matching,
  total,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  filters: GuideFilters;
  onChange: (next: GuideFilters) => void;
  options: {
    mountains: string[];
    countries: string[];
    languages: string[];
    specialities: Speciality[];
    bounds: { rateEur: Bound; yearsGuiding: Bound };
  };
  athleteExperience: ExperienceLevel;
  matching: number;
  total: number;
  onReset: () => void;
}) {
  const set = <K extends keyof GuideFilters>(key: K, value: GuideFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  return (
    <Sheet
      open={open}
      title="Filters"
      onClose={onClose}
      action={
        <button
          type="button"
          onClick={onReset}
          className="text-[12px] text-mist transition-colors hover:text-snow"
        >
          Reset
        </button>
      }
      footer={
        <>
          {/* The list behind is already filtered, so the count is what pressing
              this returns to — not a promise about what it is going to do. */}
          <p className="tnum mb-3 text-center text-[11px] text-mist-dim">
            {matching} of {total} guides match
          </p>
          <Button size="lg" className="w-full" onClick={onClose}>
            Apply filters
          </Button>
        </>
      }
    >
      <div className="space-y-7">
        <Block label="Technical speciality">
          <SpecialityGrid
            specialities={options.specialities}
            selected={filters.specialities}
            onToggle={(s) => set("specialities", toggle(filters.specialities, s))}
          />
        </Block>

        <Block label="Language">
          <div className="flex flex-wrap gap-1.5">
            {options.languages.map((l) => (
              <Chip
                key={l}
                active={filters.languages.includes(l)}
                onClick={() => set("languages", toggle(filters.languages, l))}
              >
                {l}
              </Chip>
            ))}
          </div>
        </Block>

        <RangeField
          label="Price range"
          bound={options.bounds.rateEur}
          step={10}
          low={filters.minDailyRateEur}
          high={filters.maxDailyRateEur}
          onChange={(min, max) =>
            onChange({ ...filters, minDailyRateEur: min, maxDailyRateEur: max })
          }
          format={(n) => `€${n.toLocaleString("en-GB")}`}
          hint={RATE_NOTE}
        />

        <RangeField
          label="Experience (years)"
          bound={options.bounds.yearsGuiding}
          step={1}
          low={filters.minYearsGuiding}
          high={filters.maxYearsGuiding}
          onChange={(min, max) =>
            onChange({ ...filters, minYearsGuiding: min, maxYearsGuiding: max })
          }
          format={(n) => `${n}`}
          hint={YEARS_NOTE}
        />

        <Block label="Where they work from">
          <select
            className={controlClass}
            value={filters.country}
            onChange={(e) => set("country", e.target.value)}
          >
            <option value="">Anywhere</option>
            {options.countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Block>

        <Block
          label="Your experience"
          hint={`Changes what the comparison expects of a guide, and hides nobody. Defaults to ${EXPERIENCE_LABELS[
            athleteExperience
          ].toLowerCase()} — what you told ICEFALL at onboarding, never inferred from your training.`}
        >
          <div className="flex flex-wrap gap-1.5">
            <Chip active={filters.experience === null} onClick={() => set("experience", null)}>
              As set at onboarding
            </Chip>
            {EXPERIENCE_IDS.map((x) => (
              <Chip
                key={x}
                active={filters.experience === x}
                onClick={() => set("experience", filters.experience === x ? null : x)}
              >
                {EXPERIENCE_LABELS[x]}
              </Chip>
            ))}
          </div>
        </Block>

        <Block
          label="Availability"
          hint="A status the guide set, not a calendar. Filtering on it hides anyone who says they are not taking work at all."
        >
          <label className="flex min-h-[44px] items-center gap-2.5 text-[12px] text-mist">
            <input
              type="checkbox"
              checked={filters.takingWorkOnly}
              onChange={(e) => set("takingWorkOnly", e.target.checked)}
              className="h-4 w-4 accent-azure"
            />
            Only guides taking work
          </label>
        </Block>
      </div>
    </Sheet>
  );
}

/** The chosen filters as removable chips, so nothing excludes people invisibly. */
function FilterSummary({
  filters,
  onChange,
}: {
  filters: GuideFilters;
  onChange: (next: GuideFilters) => void;
}) {
  const set = (patch: Partial<GuideFilters>) => onChange({ ...filters, ...patch });
  const chips: { key: string; label: string; clear: () => void }[] = [];

  if (filters.mountain) {
    chips.push({ key: "mountain", label: filters.mountain, clear: () => set({ mountain: "" }) });
  }
  if (filters.fromIso || filters.toIso) {
    chips.push({
      key: "dates",
      label: datesLabel(filters),
      clear: () => set({ fromIso: "", toIso: "" }),
    });
  }
  if (filters.groupSize !== null) {
    chips.push({
      key: "group",
      label: groupLabel(filters.groupSize),
      clear: () => set({ groupSize: null }),
    });
  }
  if (filters.country) {
    chips.push({ key: "country", label: filters.country, clear: () => set({ country: "" }) });
  }
  for (const s of filters.specialities) {
    chips.push({
      key: `spec-${s}`,
      label: SPECIALITY_LABELS[s],
      clear: () => set({ specialities: filters.specialities.filter((x) => x !== s) }),
    });
  }
  for (const l of filters.languages) {
    chips.push({
      key: `lang-${l}`,
      label: l,
      clear: () => set({ languages: filters.languages.filter((x) => x !== l) }),
    });
  }
  if (filters.minDailyRateEur !== null || filters.maxDailyRateEur !== null) {
    const from = filters.minDailyRateEur === null ? "any" : `€${filters.minDailyRateEur}`;
    const to = filters.maxDailyRateEur === null ? "any" : `€${filters.maxDailyRateEur}`;
    chips.push({
      key: "rate",
      label: `${from} – ${to} a day`,
      clear: () => set({ minDailyRateEur: null, maxDailyRateEur: null }),
    });
  }
  if (filters.minYearsGuiding !== null || filters.maxYearsGuiding !== null) {
    const from = filters.minYearsGuiding === null ? "any" : `${filters.minYearsGuiding}`;
    const to = filters.maxYearsGuiding === null ? "any" : `${filters.maxYearsGuiding}`;
    chips.push({
      key: "years",
      label: `${from} – ${to} years`,
      clear: () => set({ minYearsGuiding: null, maxYearsGuiding: null }),
    });
  }
  if (filters.experience !== null) {
    chips.push({
      key: "experience",
      label: EXPERIENCE_LABELS[filters.experience],
      clear: () => set({ experience: null }),
    });
  }
  if (filters.takingWorkOnly) {
    chips.push({
      key: "taking",
      label: "Taking work",
      clear: () => set({ takingWorkOnly: false }),
    });
  }

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.clear}
          className="tnum inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-[11px] text-mist transition-colors hover:text-snow"
        >
          {c.label}
          <X size={11} strokeWidth={1.8} className="text-mist-dim" />
        </button>
      ))}
    </div>
  );
}
