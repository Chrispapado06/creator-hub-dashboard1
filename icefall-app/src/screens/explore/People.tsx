import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Compass,
  Globe,
  Loader2,
  MapPin,
  Mountain as MountainIcon,
  Search,
  Share2,
  UserPlus,
  Users,
} from "lucide-react";

import { Avatar, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { ProgressRing } from "@/components/ui/charts";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { QualifierBadge, UnavailableState, type DataQualifier } from "@/components/coach/DataState";
import { MountainThumb } from "@/components/domain/MountainImage";
import { PeopleFilterBar } from "@/components/network/PeopleFilterBar";
import { CompatibilityScore, WhyYouMatch } from "@/components/network/WhyYouMatch";
import { cn } from "@/lib/utils";
import { fmtCountdown, fmtDate, fmtElevation } from "@/lib/format";
import { isKnown, type Score } from "@/coach/types";
import {
  OBJECTIVE_READINESS_DISCLAIMER,
  assessObjectiveReadiness,
} from "@/coach/mountainReadiness";
import { DISCOVERABLE_ATHLETES } from "@/network/directory";
import { PEOPLE_SOURCE_NOTE, usePeopleSearch, type SearchHit } from "@/search/people";
import { matchScore, type MatchResult } from "@/network/matching";
import { LOCATION_NOTICE, approxDistanceLabel } from "@/network/privacy";
import {
  DEFAULT_RADIUS_KM,
  fmtKm,
  matchesFilters,
  nextRadiusKm,
  usePeopleFilters,
  type FilterDefaultsContext,
  type LocationFilter,
  type ObjectivePick,
  type PeopleFilters,
} from "@/network/peopleFilters";
import {
  EXPERIENCE_LABELS,
  LOCAL_ATHLETE_ID,
  LOOKING_FOR_LABELS,
  NETWORK_NOT_CONNECTED_NOTICE,
  experienceFromAppLevel,
  type AthleteProfile,
} from "@/network/types";
import { useApp, usePrimaryGoal } from "@/state/AppState";
import { useRecordedActivities } from "@/tracking/feed";
import { haversine } from "@/tracking/filters";

/**
 * PEOPLE — finding and following real ICEFALL climbers.
 *
 * THIS FILE ALSO EXPORTS `PeopleSection`, described below where it is declared.
 * The two used to share a screen — the default export you are reading now was
 * `PersonCard` over `allGuides()`, a guide-hiring search — and this header is
 * about why that changed on 2026-09-13.
 *
 * ── WHAT WAS HERE, AND WHY IT WAS THE WRONG THING ────────────────────────────
 *
 * `Social.tsx` puts this component behind a tab literally labelled "People",
 * reached from `/social?tab=people` — and the app's OWN global search already
 * describes that destination as "People and groups… partners, climbers,
 * friends" (`screens/Search.tsx`'s `PLACES` entry, unchanged by this edit).
 * What rendered there was a guide marketplace: a search box and cards for
 * professionals you might hire, linking to `/explore/guides/:id`. No follow, no
 * account, nobody's page. It also duplicated a screen that already exists and
 * is far more complete — `/explore/guides`, reachable from Explore's own Find /
 * Expeditions / Guides tab strip, with real filters, matching and an
 * availability calendar. Nothing about guide discovery is lost by this
 * component no longer being a second, thinner copy of it.
 *
 * ── WHAT IS HERE NOW, AND WHAT MAKES IT REAL ─────────────────────────────────
 *
 * `usePeopleSearch` (`@/search/people`) reads `public.profiles` — real accounts
 * real people made, under a policy that lets any signed-in climber read any
 * profile row. A hit routes to `/social/people/:id`, which is `AthleteProfile`:
 * a real server-backed page with a real Follow / Unfollow pill wired to
 * `social/follow.ts`, which writes and deletes rows in `public.follows`. Search,
 * follow, profile — the three pieces asked for — are three existing, tested
 * systems being connected to the one tab that was not yet pointing at them, not
 * three new ones.
 *
 * NOTHING IS FABRICATED TO FILL THIS SCREEN. There is no directory listing and
 * no "suggested people" shelf: `usePeopleSearch` answers a typed name or handle
 * only, never a browse-everyone query, which matches the stance the rest of
 * this codebase already takes — see `network/directory.ts` and
 * `20260902260000_public_follow_counts.sql`'s reasoning against turning a
 * follower count into a follower LIST. A real search a climber typed is a
 * different thing from ICEFALL handing out its whole membership, and this
 * screen only ever does the former.
 *
 * `DISCOVERABLE_ATHLETES` BELOW IS UNRELATED AND MUST STAY THAT WAY. It still
 * backs `PeopleSection`'s dead matching code, still empty, still governed by
 * the same rule `network/directory.ts` states in its own header. This file does
 * not blur the two: one is a live server search over real accounts, the other
 * is unmounted code over a constant that must never gain an entry.
 */

/* -------------------------------------------------------------------------- */
/* Location consent                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `idle` is the un-answered prompt. `declined` is the athlete choosing not to
 * share, which is a normal outcome and not an error — it is offered the place
 * filter instead, never asked twice in the same visit.
 */
type LocationState = "idle" | "asking" | "declined" | "denied" | "unavailable";

/* -------------------------------------------------------------------------- */
/* Ranking                                                                     */
/* -------------------------------------------------------------------------- */

interface RankedAthlete {
  athlete: AthleteProfile;
  match: MatchResult;
  /** Kilometres, used only to band and to filter. Never rendered as a figure. */
  distanceKm: number | null;
}

/**
 * Distance between two approximate areas.
 *
 * Both sides are already snapped to a ~5 km grid at the single write boundary
 * in `AppState`, and the result leaves this module only through
 * `approxDistanceLabel`, which bands it. Neither the number nor either
 * coordinate is ever rendered.
 */
function approxDistanceKm(me: AthleteProfile, them: AthleteProfile): number | null {
  const mine = me.approxLocation;
  const theirs = them.approxLocation;
  if (!mine || !theirs) return null;
  const km =
    haversine({ lat: mine.lat, lon: mine.lon }, { lat: theirs.lat, lon: theirs.lon }) / 1000;
  return Number.isFinite(km) ? km : null;
}

/** The radius NEAR YOU works to: whatever the filter is set to, or the default. */
const nearRadiusKm = (location: LocationFilter) =>
  location.kind === "near-me" ? location.km : DEFAULT_RADIUS_KM;

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* PEOPLE — real accounts, found by name or handle                             */
/* -------------------------------------------------------------------------- */

/** Said once, above the box, before anybody has typed a character. */
const SEARCH_INTRO =
  "Search by name or handle to find a real ICEFALL climber. These are accounts people made — ICEFALL has not verified anybody's identity, qualifications or experience.";

/**
 * PEOPLE.
 *
 * A search box over `usePeopleSearch`, and nothing else — no filter, because
 * the server search has none to offer (name and handle only, the same
 * restraint `network/directory.ts`'s `matchesAthlete` documents: a stranger
 * typing a mountain name should not get a list of who will be on it in March).
 * The five states `usePeopleSearch` can be in are five different sentences,
 * never one blank list standing in for all of them — see `search/people.ts`'s
 * own header for why that distinction is load-bearing here.
 *
 * ROWS ARE STILL BORDERLESS — a bordered card per row read as five outlines
 * competing with the names inside them the one other time this app tried it
 * (Notifications, 2026-09-06). What changed on 2026-09-15 is that a result is
 * no longer a single flat line: it is a small banner-style mini profile — a
 * real photo over a flat chrome strip, the same language `AthleteProfile.tsx`
 * uses for a full profile — plus name and `@handle · place`. Still no border
 * and no card fill; see `PersonResultCard` below for what changed and why.
 */
export default function People() {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const result = usePeopleSearch(query);

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-24 pt-1">
        {/* ---- Search -------------------------------------------------- */}
        <Rise className="relative">
          <Search
            size={16}
            strokeWidth={1.6}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people by name or handle"
            aria-label="Search people"
            className="h-12 w-full rounded-tile border border-hairline bg-elevated/40 pl-10 pr-4 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50 [&::-webkit-search-cancel-button]:hidden"
          />
        </Rise>

        {/* ---- What the box is for, before anybody has typed ------------ */}
        {trimmed.length === 0 && (
          <Rise className="pt-6">
            <p className="text-[13px] leading-relaxed text-mist">{SEARCH_INTRO}</p>
          </Rise>
        )}

        {/* ---- Typed something too short to have been sent -------------- */}
        {trimmed.length > 0 && result.state === "idle" && (
          <Rise className="pt-6">
            <p className="text-[13px] text-mist-dim">
              Keep typing — a couple more letters and ICEFALL will look.
            </p>
          </Rise>
        )}

        {/* ---- The request is in flight ---------------------------------- */}
        {result.state === "searching" && (
          <Rise className="flex items-center gap-2 pt-6">
            <Loader2 size={14} className="shrink-0 animate-spin text-mist-dim" />
            <p className="text-[13px] text-mist-dim">Searching ICEFALL accounts…</p>
          </Rise>
        )}

        {/* ---- Answered, and there is nothing to show: signed out, the
            request failed, or genuinely nobody by that name — `result.message`
            is already the sentence for whichever of those this is. */}
        {result.hits.length === 0 &&
          (result.state === "ready" ||
            result.state === "signed-out" ||
            result.state === "error") && (
            <Rise className="pt-6">
              <p className="text-[13px] leading-relaxed text-mist">{result.message}</p>
            </Rise>
          )}

        {/* ---- Real accounts ---------------------------------------------- */}
        {result.hits.map((hit) => (
          <Rise key={hit.id}>
            <PersonResultCard hit={hit} />
          </Rise>
        ))}
        {result.hits.length > 0 && (
          <Rise className="pt-2">
            <p className="text-[11px] leading-relaxed text-mist-dim">{PEOPLE_SOURCE_NOTE}</p>
          </Rise>
        )}
      </Stagger>
    </Screen>
  );
}

