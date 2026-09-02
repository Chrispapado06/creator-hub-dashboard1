import { useMemo } from "react";

import { MOUNTAINS } from "@/data/mock/mountains";
import { TREKS, trekRegion } from "@/treks";
import { trekHasPhoto, trekImage } from "@/treks/images";
import type { Trek } from "@/treks/model";
import { DEMO_GROUPS, SHOW_DEMO_GROUPS, type DemoGroup } from "@/social/demoGroups";
import {
  SHARED_GROUPS_NOT_LIVE,
  SHARED_GROUPS_UNREACHABLE,
  useSharedGroups,
  type MountainGroup,
  type SharedGroups,
} from "@/network/interest";
import { destinationIdForPeak } from "@/enquiries/send";
import { formatWindow } from "@/network/groups";
import type { Expedition } from "@/network/types";
import { useApp } from "@/state/AppState";

/**
 * TREKS AND GROUPS, for the one search box on Home.
 *
 * `screens/Search.tsx` already reaches the app's places, your objectives, your
 * recorded activities, the peak catalogue, guides and companies. It could not
 * reach the 252-route trek catalogue or a group, which is most of what the
 * owner meant by "search up anything". This module adds those two, and nothing
 * else — people and trails are separate modules owned by other sessions.
 *
 * ── WHERE THE WORK HAPPENS, AND WHY TYPING NEVER WAITS ──────────────────────
 * Neither source touches the network on a keystroke, so there is nothing here
 * to debounce:
 *
 *   · Treks are a bundled array. The searchable strings are folded and
 *     lowercased ONCE at module load (`TREK_INDEX`), so a keystroke is a scan
 *     of prepared text rather than 252 fresh `toLowerCase()` concatenations.
 *   · Groups are read from the server ONCE per screen, on mount, by
 *     `useSharedGroups` — which already cancels in its own effect. Every
 *     keystroke after that filters rows this device is already holding.
 *
 * That is deliberate rather than lazy. A per-keystroke query against `groups`
 * would put a round trip between a finger and a letter, and the whole list is
 * one small request.
 *
 * ── WHAT THIS MODULE REFUSES TO DRAW ────────────────────────────────────────
 * A trek image is included only when the photograph is OF THE ROUTE, and a
 * demo group carries neither its cover nor its invented member count. Both
 * rules are argued at their call sites below; both exist because a search row
 * is a one-line surface with no room for the qualifier that would make a
 * borrowed picture or a written-down number honest.
 */

/**
 * The shape every source in `src/search/` returns.
 *
 * Declared here rather than imported because the sibling source modules were
 * written in parallel by other sessions and there is no `src/search/types.ts`
 * to import from yet. TypeScript compares these structurally, so a copy in
 * another module is the same type to the compiler — but if a shared types file
 * does land, this should become a re-export from it rather than a second
 * definition that can drift.
 */
export type SearchHit = {
  /**
   * Unique across ALL sources, not just this one — prefixed `trek:`,
   * `group:`, `demo-group:`, `my-group:`. The consuming screen merges hits from
   * several modules into lists it keys by id, and a trek and a group that
   * happened to share a slug would collide into one row with no error. Read
   * the entity's own id off `to`, never by stripping this.
   */
  id: string;
  kind: "person" | "trek" | "group" | "trail";
  title: string;
  /** One short line: region, country, member count. */
  subtitle?: string;
  /** The route to open. */
  to: string;
  /** Omitted rather than filled with a placeholder. */
  imageUrl?: string;
  /** An honesty note carried by the row itself, e.g. "Placeholder group". */
  note?: string;
};

/**
 * Two characters before either source answers.
 *
 * The same threshold `Search.tsx` already uses for its catalogue sources
 * (peaks, guides, companies) and for the same reason: one letter matches a
 * third of a 252-route catalogue, which is a wall of text rather than a result.
 */
const MIN_QUERY = 2;

const TREK_LIMIT = 6;
const GROUP_LIMIT = 6;

/**
 * Lowercase, and strip the accents.
 *
 * The trek catalogue is full of them — Camino Francés, Ötztal, Tour du Mont
 * Blanc's neighbours — and a phone keyboard does not offer them by default. A
 * search for "frances" that returns nothing would read as "ICEFALL does not
 * have the Camino", which is false. Both the index and the query are folded,
 * so the comparison is symmetrical.
 */
const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Joins subtitle parts, dropping empties and repeats. */
function line(...parts: (string | null | undefined)[]): string | undefined {
  const seen: string[] = [];
  for (const p of parts) {
    const t = p?.trim();
    // "Iceland · Iceland" — several regions are named after their only
    // country, so the two fields collapse into one on those rows.
    if (t && !seen.includes(t)) seen.push(t);
  }
  return seen.length > 0 ? seen.join(" · ") : undefined;
}

