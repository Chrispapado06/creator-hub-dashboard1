/**
 * TEST SET FOR ROUTE SUGGESTIONS — the id defence, the gate, and the two
 * "nears".
 *
 * `npm run test:coach-routes` — esbuild to node, like every other suite here.
 * Nothing exercised below touches the network: `gatherRouteCandidates` is the
 * one function in the module that does, and it is deliberately left out (see
 * WHAT THIS FILE DOES NOT PROVE).
 *
 * ============================================================================
 * WHAT IS BEING PROVED, AND WHY EACH ONE IS WORTH A TEST
 * ============================================================================
 *
 * 1. THE MODEL CANNOT PUT A ROUTE ON THE SCREEN. This is the whole feature in
 *    one claim, and it is the kind that is easy to believe and expensive to be
 *    wrong about: a trail is a place somebody then drives to. Suite 1 feeds
 *    `resolveRouteCards` the things a model actually gets wrong — a plausible
 *    id that was never on the shortlist, a name instead of an id, a real trek
 *    from the catalogue that this athlete's shortlist did not contain, an id
 *    with the prefix missing — and checks every one draws NOTHING.
 *
 * 2. A CARD'S FIGURES ARE THE RECORD'S. Suite 2 takes the shortlist apart field
 *    by field and checks the resolved card carries exactly what the record
 *    carried, including the nulls. A card that quietly defaulted a missing
 *    length to zero would print "0.0 km" under a photograph.
 *
 * 3. THE VOCABULARY IS CLOSED. Suite 3 feeds `parseRouteSuggestion` a hostile
 *    envelope — the wrong tool name, a string where the array goes, a route
 *    that is a bare string, four routes when three is the cap — and checks each
 *    is refused or trimmed rather than guessed at.
 *
 * 4. THE GATE IS NARROW IN THE RIGHT DIRECTION. Suite 4 checks that asking WHERE
 *    reaches the retrieval and that asking WHETHER does not: "should I hike
 *    tomorrow" is a training question, and answering it with three trail cards
 *    would be the coach changing the subject.
 *
 * 5. "NEAR YOU" AND "NEAR THE MOUNTAIN" ARE NEVER BLURRED. Suite 5 checks the
 *    prompt block and the app's own summary both name which one they mean, and
 *    that a shortlist nobody searched says so instead of reading as empty.
 *
 * ============================================================================
 * WHAT THIS FILE DOES NOT PROVE
 * ============================================================================
 *
 * That `gatherRouteCandidates` finds the right trails — that is `nearbyTrails`,
 * which is Explore's own retrieval and is exercised by using Explore. That the
 * chat screen renders the cards, or that the edge function declares the tool:
 * the first is a call site verified by reading it, the second is checked by
 * suite 6 of `planActions.test.ts`, which reads the deployed file's source.
 */
import {
  MAX_ROUTE_PICKS,
  cleanReason,
  isRouteQuestion,
  resolveRouteCards,
  routeCardsSummary,
  routeContextBlock,
  scriptedRouteReply,
  trailRouteId,
  trekRouteId,
  type RouteCandidates,
} from "@/coach/routeSuggestions";
import { SUGGEST_ROUTES, parseRouteSuggestion } from "@/coach/routeTools";
import { TREKS } from "@/treks";
import type { Trail } from "@/services/trails";
import type { CoachContext } from "@/coach/context";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Two real trails' worth of shape, with the awkward cases deliberately in.
 *
 * `lengthKm: null` is not a hypothetical: `services/trails.ts` nulls the length
 * of any relation whose geometry measured to something impossible, and a card
 * that turned that into a number would be printing a figure nobody measured.
 */
const TRAIL_A: Trail = {
  id: "trail:111",
  osmId: 111,
  name: "Sentier des Aiguilles",
  lat: 45.92,
  lon: 6.87,
  lengthKm: 14.2,
  ascentM: 980,
  sacScale: "T3",
  ref: "TMB-3",
  network: "rwn",
  distanceM: 8_400,
};

const TRAIL_B: Trail = {
  id: "trail:222",
  osmId: 222,
  name: "Balcon Sud",
  lat: 45.94,
  lon: 6.9,
  lengthKm: null,
  network: "lwn",
  distanceM: 21_000,
};

/** Whatever the catalogue's first two treks are — real ids, not invented ones. */
const TREK_A = TREKS[0];
const TREK_B = TREKS[1];
/** A real trek that this athlete's shortlist does NOT contain. */
const TREK_OFFLIST = TREKS[TREKS.length - 1];

const NEAR_ME: RouteCandidates = {
  treks: [TREK_A, TREK_B],
  trekBasis: "mountain",
  trails: [TRAIL_A, TRAIL_B],
  basis: "device",
  nearLabel: null,
  trailGap: "ok",
  objectiveName: "Mont Blanc",
};

