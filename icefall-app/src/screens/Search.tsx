import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Backpack, ChevronRight, CloudSun, Compass, Flag, Footprints, Gauge, Heart,
  MessageCircle, Mountain, Route as RouteIcon, Salad, Search as SearchIcon,
  Settings as SettingsIcon, ShoppingBag, Target, Users,
} from "lucide-react";
import { Rise, Stagger } from "@/components/layout/chrome";
import { fmtDistance, fmtElevation } from "@/lib/format";
import { loadPeakCatalogue, type Peak } from "@/services/peaks";
import { TRAIL_ATTRIBUTION } from "@/services/trails";
import { allGuides, credentialStatus } from "@/guides/types";
import { DEMO_OPERATORS, allOperators } from "@/services/operators";
import { DISCOVERABLE_ATHLETES, matchesAthlete } from "@/network/directory";
import { TREKS } from "@/treks";
import {
  PEOPLE_NO_MATCH, PEOPLE_SOURCE_NOTE, usePeopleSearch, type SearchHit,
} from "@/search/people";
import { useGroupSearch, useTrekSearch } from "@/search/treksAndGroups";
import { useTrailSearch } from "@/search/trails";
import { Avatar, Badge, SectionLabel } from "@/components/ui/primitives";
import { useActivityFeed } from "@/tracking/feed";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";

/**
 * Global search — one door to everything.
 *
 * The app is 78 routes deep and ships a catalogue of thousands of peaks, but
 * every search box in it used to be local to one screen: you could only find a
 * mountain if you were already standing in the mountain library. This searches
 * everything ICEFALL holds at once — the places in the app, your objectives,
 * your recorded activities, the peak catalogue, guides, companies, the 252-route
 * trek catalogue, hiking trails, groups and real ICEFALL accounts.
 *
 * ── WHERE THE WORK HAPPENS ──────────────────────────────────────────────────
 * Ten sources, and only three of them can be slow. Each of those three lives in
 * its own module under `src/search/` and does its own debouncing, cancellation
 * and budgeting, because a source that can stall the keyboard must own that
 * problem rather than leaving it to whichever screen imports it:
 *
 *   · people  — one server request per settled query, 250 ms debounce, aborted
 *               when the query changes, 4 s budget.
 *   · trails  — 2 MB of prebuilt country indexes, fetched once and then scanned
 *               in memory in single-digit milliseconds, 180 ms debounce.
 *   · groups  — one request on mount for the shared list, then in-memory.
 *
 * Everything else answers from bundled data on the keystroke itself.
 *
 * ── SECTION ORDER SERVES A MOUNTAINEER ──────────────────────────────────────
 * Mountains, treks and trails first; the app's own screens last. Someone typing
 * "toubkal" wants the mountain, not the Settings page, and the old order put
 * "In the app" above every piece of subject matter on the platform.
 *
 * ── THE HONESTY RULE THIS SCREEN CARRIES ────────────────────────────────────
 * Three of the sources can fail to answer, and an empty section looks identical
 * whether it means "nobody by that name", "you are signed out", "the server did
 * not reply" or "that continent is not indexed". Each source returns the
 * sentence for its own state; this screen renders it, either under the section
 * it belongs to or — when a source produced no rows at all and so has no
 * section — in the "Search coverage" block at the bottom. Nothing a source said
 * about its own limits is dropped on the floor.
 */

interface Place {
  label: string;
  detail: string;
  to: string;
  icon: typeof Compass;
  /** Extra words that should match this destination but aren't in its label. */
  keywords?: string;
}

