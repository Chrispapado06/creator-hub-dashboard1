import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { Pause, X } from "lucide-react";

import { Avatar } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isStory } from "@/social/types";
import {
  HIGHLIGHTS_DEMO_NOTICE,
  useHighlightStories,
  useHighlights,
  type HighlightStory,
} from "@/social/highlights";
import { STORY_DURATION_MS, markStorySeen } from "./StoryRail";

/**
 * HIGHLIGHTS — playing one.
 *
 * Tapping a circle on a profile opens the stories kept in it and plays them
 * exactly the way a story plays: tap right to advance, left to go back, hold to
 * pause, swipe down to leave, one segment bar per slide, arrow keys and Escape.
 * That interaction is not a choice — it is the one every athlete already knows,
 * and a highlight that behaved differently from a story would read as broken.
 *
 * ── WHY THIS IS NOT `StoryViewer` WITH A PROP ────────────────────────────────
 *
 * `StoryViewer` takes `{ startIndex, onClose }` and gets its slides from
 * `useStories()` — the following run, promotions interleaved, seen-state and
 * all. It has NO way to be handed a different list, so reusing it here would
 * mean adding a slides prop to a file another session owns today, and every
 * outcome of that is worse than this one: a merge conflict at best, at worst a
 * shared component quietly changed underneath the surface that depends on it.
 * So this is a second viewer in the same idiom, and it stays a THIN one — the
 * gesture constants, the frame-driven bar and the re-key trick below are
 * `StoryViewer`'s, repeated because they are not exported, not reinvented. If
 * the two ever start to feel different in the hand, this comment is where to
 * look first.
 *
 * ── THREE THINGS THIS VIEWER DELIBERATELY DOES NOT DO ────────────────────────
 *
 * NO COUNTDOWN. `storyTimeLeft` is not called anywhere in this file, and that
 * is the single most important line in it. A story in a highlight DOES NOT END
 * — membership is exactly what the amended `posts_select` reads to keep it
 * publicly readable (20260902170000) — so printing "ends in 7h" on a slide
 * someone has kept would be a promise the database has already stopped making.
 * The date it was posted is shown instead, as a date: these are months old by
 * definition, and "118d ago" is arithmetic the reader has to undo.
 *
 * NO PROMOTED SLIDES. A highlight is one person's own shelf and nothing is
 * interleaved into it. `promoted_placements` buys a slot in the story RUN; it
 * does not buy a slot inside somebody's Everest.
 *
 * NO REPLY BAR. `StoryViewer` draws one because the owner's mockup draws one,
 * and it is inert and says so — messaging is not wired in the phone app yet.
 * Copying an inert control onto a second surface doubles the dead affordances
 * and adds nothing. When messaging lands it can arrive here too.
 */

/** Below this, a press is a tap. Above it, it was a hold, and a hold pauses. */
const TAP_MS = 220;
/** Movement past this in a press means it was a drag, not a tap. */
const DRAG_SLOP_PX = 8;
/** How far down the viewer must be pulled to dismiss it. */
const DISMISS_PX = 110;
/** The left slice is "back". The rest advances — Instagram's proportions. */
const BACK_ZONE = 0.33;

function viewerRoot(): Element | null {
  if (typeof document === "undefined") return null;
  return document.querySelector("[data-phone-shell]") ?? document.body;
}

/**
 * The highlight's name, matched by id — never derived from one.
 *
 * The contract is `{ highlightId, onClose }`, so the name has to be looked up,
 * and `useHighlights` is a list for one PROFILE rather than a read of one row.
 * Whose profile is answered by the slides themselves: `highlight_items_insert`
 * requires the post and the highlight to both belong to the caller, so every
 * story in a highlight was written by the person who keeps it, and the first
 * slide's byline is the owner.
 *
 * Before the slides arrive `ownerId` is undefined and the hook reads the
 * SIGNED-IN athlete's own list, which is the common case anyway — the row of
 * circles is on a profile, and most of the time it is your own. The match is on
 * `id`, so the wrong list cannot supply a wrong name; it can only fail to
 * match, and a name that has not been found is not drawn. That is also why this
 * returns `null` rather than a fallback: "Highlight" in place of "Everest"
 * would be this app inventing a label for a column it can read.
 */
function useHighlightName(highlightId: string, stories: HighlightStory[]): string | null {
  const ownerId = stories[0]?.story.author.id;
  const { highlights } = useHighlights(ownerId);
  return highlights.find((h) => h.id === highlightId)?.name ?? null;
}

