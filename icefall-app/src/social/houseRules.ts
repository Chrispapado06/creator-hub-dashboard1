/**
 * THE HOUSE RULES — the owner's words, one copy of them, and the honest
 * account of what an acknowledgement stored on a phone is worth.
 *
 * ── WHY THIS FILE EXISTS RATHER THAN A STRING IN A COMPONENT ─────────────────
 *
 * A removal notice has to cite a clause, and the person appealing has to be
 * able to read the same clause. Those two sentences have to be the same text,
 * or the notice is unanswerable: "removed under rule 4" is worth nothing to
 * somebody whose app never showed them a rule 4.
 *
 * So every surface QUOTES this file and none of them keeps a copy. The composer,
 * a rules screen, and one day the notice itself all read `HOUSE_RULES`. Two
 * surfaces holding their own copy is exactly how a notice ends up citing text
 * the app never showed.
 *
 * ── THE ONE STATEMENT OF THE RULES, AND THE ONE THAT WAS REPLACED ────────────
 *
 * `social/community.ts` exported `COMMUNITY_HOUSE_RULE` — "Built for mountain
 * athletes. Be respectful. Report anything that doesn't belong." — rendered in
 * `screens/explore/Community.tsx:470`. That sentence was a SECOND statement of
 * the rules, and a materially different one: "be respectful" is a rule nobody
 * wrote down, cannot be cited, and cannot be appealed. Enforcing it would mean
 * removing a post under a clause with no number.
 *
 * It is now an alias of `HOUSE_RULES_SUMMARY` below, so the banner in Community
 * points AT the six rules instead of standing in for them. There is one
 * statement of the rules in this app and it is the array below.
 *
 * ── WHERE THE RULES APPLY, established by reading the code ───────────────────
 *
 * Four paths publish something a rule could be broken on. They are not the same
 * kind of thing and the ruling for each is different:
 *
 *   `components/social/Composer.tsx` (called once, Community.tsx:543) — POSTING.
 *     Words, a photograph and a story to a public feed. This is the surface the
 *     rules were written for, and the one the gate belongs on.
 *   `components/social/PublishSummit.tsx` — POSTING. A summit log is a post; it
 *     carries a photograph and a caption to the same feed with a route attached.
 *     Same gate, same rules.
 *   `screens/explore/GroupWorkspace.tsx:2807` — CARRIES PHOTOGRAPHS TO OTHER
 *     PEOPLE. An image picker and a message body, sent to everybody in the
 *     group. A photograph of a dead climber is that photograph whether it lands
 *     on a feed or in a group of eleven, so rules 1–4 apply in substance. It is
 *     a smaller audience, not a private one. A SECOND acknowledgement here would
 *     be theatre: link to the rules, do not re-ask.
 *   `components/social/CreateHighlight.tsx` — NOT A NEW PUBLICATION. It gathers
 *     the author's OWN existing stories under a name. No new photograph and no
 *     new caption enter the app; the only new public text is the highlight's
 *     name. The underlying posts already passed the gate. No gate here.
 *
 * And one that is NOT posting, checked rather than assumed:
 *
 *   `screens/chat/Thread.tsx` — a direct message, TEXT ONLY. The attach button
 *     at :236 is `disabled` and there is no file input anywhere in the file, so
 *     no image can travel this path at all. Rule 6 still describes conduct in a
 *     DM — and `chat/data.ts` already carries `OFF_PLATFORM_WARNING` for it —
 *     but a rules gate in front of a private message to one person is not what
 *     these rules are.
 *
 * ── NO MODAL. NOT EVEN THIS ONE ──────────────────────────────────────────────
 *
 * `00-CONSTITUTION.md:63` and `:129`. A rules gate is precisely the shape
 * somebody reaches for a modal to build, and it must not be one: the rules go
 * INLINE above the composer, in the flow, where the athlete can read them with
 * their thumb still on the box.
 *
 * And `components/growth/UpgradePrompt.tsx` forbids "an x that dismisses a
 * thing which then returns tomorrow". There is no dismiss here — only an
 * acknowledgement — and it is keyed by version, so the only thing that can make
 * it come back is the rules actually changing. That is the whole design: see
 * `HOUSE_RULES_VERSION`.
 *
 * ── COLD, GLOVED, 4AM, OFFLINE ───────────────────────────────────────────────
 *
 * Nothing in this file touches the network. The rules are compiled into the
 * bundle and the acknowledgement is `localStorage`. Somebody in a hut with no
 * signal can read the rules and post. That is also the source of this file's
 * central weakness, and it is stated rather than implied — see
 * `HOUSE_RULES_ACK_IS_LOCAL`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

/* -------------------------------------------------------------------------- */
/* The rules                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A STABLE ID, AND IT IS NOT THE POSITION. This is the distinction the whole
 * file turns on, so it is written out rather than left to be inferred.
 *
 * `id` names the RULE. `number` is what the rule is CALLED on screen and in a
 * notice. `HOUSE_RULES.indexOf(rule)` is where it happens to sit in an array
 * today, and it is none of anybody's business.
 *
 * They are three different things because they change at different rates, or
 * rather because two of them must never change at all:
 *
 *   · the ARRAY POSITION moves whenever anybody reorders the list — a display
 *     decision that nobody should have to think twice about;
 *   · the NUMBER must survive that, and must survive a deletion, because a
 *     removal notice sent in March cites a number and is appealed in June;
 *   · the ID must survive even a renumbering, because it is what the code
 *     stores, tests and cites with.
 *
 * A notice that recorded `human-remains` still resolves after somebody deletes
 * rule 2, reorders the array, and rewrites the title. A notice that recorded
 * "the fourth element" resolves to whatever is fourth this week.
 *
 * NEVER REUSE AN ID. If a rule is retired and something later takes its place,
 * the replacement gets its own id and its own number. An id that has meant two
 * different things is worse than no id, because it resolves — to the wrong text.
 */
