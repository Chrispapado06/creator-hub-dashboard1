/**
 * The component vocabulary.
 *
 * Small on purpose. Spec §17 asks for a portal that stays clean and operational
 * and avoids a heavy enterprise-CRM appearance, and the way that fails is by
 * accumulating twelve variants of a card.
 *
 * `Figure` is the one that matters. It is the only component in this app allowed
 * to render a number, and it takes a `Reading` rather than a number — so a
 * screen that has no measurement has nothing to pass it, and the missing case is
 * handled by construction rather than by remembering.
 */

import {
  ArrowDownRight, ArrowUpRight, BadgeCheck, ChevronLeft, ChevronRight, Lock,
  MoreVertical, RotateCw, Search as SearchIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { fold, type Reading } from "@/domain/honesty";
import type { ChipStatus } from "@/domain/types";
import { formatDay, TODAY } from "@/domain/dates";
import { demoCustomerPhoto, demoCustomerVerified } from "@/domain/demo";
import { Monogram } from "@/components/Shell";

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`hairline rounded-card bg-surface ${className}`}>{children}</div>
  );
}

export function SectionHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[14px] font-semibold tracking-tight text-ink">{title}</h2>
        {detail && <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  detail,
  action,
  chip = true,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  /** The reporting-window chip, top-right of every page per the mockups. */
  chip?: boolean;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="ser text-[27px] leading-tight text-ink">{title}</h1>
        {detail && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{detail}</p>}
      </div>
      <div className="flex flex-col items-end gap-2.5">
        {chip && <DateRangeChip />}
        {action}
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

const CHIP_LABEL: Record<ChipStatus, string> = {
  live: "Published", // the mockup's word for the live state
  draft: "Draft",
  pending: "Pending approval",
  rejected: "Rejected",
  expired: "Expired",
  archived: "Archived",
};

const CHIP_CLASS: Record<ChipStatus, string> = {
  live: "text-live bg-live-soft",
  draft: "text-draft bg-draft-soft",
  pending: "text-pending bg-pending-soft",
  rejected: "text-rejected bg-rejected-soft",
  expired: "text-expired bg-expired-soft",
  archived: "text-draft bg-draft-soft",
};

/** The five status chips spec §17 requires, and no sixth spelling of them. */
export function StatusChip({ status }: { status: ChipStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-semibold tracking-[0.07em] uppercase whitespace-nowrap ${CHIP_CLASS[status]}`}
    >
      {CHIP_LABEL[status]}
    </span>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "azure" }) {
  const cls = tone === "azure" ? "bg-azure-soft text-azure-ink" : "bg-canvas text-muted";
  return (
    <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11.5px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Figures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A measured figure, or the reason there isn't one.
 *
 * THE WHOLE POINT: this takes `Reading<T>`, never a bare number. There is no
 * prop for a fallback value and there will not be one — a fallback is how "we
 * are not counting yet" turns into "nobody looked at your listing", which is a
 * different and false statement that an operator would act on.
 */
export function Figure<T>({
  reading,
  format,
  size = "lg",
}: {
  reading: Reading<T>;
  format: (v: T) => string;
  size?: "lg" | "sm";
}) {
  return fold(
    reading,
    (v) => (
      <span className={`tnum text-ink ${size === "lg" ? "ser text-[32px] leading-none" : "text-[15px] font-medium"}`}>
        {format(v)}
      </span>
    ),
    (reason) => (
      <span
        className={`block max-w-[22ch] leading-snug text-muted ${size === "lg" ? "text-[12.5px]" : "text-[12px]"}`}
      >
        {reason}
      </span>
    ),
  );
}

export function StatTile({
  label,
  children,
  footnote,
  href,
}: {
  label: string;
  children: ReactNode;
  footnote?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="lbl">{label}</div>
      <div className="mt-2 min-h-[34px]">{children}</div>
      {footnote && <div className="mt-1.5 text-[11.5px] leading-snug text-faint">{footnote}</div>}
    </>
  );
  if (href) {
    return (
      <a href={href} className="hairline block rounded-card bg-surface p-4 transition-colors hover:bg-raised">
        {body}
      </a>
    );
  }
  return <div className="hairline rounded-card bg-surface p-4">{body}</div>;
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

export function Button({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
  title?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-tile px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45";
  const styles = {
    primary: "bg-azure text-canvas hover:bg-azure-ink",
    secondary: "hairline bg-surface text-ink hover:bg-raised",
    quiet: "text-muted hover:text-ink hover:bg-raised",
    danger: "hairline bg-surface text-rejected hover:bg-rejected-soft",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-medium text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputClass =
  "w-full rounded-tile border border-line bg-elevated px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-azure";

/* -------------------------------------------------------------------------- */
/* Notices                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Something ICEFALL controls and the operator cannot.
 *
 * Rendered as a locked, neutral statement rather than a disabled input. A greyed
 * field reads as "ask us and we'll turn it on", which invites exactly the
 * negotiation spec §2 says must not happen.
 */
export function LockedNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-tile bg-canvas px-3 py-2 text-[12.5px] leading-snug text-muted">
      <Lock size={13} className="mt-0.5 shrink-0 text-faint" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "neutral" | "pending" | "rejected" | "expired";
  title?: string;
  children: ReactNode;
}) {
  const cls = {
    neutral: "bg-canvas text-muted",
    pending: "bg-pending-soft text-pending",
    rejected: "bg-rejected-soft text-rejected",
    expired: "bg-expired-soft text-expired",
  }[tone];
  return (
    <div className={`rounded-tile px-3 py-2.5 text-[12.5px] leading-snug ${cls}`}>
      {title && <div className="font-semibold">{title}</div>}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="hairline rounded-card bg-surface px-4 py-10 text-center">
      <p className="text-[13.5px] font-medium text-ink">{title}</p>
      {detail && <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">{detail}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Integer minor units in, a string out. Never a float, and never a bare
 * `toFixed` at a call site — a rounding rule in fourteen components is fourteen
 * chances to disagree about a price.
 */
export function formatMoney(cents: number, currency = "EUR"): string {
  const symbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${(cents / 100).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

/** A price range where the upper bound may not exist. "From" is not a lie. */
export function formatPriceRange(
  from: number | null,
  to: number | null,
  currency = "EUR",
): string | null {
  if (from === null && to === null) return null;
  if (from !== null && to !== null) return `${formatMoney(from, currency)} – ${formatMoney(to, currency)}`;
  return `From ${formatMoney((from ?? to)!, currency)}`;
}

/* -------------------------------------------------------------------------- */
/* Mockup primitives                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A metric tile with a period-on-period delta.
 *
 * `delta` is a `Reading` for the same reason the value is: with nothing in the
 * previous window there is no change to state, and "+0%" would be a claim that
 * performance held steady when in fact there is nothing to compare against.
 * When there is no delta the tile simply omits it rather than showing a zero.
 */
export function MetricTile({
  label,
  reading,
  format,
  delta,
  footnote,
  href,
}: {
  label: string;
  reading: Reading<number>;
  format: (v: number) => string;
  delta?: number | null;
  footnote?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="lbl">{label}</div>
      <div className="mt-2.5 min-h-[36px]">
        <Figure reading={reading} format={format} />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {delta !== null && delta !== undefined && (
          <span
            className={`tnum inline-flex items-center gap-0.5 text-[11.5px] font-medium ${
              delta >= 0 ? "text-live" : "text-rejected"
            }`}
          >
            {delta >= 0 ? <ArrowUpRight size={11} aria-hidden /> : <ArrowDownRight size={11} aria-hidden />}
            {Math.abs(delta)}%
          </span>
        )}
        {footnote && <span className="text-[11px] leading-snug text-faint">{footnote}</span>}
      </div>
    </>
  );
  const cls = "hairline block rounded-card bg-surface p-4";
  return href ? (
    <Link to={href} className={`${cls} transition-colors hover:bg-raised`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** The filter tabs the list screens carry, with counts. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { key: T; label: string; count?: number }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`rounded-tile px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            active === t.key ? "bg-azure text-canvas" : "text-muted hover:bg-raised hover:text-ink"
          }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={`tnum ml-1.5 ${active === t.key ? "opacity-70" : "text-faint"}`}>
              ({t.count})
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * A mountain, drawn rather than photographed.
 *
 * The mockups show a photograph on each mountain card. ICEFALL has no licensed
 * photography for these peaks in this app, and the house rule is that imagery
 * comes from Wikimedia Commons with the licence and attribution tracked — which
 * is a real task, not something to fake with a stock-looking gradient pretending
 * to be a summit. So this is explicitly a drawing: a contour figure in the
 * brand's own language, which claims to be nothing.
 */
export function MountainFigure({ seed, className = "" }: { seed: string; className?: string }) {
  // Deterministic from the name, so a mountain always draws the same way.
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const shift = (h % 40) - 20;
  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(160deg, oklch(0.30 0.035 ${250 + (h % 20)}) 0%, oklch(0.17 0.02 262) 100%)`,
        }}
      />
      <svg viewBox="0 0 200 120" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <g fill="none" stroke="oklch(1 0 0)" strokeWidth="0.7" opacity="0.18">
          {[0, 14, 28, 42].map((dy) => (
            <path
              key={dy}
              d={`M-10 ${96 - dy} C ${30 + shift} ${74 - dy}, ${64 + shift} ${34 - dy}, ${100 + shift} ${38 - dy} C ${136 + shift} ${42 - dy}, ${158 + shift} ${84 - dy}, 210 ${74 - dy}`}
            />
          ))}
        </g>
        <path
          d={`M-10 120 L ${72 + shift} ${34} L ${104 + shift} ${68} L ${132 + shift} ${48} L 210 120 Z`}
          fill="oklch(0.13 0.012 260 / 55%)"
        />
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* List furniture — the mockup set's shared fittings                          */
/* -------------------------------------------------------------------------- */

/** The search box every list screen carries. Filtering is the caller's job. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={`relative block ${className}`}>
      <SearchIcon
        size={13.5}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-tile border border-line bg-surface py-1.5 pr-2.5 pl-7.5 text-[13px] text-ink outline-none focus:border-azure"
      />
    </label>
  );
}

/** Search on the left, actions (usually the primary Add button) on the right. */
export function Toolbar({ search, children }: { search: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="w-full max-w-[260px]">{search}</div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export interface RowMenuItem {
  label: string;
  onClick: () => void;
  tone?: "neutral" | "danger";
  disabled?: boolean;
}

/** The ⋮ menu on every row. Closes on outside click and on Escape. */
export function RowMenu({ items, label = "Row actions" }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-tile p-1.5 text-faint transition-colors hover:bg-raised hover:text-ink"
      >
        <MoreVertical size={15} aria-hidden />
      </button>
      {open && (
        <div className="hairline absolute top-full right-0 z-20 mt-1 min-w-[150px] rounded-tile bg-surface py-1 shadow-[0_8px_24px_oklch(0_0_0/10%)]">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`block w-full px-3 py-1.5 text-left text-[12.5px] transition-colors disabled:opacity-45 ${
                item.tone === "danger" ? "text-rejected hover:bg-rejected-soft" : "text-ink hover:bg-raised"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** ‹ 1 2 › — page numbers under a list, as the mockup's mountains screen has. */
export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  const btn =
    "grid h-7 w-7 place-items-center rounded-tile text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35";
  return (
    <nav className="mt-4 flex items-center justify-center gap-1" aria-label="Pages">
      <button className={`${btn} text-muted hover:bg-raised`} disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeft size={14} aria-hidden />
      </button>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          aria-current={p === page ? "page" : undefined}
          className={`tnum ${btn} ${p === page ? "hairline bg-surface text-ink" : "text-muted hover:bg-raised"}`}
        >
          {p}
        </button>
      ))}
      <button className={`${btn} text-muted hover:bg-raised`} disabled={page === pageCount} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRight size={14} aria-hidden />
      </button>
    </nav>
  );
}

