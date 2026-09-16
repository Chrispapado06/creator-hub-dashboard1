import {
  ArrowUp,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Lock,
  MessageCircle,
  MoreVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Disclaimer } from "@/components/ui/primitives";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { ShiningText } from "@/components/ui/ShiningText";
import { WordReveal } from "@/components/ui/WordReveal";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/format";
import { askCoach } from "@/services/coach";
import { useCoachContext } from "@/coach/context";
import { checkSafety } from "@/coach/safety";
import { useCoachTranscript } from "@/coach/conversations";
import { rememberFrom, useCoachNotes } from "@/coach/notes";
import {
  DAILY_CREDITS,
  creditsLeft,
  isExhausted,
  remainingMicros,
  resetLabel,
} from "@/coach/budget";
import { useApp } from "@/state/AppState";
import type { CoachMessage } from "@/types";
import { DEMO } from "@/offline/offline";
import { useObjective } from "@/screens/coach/shell";
import { useCoachPlanSummary } from "@/coach/planSummary";
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
 *
 * REBUILT TO coach-1to1-spec.md PART B2, 2026-09-16. Layout, trust row, the
 * memory sheet and the single credit meter below follow that transcription;
 * everything about safety ordering, the tool path, route/guide cards and the
 * reveal timing is untouched — see the doctrine comments still attached to
 * each, further down this file.
 */
