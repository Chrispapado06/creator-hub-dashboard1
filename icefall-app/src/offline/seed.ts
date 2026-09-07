/**
 * SEEDING THE OFFLINE DEMO DEVICE.
 *
 * ICEFALL has always kept the athlete's world in localStorage — the onboarding
 * record, the settings, the recorded activities, the posts, the summit logs.
 * That is the app's REAL data path, and it needs no network. So the offline
 * build does not bypass those stores with a parallel set of reads; it writes
 * the sample athlete into them once, before anything reads them, and every
 * screen then works exactly as it does for a real athlete on a real device.
 *
 * Two consequences worth stating plainly:
 *
 *   · It skips handle-claim and onboarding by writing `onboarded: true`. That
 *     flag is the ONLY render gate between a cold start and /home — there is no
 *     auth gate on any shell route — so nothing has to be disabled to get in.
 *
 *   · IT OVERWRITES. Every reload of an offline build resets the demo to this
 *     state, which is what makes it a demo: click anything, change anything,
 *     reload, and it is clean again. That also means an offline build must
 *     never be pointed at a device holding real ICEFALL data — the flag is a
 *     deliberate, explicit, per-build opt-in for exactly this reason.
 *
 * Runs as a module side effect, and is imported FIRST in `main.tsx`, because
 * `settings/store.ts`, `social/posts.ts` and `social/summitLog.ts` all read
 * localStorage at module-evaluation time. Import order is execution order.
 */

import { DEMO } from "./offline";
import {
  OFFLINE_ACTIVITIES,
  OFFLINE_ATHLETE,
  OFFLINE_ATHLETE_META,
  OFFLINE_GOALS,
  OFFLINE_HOME_PLACE,
  OFFLINE_OWN_POSTS,
  OFFLINE_SETTINGS,
  OFFLINE_SUMMIT_LOGS,
} from "./fixtures";

const STATE_KEY = "icefall.state.v1";
const SETTINGS_KEY = "icefall.settings.v1";
const ACTIVITIES_KEY = "icefall.activities.v1";
const ATHLETE_KEY = "icefall.athlete.v1";
const POSTS_KEY = "icefall.posts.v1";
const SUMMIT_LOGS_KEY = "icefall.summit-logs.v1";
const LAST_PLACE_KEY = "icefall.places.last.v2";

function put(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or quota. The app still runs; it simply starts emptier.
  }
}

function seed() {
  /* DEMO, not OFFLINE — the identity is data source, not connectivity. This
     was the reader the flag split missed on the first pass, and the failure
     it caused was structural: with DEMO set and no seed, the app had no
     onboarded athlete, so the onboarding gate pushed toward /welcome while
     the route guard pushed back to /home, and the routed area rendered
     neither — a blank frame under a correct banner. A guard and a gate
     reading DIFFERENT flags for the same question is the §6aa shape again,
     enforced by two components against each other. */
  if (!DEMO) return;
  if (typeof localStorage === "undefined") return;

  /*
   * ONCE PER BROWSER, NOT ONCE PER PAGE LOAD — and this was a real bug, not a
   * tidy-up.
   *
   * `seed()` runs at import time, so before this guard it re-wrote the demo
   * athlete's settings, app state, posts, activities and saved place on EVERY
   * load. Anything typed into the app was therefore erased by the next
   * navigation: the owner reported it as "add social media doesnt work", and it
   * was true of the bio, the display name, the region and every other editable
   * field as well — they all saved correctly to `localStorage` and were all
   * flattened a moment later by this function.
   *
   * The demo is meant to OPEN populated, not to be un-editable. One marker, and
   * a version in its value so a future fixture change can deliberately re-seed
   * by bumping it.
   */
  const SEEDED_KEY = "icefall.offline.seeded.v1";
  try {
    if (localStorage.getItem(SEEDED_KEY) !== null) return;
  } catch {
    /* Storage refused. Fall through and seed: a demo that starts empty is
       worse than one that re-seeds, and without storage nothing persists to be
       overwritten anyway. */
  }

  const memberSince = new Date(Date.now() - 720 * 86_400_000).toISOString();

  put(STATE_KEY, {
    onboarded: true,
    memberSince,
    name: OFFLINE_ATHLETE.name,
    disciplines: ["mountaineering", "hiking", "ski-touring"],
    experience: "developing",
    customGoals: OFFLINE_GOALS,
    sessionOverrides: {},
    kudos: [],
    bodyMassKg: 71,
    hydrationMl: 1_650,
    autoPause: true,
    // Left to the app's own first-run seeding, which fills this from the ten
    // curated mountains — real local data that needs no fixture.
    objectives: undefined,
    threads: [],
    networkOptIn: false,
    locationOptIn: false,
  });

  put(SETTINGS_KEY, OFFLINE_SETTINGS);
  put(ACTIVITIES_KEY, OFFLINE_ACTIVITIES);
  put(ATHLETE_KEY, OFFLINE_ATHLETE_META);
  put(POSTS_KEY, OFFLINE_OWN_POSTS);
  put(SUMMIT_LOGS_KEY, OFFLINE_SUMMIT_LOGS);
  put(LAST_PLACE_KEY, OFFLINE_HOME_PLACE);

  /* Written LAST, so a seed interrupted half way through is retried on the next
     load rather than leaving the demo half-populated and marked done. */
  try {
    localStorage.setItem(SEEDED_KEY, new Date().toISOString());
  } catch {
    /* Storage refused — it will seed again next load, which is harmless. */
  }
}

seed();
