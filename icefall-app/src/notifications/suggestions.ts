import { useCallback, useEffect, useState } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { withTimeout } from "@/lib/netTimeout";
import { DEMO } from "@/offline/offline";
import { OFFLINE_SUGGESTED_PEOPLE } from "@/offline/fixtures";

/**
 * SUGGESTED PEOPLE — and the whole design of this file is an argument about
 * what the word "near" is allowed to mean here.
 *
 * The owner, 2026-09-06: "And suggested people based on near location".
 *
 * ── WHY THERE IS NO DISTANCE ANYWHERE IN THIS FILE ───────────────────────────
 *
 * ICEFALL's server holds NO COORDINATE FOR ANY PERSON. Not a rounded one, not a
 * coarse one, not one behind a flag. `profiles` carries exactly two location
 * facts — `location_label text` (a town or region, as typed) and `country_code
 * char(2)` — and the migration that added them
 * (`20260830100000_identity_username_location.sql`) says why, in capitals, at
 * line 93:
 *
 *     -- NO LATITUDE, NO LONGITUDE, AND NO GEOCODING OF THE LABEL.
 *     -- Turning "Chamonix" into a lat/lon and treating it as where somebody
 *     -- lives would manufacture precision from a free-text box.
 *
 * The app does hold ONE coordinate: the Expedition Network's ~5 km-coarsened
 * grid cell, `network/privacy.ts`. It is YOURS, it is opt-in, and it never
 * leaves this device — `state/AppState.tsx` is the only writer and no migration
 * receives it. So even with it, there is nothing on the other side of the
 * subtraction. No two people's positions have ever both been known to this app
 * at the same time.
 *
 * THEREFORE: no distance, no "2 km away", no band, no "nearby", no sort by
 * proximity, and no request for the location permission on this screen — asking
 * for a fix the feature cannot use is the worst version of this.
 *
 * ── WHAT IS ACTUALLY TRUE, AND IS THEREFORE WHAT THIS SHOWS ──────────────────
 *
 * Two people can both have typed a place into their own profile. That is a real
 * fact about both of them, and it is the strongest geographic statement this
 * database supports. So there are exactly two bases, and every suggestion
 * carries the one it was found by:
 *
 *   "place"    their `location_label` matches yours, ignoring case and
 *              surrounding space. A string coincidence between two free-text
 *              boxes — real, but it is agreement about a WORD, not about a
 *              position, and the heading says "say they're in", never "are in".
 *   "country"  their `country_code` matches yours. A country is not proximity —
 *              France is a thousand kilometres across — so this is offered as
 *              the weaker fallback it is, and labelled as the country it is.
 *
 * There is no third tier and no filler. If neither matches, the section is
 * empty and says which of the two possible empties it is (see `SuggestionState`).
 *
 * ── WHAT IS FILTERED, AND WHERE ──────────────────────────────────────────────
 *
 * BLOCKS ARE NOT FILTERED HERE, ON PURPOSE. `profiles_select`
 * (`20260903010000_block_and_report.sql`) already ends with `id not in (select
 * b.id from public.blocked_ids())`, and `blocked_ids()` is symmetric — it
 * covers blocks you placed AND blocks placed on you, which a client cannot see.
 * A second client-side definition of "blocked" is a second thing to drift.
 *
 * THREE THINGS ARE FILTERED HERE, because no policy does them:
 *
 *   · `account_status <> 'active'` — suspended and closed accounts are readable
 *     by everybody; `profiles_select` has no status arm. Suggesting a suspended
 *     account is a live bug, not a cosmetic one.
 *   · `username is null` — a Google/Apple sign-up gets a profile row before it
 *     has claimed a handle. Such a row is a display name and nothing else, and
 *     suggesting it hands a stranger a half-made account.
 *   · people you already follow, read from `follows` where `follower_id` is
 *     you. `follows_select` admits exactly that arm, so this is one cheap read
 *     and not an approximation.
 *
 * ── THE PRIVACY POINT THIS FEATURE CANNOT SOLVE, AND MUST NOT HIDE ───────────
 *
 * The app has a `profileVisibility` setting ("connections", "private"). IT DOES
 * NOTHING ON THE SERVER. `20260903020000_profile_fields_and_avatars.sql` says
 * so outright: "the app's `profileVisibility` setting does not exist on the
 * server. There is no policy behind it." Every signed-in account can already
 * read every profile.
 *
 * That was survivable while profiles were only reachable by typing a name into
 * search. A suggestions list PUSHES people at strangers who did not go looking,
 * which is a different thing, and it makes a dead toggle actively misleading.
 * This file does two things about it and cannot do a third:
 *
 *   1. It only ever suggests somebody who TYPED A PLACE INTO THEIR PROFILE —
 *      a deliberate, public act — rather than everybody who exists.
 *   2. `SUGGESTIONS_BASIS` is rendered under the heading so the reader is told
 *      the rule they are being matched by, and can work out that they are in
 *      other people's lists on the same terms.
 *
 * The real fix is a policy behind the visibility toggle, and it belongs in a
 * migration, not here.
 */

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** Which of the two true statements found this person. Never inferred. */
export type SuggestionBasis = "place" | "country";

