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
 *
 * ── THE RE-SKIN ─────────────────────────────────────────────────────────────
 * A later ruling supersedes the palette, not the placement: "i dont see any
 * change i want the designs 1:1", then "commit 1:1". The reference is the theme
 * running at localhost:3100, whose every colour token is chroma 0 — there is no
 * accent hue in it anywhere. So the gold, the eight logo tints and the two map
 * blues below are gone; the SHAPES the owner drew are untouched.
 */

/**
 * THIS IS NO LONGER GOLD, AND THE NAME IS KEPT ONLY BECAUSE TWO SCREENS IMPORT
 * IT. Bookings.tsx and ProductDetail.tsx both read GOLD/GOLD_HOVER to paint the
 * active tab in their own tab strips, and neither may be edited in this pass —
 * so the constants stay, and the VALUE moves to the theme's tab treatment.
 *
 * theme-ref/src/components/ui/tabs.tsx, `line` variant: the active trigger is
 * `text-foreground` with an `after:` underline in `bg-foreground`. One colour
 * for both, which is why these two are now the same value. Written as a var so
 * the whole strip flips with the theme rather than freezing a light-mode hex.
 *
 * If a later pass may edit those two screens, the honest fix is to delete these
 * and write `text-ink` / `border-ink` at the call sites.
 */
export const GOLD = "var(--foreground)";
export const GOLD_HOVER = "var(--foreground)";

/**
 * The drawings' primary action.
 *
 * Was a gold pill. Now the theme's default Button, verbatim from
 * theme-ref/src/components/ui/button.tsx: `bg-primary text-primary-foreground`
 * at h-8, rounded-lg (not a pill), text-sm/500, gap-1.5, and the theme's
 * one-pixel press. That near-black fill is the same ink as the delta pill on
 * the stat tiles — the theme's signature, and the reason no hue is needed.
 *
 * NOTE ON HEIGHT: the theme's button is 32px, not the 40px this kit used. Two
 * hand-rolled `h-10` buttons sit beside this one in ProductDetail.tsx, which
 * this pass may not edit, so that one header row will be ragged until those
 * two are brought to the theme as well.
 */
export function GoldButton({ children, className, onClick, disabled }: {
  children: React.ReactNode; className?: string; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-slot="crm-primary-button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap",
        "rounded-lg border border-transparent bg-primary px-2.5 text-sm font-medium text-primary-foreground",
        "transition-all hover:bg-primary/80 active:translate-y-px",
        "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Small photo thumbnail from the destination image set; a row with no asset
 * shows a quiet grey square rather than a broken image.
 *
 * Radius and hairline follow the theme's Avatar: `rounded-lg` at this size with
 * a `border-border` edge drawn over the image, so a pale photo still has a
 * boundary. The empty square is the theme's AvatarFallback fill, `bg-muted`. */
export function Thumb({ slug, className }: { slug: string | null; className?: string }) {
  const [gone, setGone] = useState(false);
  if (!slug || gone) {
    return (
      <span
        className={cn("shrink-0 rounded-md bg-raised ring-1 ring-inset ring-border", className ?? "h-7 w-7")}
        aria-hidden
      />
    );
  }
  return (
    <img
      src={`/img/destinations/${slug}.jpg`}
      alt=""
      className={cn("shrink-0 rounded-md object-cover ring-1 ring-inset ring-border", className ?? "h-7 w-7")}
      onError={() => setGone(true)}
    />
  );
}

/**
 * Company mark: initials in a circle.
 *
 * The circle used to be tinted from an eight-colour table keyed on the name.
 * The theme's AvatarFallback is `bg-muted text-muted-foreground` — ONE neutral
 * for every person, with no per-name tint anywhere in the product — so the
 * table is deleted. Nothing is lost from the row: the initials are still
 * derived from the name, and every call site prints the full name immediately
 * beside this mark, so the colour was decoration rather than identification.
 */
export function LogoDot({ name }: { name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-raised text-[10px] font-medium text-muted ring-1 ring-inset ring-border"
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
 * otherwise.
 *
 * Shaped as the theme's `line` tab variant: `text-sm font-medium`, inactive at
 * `text-foreground/60`, active at full foreground with a 2px `bg-foreground`
 * underline. The one departure is the rail — the theme's line tabs float with
 * no bottom border, and this keeps `border-b border-line` because inside a list
 * card it is also what separates the tabs from the rows underneath. */
export function ListTabs({ value, onChange }: { value?: SourceTab; onChange?: (v: SourceTab) => void }) {
  const [local, setLocal] = useState<SourceTab>("all");
  const v = value ?? local;
  return (
    <div className="mb-2 mt-2 flex gap-1 border-b border-line">
      {(Object.keys(TAB_LABEL) as SourceTab[]).map((t) => (
        <button
          key={t}
          type="button"
          data-slot="crm-tab"
          aria-selected={v === t}
          onClick={() => { setLocal(t); onChange?.(t); }}
          className={cn(
            "relative inline-flex h-8 items-center rounded-md px-1.5 text-sm font-medium transition-colors",
            "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            v === t ? "text-ink" : "text-ink/60 hover:text-ink",
          )}
        >
          {TAB_LABEL[t]}
          {v === t && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

/** The drawings' "View all …" footer line. It is NOT a link and never was —
 * nothing routes off it — so it stays a paragraph, at the theme's body size. */
export function ViewAllLink({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm font-medium text-ink">{children} →</p>;
}

/* ── World dot-map (Dashboard) ───────────────────────────────────────────── */

/** Stylised dot-grid world map — coarse hand-encoded cells that read as "world
 * map, busy markets darker" at a glance. It renders only when country figures
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
/** Boxes [r0,r1,c0,c1] in the darker ink — the drawing's hot markets. */
const HOT: [number, number, number, number][] = [
  [6, 9, 8, 18],    // United States
  [2, 5, 8, 19],    // Canada
  [4, 6, 28, 29],   // UK + Ireland
  [5, 6, 31, 33],   // Germany
  [9, 13, 41, 44],  // India + Nepal
  [18, 23, 47, 55], // Australia
];

/**
 * The two dot colours were #5B8DEF and #C9D8EE. They are now the theme's chart
 * ramp at the same two lightness steps with the blue taken out: --chart-2
 * (0.556) for a hot market, --chart-1 (0.87) for the rest. The gap between them
 * is 0.31 in lightness, which is what keeps "busy market" readable at a glance
 * now that hue does not carry it.
 */
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
          fill={hot(r, c) ? "var(--chart-2)" : "var(--chart-1)"}
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
