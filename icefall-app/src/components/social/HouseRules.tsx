import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, ShieldCheck } from "lucide-react";

import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { useSessionState } from "@/auth/session";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  HOUSE_RULES,
  HOUSE_RULES_ACK_IS_LOCAL,
  HOUSE_RULES_ACK_LABEL,
  HOUSE_RULES_ACK_NOT_HELD_BY_ICEFALL,
  HOUSE_RULES_NEW_VERSION_NOTICE,
  HOUSE_RULES_TITLE,
  houseRule,
  houseRuleByNumber,
  houseRulesAccountKey,
  useHouseRulesAcknowledgement,
  type HouseRule,
  type HouseRuleId,
} from "@/social/houseRules";

/**
 * THE HOUSE RULES, WHERE SOMEBODY IS ABOUT TO POST.
 *
 * `social/houseRules.ts` holds the rules, the version and the acknowledgement.
 * This file holds only the reading of them, and the reading is the whole design
 * decision, so it is argued rather than asserted.
 *
 * ── THE TWO WAYS THIS IS NORMALLY GOT WRONG ──────────────────────────────────
 *
 * SIX RULES IN FULL, ABOVE EVERY POST, FOREVER. It looks like diligence and it
 * is the opposite: a block of text that never changes and never asks anything
 * becomes furniture in about four posts. Everybody scrolls past it, nobody has
 * read it since the first time, and the app has quietly converted its house
 * rules into the thing your eye skips on the way to the text box.
 *
 * A ONE-LINE LINK. "By posting you agree to the house rules." Cheap, tidy, and
 * nobody taps it — which means the app has never actually put the rules in
 * front of anybody, and the first time a climber reads rule 4 is in the notice
 * telling them their post is gone.
 *
 * ── WHAT THIS DOES INSTEAD ───────────────────────────────────────────────────
 *
 * ONCE, IN FULL, WITH A REAL ACKNOWLEDGEMENT. The first time somebody opens a
 * composer they get all six rules, in number order, and a control at the very
 * bottom — BELOW rule 6, never above it, so the rules have to have passed under
 * the thumb before the control is reachable. That is not proof of reading and
 * this file never says it is (`houseRules.ts` is emphatic: a tap is a tap). It
 * is the difference between a control you can operate with the text off screen
 * and one you cannot.
 *
 * AFTERWARDS, THE TWO THAT CATCH PEOPLE OUT. Not a generic reminder — a generic
 * reminder is the furniture problem again in one line. Rules 3 and 4 in full,
 * because they are the two an experienced climber will not guess: every
 * platform on earth has rules 1, 2 and 6 and everybody already knows their
 * shape, and rule 5 governs what a ROUTE is called rather than what you post,
 * so it will almost never be why something is removed. 3 and 4 are the ones
 * ICEFALL wrote for itself — an allowance with a condition attached, and the
 * one prohibition that is specific to this sport — and they are the two where
 * a climber's honest instinct can be wrong in either direction. Somebody
 * self-censoring a frostbite photograph is a loss to the sport; somebody
 * posting a body on the Northeast Ridge is somebody's family finding it.
 *
 * That reminder carries the sentence "All six apply", because naming two must
 * never be read as ranking them, and the other four are one tap away.
 *
 * ── IT EXPANDS. IT DOES NOT OPEN ─────────────────────────────────────────────
 *
 * `00-CONSTITUTION.md:63` and `:129`. A rules gate is exactly the shape
 * somebody reaches for a modal to build, and there is no modal, sheet, overlay
 * or interstitial anywhere in this file — "read all six" grows the card in
 * place, where the composer stays visible underneath it.
 *
 * And there is no dismiss. `growth/UpgradePrompt.tsx:16` forbids "an x that
 * dismisses a thing which then returns tomorrow", so the only control that
 * changes anything durable is the acknowledgement, and the only thing that can
 * bring the full rules back is `HOUSE_RULES_VERSION` moving — the rules
 * actually changing.
 *
 * ── WHAT THIS BLOCK IS NOT ───────────────────────────────────────────────────
 *
 * IT IS NOT A GATE, and it must not be described as one. It sits beside a
 * composer; it does not disable the post button, because a component cannot
 * disable a control it does not own. A call site that wants a hard gate reads
 * `useHouseRulesAcknowledgement` itself and decides — the store is shared, so
 * both agree by construction. Wiring that is a change to `Composer.tsx` and
 * `PublishSummit.tsx`, which this task does not own.
 *
 * ── COLD, GLOVED, 4AM, OFFLINE ───────────────────────────────────────────────
 *
 * No network call, no image, no font, no fetch. The rules are in the bundle and
 * the acknowledgement is `localStorage`. Every control is at least 44px.
 */