export type HouseRuleId =
  | "own-photographs"
  | "no-sexual-content"
  | "injuries-and-rescues"
  | "human-remains"
  | "route-names"
  | "payment-and-qualifications";

export interface HouseRule {
  /** Stable forever. Never derived from position. See `HouseRuleId`. */
  readonly id: HouseRuleId;
  /**
   * The number as displayed, and as a removal notice cites it. AUTHORED, never
   * computed — see the warning above `HOUSE_RULES`.
   */
  readonly number: number;
  /**
   * A short name a notice can use: "removed under rule 4 (Human remains)". Not
   * the rule, and never a substitute for it — a notice quotes `text` as well.
   * Rewording a title is not a material change; see `HOUSE_RULES_VERSION`.
   */
  readonly title: string;
  /**
   * The owner's words, VERBATIM. Not paraphrased, not softened, not shortened.
   *
   * THE PUNCTUATION IS NOT UNIFORM AND THAT IS NOT A BUG TO FIX. Rule 5 carries
   * a curly apostrophe in "that’s"; rules 2, 4 and 6 carry straight ones. That
   * is how the rules were written, this is a verbatim copy, and normalising
   * them would be an edit to a document this file does not own. (If somebody
   * with the authority to edit the rules does normalise them, it is NOT a
   * material change and does not bump the version.)
   */
  readonly text: string;
  /**
   * The version in which this rule stopped applying, if it has. Undefined means
   * it is current.
   *
   * A RETIRED RULE IS MOVED TO `RETIRED_HOUSE_RULES`, NOT DELETED, because the
   * appeal outlives the rule: somebody removed under rule 2 in March must still
   * be able to read rule 2 in June, after rule 2 has been withdrawn. Deleting it
   * makes their notice unanswerable, which is the exact failure this file
   * exists to prevent.
   */
  readonly retiredIn?: number;
}

/** The heading, so the composer and the rules screen name it identically. */
export const HOUSE_RULES_TITLE = "ICEFALL house rules";

