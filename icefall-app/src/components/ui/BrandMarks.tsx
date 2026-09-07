/**
 * Sign-in provider marks.
 *
 * These replace a lucide apple (the fruit, not the company) and the bare letters
 * "G" and "M". A sign-in button carrying the wrong mark reads as a phishing page
 * to anybody who has seen the real one, which is the worst possible first
 * impression on the first screen of an app asking for an account.
 *
 * Drawn inline rather than fetched: each provider's brand guidelines require the
 * mark be shown unaltered and at a legible size, and an <img> to a CDN would
 * make the button flash empty on a slow connection — on the one screen where
 * hesitation costs a sign-up. Google's is the four-colour G, Apple's is the
 * monochrome mark on the button's own colour, Microsoft's is the four squares.
 *
 * COLOUR IS NOT A THEME DECISION, with one exception that is itself a rule.
 * Google's G and Microsoft's four squares carry fixed hex values and must never
 * be re-tinted — a white Google G is not the Google G, and reaching for
 * `currentColor` "so it matches the theme" is the exact instinct their brand
 * terms forbid. Apple's mark is the exception and takes `currentColor` on
 * purpose: it is specified as monochrome and may be black OR white to sit on the
 * button's own colour, which on this dark screen means white. That is Apple's
 * own rule being followed, not this file bending it.
 */
import type { ReactElement } from "react";

export function GoogleMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

export function AppleMark({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M17.05 12.72c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.05-2.75-4.15zM14.5 4.9c.71-.87 1.19-2.07 1.06-3.27-1.02.04-2.26.68-3 1.54-.66.77-1.24 2-1.08 3.18 1.14.09 2.3-.58 3.02-1.45z" />
    </svg>
  );
}

export function MicrosoftMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 23 23" aria-hidden focusable="false">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}

