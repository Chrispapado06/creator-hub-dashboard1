import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUp,
  ChevronRight,
  MessageCircle,
  MountainSnow,
  Route as RouteIcon,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { UpgradePrompt } from "@/components/growth/UpgradePrompt";
import { creditsLeft, isExhausted } from "@/coach/budget";
import { useCoachIntel } from "@/coach/hooks";
import { COACH_DISCLAIMER } from "@/coach/types";
import { useUpgradeCopy } from "@/growth/upgradeCopy";
import { FOCUS_LABELS, fmtDistance, fmtElevation } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import type { TrainingDay } from "@/types";
import { ACCENT, Eyebrow, INK, ON_PRIMARY, PRIMARY, TILE, TINT, WHITE, useObjective } from "./shell";

/**
 * COACH — THE HUB, to the owner's mockup of 2026-09-06, and the landing surface
 * at `/coach`.
 *
 * Six blocks in the drawing's order: a hero carrying the current objective, an
 * ask bar into the chat, today's session, four cards, and a wide card into the
 * plan. The five Coach pages built on 2026-09-04 are unchanged — this replaces
 * the tab strip that used to sit inside `CoachHead`, so each of them is now
 * reached by tapping a card and returns here by the chevron the head grew.
 *
 * IT IS WRITTEN TO EXPLORE'S HUB, DELIBERATELY. Same envelope (`Screen
 * padded={false}` over a `Stagger` at `px-5 pb-10 pt-6`), same photo-card
 * anatomy (tinted ground, absolutely-positioned decorative photograph, its own
 * scrim, `relative` on everything above it), same editorial palette, same serif
 * `.display` head. Two hubs a tab apart that were written to different rules
 * read as two products.
 *
 * ── WHERE THIS DIFFERS FROM THE DRAWING, AND WHY ───────────────────────────
 *
 * Each of these is a place the mockup asks for a figure or a label the data
 * cannot support. They are listed here together so a future reader does not
 * have to reconstruct the argument from four separate comments.
 *
 *   1. THE PLAN TILES. The drawing shows four fixed tiles: "Strength 45 min",
 *      "Zone 2 Cardio 60 min", "Mobility 20 min", "Daily steps 12,000". None of
 *      that is derivable. A `TrainingDay` is ONE session with one focus, not
 *      three concurrent blocks; ICEFALL has never measured anyone's maximum,
 *      resting or threshold heart rate, so a "zone" is a measurement printed
 *      where none was taken (the full argument is at `coach/sessions.ts:19`);
 *      and nothing in this app counts steps (`coach/fuelDay.ts` says so in as
 *      many words). So the tiles keep the drawn LAYOUT and carry only the
 *      figures the plan really holds for today — focus, duration, ascent,
 *      distance — and there are FEWER THAN FOUR when the day holds fewer. See
 *      `tilesFor` below, which is where the count is decided.
 *
 *      ⚠ A trap for whoever adds a fifth tile: `HealthMetricId` in
 *      `tracking/sources/health.ts` does list `"steps"`. That is a bridge
 *      contract for a native container that does not exist in this build — the
 *      only consumer is the Health settings screen, and Coach passes
 *      `undefined` for the health metrics it would want. Seeing the word there
 *      is not a source.
 *
 *   2. THE OBJECTIVE PILL says the athlete's real active goal, whatever it is —
 *      Mont Blanc in the demo data — not the drawing's "Everest — South Col".
 *      With no goal set it says so and links to `/goals`, rather than showing a
 *      mountain nobody chose.
 *
 *   3. THE FUEL CARD HAS NO PHOTOGRAPH. The long version is at the card's own
 *      entry in `CARDS` below.
 *
 *   4. THE SUGGESTION CHIPS are not the drawing's three. Two of those fail on
 *      inspection: "What's my next focus?" matches no rule in
 *      `services/coach.ts`, so its answer would be the fallback — a menu of
 *      what the coach can answer, which makes it a dead chip; and "Adjust my
 *      nutrition plan" promises an action the coach cannot perform, since the
 *      fuelling reply is guidance and adjusts nothing. The three drawn here all
 *      hit a real rule AND read the athlete's own recorded data. See `chips`.
 *
 *   5. THE GRID'S FIRST CARD IS LABELLED "Today", not the drawing's "Today's
 *      Plan". The drawing uses that name twice — on the big card above it and
 *      on this one — for two different destinations (this session, versus the
 *      Today page). Two cards a thumb apart with the same name going to
 *      different places is a coin toss, so this one takes the name of the page
 *      it opens, which is also the name that page gives itself.
 *
 * The bottom navigation and the top bar are untouched, on the owner's explicit
 * ruling: the mockup drops START, adds PROFILE and draws a "3" on the bell, and
 * none of that is a request. There is no notification model in this app.
 */

/* -------------------------------------------------------------------------- */
/* Today's tiles                                                               */
/* -------------------------------------------------------------------------- */

interface Tile {
  icon: LucideIcon;
  label: string;
  value: string;
  /** 2 = the tile takes the full width of the card. See `tilesFor`. */
  span: 1 | 2;
}