export interface SuggestedPerson {
  /** `profiles.id`. */
  id: string;
  /** `profiles.display_name`. Required — a nameless row is dropped. */
  name: string;
  /** `profiles.username`. REQUIRED here, unlike elsewhere: see the filters. */
  handle: string;
  /** `profiles.avatar_url`. Absent is ordinary; the caller draws initials. */
  avatarUrl?: string;
  /**
   * `profiles.location_label` as they typed it, shown as they typed it.
   * Null where they gave only a country.
   */
  locationLabel: string | null;
  /** `profiles.country_code`. */
  countryCode: string | null;
  basis: SuggestionBasis;
}

/**
 * Every way this section can be, and they are not interchangeable.
 *
 * `no-location` is the one worth reading twice. It is not a failure and not an
 * empty result: ICEFALL cannot match a place for somebody who has not said
 * where they are, and the honest response is to say so and offer the setting —
 * not to quietly show an empty list that reads as "nobody is near you".
 */
export type SuggestionState =
  | "loading"
  | "ready"
  | "no-backend"
  | "signed-out"
  | "no-location"
  | "no-matches"
  | "not-live"
  | "unreachable"
  | "refused";

type Failure = "not-live" | "unreachable" | "refused";

/**
 * What the headings are allowed to say, and each is only ever a measured match.
 *
 * BOTH FIELDS, NOT ONE. An earlier version returned a single "matched" value
 * and the screen put every suggestion under it — so a country match sat under a
 * heading naming a town, and the section stated as fact that somebody in
 * Grenoble was in Chamonix. Two labels, two headings, and each person is filed
 * under the one that actually found them.
 */
export interface MyPlace {
  /** The reader's `location_label`, as they typed it. Null if they gave none. */
  label: string | null;
  /** The reader's `country_code`. Null if they gave none. */
  countryCode: string | null;
}