/* ==========================================================================
 * PLATFORM MARKS — the second question this file answers.
 *
 * Added 2026-09-03, by merging a file that should never have been started.
 * `PlatformMark.tsx`, in a sibling directory that has since been deleted, was
 * written as a parallel answer to the same question this file already answered,
 * by somebody who did not know this file existed. Its geometry was moved here
 * as whole lines and its directory removed, so there is no second copy left to
 * find. Two files holding brand geometry is how one of them goes stale:
 * a brand changes its mark, somebody finds one copy, and the other keeps
 * shipping last year's logo with no test able to notice. So there is one file,
 * and this is it. A ninth platform is added HERE.
 *
 * These marks are NOT sign-in providers, and the difference decides how they
 * behave. The three above sit on a sign-in button, where a wrong or missing
 * mark reads as a phishing page — so each is a component that always renders.
 * The eight below label ANSWERS to an optional question ("where did you find
 * ICEFALL?"), where the honest fallback is no mark at all and a word instead —
 * so `PlatformMark` is allowed to return null, and `hasPlatformMark` exists so
 * a caller can ask first.
 *
 *
 * WHERE THE GEOMETRY CAME FROM. NONE OF IT WAS DRAWN FROM MEMORY.
 *
 * Every `path` string below was copied verbatim on 2026-09-03 out of
 *     ofm-workspace/node_modules/simple-icons/icons/<slug>.svg
 * from simple-icons 16.27.1, licence CC0-1.0. Each file there is a single
 * `<path>` on a `viewBox="0 0 24 24"` with no circles, rects or fill-rule
 * attributes, which is why every entry is one string and one component renders
 * all eight identically. That was checked per file, not assumed. When these
 * were merged into this file they were moved as whole lines rather than
 * retyped, because a single wrong character in a path is a logo that is nearly
 * right, which is worse than one that is obviously wrong.
 *
 * simple-icons is deliberately NOT added to package.json for this: it is 3450
 * icons for eight uses, the paths are CC0 and frozen until a brand redraws its
 * logo, and vendoring the data with its source written down is already this
 * codebase's habit (`treks/credits.ts`, `public/img/CREDITS.md`). A `.svg` on
 * disk was also rejected — the app ships none, vite has no SVG loader, and
 * image directories here have silently gone missing from deploys before. A
 * TypeScript module cannot fail that way: a missing one is a build error.
 *
 * If you are here to add a ninth platform: find its real geometry or ship it as
 * text. lucide-react is already installed and still carries a few legacy brand
 * icons — its Instagram is a rounded rectangle with a dot, its `twitter` is the
 * retired bird — and reaching for those because they are already there is
 * exactly the failure this section exists to prevent.
 *
 *
 * MONOCHROME GLYPHS, NOT THE FULL-COLOUR LOCKUPS
 *
 * Said plainly so nobody reports it as a bug or, worse, "fixes" it. Instagram's
 * real logo is a pink-to-orange-to-purple gradient; below is Instagram's
 * official camera glyph in one flat colour. TikTok's real mark has the cyan and
 * magenta chromatic offset; below is the note glyph, flat. `hex` is the brand's
 * stated primary colour, which is not the same thing as the logo's colouring.
 * If the full gradient lockups are ever wanted that is a different job: get the
 * official assets from each brand's own resources page under that brand's
 * terms. Do not try to reconstruct a gradient here.
 *
 *
 * THE COLOUR RULE, AND WHY IT IS NOT THE SAME RULE AS THE THREE ABOVE
 *
 * The header of this file states the rule for sign-in providers: Google's G and
 * Microsoft's squares carry fixed hex and are never re-tinted, Apple's mark is
 * specified as monochrome and may be black OR white. That rule still stands and
 * nothing below touches it.
 *
 * The platform marks add a case that rule does not cover, and it is a measured
 * one. TikTok, X and Threads all publish #000000 as their primary colour.
 * ICEFALL's canvas is --ice-obsidian #05070B and its chips are --ice-elevated
 * #1E2530, so painting those three in their brand colour gives 1.04:1 and
 * 1.36:1. That is not "a bit dark", it is invisible: the glyph is in the DOM,
 * the layout reserves its box, tsc is green and nothing logs — the same
 * signature as the Stagger/Rise opacity trap, reached a different way.
 *
 * So `tone="brand"` does NOT blindly paint `hex`. Each entry carries `onDark`,
 * the colour actually painted, and `contrastOnObsidian`, the measured ratio
 * that decided it. Where the brand colour clears 3:1 against both surfaces it
 * is used unchanged; where it does not, `onDark` is "currentColor" and the mark
 * inherits the row's ink — which is a monochrome brand's own rule being
 * followed, not this file bending one. Both are data rather than a condition
 * hidden in the render, so a future reader can see the 1.04 for themselves
 * instead of finding a mystery special-case and deleting it. The tightest
 * passing measurement is Facebook at 3.20:1 on a chip.
 *
 * `hex` is recorded faithfully and is NEVER edited to suit this background. The
 * brand's colour and the colour we paint are two facts and they stay two
 * fields.
 *
 *
 * TRADEMARK
 *
 * Using Instagram's mark to label the answer "I found ICEFALL on Instagram" is
 * nominative use: it identifies the platform, it is not decoration, and it does
 * not suggest Instagram endorses, sponsors or is affiliated with ICEFALL. There
 * is no way to say "Instagram" without saying Instagram. `booking/PayMarks.tsx`
 * draws this same line for wallets, and draws the other side of it too — an
 * operator's logo beside a rating ICEFALL invented stays out of every build.
 * The condition on all of it is accuracy, which is what the provenance note
 * above is for.
 *
 *
 * WHAT IS DELIBERATELY MISSING
 *
 * `PlatformKey` is exactly the set of platforms whose real mark is held here.
 * It is not the set of answers the question offers, and it must never be
 * confused for it. Two known gaps, both of which ship as text:
 *
 *   LINKEDIN has no mark because simple-icons does not carry one — it was
 *   removed at the brand's request and `icons/linkedin.svg` genuinely does not
 *   exist in the package. There is no accurate CC0 LinkedIn glyph to copy, so
 *   LinkedIn is a word. Not an approximation, not a generic chain-link, not a
 *   lowercase "in" in a blue box. A word.
 *
 *   "A SEARCH ENGINE" must never get Google's G — and note that this file holds
 *   a real one, twenty lines up, which is what makes the temptation live rather
 *   than theoretical. Somebody who arrived by search may have used Bing,
 *   DuckDuckGo, or whatever Safari was set to. One company's mark on that row
 *   would invent a fact about which engine it was. A neutral lucide `Search`
 *   glyph, or nothing.
 *
 * The same reasoning covers every non-platform answer — a friend, a guide, a
 * podcast, somewhere else. They are words, optionally with a neutral lucide
 * pictogram, and they are not brands.
 *
 *
 * ACCESSIBILITY, AND A DELIBERATE DIVERGENCE FROM PayMarks.tsx
 *
 * These render `aria-hidden` with `focusable="false"`, because they are always
 * accompanied by the platform's name as visible text — the answer row says
 * "Instagram" whether or not the glyph is there, and `role="img"
 * aria-label="Instagram"` beside the word Instagram makes a screen reader say
 * it twice. `PayMarks.tsx` does the opposite and is right to: its marks stand
 * alone with no text, so there the label is the only name the control has. Two
 * layouts, two answers, and this line exists so the difference reads as a
 * decision rather than a slip.
 *
 * The consequence is a requirement on the caller: the text label is not
 * optional. A row that renders only the mark is a row with no accessible name.
 * ========================================================================== */