/** Every destination worth reaching directly, named the way a person says it. */
const PLACES: Place[] = [
  { label: "Today's session", detail: "Coach · your plan for today", to: "/coach/today", icon: Target, keywords: "workout training plan session" },
  { label: "Ask the coach", detail: "Coach · chat", to: "/coach", icon: MessageCircle, keywords: "chat ask question advice" },
  { label: "Training plan", detail: "Coach · the full build", to: "/coach/plan", icon: Target, keywords: "weeks schedule programme" },
  { label: "Progress", detail: "Coach · how the build is going", to: "/coach/progress", icon: Gauge, keywords: "trend load" },
  { label: "Readiness", detail: "Coach · today's read, and why", to: "/coach/readiness", icon: Gauge, keywords: "score analysis" },
  { label: "Daily check-in", detail: "Coach · sleep, soreness, stress", to: "/coach/check-in", icon: Heart, keywords: "recovery wellness" },
  { label: "Recovery", detail: "Coach · what your body is saying", to: "/coach/recovery", icon: Heart, keywords: "rest fatigue" },
  { label: "Nutrition", detail: "Coach · fuelling for the session", to: "/coach/nutrition", icon: Salad, keywords: "food eat carbs hydration" },
  { label: "Activity history", detail: "Everything you've recorded", to: "/activity", icon: Mountain, keywords: "past runs hikes log" },
  { label: "Start an activity", detail: "Record a new one", to: "/activity/select", icon: Mountain, keywords: "track record gps" },
  { label: "Objectives", detail: "The mountains you're training for", to: "/goals", icon: Flag, keywords: "goals summit target" },
  { label: "Mountain library", detail: "Every peak ICEFALL holds", to: "/explore/mountains", icon: Compass, keywords: "peaks explore browse search" },
  { label: "Treks", detail: "Multi-day walking routes", to: "/explore/treks", icon: Footprints, keywords: "trek trekking hike walking camino tour" },
  { label: "Groups", detail: "Parties heading for a mountain", to: "/social?tab=groups", icon: Users, keywords: "group party team partners" },
  { label: "Gear", detail: "The system for your objective", to: "/gear", icon: ShoppingBag, keywords: "kit equipment boots" },
  { label: "Health", detail: "What ICEFALL reads, and from where", to: "/health", icon: Heart, keywords: "sensors heart rate" },
  { label: "Ring and health data", detail: "Connect an Oura ring, and your permission for it", to: "/settings/health-sources", icon: Heart, keywords: "oura ring sleep hrv consent gdpr disconnect delete" },
  { label: "Expedition network", detail: "People and groups", to: "/social?tab=people", icon: Users, keywords: "partners climbers friends" },
  { label: "Settings", detail: "Units, notifications, privacy", to: "/settings", icon: SettingsIcon, keywords: "preferences account privacy" },
  { label: "Plans & pricing", detail: "What each plan includes", to: "/pricing", icon: Target, keywords: "subscription upgrade pro billing" },
];

/** Destinations that only exist once there is an objective to hang them on. */
function objectivePlaces(goalId: string, goalName: string): Place[] {
  return [
    { label: `${goalName} — command centre`, detail: "Everything held on this objective", to: `/mountain/${goalId}`, icon: Compass, keywords: "mountain intelligence overview" },
    { label: `${goalName} — conditions`, detail: "Forecast by elevation band", to: `/mountain/${goalId}/conditions`, icon: CloudSun, keywords: "weather forecast wind snow temperature" },
    { label: `${goalName} — kit & documents`, detail: "What this peak demands", to: `/mountain/${goalId}/checklist`, icon: Backpack, keywords: "checklist equipment permits insurance packing" },
    { label: `${goalName} — benchmark`, detail: "Your record against it", to: `/mountain/${goalId}/benchmark`, icon: Gauge, keywords: "compare readiness gap" },
  ];
}

/** The icon tile for a hit from one of the `src/search/` sources. */
const KIND_ICON: Record<SearchHit["kind"], typeof Compass> = {
  person: Users,
  trek: Footprints,
  group: Users,
  trail: RouteIcon,
};

/**
 * People is the only source that has to ask a server before it can say
 * anything, so it is the only one with a wait worth naming. Said here because
 * the source has no sentence for "in flight" — its `state` carries the fact and
 * the words belong on the surface that draws the wait.
 */
