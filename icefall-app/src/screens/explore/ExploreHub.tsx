import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Backpack,
  Building2,
  CloudSnow,
  Loader2,
  Mountain as MountainIcon,
  Search,
  Users,
  UsersRound,
} from "lucide-react";

import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { ProgressRing } from "@/components/ui/charts";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { QualifierBadge, UnavailableState, type DataQualifier } from "@/components/coach/DataState";
import { useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtDate, fmtElevation } from "@/lib/format";
import { isKnown, type Score } from "@/coach/types";
import {
  OBJECTIVE_READINESS_DISCLAIMER,
  assessObjectiveReadiness,
} from "@/coach/mountainReadiness";
import { PEAK_ATTRIBUTION, rememberPeaks, searchPeaks, type Peak } from "@/services/peaks";
import { OPERATOR_DISCLAIMER, allOperators } from "@/services/operators";
import { sync } from "@/services/repository";
import { NETWORK_NOT_CONNECTED_NOTICE } from "@/network/types";
import { useApp, usePrimaryGoal } from "@/state/AppState";
import { useRecordedActivities } from "@/tracking/feed";
import type { Goal } from "@/types";

/**
 * EXPLORE — the hub.
 *
 * The way into everything ICEFALL knows about the world beyond the athlete's
 * own training: mountains, people, groups, guiding companies, conditions and
 * kit. The MOUNTAIN is the organising idea on every one of them. This is not a
 * social network with peaks attached; it is a mountain app where a few of the
 * doors happen to lead to other climbers.
 *
 * THE RULE THAT DECIDES EVERY NUMBER ON THIS SCREEN
 *
 * ICEFALL has no server and no other users. So a hub full of confident tallies
 * — "127 people preparing for Mont Blanc", "23 active groups" — is not a
 * harmless bit of scaffolding: those figures are the reason somebody would tap
 * through, and finding an empty room behind them teaches them that the counts
 * elsewhere in ICEFALL are decoration too. Worse, a person who believes there
 * are 127 climbers on their objective may wait for a partner who does not
 * exist.
 *
 * Every count here is therefore either the athlete's OWN figure — objectives
 * they saved, groups they created, listings the app really holds — or it is
 * replaced by a sentence saying the network is not connected. A section with
 * nothing behind it never prints a bare `0` either: at zero users "0 people"
 * reads as "nobody wants to climb with you", when the truth is that nothing has
 * been searched and nobody could have been found.
 *
 * Also absent, deliberately: follower counts, "trending" peaks, activity feeds,
 * anything ranking one climber against another, and any badge implying ICEFALL
 * has checked a person or a company. It has checked nobody.
 */

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Whole days between today and a target date, both read as LOCAL calendar days.
 *
 * `new Date("2027-06-12")` is UTC midnight, so west of Greenwich the naive
 * difference is a day out — and a countdown that reads a day early on a
 * departure is the kind of small lie that changes a plan. Goals carry either a
 * bare `YYYY-MM-DD` or a full timestamp, so both are reduced to a local day
 * before subtracting.
 */