/**
 * THE RULES. The owner's text, reproduced word for word.
 *
 * ── WHAT A FUTURE EDITOR MUST NEVER DO ───────────────────────────────────────
 *
 * 1. NEVER DERIVE `number` FROM THE POSITION. Not `index + 1`, not a `map`, not
 *    a helper that "keeps them tidy". The numbers are typed out below precisely
 *    so that an edit to this array cannot silently renumber the rest. The day
 *    rule 2 is deleted, the list must read 1, 3, 4, 5, 6 — with a gap — and
 *    every notice ever sent still resolves.
 * 2. NEVER CLOSE A GAP. A gap is the evidence that a rule existed. Renumbering
 *    5 down to 4 rewrites history: every notice citing rule 4 now cites the
 *    wrong text, and it does so silently, and nobody finds out until somebody
 *    appeals.
 * 3. NEVER REUSE A NUMBER. Same reason. A new rule takes the next unused number
 *    — 7, then 8 — however tidy 2 would look.
 * 4. NEVER EDIT THE TEXT. These are the owner's words and they are editorial.
 *    Changing them is the owner's act, not a developer's, and if it happens see
 *    `HOUSE_RULES_VERSION` before anything else.
 *
 * The DEV check below enforces (1)–(3) as far as anything can: it cannot know
 * what the numbers should be, but it can refuse to start if they have gone
 * inconsistent.
 */
export const HOUSE_RULES: readonly HouseRule[] = Object.freeze([
  Object.freeze({
    id: "own-photographs",
    number: 1,
    title: "Your own photographs",
    text: "Post your own photographs, or ones you have the right to post.",
  }),
  Object.freeze({
    id: "no-sexual-content",
    number: 2,
    title: "No sexual content",
    text: "No sexual content or nudity. Not a judgement about your body — it's a mountaineering app, and there are better places for it.",
  }),
  Object.freeze({
    id: "injuries-and-rescues",
    number: 3,
    title: "Injuries and rescues",
    text: "Injuries, frostbite, blood and rescues are allowed. This is a sport where people get hurt, and honest photographs of that are useful to other climbers. Say what happened in the caption.",
  }),
  Object.freeze({
    id: "human-remains",
    number: 4,
    title: "Human remains",
    text: "Human remains: do not post identifiable images of the dead. Everest has permanent landmarks who are somebody's family. Describe the route; don't photograph the person.",
  }),
  Object.freeze({
    id: "route-names",
    number: 5,
    title: "Route names",
    text: "Route names are route names. If a first ascensionist named it something crude, that’s the name.",
  }),
  Object.freeze({
    id: "payment-and-qualifications",
    number: 6,
    title: "Payment and qualifications",
    text: "Don't take payment off-platform, and don't claim qualifications you don't hold.",
  }),
] as const satisfies readonly HouseRule[]);

/**
 * Rules that no longer apply, kept so an old notice can still be read.
 *
 * Empty today, and it is not dead code: it is the destination a rule moves to
 * instead of being deleted, and `houseRule()` searches it. A person appealing a
 * removal from six months ago is entitled to read the clause they were removed
 * under, whether or not ICEFALL still enforces it.
 *
 * Every entry here carries `retiredIn`, so a rules screen can say "this rule
 * applied until version 3" rather than presenting a withdrawn rule as current.
 */
export const RETIRED_HOUSE_RULES: readonly HouseRule[] = Object.freeze([]);

