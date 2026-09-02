/**
 * PEOPLE — the first search source in ICEFALL that asks a server.
 *
 * WHAT CHANGED, AND WHY THIS FILE EXISTS AT ALL
 *
 * Until now the honest answer to "find me a climber called Alex" was that there
 * was nobody to find: `src/network/directory.ts` holds `DISCOVERABLE_ATHLETES`,
 * a deliberately EMPTY list with a safety argument in its header (an invented
 * climbing partner is a hazard, not a placeholder), and `Search.tsx` said so in
 * words rather than letting an empty list read as "no such person".
 *
 * That is now out of date, and this file is the reason. `public.profiles` is
 * live, and its policy is
 *
 *     create policy profiles_select on public.profiles
 *       for select to authenticated using (true)
 *
 * so a SIGNED-IN account may read any profile row. Real accounts returned by the
 * server are a completely different thing from a seeded fixture: nobody here was
 * invented by ICEFALL, every row is somebody who made an account. `DISCOVERABLE_
 * ATHLETES` stays empty — this does not add to it and must never be used as an
 * excuse to.
 *
 * THE THREE EMPTY STATES ARE THREE DIFFERENT SENTENCES. An empty people list can
 * mean "nobody by that name", "you are signed out so the directory is closed to
 * you", or "we could not reach the server". Rendering the same silence for all
 * three is the lie this file is built to avoid, which is why `state` is a
 * five-way union and not a boolean, and why the copy lives here as exported
 * constants rather than being re-invented on the screen.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/backend/client";
import { countryName } from "@/auth/useMyProfile";
import { withTimeout } from "@/lib/netTimeout";

/* -------------------------------------------------------------------------- */
/* The shared result shape                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One row in global search, whatever it came from.
 *
 * DECLARED HERE ON PURPOSE. Four sources (people, treks, groups, trails) were
 * built in parallel against this exact contract, and a shared `src/search/
 * types.ts` written by four hands at once is a merge accident waiting to
 * happen. TypeScript is structural, so an identical declaration in each source
 * interoperates with all the others; when the sources settle, one of these
 * moves to a shared module and the rest re-export it.
 */
export type SearchHit = {
  id: string;
  kind: "person" | "trek" | "group" | "trail";
  title: string;
  /** One short line: region, country, member count. */
  subtitle?: string;
  /** The route to open. Empty string means "nowhere" — see `PERSON_ROUTE`. */
  to: string;
  /** Omitted rather than filled with a placeholder. */
  imageUrl?: string;
  /** An honesty note, e.g. "No profile page yet". */
  note?: string;
};

export type PeopleSearchState = "idle" | "searching" | "ready" | "signed-out" | "error";

export type PeopleSearchResult = {
  hits: SearchHit[];
  state: PeopleSearchState;
  /** Present whenever an empty list needs explaining. */
  message?: string;
};

/* -------------------------------------------------------------------------- */
/* Copy — one place, so two surfaces cannot make different promises            */
/* -------------------------------------------------------------------------- */

/**
 * Signed out. NOT "nobody matched" — the directory is simply closed.
 *
 * `profiles_select` grants `to authenticated`, so an anonymous request gets an
 * empty result set from Postgres rather than an error. Returning that as an
 * ordinary empty list would tell a visitor their friend has no ICEFALL account
 * when the truth is that nobody at all is visible to them.
 */
export const PEOPLE_SIGNED_OUT =
  "Sign in to search people. ICEFALL only lets signed-in accounts read the climber directory, so this is not “nobody by that name” — nobody is visible from here at all.";

/** The request went out and did not come back. Never dress this as a result. */
export const PEOPLE_UNREACHABLE =
  "People search could not run — ICEFALL could not reach the server. That is different from finding nobody: this name has not actually been looked up.";

/** No client exists at all: the offline build, or a build with no credentials. */
export const PEOPLE_NO_SERVER =
  "This build is not connected to a server, so there is no account directory to search. Mountains, treks and trails still work offline; people do not.";

/** Signed in, request answered, genuinely nobody. The ordinary case. */
export const PEOPLE_NO_MATCH = "No ICEFALL account has that handle or name.";

