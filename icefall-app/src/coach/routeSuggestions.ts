import { MOUNTAINS } from "@/data/mock/mountains";
import { TREKS, trekAltitude, trekDuration } from "@/treks";
import type { Trek } from "@/treks/model";
import { NETWORK_LABEL, SAC_LABEL, nearbyTrails, type Trail } from "@/services/trails";
import { fmtDistance } from "@/lib/format";
import {
  TREK_QUESTION,
  isTrekQuestion,
  scriptedTrekReply,
  suggestedTreksFor,
} from "@/coach/trekSuggestions";
import type { CoachContext } from "@/coach/context";

/**
 * ROUTES THE COACH MAY SUGGEST — RETRIEVED FIRST, PICKED BY ID, DRAWN BY THE APP.
 *
 * ============================================================================
 * RULE 1, APPLIED TO A PLACE INSTEAD OF A SESSION
 * ============================================================================
 *
 * "The AI decides; the app's engines do the work." A model asked for a prep
 * hike near somebody will produce one. It will have a name, a length, an ascent
 * and a grade, all of them plausible and none of them from anywhere — the same
 * failure `trekSuggestions.ts` was written to stop for treks, and a worse one
 * for trails, because a trail is a place a person then drives to.
 *
 * So the flow is inverted here exactly as it is there:
 *
 *   1. THE APP SEARCHES its own records — the bundled trek catalogue and the
 *      prebuilt OpenStreetMap trail index — and builds a shortlist.
 *   2. THE MODEL IS HANDED THAT SHORTLIST AS IDS, with a closed-world rule, and
 *      may pick up to three of them and say in one line why.
 *   3. THE APP DRAWS THE CARDS from those ids, out of its own records. Every
 *      figure the athlete reads — length, ascent, days, grade, high point — is
 *      the record's, not the model's.
 *
 * An id the shortlist does not contain resolves to nothing and nothing is
 * drawn. That is the whole defence, and it is arithmetic rather than trust: the
 * model cannot name a trail into existence because a name is not what the tool
 * takes. See `resolveRouteCards`.
 *
 * THE ONE MODEL-AUTHORED STRING IS THE REASON, and it is the same deliberate
 * exception `tools.ts` makes for `why`. Why this walk suits this athlete is the
 * one thing in a recommendation the coach is genuinely the author of, and the
 * athlete is entitled to see whose sentence it is. It is capped, stripped of
 * formatting, and it sits BESIDE figures the app computed, so a reason that
 * said something untrue would be contradicted on its own card.
 *
 * ============================================================================
 * "NEAR" MEANS ONE OF TWO THINGS AND THE APP SAYS WHICH
 * ============================================================================
 *
 * `trekSuggestions.ts` deliberately reads "near" as near the OBJECTIVE, never
 * from device location, and gives its reasons. That is still right for treks: a
 * trek is a trip somebody plans around a mountain.
 *
 * A prep trail is the opposite — it is a walk on Saturday from wherever the
 * athlete actually lives — so trails need a position, and ICEFALL has exactly
 * one it is allowed to use: `myProfile.approxLocation`, which exists only when
 * the athlete turned Location on in the Expedition Network and is quantised to
 * a ~5 km grid by `AppState` before it is ever stored. This module does not ask
 * for a fresh fix and never touches `navigator.geolocation`: a coach answer is
 * not a reason to raise a permission prompt the athlete did not open.
 *
 * WHEN IT IS NOT GRANTED, THE APP SAYS SO. The roadmap is explicit and it is
 * the same rule as everywhere else here: an empty list reads as "there is
 * nothing there", and "nobody looked" must not be allowed to wear that costume.
 * `trailGap: "no-location"` carries the sentence, and `"unreachable"` keeps a
 * failed search apart from an empty one.
 *
 * The middle case is real and worth having: no device location but a known
 * objective. Then the search runs around the MOUNTAIN, and every line of copy
 * says "near Mont Blanc" rather than "near you". Those are different claims and
 * they are never blurred.
 *
 * ============================================================================
 * WHY THIS REUSES THE RETRIEVAL RATHER THAN BUILDING ONE
 * ============================================================================
 *
 * `nearbyTrails` already resolves most of Europe from static files the app
 * ships (`public/data/trails/`), falling through to Overpass only off that
 * coverage — so in the Alps this is a local read of an index Explore has
 * usually warmed already, and the module's shared result cache means a second
 * question about the same place costs nothing. A second search written here
 * would drift from the one the athlete sees in Explore, and then the coach
 * would be recommending a world Explore does not have.
 *
 * The trek half is `suggestedTreksFor`, unchanged and uncopied, for the reason
 * that file gives for itself: two definitions of "near" is how they come apart.
 */