/* -------------------------------------------------------------------------- */
/* Version                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * THE VERSION OF THE RULE SET, and the honest thing a bump means.
 *
 * An acknowledgement is stored against a version — see `acknowledgeHouseRules`
 * — so bumping this INVALIDATES EVERY ACKNOWLEDGEMENT ANYBODY HAS GIVEN. That
 * is not a side effect to work around. It is the point.
 *
 * Somebody who accepted the old rules has not accepted the new ones. They have
 * not read them; nobody showed them. If the app went on treating the old
 * acceptance as current, the acknowledgement would be recording a fact that is
 * not true — and an acknowledgement that can record a thing that did not happen
 * is worth nothing at all, on any surface, for any version. One dishonest yes
 * devalues every other one.
 *
 * ── WHAT COUNTS AS MATERIAL ──────────────────────────────────────────────────
 *
 * MATERIAL — bump, and re-ask everybody:
 *   · a rule added, or removed;
 *   · any change to what is permitted, forbidden or required, however small —
 *     rule 3's "Say what happened in the caption" is a requirement, and dropping
 *     it is material even though it deletes six words;
 *   · a change to a rule's scope, its subject, or what happens when it is
 *     broken;
 *   · a rule's NUMBER changing. This must never happen — see the warning above
 *     `HOUSE_RULES` — but if it somehow does, it is material, because every
 *     notice already sent now cites different text.
 *
 * NOT MATERIAL — do not bump:
 *   · a spelling or punctuation fix that leaves the meaning identical, the
 *     curly apostrophe in rule 5 included;
 *   · a `title` reworded to name the same rule better;
 *   · comments, ordering, formatting, anything in this file that is not `text`
 *     or `number` or the membership of the array.
 *
 * ── THE TEST, FOR WHOEVER IS DECIDING ────────────────────────────────────────
 *
 * Read the old text and the new text as the person appealing a removal. Could
 * the new wording remove a post the old wording allowed? Could it allow one the
 * old wording removed? Either way it is material.
 *
 * IF YOU CANNOT DECIDE, BUMP IT. The costs are not symmetric. A needless bump
 * costs every athlete one tap. A missed one means ICEFALL's app claims somebody
 * agreed to words it never put in front of them — which is a false claim about
 * a person, made by us, in writing.
 *
 * Monotonic integers, never reused, never reset. `1` is the first set the app
 * ever showed.
 */
export const HOUSE_RULES_VERSION = 1;

/**
 * When this version of the rules was written, `YYYY-MM-DD`.
 *
 * Carried so a notice or a rules screen can name WHICH text was in force, in
 * language a person understands, rather than printing an integer at them. It is
 * the authoring date of the version, not the date anybody accepted it — the
 * acceptance carries its own instant.
 *
 * A bare local date, deliberately: this repository has already paid for the
 * difference once (commit f2cb54c, "fmtDate showed every bare date a day early
 * across the Americas"). Never build a `Date` from it without saying which
 * timezone you mean.
 */
export const HOUSE_RULES_VERSION_DATE = "2026-09-03";

/* -------------------------------------------------------------------------- */
/* Copy that must exist in exactly one place                                   */
/* -------------------------------------------------------------------------- */

/**
 * The one-line banner. What `COMMUNITY_HOUSE_RULE` now resolves to.
 *
 * It POINTS AT the rules and does not attempt to be them. The sentence it
 * replaced tried to be them in fourteen words and produced a clause with no
 * number, which is the one thing a house rule cannot be.
 */
export const HOUSE_RULES_SUMMARY =
  "Six house rules, numbered so a removal can name the one it means.";

/**
 * WHAT AN ACKNOWLEDGEMENT ON THIS DEVICE IS, said to the athlete in the words
 * this module would use to a lawyer. Exported so no surface can soften it while
 * this file quietly knows better.
 *
 * See the long note above `HOUSE_RULES_ACK_KEY` for the reasoning; this is the
 * sentence, and it must be rendered wherever the acknowledgement is taken.
 */
export const HOUSE_RULES_ACK_IS_LOCAL =
  "This is recorded on this phone and nowhere else. ICEFALL holds no record that you read these rules, sign in on another device and it will ask again, and nothing stored here could be produced as evidence in an appeal — by you or by us.";

/** The words on the control. One spelling, so two screens cannot disagree. */
export const HOUSE_RULES_ACK_LABEL = "I have read the house rules";

/**
 * Shown when this device holds an acknowledgement for an EARLIER version.
 *
 * The honest sentence for the one case that makes the version worth having: the
 * rules changed materially, and a previous yes is not a yes to these.
 */
export const HOUSE_RULES_NEW_VERSION_NOTICE =
  "The house rules have changed since you last read them. Your earlier acknowledgement was for the old wording, so it does not carry over — these are the rules as they stand now.";