/* -------------------------------------------------------------------------- */
/* Treks                                                                       */
/* -------------------------------------------------------------------------- */

interface TrekIndexRow {
  trek: Trek;
  /** Folded name — the strongest match, and the only one that can rank first. */
  name: string;
  /** Folded region name and country, the geography match. */
  where: string;
  regionName: string | null;
}

/**
 * Built once, at module load. 252 rows of two short strings.
 *
 * `filterTreks` in `@/treks` matches name, country, style and summary in one
 * `includes` over a freshly built string. That is right for the Treks screen,
 * where the reader is already in the catalogue and a filter box is expected to
 * be generous. It is wrong here: a global search that returns 40 treks because
 * the word appears in a summary paragraph buries the mountain the person was
 * actually looking for. This matches name, region and country only, and ranks
 * a name above a place.
 */
const TREK_INDEX: readonly TrekIndexRow[] = TREKS.map((trek) => {
  const region = trekRegion(trek.regionId);
  return {
    trek,
    name: fold(trek.name),
    where: fold(`${region?.name ?? ""} ${region?.country ?? ""} ${trek.country}`),
    regionName: region?.name ?? null,
  };
});

/**
 * The picture on a trek row — only ever a photograph OF THIS ROUTE.
 *
 * `trekImage()` always returns something, by design: it falls back to a
 * mountain the route visits, and then to a generated contour plate. Both of
 * those are right on the trek card, which has the room to caption them —
 * `trekImageSubject()` exists precisely so a card showing Everest above "Gokyo
 * Lakes Trek" can say the picture is of the mountain and not the walk. A
 * search row has one line of subtitle and no room for that qualifier, so an
 * uncaptioned borrowed photograph would quietly claim to be the route. This
 * app has already deleted one set of stand-in photographs for illustrating a
 * Cypriot pine ridge with an Icelandic massif; `images.ts` records that. So:
 * a real photograph of the route, or no picture at all.
 */
const trekRowImage = (trek: Trek): string | undefined =>
  trekHasPhoto(trek.id) ? trekImage(trek) : undefined;

function trekHit(row: TrekIndexRow): SearchHit {
  const { trek } = row;
  return {
    id: `trek:${trek.id}`,
    kind: "trek",
    title: trek.name,
    subtitle: line(row.regionName, trek.country),
    // The real route in App.tsx: /explore/trek/:id, resolved by `trekById`.
    to: `/explore/trek/${encodeURIComponent(trek.id)}`,
    imageUrl: trekRowImage(trek),
  };
}

/**
 * Treks matching `q`, by name first and then by where they are.
 *
 * ORDERING WITHIN A BAND IS ALPHABETICAL, and that is a decision rather than a
 * default. A `Trek` carries no fame, rating, booking count or popularity —
 * `famous.ts` spends a page explaining that none of those exist and that the
 * hand-picked list there is editorial, not measured. Sorting search results by
 * anything that looked like popularity would be inventing the measurement the
 * catalogue deliberately does not have. Alphabetical is visibly not a ranking.
 */
export function useTrekSearch(q: string): SearchHit[] {
  const query = fold(q.trim());

  return useMemo(() => {
    if (query.length < MIN_QUERY) return [];

    const startsWith: TrekIndexRow[] = [];
    const contains: TrekIndexRow[] = [];
    const nearby: TrekIndexRow[] = [];

    for (const row of TREK_INDEX) {
      if (row.name.startsWith(query)) startsWith.push(row);
      else if (row.name.includes(query)) contains.push(row);
      else if (row.where.includes(query)) nearby.push(row);
    }

    // No early exit: the whole catalogue is 252 rows of two prepared strings,
    // and a scan of it costs less than the bookkeeping to stop halfway would.
    // Stopping early would also drop a name match sitting behind a geography
    // match, which is the one ordering rule that matters here.
    const byName = (a: TrekIndexRow, b: TrekIndexRow) => a.trek.name.localeCompare(b.trek.name);

    return [...startsWith.sort(byName), ...contains.sort(byName), ...nearby.sort(byName)]
      .slice(0, TREK_LIMIT)
      .map(trekHit);
  }, [query]);
}