/* -------------------------------------------------------------------------- */
/* What counts as asking for one                                               */
/* -------------------------------------------------------------------------- */

/**
 * A route noun. Deliberately does NOT include "trek" — the trek pattern is
 * imported whole from `trekSuggestions.ts` so there is one definition of a trek
 * question in this app rather than two that drift.
 */
const ROUTE_NOUN = /\b(trail|trails|hike|hikes|hiking|walk|walks|footpath|paths?|routes?)\b/i;

/**
 * Asking FOR one, rather than asking about one.
 *
 * The gate is two halves on purpose and this is the half that makes it narrow.
 * "Should I hike tomorrow?" is a training question and belongs to the coach's
 * ordinary answer; "where can I hike this weekend?" is a request for places and
 * belongs here. Without this half, every mention of a walk would pull a block
 * of trail data into a prompt about somebody's knee and put cards under an
 * answer nobody asked to have illustrated.
 */
const ASKING_FOR_ONE =
  /\b(suggest|suggestions?|recommend|recommendations?|find|show|where|which|any|ideas?|looking for|options?|prep|prepare|preparation)\b/i;

/** "trails near me", said in the ways people actually say it. */
const NEAR_ME =
  /\b(trail|trails|hike|hikes|walk|walks|route|routes|path|paths)\b[^.?!]{0,24}\bnear(by)?\b/i;

/** Exported so a test can exercise each half rather than guessing at the whole. */
export const ROUTE_QUESTION_PARTS = { ROUTE_NOUN, ASKING_FOR_ONE, NEAR_ME, TREK_QUESTION };

/**
 * Worth retrieving for.
 *
 * Generous on treks (that pattern's own comment explains why) and tight on
 * trails. A near-miss costs tokens rather than truth — but a false positive
 * also spends the athlete's budget on data their question had no use for, so it
 * is not free either.
 */
export function isRouteQuestion(q: string): boolean {
  if (isTrekQuestion(q)) return true;
  if (NEAR_ME.test(q)) return true;
  return ROUTE_NOUN.test(q) && ASKING_FOR_ONE.test(q);
}

/* -------------------------------------------------------------------------- */
/* The shortlist                                                               */
/* -------------------------------------------------------------------------- */

/** Where the trail search was centred, and how honestly it may be described. */
export type NearBasis =
  /** The athlete's own coarse position, which they turned on themselves. */
  | "device"
  /** Their objective's mountain. Near the MOUNTAIN, and the copy says so. */
  | "objective"
  /** Neither. No trail search ran, and the copy says that instead of nothing. */
  | "none";

/** Why the trail half of the shortlist is empty, when it is. */
export type TrailGap =
  /** It is not empty. */
  | "ok"
  /** Location is off and no objective could be placed — nothing was searched. */
  | "no-location"
  /** Searched, and nothing sat inside the radius. */
  | "nothing-found"
  /** The search itself failed. Emphatically not the same as finding nothing. */
  | "unreachable";

export interface RouteCandidates {
  treks: Trek[];
  /** What "near" meant for the treks — `suggestedTreksFor`'s own answer. */
  trekBasis: "mountain" | "country" | null;
  trails: Trail[];
  basis: NearBasis;
  /** A place name, or null. "you" is never one of these. */
  nearLabel: string | null;
  trailGap: TrailGap;
  objectiveName: string | null;
}

/** How many of each the model is shown. */
const MAX_TREK_CANDIDATES = 5;
const MAX_TRAIL_CANDIDATES = 8;

/**
 * How far out a prep walk may be and still be a prep walk.
 *
 * Forty kilometres is a drive somebody makes on a Saturday morning. Explore's
 * own default is twenty, which is right for "where can I walk from here" and
 * too tight for "where can I train for a mountain" — the honest long climbs are
 * rarely the closest thing to a town.
 */
const TRAIL_RADIUS_M = 40_000;

/** The most the model may pick, per the roadmap. */
export const MAX_ROUTE_PICKS = 3;

/** Longest reason kept — the same cap `tools.ts` puts on `why`. */
export const MAX_REASON_CHARS = 240;

const EMPTY: RouteCandidates = {
  treks: [],
  trekBasis: null,
  trails: [],
  basis: "none",
  nearLabel: null,
  trailGap: "no-location",
  objectiveName: null,
};