/**
 * The tiles for today, and there are between one and four of them.
 *
 * A `TrainingDay` carries exactly five figure-bearing fields: `focus` and
 * `title` (always), and `durationMin`, `distanceKm` and `elevationM` (all
 * optional). `difficulty` exists too and is deliberately left out — a 1-to-5
 * rating on a hub card reads as an assessment OF THE ATHLETE rather than of the
 * session, and the session page already renders it in context.
 *
 * Every optional figure is guarded on being a finite number ABOVE ZERO, the
 * same guard `Today.tsx` uses. A missing figure produces no tile at all rather
 * than a tile with an em dash in it: an absent tile is absence, and an em dash
 * in a grid of four reads as a value that failed to load.
 *
 * WHAT THIS PRODUCES IN PRACTICE, from the seven day templates in
 * `tracking/training.ts` — Thursday (rest) gives ONE tile, Monday and Wednesday
 * two, Sunday three, Tuesday and Saturday four. Nothing produces more than
 * four, so the card never overflows.
 *
 * WHY FOCUS ALWAYS TAKES THE FULL WIDTH, which is the one place this departs
 * from the drawing's flat 2×2 and it is not a taste call — it was measured in
 * the running app at 375pt. A half tile leaves about 71px for its value once
 * the icon, the gaps and the chevron are subtracted. "Recovery" truncated to
 * "Reco…" there, and Saturday's focus label is "Long Mountain Session", which
 * has no chance at all. Every other value is short and numeric by construction
 * ("38 min", "620 m", "4.0 km"), so the words are the only thing that needs the
 * room. Giving focus the full row also makes the grid FILL in every case
 * instead of leaving a hole: with focus wide and an odd last figure widened
 * too, one tile becomes [Focus], two become [Focus][Duration], three become
 * [Focus][Duration|Distance] and four become [Focus][Duration|Ascent][Distance].
 * A hole in a grid of figures reads as a value that failed to load.
 */
function tilesFor(day: TrainingDay): Tile[] {
  // Always present: `focus` is required on a TrainingDay. On a rest day this is
  // the only tile, and it reads "Focus — Rest", which is the truth.
  const focus: Tile = {
    icon: MountainSnow,
    label: "Focus",
    value: FOCUS_LABELS[day.focus] ?? day.focus,
    span: 2,
  };

  const figures: Tile[] = [];
  if (typeof day.durationMin === "number" && day.durationMin > 0) {
    figures.push({ icon: Timer, label: "Duration", value: `${day.durationMin} min`, span: 1 });
  }
  if (typeof day.elevationM === "number" && day.elevationM > 0) {
    figures.push({
      icon: ArrowUp,
      label: "Ascent",
      value: `${fmtElevation(day.elevationM)} m`,
      span: 1,
    });
  }
  if (typeof day.distanceKm === "number" && day.distanceKm > 0) {
    figures.push({
      icon: RouteIcon,
      label: "Distance",
      value: `${fmtDistance(day.distanceKm)} km`,
      span: 1,
    });
  }

  // An odd last figure widens, so the bottom row is never half empty.
  if (figures.length % 2 === 1) figures[figures.length - 1].span = 2;

  return [focus, ...figures];
}

/**
 * "Sat 6 Sep" for the pill on the plan card.
 *
 * Parsed from the plan day's OWN `date` field rather than from `new Date()`.
 * They are the same day by construction — `useTraining` finds today's session
 * by matching that key — but reading the field means the pill can never
 * disagree with the session it sits on, including under the mocked clock the
 * demo data uses.
 */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/* -------------------------------------------------------------------------- */
/* The cards                                                                   */
/* -------------------------------------------------------------------------- */

interface HubCard {
  to: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  /**
   * The card's own ground. Under a photograph it is the fallback a failed or
   * still-loading image leaves behind — a coloured card rather than a black
   * hole — and on Fuel it is the surface itself.
   */
  tint: keyof typeof TINT;
  /**
   * A CC0 or public-domain file from `public/img/`. Optional: see Fuel.
   *
   * ONLY THE ATTRIBUTION-FREE HALF OF THAT LIBRARY MAY BE USED HERE, and that
   * is not an aesthetic choice. Roughly half of it is CC BY or CC BY-SA, whose
   * terms require the credit shown wherever the image is displayed publicly,
   * and a 170px card has nowhere to print one. Every slug below was re-read in
   * `public/img/_credits.json` before it was used; each carries its licence in
   * the comment beside it. If you change one, check its row first.
   */
  photo?: string;
  photoStyle?: React.CSSProperties;
}