/**
 * Said once under the list, to separate these rows from everything else on this
 * screen: the groups above them can be placeholders and the trails carry an
 * archive attribution, while these are accounts somebody actually made.
 *
 * IT NO LONGER SAYS THE ROWS GO NOWHERE. Until `/explore/people/:id` landed
 * this sentence's second half read "There is no profile page to open yet, so
 * the rows do not lead anywhere", which was true and is now the opposite of
 * true — a dead-end warning on a row that opens is the same class of mistake as
 * a fabricated number, just pointing the other way. What replaces it is the one
 * caveat that survives: ICEFALL has checked nobody, so finding an account here
 * is not ICEFALL vouching for the person behind it.
 */
export const PEOPLE_SOURCE_NOTE =
  "These are real ICEFALL accounts. ICEFALL has not verified anybody's identity, qualifications or experience, so treat a profile as what somebody says about themselves.";

/**
 * WHERE A PERSON ROW GOES: `/explore/people/:id`, which now exists.
 *
 * IT DID NOT WHEN THIS WAS WRITTEN, and the reasoning then was sound —
 * `AthleteProfile` read local state, and `App.tsx` declared this path twice
 * with a `<Navigate>` winning, so a row linking here would have taken somebody
 * who just found a real account to an empty tab. Both halves of that are fixed:
 * the redirect is gone, and the screen reads `profiles` from the server through
 * `social/publicProfile.ts`.
 *
 * BY ID, NOT BY HANDLE, even though the screen accepts either. A handle can be
 * changed or given up; `profiles.id` is the account. A search result is also
 * one of the two places (the other being a share link) where the id is already
 * in hand, so there is nothing to gain by spending the mutable key.
 */
export const PERSON_ROUTE = "/explore/people/";

/* -------------------------------------------------------------------------- */
/* Tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Two characters, not one.
 *
 * `%a%` matches most accounts on the platform, which is a directory dump rather
 * than a search — and it is the most expensive query the box can send, fired on
 * the first keystroke of every session.
 */
const MIN_QUERY = 2;

/** Long enough that a fast typist sends one request per word, not per letter. */
const DEBOUNCE_MS = 250;

/**
 * Search must never freeze the box, so people get a short budget and then get
 * dropped. Deliberately under the 5 s the Explore→Find search allows itself:
 * this runs beside sources that answer instantly from memory, and a section
 * that is still thinking five seconds after the peaks arrived just looks broken.
 */
const PEOPLE_TIMEOUT_MS = 4_000;

/**
 * SEPARATELY BUDGETED, because it is the hang this codebase has already been
 * bitten by. `netTimeout.ts` records it: nothing puts a timeout on supabase-js,
 * so with credentials present and the network dead-but-not-absent (hut wifi, a
 * captive portal) `useMyProfile` sits on `loading` for ever. `getSession()` can
 * refresh a token over the network, so it gets a deadline of its own — the
 * `.abortSignal()` on the queries below cannot protect a call made before them.
 */
const SESSION_TIMEOUT_MS = 3_000;

/** Enough to rank properly, few enough that a broad prefix stays cheap. */
const FETCH_LIMIT = 40;

/** What the screen actually shows. Twenty is already more than anybody reads. */
const MAX_HITS = 20;

const COLUMNS = "id, display_name, username, avatar_url, location_label, country_code";

type ProfileRow = {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  location_label: string | null;
  country_code: string | null;
};

/* -------------------------------------------------------------------------- */
/* Query building                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Strip the characters that would turn a search into a wildcard.
 *
 * PostgREST accepts `*` as an alias for `%` in `like`/`ilike`, so BOTH are live
 * wildcards in a value the user typed. Left in, a single `*` matches every
 * account on the platform — someone typing a stray asterisk gets handed the
 * directory. `_` (match-any-single-character) is deliberately KEPT: it is a
 * legal username character, and dropping it would break the search for anyone
 * called `alex_g`. The cost is that `alex_g` also matches `alexbg`, which is a
 * superset of the right answer rather than a wrong one.
 */
function likeSafe(needle: string): string {
  return needle.replace(/[%*]/g, "");
}

