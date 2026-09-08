import { useCallback, useState } from "react";

/**
 * THE PAGE GUIDES — what each main screen says about itself, once.
 *
 * The owner, 2026-09-08: "so like if you click on explore and its first time
 * its like a mini tour with details". So the introduction is PER SCREEN and on
 * FIRST VISIT — not one list of everything on Home, which is the shape nobody
 * reads.
 *
 * IT IS NOT A MODAL, and that is not a detail. The standing rule in this
 * codebase is no popups; a dialog that dims the app on first open is exactly
 * the thing that rule forbids. `PageTour` renders in the page's own scroll
 * flow, above the screen's content and beneath its title, and the screen stays
 * usable underneath it the whole time. Stepping happens in place.
 *
 * ------------------------------------------------------------------------
 * THE RULE THAT WROTE THE COPY
 * ------------------------------------------------------------------------
 *
 * A tour is the easiest place in any app to promise something that does not
 * work. An audit of this app on 2026-09-06 found a great deal of it dark: the
 * Community feed never reads the posts table back, the Guides list is
 * permanently empty, the leaderboard has nobody to rank, nothing an operator
 * publishes reaches the app. Telling a newcomer on their first day that
 * "Social is where you see other climbers' ascents" would teach them, in one
 * sentence, that the app is broken.
 *
 * SO: EVERY SENTENCE HERE DESCRIBES SOMETHING THAT HAPPENS IN A PRODUCTION
 * BUILD — no `import.meta.env.DEV` seed, no demo flag, signed in, real server.
 * Each one was checked against the code it describes, and the check is written
 * beside it. If a capability here is ever removed or gated, its sentence has to
 * go with it in the same change.
 *
 * ------------------------------------------------------------------------
 * AND THE SECOND RULE, WHICH THE FIRST DRAFT FAILED
 * ------------------------------------------------------------------------
 *
 * TRUE OF THE APP IS NOT ENOUGH. A guide is only ever read by somebody who has
 * NOTHING — no activities, no objective, no follows, no saved trails — because
 * it is shown once, on the first visit, and that is who is looking. So a
 * sentence also has to be true of THE SCREEN THEY ARE ACTUALLY LOOKING AT.
 *
 * Three sentences were cut on 2026-09-08 for failing exactly this, and they are
 * named so nobody restores them:
 *
 *   · "A session you record ticks today's circle by itself once it reaches 60%
 *     of the climb, distance or time the plan asked for, so Mark as done is
 *     only for work ICEFALL never saw." — TRUE (`training.ts` SATISFY = 0.6),
 *     and describing two things a new athlete cannot see: with no objective
 *     there is no plan, `weekDays` is empty so the circles are not drawn, and
 *     `today` is null so the Mark as done control does not exist. It belongs on
 *     a screen that can only be reached once a plan exists, not here.
 *   · "Find opens on a place rather than on your position — Chamonix until you
 *     choose otherwise." — FALSE in a production build. `Routes.tsx` resolves
 *     `profiles.location_label` through the geocoder on mount and moves the
 *     search to the athlete's own town; Chamonix is only the seed while that
 *     resolves. It also contradicted the "Use current location" button sitting
 *     directly under it on the Explore hub.
 *   · "Fuel … worked from the weight you gave at sign-up." — half true, and the
 *     wrong half: with a height and a year of birth on file the band is
 *     Mifflin-St Jeor from all three, and the equation is only NAMED on
 *     `/coach/nutrition`, not on `/coach/fuel`. The replacement points at the
 *     breakdown that actually exists.
 *
 * SOCIAL HAS NO GUIDE, DELIBERATELY. All four of its tabs are empty for a new
 * athlete, and each already explains its own absence at length and more
 * precisely than a fixed sentence could — a guide there would be a second
 * paragraph about emptiness stacked on top of the honest one, pushing it
 * further down the page. It earns a guide when the feed reads posts back.
 *
 * PROFILE TAKES THE FIFTH SLOT INSTEAD. It is a main screen with a door of its
 * own (the avatar at the top of Home), it is full of figures that open at
 * nothing, and unlike Social it can say WHY without describing a hole.
 *
 * ------------------------------------------------------------------------
 * LENGTH IS A DESIGN CONSTRAINT, NOT A STYLE PREFERENCE
 * ------------------------------------------------------------------------
 *
 * The block is drawn as tall as its LONGEST sentence (see `PageTour`), so one
 * long point costs every point on that screen the same height, and that height
 * comes straight out of the screen's own first view. Measured at 375pt: the
 * text column is 335px, 13px type wraps at roughly 51 characters, and the
 * guide's chrome is about 97px on top of the sentence. KEEP EVERY SENTENCE
 * UNDER ~165 CHARACTERS — four lines — and the whole guide stays around 180px.
 */

export type TourScreen = "home" | "explore" | "record" | "coach" | "profile";

export type Tour = {
  /** Names the screen the guide belongs to. Drawn as the small uppercase label. */
  readonly label: string;
  /** One sentence each. Two or three; never more — this is an introduction, not documentation. */
  readonly points: readonly string[];
};