const CARDS: HubCard[] = [
  {
    to: "/coach/today",
    label: "Today",
    blurb: "Your session, the week so far, and the coach's note.",
    icon: MountainSnow,
    tint: "blue",
    /* "Aiguille de Rochefort.jpg" by Francofranco56 — Public domain. A corniced
       arête reads as "the ridge ahead", and it is not the photograph any
       mountain page in this app uses for itself.

       "The Ridgeway" by Wormholealien — PUBLIC DOMAIN, from the trek library
       (`public/img/treks/`, credited in `src/treks/credits.ts`). A path through
       bluebell woodland.

       WHY NOT A MOUNTAIN. The owner's note on 2026-09-06: the Coach photographs
       were "very similar to the ones on explore", and they were — every card on
       both hubs was a snowy alpine peak from the same seventeen-frame set. The
       trek library is 244 photographs and 28 of them are attribution-free, in
       terrain the peaks set does not cover: woodland, desert, crater lake,
       coast. Coach draws from those now, so the two hubs no longer read as one
       set. It also happens to suit the card: today's session is a walk, and this
       is a walk.

       NO CROP FIX AND NONE NEEDED — the frame is woodland edge to edge with no
       sky in it at all, so there is no pale band for the portrait crop to find.
       That is the opposite of the Guides bug ("guides image isnt loading",
       2026-09-05), which was 40% washed-out sky reading as a blank rectangle. */
    photo: "/img/treks/the-ridgeway.jpg",
  },
  {
    to: "/coach/chat",
    label: "Chat with AI Coach",
    blurb: "Private, grounded in what you record.",
    icon: MessageCircle,
    tint: "lavender",
    /* "Quilotoa Loop" by Annom — PUBLIC DOMAIN, from the trek library. A
       turquoise crater lake ringed by its caldera: still water, which is the
       right register for the one screen in the app that is a private
       conversation.

       CROPPED UP FROM THE BOTTOM. The frame is 1280×929 landscape in a portrait
       box, so cover matches height and the full vertical extent shows —
       including the top ~30%, which is sky. That sky is not the Guides failure
       mode (it carries real cloud structure rather than being a flat pale wash)
       but it is still a third of the card spent on nothing, so `scale(1.25)`
       with `transformOrigin: "50% 100%"` magnifies about the BOTTOM edge and
       takes the crop off the top. A plain centred scale would have trimmed as
       much lake as sky. */
    photo: "/img/treks/quilotoa-loop.jpg",
    photoStyle: { transform: "scale(1.25)", transformOrigin: "50% 100%" },
  },
  {
    to: "/coach/progress",
    label: "Progress",
    blurb: "Where the plan sits and what you have done.",
    icon: TrendingUp,
    tint: "green",
    /* "Larapinta Trail" by Felix Dance — PUBLIC DOMAIN, from the trek library.
       A red desert ridgeline in the West MacDonnells: ground already covered
       and more of it ahead, which is what this card opens onto. It is also the
       furthest thing in either library from an alpine peak, which is the point
       — see the Today card above for why Coach stopped drawing from the same
       seventeen mountain frames as Explore.

       CROPPED UP FROM THE BOTTOM, and this one genuinely needs it: the top
       ~22% is pale, near-white sky, which is the exact composition that made
       the Guides card read as a failed image. `scale(1.3)` about
       `transformOrigin: "50% 100%"` takes the magnification off the top and
       leaves the ridge and the valley floor filling the frame. */
    photo: "/img/treks/larapinta-trail.jpg",
    photoStyle: { transform: "scale(1.3)", transformOrigin: "50% 100%" },
  },
  {
    to: "/coach/fuel",
    /* THE OWNER'S OWN EARLIER RULING, not a rename. The drawing labels this
       "Nutrition"; this app calls it Fuel, and the reason is recorded in
       `coach/nutrition.ts`: "Nutrition" is the word every calorie app the
       athlete has already deleted uses on its tab bar. */
    label: "Fuel",
    blurb: "Today's energy band and session fuelling.",
    icon: Utensils,
    tint: "peach",
    /* "Fruit and Honey French Oatmeal 2.jpg" by Bajinra — CC0, harvested from
       Wikimedia Commons on 2026-09-06 and recorded in BOTH `_credits.json` and
       `CREDITS.md`, which is the step that makes it usable rather than just
       present.

       THIS CARD SHIPPED WITHOUT A PHOTOGRAPH FOR HALF A DAY, and the note that
       stood here explained why: the bundled library is seventeen frames of
       mountains and holds no food, no camp and no stove, so the only options
       were a tinted card or a fourth summit above fuelling guidance. The owner
       looked at it and asked for images that match what the card is about —
       "doesnt have to be mountains like on nutrition" — so the harvest that
       note prescribed was done: search Commons by CATEGORY (the free-text
       search returns almost nothing usable), filter to CC0 or public domain,
       LOOK at the frame, then write the row. Categories "Oatmeal", "Muesli" and
       "Fruit salads" between them yielded 47 attribution-free frames; this one
       is a bowl of oats, yoghurt, strawberries and almonds, which is as close
       to the mockup's drawing as the free-licence world gets.

       WHAT DID NOT SURVIVE THE SAME SEARCH, so nobody repeats it: people. There
       is no attribution-free photograph of a coach talking, a guide advising or
       an athlete mid-session. "Trail running" returns two, and the usable one is
       a race start dense with sponsor banners, bib numbers and third-party
       trademarks — unusable on any screen of this app. Landscapes and food are
       what the free-licence commons actually offers.

       PORTRAIT SOURCE, 1072×1920, in a portrait box: cover matches WIDTH here,
       so the crop is vertical and the bowl — which sits low in the frame under a
       cup and saucer — needs pulling up. `objectPosition: "50% 62%"` centres the
       bowl and drops the tabletop clutter below the fold. */
    photo: "/img/coach-fuel.jpg",
    photoStyle: { objectPosition: "50% 62%" },
  },
];

/* -------------------------------------------------------------------------- */
/* The page                                                                    */
/* -------------------------------------------------------------------------- */

