/**
 * THE EDITORIAL PALETTE — the tinted surfaces and inks the owner's Explore and
 * Coach designs use, AS CSS VARIABLES so they follow the theme.
 *
 * The designs were drawn light: pastel cards (pale blue, green, lavender,
 * peach) with a saturated ink on each. Written as hex literals, those pastels
 * were the one thing on the pages that could not follow a dark preference —
 * `text-snow` on a `#E6EDFB` card is white on pale blue the moment the theme
 * flips. So every value here is a `var(--ed-…)`, and `index.css` defines each
 * variable twice: the drawing's values under `data-theme="light"`, and a
 * deep, low-chroma tint with a brighter ink for dark. A page written against
 * this palette renders correctly in both without a single conditional.
 *
 * The four literals that are NOT variables are deliberate:
 *
 *   · WHITE and INK are for things drawn ON A PHOTOGRAPH or on the blue
 *     gradient card — a white pill, dark text inside it. A photograph is the
 *     same in both themes, so what sits on it must be too. The light theme
 *     remaps the `white` TOKEN to near-black (so dark-ground lifts become
 *     darkenings), which is exactly why a genuine white is a literal here.
 *   · PRIMARY / ON_PRIMARY are the app's own accent pair, for the one solid
 *     button a page carries — the same pair `Button variant="primary"` uses:
 *     azure with OBSIDIAN text. Obsidian is the canvas token, so it is dark ink
 *     on the dark theme's light azure (≈7:1) and warm-white on the light
 *     theme's saturated blue (≈5:1). White text would have been 2.9:1 in dark.
 */

/** Genuinely white — on photographs and the gradient card only. */
export const WHITE = "#FFFFFF";
/** Dark ink for text inside a WHITE pill on a photograph. */
export const INK = "#1D222A";

/** A tile or row surface sitting on a tinted card: white in light, raised in dark. */
export const TILE = "var(--ed-tile)";

/** The four tinted surfaces. */
export const TINT = {
  blue: "var(--ed-tint-blue)",
  green: "var(--ed-tint-green)",
  lavender: "var(--ed-tint-lavender)",
  peach: "var(--ed-tint-peach)",
} as const;

/** The ink that sits on each tint — icon, chip text, eyebrow. */
export const ACCENT = {
  blue: "var(--ed-on-blue)",
  green: "var(--ed-on-green)",
  lavender: "var(--ed-on-lavender)",
  peach: "var(--ed-on-peach)",
} as const;

/** The page's one solid button. */
export const PRIMARY = "var(--ice-azure)";
export const ON_PRIMARY = "var(--ice-obsidian)";

/** The dark navy button the Progress design draws: navy in light, azure in dark. */
export const STRONG = "var(--ed-strong)";
export const ON_STRONG = "var(--ed-on-strong)";