const PEOPLE_SEARCHING =
  "Still searching ICEFALL accounts — people are the one source that has to ask the server.";

/** How many rows a section shows. The sources cap themselves; people cap at 20. */
const PERSON_LIMIT = 6;

export default function Search() {
  const navigate = useNavigate();
  const { goals } = useApp();
  const feed = useActivityFeed();
  const [q, setQ] = useState("");
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    void loadPeakCatalogue().then(setPeaks);
  }, []);

  const query = q.trim().toLowerCase();

  /* ---- The live sources ---------------------------------------------------
     Each of these is handed the RAW box contents, not `query`. They trim and
     fold on their own terms — trails lowercases, treks strips accents so
     "frances" finds Camino Francés, people strips PostgREST wildcards — and
     pre-normalising here would hand each of them a string another one had
     already chewed. */
  const people = usePeopleSearch(q);
  const trekHits = useTrekSearch(q);
  const groups = useGroupSearch(q);
  const trails = useTrailSearch(q);

  const places = useMemo(() => {
    const active = goals.filter((g) => g.status === "active");
    const all = [...PLACES, ...active.flatMap((g) => objectivePlaces(g.id, g.name))];
    if (!query) return [];
    return all
      .filter((p) => `${p.label} ${p.detail} ${p.keywords ?? ""}`.toLowerCase().includes(query))
      .slice(0, 6);
  }, [query, goals]);

  const objectives = useMemo(() => {
    if (!query) return [];
    return goals.filter((g) => g.name.toLowerCase().includes(query)).slice(0, 4);
  }, [query, goals]);

  const activities = useMemo(() => {
    if (!query) return [];
    return feed
      .filter((a) => `${a.title} ${a.location ?? ""}`.toLowerCase().includes(query))
      .slice(0, 4);
  }, [query, feed]);

  const peakHits = useMemo(() => {
    if (query.length < 2) return [];
    const starts: Peak[] = [];
    const contains: Peak[] = [];
    for (const p of peaks) {
      const n = p.name.toLowerCase();
      if (n.startsWith(query)) starts.push(p);
      else if (n.includes(query)) contains.push(p);
      if (starts.length >= 8) break;
    }
    // Highest first within each band — a bigger mountain is the likelier target.
    const by = (a: Peak, b: Peak) => b.elevationM - a.elevationM;
    return [...starts.sort(by), ...contains.sort(by)].slice(0, 8);
  }, [query, peaks]);

  /* ---- Guides, companies — PH-21 ---------------------------------------
     Both read the SAME gated sources their own screens read — `allGuides()`,
     `allOperators()` — never the raw fixture arrays. A search surface is a new
     reader of every list it indexes (§6aj): pulling from the ungated arrays
     would resurrect entities the definitions have already removed from this
     build. Reading through the gate means production search inherits
     production truth with no logic here at all. */

  const guideHits = useMemo(() => {
    if (query.length < 2) return [];
    return allGuides()
      .filter((g) =>
        `${g.name} ${g.basedIn} ${g.credentials[0]?.label ?? ""}`.toLowerCase().includes(query),
      )
      .slice(0, 5);
  }, [query]);

  const companyHits = useMemo(() => {
    if (query.length < 2) return [];
    return allOperators()
      .filter((o) =>
        `${o.name} ${o.certification} ${o.regions.join(" ")}`.toLowerCase().includes(query),
      )
      .slice(0, 5);
  }, [query]);

  /*
   * PEOPLE COME FROM TWO PLACES, AND ONE OF THEM IS STILL EMPTY.
   *
   * `usePeopleSearch` reads `public.profiles` — real accounts that real people
   * made, readable by any signed-in user. `DISCOVERABLE_ATHLETES` is the older,
   * deliberately EMPTY local list whose header explains why it must stay that
   * way (an invented climbing partner is a hazard, not a placeholder). It is
   * still read here rather than deleted, because the day it is populated by a
   * real source it must appear in search without anyone remembering to rewire
   * this screen — the same argument its own file makes for iterating it as a
   * list instead of branching on it.
   *
   * `matchesAthlete` matches NAME AND BIO ONLY, never the objective, and that
   * rule survives the merge: neither source lets a stranger type a mountain
   * name and get a list of who will be on it in March.
   */
  const personHits = useMemo<SearchHit[]>(() => {
    const local: SearchHit[] =
      query.length < 2
        ? []
        : DISCOVERABLE_ATHLETES.filter((a) => matchesAthlete(a, query)).map((a) => ({
            id: `athlete:${a.id}`,
            kind: "person",
            title: a.displayName,
            subtitle: a.bio ?? undefined,
            to: "/social?tab=people",
          }));
    return [...local, ...people.hits].slice(0, PERSON_LIMIT);
  }, [query, people.hits]);

  const groupHits = groups.hits;
  const trailHits = trails.hits;

  /*
   * The trail section is drawn while the index is still loading, because an
   * absent section during a 2 MB download reads as "no trail is called that" —
   * the exact confusion the coverage note exists to prevent. `trails.loading`
   * is only ever true once the query is long enough for trails to answer.
   */
  const showTrails = trailHits.length > 0 || trails.loading;

  /*
   * WHAT COULD NOT BE SEARCHED, collected in one place at the bottom.
   *
   * Every source that produced ROWS carries its own sentence under its own
   * section, where it is read in context. A source that produced NOTHING has no
   * section to hang a sentence on — and that is exactly the case where silence
   * is a lie, because an absent People section and an absent Trails section
   * look identical whether the answer was "nobody by that name" or "you are
   * signed out" or "half the world is not indexed".
   *
   * `PEOPLE_NO_MATCH` is deliberately NOT collected here. "No ICEFALL account
   * has that handle or name" is a RESULT, not a limitation, and printing it
   * under every search for "kit" or "settings" would be noise dressed as
   * disclosure. It belongs in the empty state, where somebody was plainly
   * looking for something and found nothing — and that is where it is rendered.
   */
  const coverage = useMemo(() => {
    if (!query) return [];
    const lines: string[] = [];
    if (personHits.length === 0) {
      if (people.state === "searching") lines.push(PEOPLE_SEARCHING);
      else if (people.state !== "ready" && people.message) lines.push(people.message);
    }
    if (groupHits.length === 0 && groups.note) lines.push(groups.note);
    if (!showTrails && trails.coverageNote) lines.push(trails.coverageNote);
    return lines;
  }, [
    query,
    personHits.length,
    people.state,
    people.message,
    groupHits.length,
    groups.note,
    showTrails,
    trails.coverageNote,
  ]);

  const nothing =
    places.length === 0 &&
    objectives.length === 0 &&
    activities.length === 0 &&
    peakHits.length === 0 &&
    trekHits.length === 0 &&
    trailHits.length === 0 &&
    groupHits.length === 0 &&
    personHits.length === 0 &&
    guideHits.length === 0 &&
    companyHits.length === 0;

  /*
   * "Nothing matches" is a VERDICT, and a verdict delivered while two sources
   * are still working is wrong as often as it is right. While anything is in
   * flight the screen says it is still looking instead — which is also what
   * stops the empty state flashing between the last keystroke and the answer.
   */
  const busy = people.state === "searching" || trails.loading;
  const empty = query.length > 0 && nothing && !busy;
  const searching = query.length > 0 && nothing && busy;

  return (
    <div className="no-scrollbar relative h-full overflow-y-auto bg-obsidian">
      {/* Search bar */}
      <div
        className="sticky top-0 z-10 border-b border-hairline bg-obsidian/95 px-5 pb-3 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:text-snow"
          >
            <ArrowLeft size={19} strokeWidth={1.6} />
          </button>
          <label className="flex flex-1 items-center gap-2.5 rounded-tile border border-hairline bg-elevated/40 px-3.5">
            <SearchIcon size={16} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Mountains, treks, trails, people, groups"
              aria-label="Search ICEFALL"
              className="h-11 w-full bg-transparent text-[14px] text-snow outline-none placeholder:text-mist-dim"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Clear"
                className="shrink-0 text-[12px] text-mist-dim hover:text-snow"
              >
                Clear
              </button>
            )}
          </label>
        </div>
      </div>

      {/* Every child of `Stagger` below is a `Rise`, an array of them, or
          nothing. A plain wrapper element between the two breaks framer-motion's
          variant propagation and leaves the rows sitting at opacity 0 with no
          error anywhere — a full afternoon of debugging, once. */}
      <Stagger className="px-5 pb-10">
        {!query && (
          <Rise className="pt-6">
            <SectionLabel>Jump to</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {PLACES.slice(0, 6).map((p) => (
                <Row key={p.to} to={p.to} icon={p.icon} title={p.label} detail={p.detail} />
              ))}
            </div>
            {/* Every number in this sentence is counted from the data it names,
                and the sentence stops where the app's knowledge does: the trail
                index covers part of Europe and nothing else, so the count of
                countries is left to the trail results themselves, which
                recompute it from what actually loaded. */}
            <p className="mt-4 text-[11.5px] leading-relaxed text-mist-dim">
              Searches the whole app — every screen, your objectives, everything you have recorded,{" "}
              {peaks.length ? peaks.length.toLocaleString("en-GB") : "thousands of"} peaks and{" "}
              {TREKS.length} treks. Peaks and treks work offline; trail results say which countries
              are indexed, and people and other climbers' groups need a signal and a signed-in
              account.
            </p>
          </Rise>
        )}

        {objectives.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Your objectives</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {objectives.map((g) => (
                <Row
                  key={g.id}
                  to={`/mountain/${g.id}`}
                  icon={Flag}
                  title={g.name}
                  detail={g.elevationM ? `${fmtElevation(g.elevationM)} m · your objective` : "Your objective"}
                />
              ))}
            </div>
          </Rise>
        )}

        {peakHits.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Peaks</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {peakHits.map((p) => (
                <Row
                  key={p.id}
                  to={
                    p.curatedId
                      ? `/explore/mountain/${p.curatedId}`
                      : `/explore/peak/${encodeURIComponent(p.id)}`
                  }
                  icon={Mountain}
                  title={p.name}
                  detail={`${fmtElevation(p.elevationM)} m${p.country ? ` · ${p.country}` : ""}`}
                />
              ))}
            </div>
          </Rise>
        )}

        {trekHits.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Treks</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {trekHits.map((h) => (
                <HitRow key={h.id} hit={h} />
              ))}
            </div>
          </Rise>
        )}

        {showTrails && (
          <Rise className="pt-6">
            <SectionLabel>Trails</SectionLabel>
            {trailHits.length > 0 && (
              <div className="mt-3 divide-y divide-hairline border-y border-hairline">
                {trailHits.map((h) => (
                  <HitRow key={h.id} hit={h} />
                ))}
              </div>
            )}
            {/* THE COVERAGE NOTE IS NOT OPTIONAL. The index holds 22 European
                countries and nothing else; without this sentence an empty trail
                list reads as a verdict on the trail rather than on the index,
                and a full one implies the whole world was searched. The
                attribution below it is a licence obligation on ODbL data — no
                other source in this box carries it, so nothing else will. */}
            {trails.coverageNote && <SourceNote>{trails.coverageNote}</SourceNote>}
            <SourceNote>{TRAIL_ATTRIBUTION}.</SourceNote>
          </Rise>
        )}

        {activities.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Your activities</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {activities.map((a) => (
                <Row
                  key={a.id}
                  to={`/activity/${a.id}`}
                  icon={Mountain}
                  title={a.title}
                  detail={`${fmtDistance(a.distanceKm)} km · ${fmtElevation(a.elevationGainM)} m${a.location ? ` · ${a.location}` : ""}`}
                />
              ))}
            </div>
          </Rise>
        )}

        {groupHits.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Groups</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {groupHits.map((h) => (
                <HitRow key={h.id} hit={h} />
              ))}
            </div>
            {/* Says which groups were reachable at all — "no group called that"
                and "ICEFALL could not read the group list" lead a climber to
                opposite conclusions about whether to keep looking for a
                partner. Placeholder rows are marked individually as well, so
                the disclosure survives even if this paragraph scrolls away. */}
            {groups.note && <SourceNote>{groups.note}</SourceNote>}
          </Rise>
        )}

        {personHits.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>People</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {personHits.map((h) => (
                <HitRow key={h.id} hit={h} />
              ))}
            </div>
            {/* These rows now open `/social/people/:id`, so this no longer
                explains a dead end — it carries the one caveat that outlived
                the dead end: the accounts are real, and ICEFALL has vouched for
                none of them. */}
            <SourceNote>{PEOPLE_SOURCE_NOTE}</SourceNote>
          </Rise>
        )}

        {guideHits.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Guides</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {guideHits.map((g) => (
                <Row
                  key={g.id}
                  to={`/explore/guides/${encodeURIComponent(g.id)}`}
                  icon={Users}
                  title={g.name}
                  /* The credential's status word travels WITH the credential —
                     "IFMGA / UIAGM mountain guide · Claimed" — never the label
                     alone. The request-hero truncation bug is the standing
                     lesson: a qualification stripped of its qualifier reads as
                     a fact ICEFALL established. */
                  detail={
                    g.credentials[0]
                      ? `${g.credentials[0].label} · ${credentialStatus(g.credentials[0])} · ${g.basedIn}`
                      : g.basedIn
                  }
                  badge={g.demo === true ? <Badge tone="azure">Demo</Badge> : undefined}
                />
              ))}
            </div>
          </Rise>
        )}

        {companyHits.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Expedition companies</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {companyHits.map((o) => (
                <Row
                  key={o.id}
                  to={`/operator/${encodeURIComponent(o.id)}`}
                  icon={Compass}
                  /* Certification and regions only. `responseHours` exists on
                     this record and is the standing invented-response-time
                     defect — it does not get a new surface here. */
                  title={o.name}
                  detail={`${o.certification} · ${o.regions.slice(0, 3).join(", ")}`}
                  badge={
                    DEMO_OPERATORS.some((d) => d.id === o.id) ? (
                      <Badge tone="azure">Demo</Badge>
                    ) : (
                      <Badge tone="neutral">Sample</Badge>
                    )
                  }
                />
              ))}
            </div>
          </Rise>
        )}

        {places.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>In the app</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {places.map((p) => (
                <Row key={p.to} to={p.to} icon={p.icon} title={p.label} detail={p.detail} />
              ))}
            </div>
          </Rise>
        )}

        {searching && (
          <Rise className="pt-16">
            <p className="text-center text-[13px] text-mist">Searching…</p>
            <p className="mt-1.5 text-center text-[11.5px] text-mist-dim">
              Nothing on this device matches "{q}" yet. The sources that have to load or ask the
              server have not answered.
            </p>
          </Rise>
        )}

        {empty && (
          <Rise className="pt-16">
            <p className="text-center text-[13px] text-mist">Nothing matches "{q}".</p>
            <p className="mt-1.5 text-center text-[11.5px] text-mist-dim">
              Try a mountain, a trek, a trail, a guide, a company, or a word like "kit" or
              "settings".
            </p>
            {/* Only when people were genuinely LOOKED UP and genuinely not
                found. Every other people state — signed out, unreachable, no
                server — is a different sentence and is carried below. */}
            {people.state === "ready" && (
              <p className="mx-auto mt-4 max-w-[300px] text-center text-[11.5px] leading-relaxed text-mist-dim">
                {PEOPLE_NO_MATCH}
              </p>
            )}
          </Rise>
        )}

        {coverage.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Search coverage</SectionLabel>
            <div className="mt-3 space-y-2.5 border-t border-hairline pt-3">
              {coverage.map((line) => (
                <p key={line} className="text-[11px] leading-relaxed text-mist-dim">
                  {line}
                </p>
              ))}
            </div>
          </Rise>
        )}
      </Stagger>
    </div>
  );
}

