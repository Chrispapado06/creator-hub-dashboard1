import { MOUNTAINS } from "@/data/mock/mountains";
import { allGuides, credentialStatus, NO_GUIDES_NOTICE, type Guide } from "@/guides/types";
import { rankGuides, type GuideRequestCriteria, type RankedGuide } from "@/guides/matching";
import {
  EXPEDITION_TERRAIN_M,
  isExpeditionGround,
  operatorsFor,
  type Operator,
} from "@/services/operators";
import { GUIDE_REQUEST_NOT_SENT } from "@/guides/store";

/**
 * WHO THE ATHLETE COULD ACTUALLY HIRE — retrieval, not invention.
 *
 * Phase 2, step 3. The coach had no idea guides or operators existed: a dozen
 * places in `@/coach` tell it to *defer* to a certified guide and not one of
 * them could name a single person or company, so "engage an IFMGA guide" was
 * advice with no next step attached to it.
 *
 * ============================================================================
 * WHAT IS ACTUALLY IN THE CATALOGUE — CHECKED, AND IT DECIDES THE DESIGN
 * ============================================================================
 *
 * The brief said to establish whether any listings exist before building a
 * ranking over them. Mostly they do not, and the two halves fail differently:
 *
 *   GUIDES — the real catalogue is `[]` and stays `[]` (`@/guides/types`, rule
 *   1 at the head of that file: there is no honest placeholder for a person).
 *   Eight invented guides exist in a dev build only, compiled out of any
 *   shipped bundle by an inline env guard. So in production this module ranks
 *   NOTHING and returns the empty state, which is the correct rendering of a
 *   marketplace nobody has signed for — not a bug to be seeded away.
 *
 *   OPERATORS — three entries name REAL companies (Elite Exped, 14 Peaks, 8K
 *   Expeditions) and carry nothing but a name, the ground they work and their
 *   own website. Six more are region-shaped SAMPLE listings that exist so the
 *   enquiry flow can be walked. Both kinds ship. So there is something real
 *   here, and it is thinner than a card would like to be.
 *
 * That asymmetry is the whole shape of this file. The guide side is honest
 * about being empty; the operator side is honest about how little it holds.
 *
 * ============================================================================
 * THE RANKING, AND WHAT IS DELIBERATELY NOT IN IT
 * ============================================================================
 *
 * Guides are ordered by `rankGuides` — the SAME function the marketplace
 * screen uses, not a second one written for the coach. Two rankings would be
 * two answers to "who fits my objective", and the athlete would find them
 * disagreeing simply by tapping through from one to the other.
 *
 * `featured` takes no part in it. `rankGuides` ignores the flag outright and
 * this module lifts featured records into a SEPARATE list, so a paid slot can
 * never be read as a position that was earned. Rule 4: fit before money.
 *
 * Operators are not scored at all, and that is a refusal rather than an
 * omission. `operatorsFor` filters by region and elevation floor and then
 * sorts alphabetically; there is no fit to compute, because ICEFALL holds no
 * ratio, no route, no price and no season for a real company. A number beside
 * Elite Exped's name would be a figure ICEFALL invented about an identifiable
 * business — the exact mistake this directory has already made once (see the
 * note above `DEMO_OPERATORS`).
 *
 * ============================================================================
 * NEAR MEANS NEAR THE OBJECTIVE
 * ============================================================================
 *
 * Same rule as `./trekSuggestions`: resolved from the goal the athlete set,
 * never from device location. They told ICEFALL they are training for Mont
 * Blanc; they did not say where they are standing.
 */

/* -------------------------------------------------------------------------- */
/* What counts as a question about hiring somebody                             */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately narrow at the edges and generous in the middle.
 *
 * The block this gates is DATA — offering it on a near miss costs tokens, not
 * truth — but it must not swallow the dozen existing answers that mention a
 * guide in passing ("take instruction from an IFMGA guide"). So it fires on
 * the athlete ASKING for one: a verb of hiring or finding next to the noun, or
 * the words operator/agency/guides office, which have no other use here.
 *
 * Exported as the ONE pattern, so the scripted rule table and the model path
 * classify identically. Two copies would drift the first time one was edited,
 * and then the offline coach and the model would answer different questions.
 */