export default function CoachHub() {
  const navigate = useNavigate();
  const intel = useCoachIntel();
  const { goal, kind } = useObjective();
  const { coachInteractionsLeft, coachBudget } = useApp();
  const coachCopy = useUpgradeCopy("coach");

  const [draft, setDraft] = useState("");

  const today = intel.today;
  const plan = intel.plan;
  const tiles = today ? tilesFor(today) : [];

  /*
   * TWO DIFFERENT LIMITS, WITH TWO DIFFERENT BEHAVIOURS. Getting these the same
   * way round as the chat screen matters, because the athlete can see both
   * screens in the same minute and they must not disagree.
   *
   *   · `atLimit` is the free tier's MONTHLY allowance, and it is a real block:
   *     `send()` in `CoachChat` refuses outright when it is true. So the bar
   *     here must not look sendable — the input comes out and the upgrade ask
   *     goes in its place, inline, exactly as the chat screen does it. A
   *     control that looks like it works and does not is the specific fault
   *     this brief names.
   *   · `budgetSpent` is the daily credit pool / the money backstop, and it is
   *     NOT a block: `askCoach` skips the model and the scripted coach answers
   *     anyway. So the bar stays fully enabled and the counter line simply says
   *     what the chat screen says in that state, in the same words.
   *
   * `coachInteractionsLeft` is null on an unlimited tier, which is not a limit
   * of zero — hence the explicit null test rather than a falsy one.
   */
  const metered = coachInteractionsLeft !== null;
  const atLimit = coachInteractionsLeft !== null && coachInteractionsLeft <= 0;
  const budgetSpent = isExhausted(coachBudget);

  /*
   * Three chips, all of which hit a real rule in `services/coach.ts` and all of
   * which read the athlete's own recorded data rather than returning general
   * guidance. See note 4 in this file's header for the drawing's three and why
   * they are not used.
   *
   * The middle one is GENERATED FROM THE REAL OBJECTIVE. `SUGGESTED_PROMPTS`
   * holds the literal string "Am I ready for Mont Blanc?", which is only true
   * of the demo data — the REPLY reads `objective.name` regardless, so the
   * mountain in the question has to come from the same place or the chip asks
   * about a peak the athlete never chose. With no objective set it falls back
   * to "Am I prepared?", which still matches `/am i prepared/i` and whose reply
   * is "Set an objective first and I will assess your readiness against it."
   */
  const chips = [
    "What should I train today?",
    goal ? `Am I ready for ${goal.name}?` : "Am I prepared?",
    "Why am I feeling fatigued?",
  ];

  /*
   * THE ASK BAR REACHES CHAT THROUGH ROUTER STATE, AND THIS IS THE SMALLEST
   * MECHANISM THAT ACTUALLY WORKS.
   *
   * `CoachChat` holds its transcript in local state and had no inbound path at
   * all — no search param read, no location state read, no prop. It has gained
   * one effect that fires a `state.ask` exactly once and clears it. See the
   * comment at that effect for why it clears the state BEFORE sending.
   *
   * NOT a `?q=` query parameter, and the reason is not tidiness. The question
   * is free text the athlete typed, and Coach is the one conversation in this
   * app that is explicitly private — the chat screen says "Private · separate
   * from Social" on its own face. A query parameter puts that text in the URL,
   * where it is screenshotted, shared and logged. Router state stays in memory.
   *
   * The honest cost, which is the right trade here: router state does not
   * survive a hard reload, so a refresh loses the question. Re-asking on
   * refresh would spend an interaction the athlete never asked to spend, which
   * is worse. The draft is deliberately NOT cleared before navigating, so if
   * they do come back the text is still in the bar.
   */
  function ask(question: string) {
    const q = question.trim();
    if (!q || atLimit) return;
    navigate("/coach/chat", { state: { ask: q } });
  }

  return (
    <Screen padded={false}>
      {/* Every child of Stagger is a Rise, DIRECTLY. framer-motion hands the
          stagger variants to direct children only; a wrapper element between
          them leaves everything at opacity 0 — present in the DOM, invisible on
          screen, no error, tsc green. */}
      <Stagger className="px-5 pb-10 pt-6">
        {/* ---- Hero -------------------------------------------------------- */}
        <Rise>
          <Hero goal={goal} kind={kind} />
        </Rise>

        {/* ---- Ask bar ----------------------------------------------------- */}
        <Rise className="mt-5">
          {atLimit ? (
            <div className="rounded-[24px] bg-graphite p-4 shadow-[0_1px_10px_rgba(20,24,40,0.05)]">
              <Eyebrow>Ask your coach</Eyebrow>
              {/* Said plainly before the upgrade ask, so the reason the bar is
                  missing is on the page rather than implied by its absence. */}
              <p className="mt-2 text-[14px] leading-relaxed text-mist">
                You have used this month's free coach conversations.
              </p>
              <UpgradePrompt
                className="mt-3"
                featureId="coach.unlimited"
                title={coachCopy.title}
                body={coachCopy.body}
              />
            </div>
          ) : (
            <div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(draft);
                }}
                className="relative"
              >
                <Sparkles
                  size={18}
                  strokeWidth={1.6}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-azure"
                />
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask your coach anything…"
                  aria-label="Ask your coach anything"
                  className="h-[54px] w-full rounded-full border border-hairline bg-graphite pl-11 pr-[58px] text-[15px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Ask your coach"
                  className="absolute right-2 top-1/2 grid h-[42px] w-[42px] -translate-y-1/2 place-items-center rounded-full transition-opacity disabled:opacity-30"
                  /* The app's one solid-button pair, and the ink is OBSIDIAN
                     rather than white on purpose: obsidian is the canvas token,
                     so it is dark ink on the dark theme's light azure (~7:1)
                     and warm-white on the light theme's saturated blue (~5:1).
                     White here would be 2.9:1 in dark. */
                  style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
                >
                  <ArrowUp size={19} strokeWidth={2} aria-hidden="true" />
                </button>
              </form>

              <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
                {chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => ask(c)}
                    className="shrink-0 rounded-full border border-hairline-strong px-3.5 py-1.5 text-[12.5px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* ONE counter, matching the chat screen's words exactly. Two
                  counters for one allowance is how they drift apart. */}
              <div className="mt-2.5 flex items-center justify-between gap-3 px-1">
                {metered && coachInteractionsLeft !== null ? (
                  <p className="text-[11px] text-mist-dim">
                    {coachInteractionsLeft} free{" "}
                    {coachInteractionsLeft === 1 ? "conversation" : "conversations"} left this month
                  </p>
                ) : (
                  <span />
                )}
                {budgetSpent ? (
                  <p className="text-[11px] text-mist-dim">Saved guidance · more tomorrow</p>
                ) : (
                  <p className="tnum text-[11px] text-mist-dim">
                    {creditsLeft(coachBudget)} coach{" "}
                    {creditsLeft(coachBudget) === 1 ? "credit" : "credits"} today
                  </p>
                )}
              </div>
            </div>
          )}
        </Rise>

        {/* ---- Today's plan ------------------------------------------------ */}
        <Rise className="mt-5">
          <TodayCard
            day={today}
            tiles={tiles}
            hasGoal={Boolean(intel.goal)}
            /* The briefing can hold today's session down — illness, a hard day
               yesterday, a load spike. When its focus differs from the plan's,
               the plan's day is shown with that said beside it rather than
               silently swapped. This is the same test `Today.tsx` makes, and it
               has to be repeated here or the hub would cheerfully advertise
               intervals on a day the engine has already downgraded — the exact
               contradiction `coach/context.ts` exists to prevent. */
            eased={Boolean(
              today && intel.briefing.training && intel.briefing.training.focus !== today.focus,
            )}
            easedStatus={intel.briefing.status}
            cold={intel.cold}
          />
        </Rise>

        {/* ---- The four cards ---------------------------------------------- */}
        {/* One Rise around the whole grid, so it rises as a unit rather than
            four cards firing one after another. */}
        <Rise className="mt-6">
          <div className="grid grid-cols-2 gap-3">
            {CARDS.map((card) => (
              <GridCard key={card.to} card={card} />
            ))}
          </div>
        </Rise>

        {/* ---- The wide Plan card ------------------------------------------ */}
        <Rise className="mt-3">
          <PlanCard
            /* `Week 6 of 24` — the plan's own two fields, or nothing. Never a
               week number without the total beside it, which would read as a
               countdown to nothing. */
            weekLine={plan ? `Week ${plan.currentWeek} of ${plan.totalWeeks}` : null}
          />
        </Rise>

        <Rise className="mt-6">
          <p className="text-[11px] leading-relaxed text-mist-dim">{COACH_DISCLAIMER}</p>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The eyebrow's blue, as a LITERAL rather than `text-azure`.
 *
 * It sits on a photograph. A photograph is byte-identical in light and dark —
 * it does not brighten because the app did — so everything drawn on it must be
 * theme-invariant too, which is the whole reason `WHITE` and `INK` are literals
 * in the editorial palette. `--ice-azure` is a fraction darker in the light
 * theme, which on this near-black scrim would be the wrong direction.
 */