/**
 * The objective's mountain, when ICEFALL holds a record for it.
 *
 * Matched by name because that is all `ObjectiveContext` carries, and it is the
 * same match `suggestedTreksFor` makes — so the trek half and the trail half
 * cannot end up talking about two different mountains.
 */
function objectiveMountain(name: string | null | undefined) {
  const n = name?.trim().toLowerCase() ?? "";
  if (!n) return null;
  return MOUNTAINS.find((m) => m.name.toLowerCase() === n) ?? null;
}

/**
 * Search ICEFALL's own records for routes worth showing this athlete.
 *
 * NEVER THROWS AND NEVER REJECTS. It sits on the path to an answer somebody is
 * waiting for; a trail index that 404s must cost them a section of the reply,
 * not the reply.
 */
export async function gatherRouteCandidates(
  ctx: CoachContext,
  signal?: AbortSignal,
): Promise<RouteCandidates> {
  const objectiveName = ctx.objective?.name ?? null;
  const trekPart = suggestedTreksFor(objectiveName);

  const here = ctx.here;
  const mountain = objectiveMountain(objectiveName);

  /* The athlete's own position wins. It is the only one that can honestly be
     called "near you", and it is already coarse — see the header. */
  const origin = here
    ? { lat: here.lat, lon: here.lon, basis: "device" as const, label: null }
    : mountain
      ? {
          lat: mountain.coords.lat,
          lon: mountain.coords.lon,
          basis: "objective" as const,
          label: mountain.name,
        }
      : null;

  const base: RouteCandidates = {
    ...EMPTY,
    treks: trekPart.treks.slice(0, MAX_TREK_CANDIDATES),
    trekBasis: trekPart.basis,
    objectiveName,
  };

  if (!origin) return base;

  try {
    const trails = await nearbyTrails(
      origin.lat,
      origin.lon,
      { radiusM: TRAIL_RADIUS_M, limit: MAX_TRAIL_CANDIDATES, rank: "near" },
      signal,
    );
    return {
      ...base,
      trails,
      basis: origin.basis,
      nearLabel: origin.label,
      trailGap: trails.length > 0 ? "ok" : "nothing-found",
    };
  } catch {
    /* Overpass down, offline off the index's coverage, a timeout. All the same
       to the athlete and all reported as "the search did not happen", which is
       a different sentence from "there is nothing near you" and must stay one. */
    return { ...base, basis: origin.basis, nearLabel: origin.label, trailGap: "unreachable" };
  }
}

/* -------------------------------------------------------------------------- */
/* Ids                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The id the model is shown and the id it hands back.
 *
 * Prefixed, because a trek id is a slug and a trail id is a number, and an
 * unprefixed pair of those is two namespaces one typo apart. `trail:<osmId>`
 * and `trek:<slug>` are what `services/trails.ts` and the global search box
 * already put on these objects, so the string the model sees already means
 * something in this app rather than being a third spelling invented here.
 */
export const trekRouteId = (id: string) => `trek:${id}`;
export const trailRouteId = (osmId: number) => `trail:${osmId}`;

/* -------------------------------------------------------------------------- */
/* The block the model is given                                                */
/* -------------------------------------------------------------------------- */

/** One trek as facts the record actually holds, and no others. */
function trekLine(t: Trek): string {
  const parts = [
    trekDuration(t),
    t.difficulty ?? "difficulty not graded",
    t.maxAltitudeM ? `high point ${trekAltitude(t)}` : null,
    t.season ? `season ${t.season}` : null,
  ].filter(Boolean);
  return `- ${trekRouteId(t.id)} · ${t.name} (${t.country}): ${parts.join(" · ")}`;
}

/** One trail as facts the record actually holds, and no others. */
function trailLine(t: Trail): string {
  const parts = [
    t.lengthKm != null ? `${fmtDistance(t.lengthKm)} km` : "length not recorded",
    t.ascentM != null ? `${Math.round(t.ascentM)} m ascent` : "ascent not recorded",
    t.sacScale ? (SAC_LABEL[t.sacScale] ?? t.sacScale) : null,
    t.network ? NETWORK_LABEL[t.network] : null,
    t.distanceM != null ? `${Math.round(t.distanceM / 1000)} km away` : null,
  ].filter(Boolean);
  return `- ${trailRouteId(t.osmId)} · ${t.name}: ${parts.join(" · ")}`;
}