/**
 * Platforms whose real, officially-sourced mark is held in this file.
 *
 * Adding a key here is a claim that accurate geometry exists below. It is not a
 * list of the answers the question offers, and there is no key for a platform
 * we only have a guess at.
 */
export type PlatformKey =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "facebook"
  | "x"
  | "threads"
  | "reddit"
  /* Added 2026-09-07 for the "Connect your accounts" page at the end of
     sign-up. Same source, same version, same verbatim-copy rule as the seven
     above; the provenance note in the file header covers them. */
  | "strava"
  | "komoot"
  | "alltrails"
  /* Added 2026-09-07 for the watch-accounts feature. Garmin's own geometry,
     held here because this is the one file that holds geometry — but it is
     NOT rendered anywhere yet. See the entry below for the exact condition
     that unlocks it.
     ⚠️ THE TRAP: `simple-icons/icons/polars.svg` EXISTS, and it is NOT this
     brand. It is Polars, the Rust/Python dataframe library (pola.rs,
     #0075FF) — a different company that happens to alphabetize next to
     "Polar" in a directory listing. Using it for the Polar Electro watch
     tile would put a stranger's logo on a page about somebody's own watch,
     which is worse than the plain-text fallback this file's own rule
     prescribes. Polar Electro has no mark in this package at all (verified
     by listing it) and ships as text, exactly like COROS and Suunto. */
  | "garmin";

export interface PlatformMarkData {
  /** The brand's own spelling. "X", not "Twitter". "TikTok", not "Tiktok". */
  label: string;
  /** Single-path glyph, viewBox "0 0 24 24", verbatim from simple-icons 16.27.1. */
  path: string;
  /**
   * The brand's published primary colour, recorded as the brand states it and
   * never edited to suit this app's background. This is NOT always the colour
   * that gets painted — see `onDark`.
   */
  hex: `#${string}`;
  /** The brand's own guidelines page, or null where the brand publishes none. */
  guidelines: string | null;
  /** Where simple-icons records having taken the mark from. */
  source: string;
  /**
   * What `tone="brand"` actually paints on ICEFALL's dark ground: either `hex`
   * unchanged, or the literal "currentColor" where `hex` is unreadable here.
   * Decided by measurement, not taste — see the contrast note in the header.
   */
  onDark: string;
  /**
   * Measured WCAG contrast ratio of `hex` against --ice-obsidian (#05070B),
   * the app canvas. Recorded so the `onDark` substitution can be checked rather
   * than trusted. Anything under 3 is unusable as a brand colour here.
   */
  contrastOnObsidian: number;
}

/**
 * The marks themselves.
 *
 * Generated by copying each `d` attribute out of simple-icons 16.27.1 rather
 * than by hand, because a single mistyped character in a path turns a brand's
 * logo into a shape that is nearly right, which is worse than one that is
 * obviously wrong. If a mark ever needs re-checking, the file it came from is
 * named in `source` and the geometry is whatever that package ships.
 */