const ON_PHOTO_ACCENT = "#9EC5FF";

/** The ground under a photograph, so a 404 leaves a panel rather than a hole. */
const PHOTO_GROUND = "#0B1430";

function Hero({ goal, kind }: { goal: ReturnType<typeof useObjective>["goal"]; kind: string | null }) {
  return (
    <section
      /* FULL-BLEED, NOT A CARD — owner, 2026-09-06: "dont have it a a box
         design, have to take the entire wipth".

         `-mx-5` cancels the `px-5` on the `Stagger` this sits inside, which is
         what carries it to both screen edges; `px-5` then puts the padding back
         INSIDE the section so the words keep the same left margin as every
         other block on the page and only the photograph reaches the edge. The
         `rounded-[28px]` went with the box.

         It stays `overflow-hidden`: the `<img>` is absolutely positioned to
         fill and would otherwise paint outside the section's bounds. */
      className="relative -mx-5 overflow-hidden px-5 py-6"
      /* An EXPLICIT ground, which Explore's own hero does not have and should.
         The `<img>` is `alt=""` and `aria-hidden`, so a browser renders
         literally nothing for a broken one — no icon, no alt text — and the
         colour underneath is therefore the entire fallback. Without it a failed
         photograph would leave a translucent wash over the page. */
      style={{ backgroundColor: PHOTO_GROUND, color: WHITE }}
    >
      {/* "Sólheimajökulll glaciers (Unsplash).jpg" — CC0, so no visible credit
          is owed. The snout of an Icelandic glacier: crevassed ice streaked
          with volcanic ash, and a moraine running out of frame. Swapped in on
          2026-09-06 when the owner asked for a different hero; the ski-tourer
          frame it replaced (`splash.jpg`) was flat, pale and low-contrast at
          this size, and the words sat on it rather than in front of it.

          IT IS DELIBERATELY NOT A RECOGNISABLE PEAK, and that constraint
          outlived the image it was written for. Denali, the Eiger, Aconcagua
          and Gran Paradiso are each some mountain's own photograph elsewhere in
          this app, and this hero sits directly above a pill that NAMES the
          athlete's objective — a famous summit here would read as a picture OF
          that objective, which it would not be. Like the frame before it, this
          one is already in the repo's own `TERRAIN_SEQUENCE`
          (`services/peakImagery.ts`), the pool that file describes as "Nothing
          here is identifiable … because a stand-in has to stay a stand-in".
          That is the project's own standard for exactly this position.

          THE CROP, AND WHY IT IS A TRANSFORM RATHER THAN AN OBJECT-POSITION.
          Measured at 375pt: the section is 375×239 and the file is 1400×875, so
          the box (1.569) is very slightly TALLER in proportion than the picture
          (1.600). `object-cover` therefore matches HEIGHT, leaving about 7px of
          horizontal slack and — this is the part that matters — NO vertical
          slack at all. An `objectPosition` Y of 62%, 72% or 100% would all draw
          exactly the same pixels, because there is nothing to slide.

          The top ~28% of the frame is flat overcast sky, and with no vertical
          overflow every bit of it lands in the band the eyebrow and the white
          objective pill sit on: a solid white pill on pale sky, which is the
          one thing that pill cannot survive (see `ObjectivePill` below).

          `scale(1.42)` anchored to the bottom edge is the only thing that can
          move it — the same fix, for the same reason, as the Guides card on
          Explore. It enlarges the picture to about 1.42× the box and throws the
          surplus off the TOP, so the visible band starts around 30% down the
          file: crevassed ice behind the eyebrow, dark ash and moraine settling
          under the paragraph. `objectPosition` is left at `50% 100%` so that if
          this section ever grows shorter than 234pt — a shorter objective name,
          a smaller pill — and cover flips to matching width, the vertical slack
          that appears is spent in the same direction the transform already
          pulls, instead of quietly putting the sky back.

          `loading` is left at its default: this is the top of the page and
          lazy-loading something already on screen only delays it. */}
      <img
        src="/img/community-b.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          objectPosition: "50% 100%",
          transform: "scale(1.42)",
          transformOrigin: "50% 100%",
        }}
      />
      {/* The gradient is DIRECTIONAL, not uniform, and it is shaped to the text
          rather than to the card: near-solid on the left where the words are,
          thinning hard to the right so the photograph is still a photograph.
          The mockup draws the picture bleeding in from the right; this is that,
          done in a way that owes nothing to the page's own background colour —
          which is a theme token and would otherwise have to be faded into.

          THE 66% STOP IS MEASURED, not chosen. At 375pt the subtitle's third
          line reaches about two-thirds of the way across, and the glacier is
          brightest exactly there — the lit, ash-streaked ice in the middle of
          the frame. An earlier version thinned to 0.62 by that point and the
          line sat on that lit ice at roughly a third of the contrast the rest
          of the paragraph had. Holding 0.80 until 66% and dropping only after
          it keeps the words on a ground and still leaves the crevasses and the
          far moraine visible in the last third. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(96deg, rgba(6,11,24,0.95) 0%, rgba(7,14,30,0.92) 40%, rgba(8,16,34,0.80) 66%, rgba(11,22,46,0.28) 100%)",
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p
            className="pt-1 text-[12px] font-medium uppercase tracking-[0.16em]"
            style={{ color: ON_PHOTO_ACCENT }}
          >
            AI Coach
          </p>
          <ObjectivePill goal={goal} kind={kind} />
        </div>

        <h1 className="display mt-2 text-[56px] leading-[0.95]">Coach</h1>
        {/* Held to 17rem so the paragraph stays in the gradient's solid half
            instead of running out across the lit ice. */}
        <p
          className="mt-2 max-w-[17rem] text-[15px] leading-snug"
          style={{ color: "rgba(255,255,255,0.80)" }}
        >
          Your personal mountaineering coach. Built around your goals, training, and upcoming
          expedition.
        </p>
      </div>
    </section>
  );
}

