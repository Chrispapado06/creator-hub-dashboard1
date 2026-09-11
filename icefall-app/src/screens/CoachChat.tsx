import { ArrowUp, ChevronLeft, Lock, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Disclaimer } from "@/components/ui/primitives";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { ShiningText } from "@/components/ui/ShiningText";
import { WordReveal } from "@/components/ui/WordReveal";
import { cn } from "@/lib/utils";
import { SUGGESTED_PROMPTS, askCoach } from "@/services/coach";
import { useCoachContext } from "@/coach/context";
import { checkSafety } from "@/coach/safety";
import { useCoachTranscript } from "@/coach/conversations";
import { rememberFrom } from "@/coach/notes";
import { creditsLeft, isExhausted, remainingMicros } from "@/coach/budget";
import { useApp } from "@/state/AppState";
import { UpgradePrompt } from "@/components/growth/UpgradePrompt";
import { useUpgradeCopy } from "@/growth/upgradeCopy";
import type { CoachMessage } from "@/types";
import { DEMO } from "@/offline/offline";
import { ACCENT, CoachHead, Eyebrow, TINT } from "@/screens/coach/shell";
import { PlanChangeRows } from "@/components/coach/PlanChangeRows";
import { RouteCards } from "@/components/coach/RouteCards";
import {
  clearSuggestedRoutes,
  recordSuggestedRoutes,
  useSuggestedRoutes,
  type SuggestedRoutes,
} from "@/coach/suggestedRoutes";
import { ProfessionalCards } from "@/components/coach/ProfessionalCards";
import {
  clearProfessionals,
  recordProfessionals,
  useSuggestedProfessionals,
  type SuggestedProfessionals,
} from "@/coach/suggestedProfessionals";
import { hasProfessionalCards } from "@/coach/professionals";
import { useCoachActions } from "@/coach/planActions";
import {
  clearChanges,
  recordChange,
  updateChange,
  useCoachChanges,
  type CoachChange,
} from "@/coach/pendingChanges";
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

  /*
   * THE TOOL PATH — Phase 2.
   *
   * `useCoachActions` binds the athlete's real objective, their real plan, the
   * adjustments already on it and today's readiness and recovery; `preview`
   * computes what a change the coach asked for would do, and `commit` does it.
   * Nothing on this screen decides any of that — it renders the result and owns
   * two taps.
   *
   * SAFETY IS STILL AHEAD OF ALL OF IT. `send` below calls `checkSafety` and
   * returns before `askCoach` is reached, so a message reporting a symptom
   * never produces a request, never reaches the model and therefore never
   * produces a tool call. That ordering is the first thing in `send` and must
   * stay the first thing in `send`.
   */
  const changes = useCoachChanges();
  const { preview, commit, undo: undoChange } = useCoachActions();
  /*
   * ROUTE CARDS — Phase 2, step 3, and it is the same shape as `changes` above
   * for the same reason: a thing attached to one bubble, kept beside the
   * transcript rather than inside it. In memory only; see `@/coach/suggestedRoutes`.
   */
  const suggestedRoutes = useSuggestedRoutes();
  /* The guides and companies each answer showed. Same store shape and same
     in-memory-only rule as the routes above; see `@/coach/suggestedProfessionals`. */
  const suggestedProfessionals = useSuggestedProfessionals();

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
  /*
   * THE TRANSCRIPT IS NO LONGER COMPONENT STATE — Phase 1, step 4.
   *
   * It used to be `useState<CoachMessage[]>([])`, which React threw away the
   * moment this route unmounted: tapping PLAN and coming back erased the
   * conversation, and there was no way to read yesterday's answer. On a free
   * tier that sells three conversations a month, the counter still went down.
   *
   * `useCoachTranscript` is the same array from the same screen's point of
   * view — `messages` in, `append` instead of `setMessages` — backed by
   * `icefall.coach.conversations.v1`. There is one copy, not a state array and
   * a store that can drift, and deleting the thread on /coach/memory empties
   * this screen immediately rather than at the next reload.
   *
   * ON THE DEVICE, NOT THE SERVER, and deliberately: there is no column for a
   * coach transcript, the migration that would add one is an unapplied draft,
   * and a sync to a table that does not exist fails silently while looking
   * exactly like success. See `@/coach/conversations`.
   */
  const { messages, append, startNew, hasHistory } = useCoachTranscript();
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
    if (typeof inbound !== "string" || !inbound.trim() || firedRef.current) return;
    // The allowance holds an ordinary question back (see above) — but never a
    // symptom report. `send` answers that one from plain code, unbilled.
    if (atLimit && !checkSafety(inbound)) return;
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
    if (!q || thinking) return;

    /*
     * SAFETY RUNS FIRST — BEFORE THE COUNTER, BEFORE THE LIMIT, BEFORE THE WAIT.
     *
     * Roadmap rule 3: safety never depends on the model. `checkSafety` is plain
     * code with no network imports, so it answers offline, signed out and on a
     * demo build. `askCoach` calls it too, but three things below it could not
     * be reached from in there and all three are wrong for an emergency:
     *
     *   - `recordCoachInteraction()` would spend one of three free monthly
     *     conversations on being told to descend;
     *   - `atLimit` would drop the question in silence once they were spent;
     *   - the 5-9s "Thinking…" floor would hold the answer back from somebody
     *     with a headache at 4,200 m while a line swept on screen.
     *
     * So the reply is appended here and the function returns. It is not given
     * to `revealId`, so it renders whole rather than being typed out — the
     * reveal is a flourish, and this is not the message to make anyone watch.
     */
    const safety = checkSafety(q);
    if (safety) {
      const at = new Date().toISOString();
      const stamp = Date.now();
      /* BOTH IN ONE CALL. Two `append`s in the same tick would each read the
         stored thread and the second would overwrite the first, losing the
         question the emergency card is answering. */
      append(
        { id: `a-${stamp}`, role: "athlete", body: q, at },
        {
          id: `safety-${stamp}`,
          role: "coach",
          body: safety.body,
          disclaimer: safety.disclaimer,
          at,
        },
      );
      setDraft("");
      return;
    }

    if (atLimit) return;

    // Count the question. Only decrements on a metered (Free) tier — the athlete
    // gets all of their allowance, and the LAST one still gets an answer.
    recordCoachInteraction();

    append({ id: `a-${Date.now()}`, role: "athlete", body: q, at: new Date().toISOString() });
    setDraft("");

    /*
     * WHAT THE COACH KEEPS FROM THIS MESSAGE — plain code, before the model is
     * called and whether or not it answers.
     *
     * NO MODEL WRITES A NOTE (rule 1). `rememberFrom` is a closed list of five
     * regex rules in `@/coach/notes`; what it stores is the athlete's own
     * sentence, verbatim, and only when the sentence is first-person, is not a
     * question, and says something meant to hold. It refuses outright on
     * anything the symptom layer fires on, so an acute report never becomes a
     * permanent fact about somebody.
     *
     * Called HERE rather than after the reply so a note survives a failed
     * request: what the athlete said is worth keeping regardless of whether
     * the coach managed to answer it.
     *
     * It is fire-and-forget on purpose. Nothing on this screen announces "I
     * will remember that" — the honest place to see what was kept is
     * /coach/memory, linked at the top, where it can also be deleted.
     */
    rememberFrom(q);
    setThinking(true);
    const askedAt = Date.now();

    const { message, spentMicros, action, routes, professionals } = await askCoach(
      q,
      ctx,
      messages,
      remainingMicros(coachBudget),
    );
    // Bank what it actually cost, from the usage the proxy reported.
    if (spentMicros > 0) recordCoachSpend(spentMicros);

    /*
     * THE COACH ASKED FOR A CHANGE — SO THE APP MAKES IT, OR REFUSES IT.
     *
     * RULE 1 IS THIS SIX LINES. `preview` runs the generator twice, applies the
     * guard and answers small-or-big; `commit` writes it. The model's part
     * ended when it named a tool and a day. The message body below is written
     * HERE, from `proposal.summary` — which came out of the engine — and never
     * from the model's prose, which the proxy dropped for exactly this reason.
     *
     * SMALL CHANGES ARE COMMITTED BEFORE THE MESSAGE IS APPENDED. If the
     * message went up first the athlete would read "Cut Sat 20 Sep to 90 min"
     * and then the plan would change under it a frame later; committing first
     * means the sentence is true when it appears.
     */
    let change: CoachChange | null = null;
    if (action) {
      const proposal = preview(action);
      if (proposal.outcome === "applied") {
        const result = commit(proposal);
        change = {
          messageId: message.id,
          proposal,
          status: result.ok ? "applied" : "failed",
          recordIds: result.recordIds,
          problem: result.problem,
        };
      } else {
        change = {
          messageId: message.id,
          proposal,
          status: proposal.outcome === "refused" ? "refused" : "pending",
          recordIds: [],
          problem: "",
        };
      }
      recordChange(change);
    }

    /*
     * THE COACH SUGGESTED ROUTES — SO THE APP DRAWS THEM, OR SAYS IT COULD NOT.
     *
     * `routes.cards` has ALREADY been resolved against the shortlist the app
     * retrieved for this question (`resolveRouteCards`), so by the time it
     * arrives here every id that did not exist has become nothing. This screen
     * decides none of that; it stores which bubble the pictures belong under.
     *
     * An empty `cards` is a real outcome rather than a null case — the coach
     * named routes ICEFALL could not match — and it is why nothing is recorded
     * in that branch: a component asked to draw no cards would draw a heading
     * over a gap. The sentence in `routes.summary` carries the whole answer.
     */
    if (routes && routes.cards.length > 0) {
      recordSuggestedRoutes({
        messageId: message.id,
        cards: routes.cards,
        basis: routes.basis,
        nearLabel: routes.nearLabel,
      });
    }

    /*
     * WHO THEY COULD HIRE — Phase 2, step 3.
     *
     * NOT A TOOL RESULT. `professionals` is present whenever the app itself
     * classified the question as asking who to hire; the model chose nothing
     * here, so there is no id to resolve and nothing to refuse. The screen
     * stores which bubble the cards belong under and decides none of it.
     *
     * RECORDED EVEN WHEN THERE IS NOTHING TO DRAW, and that is the opposite
     * decision to the routes above, deliberately. An empty route list means
     * the coach named trails ICEFALL could not match, and a heading over a gap
     * would be worse than the sentence. An empty GUIDE list means nobody has
     * listed with ICEFALL — which is the production state, and the honest
     * empty state the roadmap asks for is a thing to render rather than a
     * thing to omit. `ProfessionalCards` returns null itself when there is
     * genuinely nothing to say.
     */
    if (
      professionals &&
      (hasProfessionalCards(professionals) ||
        /* The empty state is worth drawing — it is the production state — but
           only once there is an objective to have searched against. With no
           objective the reply already says to set one, and a card headed "no
           guides listed" under it answers a question nobody asked. */
        (professionals.guideCatalogueEmpty && professionals.objectiveName !== null))
    ) {
      recordProfessionals({ messageId: message.id, shortlist: professionals });
    }

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
    /*
     * WHAT GOES IN THE TRANSCRIPT ON A TOOL TURN.
     *
     * `message.body` arrives empty — the proxy drops the model's prose when a
     * tool was called, because it was composed before the change was attempted
     * and may describe an outcome the guard was about to refuse. So the body is
     * written here, in the app's voice, from what actually happened:
     *
     *   applied  -> "Cut Sat 20 Sep to 90 min." — past tense, and true.
     *   confirm  -> "…Nothing changed yet." — the offer is below, not in here.
     *   refused  -> the guard's own sentence, which names the real figures.
     *
     * IT MATTERS THAT THIS IS THE STORED TEXT, not only the displayed text.
     * The transcript is what goes back to the model as history on the next
     * turn, so the model's record of what it did is the app's record of what
     * the app did — and a coach that was refused cannot come back a message
     * later believing it succeeded.
     */
    /*
     * ON A ROUTE TURN THE BODY IS THE APP'S SENTENCE TOO, and for the first of
     * the two reasons above: the proxy drops the model's prose whenever a tool
     * was called, so without this the bubble is empty.
     *
     * `routes.summary` names the routes and states no figure — no length, no
     * ascent, no grade — which is what lets it be the thing that PERSISTS. The
     * cards live in memory for this session; the sentence goes into the
     * transcript, and after a reload it is still exactly as true as it was,
     * with the routes still findable by name in Explore.
     *
     * `change` and `routes` cannot both be set: the proxy returns one tool call
     * per turn and the two parsers refuse each other's names. The ordering
     * below is therefore a formality rather than a precedence, but it is
     * written as one so that a future second tool call cannot silently drop a
     * plan change in favour of a picture.
     */
    const shown: CoachMessage = change
      ? {
          ...message,
          body:
            change.status === "applied"
              ? `${change.proposal.summary}.`
              : change.status === "failed"
                ? `Nothing changed. ${change.problem}`
                : change.proposal.outcome === "refused"
                  ? change.proposal.note
                  : `${change.proposal.summary} — nothing changed yet. ${change.proposal.note}`,
        }
      : routes
        ? { ...message, body: routes.summary }
        : message;

    setRevealId(shown.id);
    append(shown);
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
        {/*
          * NO BACK BUTTON IS ADDED HERE. `CoachHead` already renders one —
          * screens/coach/shell.tsx:167, a Link that reads "‹ Coach". I added a
          * second one when `/coach/chat` left the tab bar, having grepped only
          * this file and missed the shared shell, and the screen rendered two
          * identical controls stacked. The shell's one is the survivor.
          */}
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

        {/*
          THE MEMORY IS REACHABLE FROM WHERE IT IS USED.

          A coach that remembers things about somebody has to put the door to
          those things in front of them, not three taps into Settings. This row
          is the door: what it kept, what it is carrying into the next answer,
          and a delete on every line of it.

          NO BOXES — two text controls and spacing, under the two pills that
          already say what this screen is. A bordered card here would wrap the
          same sentence twice.

          "New conversation" only appears once there IS one, because on an
          empty thread it does nothing and a control that does nothing is worse
          than a missing one. The old thread is not deleted by it; it moves to
          the list on /coach/memory.
        */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <Link to="/coach/memory" className="text-[13px] text-azure">
            {hasHistory ? "What I remember" : "What I remember · nothing yet"}
          </Link>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                /* The offers belong to the conversation that made them: a
                   Confirm sitting under a thread the athlete has closed is a
                   change nobody is still discussing. Applied changes are
                   untouched — they are rows in the plan's own history. */
                clearChanges();
                /* The pictures belong to the thread that produced them, the
                   same rule as the offers above. A route suggested inside a
                   conversation the athlete has closed is a recommendation
                   nobody is still making. */
                clearSuggestedRoutes();
                /* Same rule again: a guide offered inside a conversation the
                   athlete has closed is a recommendation nobody is making. */
                clearProfessionals();
                startNew();
              }}
              className="inline-flex items-center gap-1 text-[13px] text-mist transition-colors hover:text-snow"
            >
              <Plus size={14} strokeWidth={2} aria-hidden="true" />
              New conversation
            </button>
          )}
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
            <Bubble
              key={m.id}
              message={m}
              reveal={m.id === revealId}
              change={changes.find((c) => c.messageId === m.id)}
              routes={suggestedRoutes.find((r) => r.messageId === m.id)}
              professionals={suggestedProfessionals.find((r) => r.messageId === m.id)}
              onApply={() => {
                const c = changes.find((x) => x.messageId === m.id);
                if (!c || c.status !== "pending") return;
                /*
                 * RE-PREVIEWED AT THE MOMENT OF THE TAP, NOT APPLIED FROM THE
                 * OFFER.
                 *
                 * Minutes may have passed. The athlete may have ticked a
                 * session off, logged an activity, or checked in — and a
                 * check-in is exactly the thing that turns the guard's answer
                 * from yes to no. Committing the proposal computed earlier
                 * would apply a change against a state that has gone.
                 */
                const fresh = preview(c.proposal.action);
                if (fresh.outcome === "refused") {
                  updateChange(m.id, { status: "refused", problem: fresh.note });
                  return;
                }
                const result = commit(fresh);
                updateChange(m.id, {
                  status: result.ok ? "applied" : "failed",
                  recordIds: result.recordIds,
                  problem: result.problem,
                });
              }}
              onDecline={() => updateChange(m.id, { status: "declined" })}
              onUndo={() => {
                const c = changes.find((x) => x.messageId === m.id);
                if (!c || c.recordIds.length === 0) return;
                /* Undo goes through the same guard as everything else — see
                   `planGuard.ts`. It is refused when it would put a hard
                   session back on a day readiness has already downgraded, and
                   the reason is shown rather than the tap being swallowed. */
                const verdict = undoChange(c.recordIds[0]);
                updateChange(m.id, {
                  status: verdict.allowed ? "undone" : "applied",
                  problem: verdict.allowed ? "" : verdict.reason,
                });
              }}
            />
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

