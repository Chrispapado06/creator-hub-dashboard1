import { ArrowUp } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Disclaimer } from "@/components/ui/primitives";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { cn } from "@/lib/utils";
import { SUGGESTED_PROMPTS, askCoach } from "@/services/coach";
import { useCoachContext } from "@/coach/context";
import { creditsLeft, isExhausted, remainingMicros } from "@/coach/budget";
import { useApp } from "@/state/AppState";
import { UpgradePrompt } from "@/components/growth/UpgradePrompt";
import { useUpgradeCopy } from "@/growth/upgradeCopy";
import type { CoachMessage } from "@/types";

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
  // `coachInteractionsLeft` is null on an unlimited tier (Pro/Elite) — then it is
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
   * So: no seeded turn. The greeting became the intro overlay below, which
   * fades and leaves, and the composer opens on a clean thread the way a new
   * chat should.
   */
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [intro, setIntro] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  // The intro is a greeting, not a gate: it never blocks the composer, and a
  // reduced-motion preference skips it rather than slowing the screen down.
  useEffect(() => {
    const reduce =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setIntro(false);
      return;
    }
    const t = setTimeout(() => setIntro(false), 1900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

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

    const { message, spentMicros } = await askCoach(q, ctx, messages, remainingMicros(coachBudget));
    // Bank what it actually cost, from the usage the proxy reported.
    if (spentMicros > 0) recordCoachSpend(spentMicros);
    setMessages((m) => [...m, message]);
    setThinking(false);
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* The greeting, as an intro that leaves. Positioned over the thread
          rather than inside it, so it can never be mistaken for a turn in the
          conversation or scrolled back to. `pointer-events-none` so it cannot
          swallow a tap on the composer while it fades. */}
      <AnimatePresence>
        {intro && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.55 } }}
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-obsidian px-8 text-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <IcefallMark className="mx-auto h-5 text-azure" />
              <p className="mt-5 text-[22px] font-light leading-tight text-snow">
                Hello, {ctx.athlete.firstName}.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-4 pt-5">
        <div className="space-y-4">
          {/* An empty thread says what this is, without pretending a turn has
              happened. It makes no claim about what it has read. */}
          {messages.length === 0 && !thinking && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: intro ? 1.9 : 0, duration: 0.5 }}
              className="pt-2 text-[12.5px] leading-relaxed text-mist-dim"
            >
              Ask about today's session, your objective, or anything you are unsure of.
            </motion.p>
          )}

          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}

          <AnimatePresence>
            {thinking && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2.5"
              >
                <IcefallMark className="h-3.5 text-azure" />
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-1 w-1 rounded-full bg-mist"
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.16 }}
                    />
                  ))}
                </div>
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
          // The TabBar below already pads the bottom inset; counting it here too
          // pushed the composer up by the inset on notched phones.
          style={{ paddingBottom: "1rem" }}
        >
          <UpgradePrompt featureId="coach.unlimited" title={coachCopy.title} body={coachCopy.body} />
        </div>
      ) : (
        <div
          className="shrink-0 border-t border-hairline bg-obsidian px-5 py-3"
          style={{ paddingBottom: "0.75rem" }}
        >
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
                {creditsLeft(coachBudget)} coach {creditsLeft(coachBudget) === 1 ? "credit" : "credits"} today
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

function Bubble({ message }: { message: CoachMessage }) {
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
        <div
          className={cn(
            "whitespace-pre-line rounded-card px-4 py-3 text-[13px] leading-relaxed",
            isCoach ? "border border-hairline bg-graphite text-snow/90" : "bg-elevated text-snow",
          )}
        >
          {message.body}
        </div>
        {message.disclaimer && (
          <Disclaimer className="mt-2.5 text-left">{message.disclaimer}</Disclaimer>
        )}
      </div>
    </motion.div>
  );
}
