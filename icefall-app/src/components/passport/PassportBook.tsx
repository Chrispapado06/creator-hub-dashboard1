import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, type PanInfo } from "framer-motion";
import { QualifierBadge, UnavailableState } from "@/components/coach/DataState";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PassportCover, TECHNICAL_FAMILY, type PassportBearer } from "./PassportCover";

export type { PassportBearer } from "./PassportCover";

/**
 * The Mountain Passport: its opening animation and its page container.
 *
 * THE INTERIOR IS PAPER, AND THAT IS DELIBERATE
 * ---------------------------------------------
 * ICEFALL is one dark theme everywhere else. The booklet's interior is the one
 * place off-white is allowed, because the contrast against the app IS the
 * effect — opening it should feel like taking a physical document out of a
 * pocket. The paper is warm and never pure white: a pure-white panel on a phone
 * at 4 a.m. in a hut is a torch.
 *
 * HOW THE PAPER RE-INKS SHARED COMPONENTS
 * ---------------------------------------
 * The app's Tailwind theme is `@theme inline`, so `text-mist-dim` compiles to
 * `color: var(--ice-mist-dim)` rather than to a fixed colour. `PassportPage`
 * therefore overrides the `--ice-*` custom properties on the sheet itself, and
 * every shared component rendered inside it — `UnavailableState`,
 * `QualifierBadge`, `.section-label` — re-inks to paper automatically instead of
 * needing a paper-specific fork. There is one absence layer in this app and the
 * passport uses it, rather than inventing a second one that could drift.
 *
 * WHAT THE BOOKLET CLAIMS
 * -----------------------
 * Nothing. ICEFALL has no verification system, so no page may render a tick, a
 * seal, or the word "verified" in the affirmative. The two pages this file owns
 * both say so in as many words: the identity page carries a plain
 * `USER RECORD · UNVERIFIED` status, and the last page is the booklet's
 * conditions, written for the guide or operator who might be handed it. Data
 * pages supplied by the caller sit between them.
 */

/* -------------------------------------------------------------------------- */
/* Paper                                                                       */
/* -------------------------------------------------------------------------- */

const PAPER = "oklch(0.949 0.012 88)";
const PAPER_EDGE = "oklch(0.902 0.020 82)";
const INK = "oklch(0.305 0.013 60)";
const INK_MID = "oklch(0.475 0.013 62)";
const INK_FAINT = "oklch(0.615 0.015 66)";
const RULE = "oklch(0.305 0.013 60 / 13%)";
const RULE_STRONG = "oklch(0.305 0.013 60 / 24%)";
/** The house azure, deepened just enough to hold a contrast ratio on cream. */
const AZURE_ON_PAPER = "oklch(0.4650 0.1580 260.5)";

/**
 * The ink palette, expressed as the app's own tokens.
 *
 * Overriding `--ice-*` rather than passing colours down means a component
 * dropped into a page by any other part of this feature inherits paper ink for
 * free — including the absence and qualifier states, which must look native
 * here or athletes will read them as errors rather than as honest gaps.
 */
const PAPER_TOKENS = {
  "--ice-snow": INK,
  "--ice-mist": INK_MID,
  "--ice-mist-dim": INK_FAINT,
  "--ice-hairline": RULE,
  "--ice-hairline-strong": RULE_STRONG,
  "--ice-azure": AZURE_ON_PAPER,
  "--ice-obsidian": PAPER,
  "--ice-graphite": "oklch(0.926 0.014 86)",
  "--ice-slate": "oklch(0.906 0.016 84)",
  "--ice-elevated": "oklch(0.888 0.018 84)",
  color: INK,
  background:
    `radial-gradient(120% 80% at 50% 0%, oklch(0.972 0.010 90) 0%, transparent 62%),` +
    `radial-gradient(100% 70% at 8% 100%, ${PAPER_EDGE} 0%, transparent 55%),` +
    `radial-gradient(100% 70% at 100% 92%, ${PAPER_EDGE} 0%, transparent 58%),` +
    `linear-gradient(180deg, ${PAPER} 0%, oklch(0.938 0.014 86) 100%)`,
} as React.CSSProperties;