/** The sentence a source says about its own limits, under that source's rows. */
function SourceNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{children}</p>;
}

/**
 * One row from a `src/search/` source.
 *
 * NO PHOTOGRAPHS, AND THAT IS DELIBERATE. `SearchHit.imageUrl` is populated by
 * two of the sources and is dropped here for two separate reasons. The trek
 * photographs are Wikimedia CC BY / CC BY-SA, and `treks/images.ts` says in as
 * many words that naming the author wherever the work appears is a licence
 * obligation rather than a courtesy — a 36 px thumbnail in a list of ten rows
 * has nowhere to put ten credits. And a person's avatar is a real face fetched
 * from the network on every keystroke's worth of results; `Avatar` draws their
 * initials with no request and no chance of a stranger's photograph arriving
 * late against the wrong name. Every other row on this screen is an icon tile,
 * so this is also what the screen already looks like.
 */
function HitRow({ hit }: { hit: SearchHit }) {
  return (
    <Row
      to={hit.to}
      icon={KIND_ICON[hit.kind]}
      leading={hit.kind === "person" ? <Avatar name={hit.title} size={36} /> : undefined}
      title={hit.title}
      detail={hit.subtitle}
      /* The row's own disclosure — "Placeholder group" — beside the title
         rather than in the detail line, because the detail line truncates and a
         disclosure an ellipsis can eat is not a disclosure.

         The `kind !== "person"` guard is kept though `toHit` no longer sets a
         person note: a badge on a person row would be a mark beside a real
         name, and `AthleteProfile`'s header explains at length why this feature
         puts no mark of any kind next to somebody's name. Nothing about an
         account is a badge ICEFALL has earned the right to print. */
      badge={
        hit.note && hit.kind !== "person" ? <Badge tone="neutral">{hit.note}</Badge> : undefined
      }
    />
  );
}