function Bubble({
  message,
  reveal = false,
  change,
  routes,
  professionals,
  onApply,
  onDecline,
  onUndo,
}: {
  message: CoachMessage;
  reveal?: boolean;
  change?: CoachChange;
  routes?: SuggestedRoutes;
  professionals?: SuggestedProfessionals;
  onApply: () => void;
  onDecline: () => void;
  onUndo: () => void;
}) {
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
          {/* Always `WordReveal`, animating only the reply that just arrived:
              it is also what renders the coach's `**bold**` action, so a
              message that took the plain path would print its asterisks. */}
          <WordReveal text={message.body} animate={reveal} stagger={0.066} duration={0.46} />
        </div>
        {/* The change this message is about, if it is about one. Rendered from
            the engine's before and after — never from the reply above it. */}
        {change && (
          <PlanChangeRows change={change} onApply={onApply} onDecline={onDecline} onUndo={onUndo} />
        )}
        {/* The routes this message suggested, drawn by the app from ICEFALL's
            own records for the ids the coach picked — never from the reply
            above them. Absent after a reload, by design; the body still names
            them. See `@/coach/suggestedRoutes`. */}
        {routes && <RouteCards suggestion={routes} />}

        {/* The guides and companies this message was about, drawn by the app
            from ICEFALL's own catalogue and ordered by the marketplace's own
            matcher — never from the reply above them, which is told not to
            repeat the list. Paid slots sit in their own labelled section
            underneath, and take no part in the order. Absent after a reload,
            by design. See `@/coach/suggestedProfessionals`. */}
        {professionals && <ProfessionalCards shortlist={professionals.shortlist} />}

        {message.disclaimer && (
          <Disclaimer className="mt-2.5 text-left">{message.disclaimer}</Disclaimer>
        )}
      </div>
    </motion.div>
  );
}
