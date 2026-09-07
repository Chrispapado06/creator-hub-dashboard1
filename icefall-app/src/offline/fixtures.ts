/**
 * OFFLINE DEMO FIXTURES — invented data, for the offline build only.
 *
 * ── What this file is ────────────────────────────────────────────────────────
 *
 * When ICEFALL is built with `VITE_ICEFALL_OFFLINE=1` it must be usable with no
 * network at all: no Supabase, no Overpass, no Open-Meteo, no Wikimedia, no map
 * tiles. Every read that would have gone to one of those resolves from here
 * instead, and a permanent banner at the top of the app says, on every screen,
 * that what is on screen is sample data and not real.
 *
 * ── The rules this file obeys ────────────────────────────────────────────────
 *
 * 1. NOTHING HERE NAMES A REAL BUSINESS OR A REAL PERSON. The constitution
 *    forbids rendering an identifiable company in a state ICEFALL invented, and
 *    that ban is absolute — it does not soften because the build is a demo, and
 *    it does not soften because a banner is on screen. Every guide, company,
 *    group and climber below was made up for this file. Mountains, ranges and
 *    towns are real geography, exactly as everywhere else in the app.
 *
 * 2. EVERY FIGURE HERE IS INVENTED, and the offline banner is what makes that
 *    honest. ICEFALL's whole doctrine is that it never shows a number it cannot
 *    measure; offline it can measure nothing at all, so the banner is not
 *    decoration, it is the thing carrying the honesty for the entire build.
 *
 * 3. IT IS ONLY EVER READ BEHIND the demo gates. No production path renders a
 *    single byte of it. The literals are additionally gated on `DEMO` at
 *    DEFINITION — the pattern `@/lib/demoFlag` documents — so an ordinary build
 *    folds them away rather than shipping invented records inside the bundle
 *    where anybody could read them.
 *
 * 4. NOTHING HERE IS IMPORTED FOR ITS RUNTIME VALUE BY THIS FILE. Every import
 *    below is `import type`, so this module can be evaluated first, before the
 *    stores that read localStorage, and seed them.
 */

import { DEMO } from "./offline";

import type { Goal } from "@/types";
import type { Place } from "@/routes/places";
import type { Guide } from "@/guides/types";
import type { CommunityPost } from "@/social/types";
import type { OwnPost } from "@/social/posts";
import type { SummitLog } from "@/social/summitLog";
import type { SocialNotice } from "@/notifications/social";
import type { SuggestedPerson } from "@/notifications/suggestions";
import type { SettingsState } from "@/settings/store";
import type { Conversation } from "@/screens/chat/data";
import type { Peak, NearbyLiveResult } from "@/services/peaks";
import type { Trail } from "@/services/trails";
import type {
  CurrentConditions,
  DayForecast,
  ElevationBand,
  HourlyOutlook,
  MountainConditions,
  Reading,
} from "@/services/conditions";
import type { Capabilities, LiveSplit, RecordedActivity, TrackPointLive } from "@/tracking/types";

/* -------------------------------------------------------------------------- */
/* Clock                                                                       */
/* -------------------------------------------------------------------------- */

const DAY = 86_400_000;
const NOW = Date.now();