export interface Suggestions {
  people: SuggestedPerson[];
  state: SuggestionState;
  /** Set for every state except `loading` and `ready`. Rendered as written. */
  message?: string;
  /** Null unless `state === "ready"`. The headings have nothing true to say. */
  matched: MyPlace | null;
  canRetry: boolean;
  reload(): void;
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The rule, under the heading, in the reader's own interest — see the privacy
 * note in the header. It says what the match IS so nobody reads the section as
 * proximity, and it says the reciprocal so nobody is surprised to be in it.
 */
export const SUGGESTIONS_BASIS =
  "Matched on what people put on their own profile — the same town, or failing that the same country. ICEFALL stores no coordinates and cannot measure how far away anybody is, so this is two profiles agreeing on a word rather than a distance. You appear in their list on the same terms.";

export const SUGGESTIONS_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so there are no other accounts to suggest. Nothing is missing here — nothing was asked for.";

export const SUGGESTIONS_SIGNED_OUT =
  "Suggestions are matched against your own profile, so ICEFALL has to be signed in to make them.";

/**
 * The read succeeded and nobody came back.
 *
 * ITS OWN SENTENCE, because it is its own fact. This is the most likely state
 * on a young database — the query already excludes you, suspended and closed
 * accounts, accounts that have not claimed a handle, and everybody you already
 * follow — and it is an ANSWER, not a failure, so it carries no retry. Drawing
 * nothing at all for it, which is what this screen did until 2026-09-06, leaves
 * a reader unable to tell a working feature from a broken one. The `{place}` is
 * filled in by the screen so the sentence names what was actually matched
 * against.
 */
export const SUGGESTIONS_NO_MATCHES =
  "Nobody else has put that on their profile yet, so ICEFALL has nobody to suggest. Most accounts have not said where they are — this is an answer rather than a failed read.";

export const SUGGESTIONS_NO_LOCATION =
  "You have not told ICEFALL where you are, so there is nothing to match anybody against. Add a town or region to your profile and people who typed the same one will show up here.";

export const SUGGESTIONS_NOT_LIVE =
  "Suggestions are not live on ICEFALL's server yet. Nobody is being hidden from you — the read is simply not available.";

export const SUGGESTIONS_UNREACHABLE =
  "ICEFALL could not reach the server, so it has nobody to suggest. This is a failed request rather than an answer.";

export const SUGGESTIONS_REFUSED =
  "ICEFALL's server refused that read, so it has nobody to suggest. This is a refusal rather than an answer.";

const MESSAGES: Record<Exclude<SuggestionState, "loading" | "ready">, string> = {
  "no-backend": SUGGESTIONS_NO_BACKEND,
  "signed-out": SUGGESTIONS_SIGNED_OUT,
  "no-location": SUGGESTIONS_NO_LOCATION,
  "no-matches": SUGGESTIONS_NO_MATCHES,
  "not-live": SUGGESTIONS_NOT_LIVE,
  unreachable: SUGGESTIONS_UNREACHABLE,
  refused: SUGGESTIONS_REFUSED,
};

/** Only the failures — the other three mean nothing was asked in the first place. */
const RETRYABLE: Record<Failure, true> = {
  "not-live": true,
  unreachable: true,
  refused: true,
};

/* -------------------------------------------------------------------------- */
/* Budget and limits                                                           */
/* -------------------------------------------------------------------------- */

const untyped = supabase as unknown as SupabaseClient | null;

/**
 * This whole section is secondary to the notices above it, so it gets a shorter
 * budget than they do (8 s): a suggestions rail still thinking long after the
 * notifications have drawn just looks broken.
 */
const SUGGESTIONS_TIMEOUT_MS = 6_000;

/**
 * SEPARATELY BUDGETED, and this is the hang the codebase has already been
 * bitten by twice. `getSession()` can go to the network to refresh a token, and
 * an `.abortSignal()` on the queries below cannot protect a call made before
 * them. `lib/netTimeout.ts` records the original: credentials present, network
 * dead-but-not-absent, and `useMyProfile` sits on `loading` for ever.
 */
const SESSION_TIMEOUT_MS = 3_000;

/**
 * How many rows to pull before filtering. Bigger than what is shown because the
 * two client-side filters (already-followed, and the place/country partition)
 * both remove rows, and a limit applied before them would silently under-fill.
 */
const FETCH_LIMIT = 60;

/**
 * How many people the section shows. Five is Instagram's own shape and it is
 * about right for a strip under a notifications list — this is a nudge, not a
 * directory, and there is no "See all" because there is no directory screen to
 * send anybody to.
 */
export const SUGGESTIONS_SHOWN = 5;

/** The most follows to read when working out who to leave out. */
const FOLLOWS_LIMIT = 1000;

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Which honest absence a PostgREST error is. Same reasoning about `42501` as
 * `notifications/social.ts` — a permission denial against a correctly deployed
 * server is what an unresolved JWT looks like, so it is a refusal and never a
 * claim about the deployment.
 *
 * "TIMED OUT" IS IN THE LIST, AND ITS ABSENCE WAS THE BUG THIS FILE EXISTED TO
 * AVOID. `withTimeout` builds its deadline from `AbortSignal.timeout`, which
 * aborts with a **TimeoutError**, not an AbortError; postgrest-js renders that
 * as "TimeoutError: signal timed out", which contains none of "fetch", "abort"
 * or "network". So the one case both deadlines were written for — hut wifi that
 * accepts the connection and never answers — fell through to `refused` and
 * printed "ICEFALL's server refused that read", which is a claim about the
 * server on the strength of the client giving up. A cancelled controller is the
 * one that says "abort". `social/promoted.ts` tests both words for the same
 * reason; this is that test.
 */
function classify(error: PostgrestError | null): Failure {
  if (!error) return "unreachable";
  const code = error.code ?? "";
  if (code === "PGRST205" || code === "42P01") return "not-live";
  const message = (error.message ?? "").toLowerCase();
  if (
    message.includes("fetch") ||
    message.includes("abort") ||
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("timeout")
  ) {
    return "unreachable";
  }
  return "refused";
}

/**
 * Escape a free-text value for a PostgREST `ilike`.
 *
 * `%` and `_` are SQL's own wildcards and `*` is PostgREST's alias for `%`, so
 * all three have to stop meaning what they mean — an unescaped `%` in somebody's
 * town would match every account on the platform. `\` goes first because it is
 * the escape character itself.
 *
 * `*` CANNOT BE BACKSLASHED, which the first version of this got wrong. SQL's
 * `like ... escape '\'` knows about `%` and `_` and nothing else; PostgREST
 * translates `*` to `%` before the SQL is built, so `\*` arrived as a literal
 * `\%` — an escaped wildcard, not an escaped asterisk, matching nothing and
 * silently emptying the list for anybody whose place name contains a star.
 * `*` is replaced with `_`, `like`'s single-character wildcard, which matches
 * the asterisk itself and is the closest true thing available.
 */
function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&").replace(/\*/g, "_");
}