/* -------------------------------------------------------------------------- */
/* The address of the rules                                                    */
/* -------------------------------------------------------------------------- */

/**
 * WHERE THE RULES LIVE, AND WHY IT IS TOP-LEVEL.
 *
 * A removal notice has to carry a URL a person can open, and it will be opened
 * in circumstances the app cannot control: months later, from an email, on a
 * borrowed phone, possibly by somebody whose account is the thing under
 * dispute. So the path is short enough to print, and — the part that matters —
 * `App.tsx` declares it OUTSIDE `AppShell`, beside `/pricing`, because
 * `AppShell` requires a live session and would bounce exactly that reader to
 * the splash screen.
 *
 * IT IS STABLE FOREVER, for the same reason the numbers are: a link in a notice
 * sent in March is followed in June. Changing this string breaks every notice
 * ever written. If it ever has to move, the old path stays as a redirect.
 */
export const HOUSE_RULES_PATH = "/house-rules";

/**
 * The canonical link to one clause: `/house-rules#human-remains`.
 *
 * ANCHORED ON THE ID, NOT THE NUMBER, and `houseRules.ts` gives the reason —
 * "a number is the DISPLAY of a rule ... storing it is how a system ends up
 * depending on the display". A URL inside a notice is stored by definition: it
 * sits in somebody's inbox for as long as they care to keep it.
 *
 * `houseRuleForHash` below still resolves `#rule-4` and `#4`, because notices
 * get written by people who have just typed the words "rule 4".
 */
export function houseRuleHref(rule: HouseRule): string {
  return `${HOUSE_RULES_PATH}#${rule.id}`;
}

const NUMBER_HASH = /^(?:rule[-_\s]?)?(\d{1,3})$/i;

/**
 * The rule a `#fragment` points at, in any of the three forms a notice writes.
 *
 * Returns `undefined` rather than guessing. A link to a clause this build has
 * never heard of — a rule from a later version, a typo, a citation somebody
 * invented — must reach the rules screen as an unresolved link that SAYS it is
 * unresolved. Silently showing the list would let a reader assume the rule they
 * were cited under is one of the six in front of them.
 */
export function houseRuleForHash(hash: string): HouseRule | undefined {
  let raw = hash.replace(/^#/, "").trim();
  if (!raw) return undefined;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* A stray `%` in a hand-typed link. The undecoded text is still worth
       trying against the ids before giving up. */
  }
  const byId = houseRule(raw);
  if (byId) return byId;
  const m = NUMBER_HASH.exec(raw);
  return m ? houseRuleByNumber(Number(m[1])) : undefined;
}

/* -------------------------------------------------------------------------- */
/* Who is reading                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The account key for the person in front of the phone, in THREE states.
 *
 * `houseRules.ts` suggests `houseRulesAccountKey(session?.user.id)` and that
 * call is subtly wrong, so it is not the call made here. `useSessionState`
 * returns `Session | null | undefined` and optional chaining FLATTENS TWO OF
 * THEM: `null?.user.id` and `undefined?.user.id` are both `undefined`, so a
 * signed-out device and a session that has not resolved yet arrive at
 * `houseRulesAccountKey` as the same value. It answers `null` — "not known
 * yet" — and a signed-out device would then sit in `unknown` forever: never
 * shown the rules, never able to record that it had been.
 *
 * Widened by hand instead, so the third state survives the call.
 */