/**
 * Rank: exact handle, then handle prefix, then name prefix, then anywhere.
 *
 * Sorted alphabetically inside each band and by nothing else. There is no
 * popularity, no follower count and no activity score in this ordering, because
 * ICEFALL does not rank people against each other anywhere else either and a
 * search result is not the place to start.
 */
function rankOf(row: ProfileRow, needle: string): number {
  const handle = (row.username ?? "").toLowerCase();
  const name = row.display_name.toLowerCase();
  if (handle === needle) return 0;
  if (handle.startsWith(needle)) return 1;
  if (name === needle || name.startsWith(needle)) return 2;
  return 3;
}

/**
 * `@handle · Chamonix, France` — and nothing else.
 *
 * `role` is on the row and is NOT rendered. "Guide" beside a name would read as
 * ICEFALL having checked somebody's qualifications, which is the exact claim the
 * guide screens spend their credential-status wording avoiding. A person's
 * professional standing is a thing their own profile establishes, not a word
 * search puts under their name.
 *
 * `location_label` is a town or region the person typed, never an address and
 * never geocoded — see the column's own note in `backend/types.ts`.
 */
function subtitleFor(row: ProfileRow): string | undefined {
  const bits: string[] = [];
  if (row.username) bits.push(`@${row.username}`);
  const place = row.location_label ?? countryName(row.country_code);
  if (place) bits.push(place);
  return bits.length ? bits.join(" · ") : undefined;
}

function toHit(row: ProfileRow): SearchHit {
  return {
    id: row.id,
    kind: "person",
    title: row.display_name,
    subtitle: subtitleFor(row),
    // `encodeURIComponent` on a value the uuid column already constrains is
    // belt and braces, and kept because this is the only place the id crosses
    // into a url — the cost is nothing and the alternative is trusting a column
    // type from the far side of the network.
    to: `${PERSON_ROUTE}${encodeURIComponent(row.id)}`,
    // Omitted rather than defaulted: a stock avatar on a real person is a small
    // fabrication, and the row renders a perfectly good initial without one.
    imageUrl: row.avatar_url ?? undefined,
  };
}

/**
 * Race a promise that has no cancellation of its own against the clock.
 *
 * Returns the sentinel rather than throwing so the caller has to handle the
 * timeout explicitly instead of catching it by accident alongside real errors.
 */
const TIMED_OUT = Symbol("timed-out");
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* The search itself                                                           */
/* -------------------------------------------------------------------------- */

/**
 * One search, outside React, so it can be tested and reused.
 *
 * TWO QUERIES, NOT ONE `.or()`, AND THIS IS THE INTERESTING DECISION. The single
 * request version is
 *
 *     .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
 *
 * and that string is parsed by PostgREST: a comma ends the first condition, a
 * closing parenthesis ends the group. Both are characters a person can type
 * into a search box. Getting it right needs the value double-quoted and inner
 * quotes and backslashes escaped — correct, but it is hand-rolled escaping in a
 * filter language, and the failure mode when it is subtly wrong is a query that
 * means something other than what was typed. Two plain `.ilike()` filters cannot
 * be broken by any character at all, because a comma in a single filter's value
 * is just a comma.
 *
 * They are issued in PARALLEL, so the cost is one extra request and no extra
 * wall-clock time — the wait is the slower of the two, not the sum.
 *
 * RETURNS `state: "searching"` TO MEAN "you cancelled me, I have no answer".
 * There is no honest result to give for a query the caller has abandoned, and a
 * sentinel the caller must handle is safer than an empty `ready` that would
 * render as "nobody by that name".
 */