export const PROFESSIONAL_QUESTION =
  /\b(?:hire|hiring|book|booking|find|finding|recommend|suggest|choose|choosing|which|who)\b[^?.!\n]{0,40}\b(?:guide|guides|operator|operators|agency|agencies)\b|\bneed a guide\b|\bguides?\s+office\b|\bexpedition\s+(?:operator|compan(?:y|ies)|agenc(?:y|ies))\b|\bguiding\s+compan(?:y|ies)\b/i;

export function isProfessionalQuestion(q: string): boolean {
  return PROFESSIONAL_QUESTION.test(q);
}

/* -------------------------------------------------------------------------- */
/* The shortlist                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Why the operator list is empty, when it is.
 *
 * Four values because each is a different sentence to the athlete, and they
 * must not be collapsed into "none found" — "we list nobody there" and "that
 * mountain is the wrong shape for this question" are opposite answers.
 */
export type OperatorAbsence =
  /** No objective set, so there is no ground to search. */
  | "no-objective"
  /** An objective ICEFALL cannot place on a map. */
  | "unplaceable"
  /** Below `EXPEDITION_TERRAIN_M`. A category error, not a gap in the market. */
  | "not-expedition-ground"
  /** Expedition ground, and nothing in the directory covers it. */
  | "none-listed";

export interface ProfessionalShortlist {
  /** The objective this was searched against, or null. */
  objectiveName: string | null;
  elevationM: number | null;
  country: string | null;

  /** Ranked by fit. Featured records are NOT in here. */
  guides: RankedGuide[];
  /** Paid placements, ranked among themselves, rendered apart and labelled. */
  featuredGuides: RankedGuide[];
  /** True when the catalogue itself is empty — a different sentence to "filtered out". */
  guideCatalogueEmpty: boolean;

  /** Region first, then alphabetical. Featured records are NOT in here. */
  operators: Operator[];
  /** Paid placements, rendered apart and labelled. */
  featuredOperators: Operator[];
  /** Non-null whenever `operators` and `featuredOperators` are both empty. */
  operatorAbsence: OperatorAbsence | null;
}

/** How many of each the coach offers. A shortlist, not a directory. */
const MAX_GUIDES = 3;
const MAX_OPERATORS = 3;

/**
 * The criteria handed to the marketplace's own matcher.
 *
 * Only the two things the coach actually knows are filled in. Dates, party
 * size, languages and budget are left undefined on purpose: `guideMatch` drops
 * a factor it cannot compare and renormalises the rest, so an absent field
 * lowers nobody's score. Inventing "group of 1" because most people climb in
 * pairs would move the ranking on a guess.
 */
function criteriaFor(peakName: string, elevationM: number): GuideRequestCriteria {
  return { peakName, elevationM };
}

export function professionalsFor(
  objectiveName: string | null | undefined,
  objectiveElevationM?: number | null,
): ProfessionalShortlist {
  const name = objectiveName?.trim() ?? "";
  const catalogue = allGuides();

  if (name === "") {
    return {
      objectiveName: null,
      elevationM: null,
      country: null,
      guides: [],
      featuredGuides: [],
      guideCatalogueEmpty: catalogue.length === 0,
      operators: [],
      featuredOperators: [],
      operatorAbsence: "no-objective",
    };
  }

  /*
   * The curated record first, because it carries the country an operator is
   * matched on. `objectiveElevationM` is the athlete's own goal elevation and
   * is used only where ICEFALL cannot place the name — it is enough to rank
   * guides against, and not enough to search a region with.
   */
  const mountain = MOUNTAINS.find((m) => m.name.toLowerCase() === name.toLowerCase());
  const elevationM = mountain?.elevationM ?? objectiveElevationM ?? null;

  /* ---- Guides ---------------------------------------------------------- */

  const ranked = elevationM === null ? [] : rankGuides(criteriaFor(name, elevationM), catalogue);

  const featuredGuides = ranked.filter((r) => r.guide.featured === true).slice(0, MAX_GUIDES);
  const guides = ranked.filter((r) => r.guide.featured !== true).slice(0, MAX_GUIDES);

  /* ---- Operators -------------------------------------------------------- */

  let operatorAbsence: OperatorAbsence | null = null;
  let pool: Operator[] = [];

  if (!mountain || elevationM === null) {
    operatorAbsence = "unplaceable";
  } else if (!isExpeditionGround(elevationM)) {
    // Below the floor every company in the directory sets, so the query could
    // only ever answer "none". Reporting that as "no operators" reads as a gap
    // in the market rather than the category error it is: what a 2,918 m summit
    // wants is a guide for the day, not an expedition company.
    operatorAbsence = "not-expedition-ground";
  } else {
    pool = operatorsFor({ country: mountain.country, elevationM });
    if (pool.length === 0) operatorAbsence = "none-listed";
  }

  const featuredOperators = pool.filter((o) => o.featured === true).slice(0, MAX_OPERATORS);
  const operators = pool.filter((o) => o.featured !== true).slice(0, MAX_OPERATORS);

  return {
    objectiveName: name,
    elevationM,
    country: mountain?.country ?? null,
    guides,
    featuredGuides,
    guideCatalogueEmpty: catalogue.length === 0,
    operators,
    featuredOperators,
    operatorAbsence,
  };
}