/**
 * The device-only record, and what would be needed for it to mean anything.
 *
 * NOT BUILT, said plainly rather than left for somebody to assume. There is no
 * `house_rule_acknowledgements` table, no column on `profiles`, and no write of
 * any kind leaving this file. If a removal is ever disputed — "I was never
 * shown that rule" — ICEFALL has nothing to answer with, because ICEFALL has
 * nothing. Whatever is in `localStorage` on the athlete's own phone is a value
 * they can edit, on a device we do not hold, and it is not evidence.
 *
 * A server-side record would be one row: profile id, version, the instant, and
 * ideally a hash of the exact text shown. That is what would make the
 * acknowledgement mean something in a dispute. Migrations are gated (rule 3 of
 * the constitution), so it is named here and left undone rather than half-built.
 */
export const HOUSE_RULES_ACK_NOT_HELD_BY_ICEFALL =
  "ICEFALL does not hold a record of who has read the house rules. Acknowledgement is stored on each device, so it is not something ICEFALL could produce, check, or hold against anybody.";

/* -------------------------------------------------------------------------- */
/* Lookup                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A rule by its stable id — current OR retired.
 *
 * TAKES A PLAIN STRING, not `HouseRuleId`, and that is deliberate. Every real
 * caller is resolving an id that came out of storage or off a notice written
 * months ago, where the compiler has nothing to say about whether the string is
 * still one of the six. `undefined` is the honest answer for a string this
 * build has never heard of, and a caller that has a literal in hand still gets
 * full checking from `HouseRuleId` at the point they wrote it.
 *
 * Retired rules are searched too. A notice from before a rule was withdrawn is
 * still a notice somebody is entitled to read.
 */
export function houseRule(id: string): HouseRule | undefined {
  return (
    HOUSE_RULES.find((rule) => rule.id === id) ??
    RETIRED_HOUSE_RULES.find((rule) => rule.id === id)
  );
}

/**
 * A rule by the number it is called on screen.
 *
 * FOR READING AN OLD NOTICE, and nothing else. Anything being written now
 * should carry the id: a number is the DISPLAY of a rule, and while nothing in
 * this file will ever renumber one, a number is the weaker key of the two and
 * storing it is how a system ends up depending on the display.
 */
export function houseRuleByNumber(number: number): HouseRule | undefined {
  return (
    HOUSE_RULES.find((rule) => rule.number === number) ??
    RETIRED_HOUSE_RULES.find((rule) => rule.number === number)
  );
}

/**
 * How a rule is named in a removal notice: `Rule 4 — Human remains`.
 *
 * The citation only. The notice must also QUOTE `rule.text` — a person cannot
 * appeal a number, and the whole reason this file is a single source of truth
 * is so the quoted words are the words the app showed.
 */
export function houseRuleCitation(rule: HouseRule): string {
  return `Rule ${rule.number} — ${rule.title}`;
}

/* -------------------------------------------------------------------------- */
/* Acknowledgement                                                             */
/* -------------------------------------------------------------------------- */