/**
 * The reporting window, top-right of every page — "1 – 28 Aug 2026".
 *
 * Month-to-date against the app's fixed demo clock. The refresh control
 * reloads the page: an honest refresh, not a pretend one.
 */
export function DateRangeChip() {
  const label = `1 – ${formatDay(TODAY)}`;
  return (
    <div className="flex items-center gap-1.5">
      <span className="tnum hairline rounded-tile bg-surface px-2.5 py-1.5 text-[12px] font-medium text-muted">
        {label}
      </span>
      <button
        type="button"
        title="Refresh"
        aria-label="Refresh"
        onClick={() => window.location.reload()}
        className="rounded-tile p-1.5 text-faint transition-colors hover:bg-raised hover:text-ink"
      >
        <RotateCw size={13} aria-hidden />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Photography                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Listing photos come from icefall-web's ALREADY-CREDITED image sets (Wikimedia
 * Commons, licences tracked in icefall-web/src/data/*PhotoCredits.ts), served
 * by that app's dev server — one credited library, no second copy, per the
 * cross-session ruling of 2026-08-29. Local-only by construction: if the web
 * app is not running, the drawing takes over.
 */
export const WEB_ASSET_ORIGIN: string =
  (import.meta.env.VITE_ICEFALL_WEB_ORIGIN as string | undefined) ?? "http://localhost:5194";

export function peakPhotoUrl(mountainId: string): string {
  return `${WEB_ASSET_ORIGIN}/img/peaks/${mountainId}.jpg`;
}

export function trekPhotoUrl(slug: string): string {
  return `${WEB_ASSET_ORIGIN}/img/treks/${slug}.jpg`;
}

/**
 * A photo that admits failure. `sources` are tried in order; when none loads,
 * the contour drawing renders — a placeholder that claims to be nothing.
 */
export function ListingPhoto({
  sources,
  alt,
  seed,
  className = "",
}: {
  sources: string[];
  alt: string;
  seed: string;
  className?: string;
}) {
  const [idx, setIdx] = useState(0);
  if (idx >= sources.length) return <MountainFigure seed={seed} className={className} />;
  return (
    <div className={`relative overflow-hidden bg-raised ${className}`}>
      <img
        src={sources[idx]}
        alt={alt}
        loading="lazy"
        onError={() => setIdx((i) => i + 1)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Charts — small, honest, dependency-free                                    */
/* -------------------------------------------------------------------------- */

export interface DonutSegment {
  label: string;
  value: number;
  colour: string;
}

/**
 * The by-source donut. Takes real counts only — the caller sums what ICEFALL
 * recorded; a segment is never invented to make the ring look fuller.
 */
export function Donut({
  segments,
  centreLabel,
  size = 132,
}: {
  segments: DonutSegment[];
  centreLabel: string;
  size?: number;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--op-raised)" strokeWidth="11" />
          {total > 0 &&
            segments.map((s) => {
              const frac = s.value / total;
              const el = (
                <circle
                  key={s.label}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke={s.colour}
                  strokeWidth="11"
                  strokeDasharray={`${frac * c} ${c}`}
                  strokeDashoffset={-acc * c}
                  strokeLinecap="butt"
                />
              );
              acc += frac;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="tnum ser text-[22px] leading-none text-ink">{total}</div>
            <div className="mt-0.5 text-[10px] text-faint">{centreLabel}</div>
          </div>
        </div>
      </div>
      <ul className="min-w-0 space-y-1.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[12px]">
            <span className="h-2 w-2 shrink-0 rounded-pill" style={{ background: s.colour }} aria-hidden />
            <span className="truncate text-muted">{s.label}</span>
            <span className="tnum ml-auto pl-3 font-medium text-ink">{s.value}</span>
            <span className="tnum w-[4.5ch] text-right text-faint">
              {total > 0 ? `${Math.round((s.value / total) * 100)}%` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Profile completeness, and nothing else — a percentage of filled sections. */
export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-pill bg-raised" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-pill bg-azure" style={{ width: `${clamped}%` }} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* People — demo profiles                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A customer's avatar: the demo portrait when one is mapped (see
 * src/domain/demo.ts and its delete-before-real-operators fence), initials
 * otherwise — and initials again the moment a photo fails to load, so an
 * offline demo degrades to exactly what the un-flagged app shows.
 */
export function PersonAvatar({ name, size = 30 }: { name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = demoCustomerPhoto(name);
  if (!src || failed) return <Monogram name={name} size={size} />;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-pill bg-elevated object-cover"
      style={{ width: size, height: size }}
    />
  );
}

/** The azure check beside a verified demo customer's name, or nothing. */
export function VerifiedMark({ name, size = 14 }: { name: string; size?: number }) {
  if (!demoCustomerVerified(name)) return null;
  return (
    <BadgeCheck
      size={size}
      aria-label="Verified"
      className="inline-block shrink-0 align-[-2px] text-azure"
      fill="currentColor"
      stroke="var(--op-surface)"
    />
  );
}