/** How the trail half may be described, in the model's own prompt. */
function nearSentence(c: RouteCandidates): string {
  if (c.basis === "device") return "around the athlete's own approximate area";
  if (c.basis === "objective") return `around ${c.nearLabel ?? "their objective"}`;
  return "nowhere — no search ran";
}

/**
 * The data block appended to the system prompt when the question asks for
 * routes. Data with a closed-world rule, exactly as the trek block is.
 */
export function routeContextBlock(c: RouteCandidates): string {
  const lines: string[] = ["ROUTES ICEFALL HOLDS (the only ones you may suggest)"];

  if (c.treks.length > 0) {
    lines.push(
      `Treks, ${
        c.trekBasis === "mountain"
          ? `linked to ${c.objectiveName}`
          : `in the same country as ${c.objectiveName}`
      }:`,
      ...c.treks.map(trekLine),
    );
  } else {
    lines.push(
      c.objectiveName
        ? `Treks: none. ICEFALL's trek catalogue holds nothing linked to ${c.objectiveName} or its country.`
        : "Treks: none. They have no objective set, so there is no 'near' to search.",
    );
  }

  if (c.trails.length > 0) {
    lines.push(`Trails, ${nearSentence(c)}:`, ...c.trails.map(trailLine));
    /* THE SUBSTITUTION IS DECLARED. Somebody who asked for trails "near me" and
       is handed trails near a mountain they may be nowhere near has been
       answered, and not to their question — so the model is required to say
       which "near" this is. Without this line the cards would be the only place
       it appeared, and a reader skims a heading. */
    if (c.basis === "objective") {
      lines.push(
        `NOTE: these are near ${c.nearLabel}, NOT near the athlete. ICEFALL holds no position for them, so it searched around their objective instead. Say so — do not let "near you" stand.`,
      );
    }
  } else if (c.trailGap === "no-location") {
    lines.push(
      "Trails: NOT SEARCHED. ICEFALL holds no position for the athlete and cannot place their objective either, so it does not know where they are. Say that plainly — do NOT say there are no trails near them, because nobody looked. They can share an approximate area under Explore → People.",
    );
  } else if (c.trailGap === "unreachable") {
    lines.push(
      `Trails: THE SEARCH FAILED ${nearSentence(c)}. That is not the same as finding none — say the trail index could not be reached, and that it is worth asking again.`,
    );
  } else {
    lines.push(
      `Trails: none within ${TRAIL_RADIUS_M / 1000} km ${nearSentence(c)}. ICEFALL's trail index covers 22 European countries and nothing outside them, so this may mean the area is not indexed rather than that there is nothing to walk.`,
    );
  }

  lines.push(
    "",
    "HOW TO USE THIS LIST:",
    `- To show any of these, call suggest_routes with up to ${MAX_ROUTE_PICKS} of the ids above and one short reason each. The app draws the cards.`,
    "- An id that is not in this list draws NOTHING. Do not invent one, do not adapt one, do not pass a name.",
    "- Never state a length, an ascent, a grade, a duration or a high point yourself. The card carries every figure, from ICEFALL's own record.",
    "- Your reason says why it suits THIS athlete — their objective, the week of the plan they are in, what that week is asking for. It is shown in quotation marks with your name on it.",
    "- Whether a route is safe for them on the day is not established by this list. Difficulty is the record's own; defer anything glaciated or technical to a guide.",
  );

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Resolution — ids in, the app's own records out                              */
/* -------------------------------------------------------------------------- */

/**
 * A card the app will draw. Every field except `reason` comes from ICEFALL's
 * own record for the id.
 */
export type RouteCard =
  | { kind: "trek"; id: string; reason: string }
  | {
      kind: "trail";
      osmId: number;
      reason: string;
      /*
       * THE TRAIL'S FACTS TRAVEL WITH THE CARD, and this is the one place the
       * two halves differ.
       *
       * A trek is bundled with the app, so `TREKS.find(id)` is exact and free
       * forever and the trek card looks nothing up beyond the id. A trail comes
       * from an index fetched at search time, and a card that re-resolved it
       * later would either block on Overpass or draw itself blank. So the
       * record as it stood when the coach suggested it is carried, and the card
       * links to the trail's own page, which is where the live record is.
       */
      name: string;
      lat: number;
      lon: number;
      lengthKm: number | null;
      ascentM?: number;
      sacScale?: string;
      ref?: string;
      network?: Trail["network"];
      distanceM?: number;
    };

/** One id-and-reason pair as the model sent it, before anything is trusted. */
export interface RoutePick {
  id: string;
  reason: string;
}

/**
 * Strip the model's formatting from a reason.
 *
 * The same treatment `cleanWhy` gives a plan change's reason, and for the same
 * reasons: this string is not rendered through the component that understands
 * `**bold**`, so asterisks would print as asterisks, and it is one line beside
 * a picture rather than a paragraph.
 */
export function cleanReason(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REASON_CHARS);
}