export const PLATFORM_MARKS: Record<PlatformKey, PlatformMarkData> = {
  instagram: {
    label: "Instagram",
    path: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
    hex: "#FF0069",
    guidelines: "https://about.meta.com/brand/resources/instagram",
    source: "https://about.meta.com/brand/resources/instagram",
    // 5.24:1 on the canvas, 4.00:1 on a chip. Both clear 3:1, so the brand colour is used unchanged.
    onDark: "#FF0069",
    contrastOnObsidian: 5.24,
  },
  youtube: {
    label: "YouTube",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
    hex: "#FF0000",
    guidelines:
      "https://www.youtube.com/howyoutubeworks/resources/brand-resources/#logos-icons-and-colors",
    source:
      "https://www.youtube.com/howyoutubeworks/resources/brand-resources/#logos-icons-and-colors",
    // 5.04:1 on the canvas, 3.85:1 on a chip. Both clear 3:1, so the brand colour is used unchanged.
    onDark: "#FF0000",
    contrastOnObsidian: 5.04,
  },
  tiktok: {
    label: "TikTok",
    path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
    hex: "#000000",
    guidelines: null,
    source: "https://tiktok.com",
    // 1.04:1 on the canvas, 1.36:1 on a chip. Invisible. The brand publishes black; this app has no
    // light surface to put it on, so the mark inherits the row's ink instead.
    onDark: "currentColor",
    contrastOnObsidian: 1.04,
  },
  reddit: {
    label: "Reddit",
    path: "M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z",
    hex: "#FF4500",
    guidelines: "https://www.redditinc.com/brand",
    source: "https://www.redditinc.com/brand",
    // 5.86:1 on the canvas, 4.48:1 on a chip. Both clear 3:1, so the brand colour is used unchanged.
    onDark: "#FF4500",
    contrastOnObsidian: 5.86,
  },
  x: {
    label: "X",
    path: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
    hex: "#000000",
    guidelines: "https://about.x.com/en/who-we-are/brand-toolkit",
    source: "https://x.com",
    // 1.04:1 on the canvas, 1.36:1 on a chip. Invisible. The brand publishes black; this app has no
    // light surface to put it on, so the mark inherits the row's ink instead.
    onDark: "currentColor",
    contrastOnObsidian: 1.04,
  },
  facebook: {
    label: "Facebook",
    path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
    hex: "#0866FF",
    guidelines: "https://about.meta.com/brand/resources/facebook/logo",
    source: "https://about.meta.com/brand/resources/facebook/logo",
    // 4.18:1 on the canvas, 3.20:1 on a chip. Both clear 3:1, so the brand colour is used unchanged.
    onDark: "#0866FF",
    contrastOnObsidian: 4.18,
  },
  threads: {
    label: "Threads",
    path: "M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z",
    hex: "#000000",
    guidelines: "https://www.meta.com/brand/resources/instagram/threads",
    source: "https://www.meta.com/brand/resources/instagram/threads",
    // 1.04:1 on the canvas, 1.36:1 on a chip. Invisible. The brand publishes black; this app has no
    // light surface to put it on, so the mark inherits the row's ink instead.
    onDark: "currentColor",
    contrastOnObsidian: 1.04,
  },
  /* ---- Connected-account providers ------------------------------------
     Not "heard about" platforms. They label rows on the sign-up page where an
     athlete links an account. Kept in this file because it is the one place
     brand geometry lives — see the header. */
  strava: {
    label: "Strava",
    path: "M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169",
    hex: "#FC4C02",
    // Strava publishes brand guidelines but no stable URL simple-icons records; the app-store listing is what it cites.
    guidelines: null,
    source: "https://itunes.apple.com/us/app/strava-running-and-cycling-gps/id426826309",
    // 5.93:1 on the canvas, 4.53:1 on a chip. Both clear 3:1, so the brand colour is used unchanged.
    onDark: "#FC4C02",
    contrastOnObsidian: 5.93,
  },
  komoot: {
    label: "Komoot",
    path: "M9.8 14.829l2.2-3.43 2.2 3.43 5.962 5.962A11.946 11.946 0 0 1 12 24c-3.043 0-5.935-1.14-8.162-3.209zM0 12C0 5.385 5.385 0 12 0c6.62 0 12 5.385 12 12 0 2.663-.855 5.175-2.469 7.284l-6.018-6.018c.15-.412.226-.839.226-1.27A3.743 3.743 0 0 0 12 8.257a3.743 3.743 0 0 0-3.739 3.739c0 .431.075.858.226 1.27l-6.018 6.018A11.865 11.865 0 0 1 0 12Z",
    hex: "#6AA127",
    guidelines: "https://newsroom.komoot.com/media_kits/219423/",
    source: "https://newsroom.komoot.com/media_kits/219423/",
    // 6.47:1 on the canvas, 4.95:1 on a chip. Both clear 3:1, so the brand colour is used unchanged.
    onDark: "#6AA127",
    contrastOnObsidian: 6.47,
  },
  alltrails: {
    label: "AllTrails",
    path: "M19.441 8.451c-.653-1.247-1.158-1.841-1.813-1.841-.731 0-1.053.387-1.494 1.079-.357.464-.7 1.1-1.273 1.036-.604-.063-.954-1.491-1.41-2.686-.625-1.63-.985-3.322-2.024-3.322-.593 0-1.111.54-1.915 1.747l-8.301 12.73c-.954 1.593-1.753 2.704-.742 3.748 1.187 1.142 3.975-.857 5.883-2.063 1.908-1.205 3.859-2.38 6.615-2.316 3.71.085 5.512 3.808 7.76 4.516 1.526.487 2.926-.074 3.223-1.65.174-.866-.129-1.707-.547-2.604zm-.254 7.467c-.753.56-1.803-.339-2.481-.72-.72-.401-1.94-1.364-4.124-1.332-1.78.021-2.745.687-3.805 1.407-2.3 1.565-4.379 3.384-4.972 2.443-.382-.603.646-1.809 3.063-5.574 1.718-2.676 2.927-4.813 3.785-4.813.948 0 1 .93 1.145 1.883.272 1.518 1.014 2.308 1.978 2.433 1.08.146 2.014-.76 2.756-.751.693.014 1.15 1.018 1.722 2.065.725 1.301 1.482 2.546.933 2.959z",
    hex: "#142800",
    guidelines: null,
    source: "https://www.alltrails.com/press?section=press-page-kit",
    // 1.28:1 on the canvas, 1.02:1 on a chip. INVISIBLE on this ground, so the
    // mark inherits the row's ink. The sign-up tiles paint it white on a tile
    // filled with `hex` — which is legible (13.8:1) and is the brand's own colour.
    onDark: "currentColor",
    contrastOnObsidian: 1.28,
  },
  /* -------------------------------------------------------------------
     GARMIN — added 2026-09-07 for the watch-accounts feature.

     Verified against the source file at
     ofm-workspace/node_modules/simple-icons/icons/garmin.svg
     (simple-icons 16.27.1, CC0-1.0): the `d` string below is 3130
     characters, sha256 0935c6c4a0cec8ffd1c6593831e1bc123495c3867d6031b6ac
     55ac4a1ffb4629, begins "M6.265 12.024a.289.289 0 0 0-.236-.146h-" and
     ends "9 0-.051-.045-.065-.091-.065h-.085v.134z".

     THIS ENTRY IS NOT RENDERED ANYWHERE. Garmin's own API Brand Guidelines
     forbid the Garmin tag logo "in instances where Garmin device-sourced
     data is not present", and today no Garmin data is present anywhere in
     ICEFALL — there is no Garmin adapter (registry.ts gate: "not-built").
     The geometry belongs in the one file that holds geometry; the watch
     tile does not get it — see WatchTile in watch/WatchTile.tsx, which
     draws every provider with the same neutral lucide Watch glyph.
     The exact condition that unlocks it: Garmin Activity API approval AND
     Garmin data actually on the surface that draws it. Until then, calling
     `PlatformMark({platform:"garmin"})` anywhere is the bug this comment
     exists to prevent. */
  garmin: {
    label: "Garmin",
    path: "M6.265 12.024a.289.289 0 0 0-.236-.146h-.182a.289.289 0 0 0-.234.146l-1.449 3.025c-.041.079.004.138.094.138h.335c.132 0 .193-.061.228-.134.037-.073.116-.234.13-.266.02-.045.083-.071.175-.071h1.559c.089 0 .148.016.175.071.018.035.098.179.136.256a.24.24 0 0 0 .234.142h.486c.089 0 .13-.069.098-.132-.034-.061-1.549-3.029-1.549-3.029zm-.914 2.224c-.089 0-.132-.067-.094-.148l.571-1.222c.039-.081.1-.081.136 0l.555 1.222c.037.081-.006.148-.096.148H5.351zm12.105-2.201v3.001c0 .083.073.138.163.138h.396c.089 0 .163-.057.163-.146v-2.998c0-.089-.059-.163-.148-.163h-.411c-.09-.001-.163.054-.163.168zm-6.631 1.88c-.051-.073-.022-.154.063-.181 0 0 .342-.102.506-.25.165-.146.246-.36.246-.636a1 1 0 0 0-.096-.457.787.787 0 0 0-.27-.303 1.276 1.276 0 0 0-.423-.171c-.165-.035-.386-.047-.386-.047a8.81 8.81 0 0 0-.325-.008H8.495a.164.164 0 0 0-.163.163v2.998c0 .089.073.146.163.146h.388c.089 0 .163-.057.163-.146v-1.193s.002 0 .002-.002l.738-.002c.089 0 .205.061.258.134l.766 1.077c.071.096.138.132.228.132h.508c.089 0 .104-.085.073-.128-.032-.038-.794-1.126-.794-1.126zm-.311-.61a1.57 1.57 0 0 1-.213.028 8.807 8.807 0 0 1-.325.006h-.763a.164.164 0 0 1-.163-.163v-.608c0-.089.073-.163.163-.163h.762c.089 0 .236.004.325.006 0 0 .114.004.213.028a.629.629 0 0 1 .24.098.358.358 0 0 1 .126.148.473.473 0 0 1 0 .374.352.352 0 0 1-.126.148.617.617 0 0 1-.239.098zm11.803-1.439c-.089 0-.163.059-.163.146v1.919c0 .089-.051.11-.114.047l-1.921-1.992a.376.376 0 0 0-.276-.118h-.362c-.114 0-.163.061-.163.122v3.068c0 .061.059.12.148.12h.362c.089 0 .152-.049.152-.132l.002-2.021c0-.089.051-.11.114-.045l2.004 2.082a.36.36 0 0 0 .279.116h.272a.164.164 0 0 0 .163-.163v-2.986a.164.164 0 0 0-.163-.163h-.334zm-7.835 1.87c-.043.079-.116.077-.159 0l-.939-1.724a.262.262 0 0 0-.236-.146h-.51a.164.164 0 0 0-.163.163v2.996c0 .089.059.15.163.15h.317c.089 0 .154-.057.154-.142 0-.041.002-2.179.004-2.179.004 0 1.173 2.177 1.173 2.177a.105.105 0 0 0 .189 0s1.179-2.173 1.181-2.173c.004 0 .002 2.11.002 2.173 0 .087.069.142.159.142h.364c.089 0 .163-.045.163-.163V12.04a.164.164 0 0 0-.163-.163h-.488a.265.265 0 0 0-.244.142l-.967 1.729zM0 13.529c0 1.616 1.653 1.697 1.984 1.697 1.098 0 1.561-.297 1.58-.309a.29.29 0 0 0 .152-.264v-1.116a.186.186 0 0 0-.187-.187H2.151c-.104 0-.171.083-.171.187v.116c0 .104.067.187.171.187h.797a.14.14 0 0 1 .14.14v.52c-.157.065-.874.274-1.451.136-.836-.199-.901-.89-.901-1.096 0-.173.053-1.043 1.079-1.13.831-.071 1.378.264 1.384.268.098.051.199.014.254-.089l.104-.209c.043-.085.028-.175-.077-.246-.006-.004-.59-.319-1.494-.319C.055 11.813 0 13.354 0 13.529zm22.134-2.478h-2.165c-.079 0-.148-.039-.187-.108s-.039-.146 0-.215l1.084-1.874a.21.21 0 0 1 .187-.108.21.21 0 0 1 .187.108l1.084 1.874a.203.203 0 0 1 0 .215.22.22 0 0 1-.19.108zm1.488 3.447c.207 0 .378.169.378.378a.379.379 0 0 1-.378.378.379.379 0 0 1-.378-.378.38.38 0 0 1 .378-.378zm.002.7c.173 0 .305-.14.305-.321s-.13-.321-.305-.321-.307.14-.307.321c0 .18.13.321.307.321zm-.146-.543h.169c.102 0 .152.041.152.124 0 .071-.045.122-.114.122l.126.195h-.077l-.124-.195h-.061v.195h-.073v-.441h.002zm.073.189h.085c.055 0 .091-.012.091-.069 0-.051-.045-.065-.091-.065h-.085v.134z",
    hex: "#000000",
    guidelines: "https://creative.garmin.com/styleguide/brand/",
    source: "https://creative.garmin.com/styleguide/logo/",
    // 1.04:1 on the canvas, 1.36:1 on a chip — the same measurement already
    // recorded for TikTok, X and Threads, which publish the same black.
    // Invisible here, so the mark inherits the row's ink.
    onDark: "currentColor",
    contrastOnObsidian: 1.04,
  },
};