function useHouseRulesAccountKey(): string | null {
  const session = useSessionState();
  const uid = session === undefined ? undefined : (session?.user.id ?? null);
  return houseRulesAccountKey(uid);
}

/* -------------------------------------------------------------------------- */
/* One rule                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A single clause, drawn identically in the composer and on the rules screen.
 *
 * ONE RENDERER ON PURPOSE. `houseRules.ts` keeps one copy of the WORDS so a
 * notice cannot quote text the app never showed; this keeps one copy of the
 * PRESENTATION so the clause a climber skimmed above the composer is visibly
 * the same clause as the one the notice links to. A rule that looks like a
 * footnote in one place and a heading in the other is two rules to the reader.
 *
 * The `id` is the anchor — see `houseRuleHref`. `scroll-mt-4` keeps the number
 * clear of the top edge when a link scrolls it into view.
 */
export function HouseRuleArticle({
  rule,
  highlighted = false,
  className,
}: {
  rule: HouseRule;
  /** Drawn when a link named this clause, so the reader can see which one. */
  highlighted?: boolean;
  className?: string;
}) {
  const retired = rule.retiredIn !== undefined;

  return (
    <article
      id={rule.id}
      className={cn(
        "scroll-mt-4 rounded-tile border px-3.5 py-3 transition-colors",
        highlighted
          ? "border-azure/45 bg-azure/[0.06]"
          : retired
            ? "border-hairline bg-elevated/20"
            : "border-hairline bg-elevated/40",
        className,
      )}
    >
      <p className="flex items-baseline gap-2.5">
        <span
          className={cn(
            "tnum text-[12px] font-medium",
            retired ? "text-mist-dim" : "text-azure",
          )}
        >
          {/* AUTHORED, never `index + 1`. See the warning above `HOUSE_RULES`:
              the day a rule is withdrawn this list reads 1, 3, 4, 5, 6 and the
              gap is the point. */}
          {rule.number}
        </span>
        <span className={cn("text-[13px]", retired ? "text-mist" : "text-snow")}>{rule.title}</span>
      </p>
      <p
        className={cn(
          "mt-1.5 text-[12.5px] leading-relaxed",
          retired ? "text-mist-dim" : "text-mist",
        )}
      >
        {/* The owner's words, straight from the module. Never reflowed, never
            truncated, never given a "read more" — a clause a notice quotes has
            to be readable in full wherever it appears. */}
        {rule.text}
      </p>
      {retired && (
        <p className="mt-2 border-l border-hairline-strong pl-2.5 text-[11px] leading-relaxed text-mist-dim">
          No longer in force — withdrawn in version {rule.retiredIn}. It is kept here because a
          removal made while it applied is still open to appeal, and an appeal needs the clause it
          was made under.
        </p>
      )}
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* The reminder set                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The two rules the compact reminder names. A DISPLAY CHOICE AND NOTHING MORE.
 *
 * No rule here binds harder than another and the card says so out loud. These
 * two are shown because they are the two a good-faith climber can get wrong
 * WITHOUT being careless — see the long note at the top of this file — not
 * because the other four are optional.
 *
 * Ids, not numbers, so this survives everything the numbering rules allow. And
 * it is FILTERED out of `HOUSE_RULES` rather than held as its own copy of the
 * text: if one of these is ever retired the reminder quietly shows the other,
 * instead of rendering a clause that no longer applies or crashing on a lookup.
 */
const REMINDED: readonly HouseRuleId[] = ["injuries-and-rescues", "human-remains"];

/* -------------------------------------------------------------------------- */
/* The block                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The rules, beside a composer.
 *
 * Drop it directly above `<Composer />` or `<PublishSummit />`. It reads the
 * session itself, so a call site passes nothing but a class.
 *
 * INSIDE A `<Stagger>` IT MUST BE THE DIRECT CHILD — wrapped in `<Rise>` if the
 * entrance motion is wanted, exactly as `PostDetail` does it. Variants reach
 * direct children only, and a card one wrapper deep sits at opacity 0 with no
 * error and no warning.
 */
export function HouseRulesBlock({ className }: { className?: string }) {
  const accountKey = useHouseRulesAccountKey();
  const { status, at, previousVersion, acknowledge } = useHouseRulesAcknowledgement(accountKey);

  const full = status === "not-accepted" || status === "outdated";

  return full ? (
    <FirstReading
      className={className}
      outdated={status === "outdated"}
      previousVersion={previousVersion}
      onAcknowledge={acknowledge}
    />
  ) : (
    /* `accepted` and `unknown` share this card, and the difference is one
       sentence: `at` is null while the session is still resolving, and the card
       then claims nothing about whether anybody has read anything. The two
       rules below are true either way, so there is no flash and no wrong
       claim — which is the whole reason `unknown` exists as a state. */
    <Reminder className={className} acknowledgedAt={at} />
  );
}

/* -------------------------------------------------------------------------- */

/**
 * All six, and the acknowledgement.
 *
 * ORDER IS THE ARGUMENT HERE. Heading, then the rules, then what the record
 * actually is, then the control. The control is last because a control above
 * the text it refers to can be operated without the text ever having been on
 * screen, and this one is at the bottom of six rules.
 */
function FirstReading({
  className,
  outdated,
  previousVersion,
  onAcknowledge,
}: {
  className?: string;
  outdated: boolean;
  previousVersion: number | null;
  onAcknowledge: () => void;
}) {
  return (
    <Card className={cn("space-y-3.5", className)}>
      <SectionLabel
        action={
          /* The page link sits UP HERE, a full card away from the accept
             control at the bottom. Cold and gloved, two targets that do
             different things must not be a thumb's width apart — the lesson
             `PostDetail` writes down for its empty states. */
          <Link
            to={HOUSE_RULES_PATH}
            className="text-[11.5px] text-azure underline-offset-2 hover:underline"
          >
            Rules page
          </Link>
        }
      >
        {HOUSE_RULES_TITLE}
      </SectionLabel>

      {outdated ? (
        <p className="rounded-tile border border-azure/30 bg-azure/[0.05] px-3.5 py-3 text-[12px] leading-relaxed text-snow">
          {HOUSE_RULES_NEW_VERSION_NOTICE}
          {previousVersion !== null && (
            <span className="mt-1.5 block text-[11px] text-mist">
              This phone last recorded version {previousVersion}.
            </span>
          )}
        </p>
      ) : (
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-snow">
          <ShieldCheck size={14} strokeWidth={1.7} className="mt-0.5 shrink-0 text-azure" />
          <span>
            Six rules, once, before your first post. If something you post is ever removed, the
            notice names the rule by number and quotes these words.
          </span>
        </p>
      )}

      <div className="space-y-2">
        {HOUSE_RULES.map((rule) => (
          <HouseRuleArticle key={rule.id} rule={rule} />
        ))}
      </div>

      {/* The honest sentence, rendered WITH the control it describes and never
          away from it. `houseRules.ts` exports it so no surface can soften the
          wording while the module quietly knows better. */}
      <Disclaimer>{HOUSE_RULES_ACK_IS_LOCAL}</Disclaimer>

      <Button size="lg" className="w-full" onClick={onAcknowledge}>
        {HOUSE_RULES_ACK_LABEL}
      </Button>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Every time after the first: rules 3 and 4, and a way to read all six in place.
 *
 * COLLAPSED, THERE IS EXACTLY ONE CONTROL. Expanded there are two — the toggle
 * and the page link — and they are separated by the whole of the rule list,
 * which is the only reason both are allowed on one card.
 */
function Reminder({
  className,
  acknowledgedAt,
}: {
  className?: string;
  /** ISO instant this device recorded, or null while the session resolves. */
  acknowledgedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();

  const reminded = useMemo(() => HOUSE_RULES.filter((r) => REMINDED.includes(r.id)), []);
  const shown = open ? HOUSE_RULES : reminded;

  return (
    <Card className={cn("space-y-3", className)}>
      <SectionLabel>{HOUSE_RULES_TITLE}</SectionLabel>

      {!open && (
        <p className="text-[11.5px] leading-relaxed text-mist-dim">
          All six apply. These two are the ones ICEFALL wrote for itself, and the ones a careful
          climber is most likely not to expect.
        </p>
      )}

      {/* Expanded, this is the complete numbered list in order — the two are a
          filtered VIEW of the same array, never a second copy, so nothing is
          rendered twice and nothing is out of sequence. */}
      <div id={panel} className="space-y-2">
        {shown.map((rule) => (
          <HouseRuleArticle key={rule.id} rule={rule} />
        ))}
      </div>

      {open && (
        <div className="space-y-2.5">
          {acknowledgedAt && (
            <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-mist">
              <Check size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-azure" />
              <span>
                Recorded on this phone on {fmtDate(acknowledgedAt)}.{" "}
                {/* The instant is the device's own clock and nothing verifies
                    it, so the date is offered as a note to the reader and never
                    as a fact ICEFALL is asserting about them. */}
                <span className="text-mist-dim">{HOUSE_RULES_ACK_NOT_HELD_BY_ICEFALL}</span>
              </span>
            </p>
          )}
          <p className="text-[11.5px] text-mist-dim">
            Every rule has its own link on the{" "}
            <Link
              to={HOUSE_RULES_PATH}
              className="text-azure underline-offset-2 hover:underline"
            >
              rules page
            </Link>
            , which is the page a removal notice points at.
          </p>
        </div>
      )}

      {/* Full width, 46px tall, and it EXPANDS THIS CARD. Nothing opens. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panel}
        className="flex w-full items-center justify-between rounded-tile border border-hairline bg-elevated/40 px-4 py-3.5 text-left transition-colors hover:border-hairline-strong"
      >
        <span className="text-[13px] text-snow">
          {open ? "Show fewer" : `Read all ${HOUSE_RULES.length}`}
        </span>
        <ChevronRight
          size={16}
          strokeWidth={1.8}
          className={cn("shrink-0 text-mist transition-transform", open && "rotate-90")}
        />
      </button>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* For surfaces that carry photographs but must not ask again                  */
/* -------------------------------------------------------------------------- */

/**
 * A pointer to the rules, with no acknowledgement attached.
 *
 * FOR THE GROUP WORKSPACE. `houseRules.ts` ruled that an expedition group
 * carries real photographs to real people — a photograph of a dead climber is
 * that photograph whether it lands on a feed or in a group of eleven — so rules
 * 1 to 4 apply there in substance. What it also ruled is that a SECOND
 * acknowledgement would be theatre: the same person already accepted the same
 * six rules at the composer, and asking twice teaches them the control means
 * nothing.
 *
 * So this states that the rules apply and links to them. One control, one
 * sentence, no gate.
 */
export function HouseRulesLink({ className }: { className?: string }) {
  return (
    <Link
      to={HOUSE_RULES_PATH}
      className={cn(
        "flex items-center gap-3 rounded-tile border border-hairline bg-elevated/40 px-4 py-3.5 transition-colors hover:border-hairline-strong",
        className,
      )}
    >
      <ShieldCheck size={15} strokeWidth={1.7} className="shrink-0 text-azure" />
      <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-mist">
        The house rules apply here too. A smaller audience is not a private one.
      </span>
      <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Integrity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A DEV-ONLY check that the reminder still names real rules.
 *
 * It does not throw. `REMINDED` degrading to one rule, or to none, is a display
 * change and the card still works — unlike a duplicated rule number, which is
 * a citation that resolves to the wrong text and is worth a white screen. This
 * is a warning because the failure it catches is somebody retiring a rule and
 * not noticing that the reminder above every composer got quieter.
 */
if (import.meta.env.DEV) {
  for (const id of REMINDED) {
    if (!HOUSE_RULES.some((rule) => rule.id === id)) {
      console.warn(
        `HouseRules.tsx: the reminder names "${id}", which is no longer a current rule. ` +
          `The compact card will show fewer rules until REMINDED is updated.`,
      );
    }
  }
}