/** True when there is anything at all for the app to draw under the reply. */
export function hasProfessionalCards(s: ProfessionalShortlist): boolean {
  return (
    s.guides.length > 0 ||
    s.featuredGuides.length > 0 ||
    s.operators.length > 0 ||
    s.featuredOperators.length > 0
  );
}

/* -------------------------------------------------------------------------- */
/* Standing copy                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What a guide card may NOT offer, and why it says so on its face.
 *
 * `@/guides/store` writes a request to `localStorage` and it reaches nobody.
 * An "Enquire" button on a coach guide card would therefore be a control that
 * looks like it works and does not — and the harm is physical rather than
 * cosmetic: somebody who believes a guide is engaged flies to Chamonix, or
 * walks onto a glacier expecting to be met. The guide cards link to the
 * profile and carry this sentence instead of a send button.
 *
 * OPERATOR cards are different and genuinely do send — see
 * `@/enquiries/send` — which is the entire reason the two card kinds do not
 * share an action.
 */
export const GUIDE_NO_SEND_NOTICE = GUIDE_REQUEST_NOT_SENT;

/** Reused verbatim so the coach and the marketplace give one answer. */
export const COACH_NO_GUIDES_NOTICE = NO_GUIDES_NOTICE;

export const NOT_EXPEDITION_GROUND_NOTICE = `Below about ${EXPEDITION_TERRAIN_M.toLocaleString("en-GB")} m this is a guided day rather than an expedition, and no company in ICEFALL's directory works ground that low. An objective like this wants a guide for the day, engaged through the local guides office.`;

/**
 * The sentence that travels with every operator card.
 *
 * Three facts, none compressible: ICEFALL vets nobody, an enquiry reaches
 * ICEFALL rather than the company, and a sample listing is not a company at
 * all.
 */
export const OPERATOR_CARD_NOTICE =
  "ICEFALL has no operator partnerships and vets nobody. Entries marked as a sample listing are placeholders, not companies. An enquiry goes to ICEFALL's desk, not to the operator — check any company's credentials, insurance and evacuation plan yourself before you commit.";

/** Above every guide card, once. The marketplace says the same thing. */
export const GUIDE_CARD_NOTICE =
  "Ordered by how well what you asked for matches what each guide has listed. ICEFALL has seen no carnet and checked no licence, so every qualification below is claimed rather than verified — ask to see it and check it against the issuing association yourself.";

/* -------------------------------------------------------------------------- */
/* The model's copy of the same shortlist                                      */
/* -------------------------------------------------------------------------- */

/**
 * WHAT "FEATURED" ACTUALLY MEANS TODAY, AND THE SENTENCE THAT MUST NOT DRIFT.
 *
 * The obvious copy for a promoted slot is "a paid placement", and it would be
 * FALSE. Nothing is sold. `Operator.featured` is set on one real company by the
 * owner's editorial choice (`@/services/operators`: "Nothing is being paid for
 * today"), and `Guide.featured` exists so the label could be built and tested
 * before money was involved (`@/guides/types`). Calling either a paid slot
 * would be inventing a commercial relationship and attaching it to a named,
 * identifiable business.
 *
 * So this says the two things that ARE true — it is outside the ranking, and it
 * is where a paid placement would go — and it is one constant rather than a
 * sentence written twice, so the day a position is genuinely sold there is one
 * line to change and no screen that missed the memo.
 */