/**
 * WHERE AN ACKNOWLEDGEMENT LIVES, AND WHAT IT IS NOT. Read this before changing
 * anything below it.
 *
 * `social/promoted.ts` established this idiom for per-person device state and
 * gives the reasoning: a record keyed BY ACCOUNT rather than a flat value,
 * "because two people share a phone more often than anybody plans for" — and
 * one person's yes must not answer for the other. `settings/store.ts` supplies
 * the rest of the shape: one key, one subscriber list so two open screens agree,
 * and a read that treats an unreadable store as an empty one instead of throwing.
 *
 * THREE THINGS THIS RECORD IS NOT, and no surface may imply otherwise:
 *
 *   1. IT IS NOT PROOF ANYBODY READ ANYTHING. It is a record that a control was
 *      operated on this device. Somebody can tap it in under a second with the
 *      rules scrolled off the screen, and this file will store exactly the same
 *      row as for somebody who read every word. A tap is a tap.
 *   2. IT DOES NOT FOLLOW ANYBODY TO A NEW PHONE. `promoted.ts` says the same
 *      thing about dismissals and calls it "a real breach of the promise, stated
 *      here rather than papered over". Here it is milder and still true: a new
 *      device, a reinstall, a cleared store, or a browser in private mode all
 *      mean the rules are shown again. That is the correct behaviour for a
 *      record that only ever existed locally — the alternative is assuming a yes
 *      that this build has never seen.
 *   3. IT IS NOT A RECORD ICEFALL HOLDS. See
 *      `HOUSE_RULES_ACK_NOT_HELD_BY_ICEFALL`. Nothing here is sent anywhere,
 *      nothing is queued to be sent, and there is no table waiting for it.
 *
 * SO WHAT IS IT FOR? One honest thing: making sure the rules were PUT IN FRONT
 * of somebody before they posted, and not put in front of them again every
 * single time. That is a courtesy to the athlete, not evidence about them.
 *
 * The `.v1` in the key is the STORE FORMAT version and has nothing to do with
 * `HOUSE_RULES_VERSION`. They are both 1 today, which is a coincidence and a
 * trap: the rules version lives INSIDE each record. Bumping the rules must never
 * touch this string, or every device silently forgets its whole history.
 */
const HOUSE_RULES_ACK_KEY = "icefall.houseRules.ack.v1";

/** One acknowledgement: which rules, and when this device recorded it. */
export interface HouseRulesAcknowledgement {
  /** The rule-set version that was on screen. See `HOUSE_RULES_VERSION`. */
  readonly version: number;
  /** ISO instant this device wrote the record. Its own clock, unverified. */
  readonly at: string;
}

/** Accounts, to what that account has acknowledged on this device. */
type AcksByAccount = Record<string, HouseRulesAcknowledgement[]>;

/**
 * How many versions of history one account keeps on one device.
 *
 * The rules will not change often enough for this to bind, and an uncapped list
 * in `localStorage` with no reader is a leak. Trimming is oldest-first, so the
 * only thing that can ever be lost is the record of a version that has already
 * been superseded twice over.
 */
const MAX_ACK_HISTORY = 20;

function readAckStore(): AcksByAccount {
  try {
    const raw = localStorage.getItem(HOUSE_RULES_ACK_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: AcksByAccount = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const acks: HouseRulesAcknowledgement[] = [];
      for (const entry of value) {
        if (!entry || typeof entry !== "object") continue;
        const { version, at } = entry as { version?: unknown; at?: unknown };
        /* A record with no version cannot be matched against anything, and a
           record with no instant cannot be shown to anybody. Neither is worth
           keeping, and neither may be repaired with a guess: defaulting a
           missing version to the current one would manufacture a yes. */
        if (typeof version !== "number" || !Number.isFinite(version)) continue;
        if (typeof at !== "string" || at.length === 0) continue;
        acks.push({ version, at });
      }
      if (acks.length > 0) out[key] = acks;
    }
    return out;
  } catch {
    /* Private mode, a full quota, a hostile value somebody pasted in. An
       unreadable store is an empty one — which means the rules are shown again,
       never that an acknowledgement is assumed. */
    return {};
  }
}

/**
 * One subscriber list, so a composer and a rules screen open at once cannot
 * disagree about whether the rules have been acknowledged. Straight out of
 * `settings/store.ts`, for the reason it gives.
 */
const listeners = new Set<() => void>();

/**
 * The account key for a signed-in athlete, or for a device with nobody on it.
 *
 * `auth/session.ts` returns THREE states and the third is the one that matters:
 * `undefined` means "not known yet", and it must not be collapsed into "signed
 * out". So this returns `null` for `undefined`, and every read below treats a
 * null key as "we do not know yet" rather than as an answer.
 *
 * THE SIGNED-OUT KEY IS ONE KEY FOR THE WHOLE DEVICE, and that is as honest as
 * it can be: with nobody signed in there is nothing to tell two people apart,
 * so two signed-out people sharing a phone share one acknowledgement. Said here
 * rather than discovered. A signed-in athlete gets their own uid and does not
 * inherit it.
 */
export const HOUSE_RULES_DEVICE_KEY = "device";