/**
 * The pill at the hero's top right.
 *
 * A SOLID WHITE PILL WITH DARK INK, which is the pattern Explore's hub already
 * uses for a chip on a photograph, and it is solid for a measured reason: a
 * translucent white fill with a thin border vanishes over any pale part of a
 * photograph — the failure first recorded on Explore's Discover card. A solid
 * pill carries its own contrast instead of borrowing the picture's.
 *
 * It is not self-sufficient, though, and the hero's crop is the other half of
 * the answer: solid white on the near-white overcast sky this frame carries
 * across its top would have no edge at all, which is why the `scale(1.42)`
 * above pushes that sky out of the box. Change the hero image and this pill is
 * the thing to check first.
 *
 * WITH NO OBJECTIVE it says so and links to `/goals`. The drawing shows
 * "Everest — South Col" in this slot; an athlete who has set nothing must not
 * be shown a mountain, and "everything here follows one" is the line the rest
 * of Coach already uses for this state.
 */
function ObjectivePill({
  goal,
  kind,
}: {
  goal: ReturnType<typeof useObjective>["goal"];
  kind: string | null;
}) {
  return (
    <Link
      to="/goals"
      className="flex max-w-[58%] shrink-0 items-center gap-2 rounded-[16px] py-2 pl-2.5 pr-2 transition-transform active:scale-[0.98]"
      style={{ backgroundColor: WHITE, color: INK }}
    >
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: TINT.blue, color: ACCENT.blue }}
      >
        <Target size={14} strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <span
          className="block text-[9px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "rgba(29,34,42,0.62)" }}
        >
          {goal ? "Current objective" : "No objective"}
        </span>
        <span className="block truncate text-[13.5px] font-semibold leading-tight">
          {goal ? goal.name : "Set one"}
        </span>
        {/* The second line only when the goal actually carries a kind — the
            curated mountain's own `difficultyLabel`, or the route the athlete
            named as the subtitle. Never a category invented to fill the slot. */}
        {goal && kind && (
          <span
            className="block truncate text-[11px] leading-tight"
            style={{ color: "rgba(29,34,42,0.58)" }}
          >
            {kind}
          </span>
        )}
      </span>
      <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" className="shrink-0 opacity-45" />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Today's plan                                                                */
/* -------------------------------------------------------------------------- */