/**
 * One real account, found by handle or name. Opens `AthleteProfile` at
 * `hit.to` (already `/social/people/:id`, built by `search/people.ts`), where
 * Follow / Unfollow and Message are the real, server-backed controls — this
 * card is not where following happens, on purpose: a second tap target inside
 * a `Link` is a thumb hazard on a list, and `search/people.ts`'s own header
 * works through why a search result names WHO somebody is rather than acting
 * on them.
 *
 * A MINI PROFILE, NOT A PLAIN ROW — the owner's own request (2026-09-15
 * flight notes): looking somebody up should surface a small banner-style card
 * — a photo and a couple of real facts — rather than a bare initial.
 *
 *   · THE PHOTO IS REAL. `hit.imageUrl` is `profiles.avatar_url`, already
 *     returned by the same query `search/people.ts` runs for every hit — this
 *     is not an extra request, just a field that was being fetched and
 *     dropped. `Search.tsx`'s `HitRow` leaves it out deliberately (a face
 *     fetched on every keystroke of a browse list), but a name or handle
 *     someone actually typed and is now looking at is a narrower, more
 *     deliberate moment, and `Avatar`'s own `src` prop already exists for
 *     exactly this — drawn over the initials, which stay as the fallback if
 *     the image fails or nobody set one.
 *
 *   · THE BANNER IS FLAT CHROME, NOT A FABRICATED COVER. Copied in miniature
 *     from `AthleteProfile.tsx`'s own `CoverBand`: `public.profiles` has no
 *     cover-photo column, so the strip behind the avatar is the app's own
 *     surface colour, identical on every card, and claims nothing about
 *     anybody. The avatar overlaps its foot exactly as it does on the full
 *     profile page — the same visual language, at list scale.
 *
 *   · THE FACTS ARE ONLY WHAT `search/people.ts` ACTUALLY RETURNS: name,
 *     handle, place. "Mountains climbed" and "mutual connections" were in the
 *     original note but are LEFT OUT ON PURPOSE — neither is real data this
 *     card could show honestly. `social/publicProfile.ts` documents both
 *     findings at length: there is no summit table anywhere in the schema (a
 *     climber's own posts carry no elevation, so a summit count can only be
 *     read out of typed prose, which the app's whole safety stance refuses),
 *     and "connections" are cards kept in ANOTHER person's local storage —
 *     nothing server-side ever sees them, for anybody but the account's own
 *     owner. Printing either here would be exactly the invented fact the
 *     owner's own instruction says to omit rather than fake.
 */