const daysAgo = (n: number, hour = 8, minute = 10) => {
  const d = new Date(NOW - n * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const daysAhead = (n: number, hour = 6, minute = 0) => {
  const d = new Date(NOW + n * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const isoAgo = (n: number, hour?: number, minute?: number) =>
  daysAgo(n, hour, minute).toISOString();
const isoAhead = (n: number) => daysAhead(n).toISOString();
const hoursAgoIso = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

/* -------------------------------------------------------------------------- */
/* The demo athlete                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One invented climber, used consistently everywhere so the app reads as one
 * person's device rather than as a scatter of unrelated sample records.
 */
export const OFFLINE_ATHLETE = {
  name: "Wren Calloway",
  username: "wren.calloway",
  region: "Chamonix, Haute-Savoie",
  bio: "Long days in the Mont Blanc massif. Building towards a 4,000 m season.",
  /** The valley the demo opens on — everything geographic hangs off this. */
  home: { lat: 45.9237, lon: 6.8694, name: "Chamonix", region: "Haute-Savoie, France" },
} as const;

/* -------------------------------------------------------------------------- */
/* Objectives                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The athlete's own goals, seeded into `customGoals` so they travel the app's
 * REAL path — Home's hero, the countdown, the Coach's plan, the kit checklist
 * and the conditions band all read the primary goal, and the primary goal is
 * the one with the soonest target date.
 *
 * Deliberately different mountains from `data/mock/goals.ts`, so a dev build
 * (which also seeds those) does not show each objective twice.
 */
export const OFFLINE_GOALS: Goal[] = !DEMO
  ? []
  : [
      {
        id: "og-gran-paradiso",
        name: "Gran Paradiso",
        subtitle: "Normal route from the Vittorio Emanuele hut",
        elevationM: 4061,
        mountainId: "gran-paradiso",
        lat: 45.5175,
        lon: 7.2675,
        country: "Italy",
        trainingStartedAt: isoAgo(9 * 7),
        targetDate: isoAhead(290),
        preparation: 41,
        status: "active",
        photo: "/img/gran-paradiso.jpg",
        gaps: [
          "Two glacier days on rope, one completed",
          "Crevasse rescue refresher outstanding",
          "Loaded carries at 12 kg not yet started",
        ],
      },
      {
        id: "og-eiger",
        name: "Eiger",
        subtitle: "Mittellegi ridge",
        elevationM: 3967,
        mountainId: "eiger",
        lat: 46.5775,
        lon: 8.0053,
        country: "Switzerland",
        targetDate: isoAhead(670),
        preparation: 18,
        status: "active",
        photo: "/img/eiger.jpg",
        gaps: [
          "Sustained grade III scrambling in mountain boots",
          "Fixed-rope technique on exposed ground",
          "A hut-to-summit day under six hours",
        ],
      },
      {
        id: "og-denali",
        name: "Denali",
        subtitle: "West Buttress — long horizon",
        elevationM: 6190,
        mountainId: "denali",
        lat: 63.0695,
        lon: -151.0074,
        country: "United States",
        targetDate: isoAhead(1010),
        preparation: 6,
        status: "active",
        photo: "/img/denali.jpg",
        gaps: [
          "No night above 4,000 m yet",
          "Sled hauling never practised",
          "Expedition-length logistics experience",
        ],
      },
      {
        id: "og-triglav",
        name: "Triglav",
        subtitle: "Krma valley to the summit",
        elevationM: 2864,
        mountainId: "triglav",
        lat: 46.3785,
        lon: 13.8368,
        country: "Slovenia",
        targetDate: isoAgo(80),
        preparation: 100,
        status: "completed",
        completedAt: isoAgo(80),
        photo: "/img/triglav.jpg",
      },
    ];

/* -------------------------------------------------------------------------- */
/* Recorded activities                                                         */
/* -------------------------------------------------------------------------- */

const CAPABILITIES: Capabilities = {
  gps: true,
  barometricAltitude: false,
  heartRate: true,
  cadence: false,
  power: false,
  temperature: false,
};

/** Metres between two coordinates. Local copy so this file imports no values. */
function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la = (a.lat * Math.PI) / 180;
  const lb = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Deterministic noise, so the same fixture draws the same line every reload. */
function wobble(seed: number, i: number): number {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

interface ActivitySpec {
  id: string;
  typeId: RecordedActivity["activityTypeId"];
  title: string;
  location: string;
  /** Days before now the activity started. */
  ago: number;
  startHour: number;
  durationSec: number;
  movingSec: number;
  /** Out-and-back total, metres. */
  distanceM: number;
  startAltM: number;
  gainM: number;
  avgHr: number;
  maxHr: number;
  calories: number;
  temperatureC: number;
  points: number;
  bearingDeg: number;
  insight?: string;
}

/**
 * A believable out-and-back track, built rather than typed out.
 *
 * The headline figures are then MEASURED from the track that was built, so the
 * charts, the splits and the summary cannot disagree with each other — a
 * mismatch between the number at the top and the line underneath it is exactly
 * the kind of thing this app is careful never to ship.
 */
function buildActivity(spec: ActivitySpec, seed: number): RecordedActivity {
  const n = 90;
  const startedAt = daysAgo(spec.ago, spec.startHour, 5);
  const startMs = startedAt.getTime();
  const home = OFFLINE_ATHLETE.home;
  const rad = (spec.bearingDeg * Math.PI) / 180;
  /** Half the route, converted to a degree offset at this latitude. */
  const reachM = spec.distanceM / 2;
  const dLat = ((Math.cos(rad) * reachM) / 111_320) * 1;
  const dLon = (Math.sin(rad) * reachM) / (111_320 * Math.cos((home.lat * Math.PI) / 180));

  const points: TrackPointLive[] = [];
  let cumulative = 0;
  let gain = 0;
  let loss = 0;
  let prev: { lat: number; lon: number } | null = null;
  let prevAlt = spec.startAltM;
  let maxAlt = spec.startAltM;
  let minAlt = spec.startAltM;

  for (let i = 0; i <= n; i++) {
    // 0 → 1 → 0: out to the turnaround and back to the start.
    const along = i <= n / 2 ? i / (n / 2) : 2 - i / (n / 2);
    const jitterLat = wobble(seed, i) * 0.0016;
    const jitterLon = wobble(seed + 7, i) * 0.0016;
    const lat = home.lat + dLat * along + jitterLat;
    const lon = home.lon + dLon * along + jitterLon;
    // Ease the climb so the profile has a shape instead of a ramp.
    const altitude = spec.startAltM + spec.gainM * Math.sin((along * Math.PI) / 2) ** 1.35;

    if (prev) cumulative += metresBetween(prev, { lat, lon });
    const climb = altitude - prevAlt;
    if (climb > 0) gain += climb;
    else loss -= climb;
    maxAlt = Math.max(maxAlt, altitude);
    minAlt = Math.min(minAlt, altitude);
    prev = { lat, lon };
    prevAlt = altitude;

    const t = startMs + (spec.durationSec * 1000 * i) / n;
    const speed = i === 0 ? 0 : spec.distanceM / spec.movingSec;
    points.push({
      t,
      lat,
      lon,
      accuracy: 5 + Math.abs(wobble(seed + 3, i)) * 6,
      altitude: Math.round(altitude),
      altitudeAccuracy: 8,
      speed,
      heading: null,
      distanceM: cumulative,
      altitudeSmoothed: Math.round(altitude),
      derivedSpeed: speed,
    });
  }

  const distanceM = cumulative;
  const splits: LiveSplit[] = [];
  const wholeKm = Math.floor(distanceM / 1000);
  for (let k = 0; k < wholeKm; k++) {
    splits.push({
      index: k + 1,
      distanceM: 1000,
      durationSec: Math.round(
        (spec.movingSec / distanceM) * 1000 * (1 + wobble(seed + k, k) * 0.16),
      ),
      elevationGainM: Math.round((gain / distanceM) * 1000 * (1 + wobble(seed + k, k + 2) * 0.5)),
      avgHr: Math.round(spec.avgHr + wobble(seed + k, k + 5) * 12),
    });
  }

  const endedAt = new Date(startMs + spec.durationSec * 1000);
  const avgSpeedMps = distanceM / spec.movingSec;

  return {
    id: spec.id,
    activityTypeId: spec.typeId,
    title: spec.title,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    // Not the labelled simulator: these are sample recordings for the offline
    // build, and the banner says so on every screen. Flagging them `simulated`
    // would additionally strike them out of every career total in the app.
    simulated: false,
    origin: { kind: "icefall" },
    durationSec: spec.durationSec,
    movingSec: spec.movingSec,
    distanceM: Math.round(distanceM),
    elevationGainM: Math.round(gain),
    elevationLossM: Math.round(loss),
    maxAltitudeM: Math.round(maxAlt),
    minAltitudeM: Math.round(minAlt),
    avgSpeedMps,
    avgPaceSecPerKm: Math.round(spec.movingSec / (distanceM / 1000)),
    avgHeartRateBpm: spec.avgHr,
    maxHeartRateBpm: spec.maxHr,
    avgCadenceSpm: null,
    calories: spec.calories,
    caloriesForKg: 71,
    verticalRateMPerH: Math.round(gain / (spec.movingSec / 3600)),
    temperatureC: spec.temperatureC,
    points,
    splits,
    capabilities: CAPABILITIES,
    insight: spec.insight,
    location: spec.location,
  };
}

const ACTIVITY_SPECS: ActivitySpec[] = !DEMO
  ? []
  : [
      {
        id: "oa-1",
        typeId: "fast-hiking",
        title: "Brévent vertical",
        location: "Chamonix, Haute-Savoie",
        ago: 2,
        startHour: 7,
        durationSec: 12_960,
        movingSec: 12_120,
        distanceM: 14_800,
        startAltM: 1035,
        gainM: 1385,
        avgHr: 142,
        maxHr: 171,
        calories: 1420,
        temperatureC: 11,
        points: 320,
        bearingDeg: 250,
        insight: "Strongest sustained climb of the block — 1,385 m carried at an even heart rate.",
      },
      {
        id: "oa-2",
        typeId: "trail-run",
        title: "Petit Balcon Sud",
        location: "Chamonix, Haute-Savoie",
        ago: 4,
        startHour: 18,
        durationSec: 4_620,
        movingSec: 4_440,
        distanceM: 11_200,
        startAltM: 1042,
        gainM: 420,
        avgHr: 151,
        maxHr: 174,
        calories: 720,
        temperatureC: 16,
        points: 140,
        bearingDeg: 40,
      },
      {
        id: "oa-3",
        typeId: "mountaineering",
        title: "Aiguille du Tour — glacier day",
        location: "Le Tour, Haute-Savoie",
        ago: 6,
        startHour: 5,
        durationSec: 27_900,
        movingSec: 24_300,
        distanceM: 16_400,
        startAltM: 1462,
        gainM: 1720,
        avgHr: 128,
        maxHr: 158,
        calories: 2260,
        temperatureC: 2,
        points: 480,
        bearingDeg: 62,
        insight: "Six hours above 2,800 m — the longest altitude exposure since the block began.",
      },
      {
        id: "oa-4",
        typeId: "hiking",
        title: "Lac Blanc and back",
        location: "Argentière, Haute-Savoie",
        ago: 9,
        startHour: 9,
        durationSec: 16_200,
        movingSec: 14_100,
        distanceM: 13_600,
        startAltM: 1240,
        gainM: 940,
        avgHr: 121,
        maxHr: 149,
        calories: 1180,
        temperatureC: 13,
        points: 210,
        bearingDeg: 20,
      },
      {
        id: "oa-5",
        typeId: "trail-run",
        title: "Valley loop, easy",
        location: "Chamonix, Haute-Savoie",
        ago: 12,
        startHour: 7,
        durationSec: 3_240,
        movingSec: 3_180,
        distanceM: 9_400,
        startAltM: 1030,
        gainM: 180,
        avgHr: 133,
        maxHr: 152,
        calories: 540,
        temperatureC: 9,
        points: 90,
        bearingDeg: 200,
      },
      {
        id: "oa-6",
        typeId: "fast-hiking",
        title: "Col de Balme carry",
        location: "Le Tour, Haute-Savoie",
        ago: 16,
        startHour: 8,
        durationSec: 15_300,
        movingSec: 14_400,
        distanceM: 15_100,
        startAltM: 1455,
        gainM: 1120,
        avgHr: 138,
        maxHr: 165,
        calories: 1380,
        temperatureC: 8,
        points: 290,
        bearingDeg: 55,
        insight: "First session carrying 12 kg. Pace held within 8% of the unloaded equivalent.",
      },
      {
        id: "oa-7",
        typeId: "scrambling",
        title: "Aiguillette d'Argentière",
        location: "Argentière, Haute-Savoie",
        ago: 21,
        startHour: 10,
        durationSec: 10_800,
        movingSec: 9_300,
        distanceM: 8_900,
        startAltM: 1250,
        gainM: 760,
        avgHr: 126,
        maxHr: 156,
        calories: 860,
        temperatureC: 15,
        points: 180,
        bearingDeg: 15,
      },
      {
        id: "oa-8",
        typeId: "ski-touring",
        title: "Grands Montets skin",
        location: "Argentière, Haute-Savoie",
        ago: 27,
        startHour: 8,
        durationSec: 14_400,
        movingSec: 12_600,
        distanceM: 12_200,
        startAltM: 1235,
        gainM: 1260,
        avgHr: 134,
        maxHr: 162,
        calories: 1520,
        temperatureC: -4,
        points: 340,
        bearingDeg: 70,
      },
    ];

/** Newest first — the order the store itself keeps. */
export const OFFLINE_ACTIVITIES: RecordedActivity[] = ACTIVITY_SPECS.map((s, i) =>
  buildActivity(s, i * 13 + 1),
);

export const OFFLINE_ATHLETE_META = {
  /*
   * Ids from `tracking/records.ts` — not invented ones. A made-up id renders as
   * nothing at all on the Profile, which looks like a bug rather than a badge.
   */
  earnedAchievements: !DEMO
    ? []
    : [
        "first-5k",
        "first-10k",
        "first-500-ascent",
        "first-1000-ascent",
        "above-3000",
        "alpine-start",
      ],
};

/* -------------------------------------------------------------------------- */
/* Profile — settings, posts, summit logs                                      */
/* -------------------------------------------------------------------------- */

export const OFFLINE_SETTINGS: Partial<SettingsState> = !DEMO
  ? {}
  : {
      username: OFFLINE_ATHLETE.username,
      bio: OFFLINE_ATHLETE.bio,
      region: OFFLINE_ATHLETE.region,
      languages: "English, French",
      interests: "Alpine mountaineering, glacier travel, ski touring",
      heightCm: 176,
      packWeightKg: 12,
      defaultActivity: "fast-hiking",
      trainingIntent: "endurance",
      ageBand: "25-34",
    };

export const OFFLINE_OWN_POSTS: OwnPost[] = !DEMO
  ? []
  : [
      {
        id: "op-1",
        kind: "activity",
        caption:
          "Third carry of the block. Legs fine, shoulders less so — the 12 kg is going to need a better hip belt before the hut walk-in.",
        photos: [],
        activityId: "oa-6",
        privacy: "connections",
        createdAt: isoAgo(16, 19),
      },
      {
        id: "op-2",
        kind: "objective",
        caption: "Booked the hut. Gran Paradiso in a little over three months.",
        photos: [],
        objective: { name: "Gran Paradiso", when: "in 3 months" },
        privacy: "connections",
        createdAt: isoAgo(23, 21),
      },
      {
        id: "op-3",
        kind: "text",
        caption:
          "Crevasse rescue practice cancelled twice now. Writing it here so it stops sliding down the list.",
        photos: [],
        privacy: "connections",
        createdAt: isoAgo(31, 17),
      },
    ];

/* -------------------------------------------------------------------------- */
/* Notifications — follows, likes and comments                                 */
/* -------------------------------------------------------------------------- */

/**
 * THE FOUR PEOPLE BELOW ARE THE SAME FOUR WHO WRITE `OFFLINE_COMMUNITY_POSTS`.
 *
 * That is the whole point of doing it this way. A demo build already shows six
 * posts by Ilse, Tomás, Nadia and Rafael; having *different* invented people
 * turn up in the notifications would double the fiction for no gain. These ids
 * (`oa-ilse`, `oa-tomas`, `oa-nadia`, `oa-rafael`) are the ones those posts
 * already carry, so the demo reads as one small community rather than two.
 *
 * WHY A DEMO BUILD NEEDS THIS AT ALL. A DEMO build constructs no Supabase
 * client (`backend/client.ts`), so `notifications/social.ts` returns
 * `no-backend` before it asks anything, and the Notifications screen is one
 * paragraph of grey text. Every other social surface in this build is populated
 * from this file; leaving this one empty is not more honest, it is just
 * inconsistent — and it makes the screen impossible to look at.
 *
 * WHAT IS DELIBERATELY NOT INVENTED HERE:
 *
 *   · `isOwner` and `identityVerified` are BOTH `null` on every actor, which
 *     `noticeMark` reads as "not measured" and draws nothing for. A tick beside
 *     an invented name would be a fabricated claim about authority or identity
 *     — the one thing `social.ts` says must never be decidable in a component.
 *   · No `avatarUrl`. The screen draws initials through `Avatar`, which exists
 *     precisely so a real face is never attached to somebody who does not exist.
 *   · The posts referenced are the demo athlete's OWN posts from
 *     `OFFLINE_OWN_POSTS` above, and `title` is each post's real opening line
 *     cut the way `social.ts` cuts it — not a summary written for this file.
 */
export const OFFLINE_SOCIAL_NOTICES: SocialNotice[] = !DEMO
  ? []
  : [
      {
        id: "follow:oa-ilse",
        kind: "follow",
        actor: {
          id: "oa-ilse",
          name: "Ilse Vandermolen",
          handle: "ilse.v",
          isOwner: null,
          identityVerified: null,
        },
        at: hoursAgoIso(3),
      },
      {
        id: "comment:odc-1",
        kind: "comment",
        actor: {
          id: "oa-tomas",
          name: "Tomás Arriaga",
          handle: "tomas.arriaga",
          isOwner: null,
          identityVerified: null,
        },
        at: hoursAgoIso(9),
        post: {
          id: "op-1",
          title: "Third carry of the block. Legs fine, shoulders less so — the 12 kg is going…",
        },
        body: "The Aiguillette belt sorted this out for me. Worth trying one on before the walk-in.",
      },
      {
        id: "like:op-2:oa-nadia",
        kind: "like",
        actor: {
          id: "oa-nadia",
          name: "Nadia Quintrell",
          handle: "nadia.q",
          isOwner: null,
          identityVerified: null,
        },
        at: hoursAgoIso(26),
        post: { id: "op-2", title: "Booked the hut. Gran Paradiso in a little over three months." },
      },
      {
        id: "follow:oa-rafael",
        kind: "follow",
        actor: {
          id: "oa-rafael",
          name: "Rafael Osterbrink",
          handle: "rafael.o",
          isOwner: null,
          identityVerified: null,
        },
        at: isoAgo(3, 18, 40),
      },
      {
        id: "comment:odc-2",
        kind: "comment",
        actor: {
          id: "oa-nadia",
          name: "Nadia Quintrell",
          handle: "nadia.q",
          isOwner: null,
          identityVerified: null,
        },
        at: isoAgo(5, 7, 15),
        post: {
          id: "op-3",
          title: "Crevasse rescue practice cancelled twice now. Writing it here so it stops…",
        },
        body: "We are running one on the Mer de Glace the weekend after next if you want a rope.",
      },
      {
        id: "like:op-1:oa-tomas",
        kind: "like",
        actor: {
          id: "oa-tomas",
          name: "Tomás Arriaga",
          handle: "tomas.arriaga",
          isOwner: null,
          identityVerified: null,
        },
        at: isoAgo(8, 20, 5),
        post: {
          id: "op-1",
          title: "Third carry of the block. Legs fine, shoulders less so — the 12 kg is going…",
        },
      },
    ];

/**
 * The same four, as people the demo athlete could follow.
 *
 * `basis` is not decoration: Wren Calloway's demo profile says Chamonix, so
 * Ilse — the only one of the four whose region is Chamonix — is a `"place"`
 * match and the other three are `"country"`. That is exactly the partition the
 * real query makes, so the demo shows the real shape of the section rather than
 * a tidier one. Rafael is in Zermatt, which is in Switzerland and therefore not
 * a country match either; he is left out rather than mislabelled.
 */
export const OFFLINE_SUGGESTED_PEOPLE: SuggestedPerson[] = !DEMO
  ? []
  : [
      {
        id: "oa-ilse",
        name: "Ilse Vandermolen",
        handle: "ilse.v",
        locationLabel: "Chamonix",
        countryCode: "FR",
        basis: "place",
      },
      {
        id: "oa-nadia",
        name: "Nadia Quintrell",
        handle: "nadia.q",
        locationLabel: "Grenoble",
        countryCode: "FR",
        basis: "country",
      },
      {
        id: "oa-tomas",
        name: "Tomás Arriaga",
        handle: "tomas.arriaga",
        locationLabel: "Annecy",
        countryCode: "FR",
        basis: "country",
      },
    ];

export const OFFLINE_SUMMIT_LOGS: SummitLog[] = !DEMO
  ? []
  : [
      {
        id: "ol-1",
        peakName: "Triglav",
        peakId: "curated:triglav",
        elevationM: 2864,
        date: isoAgo(80).slice(0, 10),
        route: "Krma valley to Kredarica, summit at first light",
        conditions:
          "Dry to the plateau, verglas on the cabled section above the hut. Crampons not needed, gloves absolutely were.",
        note: "Nine hours car to car with an hour on top.",
        createdAt: isoAgo(80, 20),
      },
      {
        id: "ol-2",
        peakName: "Aiguille du Tour",
        elevationM: 3542,
        date: isoAgo(6).slice(0, 10),
        route: "Albert Premier hut, glacier du Tour, normal route",
        conditions:
          "Glacier well filled, two open crevasses on the upper flat. Snow softening fast after 10:00 — be off it early.",
        activityId: "oa-3",
        createdAt: isoAgo(6, 19),
      },
    ];

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Seven invented threads. They deliberately cover both sides of the channel
 * rule the app enforces: a guide channel opens on a PAID BOOKING and a company
 * channel on a QUALIFIED ENQUIRY, so two of these are locked and show what a
 * locked channel looks like rather than pretending everything is open.
 *
 * EVERY `credential` SAYS IT IS INVENTED, and so does the system line under a
 * booking. The companies here were labelled "Sample listing — invented company"
 * and the guides beside them carried a bare "IFMGA / UIAGM mountain guide" —
 * two standards in one list, and the unqualified one was the licence, which is
 * the single claim a climber acts on when choosing who to rope up with. The
 * booking line read a flat "Booking confirmed", which is a transaction state.
 */
export const OFFLINE_CONVERSATIONS: Conversation[] = !DEMO
  ? []
  : [
      {
        id: "oc-guide-open",
        name: "Marta Ehrensvärd",
        kind: "guide",
        credential: "Sample thread — invented guide, states an IFMGA / UIAGM licence",
        peak: "Gran Paradiso",
        unread: 2,
        pinned: true,
        booking: {
          ref: "ICE-0000-DEMO",
          peak: "Gran Paradiso — normal route",
          dateLabel: "invented booking",
        },
        messages: [
          {
            id: "ocg-0",
            from: "them",
            kind: "system",
            body: "Invented booking. Nothing was paid and nobody was contacted — in a real one, payment is what opens this channel.",
            at: hoursAgoIso(96),
          },
          {
            id: "ocg-1",
            from: "me",
            body: "Hi Marta — booked for the normal route. Anything you want dialled before the hut walk-in?",
            at: hoursAgoIso(94),
            state: "read",
          },
          {
            id: "ocg-2",
            from: "them",
            body: "Good to have you. Keep the vertical weeks going and get one more day on rope before we meet. The walk-in is 900 m with a pack, so practise that with the weight you'll actually carry.",
            at: hoursAgoIso(92),
          },
          {
            id: "ocg-3",
            from: "me",
            body: "Did 1,120 m at 12 kg on Saturday. Shoulders complained, legs didn't.",
            at: hoursAgoIso(40),
            state: "read",
          },
          {
            id: "ocg-4",
            from: "them",
            body: "That's the right complaint. Sort the hip belt, not the training.",
            at: hoursAgoIso(21),
          },
          {
            id: "ocg-5",
            from: "them",
            body: "One more thing — bring the B2s, not the approach shoes. Send me a photo of your crampon fit when you get a chance.",
            at: hoursAgoIso(6),
          },
        ],
      },
      {
        id: "oc-group",
        name: "Gran Paradiso — August party",
        kind: "group",
        members: 4,
        unread: 1,
        photo: "/img/gran-paradiso-2.jpg",
        messages: [
          {
            id: "ogr-1",
            from: "them",
            author: "Ilse Vandermolen",
            body: "Hut is booked for the two nights. Four beds, dinner included.",
            at: hoursAgoIso(120),
          },
          {
            id: "ogr-2",
            from: "me",
            body: "Perfect. I'll bring the second rope and two screws.",
            at: hoursAgoIso(118),
            state: "read",
          },
          {
            id: "ogr-3",
            from: "them",
            author: "Tomás Arriaga",
            body: "I can drive — three spaces from the valley if anyone wants one.",
            at: hoursAgoIso(70),
          },
          {
            id: "ogr-4",
            from: "them",
            author: "Ilse Vandermolen",
            body: "Taking one. Are we still doing the rescue practice the weekend before?",
            at: hoursAgoIso(9),
          },
        ],
      },
      {
        id: "oc-company-open",
        name: "Northlight Alpine Collective",
        kind: "company",
        credential: "Sample listing — invented company",
        peak: "Denali",
        unread: 0,
        introduction: { at: hoursAgoIso(300), objective: "Denali — West Buttress" },
        messages: [
          {
            id: "occ-0",
            from: "them",
            kind: "system",
            body: "ICEFALL passed on your enquiry. Northlight can now reply.",
            at: hoursAgoIso(300),
          },
          {
            id: "occ-1",
            from: "me",
            body: "Long horizon — looking at the West Buttress in a couple of seasons. What do you want to see on a record before you'd take someone?",
            at: hoursAgoIso(298),
            state: "read",
          },
          {
            id: "occ-2",
            from: "them",
            body: "A 4,000 m summit under your own steam, at least one night at altitude, and sled-hauling experience. Two seasons is a sensible runway rather than an optimistic one.",
            at: hoursAgoIso(260),
          },
          {
            id: "occ-3",
            from: "them",
            body: "Gran Paradiso this summer is a good first box. Send us the log afterwards.",
            at: hoursAgoIso(258),
          },
        ],
      },
      {
        id: "oc-peer-ilse",
        name: "Ilse Vandermolen",
        kind: "athlete",
        unread: 0,
        messages: [
          {
            id: "opi-1",
            from: "them",
            body: "Saw your Brévent split. That's twenty minutes faster than the same line in May.",
            at: hoursAgoIso(46),
          },
          {
            id: "opi-2",
            from: "me",
            body: "Cooler day and no pack. I'll take it anyway.",
            at: hoursAgoIso(45),
            state: "read",
          },
          {
            id: "opi-3",
            from: "them",
            body: "Lac Blanc on Sunday? Early start, back for lunch.",
            at: hoursAgoIso(30),
          },
        ],
      },
      {
        id: "oc-peer-tomas",
        name: "Tomás Arriaga",
        kind: "athlete",
        unread: 0,
        messages: [
          {
            id: "opt-1",
            from: "me",
            body: "Did you ever get the rescue course booked?",
            at: hoursAgoIso(200),
            state: "read",
          },
          {
            id: "opt-2",
            from: "them",
            body: "Two weeks Saturday, valley bureau. There's a space if you want it.",
            at: hoursAgoIso(196),
          },
          {
            id: "opt-3",
            from: "me",
            body: "Take it as booked. That's the last thing on my gap list.",
            at: hoursAgoIso(190),
            state: "read",
          },
        ],
      },
      {
        id: "oc-guide-locked",
        name: "Bo Halvard",
        kind: "guide",
        credential: "Sample thread — invented guide, states an IFMGA / UIAGM licence",
        peak: "Eiger",
        unread: 0,
        messages: [],
      },
      {
        id: "oc-company-locked",
        name: "Meridian Ridge Expeditions",
        kind: "company",
        credential: "Sample listing — invented company",
        peak: "Eiger",
        unread: 0,
        messages: [],
      },
    ];

/* -------------------------------------------------------------------------- */
/* Community                                                                   */
/* -------------------------------------------------------------------------- */

export const OFFLINE_COMMUNITY_POSTS: CommunityPost[] = !DEMO
  ? []
  : [
      {
        id: "ocp-1",
        kind: "activity",
        hoursAgo: 3,
        author: { id: "oa-ilse", name: "Ilse Vandermolen", region: "Around Chamonix" },
        objective: { mountain: "Gran Paradiso", when: "in 3 months" },
        title: "Balcon Nord before work",
        stats: [
          { label: "Distance", value: "12.8 km" },
          { label: "Elevation", value: "+780 m" },
          { label: "Time", value: "2h 06m" },
        ],
        tags: ["Gran Paradiso preparation", "Vertical endurance"],
        photo: "/img/community-a.jpg",
        likes: 11,
        comments: 2,
      },
      {
        id: "ocp-2",
        kind: "summit",
        hoursAgo: 19,
        author: { id: "oa-tomas", name: "Tomás Arriaga", region: "Around Aosta" },
        objective: { mountain: "Gran Paradiso", when: "Completed" },
        title: "Summited Gran Paradiso",
        body: "Left the hut at 04:30, on top by 08:10. The Madonna was queued four deep and worth every minute of it.",
        summit: { elevationM: 4061, range: "Graian Alps", verified: true },
        photo: "/img/gran-paradiso.jpg",
        likes: 41,
        comments: 7,
      },
      {
        id: "ocp-2b",
        kind: "route-report",
        hoursAgo: 8,
        author: { id: "oa-nadia", name: "Nadia Quintrell", region: "Around Grindelwald" },
        objective: { mountain: "Eiger", when: "Route report" },
        title: "West flank is walkable again",
        report: {
          condition: "Wet rock low down, drying by the second band",
          visibility: "Clear all morning",
          snow: "Soft above the first snowfield, boots only",
          note: "The traverse below the shoulder is running with meltwater until about nine.",
        },
        likes: 12,
        comments: 2,
      },
      {
        id: "ocp-2c",
        kind: "activity",
        hoursAgo: 14,
        author: { id: "oa-rafael", name: "Rafael Osterbrink", region: "Around Zermatt" },
        objective: { mountain: "Matterhorn", when: "Next season" },
        title: "Hörnli approach, turned at the hut",
        stats: [
          { label: "Distance", value: "9.4 km" },
          { label: "Elevation", value: "+1,120 m" },
          { label: "Time", value: "3h 41m" },
        ],
        tags: ["Matterhorn preparation", "Load carrying"],
        likes: 19,
        comments: 3,
      },
      {
        id: "ocp-3",
        kind: "route-report",
        hoursAgo: 28,
        author: { id: "oa-nadia", name: "Nadia Quintrell", region: "Around Grindelwald" },
        objective: { mountain: "Eiger", when: "Route report" },
        title: "Mittellegi — conditions on the ridge",
        report: {
          condition: "Dry rock, thin snow on the north side of the crest",
          visibility: "Clear until midday, cloud building from the west after",
          snow: "Patchy above 3,400 m, none on the ridge proper",
          note: "Fixed ropes are in and in good order. Hut wardens say the first hour after the hut is the icy part.",
        },
        photo: "/img/eiger.jpg",
        likes: 26,
        comments: 5,
      },
      {
        id: "ocp-4",
        kind: "looking-for-partners",
        hoursAgo: 40,
        author: { id: "oa-rafael", name: "Rafael Osterbrink", region: "Around Zermatt" },
        objective: { mountain: "Matterhorn", when: "Next season" },
        title: "Looking for a second for a long training block",
        bullets: [
          "Weekends, valley-based, two to three days a month",
          "Comfortable on grade III, want more of it",
          "Rope and rack shared, no guiding either way",
        ],
        likes: 8,
        comments: 4,
      },
      {
        id: "ocp-5",
        kind: "milestone",
        hoursAgo: 62,
        author: { id: "oa-ilse", name: "Ilse Vandermolen", region: "Around Chamonix" },
        objective: { mountain: "Gran Paradiso", when: "in 3 months" },
        title: "Halfway through the build",
        milestone: { pct: 52, label: "of the training block complete" },
        likes: 17,
        comments: 1,
      },
      {
        id: "ocp-6",
        kind: "group",
        hoursAgo: 90,
        author: { id: "oa-tomas", name: "Tomás Arriaga", region: "Around Aosta" },
        objective: { mountain: "Gran Paradiso", when: "August" },
        title: "Two beds left in the hut party",
        group: { filled: 4, size: 6 },
        bullets: ["Two nights at the hut", "Rope teams of three", "Own transport to the valley"],
        photo: "/img/community-b.jpg",
        likes: 13,
        comments: 6,
      },
    ];

/* -------------------------------------------------------------------------- */
/* Guides                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Four invented guides. Names constructed for this file; every qualification,
 * ascent count, rate and rating below was made up. `demo: true` keeps them
 * badged and behind the same disclaimer the dev demo data carries.
 */
export const OFFLINE_GUIDES: Guide[] = !DEMO
  ? []
  : [
      {
        id: "guide-demo-ehrensvard",
        // Demo portrait: a GAN-generated face of a person who does not exist
        // (guides/types.ts:179). The owner reviews the OFFLINE build, and without
        // this their mockup's photograph rendered as initials.
        portrait: "/img/guides/guide-demo-kastrinaki.jpg",
        name: "Marta Ehrensvärd",
        headline: "Mont Blanc massif — glacier days and the 4,000 m classics",
        basedIn: "Chamonix-Mont-Blanc, France",
        specialities: ["mountaineering", "glacier", "mixed"],
        mountains: ["Mont Blanc", "Gran Paradiso", "Matterhorn"],
        languages: ["English", "French", "Swedish"],
        yearsGuiding: 12,
        expeditionsLed: 180,
        highestGuidedM: 6190,
        dailyRateEur: 610,
        availability: "available",
        ascentsByMountain: { "Mont Blanc": 88, "Gran Paradiso": 52, Matterhorn: 17 },
        credentials: [
          {
            label: "IFMGA / UIAGM mountain guide",
            body: "Invented for this build. A carnet number would be shown here.",
            verified: false,
          },
          {
            label: "Wilderness first responder",
            body: "Invented for this build. A renewal date would be shown here.",
            verified: false,
          },
        ],
        rating: 4.9,
        reviewCount: 31,
        demo: true,
        bio: "Twelve invented seasons in the massif. Works with people building towards their first 4,000 m summit and prefers two short days to one long one.",
      },
      {
        id: "guide-demo-halvard",
        // Demo portrait: a GAN-generated face of a person who does not exist
        // (guides/types.ts:179). The owner reviews the OFFLINE build, and without
        // this their mockup's photograph rendered as initials.
        portrait: "/img/guides/guide-demo-halvorsen.jpg",
        name: "Bo Halvard",
        headline: "Ridges, fixed ropes and long alpine days in the Bernese Alps",
        basedIn: "Grindelwald, Switzerland",
        specialities: ["mountaineering", "rock", "mixed", "winter"],
        mountains: ["Eiger", "Matterhorn", "Mont Blanc"],
        languages: ["English", "German", "Norwegian"],
        yearsGuiding: 18,
        expeditionsLed: 260,
        highestGuidedM: 6961,
        dailyRateEur: 690,
        availability: "limited",
        ascentsByMountain: { Eiger: 64, Matterhorn: 40, "Mont Blanc": 29 },
        credentials: [
          {
            label: "IFMGA / UIAGM mountain guide",
            body: "Invented for this build. A carnet number would be shown here.",
            verified: false,
          },
        ],
        rating: 4.8,
        reviewCount: 44,
        demo: true,
        bio: "Invented profile. Spends most of the season on the Mittellegi and says the hard part of a ridge is the first hour out of the hut.",
      },
      {
        id: "guide-demo-quintrell",
        // Demo portrait: a GAN-generated face of a person who does not exist
        // (guides/types.ts:179). The owner reviews the OFFLINE build, and without
        // this their mockup's photograph rendered as initials.
        portrait: "/img/guides/guide-demo-callaghan.jpg",
        name: "Nadia Quintrell",
        headline: "Ski mountaineering and spring glacier travel",
        basedIn: "Argentière, France",
        specialities: ["ski-mountaineering", "glacier", "winter"],
        mountains: ["Mont Blanc", "Gran Paradiso", "Eiger"],
        languages: ["English", "French"],
        yearsGuiding: 9,
        expeditionsLed: 120,
        highestGuidedM: 4810,
        dailyRateEur: 540,
        availability: "available",
        ascentsByMountain: { "Mont Blanc": 34, "Gran Paradiso": 26, Eiger: 6 },
        credentials: [
          {
            label: "IFMGA / UIAGM mountain guide",
            body: "Invented for this build. A carnet number would be shown here.",
            verified: false,
          },
          {
            label: "Avalanche rescue instructor",
            body: "Invented for this build. An awarding body would be shown here.",
            verified: false,
          },
        ],
        rating: 4.9,
        reviewCount: 22,
        demo: true,
        bio: "Invented profile. Takes small groups on spring tours and teaches the rescue drill before the first descent, every time.",
      },
      {
        id: "guide-demo-osterbrink",
        // Demo portrait: a GAN-generated face of a person who does not exist
        // (guides/types.ts:179). The owner reviews the OFFLINE build, and without
        // this their mockup's photograph rendered as initials.
        portrait: "/img/guides/guide-demo-falkenrath.jpg",
        name: "Rafael Osterbrink",
        headline: "High altitude — acclimatisation programmes and expedition prep",
        basedIn: "Zermatt, Switzerland",
        specialities: ["high-altitude", "mountaineering", "trekking"],
        mountains: ["Denali", "Aconcagua", "Everest"],
        languages: ["English", "Spanish", "German"],
        yearsGuiding: 21,
        expeditionsLed: 95,
        highestGuidedM: 8163,
        dailyRateEur: 760,
        availability: "limited",
        ascentsByMountain: { Denali: 12, Aconcagua: 26, Everest: 4 },
        credentials: [
          {
            label: "IFMGA / UIAGM mountain guide",
            body: "Invented for this build. A carnet number would be shown here.",
            verified: false,
          },
          {
            label: "Diploma in mountain medicine",
            body: "Invented for this build. An awarding body would be shown here.",
            verified: false,
          },
        ],
        rating: 4.7,
        reviewCount: 18,
        demo: true,
        bio: "Invented profile. Builds two-season runways towards a first 6,000 m peak and will say no to a plan that skips the middle of it.",
      },
    ];

/* -------------------------------------------------------------------------- */
/* Places                                                                      */
/* -------------------------------------------------------------------------- */

/** Where the offline demo can search. Real towns, no geocoder. */
export const OFFLINE_PLACES: Place[] = !DEMO
  ? []
  : [
      {
        id: "s:chamonix",
        name: "Chamonix",
        region: "Haute-Savoie, France",
        lat: 45.9237,
        lon: 6.8694,
      },
      {
        id: "s:argentiere",
        name: "Argentière",
        region: "Haute-Savoie, France",
        lat: 45.9836,
        lon: 6.9282,
      },
      {
        id: "s:courmayeur",
        name: "Courmayeur",
        region: "Aosta Valley, Italy",
        lat: 45.7912,
        lon: 6.9694,
      },
      { id: "s:cogne", name: "Cogne", region: "Aosta Valley, Italy", lat: 45.6086, lon: 7.3556 },
      {
        id: "s:zermatt",
        name: "Zermatt",
        region: "Valais, Switzerland",
        lat: 46.0207,
        lon: 7.7491,
      },
      {
        id: "s:grindelwald",
        name: "Grindelwald",
        region: "Bern, Switzerland",
        lat: 46.6244,
        lon: 8.0411,
      },
      {
        id: "s:interlaken",
        name: "Interlaken",
        region: "Bern, Switzerland",
        lat: 46.6863,
        lon: 7.8632,
      },
      {
        id: "s:innsbruck",
        name: "Innsbruck",
        region: "Tyrol, Austria",
        lat: 47.2692,
        lon: 11.4041,
      },
      { id: "s:bovec", name: "Bovec", region: "Goriška, Slovenia", lat: 46.3378, lon: 13.5525 },
      {
        id: "s:litochoro",
        name: "Litochoro",
        region: "Central Macedonia, Greece",
        lat: 40.1006,
        lon: 22.5006,
      },
      {
        id: "s:imlil",
        name: "Imlil",
        region: "Marrakesh-Safi, Morocco",
        lat: 31.1361,
        lon: -7.9192,
      },
      { id: "s:kathmandu", name: "Kathmandu", region: "Bagmati, Nepal", lat: 27.7172, lon: 85.324 },
    ];

/** The place "here" resolves to when there is no geocoder to name a fix. */
export const OFFLINE_HOME_PLACE: Place = {
  id: "here",
  name: OFFLINE_ATHLETE.home.name,
  region: OFFLINE_ATHLETE.home.region,
  lat: OFFLINE_ATHLETE.home.lat,
  lon: OFFLINE_ATHLETE.home.lon,
};

export function offlineSearchPlaces(query: string): Place[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return OFFLINE_PLACES.filter(
    (p) => p.name.toLowerCase().includes(q) || p.region.toLowerCase().includes(q),
  ).slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Peaks                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * "Every named peak around here", answered from the catalogue that ships with
 * the app instead of from Overpass.
 *
 * `public/data/peaks.json` is a bundled, precached asset — reading it is not a
 * network call, it is the app reading its own files — so the offline answer is
 * the same arithmetic the live path does, minus the request. The `total` is
 * therefore a real count of what was searched, not a row cap read back.
 */
export function offlineNearbyPeaks(
  catalogue: Peak[],
  lat: number,
  lon: number,
  radiusM: number,
  limit: number,
  minElevationM: number,
): NearbyLiveResult {
  const withDistance = catalogue
    .filter((p) => p.elevationM >= minElevationM)
    .map((p) => ({ ...p, distanceM: metresBetween({ lat, lon }, { lat: p.lat, lon: p.lon }) }))
    .filter((p) => (p.distanceM ?? Infinity) <= radiusM)
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));

  return {
    peaks: withDistance.slice(0, limit),
    total: withDistance.length,
    radiusM,
  };
}

/* -------------------------------------------------------------------------- */
/* Trails                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The fallback when the bundled country index does not cover the point.
 *
 * The prebuilt indexes in `public/data/trails/` are the primary offline source
 * and cover most of the Alps, so this is only reached off the edge of them.
 * Invented ids in a private range so a fixture can never be mistaken for an OSM
 * relation somebody could look up.
 */
export const OFFLINE_TRAILS: Trail[] = !DEMO
  ? []
  : [
      {
        id: "trail:900000001",
        osmId: 900_000_001,
        name: "Sample valley balcony",
        network: "lwn",
        lengthKm: 14.2,
        lat: 45.9312,
        lon: 6.8735,
        sacScale: "T2",
        ascentM: 620,
        durationH: 4.5,
        description: "Sample route, invented for the offline demo. Not a surveyed trail.",
      },
      {
        id: "trail:900000002",
        osmId: 900_000_002,
        name: "Sample lake circuit",
        network: "lwn",
        lengthKm: 9.6,
        lat: 45.9752,
        lon: 6.8901,
        sacScale: "T3",
        ascentM: 940,
        durationH: 5,
        description: "Sample route, invented for the offline demo. Not a surveyed trail.",
      },
      {
        id: "trail:900000003",
        osmId: 900_000_003,
        name: "Sample col traverse",
        network: "rwn",
        lengthKm: 21.4,
        lat: 46.0021,
        lon: 6.9403,
        sacScale: "T3",
        ascentM: 1180,
        durationH: 8,
        description: "Sample route, invented for the offline demo. Not a surveyed trail.",
      },
      {
        id: "trail:900000004",
        osmId: 900_000_004,
        name: "Sample forest loop",
        network: "lwn",
        lengthKm: 6.1,
        lat: 45.9048,
        lon: 6.8412,
        sacScale: "T1",
        ascentM: 210,
        durationH: 2,
        description: "Sample route, invented for the offline demo. Not a surveyed trail.",
      },
      {
        id: "trail:900000005",
        osmId: 900_000_005,
        name: "Sample high route stage",
        network: "nwn",
        lengthKm: 32.8,
        lat: 45.8611,
        lon: 6.9902,
        sacScale: "T4",
        ascentM: 1760,
        durationH: 11,
        description: "Sample route, invented for the offline demo. Not a surveyed trail.",
      },
      {
        id: "trail:900000006",
        osmId: 900_000_006,
        name: "Sample hut approach",
        network: "lwn",
        lengthKm: 7.8,
        lat: 45.9501,
        lon: 6.9231,
        sacScale: "T2",
        ascentM: 880,
        durationH: 3.5,
        description: "Sample route, invented for the offline demo. Not a surveyed trail.",
      },
    ];

export function offlineNearbyTrails(lat: number, lon: number, limit: number): Trail[] {
  return OFFLINE_TRAILS.map((t) => ({
    ...t,
    distanceM: metresBetween({ lat, lon }, { lat: t.lat, lon: t.lon }),
  }))
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))
    .slice(0, limit);
}

export function offlineTrailById(osmId: number): Trail | null {
  return OFFLINE_TRAILS.find((t) => t.osmId === osmId) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Conditions                                                                  */
/* -------------------------------------------------------------------------- */

const reading = <T>(v: T): Reading<T> => ({ value: v });

/**
 * A sample forecast.
 *
 * The live module is emphatic that a failed request must never resolve to
 * "calm and clear", and that rule is not being bent here: this is not a failed
 * request dressed up, it is a build that has declared itself a demo on every
 * screen. The figures are invented and vary with the peak's elevation so the
 * elevation bands are internally consistent rather than flat.
 */
export function offlineConditions(args: {
  peakName: string;
  elevationM: number;
  bands: { elevationM: number; label: string }[];
  includeBands: boolean;
}): MountainConditions {
  const { peakName, elevationM, bands, includeBands } = args;
  /** −6.5 °C per 1,000 m from a 14 °C valley, the standard lapse rate. */
  const tempAt = (m: number) => Math.round((14 - (m / 1000) * 6.5) * 10) / 10;
  const windAt = (m: number) => Math.round(12 + (m / 1000) * 5.5);

  const current: CurrentConditions = {
    temperatureC: reading(tempAt(elevationM)),
    feelsLikeC: reading(tempAt(elevationM) - 4),
    windKph: reading(windAt(elevationM)),
    windDirectionDeg: reading(295),
    visibilityM: reading(24_000),
    precipitationMm: reading(0),
    freezingLevelM: reading(3_400),
    weatherCode: reading(2), // WMO 2 — partly cloudy.
    isDay: new Date(NOW).getHours() >= 6 && new Date(NOW).getHours() < 19,
    observedAt: new Date(NOW).toISOString(),
  };

  /*
   * Six hours ahead, invented like everything else in this file.
   *
   * The live module refuses to pad a short series precisely so that a row of
   * plausible temperatures never appears without a forecast behind it. That
   * rule holds there; here the banner is doing the work, and an offline build
   * whose hour strip is permanently empty would read as a bug rather than as a
   * demo. Labels are built from the fixture's own clock — there is no peak
   * timezone to honour when there is no request.
   */
  const hourly: HourlyOutlook = {
    requested: 6,
    hours: Array.from({ length: 6 }, (_, i) => {
      const at = new Date(NOW + i * 3_600_000);
      const hour = at.getHours();
      const drift = [0, 0.4, 0.9, 0.3, -0.6, -1.4][i];
      return {
        time: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00`,
        hour,
        label: `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`,
        temperatureC: reading(Math.round((tempAt(elevationM) + drift) * 10) / 10),
        weatherCode: reading([2, 2, 3, 3, 71, 71][i]),
        isDay: hour >= 6 && hour < 19,
        isNow: i === 0,
      };
    }),
  };

  const daily: DayForecast[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(NOW + i * DAY);
    const swing = [0, 1, 2, -1, -3, -2, 1][i];
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      maxC: reading(tempAt(elevationM) + 3 + swing),
      minC: reading(tempAt(elevationM) - 5 + swing),
      windMaxKph: reading(windAt(elevationM) + [4, 9, 14, 22, 31, 18, 7][i]),
      precipitationMm: reading([0, 0, 0.4, 2.1, 6.8, 1.2, 0][i]),
      snowfallCm: reading([0, 0, 0, 1.5, 6, 0.5, 0][i]),
    } satisfies DayForecast;
  });

  const elevationBands: ElevationBand[] = !includeBands
    ? []
    : bands.map((b) => ({
        elevationM: b.elevationM,
        label: b.label,
        temperatureC: reading(tempAt(b.elevationM)),
        windKph: reading(windAt(b.elevationM)),
      }));

  return { peakName, elevationM, current, hourly, daily, bands: elevationBands };
}
