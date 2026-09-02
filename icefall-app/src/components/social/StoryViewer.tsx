import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { ChevronRight, Heart, Pause, Send, X } from "lucide-react";
import { Avatar } from "@/components/ui/primitives";
import { agoLabel } from "@/social/community";
import { storyTimeLeft, type Story } from "@/social/types";
import { cn } from "@/lib/utils";
import {
  STORIES_FOLLOWING_NOTICE,
  STORY_DURATION_MS,
  markStorySeen,
  storyAgeHours,
  useStories,
  type PromotedPlacement,
} from "./StoryRail";

/**
 * STORIES — the full-screen viewer.
 *
 * Tap the right side to advance, the left to go back, hold to pause, swipe down
 * to dismiss; segment bars across the top; the slide advances itself on a timer.
 * The interaction is Instagram's because it is the one every athlete already
 * knows, and a story viewer that behaves differently is not clever, it is
 * broken.
 *
 * ── THREE THINGS THAT ARE NOT DECORATION ─────────────────────────────────────
 *
 * KEYBOARD. Arrow keys move, Escape leaves, Space pauses. The tap zones are
 * real buttons with real labels underneath the gesture layer, so this is
 * operable without a touchscreen rather than operable-in-theory.
 *
 * REDUCED MOTION. `prefers-reduced-motion` turns the timer OFF entirely — the
 * run does not advance itself at all, and the viewer says so. A five-second
 * auto-advance is exactly the involuntary movement that preference asks for
 * less of, and slowing it down would not have answered the request.
 *
 * PROMOTED SLIDES CARRY THE WORD. A promotion is drawn by `PromotedSlideView` and
 * nothing else can draw one, so the badge cannot be forgotten by an edit to a
 * shared component: the branch that renders the advertisement is the branch
 * that renders the label. See the union in `StoryRail.tsx`, which is shaped
 * that way for the same reason `promoted_placements` is its own table.
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

export function StoryViewer({
  startIndex,
  onClose,
}: {
  startIndex: number;
  onClose(): void;
}): React.JSX.Element {
  const { slides, demo } = useStories();
  const reduce = useReducedMotion();
  const root = viewerRoot();

  const last = slides.length - 1;
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, last)));
  const [paused, setPaused] = useState(false);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);
  /** Milliseconds this slide has already spent on screen, so a pause resumes. */
  const elapsed = useRef(0);
  const y = useMotionValue(0);
  /** The paused BADGE, delayed. See the effect below — this is not the timer. */
  const [holding, setHolding] = useState(false);

  const slide = slides[index];

  const goTo = useCallback((next: number) => {
    elapsed.current = 0;
    setIndex(next);
  }, []);

  const advance = useCallback(() => {
    // Past the last slide the run is over. Closing is the honest end — there is
    // no next person, and looping would manufacture one.
    if (index >= last) onClose();
    else goTo(index + 1);
  }, [index, last, onClose, goTo]);

  const rewind = useCallback(() => {
    // At the first slide, back restarts it rather than closing. Closing on a
    // mis-tap at the start is the single most annoying story-viewer bug there is.
    goTo(Math.max(0, index - 1));
  }, [index, goTo]);

  /* ---- Seen ------------------------------------------------------------- */

  useEffect(() => {
    if (slide?.kind === "story") markStorySeen(slide.story.id);
  }, [slide]);

  /* ---- The timer -------------------------------------------------------- */

  /*
   * A frame loop rather than a `setInterval` that re-renders: the bar is
   * written straight onto the element's transform, so a slide costs one React
   * render instead of sixty a second. `elapsed` survives a pause, which is what
   * makes hold-then-release resume where it stopped rather than start again.
   */
  useEffect(() => {
    if (reduce || paused || !slide) return;
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
  }, [index, paused, reduce, slide, advance]);

  /*
   * The timer stops on contact; the BADGE waits a moment.
   *
   * Pausing the instant a finger lands is right — a story that keeps running
   * under a held thumb feels broken. Showing "Paused" that fast is not: every
   * ordinary tap to advance is a press, so the pill flashed on and off on each
   * one. The pause is immediate, the announcement of it is not.
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
  // a screen reader lands inside it rather than on whatever was behind.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  /* ---- Gestures --------------------------------------------------------- */

  /*
   * One pointer handler on the container, not two on the zones.
   *
   * The zones stay real `<button>`s — they are what a keyboard and a screen
   * reader use — but the press is measured here, because a press is three
   * different things depending on how long and how far it went: a tap, a hold,
   * or a drag. `suppress` is what stops the click that follows a hold or a drag
   * from also advancing the story, which is the bug every hand-rolled version
   * of this ships with.
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
    // Pause on contact, the way a finger on a story does — not after a delay,
    // which reads as the app ignoring the first fifth of a second.
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
    // Downward only. A story dragged upwards would be reaching for a "swipe up
    // for more" that does not exist here.
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
   * Guarded on `active`, and the guard is the point.
   *
   * `onPointerLeave` also fires when the cursor merely crosses out of the phone
   * frame with no button down. Without this check that would call `endPress`
   * and un-pause — so a viewer deliberately paused with the space bar would
   * start running again because the mouse drifted, which is the opposite of
   * what was asked for.
   */
  const onPointerCancel = () => {
    if (!press.current.active) return;
    suppress.current = true;
    endPress(false);
  };

  /**
   * The promoted slide's one link, held to the same rule as the tap zones: a
   * press that turned into a drag or a hold is not a decision to leave the app
   * for an advertiser. An accidental click-through is somebody else's revenue
   * and this athlete's mistake.
   */
  const onFollowLink = useCallback(
    (e: React.MouseEvent) => {
      if (suppress.current) {
        e.preventDefault();
        return;
      }
      onClose();
    },
    [onClose],
  );

  /* ---- Nothing to show -------------------------------------------------- */

  // Opened against an empty run — the rail should never allow it, but a stale
  // index after the last story expires would. Leave rather than draw a blank.
  useEffect(() => {
    if (slides.length === 0) onClose();
  }, [slides.length, onClose]);

  const progress = useMemo(() => slides.map((_, i) => i), [slides]);

  if (root === null || !slide) return <></>;

  return createPortal(
    <motion.div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Stories"
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
      <div className="absolute inset-0">
        {slide.kind === "promoted" ? (
          <PromotedSlideView promo={slide.placement} demo={demo} onFollowLink={onFollowLink} />
        ) : (
          <StorySlideView story={slide.story} />
        )}
      </div>

      {/* ---- Tap zones ----------------------------------------------------
          Under the chrome, over the slide. They are buttons so that a keyboard
          and a screen reader have something to reach; the pointer handling
          above decides whether their click was actually a tap. */}
      <button
        type="button"
        aria-label="Previous story"
        onClick={() => {
          if (suppress.current) return;
          rewind();
        }}
        className="absolute inset-y-0 left-0 z-10 cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-azure/60"
        style={{ width: `${BACK_ZONE * 100}%` }}
      />
      <button
        type="button"
        aria-label="Next story"
        onClick={() => {
          if (suppress.current) return;
          advance();
        }}
        className="absolute inset-y-0 right-0 z-10 cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-azure/60"
        style={{ width: `${(1 - BACK_ZONE) * 100}%` }}
      />

      {/* ---- Progress + close --------------------------------------------- */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3"
        style={{ paddingTop: "calc(0.65rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-center gap-1">
          {progress.map((i) => (
            <span key={i} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/25">
              {/*
                THE KEY CHANGES WHEN A BAR STOPS BEING THE CURRENT ONE, and
                that is load-bearing rather than tidy.

                The frame loop writes `transform` straight onto this element,
                behind React's back. React only touches a DOM style it sees
                change between renders — so on going BACK a slide, the bar being
                left behind kept whatever fraction the loop had last written to
                it (its React-side value never moved off `scaleX(0)`), and the
                run showed a half-filled bar for a story nobody was watching.
                Re-keying remounts it, which is the one thing that reliably
                discards a value React never knew about.
              */}
              <span
                key={i === index ? "active" : "static"}
                ref={i === index ? barRef : undefined}
                className="block h-full w-full origin-left rounded-full bg-snow"
                style={{
                  // Past slides are full, future ones empty. The current one is
                  // driven by the frame loop — except under reduced motion,
                  // where nothing advances on its own and a partly-filled bar
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
            aria-label="Close stories"
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-obsidian/60 text-snow backdrop-blur transition-colors hover:bg-obsidian/80"
          >
            <X size={17} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* ---- Reply bar -----------------------------------------------------
          The owner's 1:1 mockup draws "Send message…", a heart and a send
          button along the bottom. It is drawn here and it does not work, and
          the reason is printed BESIDE IT rather than only in this comment.

          WHY IT IS INERT. The server could take it: `threads_insert`,
          `thread_participants_insert` and `messages_insert` all exist and are
          granted, so one climber genuinely can open a thread with another. The
          phone app is what is missing — `screens/chat/useConversations.ts`
          reads DEMO_CONVERSATIONS and never touches those tables. So this is a
          WIRING gap, not a hole in the schema, and the copy says exactly that:
          "not connected yet" will stop being true when somebody wires it,
          where "nowhere to send this" would simply be false.

          THE INPUT IS `readOnly`, NOT A DEAD BOX. A field that accepts typing
          and then loses it is worse than one that refuses it, because the
          person finds out only after writing something they meant.

          IF YOU ARE HERE TO "FINISH" THIS: wire `useConversations` to threads
          first. Making the button send before that gives it somewhere to POST
          and nowhere to be read. */}
      {/* ---- Footnotes -----------------------------------------------------
          The two things the athlete would otherwise have to guess: that this is
          not filtered by who they follow, and that the run does not advance by
          itself on a device asking for reduced motion. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-obsidian via-obsidian/85 to-transparent px-5 pt-8"
        style={{ paddingBottom: "calc(0.85rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* STACKED, NOT POSITIONED. The bar first sat in its own absolute box
            at a fixed offset and overlapped these notes by 43px — the notes
            grow by a line on a reduced-motion device, so no offset is right for
            every case. Sharing one container makes the overlap impossible. */}
        <div className="pointer-events-auto mb-3">
        <div className="flex items-center gap-3">
          <input
            readOnly
            value=""
            placeholder="Send message…"
            aria-label="Reply to this story — messaging is not connected yet"
            title="Messaging is not connected yet"
            className="h-11 min-w-0 flex-1 cursor-not-allowed rounded-pill border border-hairline bg-obsidian/60 px-4 text-[13.5px] text-mist-dim outline-none backdrop-blur placeholder:text-mist-dim"
          />
          <button
            type="button"
            disabled
            aria-label="Like this story — messaging is not connected yet"
            className="shrink-0 text-mist-dim/60"
          >
            <Heart size={20} strokeWidth={1.7} aria-hidden />
          </button>
          <button
            type="button"
            disabled
            aria-label="Send — messaging is not connected yet"
            className="shrink-0 text-mist-dim/60"
          >
            <Send size={20} strokeWidth={1.7} aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-mist-dim">
          Replies are not connected yet — nothing typed here would reach anyone.
        </p>
        </div>

        {reduce && (
          <p className="text-[10.5px] leading-relaxed text-mist">
            Auto-advance is off because this device asks for reduced motion. Tap the right side, or
            use the arrow keys.
          </p>
        )}
        <p className={cn("text-[10px] leading-relaxed text-mist-dim", reduce && "mt-1")}>
          {demo
            ? `Demo content — nobody has posted a story, and these people, times and figures were written by ICEFALL. ${STORIES_FOLLOWING_NOTICE}`
            : STORIES_FOLLOWING_NOTICE}
        </p>
      </div>
    </motion.div>,
    root,
  );
}

/* -------------------------------------------------------------------------- */
/* A person's story                                                           */
/* -------------------------------------------------------------------------- */

/**
 * One person's story.
 *
 * The card carries the row and nothing beside it: `body`, the author's own
 * details, when it was posted and when it ends. There is no kind chip, no
 * objective and no figures, because `posts` has no column for any of them —
 * see the four rules at the head of `@/social/types`.
 */
function StorySlideView({ story }: { story: Story }) {
  const ageHours = storyAgeHours(story);
  const endsIn = storyTimeLeft(story);

  return (
    <div className="relative h-full w-full">
      {story.media?.url ? (
        <>
          <img
            src={story.media.url}
            alt=""
            aria-hidden
            draggable={false}
            className="h-full w-full object-cover"
          />
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
          <p className="truncate text-[13.5px] text-snow">{story.author.name}</p>
          {/* A label somebody typed, and only if they typed one. `Author` holds
              no coordinate to leak, and an absent location renders as nothing
              rather than as "Unknown". */}
          {story.author.location && (
            <p className="truncate text-[11px] text-mist">{story.author.location}</p>
          )}
        </div>
        {/* Posted, and when it ends — both read off the row. The second half is
            the whole difference between a story and a post, so it is said out
            loud rather than left for the reader to assume. */}
        <span className="tnum shrink-0 text-right text-[11px] text-mist">
          {agoLabel(ageHours)}
          {endsIn && endsIn !== "ended" && (
            <span className="block text-[10px] text-mist-dim">{endsIn}</span>
          )}
        </span>
      </div>

      {/* `posts.body` is one column and it is rendered as one block. The demo
          model's title/body split is joined with a newline upstream, so the
          line breaks the author wrote are the line breaks that show. */}
      <div /* 5.5rem cleared the footnotes alone. The reply bar now sits above them
             in the same stack, so the slide's own words need the taller
             clearance or they run behind it — measured at ~172px of footer. */
          className="absolute inset-x-0 bottom-0 px-5 pb-[11.5rem]">
        <p className="whitespace-pre-line text-[15px] font-light leading-relaxed text-snow">
          {story.body}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A promoted slide                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The one paid thing in the run, and it says so twice.
 *
 * A badge at the top, where a story's byline would be, and a sentence at the
 * bottom naming who paid and stating that ICEFALL has not endorsed them.
 * Neither is optional and neither is behind a flag: an advertisement a reader
 * has to work out is an advertisement is a dishonest one, and this is a product
 * that charges people for honesty.
 *
 * `audience_mode` is reported rather than hidden. "General" means nothing about
 * this athlete chose it; "targeted" means an objective they DECLARED did —
 * their own words, never an inference, which is the rule the schema carries.
 */
function PromotedSlideView({
  promo,
  demo,
  onFollowLink,
}: {
  promo: PromotedPlacement;
  demo: boolean;
  onFollowLink(e: React.MouseEvent): void;
}) {
  return (
    <div className="relative h-full w-full">
      {promo.creativePath ? (
        <>
          <img
            src={promo.creativePath}
            alt=""
            aria-hidden
            draggable={false}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-obsidian/75 via-obsidian/25 to-obsidian/90" />
        </>
      ) : (
        <div className="h-full w-full bg-graphite" />
      )}

      <div
        className="absolute inset-x-0 top-0 px-5"
        style={{ paddingTop: "calc(3.2rem + env(safe-area-inset-top, 0px))" }}
      >
        <span className="inline-flex items-center rounded-pill border border-hairline-strong bg-obsidian/75 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-snow backdrop-blur">
          Promoted
        </span>
      </div>

      <div /* 5.5rem cleared the footnotes alone. The reply bar now sits above them
             in the same stack, so the slide's own words need the taller
             clearance or they run behind it — measured at ~172px of footer. */
          className="absolute inset-x-0 bottom-0 px-5 pb-[11.5rem]">
        <p className="text-[11px] uppercase tracking-[0.1em] text-mist">{promo.companyName}</p>
        <p className="mt-1.5 text-[16px] font-light leading-snug text-snow">{promo.headline}</p>

        {promo.href && (
          <Link
            to={promo.href}
            onClick={onFollowLink}
            className="relative z-20 mt-3 inline-flex items-center gap-1 rounded-pill border border-azure/50 px-3.5 py-1.5 text-[12px] text-azure transition-colors hover:bg-azure/10"
          >
            View company
            <ChevronRight size={14} strokeWidth={1.8} />
          </Link>
        )}

        <p className="mt-3 text-[10.5px] leading-relaxed text-mist-dim">
          Paid placement by {promo.companyName}. ICEFALL does not endorse it, does not vet it, and
          takes no part in anything you book.{" "}
          {promo.audienceMode === "targeted"
            ? "You are seeing it because of an objective you set yourself — nothing was inferred about you."
            : "Nothing about you was used to choose it."}
        </p>
        {demo && (
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-mist-dim">
            Nobody has bought this. The company is invented, the picture is ICEFALL's own, and
            campaigns need an account nobody has — this shows what a promoted story looks like.
          </p>
        )}
      </div>
    </div>
  );
}