export const TOURS: Record<TourScreen, Tour> = {
  home: {
    label: "About Home",
    points: [
      /* readiness.ts: MIN_COMPONENTS = 3 of four, and the score is withheld
         rather than renormalised when fewer survive. The fortnight and the
         three sessions are MIN_HISTORY_DAYS = 14 and MIN_WINDOW_SESSIONS = 3.
         TRUE ON AN EMPTY ACCOUNT AND VISIBLE ON IT: `ReadinessDial` draws the
         em dash and a half-density track when `score.value` is null, which is
         the state a first-day athlete is looking at while reading this. */
      "Readiness stays a dash until three of its four parts can be worked out — about a fortnight of history and three recorded sessions. It is withheld, not averaged.",
      /* All three named things hang off `goal`, and the sentence is phrased so
         it reads correctly in BOTH states: with no objective Home prints "No
         objective set" and a "Set an objective" link, and with one it draws the
         plan (`useTraining`), the seven circles (`weekDays`) and
         `ObjectiveWeather`. That component is handed the PEAK's `elevationM`,
         which conditions.ts passes to Open-Meteo as its `elevation` parameter —
         hence "the summit's own altitude", and hence the "at 4,808 m" line the
         card prints under the forecast. */
      "The rest of this screen follows your objective — a week of sessions, the circles under This week, and a forecast at the summit's own altitude, not the nearest town.",
      /* The "Daily check-in" tile is UNCONDITIONAL on Home — outside the
         `today ?` branch — so it is on screen for an account with nothing,
         which is the whole reason this point sits here rather than in Coach's
         guide, where no check-in control exists at all. CheckIn → saveCheckIn →
         assessRecovery, which is one of the four components in readiness.ts
         (WEIGHTS.recovery = 0.3 — so "one of four parts", never "a quarter"). */
      "Daily check-in is the one reading ICEFALL cannot take for itself: sleep, soreness and stress are where recovery — one of readiness's four parts — comes from.",
    ],
  },

  explore: {
    label: "About Explore",
    points: [
      /* The hub's own card into Find. `useNearbyTrails` → services/trails.ts,
         whose query is `relation["route"="hiking"]["name"]` against Overpass —
         a live read of OpenStreetMap for any coordinate on earth, not a lookup
         in ICEFALL's own handful of documented lines. */
      "Find searches OpenStreetMap for the named, waymarked trails around any place on earth, not an ICEFALL list — so it answers in valleys this app documents nothing in.",
      /* TrailDetail's `useTrailFacts`: `elevationOf` builds the profile,
         `surfaceBreakdown` the surfaces, `walkingHours` the time — all from the
         mapped geometry. "Download GPX" → `toGpx`, built on the device. */
      "Open a trail and ICEFALL works out its climb, its surfaces and a walking time from the mapped line itself, and will hand you that line as a GPX file.",
      /* THE OTHER HALF OF THE SCREEN, and the honest contrast with Find. The
         figures are measured: `TREK_RECORDS` holds 252 routes and
         `TREK_REGIONS` 22. Treks is named rather than "Browse" on purpose —
         Guides is one of the same four cards and its list is empty, so a
         sentence about the row as a whole would have promised it. */
      "Browse is the other half: Treks is a catalogue carried inside the app — 252 routes across 22 regions — rather than anything anybody posts.",
    ],
  },

  record: {
    label: "About recording",
    points: [
      /* useRecorder persists on PERSIST_INTERVAL_MS = 3s plus an immediate
         write on pagehide/visibilitychange; activeSession.ts keeps it; Home
         reads activeSessionSummary() and offers Resume. */
      "ICEFALL writes the session to this phone every few seconds while you record, so if the app closes mid-activity Home offers it back where it stopped.",
      /* sessionIntent.ts planFor(): hand-written blocks, a total, a "Watch:"
         line and a caveat — no network, no plan, no objective needed, so this
         is true on an empty account. The same intent is handed to
         `useLiveCoach`, which is off until switched on and speaks through the
         device's own voices. */
      "Choosing a Goal before you start writes the session out — warm-up, main block, and the one thing to watch — and it is what the optional spoken coach follows.",
      /* The control is ungated: `ActivitySelect` renders "Start simulated" in
         every build. finalize.ts excludes simulated sessions from
         detectRecords, detectAchievements and the comparison history, feed.ts
         from the totals, and `SimulatedBadge` carries the label. */
      "Start simulated is for indoor review: what it records is labelled SIMULATED and never counts towards your records, achievements or totals.",
    ],
  },

  coach: {
    label: "About Coach",
    points: [
      /* coach.ts rules read the athlete's own logged figures, and readiness
         prints `missing` when the score is withheld rather than a number. */
      "Coach answers from what you have actually recorded, and where it cannot work something out it prints the reason instead of a number.",
      /* THE HERO IS THE FIRST THING ON THIS SCREEN AND IT IS THE COLD STATE:
         with no goal it reads "Name the mountain" over "The plan, the fuelling
         and the coach all follow an objective." Written to be true in both
         states — an athlete who set a peak during onboarding arrives with one
         and reads the same sentence correctly. */
      "The plan, the fuelling and the session Coach prescribes all follow one objective. With none set it says so, rather than handing everybody the same beginner block.",
      /* fuelDay.ts adds three terms — restingEnergyFor, everydayEnergyFor,
         sessionCostFor — and Nutrition.tsx draws exactly those three as rows
         that expand to `sentence`, which names the equation ("the Owen
         equation, from your weight alone"). NOT "arithmetic shown": on
         /coach/fuel the equation sentence only appears when the band CANNOT be
         computed. "Opens into" is the honest verb — the breakdown is one tap
         on from the band. */
      "Fuel is an energy range, not a calorie target, and it opens into the three terms it adds — resting, everyday movement and today's session — each with its arithmetic.",
    ],
  },

  profile: {
    label: "About your profile",
    points: [
      /* NAMES THE STATS TAB RATHER THAN "everything counted here". The six
         figures above this guide include Followers, Following and Connections,
         which are a server count and a local store — not things you record —
         so the wider claim was wrong about half its own screen. StatsTab's
         totals and twelve-month chart read `tracking/feed.ts`, whose seeded
         career is gated behind import.meta.env.DEV; the tab says the same
         thing in its own words further down. */
      "The Stats tab counts only what you record in ICEFALL — nothing you climbed before installing it — which is why a new profile opens at nothing.",
      /* profile/shareLink.ts packs the card into the URL FRAGMENT, which
         browsers never send to a host; PublicProfile decodes it with no session
         and no backend behind it. */
      "Share profile makes an image card and a link that carries the card inside the link, so whoever you send it to needs no account and it never reaches a server.",
      /* The Bookmark in the header goes to /profile/saved, which reads the same
         services/savedTrails store the Save control on a trail — in Find and on
         a trail's own page — writes to. */
      "The bookmark at the top of this screen holds every trail you have saved from Explore.",
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* Remembering                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * ONE KEY PER SCREEN, VERSIONED.
 *
 * Per screen, because the guides are independent: somebody who skipped Home's
 * on day one should still meet Explore's the first time they open Explore.
 *
 * Versioned, because rewriting a guide's sentences makes it a different guide.
 * Bumping VERSION is how a rewrite is shown again to people who have already
 * seen the old one — and it is the ONLY thing that brings a guide back on its
 * own. There is no timer and there must never be one: a dismissal that expires
 * is a popup with a delay.
 *
 * v2 — 2026-09-08. Three sentences in v1 were wrong or described a populated
 * screen a first-day athlete never sees (named in this file's header). Anybody
 * who dismissed a v1 guide on a preview build dismissed something that no
 * longer exists, so they are owed the corrected one.
 */
const VERSION = 2;

const storageKey = (screen: TourScreen) => `icefall.tour.seen.v${VERSION}.${screen}`;

/**
 * The fallback when the browser refuses storage — private mode, a full quota,
 * site data blocked.
 *
 * Failing toward SHOWING is the right direction for something inline and
 * dismissible: the alternative is a guide that silently never appears for
 * anybody in a private window. But it must not become a nag WITHIN a session,
 * so a dismissal is held in memory as well as written. The cost, stated
 * plainly: on a device that cannot store anything, the guide comes back on the
 * next launch. It is one line of text with a Skip beside it, not a dialog.
 */
const dismissedThisSession = new Set<TourScreen>();

function hasSeen(screen: TourScreen): boolean {
  if (dismissedThisSession.has(screen)) return true;
  try {
    return localStorage.getItem(storageKey(screen)) !== null;
  } catch {
    return false;
  }
}

function markSeen(screen: TourScreen): void {
  dismissedThisSession.add(screen);
  try {
    localStorage.setItem(storageKey(screen), new Date().toISOString());
  } catch {
    /* Storage refused. The in-memory mark above still ends it for this session. */
  }
}

/**
 * Forget every guide, so all five introduce themselves again.
 *
 * Reached from Settings → Support. Somebody who skipped a guide on their first
 * morning has no other way back to it, and a control that cannot be undone is
 * a control that punishes a mistap.
 */
export function resetTours(): void {
  dismissedThisSession.clear();
  for (const screen of Object.keys(TOURS) as TourScreen[]) {
    try {
      localStorage.removeItem(storageKey(screen));
    } catch {
      /* Nothing was stored to remove. The session set is already cleared. */
    }
  }
}

/**
 * Whether this screen's guide is owed, and how to end it.
 *
 * READ SYNCHRONOUSLY, in the initialiser rather than in an effect: deciding in
 * an effect paints the screen once without the guide and once with it, and the
 * content below jumps down a hundred pixels after the athlete's eye has already
 * landed on it.
 *
 * `hold` suppresses the guide without consuming it — see `PageTour`.
 */
export function useTour(screen: TourScreen, hold = false) {
  const [open, setOpen] = useState(() => !hasSeen(screen));

  const dismiss = useCallback(() => {
    setOpen(false);
    markSeen(screen);
  }, [screen]);

  return { open: open && !hold, dismiss };
}