/**
 * The model's picks, resolved against what was actually retrieved.
 *
 * THIS FUNCTION IS THE DEFENCE. An id that is not in `candidates` is dropped —
 * not looked up, not fetched, not matched to the nearest name. A model that
 * invented three trails gets three drops and the app draws nothing, which is
 * what the roadmap asks for in as many words.
 *
 * CHECKED AGAINST THE SHORTLIST, NOT THE CATALOGUE. A trek id is matched
 * against the five treks the model was shown rather than against all of them:
 * letting it reach the rest would make "near their objective" a decoration on
 * the prompt rather than a rule, and the athlete would get a Patagonian circuit
 * recommended for an Alpine summer.
 *
 * Order is the model's, because which fits best is the judgement it is allowed
 * to make. Duplicates collapse — the same trail twice is one card, and the
 * first reason is the one kept.
 */
export function resolveRouteCards(picks: RoutePick[], candidates: RouteCandidates): RouteCard[] {
  const cards: RouteCard[] = [];
  const seen = new Set<string>();

  for (const pick of picks) {
    if (cards.length >= MAX_ROUTE_PICKS) break;
    const id = typeof pick?.id === "string" ? pick.id.trim() : "";
    if (!id || seen.has(id)) continue;

    const reason = cleanReason(pick?.reason);

    if (id.startsWith("trek:")) {
      const trek = candidates.treks.find((t) => t.id === id.slice(5));
      if (!trek) continue;
      seen.add(id);
      cards.push({ kind: "trek", id: trek.id, reason });
      continue;
    }

    if (id.startsWith("trail:")) {
      const raw = id.slice(6);
      /* `Number("")` is 0 and `Number(" 12 ")` is 12; neither is an id anybody
         sent. Matched against the digits themselves so a near-miss is a drop. */
      if (!/^\d+$/.test(raw)) continue;
      const osmId = Number(raw);
      const trail = candidates.trails.find((t) => t.osmId === osmId);
      if (!trail) continue;
      seen.add(id);
      cards.push({
        kind: "trail",
        osmId: trail.osmId,
        reason,
        name: trail.name,
        lat: trail.lat,
        lon: trail.lon,
        /* A relation whose geometry measured to something impossible already
           carries null here — see `Trail.lengthBroken`. The card prints
           "Length not recorded" rather than the nonsense figure. */
        lengthKm: trail.lengthKm,
        ascentM: trail.ascentM,
        sacScale: trail.sacScale,
        ref: trail.ref,
        network: trail.network,
        distanceM: trail.distanceM,
      });
    }
  }

  return cards;
}

/**
 * The app's own sentence for a turn that produced cards.
 *
 * WRITTEN HERE AND STORED IN THE TRANSCRIPT, for the reason `pendingChanges.ts`
 * sets out about plan changes: the cards live in memory for this session only,
 * and a reload must not leave a message promising three routes with nothing
 * underneath it. This line names them, so it is still true and still useful
 * once the pictures are gone.
 *
 * NO FIGURES IN IT. The cards carry those, and a length typed into a sentence
 * is a length that can disagree with the card beside it.
 */