export function houseRulesAccountKey(uid: string | null | undefined): string | null {
  if (uid === undefined) return null;
  return uid && uid.length > 0 ? uid : HOUSE_RULES_DEVICE_KEY;
}

/**
 * Every version this account has acknowledged on this device, newest last.
 *
 * For a rules screen that wants to say "you read version 1 on 3 September".
 * Empty for an account this device has never seen — which is the ordinary case
 * on a new phone, and is not evidence that anybody declined anything.
 */
export function houseRulesAcknowledgements(
  accountKey: string | null,
): readonly HouseRulesAcknowledgement[] {
  if (!accountKey) return [];
  return readAckStore()[accountKey] ?? [];
}

/**
 * The acknowledgement for THE CURRENT VERSION, or null.
 *
 * MATCHED ON THE VERSION, EXACTLY. A record for version 1 does not answer for
 * version 2, and there is no "close enough" branch here and must never be one —
 * see `HOUSE_RULES_VERSION` for why a bump is supposed to hurt.
 */
export function houseRulesAcknowledged(
  accountKey: string | null,
): HouseRulesAcknowledgement | null {
  if (!accountKey) return null;
  const mine = readAckStore()[accountKey] ?? [];
  return mine.find((ack) => ack.version === HOUSE_RULES_VERSION) ?? null;
}

/**
 * Record that this device put the current rules in front of this account and
 * they operated the control.
 *
 * Returns what was stored, so a caller can render it without re-reading. It
 * never throws: a store that cannot be written is a device that will ask again
 * next time, which is the safe direction to fail in.
 *
 * ALREADY-ACKNOWLEDGED IS A NO-OP. Re-tapping does not move the instant
 * forward, because the instant answers "when were these rules shown to you",
 * and the first time is the true answer.
 */