/* -------------------------------------------------------------------------- */
/* Groups                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * THERE ARE THREE KINDS OF GROUP IN THIS APP AND THEY ARE NOT THE SAME THING.
 *
 *   1. YOUR OWN GROUPS — local `Expedition` rows in `AppState`, the party you
 *      planned for a peak. Real, measured, on this device, and the only kind
 *      with a working detail screen.
 *   2. SERVER GROUPS — `public.groups`, one mountain each, read through
 *      `@/network/interest`. Real, and readable only when signed in.
 *   3. DEMO GROUPS — invented, for reviewing the Groups layout. Marked on
 *      every row.
 *
 * The brief named the last two. The first is included because leaving it out
 * makes the feature hollow: with no session and no demo data — the ordinary
 * production case — a search for a group the athlete created themselves five
 * minutes ago would return nothing, and the reason would be invisible.
 *
 * They are returned in that order, and the cap is applied after the merge, so
 * a placeholder can never push a real group off the list.
 */

/**
 * WHY EVERY GROUP ROW BUT YOUR OWN OPENS THE LIST, NOT A GROUP.
 *
 * `/explore/groups/:id` is `GroupWorkspace`, and it resolves its id against
 * `useApp().expeditions` — the LOCAL parties — then renders `NotOnThisDevice`
 * for anything it cannot find. So a server group's uuid or a demo group's
 * `g-mont-blanc` sent to that route is a dead end that looks like a bug. Until
 * a group detail screen exists that can open a server group, those rows land
 * on `/explore/groups`, where both lists are drawn with the disclosure the
 * Groups screen already carries.
 */
const GROUPS_LIST_ROUTE = "/explore/groups";

/**
 * The marker on an invented group. Short on purpose.
 *
 * `GROUPS_DEMO_NOTICE` is a paragraph, and it is the right length above a list
 * where it can be read once. It is the wrong length on a row. So the row
 * carries the two words that stop a searcher mistaking this for a real party,
 * and the source-level note returned beside the hits carries the paragraph's
 * substance. Neither is optional: the row marker is what travels if the
 * consuming screen renders hits without their section note.
 */
const DEMO_GROUP_NOTE = "Placeholder group";

/** Mountains this app holds, by the slug `destinations` and `groups` use. */
const PEAK_BY_ID = new Map(MOUNTAINS.map((m) => [m.id, m]));

/* ---- Your own groups ----------------------------------------------------- */

function myGroupHit(group: Expedition): SearchHit {
  // The peak's own photograph, resolved through the ONE name→slug mapping the
  // app has. A second copy of that rule here would drift and start putting the
  // wrong mountain beside somebody's plan.
  const slug = destinationIdForPeak(group.peakName);
  const peak = slug ? PEAK_BY_ID.get(slug) : undefined;

  return {
    id: `my-group:${group.id}`,
    kind: "group",
    title: group.peakName,
    // "Your group" first, because in a merged list it is the only thing
    // separating a party you made from one somebody else did. The window is
    // dates you entered; `formatWindow` says "Dates not recorded" rather than
    // inventing one when they are missing.
    subtitle: line("Your group", formatWindow(group.window)),
    to: `/explore/groups/${encodeURIComponent(group.id)}`,
    imageUrl: peak?.photo,
  };
}

/* ---- Server groups ------------------------------------------------------- */

function serverGroupHit(group: MountainGroup): SearchHit {
  const peak = PEAK_BY_ID.get(group.destinationId);

  return {
    id: `group:${group.id}`,
    kind: "group",
    title: group.name,
    /* The mountain, and the count only when the server sent one.
       `memberCount` is null when `member_count` did not come back, and a null
       rendered as 0 tells an athlete a group is empty when ICEFALL simply does
       not know — the exact substitution `interest.ts` made the field nullable
       to prevent. A row with no count states no count.

       The mountain's NAME is shown only when this app holds that peak. The
       slug is not de-hyphenated into a title: turning `ama-dablam` into a
       display name is guessing at spelling and capitalisation the catalogue
       has not given us. */
    subtitle: line(
      peak?.name,
      group.memberCount === null
        ? undefined
        : `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}`,
    ),
    to: GROUPS_LIST_ROUTE,
    // By slug, never matched on the group's title — the same rule
    // `GroupCoverCard` follows, so a group called "Everest, May" cannot pull
    // Everest's photograph onto a group about a different peak.
    imageUrl: peak?.photo,
  };
}

/* ---- Demo groups --------------------------------------------------------- */