export const FEATURED_SLOT_NOTICE =
  "Shown apart from the list above and taking no part in its order. ICEFALL sells no position today: this slot is an editorial choice, and it is where a paid placement would appear — labelled exactly like this — if one is ever sold.";

const FEATURED_PROMPT_HEADING = (kind: "GUIDES" | "OPERATORS") =>
  `${kind} IN THE FEATURED SLOT — outside the ranking, and nothing is sold today. It is an editorial pick, and it is where a paid placement would sit:`;

/** One guide as the facts the record actually holds. No adjectives added. */
function guideLine(r: RankedGuide, objectiveName: string | null): string {
  const g = r.guide;
  const ascents = objectiveName ? g.ascentsByMountain[objectiveName] : undefined;
  const creds = g.credentials.map((c) => `${c.label} (${credentialStatus(c)})`).join("; ");
  const bits = [
    `${g.basedIn}`,
    `ICEFALL compatibility ${r.match.score}/100`,
    `${g.yearsGuiding} yrs guiding`,
    objectiveName
      ? ascents === undefined
        ? `no recorded ascents of ${objectiveName}`
        : `${ascents} recorded ascents of ${objectiveName}`
      : null,
  ].filter(Boolean);
  return `- ${g.name} — ${bits.join(". ")}. Credentials: ${creds || "none listed"}.${
    g.demo ? " DEMONSTRATION RECORD: this person does not exist." : ""
  }`;
}

function operatorLine(o: Operator): string {
  const kind = o.sample ? "SAMPLE LISTING, not a company" : "a real company";
  const regions = o.regions.length > 0 ? o.regions.join(", ") : "worldwide";
  return `- ${o.name} — ${kind}. ${o.certification}. Works: ${regions}.${
    o.demo ? " DEMONSTRATION RECORD: this company does not exist." : ""
  }`;
}

/**
 * The block appended to the system prompt when the question asks who to hire.
 *
 * Handed over as DATA under a closed-world rule, for the same reason the trek
 * block is: a model told "suggest a guide for Mont Blanc" with no data will
 * produce one. It will have a plausible name, a plausible licence and a
 * plausible day rate, and somebody may try to hire it.
 *
 * THE MODEL IS ALSO TOLD IT MAY NOT RANK. The ordering below is the app's, out
 * of the marketplace's own matcher; a model re-sorting the three names it was
 * handed would produce a second ranking nobody could audit — and the athlete
 * would see it disagree with the cards drawn underneath the same reply.
 */
export function professionalContextBlock(
  objectiveName: string | null | undefined,
  objectiveElevationM?: number | null,
): string {
  const s = professionalsFor(objectiveName, objectiveElevationM);

  const parts: string[] = [
    s.objectiveName
      ? `GUIDES AND OPERATORS ICEFALL HOLDS FOR ${s.objectiveName.toUpperCase()}`
      : "GUIDES AND OPERATORS ICEFALL HOLDS",
  ];

  /* ---- Guides ---------------------------------------------------------- */

  if (s.guides.length === 0 && s.featuredGuides.length === 0) {
    parts.push(
      s.guideCatalogueEmpty
        ? "GUIDES: none. No guide has listed with ICEFALL. Say exactly that, do not soften it, and point them at the local guides office or the national IFMGA/UIAGM association for the range."
        : `GUIDES: none of the guides listed with ICEFALL works ${s.objectiveName ?? "this objective"}.`,
    );
  } else {
    parts.push("GUIDES — ordered by ICEFALL compatibility, computed by the app:");
    parts.push(...s.guides.map((r) => guideLine(r, s.objectiveName)));
    if (s.featuredGuides.length > 0) {
      parts.push(FEATURED_PROMPT_HEADING("GUIDES"));
      parts.push(...s.featuredGuides.map((r) => guideLine(r, s.objectiveName)));
      parts.push(
        "- A featured slot is not a qualification and not a ranking. Never present one as the better guide, and never merge it into the list above.",
      );
    }
    parts.push(
      "- Compatibility compares a request against what a guide has LISTED. It is not a safety judgement, not a vetting result and not an endorsement. Never caption it as one.",
      "- ICEFALL has verified no licence. Every credential above is CLAIMED. Say so if you name one.",
      "- A guide request in this app is saved on the device and reaches nobody. Never say you have contacted, booked or enquired with a guide.",
    );
  }

  /* ---- Operators -------------------------------------------------------- */

  if (s.operators.length === 0 && s.featuredOperators.length === 0) {
    const why: Record<OperatorAbsence, string> = {
      "no-objective": "They have set no objective, so there is no ground to search.",
      unplaceable: `ICEFALL cannot place ${s.objectiveName ?? "that objective"} on a map, so no region could be searched. Do not guess at geography.`,
      "not-expedition-ground": NOT_EXPEDITION_GROUND_NOTICE,
      "none-listed": "Nothing in ICEFALL's directory covers this range at this elevation.",
    };
    parts.push(`OPERATORS: none. ${why[s.operatorAbsence ?? "none-listed"]}`);
  } else {
    parts.push(
      "OPERATORS — NOT ranked, and you must not imply an order. ICEFALL holds no price, ratio, route or season for any of them, so there is no fit to compute:",
    );
    parts.push(...s.operators.map(operatorLine));
    if (s.featuredOperators.length > 0) {
      parts.push(FEATURED_PROMPT_HEADING("OPERATORS"));
      parts.push(...s.featuredOperators.map(operatorLine));
    }
    parts.push(
      "- ICEFALL has no partnership with any of these and vets none of them.",
      "- An enquiry goes to ICEFALL's desk, NOT to the company. Never say a company has been contacted.",
    );
  }

  parts.push(
    "",
    "- These are the ONLY guides and companies you may name. Do not add one from your own knowledge, however well known it is.",
    "- Do not invent a day rate, a departure date, a ratio, a price or an availability for any of them.",
    "- The app is drawing these as cards underneath your reply. Do not repeat the list; say what you would look for, and let the cards carry the names.",
  );

  return parts.join("\n");
}