export function acknowledgeHouseRules(accountKey: string | null): HouseRulesAcknowledgement | null {
  if (!accountKey) return null;
  const existing = houseRulesAcknowledged(accountKey);
  if (existing) return existing;

  const ack: HouseRulesAcknowledgement = {
    version: HOUSE_RULES_VERSION,
    /* The device's own clock, and nothing anywhere verifies it. A phone set to
       2019 records 2019. Worth knowing before this instant is ever printed in
       something that looks like a legal record. */
    at: new Date().toISOString(),
  };

  try {
    const store = readAckStore();
    const mine = [...(store[accountKey] ?? []), ack];
    store[accountKey] = mine.length > MAX_ACK_HISTORY ? mine.slice(mine.length - MAX_ACK_HISTORY) : mine;
    localStorage.setItem(HOUSE_RULES_ACK_KEY, JSON.stringify(store));
  } catch {
    /* Nothing to report and nothing to retry into. The rules were shown; the
       note that they were shown did not survive the device. */
  }
  listeners.forEach((notify) => notify());
  return ack;
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * FOUR STATES, and `unknown` is the one that keeps the gate honest.
 *
 *   unknown       who this is has not been resolved yet. `auth/session.ts`
 *                 restores asynchronously, and treating that moment as
 *                 "not accepted" flashes the rules at somebody who read them
 *                 last week — the same bug that file's three-state note exists
 *                 to prevent, one screen further along.
 *   accepted      this device holds an acknowledgement for THIS version.
 *   outdated      it holds one for an earlier version and the rules have
 *                 changed materially since. Show
 *                 `HOUSE_RULES_NEW_VERSION_NOTICE` and ask again.
 *   not-accepted  nothing on this device for this account. A new phone looks
 *                 exactly like a new athlete, and it must, because that is all
 *                 this build can actually tell.
 */
export type HouseRulesAckStatus = "unknown" | "accepted" | "outdated" | "not-accepted";

export interface HouseRulesAckState {
  status: HouseRulesAckStatus;
  /** When this device recorded the CURRENT version, or null. */
  at: string | null;
  /** The newest version acknowledged before this one — `outdated` only. */
  previousVersion: number | null;
  /** Record it. A no-op when the account is not known yet. */
  acknowledge: () => void;
}

/**
 * The acknowledgement for one account, kept in step across every open screen.
 *
 * Pass `houseRulesAccountKey(session?.user.id)` — `null` while the session is
 * still resolving, which this hook reports as `unknown` rather than guessing.
 *
 * ── FOR WHOEVER RENDERS THIS ─────────────────────────────────────────────────
 *
 * It goes INLINE, above the composer, in the flow. Not a modal, not a sheet, not
 * an interstitial; `00-CONSTITUTION.md:63` and `:129`, and a rules gate is the
 * exact shape somebody reaches for a modal to build.
 *
 * And if it is drawn inside a `<Stagger>`, it must be a DIRECT child of it.
 * Framer-motion variants reach direct children only, so a card wrapped in a
 * plain `<div>` sits at opacity 0 — invisible, with no error and no warning.
 * This codebase has been bitten by it before.
 */
export function useHouseRulesAcknowledgement(accountKey: string | null): HouseRulesAckState {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const notify = () => setTick((n) => n + 1);
    listeners.add(notify);
    /* Another screen may have written between this component's first render and
       this effect. Re-read rather than trust the initial pass. */
    notify();
    return () => {
      listeners.delete(notify);
    };
  }, []);

  const acknowledge = useCallback(() => {
    acknowledgeHouseRules(accountKey);
  }, [accountKey]);

  return useMemo<HouseRulesAckState>(() => {
    /* `tick` is read for no other reason than to be a dependency: the store is
       `localStorage`, not React state, so nothing here re-runs on a write
       unless the subscription above bumps a counter this memo depends on.
       Deleting this line silently strands every open screen on whatever it read
       first — the composer would go on asking after the rules screen recorded
       the acknowledgement. */
    void tick;
    if (!accountKey) {
      return { status: "unknown", at: null, previousVersion: null, acknowledge };
    }
    const history = houseRulesAcknowledgements(accountKey);
    const current = history.find((ack) => ack.version === HOUSE_RULES_VERSION);
    if (current) {
      return { status: "accepted", at: current.at, previousVersion: null, acknowledge };
    }
    const older = history.filter((ack) => ack.version < HOUSE_RULES_VERSION);
    if (older.length > 0) {
      const newest = older.reduce((a, b) => (b.version > a.version ? b : a));
      return {
        status: "outdated",
        at: null,
        previousVersion: newest.version,
        acknowledge,
      };
    }
    return { status: "not-accepted", at: null, previousVersion: null, acknowledge };
  }, [accountKey, tick, acknowledge]);
}

/* -------------------------------------------------------------------------- */
/* Integrity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A DEV-ONLY REFUSAL TO START on a rule set that cannot be cited safely.
 *
 * It cannot know what the numbers OUGHT to be — only the owner knows that — but
 * it can catch the three edits that would silently break every notice ever sent:
 * a duplicated id, a duplicated number, and a number that has been reused by a
 * retired rule. Each of those makes `houseRule()` or `houseRuleByNumber()`
 * resolve to the wrong text, which is worse than resolving to nothing.
 *
 * It THROWS rather than logging, and only in development. A console warning
 * about a mis-cited house rule is a console warning nobody reads; a white screen
 * on the developer's own machine is found in about four seconds and never
 * reaches an athlete. Production is untouched — a shipped bundle with this
 * problem should still show the rules, because showing them slightly wrong beats
 * showing none at all.
 */
if (import.meta.env.DEV) {
  const all = [...HOUSE_RULES, ...RETIRED_HOUSE_RULES];
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const rule of all) {
    if (ids.has(rule.id)) {
      throw new Error(
        `houseRules.ts: rule id "${rule.id}" is used twice. Ids are permanent and are never reused — see HouseRuleId.`,
      );
    }
    if (numbers.has(rule.number)) {
      throw new Error(
        `houseRules.ts: rule number ${rule.number} is used twice. Numbers are permanent, gaps are correct, and a new rule takes the next unused number.`,
      );
    }
    ids.add(rule.id);
    numbers.add(rule.number);
  }
}