function demoGroupHit(group: DemoGroup): SearchHit {
  return {
    id: `demo-group:${group.id}`,
    kind: "group",
    title: group.name,
    /* THE MOUNTAIN ONLY. `members` and `posts` are written numbers — the file
       says so in its own header — and the Groups screen may print them because
       `GROUPS_DEMO_NOTICE` sits directly above them. A search row has no such
       paragraph over it, and "1,240 members" read in passing is a measurement
       ICEFALL never made. It is not carried here at all. */
    subtitle: group.mountain,
    to: GROUPS_LIST_ROUTE,
    /* NO COVER, for the same reason. The cover is a real photograph of a real
       mountain, which is exactly what makes it dangerous on an invented group:
       it dresses a party that does not exist as one that does. The Groups
       screen can afford it under its disclaimer; a row cannot. */
    note: DEMO_GROUP_NOTE,
  };
}

/* ---- Why the group results might be short -------------------------------- */

/**
 * The sentence beside the group results, or nothing.
 *
 * SILENCE LIES HERE MORE THAN ANYWHERE ELSE IN THIS MODULE. "No group called
 * that" and "ICEFALL could not read the group list" lead a climber to opposite
 * conclusions about whether to keep looking for a partner, and only the first
 * is something this app can know. Every state that is not "we asked and this
 * is the answer" says which one it is.
 *
 * The two server failures reuse `interest.ts`'s own wording rather than a
 * paraphrase — one place says why the shared list is missing, so the Groups
 * screen and the search box cannot start disagreeing about what went wrong.
 *
 * EVERY SENTENCE IS ABOUT OTHER PEOPLE'S GROUPS, and says so. The first draft
 * of this function read "no real group could be searched" when there was no
 * session — which is false, because your own groups are on this device and are
 * searched on every keystroke regardless. A note that disclaims work the app
 * actually did is as misleading as one that claims work it did not.
 */
function groupSourceNote(state: SharedGroups, demoShown: boolean): string | undefined {
  switch (state.status) {
    case "loading":
      return "Other people's groups are still loading, so they may not be in these results yet. Your own are searched on this device and are already here.";
    case "no-backend":
      return demoShown
        ? "This build has no server, so no group anyone else made was searched — only your own, which live on this device. Rows marked placeholder are not real groups."
        : "This build has no server, so no group anyone else made was searched — only your own, which live on this device. Nothing has been hidden from you; nothing was asked.";
    case "signed-out":
      return demoShown
        ? "Other people's groups are only visible once you are signed in, so none were searched — only your own. Rows marked placeholder are not real groups."
        : "Other people's groups are only visible once you are signed in, so none were searched — only your own, on this device. This is not an empty list; it is an unasked question.";
    case "not-provisioned":
      return SHARED_GROUPS_NOT_LIVE;
    case "unreachable":
      return SHARED_GROUPS_UNREACHABLE;
    case "ready":
      return demoShown
        ? "Rows marked placeholder were written by ICEFALL to review this layout. Those groups do not exist, and nobody has joined them."
        : undefined;
  }
}

/**
 * Groups matching `q`, and the reason the answer may be incomplete.
 *
 * `useSharedGroups` fires ONE request when the screen mounts and cancels it on
 * unmount; nothing below it touches the network. A signed-out or offline
 * device never reaches the server at all and is told so through `note` rather
 * than shown an empty list that reads like an answer.
 */
export function useGroupSearch(q: string): { hits: SearchHit[]; note?: string } {
  const { state } = useSharedGroups();
  const { expeditions } = useApp();
  const query = fold(q.trim());

  return useMemo(() => {
    if (query.length < MIN_QUERY) return { hits: [] };

    // Your own: the peak it is about, and anything you wrote about it.
    const mine = expeditions
      .filter((e) => fold(`${e.peakName} ${e.description ?? ""}`).includes(query))
      .map(myGroupHit);

    const server =
      state.status === "ready"
        ? state.groups
            .filter((g) => {
              const peak = PEAK_BY_ID.get(g.destinationId);
              /* The slug is matched with its hyphens opened out, so "mont
                 blanc" finds a group about Mont Blanc that its founder called
                 "June push". This is a match on data, not a display name —
                 nothing de-hyphenated is ever shown. */
              const slugWords = g.destinationId.replace(/-/g, " ");
              return fold(`${g.name} ${peak?.name ?? ""} ${slugWords}`).includes(query);
            })
            .map(serverGroupHit)
        : [];

    const demo =
      SHOW_DEMO_GROUPS
        ? DEMO_GROUPS.filter((g) => fold(`${g.name} ${g.mountain}`).includes(query)).map(
            demoGroupHit,
          )
        : [];

    return {
      hits: [...mine, ...server, ...demo].slice(0, GROUP_LIMIT),
      // Tied to what is actually on screen: "some of these are placeholders"
      // is confusing above a list with no placeholder in it.
      note: groupSourceNote(state, demo.length > 0),
    };
  }, [query, state, expeditions]);
}