export function HighlightViewer({
  highlightId,
  onClose,
}: {
  highlightId: string;
  onClose(): void;
}): JSX.Element {
  const { stories, loading, error, demo } = useHighlightStories(highlightId);
  const name = useHighlightName(highlightId, stories);
  const reduce = useReducedMotion();
  const root = viewerRoot();

  const last = stories.length - 1;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);
  /** Milliseconds this slide has already spent on screen, so a pause resumes. */
  const elapsed = useRef(0);
  const y = useMotionValue(0);
  /** The paused BADGE, delayed — see the effect below. This is not the timer. */
  const [holding, setHolding] = useState(false);

  const item = stories[index];

  const goTo = useCallback((next: number) => {
    elapsed.current = 0;
    setIndex(next);
  }, []);

  const advance = useCallback(() => {
    /* Nothing loaded yet is not the end of the run. The tap zones are not drawn
       until there is a slide, but the KEYBOARD is live the whole time, so
       without this an arrow key pressed while the read is still out would close
       a highlight that was about to appear. */
    if (last < 0) return;
    // Past the last slide the highlight is finished. It closes rather than
    // looping: a shelf that starts itself again is one nobody can get out of by
    // tapping, which is the gesture they are already using.
    if (index >= last) onClose();
    else goTo(index + 1);
  }, [index, last, onClose, goTo]);

  const rewind = useCallback(() => {
    if (last < 0) return;
    // At the first slide, back restarts it rather than closing — a mis-tap on
    // the left edge at the start must not end the run.
    goTo(Math.max(0, index - 1));
  }, [index, last, goTo]);

  /* ---- Seen --------------------------------------------------------------
     A story watched here is a story watched. Most of these are long expired and
     will never appear on the rail again, so this usually records nothing that
     is ever read — but a story can be kept while it is STILL RUNNING, and for
     that one the rail's azure ring would otherwise go on claiming "you have not
     seen this" to somebody who just did. */
  useEffect(() => {
    if (item && isStory(item.story)) markStorySeen(item.story.id);
  }, [item]);

  /* ---- The timer -------------------------------------------------------- */

  /*
   * A frame loop rather than a re-rendering interval: the bar is written
   * straight onto the element's transform, so a slide costs one React render
   * instead of sixty a second. `elapsed` survives a pause, which is what makes
   * hold-then-release resume where it stopped instead of starting again.
   */
  useEffect(() => {
    if (reduce || paused || !item) return;
    let raf = 0;
    const startedAt = performance.now() - elapsed.current;
    const tick = (now: number) => {
      const ms = now - startedAt;
      elapsed.current = ms;
      const pct = Math.min(1, ms / STORY_DURATION_MS);
      if (barRef.current) barRef.current.style.transform = `scaleX(${pct})`;
      if (pct >= 1) {
        advance();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, paused, reduce, item, advance]);

  /*
   * The timer stops on contact; the BADGE waits a moment. Pausing the instant a
   * finger lands is right; announcing it that fast is not, because every
   * ordinary tap to advance is a press and the pill flashed on each one.
   */
  useEffect(() => {
    if (!paused) {
      setHolding(false);
      return;
    }
    const t = setTimeout(() => setHolding(true), 260);
    return () => clearTimeout(t);
  }, [paused]);

  /* ---- Keyboard --------------------------------------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") advance();
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") rewind();
      else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setPaused((p) => !p);
      } else return;
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [advance, rewind, onClose]);

  // Focus the dialog itself so the arrow keys work the moment it opens, and so
  // a screen reader lands inside it rather than on the profile behind.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  /*
   * A shorter highlight opened while a longer one is still on screen would
   * leave `index` past the end — the caller swaps `highlightId` on the same
   * mounted component, so nothing else resets it.
   */
  useEffect(() => {
    elapsed.current = 0;
    setIndex(0);
  }, [highlightId]);

  /* ---- Gestures --------------------------------------------------------- */

  /*
   * One pointer handler on the container, not two on the zones. The zones stay
   * real buttons — they are what a keyboard and a screen reader use — but the
   * press is measured here, because a press is three different things depending
   * on how long and how far it went. `suppress` is what stops the click that
   * follows a hold or a drag from also advancing the run.
   */
  const press = useRef({ active: false, x: 0, y: 0, at: 0, axis: null as null | "x" | "y" });
  const suppress = useRef(false);

  const endPress = useCallback(
    (dismissed: boolean) => {
      press.current.active = false;
      setPaused(false);
      if (!dismissed) animate(y, 0, { type: "spring", stiffness: 520, damping: 42 });
    },
    [y],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    press.current = { active: true, x: e.clientX, y: e.clientY, at: performance.now(), axis: null };
    suppress.current = false;
    setPaused(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p.active) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (p.axis === null && Math.abs(dx) + Math.abs(dy) > DRAG_SLOP_PX) {
      p.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
      suppress.current = true;
    }
    // Downward only. Dragging a highlight upwards would be reaching for a
    // "swipe up for more" that does not exist here either.
    if (p.axis === "y" && dy > 0) y.set(dy);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p.active) return;
    const dy = e.clientY - p.y;
    const held = performance.now() - p.at;

    if (p.axis === "y" && dy > DISMISS_PX) {
      endPress(true);
      onClose();
      return;
    }
    if (held >= TAP_MS) suppress.current = true;
    endPress(false);
  };

  /*
   * Guarded on `active`, and the guard is the point: `onPointerLeave` also
   * fires when the cursor merely crosses out of the phone frame with no button
   * down, which would un-pause a run somebody paused with the space bar.
   */
  const onPointerCancel = () => {
    if (!press.current.active) return;
    suppress.current = true;
    endPress(false);
  };

  if (root === null) return <></>;

  /*
   * WHAT AN EMPTY HIGHLIGHT IS HERE, AND WHY IT IS NOT AUTO-CLOSED.
   *
   * `StoryViewer` leaves immediately on an empty run, because there the only
   * way to reach one is a stale index into a rail that should never have
   * offered it. An empty highlight is a REAL, REACHABLE state: the migration
   * requires a highlight to be created before anything can be put in it, so a
   * person who named one and stopped has exactly this. Closing on the spot
   * would look like the tap did nothing, so the reason is said instead.
   *
   * The three absences are kept apart on purpose. `error` is the module's own
   * sentence for a read that could not be made or did not come back — never
   * softened into "nothing kept", because those are different facts and only
   * one of them is something ICEFALL knows.
   */
  const message = loading
    ? null
    : error
      ? error
      : stories.length === 0
        ? "Nothing is kept in this highlight yet. It has a name and no stories in it — which is how one starts."
        : null;

  return createPortal(
    <motion.div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={name ? `Highlight — ${name}` : "Highlight"}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : 0.18 }}
      style={{ y, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerCancel}
      className="absolute inset-0 z-50 select-none overflow-hidden bg-obsidian outline-none"
    >
      {/* ---- The slide ---------------------------------------------------- */}
      {item ? (
        <div className="absolute inset-0">
          <HighlightSlideView item={item} name={name} />
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center px-8">
          {message ? (
            <p className="max-w-[19rem] text-center text-[13px] leading-relaxed text-mist">
              {message}
            </p>
          ) : (
            /* Loading. Nothing is drawn and nothing is claimed — a skeleton
               circle here would be a picture of a story that may not exist. */
            <span className="sr-only">Loading this highlight</span>
          )}
        </div>
      )}

      {/* ---- Tap zones -----------------------------------------------------
          Under the chrome, over the slide. Buttons so a keyboard and a screen
          reader have something to reach; the pointer handling above decides
          whether their click was actually a tap. Absent when there is nothing
          to advance THROUGH — an invisible button over a sentence explaining an
          empty highlight is a control that does nothing. */}
      {item && (
        <>
          <button
            type="button"
            aria-label="Previous story in this highlight"
            onClick={() => {
              if (suppress.current) return;
              rewind();
            }}
            className="absolute inset-y-0 left-0 z-10 cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-azure/60"
            style={{ width: `${BACK_ZONE * 100}%` }}
          />
          <button
            type="button"
            aria-label="Next story in this highlight"
            onClick={() => {
              if (suppress.current) return;
              advance();
            }}
            className="absolute inset-y-0 right-0 z-10 cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-azure/60"
            style={{ width: `${(1 - BACK_ZONE) * 100}%` }}
          />
        </>
      )}

      {/* ---- Progress + close --------------------------------------------- */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3"
        style={{ paddingTop: "calc(0.65rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-center gap-1">
          {stories.map((_, i) => (
            <span key={i} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/25">
              {/* THE KEY CHANGES WHEN A BAR STOPS BEING THE CURRENT ONE, and it
                  is load-bearing rather than tidy: the frame loop writes
                  `transform` behind React's back, so on going back a slide the
                  bar left behind kept whatever fraction was last written to it.
                  Re-keying remounts it, which is the one thing that reliably
                  discards a value React never knew about. `StoryViewer` carries
                  the same note and the bug that produced it. */}
              <span
                key={i === index ? "active" : "static"}
                ref={i === index ? barRef : undefined}
                className="block h-full w-full origin-left rounded-full bg-snow"
                style={{
                  // Past slides full, future ones empty; the current one is
                  // driven by the frame loop — except under reduced motion,
                  // where nothing advances on its own and a part-filled bar
                  // would be a progress claim about a timer that is not running.
                  transform: `scaleX(${i < index || (i === index && reduce) ? 1 : 0})`,
                }}
              />
            </span>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-end gap-2">
          {holding && (
            <span className="pointer-events-none flex items-center gap-1 rounded-pill bg-obsidian/70 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-mist backdrop-blur">
              <Pause size={10} strokeWidth={2} />
              Paused
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close this highlight"
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-obsidian/60 text-snow backdrop-blur transition-colors hover:bg-obsidian/80"
          >
            <X size={17} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* ---- Footnotes ------------------------------------------------------
          What the athlete would otherwise have to work out for themselves. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-obsidian via-obsidian/85 to-transparent px-5 pt-8"
        style={{ paddingBottom: "calc(0.85rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {reduce && item && (
          <p className="text-[10.5px] leading-relaxed text-mist">
            Auto-advance is off because this device asks for reduced motion. Tap the right side, or
            use the arrow keys.
          </p>
        )}
        {demo && (
          <p className={cn("text-[10px] leading-relaxed text-mist-dim", reduce && item && "mt-1")}>
            {HIGHLIGHTS_DEMO_NOTICE}
          </p>
        )}
      </div>
    </motion.div>,
    root,
  );
}

/* -------------------------------------------------------------------------- */
/* One kept story                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The slide carries the `posts` row and nothing beside it: the words, the
 * author's own details, and the day it was posted. There is no kind chip, no
 * objective and no figures, because the table has no column for any of them —
 * the four rules at the head of `@/social/types`.
 */
function HighlightSlideView({ item, name }: { item: HighlightStory; name: string | null }) {
  const { story } = item;
  const video = story.media?.kind === "video";

  return (
    <div className="relative h-full w-full">
      {story.media?.url ? (
        <>
          {video ? (
            /* An `<img>` pointed at an mp4 is an empty black frame, so a clip
               gets the element that can actually show it. THE BAR MEASURES THE
               SLIDE, NOT THE CLIP: a video longer than one slide is cut off at
               the same five seconds everything else gets. Nothing can hit this
               yet — `Composer.tsx` still has no bucket, so no post has media at
               all — and the day one does, this is the place to drive the bar
               off the element's own duration instead. */
            <video
              src={story.media.url}
              autoPlay
              muted
              playsInline
              aria-hidden
              className="h-full w-full object-cover"
            />
          ) : (
            <img
              src={story.media.url}
              alt=""
              aria-hidden
              draggable={false}
              className="h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-obsidian/70 via-transparent to-obsidian/80" />
        </>
      ) : (
        /* No photograph, and none is borrowed to fill the frame. A written
           story is set as type on the app's own surface instead. */
        <div className="h-full w-full bg-graphite" />
      )}

      <div
        className="absolute inset-x-0 top-0 flex items-center gap-3 px-5"
        style={{ paddingTop: "calc(3.2rem + env(safe-area-inset-top, 0px))" }}
      >
        {story.author.avatarUrl ? (
          <img
            src={story.author.avatarUrl}
            alt=""
            aria-hidden
            draggable={false}
            className="h-9 w-9 shrink-0 rounded-full border border-hairline object-cover"
          />
        ) : (
          <Avatar name={story.author.name} size={36} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] text-snow">
            {story.author.name}
            {/* The shelf this slide came off, when the name has actually been
                read. Absent rather than guessed — see `useHighlightName`. */}
            {name && <span className="text-mist"> · {name}</span>}
          </p>
          {/* A label somebody typed, and only if they typed one. `Author` holds
              no coordinate to leak, and an absent location renders as nothing
              rather than as "Unknown". */}
          {story.author.location && (
            <p className="truncate text-[11px] text-mist">{story.author.location}</p>
          )}
        </div>
        {/* THE DAY IT WAS POSTED, not the day it was kept and not a countdown.
            `addedAt` is when somebody filed it, which is not when they lived it,
            and a highlighted story has no time left to run — see the header. */}
        <span className="tnum shrink-0 text-right text-[11px] text-mist">
          {fmtDate(story.createdAt)}
        </span>
      </div>

      {/* `posts.body` is one column and it is rendered as one block, so the line
          breaks the author wrote are the line breaks that show. The clearance
          is measured against the footnotes alone — this viewer has no reply bar
          above them, which is why it is shorter than `StoryViewer`'s. */}
      <div className="absolute inset-x-0 bottom-0 px-5 pb-[6.5rem]">
        <p className="whitespace-pre-line text-[15px] font-light leading-relaxed text-snow">
          {story.body}
        </p>
      </div>
    </div>
  );
}