function daysUntil(iso: string, now = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  let target: Date;

  if (match) {
    const [y, mo, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    target = new Date(y, mo - 1, d);
    // Rejects 2027-02-31, which the constructor would roll silently into March.
    if (target.getFullYear() !== y || target.getMonth() !== mo - 1 || target.getDate() !== d) {
      return null;
    }
  } else {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** The countdown in words. Never a fabricated date when there isn't one. */
function countdownLabel(days: number | null): string {
  if (days === null) return "Target date not recorded";
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago`;
  if (days === 0) return "Today";
  return `${days} ${days === 1 ? "day" : "days"} to go`;
}

/* -------------------------------------------------------------------------- */
/* Readiness for the athlete's own objective                                   */
/* -------------------------------------------------------------------------- */

interface HubReadiness {
  /** A value or the reason there isn't one — never a zero standing in for either. */
  score: Score;
  qualifier: DataQualifier;
}

/**
 * The local athlete's readiness for their active goal.
 *
 * DERIVED from sessions they recorded and from what they told ICEFALL, and
 * never measured — which is why every surface that draws it carries a qualifier
 * and the disclaimer travels with the card. Returns null when there is no goal
 * or no elevation to read the class of objective from: the engine needs one and
 * a guessed height would fabricate the whole assessment.
 */
function useObjectiveReadiness(goal: Goal | undefined): HubReadiness | null {
  const { objectives, coachProfile } = useApp();
  const activities = useRecordedActivities();

  return useMemo<HubReadiness | null>(() => {
    if (!goal || typeof goal.elevationM !== "number" || !Number.isFinite(goal.elevationM)) {
      return null;
    }

    // Simulated recordings exist so the tracker can be reviewed indoors. A
    // labelled simulation is not training the athlete did, so it never reaches
    // a readiness figure.
    const recorded = activities.filter((a) => !a.simulated);
    const summitsLogged = objectives.flatMap((o) =>
      o.summitedAt ? [{ name: o.name, elevationM: o.elevationM, date: o.summitedAt }] : [],
    );

    const assessment = assessObjectiveReadiness({
      peak: { name: goal.name, elevationM: goal.elevationM, lat: goal.lat, lon: goal.lon },
      activities: recorded,
      summitsLogged,
      selfReported: {
        technicalSkills:
          coachProfile.technicalSkills.length > 0 ? coachProfile.technicalSkills : undefined,
        maxAltitudeM: coachProfile.maxAltitudeM,
        disciplineExperience:
          Object.keys(coachProfile.disciplineExperience).length > 0
            ? coachProfile.disciplineExperience
            : undefined,
      },
    });

    // Disclosed conservatively: if ICEFALL has observed nothing, or any
    // dimension came from the athlete's own account, the figure is
    // self-reported. Over-disclosing costs nothing; under-disclosing puts an
    // unearned number beside a mountain.
    const qualifier: DataQualifier =
      recorded.length === 0 || assessment.dimensions.some((d) => d.provenance === "self-reported")
        ? "self-reported"
        : "estimated";

    return { score: assessment.overall, qualifier };
  }, [goal, activities, objectives, coachProfile]);
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function ExploreHub() {
  const { objectives, expeditions, connectionRequests, networkOptIn } = useApp();
  const goal = usePrimaryGoal();
  const readiness = useObjectiveReadiness(goal);

  // Real counts, all of them from something that actually exists on this
  // device or in the bundle. Nothing here describes other people.
  const savedObjectives = objectives.length;
  const curatedMountains = sync.mountains.length;
  const myGroups = expeditions.length;
  const sampleListings = useMemo(() => allOperators().length, []);
  const rangeItems = sync.products.length;
  const queuedMessages = connectionRequests.length;

  const gearSystem = goal?.mountainId ? sync.systemForMountain(goal.mountainId) : undefined;

  return (
    <Screen>
      <Stagger className="pt-5">
        {/* ---- Where are you going? --------------------------------------- */}
        <Rise>
          <PeakSearch />
        </Rise>

        {/* ---- The objective, when there is one --------------------------- */}
        {goal && (
          <>
            <Rise className="mt-7">
              <SectionLabel>Your objective</SectionLabel>
            </Rise>
            <Rise className="mt-3">
              <ObjectiveLead goal={goal} readiness={readiness} />
            </Rise>
            {readiness && isKnown(readiness.score) && (
              <Rise className="mt-3">
                <Disclaimer>{OBJECTIVE_READINESS_DISCLAIMER}</Disclaimer>
              </Rise>
            )}
          </>
        )}

        {/* ---- The six doors ---------------------------------------------- */}
        <Rise className="mt-7">
          <SectionLabel>Explore</SectionLabel>
        </Rise>

        <div className="mt-3 space-y-3">
          {/* MOUNTAINS — the athlete's own shortlist, and the whole map. */}
          <Rise>
            <SectionCard
              icon={<MountainIcon size={16} strokeWidth={1.5} />}
              label="Mountains"
              purpose="Discover your next objective."
              figure={
                savedObjectives > 0
                  ? `${savedObjectives} objective${savedObjectives === 1 ? "" : "s"} saved`
                  : "No objectives saved yet"
              }
              figureTone={savedObjectives > 0 ? "known" : "absent"}
              note={`${curatedMountains} ICEFALL mountains with written routes, plus every named peak in OpenStreetMap.`}
              to="/explore/mountains"
              cta={savedObjectives > 0 ? "Open your objectives" : "Find a mountain"}
            />
          </Rise>

          {/* PEOPLE — no count is possible, so none is invented. */}
          <Rise>
            <SectionCard
              icon={<Users size={16} strokeWidth={1.5} />}
              label="People"
              purpose="Find your mountain crew."
              /* Not "0 people". At zero users a nought reads as a search that
                 ran and found nobody, which would be a lie about the one thing
                 that matters here: no search ran, and none can. */
              figure="The network is not connected"
              figureTone="absent"
              note={
                goal
                  ? `Nobody is listed for ${goal.name}, or for any other mountain. ICEFALL has no server and no other members, so there is no directory to search and no count to give — this is not a search that came back empty.`
                  : "ICEFALL has no server and no other members, so there is no directory to search and no count to give — this is not a search that came back empty."
              }
              footnote={[
                queuedMessages > 0
                  ? `${queuedMessages} message${queuedMessages === 1 ? "" : "s"} written and held on this device. Nothing was sent and no reply can arrive.`
                  : null,
                networkOptIn
                  ? null
                  : "You have not turned the Expedition Network on, so nothing about you is held as a network profile or compared with anyone.",
              ]
                .filter((line): line is string => line !== null)
                .join(" ")}
              to="/explore/people"
              cta="Open People"
            />
          </Rise>

          {/* GROUPS — the athlete's own groups are real; nobody else's exist. */}
          <Rise>
            <SectionCard
              icon={<UsersRound size={16} strokeWidth={1.5} />}
              label="Groups"
              purpose="Join an expedition group."
              figure={
                myGroups > 0
                  ? `${myGroups} group${myGroups === 1 ? "" : "s"} you created`
                  : "You have not created a group"
              }
              figureTone={myGroups > 0 ? "known" : "absent"}
              note={
                goal
                  ? `There are no other groups to join — yours are the only ones that exist, and they are held on this device. You can start one for ${goal.name}.`
                  : "There are no other groups to join — yours are the only ones that exist, and they are held on this device."
              }
              to="/explore/groups"
              cta={myGroups > 0 ? "Open your groups" : "Start a group"}
            />
          </Rise>

          {/* EXPEDITIONS — sample listings, counted as sample listings. */}
          <Rise>
            <SectionCard
              icon={<Building2 size={16} strokeWidth={1.5} />}
              label="Expeditions"
              purpose="Companies that run guided expeditions."
              figure={`${sampleListings} sample listing${sampleListings === 1 ? "" : "s"}`}
              /* Quoted rather than paraphrased: the directory screen and this
                 card must not describe the same listings differently. */
              note={OPERATOR_DISCLAIMER}
              to="/explore/expeditions"
              cta="Open the directory"
            />
          </Rise>

          {/* CONDITIONS — needs an objective; without one there is no mountain
              to report on, and a default peak would be an invented plan. */}
          <Rise>
            {goal ? (
              <SectionCard
                icon={<CloudSnow size={16} strokeWidth={1.5} />}
                label="Conditions"
                purpose="What the mountain is doing."
                figure={`Forecast for ${goal.name}`}
                note="Modelled weather for the summit and the days ahead. Nothing is read until you open it, and a forecast is never a decision to go — that one belongs to you and your guide."
                to={`/mountain/${encodeURIComponent(goal.id)}/conditions`}
                cta="Read the conditions"
              />
            ) : (
              <SectionCard
                icon={<CloudSnow size={16} strokeWidth={1.5} />}
                label="Conditions"
                purpose="What the mountain is doing."
                figure="No objective set"
                figureTone="absent"
                note="Conditions follow a mountain rather than a place. Name the objective you are training for and this reads the forecast for it."
                to="/goals"
                cta="Set an objective"
              />
            )}
          </Rise>

          {/* GEAR — the range, counted honestly as the range. */}
          <Rise>
            <SectionCard
              icon={<Backpack size={16} strokeWidth={1.5} />}
              label="Gear"
              purpose="Build your mountain kit."
              figure={`${rangeItems} item${rangeItems === 1 ? "" : "s"} in the ICEFALL range`}
              note={
                gearSystem && goal
                  ? `Includes the layering system ICEFALL recommends for ${goal.name}.`
                  : "Every item leads with what an objective asks of it, rather than with a price."
              }
              to="/gear"
              cta="Open Gear"
            />
          </Rise>
        </div>

        {/* The standing statement, in full, once — so nothing above has to
            paraphrase it into something softer. */}
        <Rise className="mt-7">
          <Disclaimer>{NETWORK_NOT_CONNECTED_NOTICE}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

type SearchState = "idle" | "searching" | "done";

/**
 * "Where are you going?" — the first thing on the hub, because the mountain is
 * the way into everything else.
 *
 * Resolves through `searchPeaks`, which reads the bundled catalogue first and
 * then OpenStreetMap. Two honesty details ride on that:
 *
 *   · A peak with no recorded elevation is dropped upstream, because ICEFALL
 *     reads the class of an objective from its height and would otherwise be
 *     assessing a guess. The empty state says so rather than implying the
 *     mountain does not exist.
 *   · The live half of the search needs a network. Offline, the catalogue still
 *     answers, so "nothing matched" is qualified rather than stated flatly.
 */
function PeakSearch() {
  const [q, setQ] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [results, setResults] = useState<Peak[]>([]);

  useEffect(() => {
    const needle = q.trim();
    // Two characters is a real mountain name — K2 was unfindable behind three.
    if (needle.length < 2) {
      setResults([]);
      setState("idle");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setState("searching");

    // Debounced: every keystroke otherwise fires a geocoder request and an
    // Overpass query, which is both slow for the athlete and rude to two free
    // public endpoints.
    const timer = setTimeout(() => {
      searchPeaks(needle, controller.signal)
        .then((found) => {
          if (cancelled) return;
          // The detail screen resolves an id from this session cache, so a
          // live-only peak opens instead of bouncing back to Explore.
          rememberPeaks(found);
          setResults(found);
          setState("done");
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setState("done");
        });
    }, 280);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [q]);

  return (
    <div>
      <div className="relative">
        <Search
          size={16}
          strokeWidth={1.6}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Where are you going?"
          aria-label="Search for a mountain by name"
          enterKeyHint="search"
          className="h-11 w-full rounded-full border border-hairline bg-elevated/40 pl-10 pr-10 text-[13px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
        />
        {state === "searching" && (
          <Loader2
            size={15}
            aria-hidden="true"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-mist-dim"
          />
        )}
      </div>

      {q.trim().length >= 2 && (
        <div className="mt-3">
          {results.length > 0 ? (
            <>
              <ul className="space-y-2.5">
                {results.map((peak) => (
                  <li key={peak.id}>
                    <PeakResult peak={peak} />
                  </li>
                ))}
              </ul>
              <p className="pt-3 text-center text-[10px] text-mist-dim">{PEAK_ATTRIBUTION}</p>
            </>
          ) : (
            state === "done" && (
              <Card>
                <p className="text-[13px] text-snow">Nothing matches “{q.trim()}”</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                  ICEFALL searched its own catalogue and OpenStreetMap. Peaks with no recorded
                  elevation are left out — the class of an objective is read from its height, and
                  ICEFALL will not assess a guess. If you are offline, only the bundled catalogue
                  answered.
                </p>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}

/** One peak from the search. Curated mountains carry more; both open a page. */
function PeakResult({ peak }: { peak: Peak }) {
  const to = peak.curatedId
    ? `/explore/mountain/${peak.curatedId}`
    : `/explore/peak/${encodeURIComponent(peak.id)}`;

  return (
    <Link to={to} className="block">
      <Card className="transition-colors hover:border-hairline-strong">
        <div className="flex items-center gap-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-tile border border-hairline bg-white/[0.02] text-mist">
            <MountainIcon size={16} strokeWidth={1.4} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[14px] text-snow">{peak.name}</p>
              {peak.curatedId && <Badge tone="azure">ICEFALL</Badge>}
            </div>
            <p className="tnum mt-0.5 text-[11px] text-mist-dim">
              {fmtElevation(peak.elevationM)} m{peak.country ? ` · ${peak.country}` : ""}
            </p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* The objective                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The active goal, leading the hub.
 *
 * The photograph is a real one where ICEFALL has a real one and terrain of the
 * right altitude band, labelled, where it does not — `useMountainImage` decides,
 * and the label exists so band artwork can never pass as the summit.
 */
function ObjectiveLead({ goal, readiness }: { goal: Goal; readiness: HubReadiness | null }) {
  const image = useMountainImage({
    name: goal.name,
    elevationM: goal.elevationM,
    lat: goal.lat,
    lon: goal.lon,
    curatedId: goal.mountainId,
    wikipedia: goal.wikipedia,
    photo: goal.photo,
  });

  const days = daysUntil(goal.targetDate);
  const value = readiness && isKnown(readiness.score) ? readiness.score.value : null;

  return (
    <Card inset={false} className="overflow-hidden">
      <div className="grain relative aspect-[16/9] w-full overflow-hidden bg-slate">
        <img
          src={image.src}
          alt={image.real ? goal.name : ""}
          aria-hidden={image.real ? undefined : true}
          loading="lazy"
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            image.real ? "opacity-100" : "opacity-45",
          )}
        />
        <div className="absolute inset-0 scrim-bottom" />

        {!image.real && (
          <span
            title={image.caption}
            className="absolute right-3 top-3 rounded-full border border-hairline-strong bg-obsidian/70 px-2 py-[3px] text-[9px] font-medium uppercase tracking-[0.1em] text-mist backdrop-blur"
          >
            Representative terrain
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 p-4">
          <h2 className="truncate text-[22px] font-light text-snow">{goal.name}</h2>
          <p className="tnum mt-0.5 text-[12px] text-mist">
            {typeof goal.elevationM === "number"
              ? `${fmtElevation(goal.elevationM)} m`
              : "Elevation not recorded"}
            {" · "}
            {fmtDate(goal.targetDate)}
          </p>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="section-label">Time to the objective</p>
            <p className="tnum mt-1.5 text-[17px] font-light text-snow">{countdownLabel(days)}</p>
          </div>

          {value !== null ? (
            <div className="shrink-0 text-center">
              <ProgressRing value={value} size={54} stroke={2.5}>
                <span className="tnum text-[15px] font-light text-snow">{value}</span>
              </ProgressRing>
              <p className="section-label mt-2 text-[9px]">Readiness</p>
            </div>
          ) : (
            // Never a zero: "not assessed" and "assessed at nothing" would lead
            // an athlete to opposite decisions about the same mountain.
            <UnavailableState
              reason={readiness?.score.reason ?? "no-data"}
              size="sm"
              className="shrink-0"
            />
          )}
        </div>

        {/* The figure never appears bare. Whether it came from recorded
            sessions or the athlete's own account, it is an estimate rather
            than a measurement, and it says so beside the ring. */}
        {readiness && value !== null && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <QualifierBadge kind={readiness.qualifier} />
            <span className="text-[11px] text-mist-dim">
              Not a measurement, and not a clearance to climb.
            </span>
          </div>
        )}

        <Button asChild variant="secondary" className="mt-4 w-full">
          <Link to={`/mountain/${encodeURIComponent(goal.id)}`}>Open {goal.name}</Link>
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Section card                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One door out of the hub.
 *
 * `figure` is the load-bearing line: either a real count of something that
 * exists on this device or in the bundle, or a plain statement that the network
 * is not connected. `figureTone="absent"` draws the second kind back so it
 * reads as a state of affairs rather than as a metric — but it is never
 * rendered as a `0`, which at zero users would say something false and
 * discouraging about the athlete rather than true about ICEFALL.
 */
function SectionCard({
  icon,
  label,
  purpose,
  figure,
  figureTone = "known",
  note,
  footnote,
  to,
  cta,
}: {
  icon: React.ReactNode;
  label: string;
  purpose: string;
  figure: string;
  figureTone?: "known" | "absent";
  note: string;
  /** An extra honest line — queued messages, opt-in state. Empty means none. */
  footnote?: string;
  to: string;
  cta: string;
}) {
  return (
    <Link to={to} className="group block">
      <Card className="transition-colors group-hover:border-hairline-strong">
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-hairline bg-white/[0.02] text-mist"
          >
            {icon}
          </span>

          <div className="min-w-0 flex-1">
            <p className="section-label">{label}</p>
            <p className="mt-1.5 text-[14px] leading-snug text-snow">{purpose}</p>
            <p
              className={cn(
                "tnum mt-2 text-[12px]",
                figureTone === "known" ? "text-mist" : "text-mist-dim",
              )}
            >
              {figure}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{note}</p>
            {footnote && footnote.length > 0 && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{footnote}</p>
            )}

            <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-mist transition-colors group-hover:text-snow">
              {cta}
              <ArrowUpRight size={14} strokeWidth={1.6} aria-hidden="true" />
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