export function routeCardsSummary(cards: RouteCard[], c: RouteCandidates): string {
  if (cards.length === 0) return "";
  const names = cards.map((card) =>
    card.kind === "trek" ? (TREKS.find((t) => t.id === card.id)?.name ?? card.id) : card.name,
  );
  /* `basis` describes the TRAIL search, so it may only speak when a trail is in
     the list. A set of treks alone has the objective's own "near" and calling
     it "near your area" — because the athlete happens to have Location on —
     would put a Nepalese circuit down the road from them. See `RouteCards`,
     which makes the same distinction in the heading above the pictures. */
  const where = !cards.some((card) => card.kind === "trail")
    ? "from ICEFALL's trek catalogue"
    : c.basis === "device"
      ? "near your area"
      : c.basis === "objective" && c.nearLabel
        ? `near ${c.nearLabel}`
        : "from ICEFALL's records";
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${cards.length === 1 ? "One route" : `${cards.length} routes`} ${where}: ${list}.`;
}

/**
 * What to say when the coach asked for routes and none of its ids resolved.
 *
 * This turn has to produce something: the proxy drops the model's prose on a
 * tool call, so without this the athlete gets an empty bubble. It says what
 * happened rather than papering over it — the alternative is a coach that
 * silently swallows its own mistake, which is the failure this whole file
 * exists to prevent.
 */
export const ROUTES_NOT_FOUND =
  "Your coach picked routes I could not match to anything in ICEFALL's records, so I have not drawn them — I will not show a route I cannot trace to a real one. Explore → Treks and Explore → Routes have the catalogue itself.";

/* -------------------------------------------------------------------------- */
/* The offline coach's answer                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The scripted coach's answer to a route question — the same retrieval, spoken
 * plainly, with no reason attached to anything.
 *
 * THE MISSING REASON IS THE POINT. On this path there is no model, so there is
 * nobody to author "good prep for Mont Blanc: sustained ascent, no glacier".
 * Writing one anyway would put a judgement in the coach's mouth that no coach
 * made. The offline answer therefore lists what ICEFALL holds and says plainly
 * that it has not judged the fit — which is less, and is true.
 *
 * The trek half delegates to `scriptedTrekReply` unchanged, so a trek question
 * answered offline reads exactly as it did before this file existed.
 */
export function scriptedRouteReply(ctx: CoachContext, c: RouteCandidates | null): string {
  const objectiveName = ctx.objective?.name ?? null;
  if (!c) return scriptedTrekReply(objectiveName);

  const parts: string[] = [];

  if (c.treks.length > 0 || worthSayingTheTrekHalfIsEmpty(objectiveName, c)) {
    parts.push(scriptedTrekReply(objectiveName));
  }

  if (c.trails.length > 0) {
    const where =
      c.basis === "device"
        ? "near your area"
        : `near ${c.nearLabel ?? objectiveName ?? "your objective"}`;
    const lines = c.trails
      .slice(0, MAX_ROUTE_PICKS)
      .map((t) => {
        const facts = [
          t.lengthKm != null ? `${fmtDistance(t.lengthKm)} km` : "length not recorded",
          t.sacScale ? (SAC_LABEL[t.sacScale] ?? t.sacScale) : null,
        ].filter(Boolean);
        return `${t.name} — ${facts.join(", ")}`;
      })
      .join("\n");
    /* Same declaration as the prompt block makes, in the app's own voice: a
       list near the objective is not a list near the athlete, and only this
       sentence tells them which they are looking at. */
    const substituted =
      c.basis === "objective"
        ? " I have no position for you, so I looked around your objective rather than around you."
        : "";
    parts.push(
      `Trails ${where}, from ICEFALL's OpenStreetMap index:\n\n${lines}\n\nThose are the nearest named routes, not a judgement that any of them suits the week you are in — offline I am reading the index and nothing else.${substituted} Each has a page under Explore → Routes.`,
    );
  } else if (c.trailGap === "no-location") {
    parts.push(
      "I cannot look for trails near you: ICEFALL holds no position for you, so I do not know where you are and I will not guess. You can share an approximate area under Explore → People — it is stored to about five kilometres and nothing finer.",
    );
  } else if (c.trailGap === "unreachable") {
    parts.push(
      "The trail index could not be reached just now, so no trail search happened. That is a loading failure rather than an empty area, and it is worth asking again.",
    );
  } else if (c.basis !== "none") {
    parts.push(
      `Nothing in ICEFALL's trail index within ${TRAIL_RADIUS_M / 1000} km ${
        c.basis === "device" ? "of your area" : `of ${c.nearLabel}`
      }. The index covers 22 European countries and nothing outside them, so this may mean the area is not indexed rather than that there is nothing there.`,
    );
  }

  return parts.filter(Boolean).join("\n\n");
}

/**
 * Whether the empty trek half is worth a sentence of its own.
 *
 * `scriptedTrekReply` has honest empties — "set an objective first", "the
 * catalogue holds nothing linked to X" — and they are worth saying to somebody
 * who asked about treks. They are not worth saying to somebody who asked for a
 * walk on Saturday and is about to be handed three, which is why this is a
 * question rather than always.
 */
function worthSayingTheTrekHalfIsEmpty(objectiveName: string | null, c: RouteCandidates): boolean {
  return c.treks.length === 0 && objectiveName !== null && c.trailGap !== "ok";
}