function PersonResultCard({ hit }: { hit: SearchHit }) {
  return (
    <Link to={hit.to} className="block overflow-hidden rounded-tile">
      <div className="h-9 bg-elevated/70" />
      <div className="flex items-end gap-3 px-0.5 pb-3">
        <Avatar
          name={hit.title}
          src={hit.imageUrl}
          size={52}
          className="-mt-6 shrink-0 border-[3px] border-obsidian"
        />
        <div className="min-w-0 flex-1 pb-0.5">
          <p className="truncate text-[15px] text-snow">{hit.title}</p>
          {hit.subtitle && (
            <p className="mt-0.5 truncate text-[12px] text-mist-dim">{hit.subtitle}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* The athlete-matching section, kept                                          */
/* -------------------------------------------------------------------------- */

/**
 * FELLOW CLIMBERS, MATCHED ON THE OBJECTIVE — not part of the owner's mockup.
 *
 * This is the body the previous session built when People and Groups were one
 * page (BACKLOG PH-08, now superseded). It is a different question from the
 * mockup's: that one asks "who can I hire", this asks "who else is going".
 *
 * NOTHING RENDERS IT TODAY. It is left exported rather than deleted because it
 * is a thousand lines of working objective matching, location banding and
 * readiness comparison, and throwing that away is the owner's call, not a side
 * effect of a redesign. If they say it is gone, delete the whole section — do
 * not leave it here indefinitely as scenery.
 */
export function PeopleSection() {
  const {
    user,
    coachProfile,
    objectives,
    myProfile,
    locationOptIn,
    setLocationOptIn,
    updateMyProfile,
    blockedIds,
  } = useApp();
  const goal = usePrimaryGoal();
  const activities = useRecordedActivities();

  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [invite, setInvite] = useState<"idle" | "copied" | "unavailable">("idle");

  /* ---- Your objective ---------------------------------------------------- */

  // Simulated recordings exist so the tracker can be reviewed indoors. They are
  // never training the athlete did, so they never reach a readiness figure.
  const realActivities = useMemo(() => activities.filter((a) => !a.simulated), [activities]);

  const summitsLogged = useMemo(
    () =>
      objectives.flatMap((o) =>
        o.summitedAt ? [{ name: o.name, elevationM: o.elevationM, date: o.summitedAt }] : [],
      ),
    [objectives],
  );

  const peak = useMemo(() => {
    if (!goal || typeof goal.elevationM !== "number" || !Number.isFinite(goal.elevationM)) {
      return null;
    }
    return { name: goal.name, elevationM: goal.elevationM, lat: goal.lat, lon: goal.lon };
  }, [goal]);

  const readiness = useMemo(() => {
    if (!peak) return null;
    return assessObjectiveReadiness({
      peak,
      activities: realActivities,
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
  }, [peak, realActivities, summitsLogged, coachProfile]);

  /**
   * Provenance of the figure in the ring, decided conservatively.
   *
   * If ICEFALL has observed nothing, or the engine flagged any dimension as the
   * athlete's own account, the number is self-reported. Otherwise it is derived
   * from recorded sessions — which is still an estimate, never a measurement.
   * Both cases are labelled; a readiness figure never appears bare.
   */
  const readinessQualifier: DataQualifier | null =
    readiness === null
      ? null
      : realActivities.length === 0 ||
          readiness.dimensions.some((d) => d.provenance === "self-reported")
        ? "self-reported"
        : "estimated";

  /* ---- Filters ----------------------------------------------------------- */

  /**
   * The pick GOING TO defaults to.
   *
   * Built from the goal itself rather than from `peak`, which requires a known
   * elevation: a mountain whose height ICEFALL never resolved is still the
   * mountain this athlete is training for, and the filter compares by name and
   * coordinate. Nothing is invented to fill the elevation.
   */
  const goalPick = useMemo<ObjectivePick | null>(() => {
    if (!goal) return null;
    return {
      name: goal.name,
      elevationM:
        typeof goal.elevationM === "number" && Number.isFinite(goal.elevationM)
          ? goal.elevationM
          : undefined,
      lat: goal.lat,
      lon: goal.lon,
    };
  }, [goal]);

  const filterContext = useMemo<FilterDefaultsContext>(
    () => ({ peak: goalPick, targetDate: goal?.targetDate }),
    [goalPick, goal?.targetDate],
  );

  // Held outside this component so they survive navigation — see
  // `@/network/peopleFilters`. Untouched fields keep following the active goal.
  const { filters, touched, setObjective, setDate, setLocation, setLookingFor, reset } =
    usePeopleFilters(filterContext);

  /* ---- You, as the network would see you --------------------------------- */

  /**
   * Built for comparison only — held in memory, never written back.
   *
   * The athlete's active goal fills the objective when they have not written a
   * separate network profile, so the screen can rank on the mountain they are
   * actually training for. Nothing is invented: every field either comes from
   * something they entered or is left undefined, and the engine drops undefined
   * factors rather than scoring them as zero.
   */
  const me = useMemo<AthleteProfile>(() => {
    const base: AthleteProfile = myProfile ?? {
      id: LOCAL_ATHLETE_ID,
      displayName: user.name,
      previousObjectives: [],
      lookingFor: [],
      verified: false,
    };

    return {
      ...base,
      objective:
        base.objective ??
        (goal && peak
          ? {
              peakName: peak.name,
              elevationM: peak.elevationM,
              targetDate: goal.targetDate,
              lat: peak.lat,
              lon: peak.lon,
            }
          : undefined),
      experience: base.experience ?? experienceFromAppLevel(user.experience),
      readiness: base.readiness ?? readiness?.overall,
      verified: false,
    };
  }, [myProfile, user.name, user.experience, goal, peak, readiness]);

  /* ---- The list ---------------------------------------------------------- */

  const ranked = useMemo<RankedAthlete[]>(
    () =>
      DISCOVERABLE_ATHLETES
        // Blocking has to hold at the point of display too, not only where a
        // message is written. Someone blocked must not reappear in a list.
        .filter((athlete) => !blockedIds.includes(athlete.id))
        .map((athlete) => ({
          athlete,
          match: matchScore(me, athlete),
          distanceKm: approxDistanceKm(me, athlete),
        }))
        // Ordered by how well two plans line up. Never by activity, popularity
        // or anything about the person.
        .sort((a, b) => b.match.score - a.match.score),
    [me, blockedIds],
  );

  const visible = useMemo(
    () =>
      ranked.filter((entry) =>
        matchesFilters(entry.athlete, filters, entry.distanceKm, locationOptIn),
      ),
    [ranked, filters, locationOptIn],
  );

  const nearYou = useMemo(() => {
    if (!locationOptIn) return [];
    const km = nearRadiusKm(filters.location);
    return visible.filter((e) => e.distanceKm !== null && e.distanceKm <= km);
  }, [visible, locationOptIn, filters.location]);

  /* ---- Actions ----------------------------------------------------------- */

  /** The objective button on YOUR OBJECTIVE — sets GOING TO to that mountain. */
  const findSameObjective = useCallback(() => {
    if (!goalPick) return;
    setObjective({ kind: "peak", peak: goalPick });
  }, [goalPick, setObjective]);

  const filteredToGoal =
    goalPick !== null &&
    filters.objective.kind === "peak" &&
    filters.objective.peak.name === goalPick.name;

  /**
   * Reads the device position ONCE, and only after the athlete has tapped
   * Enable — the browser is never asked before consent. No filter, and nothing
   * else on this screen, can reach this function without that tap.
   *
   * Order matters: `setLocationOptIn(true)` is queued before `updateMyProfile`,
   * and both are updaters against the same store, so the profile write sees the
   * opt-in as true. `updateMyProfile` refuses to store an area otherwise, and
   * coarsens whatever it does store to a ~5 km grid. This function never keeps
   * the raw coordinates.
   */
  const enableLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationState("unavailable");
      return;
    }
    setLocationState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationOptIn(true);
        updateMyProfile({
          approxLocation: {
            // ICEFALL does no reverse geocoding, so it cannot name where
            // somebody is — and a place they typed into a FILTER is where they
            // are looking, not where they live. An honest placeholder beats
            // either guess; the athlete names their own area on their profile.
            label: "Approximate area",
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          },
        });
        setLocationState("idle");
      },
      (err) => {
        setLocationState(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      // Low accuracy on purpose: the answer is rounded to 5 km either way, so
      // asking the device for a precise fix would collect what we then destroy.
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 },
    );
  }, [setLocationOptIn, updateMyProfile]);

  const disableLocation = useCallback(() => {
    // Off deletes the stored area rather than hiding it — see `setLocationOptIn`.
    setLocationOptIn(false);
    setLocationState("declined");
    // A "near me" search cannot stand without an area, and leaving it selected
    // would show a radius the app has nothing to measure from.
    if (filters.location.kind === "near-me") setLocation({ kind: "anywhere" });
  }, [setLocationOptIn, filters.location.kind, setLocation]);

  /** One rung up the radius ladder, then out to anywhere at the top. */
  const expandSearch = useCallback(() => {
    if (filters.location.kind !== "near-me") return;
    const next = nextRadiusKm(filters.location.km);
    setLocation(next === null ? { kind: "anywhere" } : { kind: "near-me", km: next });
  }, [filters.location, setLocation]);

  const searchAnywhere = useCallback(() => setLocation({ kind: "anywhere" }), [setLocation]);

  /**
   * Sharing ICEFALL itself, which is the one thing on this screen that really
   * does leave the device. It invites someone to the app, not to a network:
   * until there is a backend they will not appear here, and the caption says so.
   */
  const inviteFriends = useCallback(async () => {
    const url = typeof window === "undefined" ? "" : window.location.origin;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "ICEFALL",
          text: "Train for the Mountain.",
          url,
        });
        return;
      } catch {
        // Dismissed, or the sheet refused. Fall through to the clipboard so the
        // action still does something rather than failing quietly.
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard && url.length > 0) {
      try {
        await navigator.clipboard.writeText(url);
        setInvite("copied");
        return;
      } catch {
        // Clipboard refused (permissions, insecure context). Say so below.
      }
    }

    setInvite("unavailable");
  }, []);

  /* ---- Render ------------------------------------------------------------ */

  /**
   * The consent card is shown until the question has been answered — by the
   * athlete declining, by the browser refusing, or by a position arriving.
   *
   * A refusal is NOT re-prompted. Asking again after "no" is how a permission
   * dialogue becomes a nag, and the place filter is the honest alternative on
   * offer, so the failure text travels with it rather than sitting above a
   * button the athlete has already declined once.
   */
  const showLocationPrompt =
    !locationOptIn && (locationState === "idle" || locationState === "asking");

  const locationFailure =
    locationState === "denied"
      ? "Your browser refused the location request, so it stays off. Nothing about where you are was read."
      : locationState === "unavailable"
        ? "No position was available, so location stays off. Nothing about where you are was read."
        : null;

  return (
    <>
      {/* The first thing this half says, before any list, any filter and any
          control that reads like it sends something. It stays here rather than
          moving to the top of the merged page because it is true of THIS half
          only: the mountains above can be live, and a single notice covering
          both would either overclaim there or underclaim here. */}
      <Rise className="mt-3">
        <NotConnectedCard />
      </Rise>

      {/* ---- Your objective --------------------------------------------- */}
      <Rise className="mt-6">
        <SectionLabel>Your objective</SectionLabel>
      </Rise>
      <Rise className="mt-3">
        {goal && peak ? (
          <YourObjective
            name={peak.name}
            elevationM={peak.elevationM}
            lat={peak.lat}
            lon={peak.lon}
            photo={goal.photo}
            wikipedia={goal.wikipedia}
            targetDate={goal.targetDate}
            readiness={readiness?.overall ?? null}
            qualifier={readinessQualifier}
            onFindClimbers={findSameObjective}
            finding={filteredToGoal}
          />
        ) : (
          <NoObjective />
        )}
      </Rise>

      {readiness && (
        <Rise className="mt-3">
          <Disclaimer>{OBJECTIVE_READINESS_DISCLAIMER}</Disclaimer>
        </Rise>
      )}

      {/* ---- Location --------------------------------------------------- */}
      <Rise className="mt-7">
        <SectionLabel>Location</SectionLabel>
      </Rise>
      <Rise className="mt-3">
        {showLocationPrompt ? (
          <LocationOptIn
            state={locationState}
            onEnable={enableLocation}
            onDecline={() => setLocationState("declined")}
          />
        ) : (
          <LocationSettled
            on={locationOptIn}
            areaLabel={me.approxLocation?.label ?? null}
            failure={locationFailure}
            onEnable={enableLocation}
            onDisable={disableLocation}
            enabling={locationState === "asking"}
          />
        )}
      </Rise>

      {/* ---- Filters ---------------------------------------------------- */}
      <Rise className="mt-7">
        <SectionLabel>Filters</SectionLabel>
      </Rise>
      <Rise className="mt-3">
        <PeopleFilterBar
          filters={filters}
          touched={touched}
          locationOptIn={locationOptIn}
          goalPeak={goalPick}
          onObjective={setObjective}
          onDate={setDate}
          onLocation={setLocation}
          onLookingFor={setLookingFor}
          onReset={reset}
        />
      </Rise>

      {/* ---- Best matches ----------------------------------------------- */}
      <Rise className="mt-6">
        <SectionLabel>Best matches</SectionLabel>
      </Rise>
      {visible.length > 0 ? (
        <div className="mt-3 space-y-3">
          {visible.map((entry) => (
            <AthleteCard
              key={entry.athlete.id}
              athlete={entry.athlete}
              match={entry.match}
              distanceKm={entry.distanceKm}
            />
          ))}
        </div>
      ) : (
        <Rise className="mt-3">
          <MountainWaiting
            filters={filters}
            locationOn={locationOptIn}
            canExpand={
              filters.location.kind === "near-me" && nextRadiusKm(filters.location.km) !== null
            }
            invite={invite}
            onExpand={expandSearch}
            onAnywhere={searchAnywhere}
            onInvite={() => void inviteFriends()}
          />
        </Rise>
      )}

      {/* ---- Near you --------------------------------------------------- */}
      <Rise className="mt-7">
        <SectionLabel>Near you</SectionLabel>
      </Rise>
      {nearYou.length > 0 ? (
        <div className="mt-3 space-y-3">
          {nearYou.map((entry) => (
            <AthleteCard
              key={entry.athlete.id}
              athlete={entry.athlete}
              match={entry.match}
              distanceKm={entry.distanceKm}
            />
          ))}
        </div>
      ) : (
        <Rise className="mt-3">
          <NearYouEmpty locationOn={locationOptIn} km={nearRadiusKm(filters.location)} />
        </Rise>
      )}

      {/* The safety reminder is NOT here. Both halves used to carry their own
          copy, and on one page that reads as boilerplate the eye skips. The
          merged page draws it once, last, where it applies to everything above
          it — meeting a stranger from a mountain's list and meeting one from a
          match are the same evening out. See `./Groups`. */}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Not connected                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The standing statement of what this feature can and cannot do.
 *
 * Uses `NETWORK_NOT_CONNECTED_NOTICE` verbatim. A softer paraphrase written
 * fresh for this screen is exactly how "not connected" turns into "sending…".
 */
function NotConnectedCard() {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <Users size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
        <div className="min-w-0">
          <p className="text-[13px] text-snow">The network is not connected</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
            {NETWORK_NOT_CONNECTED_NOTICE}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Your objective                                                              */
/* -------------------------------------------------------------------------- */

function YourObjective({
  name,
  elevationM,
  lat,
  lon,
  photo,
  wikipedia,
  targetDate,
  readiness,
  qualifier,
  onFindClimbers,
  finding,
}: {
  name: string;
  elevationM: number;
  lat?: number;
  lon?: number;
  photo?: string;
  wikipedia?: string;
  targetDate: string;
  /**
   * The composite from `assessObjectiveReadiness`, or null when the objective
   * carries no elevation to assess against. A `Score` rather than a number, so
   * the absence arrives with its reason instead of collapsing to a zero.
   */
  readiness: Score | null;
  qualifier: DataQualifier | null;
  onFindClimbers: () => void;
  finding: boolean;
}) {
  const value = readiness && isKnown(readiness) ? readiness.value : null;

  return (
    <Card>
      <div className="flex items-start gap-3.5">
        <MountainThumb peak={{ name, elevationM, lat, lon, photo, wikipedia }} size={52} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-light text-snow">{name}</p>
          <p className="tnum mt-1 text-[12px] text-mist">
            {fmtElevation(elevationM)} m · {fmtDate(targetDate)}
          </p>
          <p className="tnum mt-0.5 text-[11px] text-mist-dim">{fmtCountdown(targetDate)}</p>
        </div>

        {value !== null ? (
          <div className="shrink-0 text-center">
            <ProgressRing value={value} size={54} stroke={2.5}>
              <span className="tnum text-[15px] font-light text-snow">{value}</span>
            </ProgressRing>
            <p className="section-label mt-2 text-[9px]">Readiness</p>
          </div>
        ) : (
          // Never a zero: "not assessed" and "assessed at nothing" would lead an
          // athlete to opposite decisions about the same mountain.
          <UnavailableState
            reason={readiness?.reason ?? "no-data"}
            size="sm"
            className="shrink-0"
          />
        )}
      </div>

      {/* The number never appears bare. Whether it came from recorded sessions
          or from the athlete's own account, it is an estimate rather than a
          measurement, and it says so on the same line it is drawn. */}
      {qualifier && value !== null && (
        <div className="mt-3.5 flex items-center gap-2">
          <QualifierBadge kind={qualifier} />
          <span className="text-[11px] text-mist-dim">
            Not a measurement, and not a clearance to climb.
          </span>
        </div>
      )}

      <Button className="mt-4 w-full" onClick={onFindClimbers} disabled={finding}>
        {finding ? (
          <>
            <Search size={15} strokeWidth={1.8} /> Filtered to {name}
          </>
        ) : (
          <>Find {name} climbers</>
        )}
      </Button>
    </Card>
  );
}

/** No active goal — the network has nothing to organise itself around. */
function NoObjective() {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <MountainIcon size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
        <div className="min-w-0">
          <p className="text-[14px] text-snow">What are you climbing?</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
            This network is organised around mountains rather than people. Name the objective you
            are training for and everything here — matches, dates, distance — has something to line
            up against.
          </p>
        </div>
      </div>
      <Button asChild variant="secondary" className="mt-4 w-full">
        <Link to="/readiness-test">
          Set your objective <ArrowRight size={15} strokeWidth={1.8} />
        </Link>
      </Button>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Location                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The consent gate. Shown BEFORE anything location-based, and the device is
 * never asked for a position until Enable is tapped.
 */
function LocationOptIn({
  state,
  onEnable,
  onDecline,
}: {
  /** Only `idle` or `asking` reach here — a refusal moves to the settled card. */
  state: LocationState;
  onEnable: () => void;
  onDecline: () => void;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <MapPin size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
        <div className="min-w-0">
          <p className="text-[14px] text-snow">Find mountaineers near you</p>
          {/* The notice describes what the code actually does, so it is quoted
              from `@/network/privacy` rather than rewritten here. */}
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{LOCATION_NOTICE}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2.5">
        <Button className="flex-1" onClick={onEnable} disabled={state === "asking"}>
          {state === "asking" ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Finding you…
            </>
          ) : (
            "Enable location"
          )}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onDecline}>
          Not now
        </Button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
        Off is the default and nothing is lost by leaving it that way — there is nobody to find
        either way until the network is connected.
      </p>
    </Card>
  );
}

/**
 * After the question has been answered, either way.
 *
 * When location is off this points at the place filter, so declining leads
 * somewhere rather than into a dead end. The place is typed once, in the filter
 * bar, rather than in two boxes that could disagree with each other.
 */
function LocationSettled({
  on,
  areaLabel,
  failure,
  onEnable,
  onDisable,
  enabling,
}: {
  on: boolean;
  areaLabel: string | null;
  /** Why the position could not be read, when that is how location ended up off. */
  failure: string | null;
  onEnable: () => void;
  onDisable: () => void;
  enabling: boolean;
}) {
  if (on) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <MapPin size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] text-snow">Location is on</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
              {areaLabel
                ? `Your area is stored as “${areaLabel}”, rounded to a 5 km grid. Nobody sees a coordinate, and distance is only ever shown as a wide band.`
                : "No area is stored yet. Nothing is sent anywhere in any case — the network is not connected."}
            </p>
          </div>
        </div>
        <Button variant="secondary" className="mt-4 w-full" onClick={onDisable}>
          Turn location off and delete the stored area
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Compass size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] text-snow">Location is off</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
            {failure ??
              "Nothing about where you are is read or stored. Name a country or city under Location in the filters instead — “Near me” stays unavailable until you turn location on."}
          </p>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="mt-3.5 w-full"
        onClick={onEnable}
        disabled={enabling}
      >
        {enabling ? (
          <>
            <Loader2 size={14} className="animate-spin" /> Finding you…
          </>
        ) : (
          "Use my location instead"
        )}
      </Button>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty states                                                                */