function TodayCard({
  day,
  tiles,
  hasGoal,
  eased,
  easedStatus,
  cold,
}: {
  day: TrainingDay | undefined;
  tiles: Tile[];
  hasGoal: boolean;
  eased: boolean;
  easedStatus: string;
  cold: boolean;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[24px] p-5"
      style={{ backgroundColor: PHOTO_GROUND, color: WHITE }}
    >
      {/* "Vetta Gran Paradiso dalla Tresenta.JPG" by Francofranco56 — Public
          domain. Chosen because it is the only frame in the attribution-free
          set with no flat region at all: summit ridge, a clean snowfield with a
          rope team visibly moving on it, then seracs and rock. It gets the
          biggest photographic slot on the page for that reason.

          The crop is on Y — a 4:3 landscape in a wide box, so cover matches
          width and the vertical overflows. `34%` keeps the ridge, the snowfield
          and the rope team and drops the strip of sky. */}
      <img
        src="/img/gran-paradiso.jpg"
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "50% 34%" }}
      />
      {/* This card is text all the way down, so the scrim has to be heavier
          than a photo card's — but graded, not flat: lighter at the top where
          only the eyebrow and the pill sit, near-solid at the foot under the
          tiles. A flat 0.9 would make the photograph invisible, which is weight
          in the bundle for nothing. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(6,10,20,0.42) 0%, rgba(6,10,20,0.72) 34%, rgba(6,10,20,0.90) 68%, rgba(6,10,20,0.94) 100%)",
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p
            className="pt-1 text-[12px] font-medium uppercase tracking-[0.16em]"
            style={{ color: "rgba(255,255,255,0.68)" }}
          >
            Today's plan
          </p>
          {day && (
            <span
              className="shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold"
              style={{ backgroundColor: WHITE, color: INK }}
            >
              {dayLabel(day.date)}
            </span>
          )}
        </div>

        {day ? (
          <>
            <h2 className="display mt-2 text-[34px] leading-[1.04]">{day.title}</h2>

            {/* `detail` is optional on a TrainingDay. When it is absent nothing
                is drawn — never `FOCUS_GUIDANCE` from `services/coach.ts`, which
                is the coach's voice and belongs in the chat, not in a caption
                the plan did not write. */}
            {day.detail && (
              <p
                className="mt-2 text-[14px] leading-relaxed"
                style={{ color: "rgba(255,255,255,0.80)" }}
              >
                {day.detail}
              </p>
            )}

            {eased && (
              <p
                className="mt-3 rounded-[14px] px-3 py-2 text-[13px] leading-relaxed"
                style={{ backgroundColor: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.88)" }}
              >
                <span className="font-semibold">Eased today. </span>
                {easedStatus}
              </p>
            )}

            {cold && (
              <p
                className="mt-3 text-[12px] leading-relaxed"
                style={{ color: "rgba(255,255,255,0.62)" }}
              >
                Nothing is recorded yet, so this is the plan's prescription rather than a read of
                your form.
              </p>
            )}

            {/* The tiles. One to four of them, and the grid always fills —
                see `tilesFor` for which of them widens and why. */}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {tiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <Link
                    key={tile.label}
                    /* All of them go to the same place, and that is correct
                       rather than lazy: `/coach/session/:date` is the one route
                       where every one of these figures is expanded into actual
                       work. `/coach/plan` shows the week, not the day. */
                    to={`/coach/session/${day.date}`}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[16px] border px-3 py-2.5",
                      tile.span === 2 && "col-span-2",
                    )}
                    style={{
                      backgroundColor: "rgba(11,20,48,0.55)",
                      borderColor: "rgba(255,255,255,0.16)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px]"
                      style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
                    >
                      <Icon size={15} strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-[11px] uppercase tracking-[0.1em]"
                        style={{ color: "rgba(255,255,255,0.62)" }}
                      >
                        {tile.label}
                      </span>
                      <span className="tnum block truncate text-[14.5px] font-semibold">
                        {tile.value}
                      </span>
                    </span>
                    <ChevronRight
                      size={15}
                      strokeWidth={1.8}
                      aria-hidden="true"
                      className="shrink-0"
                      style={{ color: "rgba(255,255,255,0.5)" }}
                    />
                  </Link>
                );
              })}
            </div>

            <Link
              to="/coach/plan"
              className="mt-4 inline-flex items-center gap-1.5 text-[15px]"
              style={{ color: ON_PHOTO_ACCENT }}
            >
              View full plan
              <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </>
        ) : (
          /* NO SESSION TODAY, which is a real state with three real causes: no
             active goal at all, a date outside the plan's span, or a plan that
             simply holds nothing for this day. NO TILE ROW IS DRAWN — absence
             carries its reason in words, and an empty row of tiles does not.
             The two sentences are lifted verbatim from `Today.tsx` so the hub
             and the page it opens cannot phrase the same fact differently. */
          <>
            <h2 className="display mt-2 text-[34px] leading-[1.04]">
              {hasGoal ? "Nothing planned today" : "Name the mountain"}
            </h2>
            <p
              className="mt-2 text-[14px] leading-relaxed"
              style={{ color: "rgba(255,255,255,0.80)" }}
            >
              {hasGoal
                ? "There is no session in your plan for today. Anything you record still counts."
                : "The plan, the fuelling and the coach all follow an objective. Set one and today has a step."}
            </p>
            <Link
              to={hasGoal ? "/activity/select" : "/goals"}
              className="mt-4 inline-flex items-center gap-1.5 text-[15px]"
              style={{ color: ON_PHOTO_ACCENT }}
            >
              {hasGoal ? "Record a session" : "Set an objective"}
              <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The cards                                                                   */
/* -------------------------------------------------------------------------- */

function GridCard({ card }: { card: HubCard }) {
  const Icon = card.icon;
  const onPhoto = Boolean(card.photo);

  return (
    <Link
      to={card.to}
      className="relative flex aspect-[10/11] flex-col justify-end overflow-hidden rounded-[24px] p-4 transition-transform active:scale-[0.985]"
      style={{ backgroundColor: TINT[card.tint] }}
    >
      {card.photo && (
        <>
          <img
            src={card.photo}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
            style={card.photoStyle}
          />
          {/* Text on a photograph is white in BOTH themes and needs its own
              scrim — a photograph does not lighten when the app does. Strong at
              the foot where the words are, nearly clear at the top so the
              picture is still a picture. */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(6,10,20,0.88) 0%, rgba(6,10,20,0.56) 42%, rgba(6,10,20,0.12) 100%)",
            }}
          />
        </>
      )}

      {/* Everything from here down carries `relative`. Drop it from one element
          and that element sits UNDER the scrim and dims. */}
      <div className="relative flex items-center gap-2" style={{ color: ACCENT[card.tint] }}>
        <span
          aria-hidden="true"
          className="grid h-9 w-9 place-items-center rounded-[10px]"
          style={{ backgroundColor: TILE }}
        >
          <Icon size={18} strokeWidth={1.6} />
        </span>
        <ArrowRight
          size={16}
          strokeWidth={1.8}
          aria-hidden="true"
          /* On a photograph the arrow is white; on the tinted Fuel card it takes
             the tint's own ink. White on a pale peach is invisible in the light
             theme, and `text-snow` on a photograph is invisible in it too —
             the token inverts to near-black. Neither shortcut is available. */
          style={{ color: onPhoto ? WHITE : ACCENT[card.tint] }}
        />
      </div>

      {/* `pt-4`, not Explore's `pt-7`, and the four pixels matter. These cards
          are `aspect-[10/11]`, so their height is FIXED by their width — and
          `justify-end` overflows upward when the content does not fit, which
          silently clips the icon chip off the top edge rather than growing the
          card. "Chat with AI Coach" is a two-line title and shipped clipped in
          exactly that way before this was measured at 375pt. The budget, for
          whoever writes the next blurb: about 94px below the icon row, which is
          one title line (22.5px) plus three blurb lines (18.6px each), or two
          title lines plus two blurb lines. Longer copy than that clips. */}
      <p
        className={cn(
          "relative mt-auto pt-4 text-[18px] font-semibold leading-tight",
          !onPhoto && "text-snow",
        )}
        style={onPhoto ? { color: WHITE } : undefined}
      >
        {card.label}
      </p>
      <p
        className={cn("relative mt-1.5 text-[13.5px] leading-snug", !onPhoto && "text-mist")}
        style={onPhoto ? { color: "rgba(255,255,255,0.78)" } : undefined}
      >
        {card.blurb}
      </p>
    </Link>
  );
}