/**
 * One contour ring, repeated at descending scales to suggest a summit on the
 * page without ever depicting a real one. Stroke width is divided by the scale
 * so every ring keeps the same weight, which is how a printed map behaves.
 *
 * The ring is deliberately lopsided — a symmetrical one reads as a target or a
 * ripple rather than as ground — and both clusters are placed to bleed off the
 * edge, so what shows is a fragment of a map rather than a motif centred behind
 * the type. Opacity is set where the paper still reads as paper first.
 */
const CONTOUR =
  "M0 -54C34 -52 56 -26 49 6C42 36 20 57 -10 52C-38 47 -55 22 -49 -8C-43 -37 -25 -56 0 -54Z";
const CONTOUR_STEPS = [1, 0.83, 0.67, 0.52, 0.38, 0.24];

function PaperContours() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 300 426"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
    >
      <g stroke={INK} strokeOpacity={0.055}>
        {CONTOUR_STEPS.map((s) => (
          <path
            key={`a-${s}`}
            d={CONTOUR}
            transform={`translate(296 26) scale(${s})`}
            strokeWidth={0.9 / s}
          />
        ))}
        {CONTOUR_STEPS.slice(1).map((s) => (
          <path
            key={`b-${s}`}
            d={CONTOUR}
            transform={`translate(6 358) scale(${s * 0.8})`}
            strokeWidth={0.9 / (s * 0.8)}
          />
        ))}
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* PassportPage                                                                */
/* -------------------------------------------------------------------------- */

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * One sheet of the booklet: the paper, its texture, its rules, its watermark
 * and its page number. Exported so the rest of the passport feature writes
 * content and never re-implements the chrome.
 *
 * The content well scrolls rather than clipping. A fixed-height booklet is the
 * right object, but a fixed-height booklet that swallows the bottom of a summit
 * log would be a readability failure, and readability outranks fidelity here.
 */
