import { MOUNTAINS } from "@/data/mock/mountains";
import { TREKS } from "@/treks";
import { trekDuration, type Trek } from "@/treks/model";

/**
 * Trek suggestions for the coach — retrieval, not invention.
 *
 * PH-14b, the owner's note: *"if a client asks for suggested treks ai needs to
 * look through the database and suggest 'near him' treks that fit the goal the
 * user has."*
 *
 * ── WHY THIS IS A RETRIEVAL STEP AND NOT A PROMPT INSTRUCTION ───────────────
 *
 * The coach is a language model behind a proxy (and a scripted fallback when
 * the model is unreachable or unaffordable). Told "suggest treks near their
 * objective" with no data, a model WILL produce treks — real-sounding ones,
 * with plausible durations, some of which will not exist and none of which
 * ICEFALL holds. So the flow is inverted: this module looks through the real
 * records first, and the model is handed the shortlist with an explicit
 * instruction that these are the only treks it may name. A hardcoded
 * suggestion list would be worse than nothing; so would a freely-imagining
 * model. Both are the same failure — a recommendation that traces to nobody.
 *
 * ── WHAT "NEAR HIM" MEANS HERE, AND WHAT IT MUST NEVER MEAN ─────────────────
 *
 * Near the OBJECTIVE, resolved from the athlete's stated goal — never from
 * device location. The athlete told ICEFALL "I am training for Mont Blanc";
 * they did not tell it where they are standing, and a coach that knew would be
 * a different product. Two bands, in order:
 *
 *   1. Treks linked to the objective's mountain itself (`mountainIds`).
 *   2. Treks in the same country, by token intersection — trek countries are
 *      strings like "France / Italy / Switzerland".
 *
 * No third band. A "nearby" that has drifted to the same continent is not
 * near, and padding the list dilutes the two bands that mean something.
 */

export interface TrekSuggestions {
  treks: Trek[];
  /** What "near" meant for this list. Null when there is no objective. */
  basis: "mountain" | "country" | null;
  objectiveName: string | null;
}

const MAX_SUGGESTIONS = 5;

function countryTokens(s: string): string[] {
  return s
    .split("/")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

export function suggestedTreksFor(objectiveName: string | null | undefined): TrekSuggestions {
  const name = objectiveName?.trim() ?? "";
  if (name === "") return { treks: [], basis: null, objectiveName: null };

  const mountain = MOUNTAINS.find((m) => m.name.toLowerCase() === name.toLowerCase());
  if (!mountain) {
    // A typed-in objective ICEFALL cannot place. No guessing at geography: the
    // honest list is empty, and the caller says so.
    return { treks: [], basis: null, objectiveName: name };
  }

  const linked = TREKS.filter((t) => t.mountainIds.includes(mountain.id));

  const wanted = new Set(countryTokens(mountain.country));
  const sameCountry = TREKS.filter(
    (t) =>
      !t.mountainIds.includes(mountain.id) && countryTokens(t.country).some((c) => wanted.has(c)),
  );

  const treks = [...linked, ...sameCountry].slice(0, MAX_SUGGESTIONS);
  return {
    treks,
    basis: treks.length === 0 ? null : linked.length > 0 ? "mountain" : "country",
    objectiveName: name,
  };
}

/**
 * What counts as a trek question. Deliberately generous — the block this gates
 * is data, and offering it on a near-miss costs tokens, not truth.
 *
 * Exported as the ONE pattern: the scripted coach's rule table matches against
 * this same object. Two copies of "what is a trek question" would drift the
 * moment one is edited, and then the scripted coach and the model would answer
 * different sets of questions — §6aa in miniature.
 */
export const TREK_QUESTION =
  /\btrek|trekking|hut.to.hut|multi.?day (hike|walk)|long.distance (walk|trail|path)\b/i;

export function isTrekQuestion(q: string): boolean {
  return TREK_QUESTION.test(q);
}

/*
 * `trekContextBlock` WAS HERE AND IS GONE — Phase 2, step 3.
 *
 * It built the closed-world trek block for the system prompt. That job moved to
 * `coach/routeSuggestions.ts`, which builds ONE block covering treks and trails
 * together, because a question asking where to walk can want either and two
 * blocks would eventually have disagreed with each other about what "near"
 * meant. Deleted rather than left standing for exactly that reason: a second
 * definition of the closed world is a second thing to keep true.
 *
 * The retrieval above it — `suggestedTreksFor` — is unchanged and is what the
 * new block calls, so there is still only one answer to "which treks are near
 * this objective".
 */

/**
 * The scripted coach's answer to a trek question — the same retrieval, spoken
 * plainly. One source for both paths, so the offline coach and the model can
 * never suggest different worlds.
 */
export function scriptedTrekReply(objectiveName: string | null | undefined): string {
  const s = suggestedTreksFor(objectiveName);

  if (!s.objectiveName) {
    return "Set an objective first and I can look for treks around it — ICEFALL suggests treks near the mountain you are training for, and you have not named one yet. Explore → Treks has the full catalogue meanwhile.";
  }

  if (s.treks.length === 0) {
    return `ICEFALL's trek catalogue holds nothing linked to ${s.objectiveName} or its country, so I have no honest "nearby" to offer — I will not guess at geography. Explore → Treks has the full catalogue by region.`;
  }

  const lines = s.treks
    .map((t) => {
      const parts = [trekDuration(t), t.difficulty ?? null].filter(Boolean);
      return `${t.name} — ${parts.join(", ")}`;
    })
    .join("\n");

  const how =
    s.basis === "mountain"
      ? `linked to ${s.objectiveName} itself`
      : `in the same country as ${s.objectiveName}`;

  return `From ICEFALL's own records, ${how}:\n\n${lines}\n\nEach has a full page under Explore → Treks with the route, season and high point. The difficulty grades are the record's own — whether one suits where your training is right now is a conversation, not a list.`;
}