/** Two free-text boxes agree when they agree ignoring case and outer space. */
function samePlace(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

interface ProfileRow {
  id: unknown;
  display_name: unknown;
  username: unknown;
  avatar_url: unknown;
  location_label: unknown;
  country_code: unknown;
  account_status: unknown;
}

type ReadResult =
  | { kind: "ready"; people: SuggestedPerson[]; matched: MyPlace }
  | { kind: Exclude<SuggestionState, "loading" | "ready"> };

async function read(signal: AbortSignal): Promise<ReadResult> {
  if (!supabase || !untyped) return { kind: "no-backend" };

  /* The session, on its own deadline. A rejection here is a failed request,
     not a signed-out reader — collapsing the two would tell somebody they are
     signed out because a token refresh timed out. */
  let me: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const session = await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("session timeout")), SESSION_TIMEOUT_MS);
      }),
    ]);
    /*
     * READ THE ERROR. `getSession()` does not reject when a token refresh
     * fails over the network — supabase-auth-js RESOLVES with
     * `{ data: { session: null }, error }`. So the `catch` below never fires on
     * the common failure, and without this line a signed-in athlete on hut wifi
     * was told "ICEFALL has to be signed in", with no retry, because their
     * token happened to need refreshing.
     *
     * The field is an exact discriminator: a genuinely signed-out reader gets
     * `error: null` from the early return, and only a failed refresh carries
     * one — so this cannot misclassify a real sign-out as a network fault.
     */
    if (session.error) return { kind: "unreachable" };
    me = session.data.session?.user.id ?? null;
  } catch {
    return { kind: "unreachable" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  if (signal.aborted) return { kind: "unreachable" };
  if (!me) return { kind: "signed-out" };

  /* My own place. Read here rather than through `useMyProfile` because that
     hook has no deadline on its own `getSession`, and because this needs
     exactly two columns. */
  const mineQuery = untyped
    .from("profiles")
    .select("location_label, country_code")
    .eq("id", me);
  const mineDeadline = withTimeout(SUGGESTIONS_TIMEOUT_MS, signal);
  /* `.abortSignal()` BEFORE `.maybeSingle()`: it is declared on
     PostgrestTransformBuilder and returns `this`, while `maybeSingle()` returns
     a PostgrestBuilder that no longer has it. Same trap, same order, as the
     follow lookup in `social/follow.ts`. */
  const mine = await (mineDeadline ? mineQuery.abortSignal(mineDeadline) : mineQuery).maybeSingle();
  if (mine.error) return { kind: classify(mine.error) };

  const myPlace = str((mine.data as { location_label?: unknown } | null)?.location_label);
  const myCountry = str((mine.data as { country_code?: unknown } | null)?.country_code);
  if (!myPlace && !myCountry) return { kind: "no-location" };

  /*
   * TWO READS, NOT ONE — and the single read that was here was wrong.
   *
   * It filtered on `country_code` alone and made the finer place match
   * client-side, on the reasoning that "everybody who typed my exact place is,
   * necessarily, also in my country". THAT IMPLICATION DOES NOT HOLD IN THIS
   * SCHEMA. `location_label` and `country_code` are two independent nullable
   * columns, and this app writes them independently: `settings/sync.ts` maps
   * the profile's region to `location_label` verbatim and to `country_code`
   * NOTHING — the country is a separate optional picker whose default option is
   * "Prefer not to say", over a list of only 43 countries. So the moment the
   * reader had a country set, every same-town profile with a null country — the
   * app's own documented default — was filtered out on the server before the
   * place match ever ran. The tier the feature exists for was the tier being
   * dropped.
   *
   * So the place is asked for on its own terms. `escapeLike` is why this is a
   * separate query rather than one `.or(...)`: PostgREST's or-filter is comma-
   * delimited and a place name is free text — this app's own placeholder for it
   * is "Athens, Greece" — so a comma in the value would be read as a filter
   * separator.
   *
   * `account_status` is filtered in the QUERY rather than after it, so a page
   * full of suspended accounts cannot crowd out the live ones.
   */
  const COLUMNS =
    "id, display_name, username, avatar_url, location_label, country_code, account_status";

  const base = () =>
    untyped
      .from("profiles")
      .select(COLUMNS)
      .neq("id", me)
      .eq("account_status", "active")
      .not("username", "is", null)
      .limit(FETCH_LIMIT);

  /* PostgREST builders are thenable but not `Promise`s, so they are awaited
     into this shape rather than typed as one. */
  const reads: PromiseLike<{ data: unknown; error: PostgrestError | null }>[] = [];

  if (myPlace) {
    /*
     * The place read is NOT ordered by `created_at`. The country read is, and
     * has to be — it is a slice of a whole country and something has to decide
     * which slice. Here the filter has already done the deciding: everybody it
     * returns typed the same town, so ordering by join date would only decide
     * which of two equally-good matches gets dropped at the limit, and newest
     * -first would quietly hide the people who have been there longest.
     */
    const q = base().ilike("location_label", escapeLike(myPlace.trim()));
    const d = withTimeout(SUGGESTIONS_TIMEOUT_MS, signal);
    reads.push(d ? q.abortSignal(d) : q);
  }

  if (myCountry) {
    const q = base().eq("country_code", myCountry).order("created_at", { ascending: false });
    const d = withTimeout(SUGGESTIONS_TIMEOUT_MS, signal);
    reads.push(d ? q.abortSignal(d) : q);
  }

  const answers = await Promise.all(reads);
  for (const a of answers) if (a.error) return { kind: classify(a.error) };

  /*
   * Merge by id, first write wins. The place read is pushed first, so a person
   * who satisfies both filters is seen once, from the place read — and the
   * partition below then files them under the finer of the two matches.
   */
  const rows = new Map<string, ProfileRow>();
  for (const a of answers) {
    for (const raw of (a.data ?? []) as ProfileRow[]) {
      const id = str(raw.id);
      if (id && !rows.has(id)) rows.set(id, raw);
    }
  }

  /* Who I already follow. A failure here fails the whole section rather than
     showing people I follow as suggestions — the wrong list is worse than no
     list, and "follow" on somebody I already follow is a tap that does nothing
     visible. */
  const followsQuery = untyped
    .from("follows")
    .select("followed_profile_id")
    .eq("follower_id", me)
    .not("followed_profile_id", "is", null)
    .limit(FOLLOWS_LIMIT);
  const followsDeadline = withTimeout(SUGGESTIONS_TIMEOUT_MS, signal);
  const follows = await (followsDeadline ? followsQuery.abortSignal(followsDeadline) : followsQuery);
  if (follows.error) return { kind: classify(follows.error) };

  const already = new Set<string>();
  for (const row of (follows.data ?? []) as { followed_profile_id?: unknown }[]) {
    const id = str(row.followed_profile_id);
    if (id) already.add(id);
  }

  const place: SuggestedPerson[] = [];
  const country: SuggestedPerson[] = [];

  for (const raw of rows.values()) {
    const id = str(raw.id);
    const name = str(raw.display_name);
    const handle = str(raw.username);
    /* All three are required and a row missing any of them is DROPPED, never
       filled in. A suggestion under a name nobody holds, or a handle that
       cannot be reached, is an invented person. */
    if (!id || !name || !handle) continue;
    if (already.has(id)) continue;

    const label = str(raw.location_label);
    const person: Omit<SuggestedPerson, "basis"> = {
      id,
      name,
      handle,
      avatarUrl: str(raw.avatar_url) ?? undefined,
      locationLabel: label,
      countryCode: str(raw.country_code),
    };

    if (myPlace && label && samePlace(label, myPlace)) {
      place.push({ ...person, basis: "place" });
    } else if (myCountry) {
      country.push({ ...person, basis: "country" });
    }
  }

  /* The finer match first, always — somebody who typed the same town is a
     better answer than somebody who typed the same country, and the two are
     never mixed into one undifferentiated list. */
  const people = [...place, ...country].slice(0, SUGGESTIONS_SHOWN);

  /* Nobody survived the filters. Not a failure and not an empty `ready`: the
     screen has a sentence for this and it needs the state to reach for it. */
  if (people.length === 0) return { kind: "no-matches" };

  /* The reader's own two labels, handed back so the screen can head each group
     with the thing that actually found the people in it. Neither is inferred —
     they are the two columns read at the top of this function. */
  return { kind: "ready", people, matched: { label: myPlace, countryCode: myCountry } };
}

/* -------------------------------------------------------------------------- */

/**
 * THE DEMO ANSWER, and why it is a branch in this file rather than a fixture
 * the server path happens to find.
 *
 * A DEMO build has no Supabase client at all (`backend/client.ts` returns null
 * when `DEMO`), so the server path above cannot run and every other social
 * surface in the build — the community feed, the guides, the message threads —
 * is already drawn from `offline/fixtures.ts`. A suggestions section that alone
 * stayed empty would not be more honest; it would just be inconsistent with the
 * six invented posts directly above it.
 *
 * The people are the SAME invented accounts that write those posts, so the
 * demo does not gain a single new fictional person. Nothing here can reach a
 * real build: `DEMO` is a build-time flag and `OFFLINE_SUGGESTED_PEOPLE` is
 * `[]` unless it is set at build time.
 *
 * THE SCREEN DOES NOT BADGE THIS AS SAMPLE DATA, and an earlier version of this
 * comment claimed it did. It does not, anywhere, and that is the owner's
 * standing instruction for the shared preview builds — "remove demo as well. no
 * one is seeing it so need to know how it looks" (2026-09-05). The protection
 * is the build flag, not a label.
 */
function demoAnswer(): ReadResult {
  return {
    kind: "ready",
    people: OFFLINE_SUGGESTED_PEOPLE.slice(0, SUGGESTIONS_SHOWN),
    /* Wren Calloway's demo profile says Chamonix, France — the same two values
       a real read would return for her. */
    matched: { label: "Chamonix", countryCode: "FR" },
  };
}

export function useSuggestedPeople(): Suggestions {
  const [people, setPeople] = useState<SuggestedPerson[]>([]);
  const [matched, setMatched] = useState<MyPlace | null>(null);
  const [state, setState] = useState<SuggestionState>("loading");
  const [manual, setManual] = useState(0);

  useEffect(() => {
    if (DEMO) {
      const answer = demoAnswer();
      if (answer.kind === "ready") {
        setPeople(answer.people);
        setMatched(answer.matched);
        setState("ready");
      }
      return;
    }

    const controller = new AbortController();
    setState("loading");

    /* `.catch` is not optional. An unhandled rejection anywhere in `read` would
       leave this section on "loading" for ever, which is the exact spinner the
       deadlines above exist to prevent. */
    void read(controller.signal)
      .then((answer) => {
        if (controller.signal.aborted) return;
        if (answer.kind === "ready") {
          setPeople(answer.people);
          setMatched(answer.matched);
          setState("ready");
          return;
        }
        /* A failure shows NOTHING rather than the last good list: a stale
           suggestion is a person who may since have blocked you. */
        setPeople([]);
        setMatched(null);
        setState(answer.kind);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setPeople([]);
        setMatched(null);
        setState("unreachable");
      });

    return () => controller.abort();
  }, [manual]);

  const reload = useCallback(() => setManual((n) => n + 1), []);

  return {
    people,
    state,
    message: state === "loading" || state === "ready" ? undefined : MESSAGES[state],
    matched: state === "ready" ? matched : null,
    canRetry: RETRYABLE[state as Failure] === true,
    reload,
  };
}