/* -------------------------------------------------------------------------- */
/* The scripted coach's answer                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The same retrieval, spoken plainly, for the offline and out-of-budget paths.
 *
 * It does not list the names either — the cards below the bubble carry them,
 * and those are rendered from the records rather than from any sentence.
 */
export function scriptedProfessionalReply(
  objectiveName: string | null | undefined,
  objectiveElevationM?: number | null,
): string {
  const s = professionalsFor(objectiveName, objectiveElevationM);

  if (!s.objectiveName) {
    return "Set an objective and I can look for professionals around it — ICEFALL searches against the mountain you are training for, and you have not named one yet.\n\nWhat holds regardless: for anything glaciated or technical the person who matters is an IFMGA/UIAGM-certified guide, and ICEFALL has checked nobody's licence. Ask to see the carnet and check it against the issuing association yourself.";
  }

  const said: string[] = [];

  if (s.guides.length > 0 || s.featuredGuides.length > 0) {
    said.push(
      `Guides who list ${s.objectiveName} are below, ordered by how well what you are asking for matches what they have listed. That number is a comparison, not a verdict on anybody — ICEFALL has seen no carnet and verified no licence, so every qualification on those cards is claimed rather than checked.`,
    );
    said.push(
      "Requests made in this app are saved on your device and reach nobody. To actually engage someone, contact them or their guides office directly.",
    );
  } else if (s.guideCatalogueEmpty) {
    said.push(COACH_NO_GUIDES_NOTICE);
  } else {
    said.push(
      `No guide listed with ICEFALL works ${s.objectiveName}. I will not offer you somebody who has not been on it — ask the local guides office for the range instead.`,
    );
  }

  const operatorCount = s.operators.length + s.featuredOperators.length;
  if (operatorCount > 0) {
    said.push(
      `On the company side, ${operatorCount === 1 ? "one company is" : `${operatorCount} companies are`} below. That is a shortlist rather than the whole directory, and it is not ranked: ICEFALL holds no price, ratio, route or season for any of them, so there is nothing honest to sort them by. An enquiry goes to ICEFALL's desk rather than to the company.`,
    );
  } else if (s.operatorAbsence === "not-expedition-ground") {
    said.push(NOT_EXPEDITION_GROUND_NOTICE);
  } else if (s.operatorAbsence === "unplaceable") {
    said.push(
      `ICEFALL cannot place ${s.objectiveName} on a map, so I have no region to search for companies and will not guess at one.`,
    );
  } else {
    said.push("Nothing in ICEFALL's operator directory covers this range at this elevation.");
  }

  return said.join("\n\n");
}

export type { Guide, Operator, RankedGuide };