/**
 * The wide card into the plan.
 *
 * `17/10` because the library's frames are around 3:2 and this is the slot
 * whose shape is closest to theirs — the crop here costs about 12% of the
 * height, against the 40% a portrait card takes. Spending that slot on the best
 * photograph in the set is the right trade.
 */
function PlanCard({ weekLine }: { weekLine: string | null }) {
  return (
    <Link
      to="/coach/plan"
      className="relative flex aspect-[17/10] flex-col justify-end overflow-hidden rounded-[24px] p-5 transition-transform active:scale-[0.985]"
      style={{ backgroundColor: PHOTO_GROUND }}
    >
      {/* "Denali, Denali National Park and Preserve.jpg" by NPS Photo / Emily
          Mesner — Public domain (a US National Park Service photograph). A long
          valley at alpenglow for a long plan. `45%` on Y trims a little of the
          dusk cloud and a little of the tundra and keeps the range, the lake and
          the road — very nearly the whole frame. */}
      <img
        src="/img/denali.jpg"
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "50% 45%" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(6,10,20,0.90) 0%, rgba(6,10,20,0.58) 46%, rgba(6,10,20,0.14) 100%)",
        }}
      />

      <div className="relative flex items-end justify-between gap-4">
        <div className="min-w-0">
          <span
            aria-hidden="true"
            className="mb-3 grid h-9 w-9 place-items-center rounded-[10px]"
            style={{ backgroundColor: TILE, color: ACCENT.blue }}
          >
            <MountainSnow size={18} strokeWidth={1.6} />
          </span>
          <p className="text-[19px] font-semibold leading-tight" style={{ color: WHITE }}>
            Plan
          </p>
          <p
            className="mt-1.5 text-[13.5px] leading-snug"
            style={{ color: "rgba(255,255,255,0.78)" }}
          >
            Your long-term training plan and expedition preparation.
          </p>
          {/* Only when a plan exists. With no objective there is no plan and no
              week, and a card face is the wrong place to explain that — the
              page behind it does, in full. */}
          {weekLine && (
            <p className="tnum mt-2 text-[12.5px]" style={{ color: "rgba(255,255,255,0.62)" }}>
              {weekLine}
            </p>
          )}
        </div>
        <span
          aria-hidden="true"
          className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full border"
          style={{ borderColor: "rgba(255,255,255,0.45)", backgroundColor: "rgba(11,20,48,0.45)" }}
        >
          <ArrowRight size={18} strokeWidth={1.8} style={{ color: WHITE }} />
        </span>
      </div>
    </Link>
  );
}