export function PassportPage({
  title,
  pageNumber,
  pageCount,
  children,
  className,
}: {
  title: string;
  pageNumber: number;
  pageCount: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("grain relative h-full w-full overflow-hidden rounded-card", className)}
      style={PAPER_TOKENS}
    >
      <PaperContours />

      {/* Watermark — the maker's mark, not a seal. Faint enough to read as
          paper stock rather than as an endorsement stamped on the page. */}
      <IcefallMark
        className="pointer-events-none absolute -right-4 bottom-8 h-[112px] w-auto -rotate-12"
        style={{ color: INK, opacity: 0.05 }}
      />

      <div className="relative flex h-full flex-col">
        <header className="shrink-0 px-5 pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="section-label text-[9px]">{title}</span>
            <span
              className="text-[8px] uppercase leading-none tracking-[0.28em]"
              style={{ fontFamily: TECHNICAL_FAMILY, color: INK_FAINT }}
            >
              Icefall
            </span>
          </div>
          <div className="mt-2 h-px w-full" style={{ background: RULE_STRONG }} />
        </header>

        <div className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>

        <footer className="shrink-0 px-5 pb-3.5">
          <div className="mb-2 h-px w-full" style={{ background: RULE }} />
          <div className="flex items-center justify-between gap-3">
            <span className="section-label text-[8px]">Mountain Passport</span>
            <span
              className="tnum text-[8px] leading-none tracking-[0.18em]"
              style={{ fontFamily: TECHNICAL_FAMILY, color: INK_FAINT }}
            >
              {pad2(pageNumber)} / {pad2(pageCount)}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small paper parts                                                           */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  value,
  variant = "plain",
}: {
  label: string;
  value: string;
  variant?: "plain" | "display" | "technical";
}) {
  return (
    <div className="min-w-0">
      <p className="section-label text-[8px]">{label}</p>
      <p
        className={cn(
          "mt-1.5 leading-snug text-snow",
          variant === "display" && "display text-[18px] leading-none",
          variant === "technical" && "tnum text-[11px] tracking-[0.12em]",
          variant === "plain" && "text-[12.5px]",
        )}
        style={variant === "technical" ? { fontFamily: TECHNICAL_FAMILY } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function ProvenanceChip({ label, dashed }: { label: string; dashed?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-hairline-strong px-1.5 py-[2px] text-[8px] font-medium uppercase leading-none tracking-[0.12em] text-mist-dim",
        dashed && "border-dashed",
      )}
    >
      {label}
    </span>
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

/* -------------------------------------------------------------------------- */
/* Machine-readable strip                                                      */
/* -------------------------------------------------------------------------- */

/** Characters per line. 40 keeps `NOT VERIFIED` on line two without truncation. */
const MRZ_WIDTH = 40;
/** The strip's drawing box. Only the ratio matters; the SVG scales to the page. */
const MRZ_BOX = 272;

/** Pads a line into the fixed-width, chevron-filled form of a passport strip. */
function mrzLine(parts: string[]): string {
  const body = parts
    .join("<<")
    .toUpperCase()
    .replace(/[^A-Z0-9<]+/g, "<");
  return (body + "<".repeat(MRZ_WIDTH)).slice(0, MRZ_WIDTH);
}

/**
 * The strip along the foot of the identity page.
 *
 * A real passport's machine-readable zone exists so a machine can check the
 * document. Ours cannot be checked by anything, so rather than drop the most
 * recognisable mark of a passport, the strip is made to SAY that: the second
 * line spells out SELF REPORTED and NOT VERIFIED. It is decoration that carries
 * the truth instead of decoration that implies an authority.
 *
 * `aria-hidden` because chevron-padded capitals are unreadable aloud; the
 * sentence above it is the accessible version and says the same thing.
 */
function MachineStrip({ bearer }: { bearer: PassportBearer }) {
  const parts = bearer.name.trim().split(/\s+/).filter(Boolean);
  const family = parts.length > 1 ? parts[parts.length - 1] : parts[0] || "";
  const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : "";

  const lines = [
    mrzLine(["IFMP", family, given]),
    mrzLine([bearer.expeditionId.replace(/-/g, ""), "SELF REPORTED", "NOT VERIFIED"]),
  ];

  return (
    // Pulled out past the page's text margin, so the strip runs nearly edge to
    // edge as a real one does.
    //
    // Set as SVG rather than as text because `textLength` guarantees the fixed
    // field width: the line fits the page exactly on any handset and under any
    // monospace fallback, instead of being clipped on a narrow screen — which,
    // on this particular line, would truncate the words NOT VERIFIED.
    <div
      aria-hidden="true"
      className="-mx-3 mt-2 border-t pt-1.5"
      style={{ borderColor: RULE_STRONG }}
    >
      <svg viewBox={`0 0 ${MRZ_BOX} 24`} className="block w-full" fill={INK_MID}>
        {lines.map((line, i) => (
          <text
            key={line}
            x={0}
            y={10 + i * 12.5}
            textLength={MRZ_BOX}
            lengthAdjust="spacing"
            style={{ fontFamily: TECHNICAL_FAMILY, fontSize: 11 }}
          >
            {line}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Identity page                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Page one. Identity only — who the booklet belongs to and what it is worth.
 *
 * Summits, skills and altitude live on data pages supplied by the caller, so
 * completed ground and intended ground can never be read off the same page.
 */
function IdentityPage({ bearer }: { bearer: PassportBearer }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-4">
        {/* Portrait panel at 35 × 45, the passport photograph proportion.
            ICEFALL holds no photograph and will not fabricate one, so the panel
            carries the bearer's initials and says what is missing. */}
        <div
          className="relative grid h-[76px] w-[60px] shrink-0 place-items-center"
          style={{ border: `1px solid ${RULE_STRONG}`, background: "oklch(1 0 0 / 32%)" }}
        >
          <span className="display text-[24px] leading-none" style={{ color: INK_MID }}>
            {initialsOf(bearer.name)}
          </span>
          <span
            className="absolute inset-x-0 bottom-[3px] text-center text-[6px] uppercase tracking-[0.1em]"
            style={{ fontFamily: TECHNICAL_FAMILY, color: INK_FAINT }}
          >
            No photograph
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3.5">
          <Field label="Bearer" value={bearer.name} variant="display" />
          <Field label="Record no." value={bearer.expeditionId} variant="technical" />
        </div>
      </div>

      <div className="mt-3 h-px w-full" style={{ background: RULE }} />

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Record opened" value={fmtDate(bearer.memberSince, { day: undefined })} />
        {bearer.homeBase ? (
          <Field label="Home range" value={bearer.homeBase} />
        ) : (
          // Not a blank and not a dash: the athlete simply has not told us, and
          // that is a different fact from having no home range.
          <div className="min-w-0">
            <p className="section-label text-[8px]">Home range</p>
            <div className="mt-1.5">
              <UnavailableState reason="not-reported" size="sm" className="items-start text-left" />
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 h-px w-full" style={{ background: RULE }} />

      <div className="mt-3">
        <p className="section-label text-[8px]">Status</p>
        <p
          className="mt-1.5 text-[11px] uppercase leading-none tracking-[0.16em]"
          style={{ fontFamily: TECHNICAL_FAMILY, color: INK }}
        >
          User record · Unverified
        </p>
        <p className="mt-2 text-[10.5px] leading-relaxed text-mist">
          ICEFALL does not verify identity, summits or skills. Every entry in this passport was
          added by the bearer.
        </p>
      </div>

      <div className="flex-1" />
      <MachineStrip bearer={bearer} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Conditions page                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The last page. Every real passport carries the issuing authority's
 * conditions; ours carries the opposite — a statement that there is no issuing
 * authority, and a legend for reading the entries.
 *
 * Written for the guide or expedition company who may be shown this booklet,
 * because they are the ones a false impression of competence would endanger.
 */
function ConditionsPage() {
  return (
    <div className="flex h-full flex-col">
      <p className="display text-[17px] leading-tight text-snow">
        This booklet is a record, not a credential.
      </p>
      <p className="mt-3 text-[10.5px] leading-relaxed text-mist">
        It holds what the bearer has recorded and what the bearer has claimed. ICEFALL runs no
        verification of any kind: there is no GPS-confirmed summit, no guide attestation and no
        identity check behind anything printed here.
      </p>

      <div className="mt-4 h-px w-full" style={{ background: RULE }} />

      <p className="section-label mt-3.5 text-[8px]">How to read an entry</p>
      <dl className="mt-2.5 space-y-2.5">
        <div>
          <dt>
            <ProvenanceChip label="User added" />
          </dt>
          <dd className="mt-1 text-[10px] leading-relaxed text-mist">
            The bearer marked this themselves. ICEFALL did not observe it.
          </dd>
        </div>
        <div>
          <dt>
            <QualifierBadge kind="self-reported" />
          </dt>
          <dd className="mt-1 text-[10px] leading-relaxed text-mist">
            The bearer&rsquo;s own claim. Skills and altitude are never inferred from recorded
            activity.
          </dd>
        </div>
        <div>
          <dt>
            <ProvenanceChip label="Observed" />
          </dt>
          <dd className="mt-1 text-[10px] leading-relaxed text-mist">
            Measured by a device during a recording. Simulated recordings are excluded.
          </dd>
        </div>
        <div>
          <dt>
            <ProvenanceChip label="Not recorded" dashed />
          </dt>
          <dd className="mt-1 text-[10px] leading-relaxed text-mist">
            ICEFALL holds nothing here. A dashed circle marks the gap; a zero is never put in its
            place.
          </dd>
        </div>
      </dl>

      <div className="mt-4 h-px w-full" style={{ background: RULE }} />

      <p className="mt-3.5 text-[10.5px] leading-relaxed" style={{ color: INK }}>
        If you are a guide or an operator assessing this athlete, treat every entry as a statement
        made by them, and verify it yourself.
      </p>
      <div className="flex-1" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inside front cover                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The reverse of the cover. Visible for roughly a fifth of a second as the
 * cover passes the vertical, so it carries one line and no more — but it is a
 * real surface, because a cover with a blank back would flash as a hole in the
 * booklet.
 */
function InsideFrontCover() {
  return (
    <div className="grain relative h-full w-full overflow-hidden rounded-card" style={PAPER_TOKENS}>
      <PaperContours />
      <div className="relative flex h-full flex-col items-center justify-center px-8 text-center">
        <IcefallMark className="h-8 w-auto" style={{ color: INK, opacity: 0.35 }} />
        <div className="mt-4 h-px w-[46px]" style={{ background: RULE_STRONG }} />
        <p className="section-label mt-4 text-[8px]">Kept by the bearer</p>
        <p className="mt-2 text-[10px] leading-relaxed text-mist">
          Nothing in this booklet has been checked by ICEFALL.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Book                                                                        */
/* -------------------------------------------------------------------------- */

/** A page the caller supplies. `content` is dropped into a `PassportPage`. */
export interface PassportSpread {
  id: string;
  /** Names the page in its header, in the page picker and to screen readers. */
  label: string;
  content: React.ReactNode;
}

/**
 * What the book needs from a passport record.
 *
 * Structural on purpose: the `Passport` built by `@/passport/model` satisfies
 * it and drops straight in, but the book does not import that module, so the
 * cover and the opening animation stay independent of how the data pages are
 * assembled. Everything past the identity page arrives through `spreads`.
 */
export interface PassportRecord {
  identity: PassportBearer;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** The whole opening, in milliseconds. One number, so nothing drifts. */
const OPEN_MS = 900;

/**
 * The passport, closed or open, mounted inline wherever it is placed.
 *
 * The opening runs about 900 ms in four beats — lift, swing, reveal, settle —
 * and it is DECORATION. Everything the booklet says is reachable without it:
 * the pages are ordinary DOM the whole time, the page picker and Close are real
 * buttons, arrow keys turn pages, and under `prefers-reduced-motion` the whole
 * 3D path is replaced by a cross-fade with no rotation and no parallax.
 */
export function PassportBook({
  passport,
  open,
  onOpenChange,
  spreads,
  coverDense = false,
  className,
}: {
  passport: PassportRecord;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Data pages. They sit between the identity page and the conditions page. */
  spreads?: PassportSpread[];
  /**
   * Draws the closed cover in its half-width setting, for a booklet parked in
   * a narrow column. Only the cover changes; the opened pages are unaffected.
   */
  coverDense?: boolean;
  className?: string;
}) {
  const bearer = passport.identity;
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [pageW, setPageW] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);

  const pages = useMemo<PassportSpread[]>(
    () => [
      { id: "identity", label: "Identity", content: <IdentityPage bearer={bearer} /> },
      ...(spreads ?? []),
      { id: "conditions", label: "Conditions", content: <ConditionsPage /> },
    ],
    [bearer, spreads],
  );

  const lastPage = pages.length - 1;

  /* -- Page width. Drag limits and page offsets are in pixels, so the stage is
        measured rather than guessed; a rotated phone must not strand a page. -- */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    setPageW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number") setPageW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const settle = useCallback(
    (i: number) => {
      const target = -i * pageW;
      if (reduce) {
        x.set(target);
        return undefined;
      }
      return animate(x, target, { type: "spring", stiffness: 300, damping: 36, mass: 0.9 });
    },
    [pageW, reduce, x],
  );

  useEffect(() => {
    const controls = settle(index);
    return () => controls?.stop();
  }, [index, settle]);

  // A closed passport always reopens at the identity page, the way a booklet
  // put back in a pocket falls shut on page one.
  useEffect(() => {
    if (!open) setIndex(0);
  }, [open]);

  /* -- The end state does not depend on the animation running.

        Animations advance on requestAnimationFrame, which STOPS in a hidden
        tab; setTimeout keeps firing. Open the passport, switch tabs, come back,
        and the swing is frozen part-way — measured here at three degrees, with
        the cover square over the page and the pages beneath it still at zero
        opacity. The booklet would be unreadable behind its own cover.

        So the sequence below also arms a timer that snaps every value to where
        the animation was going and takes the spent cover out of the paint. When
        the animation does run, the timer lands on values already reached and
        changes nothing. -- */
  const [coverRetired, setCoverRetired] = useState(open);

  /* -- Focus. Opening moves focus into the booklet so the keyboard lands where
        the eye does; closing hands it back to the cover that was pressed. -- */
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) bookRef.current?.focus();
    if (!open && wasOpen.current) coverRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const goTo = useCallback((i: number) => setIndex(Math.max(0, Math.min(lastPage, i))), [lastPage]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (pageW === 0) return;
    // Flick or drag: a short fast swipe should turn the page, a long slow one
    // should too, so velocity is folded into the distance before deciding.
    const projected = info.offset.x + info.velocity.x * 0.14;
    const threshold = pageW * 0.22;
    let next = index;
    if (projected < -threshold) next = index + 1;
    else if (projected > threshold) next = index - 1;
    next = Math.max(0, Math.min(lastPage, next));
    setIndex(next);
    // Called directly as well as through the effect, so that a nudge that does
    // not change the page still returns the sheet to square.
    settle(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    // A data page may hold a control that owns the arrow keys — a slider, a
    // text field, a listbox. Turning the page out from under it would be worse
    // than not offering the shortcut there at all.
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [role='slider'], [contenteditable='true']")) {
      return;
    }
    e.preventDefault();
    goTo(e.key === "ArrowRight" ? index + 1 : index - 1);
  };

  /* -- THE OPENING.

        Four beats on one clock: the cover lifts (0–20%), swings about its
        spine (20–100%), the interior fades up beneath it from 33%, and the
        cover dissolves over the last third rather than sliding off the side of
        a phone. Closing is the same clock read backwards.

        Driven through motion values rather than nine `animate` props scattered
        across five elements, so the whole choreography is legible in one place
        and every track is read against the same clock. Add a beat by adding a
        line here, not by hunting through the JSX for the element that owns it.

        The cover's fade is a plain tween rather than a fourth keyframe track
        sharing the swing's clock: it has to land on zero every time, because a
        cover left at any opacity covers the page the athlete just opened. -- */
  const coverRotate = useMotionValue(open ? -168 : 0);
  const coverZ = useMotionValue(open ? 16 : 0);
  const coverLift = useMotionValue(open ? -2 : 0);
  const coverFade = useMotionValue(open ? 0 : 1);
  const pagesFade = useMotionValue(open ? 1 : 0);
  const pagesScale = useMotionValue(open ? 1 : 0.982);
  const spineShade = useMotionValue(open ? 0.12 : 0.8);
  const hintFade = useMotionValue(open ? 0 : 1);
  const controlsFade = useMotionValue(open ? 1 : 0);

  useEffect(() => {
    const D = OPEN_MS / 1000;

    // Where every track ends. Used both as the reduced-motion result and as the
    // guaranteed landing above.
    const settle = (flat: boolean) => {
      coverRotate.set(flat ? 0 : open ? -168 : 0);
      coverZ.set(flat ? 0 : open ? 16 : 0);
      coverLift.set(flat ? 0 : open ? -2 : 0);
      coverFade.set(open ? 0 : 1);
      pagesFade.set(open ? 1 : 0);
      pagesScale.set(flat ? 1 : open ? 1 : 0.982);
      spineShade.set(open ? 0.12 : 0.8);
      hintFade.set(open ? 0 : 1);
      controlsFade.set(open ? 1 : 0);
      setCoverRetired(open);
    };

    if (reduce) {
      // A clean cross-fade: no rotation, no lift, no parallax. The booklet is
      // simply there, or simply not.
      settle(true);
      return;
    }

    // Nothing to animate for an audience that cannot see it, and animating
    // anyway is how the booklet ends up frozen mid-swing: requestAnimationFrame
    // does not tick in a hidden tab. Land on the end state instead.
    if (document.hidden) {
      settle(false);
      return;
    }

    setCoverRetired(false);

    const running = open
      ? [
          animate(coverRotate, [0, -3, -168], { duration: D, times: [0, 0.2, 1], ease: EASE }),
          animate(coverZ, [0, 46, 16], { duration: D, times: [0, 0.26, 1], ease: EASE }),
          animate(coverLift, [0, -9, -2], { duration: D, times: [0, 0.26, 1], ease: EASE }),
          animate(coverFade, 0, { duration: 0.26, delay: 0.62, ease: "linear" }),
          animate(pagesFade, 1, { duration: 0.5, delay: 0.3, ease: EASE }),
          animate(pagesScale, 1, { duration: 0.5, delay: 0.3, ease: EASE }),
          animate(spineShade, 0.12, { duration: 0.62, delay: 0.3, ease: EASE }),
          animate(hintFade, 0, { duration: 0.2, ease: EASE }),
          animate(controlsFade, 1, { duration: 0.34, delay: 0.42, ease: EASE }),
        ]
      : [
          animate(coverRotate, [-168, -3, 0], { duration: D, times: [0, 0.8, 1], ease: EASE }),
          animate(coverZ, [16, 46, 0], { duration: D, times: [0, 0.74, 1], ease: EASE }),
          animate(coverLift, [-2, -9, 0], { duration: D, times: [0, 0.74, 1], ease: EASE }),
          animate(coverFade, 1, { duration: 0.26, delay: 0.1, ease: "linear" }),
          animate(pagesFade, 0, { duration: 0.3, ease: EASE }),
          animate(pagesScale, 0.982, { duration: 0.3, ease: EASE }),
          animate(spineShade, 0.8, { duration: 0.5, ease: EASE }),
          animate(hintFade, 1, { duration: 0.34, delay: 0.42, ease: EASE }),
          animate(controlsFade, 0, { duration: 0.2, ease: EASE }),
        ];

    // The grace is deliberate: OPEN_MS is when the last track finishes, so the
    // timer must land after it or it would cut a healthy animation short.
    //
    // The timer alone is not enough. A tab hidden for long enough is throttled
    // to roughly one timer callback a minute, so this can be a minute late —
    // long enough for the athlete to come back to a half-open booklet. Leaving
    // for another tab therefore settles the sequence at once, and what they
    // return to is a finished passport rather than a frozen one.
    const landing = setTimeout(() => settle(false), OPEN_MS + 120);
    const onHide = () => {
      if (!document.hidden) return;
      running.forEach((a) => a.stop());
      settle(false);
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      running.forEach((a) => a.stop());
      clearTimeout(landing);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [
    open,
    reduce,
    coverRotate,
    coverZ,
    coverLift,
    coverFade,
    pagesFade,
    pagesScale,
    spineShade,
    hintFade,
    controlsFade,
  ]);

  return (
    // The key handler sits on the outermost element rather than on the booklet,
    // so the arrow keys still turn pages when focus is on the page picker or on
    // Close — both of which sit outside the book — and Escape closes from
    // anywhere inside the section.
    <div className={cn("select-none", className)} onKeyDown={handleKeyDown}>
      {/* Perspective and breathing room. The clip is here rather than on the
          stage because a `preserve-3d` element with a clip is forced flat, and
          the padding exists so the lift toward the viewer is not cropped. */}
      <div
        className="relative overflow-hidden px-3 py-3"
        style={{ perspective: "1200px", perspectiveOrigin: "50% 42%" }}
      >
        <div
          ref={bookRef}
          tabIndex={-1}
          role="group"
          aria-label="Mountain passport"
          className="relative aspect-[88/125] w-full outline-none"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div ref={stageRef} className="absolute inset-0" />

          {/* Interior, beneath the cover. */}
          <motion.div
            className="absolute inset-0 overflow-hidden rounded-card"
            style={{
              boxShadow: "0 18px 44px -22px rgba(0,0,0,0.9)",
              opacity: pagesFade,
              scale: pagesScale,
            }}
            aria-hidden={!open}
            inert={!open}
          >
            <motion.div
              className="flex h-full w-full"
              style={{ x }}
              drag="x"
              dragConstraints={{ left: -lastPage * pageW, right: 0 }}
              // Beyond the first and last page the sheet still moves, but only
              // a little and it springs back — the resistance of a real spine.
              dragElastic={0.12}
              dragMomentum={false}
              onDragEnd={handleDragEnd}
            >
              {pages.map((p, i) => (
                <div
                  key={p.id}
                  className="h-full w-full shrink-0"
                  aria-hidden={i !== index}
                  inert={i !== index}
                >
                  <PassportPage title={p.label} pageNumber={i + 1} pageCount={pages.length}>
                    {p.content}
                  </PassportPage>
                </div>
              ))}
            </motion.div>

            {/* The cover's shadow falling across the page, lifting as it opens. */}
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-[45%] rounded-l-card"
              style={{
                background: "linear-gradient(90deg, rgba(0,0,0,0.55), transparent)",
                opacity: spineShade,
              }}
            />
          </motion.div>

          {/* Cover, pivoting on the spine at its left edge.
              `inert` once open: the cover is faded out and untouchable, and a
              button a keyboard user can still tab to but nobody can see is a
              worse trap than no button at all. */}
          <motion.div
            className="absolute inset-0"
            style={{
              transformStyle: "preserve-3d",
              transformOrigin: "left center",
              zIndex: 2,
              pointerEvents: open ? "none" : "auto",
              visibility: coverRetired ? "hidden" : "visible",
              rotateY: coverRotate,
              z: coverZ,
              y: coverLift,
              opacity: coverFade,
            }}
            aria-hidden={open}
            inert={open}
          >
            <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
              <PassportCover
                bearer={bearer}
                buttonRef={coverRef}
                onPress={() => onOpenChange(true)}
                expanded={open}
                tilt={!open}
                dense={coverDense}
              />
            </div>
            {/* The reverse face, pre-rotated so it is the one you see past 90°.
                Both faces hide their backs, so neither flashes through. */}
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}
            >
              <InsideFrontCover />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Controls. Two layers cross-fading in a fixed-height row, so nothing
          below the passport shifts when it opens. */}
      <div className="relative mt-2 min-h-[28px]">
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: hintFade }}
          aria-hidden={open}
          inert={open}
        >
          <span className="section-label">Tap to open</span>
        </motion.div>

        <motion.div
          className="absolute inset-0 flex items-center justify-between"
          style={{ opacity: controlsFade }}
          aria-hidden={!open}
          inert={!open}
        >
          <div className="-ml-1.5 flex items-center">
            {pages.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Page ${i + 1} of ${pages.length} — ${p.label}`}
                aria-current={i === index ? "true" : undefined}
                className="group grid h-7 w-6 place-items-center"
              >
                <span
                  className={cn(
                    "block h-[5px] w-[5px] rounded-full transition-colors",
                    i === index ? "bg-azure" : "bg-white/20 group-hover:bg-white/40",
                  )}
                />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="section-label px-1 py-1 transition-colors hover:text-snow"
          >
            Close
          </button>
        </motion.div>
      </div>
    </div>
  );
}