const NEAR_MOUNTAIN: RouteCandidates = {
  ...NEAR_ME,
  basis: "objective",
  nearLabel: "Mont Blanc",
};

const NOTHING_SEARCHED: RouteCandidates = {
  treks: [],
  trekBasis: null,
  trails: [],
  basis: "none",
  nearLabel: null,
  trailGap: "no-location",
  objectiveName: null,
};

const SEARCH_FAILED: RouteCandidates = {
  ...NEAR_ME,
  trails: [],
  trailGap: "unreachable",
};

/** Only the fields `scriptedRouteReply` reads. */
const ctx = { objective: { name: "Mont Blanc" } } as unknown as CoachContext;

function main() {
  /* ======================================================================== */
  /* SUITE 1 — AN ID THAT WAS NOT ON THE SHORTLIST DRAWS NOTHING              */
  /* ======================================================================== */

  const INVENTED: [string, string][] = [
    ["trail:999999", "an osm id that was never retrieved"],
    ["trek:the-alpine-grand-traverse", "a trek slug that does not exist"],
    [trekRouteId(TREK_OFFLIST.id), "a REAL trek that was not on this shortlist"],
    ["Sentier des Aiguilles", "a name instead of an id"],
    ["111", "an osm id with the prefix stripped"],
    ["trail:Sentier des Aiguilles", "a name wearing the trail prefix"],
    ["trail:", "an empty id"],
    ["trail:111.5", "an id that is not a whole number"],
    ["trail:0x6f", "an id in another base"],
    ["route:111", "a prefix this app does not use"],
    ["TRAIL:111", "the right id in the wrong case"],
    [" trail:111 ", "the right id with whitespace"],
  ];

  for (const [id, label] of INVENTED) {
    const drawn = resolveRouteCards([{ id, reason: "looks lovely" }], NEAR_ME);
    /* The whitespace case is the one exception and it is deliberate: the id is
       trimmed before it is matched, because a model that pads a string has
       still named a real trail. Everything else must draw nothing. */
    if (id.trim() === "trail:111") {
      ok(drawn.length === 1, `${label} — a padded but real id should still resolve`);
    } else {
      ok(drawn.length === 0, `${label} — drew ${drawn.length} card(s) and should have drawn none`);
    }
  }

  /* A hallucinated id sitting beside a real one must not take the real one down
     with it, and must not be substituted for. */
  const mixed = resolveRouteCards(
    [
      { id: "trail:999999", reason: "invented" },
      { id: trailRouteId(TRAIL_A.osmId), reason: "real" },
    ],
    NEAR_ME,
  );
  ok(mixed.length === 1, "a mix of one invented and one real id did not draw exactly one card");
  ok(mixed[0]?.kind === "trail" && mixed[0].osmId === 111, "the surviving card is the wrong one");

  /* The cap, and duplicates. */
  const capped = resolveRouteCards(
    [
      { id: trailRouteId(111), reason: "one" },
      { id: trekRouteId(TREK_A.id), reason: "two" },
      { id: trailRouteId(222), reason: "three" },
      { id: trekRouteId(TREK_B.id), reason: "four" },
    ],
    NEAR_ME,
  );
  ok(capped.length === MAX_ROUTE_PICKS, `the cap let ${capped.length} cards through`);

  const deduped = resolveRouteCards(
    [
      { id: trailRouteId(111), reason: "first reason" },
      { id: trailRouteId(111), reason: "second reason" },
    ],
    NEAR_ME,
  );
  ok(deduped.length === 1, "the same trail twice drew two cards");
  ok(deduped[0]?.reason === "first reason", "a duplicate overwrote the first reason");

  /* ======================================================================== */
  /* SUITE 2 — EVERY FIGURE ON A CARD IS THE RECORD'S                         */
  /* ======================================================================== */

  const [cardA] = resolveRouteCards([{ id: trailRouteId(111), reason: "  good  prep " }], NEAR_ME);
  ok(cardA?.kind === "trail", "a trail id did not resolve to a trail card");
  if (cardA?.kind === "trail") {
    ok(cardA.name === TRAIL_A.name, "the card renamed the trail");
    ok(cardA.lengthKm === TRAIL_A.lengthKm, "the card changed the length");
    ok(cardA.ascentM === TRAIL_A.ascentM, "the card changed the ascent");
    ok(cardA.sacScale === TRAIL_A.sacScale, "the card changed the grade");
    ok(cardA.ref === TRAIL_A.ref, "the card changed the waymark reference");
    ok(cardA.lat === TRAIL_A.lat && cardA.lon === TRAIL_A.lon, "the card moved the trail");
    ok(cardA.distanceM === TRAIL_A.distanceM, "the card changed how far away it is");
    ok(cardA.reason === "good prep", "the reason was not collapsed to one line");
  }

  /* An absent length must stay absent. Defaulting it to 0 would print "0.0 km"
     on a card, which is a measurement nobody made. */
  const [cardB] = resolveRouteCards([{ id: trailRouteId(222), reason: "x" }], NEAR_ME);
  ok(
    cardB?.kind === "trail" && cardB.lengthKm === null,
    "a trail with no recorded length did not keep its null",
  );
  ok(
    cardB?.kind === "trail" && cardB.ascentM === undefined && cardB.sacScale === undefined,
    "a trail with no ascent or grade gained one",
  );

  /* A trek card carries an ID AND NOTHING ELSE — the catalogue is bundled, so
     there is nothing to snapshot and nothing that could drift from it. */
  const [trekCard] = resolveRouteCards([{ id: trekRouteId(TREK_A.id), reason: "y" }], NEAR_ME);
  ok(trekCard?.kind === "trek" && trekCard.id === TREK_A.id, "a trek id did not resolve");
  ok(
    trekCard !== undefined && Object.keys(trekCard).sort().join(",") === "id,kind,reason",
    `a trek card carries more than an id and a reason: ${Object.keys(trekCard ?? {}).join(",")}`,
  );

  /* The reason is the one model string, and it is defanged the same way `why`
     is — this app renders exactly one piece of markdown and not here. */
  ok(
    cleanReason("**bold** `code` #head").trim() === "bold code head",
    "markdown survived a reason",
  );
  ok(cleanReason("a\nb\nc") === "a b c", "a multi-line reason was not collapsed");
  ok(cleanReason(42) === "", "a non-string reason became a string");
  ok(cleanReason("x".repeat(500)).length === 240, "a reason was not capped");

  /* ======================================================================== */
  /* SUITE 3 — THE ENVELOPE IS CLOSED                                         */
  /* ======================================================================== */

  const good = parseRouteSuggestion(SUGGEST_ROUTES, {
    routes: [{ id: "trail:111", reason: "sustained ascent, no glacier" }],
  });
  ok(good?.picks.length === 1, "a well-formed call did not parse");

  const REFUSED: [unknown, unknown, string][] = [
    ["shorten_session", { date: "2026-09-20" }, "a plan tool reached the route parser"],
    [SUGGEST_ROUTES, { routes: "the GR20" }, "a string where the array goes"],
    [SUGGEST_ROUTES, { routes: [] }, "an empty call"],
    [SUGGEST_ROUTES, { routes: ["trail:111"] }, "routes as bare strings"],
    [SUGGEST_ROUTES, { routes: [{ id: 111 }] }, "an id as a number"],
    [SUGGEST_ROUTES, { routes: [{ id: "   " }] }, "an id of whitespace"],
    [SUGGEST_ROUTES, { trails: [{ id: "trail:111" }] }, "a drifted field name"],
    [SUGGEST_ROUTES, null, "a null input"],
    [SUGGEST_ROUTES, [{ id: "trail:111" }], "an array where the object goes"],
    [null, { routes: [{ id: "trail:111" }] }, "no tool name at all"],
  ];
  for (const [name, input, label] of REFUSED) {
    ok(parseRouteSuggestion(name, input) === null, `${label} was accepted`);
  }

  /* A pick with NO reason is kept — deliberately, and unlike a plan change.
     Losing a real route because the sentence beside it was blank is the worse
     trade; the card simply omits the quotation. */
  const noReason = parseRouteSuggestion(SUGGEST_ROUTES, { routes: [{ id: "trail:111" }] });
  ok(noReason?.picks[0]?.reason === "", "a pick with no reason was refused rather than kept bare");

  /* The cap holds at the parser as well as at the resolver, so a four-route
     call cannot spend four cards' worth of anything. */
  const four = parseRouteSuggestion(SUGGEST_ROUTES, {
    routes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
  });
  ok(four?.picks.length === MAX_ROUTE_PICKS, "the parser let a fourth route through");

  /* ======================================================================== */
  /* SUITE 4 — THE GATE                                                       */
  /* ======================================================================== */

  const ASKS_FOR_ROUTES = [
    "where can I hike this weekend?",
    "can you suggest a trail near me",
    "any good walks nearby?",
    "recommend a route to prepare for Mont Blanc",
    "which trails should I do before the trip",
    "show me some hikes",
    "what treks are near my objective",
    "any hut to hut trips?",
    "I'm looking for a long distance trail",
  ];
  for (const q of ASKS_FOR_ROUTES) ok(isRouteQuestion(q), `did not reach the retrieval: "${q}"`);

  const DOES_NOT = [
    "should I hike tomorrow?",
    "my knee hurts after the walk yesterday",
    "what should I train today",
    "am I ready for Mont Blanc",
    "what should I eat before a long day",
    "how do I prepare for altitude",
    "why am I so tired",
  ];
  for (const q of DOES_NOT) ok(!isRouteQuestion(q), `pulled a trail search into: "${q}"`);

  /* ======================================================================== */
  /* SUITE 5 — THE TWO "NEARS", AND AN EMPTY THAT SAYS WHY                    */
  /* ======================================================================== */

  const cards = resolveRouteCards([{ id: trailRouteId(111), reason: "r" }], NEAR_ME);

  const mine = routeCardsSummary(cards, NEAR_ME);
  ok(mine.includes("near your area"), `a device search did not say so: "${mine}"`);
  ok(mine.includes(TRAIL_A.name), "the summary did not name the route");
  /* No figures in the stored sentence. It outlives the cards, and a length in
     prose is a length that can disagree with the card beside it. */
  ok(!/\d/.test(mine.replace(/^\d+ routes/, "")), `the summary carried a figure: "${mine}"`);

  const theirs = routeCardsSummary(cards, NEAR_MOUNTAIN);
  ok(theirs.includes("near Mont Blanc"), `an objective search did not say so: "${theirs}"`);
  ok(!theirs.includes("your area"), "an objective search claimed to be near the athlete");

  /* A trek-only list must not borrow the trail search's geography. */
  const trekOnly = resolveRouteCards([{ id: trekRouteId(TREK_A.id), reason: "r" }], NEAR_ME);
  const trekSummary = routeCardsSummary(trekOnly, NEAR_ME);
  ok(
    !trekSummary.includes("near your area"),
    `a trek-only list claimed to be near the athlete: "${trekSummary}"`,
  );
  ok(trekSummary.includes("trek catalogue"), "a trek-only list did not say where it came from");

  const blockNear = routeContextBlock(NEAR_ME);
  ok(blockNear.includes("trail:111"), "the prompt block did not carry the trail ids");
  ok(blockNear.includes(trekRouteId(TREK_A.id)), "the prompt block did not carry the trek ids");
  ok(blockNear.includes("draws NOTHING"), "the prompt block did not state the closed-world rule");
  ok(
    blockNear.includes("own approximate area"),
    "the prompt block did not say whose area it searched",
  );

  /* A list near the objective must declare that it is not a list near the
     athlete — in the prompt, and in the offline coach's own words. */
  const blockObjective = routeContextBlock(NEAR_MOUNTAIN);
  ok(
    blockObjective.includes("NOT near the athlete"),
    "a list near the objective did not declare the substitution to the model",
  );
  const spokenObjective = scriptedRouteReply(ctx, NEAR_MOUNTAIN);
  ok(
    spokenObjective.includes("around your objective rather than around you"),
    "the offline coach let an objective search pass as a search near the athlete",
  );
  ok(
    !routeContextBlock(NEAR_ME).includes("NOT near the athlete"),
    "a real device search claimed to be a substitution",
  );

  const blockNone = routeContextBlock(NOTHING_SEARCHED);
  ok(blockNone.includes("NOT SEARCHED"), "an unsearched shortlist read as an empty one");
  ok(
    blockNone.includes("no position for the athlete"),
    "an unsearched shortlist did not say permission was the reason",
  );

  const blockFailed = routeContextBlock(SEARCH_FAILED);
  ok(blockFailed.includes("SEARCH FAILED"), "a failed search read as an empty one");

  /* The offline coach: the same records, no reasons, and the same distinctions. */
  const spokenNone = scriptedRouteReply(ctx, NOTHING_SEARCHED);
  ok(
    spokenNone.includes("holds no position for you"),
    `the offline coach did not say why it had no trails: "${spokenNone}"`,
  );
  const spokenNear = scriptedRouteReply(ctx, NEAR_ME);
  ok(spokenNear.includes(TRAIL_A.name), "the offline coach did not name the nearest trails");
  ok(
    spokenNear.includes("not a judgement"),
    "the offline coach implied it had judged the fit it cannot judge",
  );
  const spokenFailed = scriptedRouteReply(ctx, SEARCH_FAILED);
  ok(
    spokenFailed.includes("could not be reached"),
    "the offline coach reported a failed search as an empty area",
  );

  console.log(`\n${passCount} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("\nFailures");
    for (const f of failures) console.log(`  - ${f}`);
    if (proc) proc.exitCode = 1;
  }
}

main();

export {};