/**
 * A stable enumeration of the marks this file holds.
 *
 * This is NOT the order the question should list its answers in. The caller
 * owns that, because the answer list contains things this file knows nothing
 * about — a friend, a guide, a podcast, "I don't remember" — and their
 * placement is a decision about the question, not about the icons. This export
 * exists so that two screens iterating the marks cannot end up disagreeing
 * about the order, and so `Object.keys` is never relied on for it.
 */
export const PLATFORM_ORDER: readonly PlatformKey[] = [
  "instagram",
  "youtube",
  "tiktok",
  "reddit",
  "x",
  "facebook",
  "threads",
] as const;

/**
 * Whether an arbitrary option id has a real mark in this file.
 *
 * The question's answer list is wider than `PlatformKey` — it contains
 * LinkedIn, "a search engine", "a friend or someone I climb with" and
 * "I don't remember", none of which have or should have a brand glyph. A caller
 * holding a plain string id uses this to decide, and the type guard means the
 * true branch narrows to `PlatformKey` so `PLATFORM_MARKS[id]` type-checks.
 *
 * The row must read correctly with no mark at all. Lay it out so the label
 * carries the row and the glyph is an optional leading element — a fixed-width
 * icon slot left empty for LinkedIn produces a visible notch in the column,
 * which is worse than no icons anywhere. If that proves fiddly, the honest
 * fallback is to drop the marks from the whole list rather than to draw the one
 * that is missing.
 *
 *     {hasPlatformMark(o.id)
 *       ? <PlatformMark platform={o.id} size={18} />
 *       : null}
 *     <span>{o.label}</span>
 */
