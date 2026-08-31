import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The drawn design kit — REAL application code, not demo chrome.
 *
 * History matters here: these pieces were born in src/demo/mockupUi.tsx as a
 * demo-only costume, then the owner ruled (31 Aug) that the drawings ARE the
 * production design — "all this time i was telling you to build things on the
 * acc apps". So the kit moved into components/ and the screens use it
 * unconditionally; only the sample FIGURES stay behind SHOW_DEMO_DATA.
 */

export const GOLD = "#C79049";
export const GOLD_HOVER = "#B27F3D";

/** The drawings' primary action: a gold pill (same constant as SignIn). */
export function GoldButton({ children, className, onClick, disabled }: {
  children: React.ReactNode; className?: string; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-[13px] font-semibold text-white transition-colors disabled:opacity-40",
        className,
      )}
      style={{ background: GOLD }}
      onMouseOver={(e) => { if (!disabled) e.currentTarget.style.background = GOLD_HOVER; }}
      onMouseOut={(e) => (e.currentTarget.style.background = GOLD)}
    >
      {children}
    </button>
  );
}

/** Small photo thumbnail from the destination image set; a row with no asset
 * shows a quiet grey square rather than a broken image. */
export function Thumb({ slug, className }: { slug: string | null; className?: string }) {
  const [gone, setGone] = useState(false);
  if (!slug || gone) return <span className={cn("shrink-0 rounded-[6px] bg-panel", className ?? "h-7 w-7")} aria-hidden />;
  return (
    <img
      src={`/img/destinations/${slug}.jpg`}
      alt=""
      className={cn("shrink-0 rounded-[6px] object-cover", className ?? "h-7 w-7")}
      onError={() => setGone(true)}
    />
  );
}

const LOGO_TONES = ["#1E293B", "#B4552D", "#64748B", "#2F6DB5", "#3F6212", "#6D28D9", "#0F766E", "#334155"];

/** Company mark: initials in a tinted circle, deterministic per name. */
export function LogoDot({ name }: { name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const tone = LOGO_TONES[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % LOGO_TONES.length];
  return (
    <span
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[8.5px] font-bold text-white"
      style={{ background: tone }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export type SourceTab = "all" | "guide" | "referral";
const TAB_LABEL: Record<SourceTab, string> = { all: "All", guide: "Guide", referral: "Placements" };

/** The All / Guide / Placements pills the drawings put inside each list card.
 * Controlled when given value/onChange (live lists filter); self-standing
 * otherwise. */
export function ListTabs({ value, onChange }: { value?: SourceTab; onChange?: (v: SourceTab) => void }) {
  const [local, setLocal] = useState<SourceTab>("all");
  const v = value ?? local;
  return (
    <div className="mb-2 mt-2 flex gap-3 border-b border-line-soft">
      {(Object.keys(TAB_LABEL) as SourceTab[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => { setLocal(t); onChange?.(t); }}
          className={cn(
            "-mb-px border-b-2 pb-1.5 text-[11.5px] font-medium",
            v === t ? "font-semibold" : "border-transparent text-muted hover:text-ink",
          )}
          style={v === t ? { color: GOLD_HOVER, borderColor: GOLD } : undefined}
        >
          {TAB_LABEL[t]}
        </button>
      ))}
    </div>
  );
}

export function ViewAllLink({ children }: { children: React.ReactNode }) {
  return <p className="mt-2.5 text-[12px] font-medium text-accent-ink">{children} →</p>;
}

/* ── World dot-map (Dashboard) ───────────────────────────────────────────── */

/** Stylised dot-grid world map — coarse hand-encoded cells that read as "world
 * map, busy markets in blue" at a glance. It renders only when country figures
 * exist to colour; it is a stylisation, not survey geography, and the real
 * choropleth still waits for a licensed asset. '#' = land, '.' = sea. */
const LAND: string[] = [
  "............#######.#######......#..........................",
  "..........##########..######....#.....####################..",
  ".#####...############..#####...#.##..#####################..",
  ".#####...############...###..#..####.######################.",
  "..####...#############.......##..###.#####################..",
  "........##############......###.#####.####################..",
  "........#############.......########.###############.......",
  "........############........##.####..#############...#.....",
  "........###########.........#..###..###############..##....",
  ".........##########.........########.##############..#.....",
  "..........####..#.#........##########.#####..######........",
  "..........####...##.......###########.#####..####.#........",
  "...........###..##.#......###########..####..#####.##......",
  ".............####.........#######.####..##...#####.##......",
  "..............###.........#####.######...#...###.###.......",
  "...............#####..........########.......##.##..###....",
  "...............#######.........#######.......###### ###....",
  "...............########........######.........##...####....",
  "...............########........######.#.......#####.##.....",
  "................#######........#####..#.....########## .....",
  "................######.........#####..#....###########.....",
  "................#####...........####.......###########.....",
  "................####............###........####..####......",
  "................###..........................#...####......",
  "................###...................................##...",
  "................##...................................##....",
];
/** Boxes [r0,r1,c0,c1] in saturated blue — the drawing's hot markets. */
const HOT: [number, number, number, number][] = [
  [6, 9, 8, 18],    // United States
  [2, 5, 8, 19],    // Canada
  [4, 6, 28, 29],   // UK + Ireland
  [5, 6, 31, 33],   // Germany
  [9, 13, 41, 44],  // India + Nepal
  [18, 23, 47, 55], // Australia
];

export function WorldDots({ className }: { className?: string }) {
  const dots: React.ReactNode[] = [];
  const hot = (r: number, c: number) => HOT.some(([r0, r1, c0, c1]) => r >= r0 && r <= r1 && c >= c0 && c <= c1);
  LAND.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== "#") continue;
      dots.push(
        <circle
          key={`${r}-${c}`}
          cx={6 + c * 6}
          cy={6 + r * 6}
          r={2.1}
          fill={hot(r, c) ? "#5B8DEF" : "#C9D8EE"}
        />,
      );
    }
  });
  return (
    <svg viewBox="0 0 372 162" className={cn("h-auto w-full", className)} role="img" aria-label="Users by country, world map">
      {dots}
    </svg>
  );
}

/** The four routes whose drawings the owner reviews side-by-side. The demo
 * banner stays off these (the offline preview carries its own strip); every
 * other screen keeps the sample-figures marker when the flag is on. */
export const DRAWN_ROUTES = ["/admin/dashboard", "/admin/products", "/admin/bookings", "/admin/commissions"];