/* -------------------------------------------------------------------------- */

/** Where the athlete has told the filters to look, in words. */
function whereLabel(filters: PeopleFilters): string {
  switch (filters.location.kind) {
    case "near-me":
      return "near you";
    case "anywhere":
      return "anywhere in the world";
    case "country":
    case "city": {
      const place = filters.location.place.trim();
      return place.length > 0 ? `in ${place}` : "anywhere in the world";
    }
  }
}

/**
 * The screen almost everybody sees.
 *
 * It has one job beyond looking like the rest of ICEFALL: it must not read as a
 * search that came back empty. "No climbers found near you" alone would tell
 * the athlete something false — that ICEFALL looked. It did not, because there
 * is nothing to look at, and the difference matters to someone deciding whether
 * to keep waiting for a partner.
 *
 * The same goes for the filters. An empty list under a filter invites the
 * reading that the filter is too narrow, so the copy says the count would be
 * zero with every filter cleared as well.
 */
function MountainWaiting({
  filters,
  locationOn,
  canExpand,
  invite,
  onExpand,
  onAnywhere,
  onInvite,
}: {
  filters: PeopleFilters;
  locationOn: boolean;
  canExpand: boolean;
  invite: "idle" | "copied" | "unavailable";
  onExpand: () => void;
  onAnywhere: () => void;
  onInvite: () => void;
}) {
  // Narrowed once: the radius only exists in the "near me" branch, and reading
  // it through a ternary at each use is how a 0 km search ends up on screen.
  const radiusKm = filters.location.kind === "near-me" ? filters.location.km : null;

  return (
    <Card className="px-5 py-7">
      <div className="text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-dashed border-hairline-strong text-mist-dim"
        >
          <MountainIcon size={20} strokeWidth={1.4} />
        </span>

        <h3 className="display mt-5 text-[26px] text-snow">Your mountain is waiting.</h3>

        <p className="mx-auto mt-3 max-w-[36ch] text-[12px] leading-relaxed text-mist">
          We could not find climbers {whereLabel(filters)} yet — and not because a search came back
          empty. No search ran. {NETWORK_NOT_CONNECTED_NOTICE}
        </p>

        <p className="mx-auto mt-3 max-w-[36ch] text-[12px] leading-relaxed text-mist-dim">
          Clearing every filter would show the same nobody. The lists are built and waiting, and the
          day the network is connected they fill in.
        </p>
      </div>

      <div className="mt-6 space-y-2.5">
        <EmptyAction
          icon={<Search size={15} strokeWidth={1.6} />}
          label={
            radiusKm !== null && !canExpand ? `Radius set to ${fmtKm(radiusKm)}` : "Expand search"
          }
          detail={
            !locationOn
              ? "Turn location on to widen a radius around you."
              : radiusKm !== null
                ? `Currently ${fmtKm(radiusKm)}.`
                : "Set Location to “Near me” in the filters to widen a radius."
          }
          onClick={onExpand}
          disabled={!canExpand || !locationOn || radiusKm === null}
        />
        <EmptyAction
          icon={<Globe size={15} strokeWidth={1.6} />}
          label="Search anywhere"
          detail="Drop the location filter entirely."
          onClick={onAnywhere}
          disabled={filters.location.kind === "anywhere"}
        />
        <EmptyAction
          icon={<Users size={15} strokeWidth={1.6} />}
          label="Create a group"
          detail="Start one on ICEFALL, for other people to join."
          to="/social/groups/new"
        />
        <EmptyAction
          icon={
            invite === "copied" ? (
              <Share2 size={15} strokeWidth={1.6} />
            ) : (
              <UserPlus size={15} strokeWidth={1.6} />
            )
          }
          label={invite === "copied" ? "Link copied" : "Invite friends"}
          detail={
            invite === "copied"
              ? "They can use ICEFALL, but they will not appear here until the network is connected."
              : invite === "unavailable"
                ? "This browser would not share or copy. The address bar has the link."
                : "Share ICEFALL itself. This is the one thing here that really does leave the device."
          }
          onClick={onInvite}
        />
      </div>

      {/* The widening controls change what WOULD be looked for. Letting them
          look like they run a search is the same lie as an invented profile,
          just quieter. */}
      <p className="mt-5 text-center text-[11px] leading-relaxed text-mist-dim">
        Expanding the search changes what ICEFALL would look for. It does not make a search happen —
        there is nothing connected to search.
      </p>
    </Card>
  );
}

