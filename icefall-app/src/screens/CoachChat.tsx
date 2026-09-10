import { ArrowUp, Lock } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Disclaimer } from "@/components/ui/primitives";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { ShiningText } from "@/components/ui/ShiningText";
import { WordReveal } from "@/components/ui/WordReveal";
import { cn } from "@/lib/utils";
import { SUGGESTED_PROMPTS, askCoach } from "@/services/coach";
import { useCoachContext } from "@/coach/context";
import { creditsLeft, isExhausted, remainingMicros } from "@/coach/budget";
import { useApp } from "@/state/AppState";
import { UpgradePrompt } from "@/components/growth/UpgradePrompt";
import { useUpgradeCopy } from "@/growth/upgradeCopy";
import type { CoachMessage } from "@/types";
import { DEMO } from "@/offline/offline";
import { ACCENT, CoachHead, Eyebrow, TINT } from "@/screens/coach/shell";
import { TABBAR_STICKY_BOTTOM } from "@/components/layout/chrome";

/**
 * Screen 08 — ICEFALL Coach.
 *
 * Conversational but not chatty. Answers are grounded in the athlete's own
 * activity, and anything touching medical judgement or high-consequence
 * terrain carries an explicit deferral to a professional.
 */
export default function CoachChat() {
  const { coachInteractionsLeft, recordCoachInteraction, coachBudget, recordCoachSpend } = useApp();
  const coachCopy = useUpgradeCopy("coach");
  // `coachInteractionsLeft` is null on an unlimited tier (Pro) — then it is
  // never metered and never at a limit. On Free it is the monthly allowance.
  const metered = coachInteractionsLeft !== null;
  const budgetSpent = isExhausted(coachBudget);
  const atLimit = coachInteractionsLeft !== null && coachInteractionsLeft <= 0;
  // One context for the whole Coach: the onboarding answers plus everything the
  // engine has measured — and, critically, the briefing's ease-off decision, so
  // the chat can no longer prescribe a hard day the dashboard has already
  // downgraded.
  const ctx = useCoachContext();
  const session = ctx.today.session;

  /**
   * PH-14a — THE CHAT OPENS EMPTY, AND THE GREETING IS AN INTRO RATHER THAN A
   * MESSAGE.
   *
   * It used to start with `openingMessage(ctx)` already in the transcript, so
   * the screen opened on a coach bubble reading *"Good to see you, X. Based on
   * your activity, sleep and progress toward Mont Blanc, here is what I would
   * prioritise today."* Two things wrong with that, and the owner named the
   * first: it looks like a message that has already been sent, when nothing has
   * been. The second is worse — **it announces an analysis it then does not
   * deliver.** No priority follows it. It claims to have read your sleep and
   * your progress and produces nothing, which is a promise the screen breaks in
   * its own first sentence.
   *
   * So: no seeded turn. The greeting is an INTRO CARD above the thread — the
   * coach saying what it can help with, what it answers from (what the athlete
   * has logged; sample data in a demo build) and that it says when something
   * is not logged rather than guessing. It is labelled as the coach
   * introducing itself, it is not in the transcript, it is not sent to the
   * model, and it goes when the first real turn arrives. That is the owner's
   * Chat design of 2026-09-04 and it keeps PH-14a's promise: it announces no
   * analysis it does not deliver.
   */
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  /* The id of the reply currently writing itself out, or null. Deliberately one
     id rather than a flag on the message — see where it is set. */
  const [revealId, setRevealId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  /*
   * A QUESTION ASKED FROM SOMEWHERE ELSE — the Coach hub's ask bar, which sends
   * `navigate("/coach/chat", { state: { ask } })`.
   *
   * Until this existed the screen had no inbound path at all: the transcript is
   * local state and `send` is a local closure, so nothing outside could ask it
   * anything. The hub's bar would have had to fake it, which is precisely the
   * "a control that looks like it works and does not" fault.
   *
   * ROUTER STATE RATHER THAN A `?q=` PARAMETER. The question is free text the
   * athlete typed, and this is the one conversation in ICEFALL that is
   * explicitly private — the screen says "Private · separate from Social" a few
   * lines below. A query parameter puts that text in the URL, where it is
   * screenshotted, shared and logged. State stays in memory. The cost is that a
   * hard reload loses the question, which is the right way round: re-asking on
   * refresh would spend an interaction the athlete never asked to spend.
   *
   * THE STATE IS CLEARED BEFORE THE SEND, not after. Without that, a
   * back-then-forward — or any remount while the history entry is still on the
   * stack — re-asks the same question and spends a second interaction.
   * `firedRef` guards the same thing within one mount.
   *
   * IT DOES NOT FIRE WHEN THE ALLOWANCE IS SPENT, and it deliberately does not
   * mark itself fired in that case either. `send` would silently drop the
   * question (`if (!q || thinking || atLimit) return`), leaving the athlete on
   * a screen that swallowed what they typed. The hub already blocks its own bar
   * at the limit, so this is the race between the two — and holding the state
   * means that if the tier changes while this screen is open, the question they
   * asked is still the one that gets sent. What they see meanwhile is the
   * upgrade prompt this screen already puts in place of the composer.
   */
  const location = useLocation();
  const navigate = useNavigate();
  const inbound = (location.state as { ask?: string } | null)?.ask;
  const firedRef = useRef(false);

  useEffect(() => {
    if (typeof inbound !== "string" || !inbound.trim() || firedRef.current || atLimit) return;
    firedRef.current = true;
    navigate("/coach/chat", { replace: true, state: null });
    void send(inbound);
    // `send` is a fresh closure every render and adding it here would re-run
    // this on every keystroke in the composer; `firedRef` is what actually
    // guards the once-only, so the dependency list is the trigger, not the
    // closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbound, atLimit]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || thinking || atLimit) return;

    // Count the question. Only decrements on a metered (Free) tier — the athlete
    // gets all of their allowance, and the LAST one still gets an answer.
    recordCoachInteraction();

    setMessages((m) => [
      ...m,
      { id: `a-${Date.now()}`, role: "athlete", body: q, at: new Date().toISOString() },
    ]);
    setDraft("");
    setThinking(true);
    const askedAt = Date.now();

    const { message, spentMicros } = await askCoach(q, ctx, messages, remainingMicros(coachBudget));
    // Bank what it actually cost, from the usage the proxy reported.
    if (spentMicros > 0) recordCoachSpend(spentMicros);

    /*
     * A 5-10 SECOND FLOOR ON THE "Thinking…" LINE — THE OWNER'S EXPLICIT
     * DECISION, TAKEN TWICE, AND IT IS A DELIBERATE DELAY RATHER THAN A
     * MEASUREMENT. WRITTEN DOWN HERE SO NOBODY "FIXES" IT BACK.
     *
     * The reply is often ready sooner than this. When it is, the answer sits in
     * memory, finished, while the line keeps sweeping — so for that stretch the
     * screen is saying the coach is still working when it is not. That is the
     * one thing this file otherwise never does, and it was raised with the
     * owner in those terms before it was built. They asked for it anyway, so it
     * is theirs, not an oversight, and it is not to be quietly reverted by a
     * later session reading the doctrine and assuming a mistake. If it is ever
     * removed, remove it because the OWNER changed their mind.
     *
     * WHAT IT DOES NOT DO: it never shortens anything. A model that genuinely
     * takes twelve seconds still shows the line for twelve — the floor only
     * ever tops up an answer that arrived early. And nothing about the ANSWER
     * is invented or altered by the wait; it is the same reply, shown later.
     *
     * The range is randomised per question rather than fixed, because a
     * constant seven seconds every single time reads as a mechanical timer,
     * which is exactly what it is, and varying it does not make it more honest
     * — it makes it less obviously a timer. That is the owner's stated intent.
     */
    /*
     * 5.0-9.0s, NOT 5-10, and the shortfall is deliberate. Measured in the
     * running app: the line takes ~600ms to appear after the tap (React render
     * plus this screen's own re-layout) and its `AnimatePresence` exit fades
     * for a further ~300ms after `thinking` goes false. A 5-10s floor therefore
     * READS as 5.6-10.9s, and the top of that range overshoots what was asked
     * for. Ending the timer at 9s puts the observed line back inside 5-10s.
     * If you change this constant, change it by what somebody SEES, not by
     * what the timer says.
     */
    const MIN_VISIBLE_MS = 5_000 + Math.floor(Math.random() * 4_000);
    const shownFor = Date.now() - askedAt;
    if (shownFor < MIN_VISIBLE_MS) {
      await new Promise((r) => setTimeout(r, MIN_VISIBLE_MS - shownFor));
    }

    /*
     * THE REPLY THAT JUST ARRIVED IS THE ONLY ONE THAT WRITES ITSELF OUT.
     *
     * The owner, 2026-09-11: after the thinking line, "you see it writing it"
     * rather than the answer appearing whole. That is a reveal on ARRIVAL, not
     * a property of a coach message — so it is keyed to this one id.
     *
     * Without the id every coach bubble in the thread would re-reveal on the
     * next render: this list re-renders whenever anything on the screen
     * changes, and an animation with no memory of having run replays each time.
     * The athlete would watch the whole conversation rewrite itself every time
     * they typed a character.
     */
    setRevealId(message.id);
    setMessages((m) => [...m, message]);
    setThinking(false);
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* The head scrolls with the thread, as on every Coach page. No layout
          header sits above this screen, so the scroller clears the notch. */}
      <div
        className="no-scrollbar flex-1 overflow-y-auto px-5 pb-4"
        style={{ paddingTop: "calc(var(--screen-safe-top, env(safe-area-inset-top, 0px)) + 24px)" }}
      >
        <CoachHead
          title="Ask Coach"
          subtitle="Get guidance about your objective, plan, or today’s session."
          objective="line"
        />

        {/* Identity and privacy, before a word is typed. This is the one
            conversation in the app that is not a public feed, and it says so
            where the Social tab's look might otherwise be assumed. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong px-3 py-1 text-[12px] text-mist">
            <Lock size={12} strokeWidth={2} aria-hidden="true" />
            Private · separate from Social
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px]"
            style={{ backgroundColor: TINT.blue, color: ACCENT.blue }}
          >
            <IcefallMark className="h-3" />
            ICEFALL AI Coach
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {/* The intro card — the coach introducing itself, NOT a turn. See the
              PH-14a note above: it names what it answers from and promises to
              say when something is not logged, and claims nothing it has read. */}
          {messages.length === 0 && !thinking && (
            <div className="rounded-[20px] bg-graphite p-4 shadow-[0_1px_10px_rgba(20,24,40,0.05)]">
              <Eyebrow>ICEFALL AI Coach · Alpine Performance Engine</Eyebrow>
              <p className="mt-2.5 text-[14px] leading-relaxed text-snow">
                Hi {ctx.athlete.firstName}. I'm here to help with your{" "}
                {ctx.objective ? `${ctx.objective.name} preparation` : "preparation"}. You can ask
                about today's session, your plan, Fuel, recovery, or whether you're ready for a
                specific objective.
              </p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
                I answer from what you've logged{DEMO ? " — sample data, in this demo" : ""}. When
                something isn't logged, I'll say so rather than guess.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <Bubble key={m.id} message={m} reveal={m.id === revealId} />
          ))}

          <AnimatePresence>
            {thinking && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2.5"
              >
                <IcefallMark className="h-3.5 shrink-0 text-azure" />
                {/* The words replace three pulsing dots. Dots said "something is
                    happening"; this says WHAT is happening, which is the part
                    somebody waiting actually wants, and it costs no more room.
                    `text-[12.5px]` rather than the component's default base size
                    so it matches the empty-thread line directly above it — a
                    16px line here would read as a message rather than a status. */}
                <ShiningText text="Thinking…" className="!text-[12.5px]" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div ref={endRef} />
      </div>

      {/* Suggested prompts — hidden once the free allowance is spent, so they
          can't trigger a blocked send. */}
      {!atLimit && (
        <div className="no-scrollbar shrink-0 overflow-x-auto px-5 pb-3">
          <div className="flex gap-2">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                disabled={thinking}
                className="shrink-0 rounded-full border border-hairline-strong px-3.5 py-1.5 text-[12px] text-mist transition-colors hover:border-azure/50 hover:text-snow disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer — or, when the free allowance is spent, the upgrade moment in
          its place. No modal, no interruption: the input simply becomes the ask. */}
      {atLimit ? (
        <div
          className="shrink-0 border-t border-hairline bg-obsidian px-5 py-4"
          /* The tab bar floats over the bottom of this column now, so the
             composer clears it itself — pill, inset and all. */
          style={{ paddingBottom: `calc(${TABBAR_STICKY_BOTTOM} + 1rem)` }}
        >
          <UpgradePrompt
            featureId="coach.unlimited"
            title={coachCopy.title}
            body={coachCopy.body}
          />
        </div>
      ) : (
        <div
          className="shrink-0 border-t border-hairline bg-obsidian px-5 py-3"
          style={{ paddingBottom: `calc(${TABBAR_STICKY_BOTTOM} + 0.75rem)` }}
        >
          <p className="mb-1.5 px-1 text-[11px] text-mist-dim">
            Coach conversations are private · Not shared to Social
          </p>
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            {metered && coachInteractionsLeft !== null ? (
              <p className="text-[11px] text-mist-dim">
                {coachInteractionsLeft} free{" "}
                {coachInteractionsLeft === 1 ? "conversation" : "conversations"} left this month
              </p>
            ) : (
              <span />
            )}
            {/* Credits, never money. What ICEFALL pays per answer is a cost of
                goods; showing it invites the athlete to price their own
                questions, which is the wrong thing to weigh while asking a
                coach whether to rest. */}
            {budgetSpent ? (
              <p className="text-[11px] text-mist-dim">Saved guidance · more tomorrow</p>
            ) : (
              <p className="tnum text-[11px] text-mist-dim">
                {creditsLeft(coachBudget)} coach{" "}
                {creditsLeft(coachBudget) === 1 ? "credit" : "credits"} today
              </p>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-2.5"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask your coach…"
              aria-label="Ask your coach"
              className="h-11 flex-1 rounded-full border border-hairline bg-elevated/40 px-4 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
            />
            <button
              type="submit"
              disabled={!draft.trim() || thinking}
              aria-label="Send"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-azure text-obsidian transition-all hover:bg-azure-bright disabled:opacity-30"
            >
              <ArrowUp size={18} strokeWidth={2} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Bubble({ message, reveal = false }: { message: CoachMessage; reveal?: boolean }) {
  const isCoach = message.role === "coach";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex", isCoach ? "justify-start" : "justify-end")}
    >
      <div className={cn("max-w-[86%]", isCoach ? "" : "text-right")}>
        {isCoach && (
          <div className="mb-2 flex items-center gap-2">
            <IcefallMark className="h-3 text-azure" />
            <span className="section-label text-azure/70">ICEFALL Coach</span>
          </div>
        )}
        {/*
          THE COACH'S ANSWER HAS NO CONTAINER. The owner, 2026-09-11: "remove the
          box anwser background".

          It does not need one. The reply is already announced by the mark and
          the "ICEFALL Coach" label directly above it, and the athlete's own
          words sit filled and right-aligned opposite — so who said what is
          carried by position and by the label, which is what the app's own box
          rule says spacing and type should do. A border around the one thing on
          the screen that is being read is the container the owner has objected
          to four times now.

          THE ATHLETE'S OWN MESSAGES KEEP THEIR FILL, and that is the rule
          rather than an exception to it: a fill means "a named party said
          this", which is exactly what a chat bubble is. Stripping both would
          leave two voices in one column distinguished only by alignment.

          Padding goes with the box on the coach's side: with no fill to sit
          inside, `px-4` only pushed the reply out of line with the label above
          it.
        */}
        <div
          className={cn(
            "whitespace-pre-line text-[13px] leading-relaxed",
            isCoach ? "text-snow/90" : "rounded-card bg-elevated px-4 py-3 text-snow",
          )}
        >
          {/*
            `whitespace-pre-line` above is why `WordReveal` re-emits its
            whitespace verbatim rather than splitting on spaces: the reply's
            paragraph breaks live in that whitespace, and a split that dropped
            it would flatten a three-paragraph answer into one line the moment
            the animation ran.
          */}
          {/* Slower than the component's default, on the owner's eye,
              2026-09-11: "make the reply slithly slower". Tuned here rather
              than in `WordReveal` so the component keeps a sensible default for
              any other caller. */}
          {reveal ? (
            <WordReveal text={message.body} stagger={0.066} duration={0.46} />
          ) : (
            message.body
          )}
        </div>
        {message.disclaimer && (
          <Disclaimer className="mt-2.5 text-left">{message.disclaimer}</Disclaimer>
        )}
      </div>
    </motion.div>
  );
}