export default function CoachChat() {
  const { coachBudget, recordCoachSpend } = useApp();
  /*
   * THE SINGLE CREDIT MODEL — brief §Chat "Remove the old limit… Keep one
   * credit model", and §4 rule 4 "One chat limit."
   *
   * This screen used to gate sending on TWO independent counters: a monthly
   * `coachInteractionsLeft` (Free-tier paywall, rendered as "3 free
   * conversations left this month") and this daily credit budget. The brief
   * is explicit, twice, that Chat must show and enforce exactly one — B2:
   * "There is no second/old counter anywhere on this screen… including
   * scrolled states." So `coachInteractionsLeft`/`recordCoachInteraction`
   * and the `UpgradePrompt` paywall card are gone from this screen entirely,
   * not hidden: grep confirms neither name appears below. `coachBudget` (8
   * credits/day, `@/coach/budget`) is now the one thing that gates sending
   * and the one thing the meter shows.
   *
   * The Hub still reads `coachInteractionsLeft` for its own display — that
   * counter is real, it is AppState's Free-tier subscription gate, and nothing
   * here touches `AppState.tsx` or the Hub's use of it. This is a Chat-screen
   * decision, scoped to the one screen the brief's §Chat section governs.
   */
  const creditsRemaining = creditsLeft(coachBudget);
  const atCreditLimit = isExhausted(coachBudget);
  const meterLow = creditsRemaining <= 2;
  const meterPct = Math.max(0, Math.min(100, (creditsRemaining / DAILY_CREDITS) * 100));

  // One context for the whole Coach: the onboarding answers plus everything the
  // engine has measured — and, critically, the briefing's ease-off decision, so
  // the chat can no longer prescribe a hard day the dashboard has already
  // downgraded.
  const ctx = useCoachContext();
  const session = ctx.today.session;

  /* The context line — "Mont Blanc · Week 12 · Base", B2 — and the source
     count a coach reply can honestly cite. Both come from the same two
     shared selectors every Coach screen reads, per the brief's §4.2 "one
     source of truth": `useObjective()` for the goal's name, and
     `useCoachPlanSummary()` for the current week/phase and how many
     sessions are actually logged. Neither is re-derived here. */
  const { goal } = useObjective();
  const planSummary = useCoachPlanSummary();
  const contextLine = goal
    ? [
        goal.name,
        planSummary ? `Week ${planSummary.currentWeek.index}` : null,
        planSummary?.currentPhaseLabel,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · ")
    : null;
  /* A real, non-zero count of sessions actually marked done across the plan
     to date — never a per-answer figure the app cannot compute, and never
     shown at all when it would be zero. See `sourceFootnote` below, where a
     bubble opts into showing it. */
  const loggedSessionsCount = planSummary?.sessions.completedToDate ?? 0;

  /* B2's three composer chips, transcribed literally — except the middle one
     names a mountain, and "Mont Blanc" is that mockup's own placeholder
     objective (see the spec's §4.2: do not copy the mockup's example data).
     Hardcoding it here would suggest an objective this athlete may not
     actually hold — exactly what the brief's "never invent...an objective
     ICEFALL doesn't actually hold" rule is for — and would silently disagree
     with the Hub's identical-purpose chip two taps away, which already
     interpolates `goal.name` (`CoachHub.tsx`). Same source, same fallback. */
  const chatPromptChips = [
    "Why a deload?",
    goal ? `Am I ready for ${goal.name}?` : "Am I prepared?",
    "How should I fuel tomorrow?",
  ];

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
  /* What the coach is carrying between conversations — the trust row's
     "What I remember (N)" pill, B2, opens a sheet built on this. */
  const { notes, remove: forgetNote } = useCoachNotes();

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
   *
   * B2, 2026-09-16, GIVES THIS CARD'S EXACT WORDS — "Hi Christofis! I'm your
   * ICEFALL coach. I'll answer from what you've logged and use your plan to
   * give tailored guidance. If something isn't logged, I'll say so rather
   * than guessing." — and draws it as the thread's first bubble rather than a
   * separate tinted card. Both are honoured below: the copy is the mockup's,
   * verbatim but for the athlete's real first name in place of "Christofis"
   * (the athlete this was drawn for IS named Christofis, but the app must
   * never hardcode one person's name); the doctrine above is honoured by
   * leaving it OUT of `messages` and out of what is sent to the model — this
   * still is not a turn, it is drawn to look like one because that is what
   * the mockup shows.
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
  const { messages, append, startNew } = useCoachTranscript();
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  /* The id of the reply currently writing itself out, or null. Deliberately one
     id rather than a flag on the message — see where it is set. */
  const [revealId, setRevealId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  /* The "⋮" overflow menu (B2's top bar) and the "What I remember" sheet
     (B2's trust row). Two independent booleans rather than one enum: they
     open from different controls and nothing stops one being open while the
     other closes. */
  const [menuOpen, setMenuOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /* Outside-click and Escape close the overflow menu — the same pattern
     `PostCard`'s own "⋮" menu already uses, so this doesn't invent a second
     way an overflow menu behaves in this app. */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
   * explicitly private — the screen says "Private · not shared to Social" a few
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
   * question (`if (!q || thinking || atCreditLimit) return`), leaving the
   * athlete on a screen that swallowed what they typed. What they see meanwhile
   * is the disabled composer and its reset time — see the render below.
   */
  const location = useLocation();
  const navigate = useNavigate();
  const inbound = (location.state as { ask?: string } | null)?.ask;
  const firedRef = useRef(false);

  useEffect(() => {
    if (typeof inbound !== "string" || !inbound.trim() || firedRef.current) return;
    // The allowance holds an ordinary question back (see above) — but never a
    // symptom report. `send` answers that one from plain code, unbilled.
    if (atCreditLimit && !checkSafety(inbound)) return;
    firedRef.current = true;
    navigate("/coach/chat", { replace: true, state: null });
    void send(inbound);
    // `send` is a fresh closure every render and adding it here would re-run
    // this on every keystroke in the composer; `firedRef` is what actually
    // guards the once-only, so the dependency list is the trigger, not the
    // closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbound, atCreditLimit]);

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
     *   - a credit would be spent on being told to descend, on a system that
     *     exists to stop a runaway bill, not to ration an emergency;
     *   - `atCreditLimit` would drop the question in silence once the day's
     *     credits were spent;
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

    if (atCreditLimit) return;

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
     * will remember that" — the honest place to see what was kept is the
     * "What I remember" sheet opened from the trust row below, and the full
     * /coach/memory screen it links onward to.
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
    // Bank what it actually cost, from the usage the proxy reported. This is
    // the ONE place a credit is spent — see the doctrine block above.
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
        style={{ paddingTop: "calc(var(--screen-safe-top, env(safe-area-inset-top, 0px)) + 16px)" }}
      >
        {/*
          THE TOP BAR — B2's shape, shared by every Coach sub-page in the
          mockup: "‹ Coach" at the left, the page's own title centred, a "⋮"
          overflow menu at the right. `CoachHead` (`screens/coach/shell.tsx`)
          renders a different shape — a big serif hero heading with no
          overflow control — which is right for Hub/Plan/Fuel's own header but
          is not what B2 draws for Chat. Rather than reshape `CoachHead` (used
          by Plan and Fuel, both being rebuilt in parallel today, from the
          same brief, by other agents), Chat draws its own compact bar here —
          scoped to the one file this task owns.

          A GRID, NOT A FLEX ROW, so "Chat" stays visually centred even though
          "‹ Coach" and the "⋮" button are different widths — a three-column
          grid with the title in the middle column centres it against the bar,
          not against its neighbours.
        */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Link
            to="/coach"
            aria-label="Back to Coach"
            className="-ml-2 inline-flex w-fit items-center gap-1 rounded-full py-2.5 pl-2 pr-3 text-[14px] text-mist transition-colors hover:text-snow"
          >
            <ChevronLeft size={18} strokeWidth={1.6} aria-hidden="true" />
            Coach
          </Link>
          <p className="display justify-self-center text-[17px] text-snow">Chat</p>
          <div ref={menuRef} className="relative justify-self-end">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Chat options"
              className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-mist transition-colors hover:text-snow"
            >
              <MoreVertical size={18} strokeWidth={1.7} aria-hidden="true" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  role="menu"
                  aria-label="Chat options"
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: -3 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute right-0 top-11 z-20 w-52 origin-top-right overflow-hidden rounded-tile border border-hairline-strong bg-slate shadow-lg"
                >
                  {/* "New conversation" — moved here from a standing row
                      under the trust row, now that the top bar carries an
                      overflow control. Same guard as before: it does nothing
                      on an empty thread, and a control that does nothing is
                      worse than a disabled one. */}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={messages.length === 0}
                    onClick={() => {
                      /* The offers belong to the conversation that made them: a
                         Confirm sitting under a thread the athlete has closed is
                         a change nobody is still discussing. Applied changes are
                         untouched — they are rows in the plan's own history. */
                      clearChanges();
                      /* The pictures belong to the thread that produced them,
                         same rule as the offers above. */
                      clearSuggestedRoutes();
                      /* Same rule again: a guide offered inside a conversation
                         the athlete has closed is a recommendation nobody is
                         making. */
                      clearProfessionals();
                      startNew();
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13px] text-snow transition-colors hover:bg-white/[0.05] disabled:opacity-40"
                  >
                    <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
                    New conversation
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Context line — "Mont Blanc · Week 12 · Base", B2. Slim and
            non-editable: brief §4.3, the objective chip on the Hub is the
            ONLY place it changes, so unlike the Hub this is text, not a
            control. Absent rather than fabricated when there is no goal or
            no plan to read a week from. */}
        {contextLine && (
          <p className="tnum mt-3 text-center text-[12.5px] text-azure-bright">{contextLine}</p>
        )}

        {/* Identity and privacy, before a word is typed. This is the one
            conversation in the app that is not a public feed, and it says so
            where the Social tab's look might otherwise be assumed. Two
            pills, B2's trust row — no third "ICEFALL AI Coach" badge; the
            mark and label on every coach bubble below already carry that. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong px-3 py-1.5 text-[12px] text-mist">
            <Lock size={12} strokeWidth={2} aria-hidden="true" />
            Private · not shared to Social
          </span>
          <button
            type="button"
            onClick={() => setMemoryOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-hairline-strong px-3 py-1.5 text-[12px] text-mist transition-colors hover:text-snow"
          >
            What I remember ({notes.length})
            <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* The intro bubble — the coach introducing itself, NOT a turn. See
              the PH-14a note above: drawn as a bubble per B2, but still out
              of `messages` and never sent to the model. */}
          {messages.length === 0 && !thinking && (
            <div className="flex justify-start">
              <div className="max-w-[86%]">
                <div className="mb-2 flex items-center gap-2">
                  <IcefallMark className="h-3 text-azure" />
                  <span className="section-label text-azure/70">ICEFALL Coach</span>
                </div>
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-snow/90">
                  Hi {ctx.athlete.firstName}! I'm your ICEFALL coach. I'll answer from what you've
                  logged and use your plan to give tailored guidance. If something isn't logged,
                  I'll say so rather than guessing.
                  {DEMO ? " This demo runs on sample data." : ""}
                </p>
              </div>
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
              /* The source footnote — "Based on N logged sessions", B2 — only
                 on a plain answer: no change offer, no route cards, no guide
                 cards already grounding it in something visible, and never
                 on the safety card. `loggedSessionsCount` is real and shared
                 (`useCoachPlanSummary`), never a per-question figure the app
                 does not have — so it is the SAME number on every bubble it
                 appears on, which is the honest constraint of only having one
                 real count to cite. */
              sourceCount={
                m.role === "coach" &&
                !m.disclaimer &&
                !changes.some((c) => c.messageId === m.id) &&
                !suggestedRoutes.some((r) => r.messageId === m.id) &&
                !suggestedProfessionals.some((r) => r.messageId === m.id) &&
                loggedSessionsCount > 0
                  ? loggedSessionsCount
                  : null
              }
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

      {/* Suggested prompts — B2's exact three (`chatPromptChips` above), above
          the input, hidden once the day's credits are spent so they cannot
          trigger a blocked send. Deliberately a different, smaller set than
          the Hub's rotating `SUGGESTED_PROMPTS` (`services/coach.ts`): B2
          transcribes this screen's own chips, not that list. */}
      {!atCreditLimit && (
        <div className="no-scrollbar shrink-0 overflow-x-auto px-5 pb-3">
          <div className="flex gap-2">
            {chatPromptChips.map((p) => (
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

      {/* Composer, plus the single usage meter directly under it — B2. The
          input itself disables at zero credits rather than being swapped for
          a paywall card: brief §4 rule 4 keeps this to one limit, and that
          limit is the daily credit allowance, not a subscription tier. */}
      <div
        className="shrink-0 border-t border-hairline bg-obsidian px-5 py-3"
        style={{ paddingBottom: `calc(${TABBAR_STICKY_BOTTOM} + 0.75rem)` }}
      >
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
            disabled={atCreditLimit}
            placeholder="Ask your coach…"
            aria-label="Ask your coach"
            className="h-11 flex-1 rounded-full border border-hairline bg-elevated/40 px-4 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || thinking || atCreditLimit}
            aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-azure text-obsidian transition-all hover:bg-azure-bright disabled:opacity-30"
          >
            <ArrowUp size={18} strokeWidth={2} />
          </button>
        </form>

        {/* THE single meter — B2: a chat-bubble icon, "N of M coach messages
            left today", and a horizontal bar. Amber at 2 or fewer remaining
            (brief §Chat meter states); the reset time only appears once the
            input is actually disabled, so it answers the question the
            disabled state itself raises rather than showing pre-emptively. */}
        <div className="mt-2.5 flex items-center gap-2 px-1">
          <MessageCircle
            size={13}
            strokeWidth={1.8}
            className={cn(meterLow ? "text-alert" : "text-mist-dim")}
            aria-hidden="true"
          />
          <p className={cn("tnum text-[11.5px]", meterLow ? "text-alert" : "text-mist-dim")}>
            {creditsRemaining} of {DAILY_CREDITS} coach messages left today
          </p>
        </div>
        <div
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate"
          role="presentation"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              meterLow ? "bg-alert" : "bg-azure",
            )}
            style={{ width: `${meterPct}%` }}
          />
        </div>
        {atCreditLimit && (
          <p className="mt-1.5 px-1 text-[11.5px] text-mist-dim">
            More coach messages {resetLabel()}
          </p>
        )}
      </div>

      {/* "What I remember" sheet — B2's trust row pill. A quick list with
          delete, per the brief; the fuller memory management (adding a note
          by hand, the conversation history, "forget everything") stays on
          `/coach/memory`, which this sheet links onward to rather than
          duplicating. */}
      {memoryOpen && (
        <MemorySheet notes={notes} onForget={forgetNote} onClose={() => setMemoryOpen(false)} />
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
  sourceCount,
  onApply,
  onDecline,
  onUndo,
}: {
  message: CoachMessage;
  reveal?: boolean;
  change?: CoachChange;
  routes?: SuggestedRoutes;
  professionals?: SuggestedProfessionals;
  /** A real, non-invented "Based on N logged sessions" count, or null to show
   *  no footnote at all. See where this is computed, above. */
  sourceCount?: number | null;
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
        {/* The source footnote — "Based on 13 logged sessions", B2 — only when
            `sourceCount` was computed as a real, non-zero figure above. */}
        {typeof sourceCount === "number" && (
          <p className="tnum mt-1.5 text-[11px] text-mist-dim">
            Based on {sourceCount} logged {sourceCount === 1 ? "session" : "sessions"}
          </p>
        )}
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

        <p className={cn("tnum mt-1.5 text-[10.5px] text-mist-dim", !isCoach && "text-right")}>
          {fmtTime(message.at)}
        </p>
      </div>
    </motion.div>
  );
}

/**
 * "WHAT I REMEMBER" SHEET — B2's trust row pill: "a sheet listing memories
 * with delete." Built on the foundation's `Sheet`, the same pattern
 * `ObjectiveSheet.tsx` uses — no bespoke backdrop/Escape/drag-handle here,
 * `Sheet` already owns all of that.
 *
 * A QUICK LIST, NOT THE FULL MEMORY SCREEN. `/coach/memory` already exists,
 * already lets the athlete add a note by hand, browse past conversations and
 * wipe everything — rebuilding that inside a sheet here would be the same
 * screen maintained twice. This sheet does the one thing B2 asks for (list,
 * delete) and hands off to the full screen for anything more.
 */
function MemorySheet({
  notes,
  onForget,
  onClose,
}: {
  notes: { id: string; text: string; createdAt: string }[];
  onForget: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={`What I remember (${notes.length})`} onClose={onClose}>
      {notes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span
            aria-hidden="true"
            className="grid h-11 w-11 place-items-center rounded-full bg-azure/15 text-azure"
          >
            <Bookmark size={18} strokeWidth={1.6} />
          </span>
          <div>
            <p className="text-[14px] font-medium text-snow">Nothing kept yet</p>
            <p className="mt-1 max-w-[26ch] text-[12.5px] leading-relaxed text-mist">
              Things like which days you train or what your coach should train around get noted as
              you mention them in chat.
            </p>
          </div>
        </div>
      ) : (
        notes.map((n) => (
          <div key={n.id} className="flex items-start gap-3.5 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] leading-relaxed text-snow">{n.text}</p>
              <p className="tnum mt-1 text-[11px] text-mist-dim">
                {new Date(n.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onForget(n.id)}
              aria-label={`Forget: ${n.text}`}
              className="-mr-2 mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-danger"
            >
              <Trash2 size={16} strokeWidth={1.7} />
            </button>
          </div>
        ))
      )}
      <div className="py-3.5">
        <Link
          to="/coach/memory"
          onClick={onClose}
          className="text-[13px] text-azure-bright transition-colors hover:text-azure"
        >
          Manage in Coach memory ›
        </Link>
      </div>
    </Sheet>
  );
}