/** One row in the empty state. A link when it navigates, a button when it acts. */
function EmptyAction({
  icon,
  label,
  detail,
  onClick,
  to,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  onClick?: () => void;
  to?: string;
  disabled?: boolean;
}) {
  const body = (
    <>
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-hairline bg-white/[0.02]",
          disabled ? "text-mist-dim/60" : "text-mist",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className={cn("block text-[13px]", disabled ? "text-mist" : "text-snow")}>
          {label}
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-mist-dim">{detail}</span>
      </span>
    </>
  );

  const shell =
    "flex w-full items-center gap-3 rounded-tile border border-hairline bg-white/[0.015] p-2.5 text-left transition-colors";

  if (to) {
    return (
      <Link to={to} className={cn(shell, "hover:border-hairline-strong")}>
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(shell, disabled ? "opacity-50" : "hover:border-hairline-strong")}
    >
      {body}
    </button>
  );
}

/** The compact state under NEAR YOU. Two different absences, two sentences. */
function NearYouEmpty({ locationOn, km }: { locationOn: boolean; km: number }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <MapPin size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
        <p className="text-[12px] leading-relaxed text-mist">
          {locationOn
            ? `Nobody within ${fmtKm(km)}. Nothing is being searched: the network is not connected, so there is no directory to look in and no one who could see you.`
            : "Location is off, so ICEFALL is not looking around you. It would find nobody either way — the network is not connected."}
        </p>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* AthleteCard                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One person in a list.
 *
 * Written in full and rendered over an empty array, so the day a backend exists
 * the list is ready. Every rule this feature has shows up as something this
 * component does or refuses to do:
 *
 *   - NO VERIFICATION. `athlete.verified` is never read. There is no tick, no
 *     badge and no "verified" label, because ICEFALL has checked nobody and a
 *     tick would say otherwise.
 *   - NO EXACT LOCATION. Distance is banded through `approxDistanceLabel` and
 *     the underlying number is never drawn beside it — one precise figure would
 *     undo the banding everywhere.
 *   - READINESS IS NOT A MEASUREMENT. It is shown with a qualifier and a line
 *     saying it is self-reported or derived, never observed by ICEFALL.
 *   - THE SCORE IS A COMPARISON OF PROFILES. It is captioned as such and its
 *     working is shown factor by factor, including the factors that could not
 *     be compared at all. It is never a safety judgement, and when nothing
 *     could be compared no number is drawn.
 *   - PREVIOUS OBJECTIVES ARE FREE TEXT. Quoted as written, never parsed into a
 *     score and never presented as a record ICEFALL can vouch for.
 *   - NOTHING IS SENT. Connect leads to a message that is queued on this device
 *     and goes nowhere, and the card says so under the button rather than
 *     leaving the athlete to find out.
 *
 * Deliberately absent: followers, kudos, activity counts, "last seen", and any
 * ranking of the person. The headline describes how two plans line up.
 */
export function AthleteCard({
  athlete,
  match,
  distanceKm,
}: {
  athlete: AthleteProfile;
  /** How the two plans line up, or null when there is nothing to compare to. */
  match: MatchResult | null;
  /** Null when either side is not sharing an area. Never rendered as a number. */
  distanceKm: number | null;
}) {
  const name = athlete.displayName.trim().length > 0 ? athlete.displayName : "Unnamed athlete";
  const readiness = athlete.readiness;

  return (
    <Card>
      {/* ---- Who ---------------------------------------------------------- */}
      <div className="flex items-start gap-3">
        <Avatar name={name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-snow">{name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-mist-dim">
            <MapPin size={11} strokeWidth={1.6} aria-hidden="true" />
            {/* Banded, always. A precise distance is a position fix. */}
            {distanceKm === null ? "Area not shared" : approxDistanceLabel(distanceKm)}
          </p>
        </div>
        {/* The number and the sentence that says what it is, as one unit. */}
        {match && <CompatibilityScore match={match} className="shrink-0" />}
      </div>

      {/* ---- The mountain ------------------------------------------------- */}
      <div className="mt-4 rounded-tile border border-hairline bg-white/[0.015] p-3">
        {athlete.objective ? (
          <div className="flex items-start gap-3">
            <MountainThumb
              peak={{
                name: athlete.objective.peakName,
                elevationM: athlete.objective.elevationM,
                lat: athlete.objective.lat,
                lon: athlete.objective.lon,
              }}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <p className="section-label">Objective</p>
              <p className="mt-1.5 truncate text-[14px] text-snow">{athlete.objective.peakName}</p>
              <p className="tnum mt-0.5 text-[11px] text-mist-dim">
                {fmtElevation(athlete.objective.elevationM)} m ·{" "}
                {fmtDate(athlete.objective.targetDate)}
              </p>
            </div>

            {readiness && isKnown(readiness) ? (
              <div className="shrink-0 text-center">
                <ProgressRing value={readiness.value} size={40} stroke={2.5}>
                  <span className="tnum text-[11px] font-light text-snow">{readiness.value}</span>
                </ProgressRing>
                <p className="section-label mt-1.5 text-[9px]">Readiness</p>
              </div>
            ) : (
              <UnavailableState
                reason={readiness?.reason ?? "not-reported"}
                size="sm"
                className="shrink-0"
              />
            )}
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed text-mist-dim">
            No objective named. There is no mountain to compare yours against.
          </p>
        )}

        {readiness && isKnown(readiness) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <QualifierBadge kind="self-reported" />
            <span className="text-[11px] leading-relaxed text-mist-dim">
              Self-reported or derived from their own training. ICEFALL does not measure it and does
              not check anyone's ability.
            </span>
          </div>
        )}
      </div>

      {/* ---- Why the number is what it is --------------------------------- */}
      {match && <WhyYouMatch match={match} className="mt-4" />}

      {/* ---- What they say about themselves -------------------------------- */}
      {athlete.experience && (
        <div className="mt-4 flex items-baseline justify-between gap-4">
          <span className="section-label">Experience</span>
          <span className="text-right text-[12px] text-snow">
            {EXPERIENCE_LABELS[athlete.experience]}
            <span className="ml-1.5 text-[11px] text-mist-dim">self-declared</span>
          </span>
        </div>
      )}

      {athlete.previousObjectives.length > 0 && (
        <div className="mt-3.5">
          <p className="section-label">Previously</p>
          <ul className="mt-2 space-y-1">
            {athlete.previousObjectives.map((objective) => (
              <li key={objective} className="text-[12px] leading-relaxed text-mist">
                {objective}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
            In their own words. Nothing here has been checked — ask them directly what they climbed
            and who they climbed it with.
          </p>
        </div>
      )}

      {athlete.lookingFor.length > 0 && (
        <div className="mt-3.5">
          <p className="section-label">Looking for</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {athlete.lookingFor.map((l) => (
              <span
                key={l}
                className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-mist"
              >
                {LOOKING_FOR_LABELS[l]}
              </span>
            ))}
          </div>
        </div>
      )}

      {athlete.availability && athlete.availability.length > 0 && (
        <div className="mt-3.5 flex items-baseline justify-between gap-4">
          <span className="section-label">Free</span>
          {/* The athlete's own words and casing — lower-casing free text turns
              "June to August" into something they did not write. */}
          <span className="text-right text-[12px] text-mist">
            {athlete.availability.join(" · ")}
          </span>
        </div>
      )}

      {/* ---- Actions ------------------------------------------------------- */}
      <div className="mt-4 flex gap-2.5">
        <Button asChild variant="secondary" size="sm" className="flex-1">
          <Link to={`/social/people/${encodeURIComponent(athlete.id)}`}>View profile</Link>
        </Button>
        <Button asChild size="sm" className="flex-1">
          <Link to={`/social/people/${encodeURIComponent(athlete.id)}/connect`}>Connect</Link>
        </Button>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
        Connecting writes a message that is saved on this device. It is not sent, nobody is
        notified, and no reply can arrive until the network is connected.
      </p>
    </Card>
  );
}