export function hasPlatformMark(id: string): id is PlatformKey {
  return Object.prototype.hasOwnProperty.call(PLATFORM_MARKS, id);
}

/**
 * One platform mark.
 *
 * Returns null for anything not in `PLATFORM_MARKS`, which under a correct
 * `PlatformKey` cannot happen — the guard is there for the case where an id
 * arrives from stored data or a cast, and for the day somebody widens the union
 * before adding the geometry. Rendering nothing is the right answer in both
 * cases; rendering a placeholder box would be this file inventing a logo.
 *
 * `tone="brand"` paints `onDark` (the brand colour where it is legible here,
 * currentColor where it is not). `tone="current"` always inherits, which is
 * what a selected row wants when the row is already tinted azure — a Reddit
 * orange sitting inside a row that has gone azure looks like a rendering fault
 * rather than a brand colour.
 *
 * `aria-hidden` is not an oversight. See the accessibility note in the file
 * header: the caller is required to render the platform's name as text, and
 * this glyph would otherwise make a screen reader announce it twice.
 */
export function PlatformMark({
  platform,
  size = 18,
  tone = "brand",
  className,
}: {
  platform: PlatformKey;
  /** Pixel box. Default 18, matching the lucide icons used in onboarding rows. */
  size?: number;
  tone?: "brand" | "current";
  className?: string;
}): ReactElement | null {
  const mark = PLATFORM_MARKS[platform];
  if (!mark) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill={tone === "current" ? "currentColor" : mark.onDark}
      aria-hidden
      focusable="false"
    >
      <path d={mark.path} />
    </svg>
  );
}

/**
 * One sentence for Settings -> About ICEFALL -> "Where the data comes from",
 * alongside the existing OpenStreetMap, Wikimedia and Open-Meteo rows.
 *
 * CC0-1.0 waives the requirement to attribute, so this is not a licence
 * obligation. It is here because this codebase credits its sources anyway, and
 * because an uncredited brand mark is exactly the kind of thing a reader stops
 * on and wonders about. It says "not affiliated" out loud for the same reason:
 * the marks appear next to a question about where somebody heard of ICEFALL,
 * and nothing on that screen should be readable as a partnership.
 */
export const PLATFORM_MARK_ATTRIBUTION =
  "Platform logos are from simple-icons (version 16.27.1), released under CC0-1.0. " +
  "Each is the platform's own glyph in a single colour, not its full-colour logo. " +
  "They name the platforms you can pick when ICEFALL asks where you found it, " +
  "and the watch services you can connect an account to. " +
  "ICEFALL is not affiliated with, endorsed by or sponsored by any of them.";