function Row({
  to,
  icon: Icon,
  title,
  detail,
  badge,
  leading,
}: {
  /**
   * Empty means this row opens nothing. No hit builder produces one any more —
   * people were the last, and they now open `/social/people/:id` — but the
   * empty case is still handled below rather than asserted away, because the
   * failure mode is silent: see the chevron comment.
   */
  to: string;
  icon: typeof Compass;
  title: string;
  detail?: string;
  /** A disclosure chip — Demo, Sample, Placeholder group. Rendered beside the
      title, never after the detail, so truncation can only ever eat the
      geography, not the disclosure. */
  badge?: React.ReactNode;
  /** Replaces the icon tile. Used for a person's initials. */
  leading?: React.ReactNode;
}) {
  const body = (
    <>
      {leading ?? (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-hairline text-azure/85">
          <Icon size={16} strokeWidth={1.6} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13.5px] text-snow">{title}</span>
          {badge}
        </span>
        {detail && (
          <span className="mt-0.5 block truncate tnum text-[11.5px] text-mist-dim">{detail}</span>
        )}
      </span>
      {/* The chevron is the promise that tapping goes somewhere. A row with no
          destination does not draw one, and is not a link at all: an empty `to`
          in a react-router `<Link>` resolves to the CURRENT url, so the tap
          would silently reload the search rather than doing nothing visibly. */}
      {to ? <ChevronRight size={16} className="shrink-0 text-mist-dim" /> : null}
    </>
  );

  if (!to) return <div className={cn("flex items-center gap-3.5 py-3")}>{body}</div>;

  return (
    <Link to={to} className={cn("flex items-center gap-3.5 py-3")}>
      {body}
    </Link>
  );
}