export async function searchPeople(
  query: string,
  signal: AbortSignal,
): Promise<PeopleSearchResult> {
  const needle = likeSafe(query.trim().toLowerCase());
  if (needle.length < MIN_QUERY) return { hits: [], state: "idle" };
  if (!supabase) return { hits: [], state: "error", message: PEOPLE_NO_SERVER };

  const client = supabase;

  const session = await withDeadline(client.auth.getSession(), SESSION_TIMEOUT_MS);
  if (signal.aborted) return { hits: [], state: "searching" };
  if (session === TIMED_OUT || session.error) {
    return { hits: [], state: "error", message: PEOPLE_UNREACHABLE };
  }
  if (!session.data.session) {
    return { hits: [], state: "signed-out", message: PEOPLE_SIGNED_OUT };
  }

  // The caller's signal (the query changed, or the screen closed) and the budget
  // combined, so both still abort the request. `withTimeout` only returns
  // undefined when it was handed nothing to fall back to.
  const deadline = withTimeout(PEOPLE_TIMEOUT_MS, signal) ?? signal;
  const pattern = `%${needle}%`;

  const [byHandle, byName] = await Promise.all([
    client.from("profiles").select(COLUMNS).ilike("username", pattern).limit(FETCH_LIMIT)
      .abortSignal(deadline),
    client.from("profiles").select(COLUMNS).ilike("display_name", pattern).limit(FETCH_LIMIT)
      .abortSignal(deadline),
  ]);

  // OUR OWN CANCELLATION IS A NON-EVENT. An aborted request and an expired
  // budget raise the same AbortError, and `netTimeout.ts` records what happens
  // when the two are conflated: either every keystroke reports a failure, or a
  // real timeout renders as an empty list that reads as "nobody by that name".
  // The caller's signal is what tells them apart.
  if (signal.aborted) return { hits: [], state: "searching" };
  if (byHandle.error || byName.error) {
    return { hits: [], state: "error", message: PEOPLE_UNREACHABLE };
  }

  // A person matching on both handle and name comes back in both result sets.
  const seen = new Map<string, ProfileRow>();
  for (const row of [...(byHandle.data ?? []), ...(byName.data ?? [])]) {
    if (!seen.has(row.id)) seen.set(row.id, row);
  }

  const ranked = [...seen.values()].sort((a, b) => {
    const byRank = rankOf(a, needle) - rankOf(b, needle);
    if (byRank !== 0) return byRank;
    return a.display_name.localeCompare(b.display_name);
  });

  const hits = ranked.slice(0, MAX_HITS).map(toHit);
  return {
    hits,
    state: "ready",
    message: hits.length === 0 ? PEOPLE_NO_MATCH : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * People, for a search box that is being typed into.
 *
 * TYPING MUST NEVER STALL. Everything below the debounce is asynchronous and
 * abortable: the effect's cleanup aborts the in-flight request the moment the
 * query changes, so a slow request for "ale" cannot land after "alex" and
 * overwrite it, and no keystroke ever waits on the network.
 *
 * HITS ARE CLEARED WHEN THE QUERY CHANGES, not carried over while the new
 * request runs. Keeping them would be smoother, and it would mean showing the
 * answer to a question the person has stopped asking — rows for "ale" sitting
 * under the word "alexandra" as though they were the result.
 */
export function usePeopleSearch(query: string): PeopleSearchResult {
  const needle = query.trim().toLowerCase();
  const [result, setResult] = useState<PeopleSearchResult>({ hits: [], state: "idle" });

  useEffect(() => {
    // Answered without touching the network, so it must not go through the
    // debounce — a short query would otherwise leave a "searching" flicker for
    // a search that is never going to be sent.
    if (likeSafe(needle).length < MIN_QUERY) {
      setResult({ hits: [], state: "idle" });
      return;
    }
    if (!supabase) {
      setResult({ hits: [], state: "error", message: PEOPLE_NO_SERVER });
      return;
    }

    setResult({ hits: [], state: "searching" });

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchPeople(needle, controller.signal)
        .then((next) => {
          // `searchPeople` returns "searching" when it noticed our abort.
          // Writing that would strand the section on a spinner belonging to a
          // query that no longer exists; the effect replacing this one has
          // already set its own state.
          if (controller.signal.aborted || next.state === "searching") return;
          setResult(next);
        })
        // NOTHING BELOW IS EXPECTED TO THROW — postgrest-js turns an aborted
        // fetch into an `error` field rather than a rejection, and `getSession`
        // returns its error too. But an unhandled rejection here does not just
        // log: it leaves `state` on "searching" for ever, which is the one
        // outcome with no honest sentence attached to it. A thrown error is
        // still a search that could not run, and says so.
        .catch(() => {
          if (controller.signal.aborted) return;
          setResult({ hits: [], state: "error", message: PEOPLE_UNREACHABLE });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [needle]);

  return result;
}
