import { Link, useLocation } from "react-router-dom";

/**
 * OFFLINE DEMO · sample data, not real
 *
 * The single most important element in offline mode, and the only one that is
 * not allowed to be tasteful about it.
 *
 * ICEFALL's whole discipline is that it never shows a number it cannot measure.
 * Offline it can measure nothing at all: every guide, every price, every
 * expedition on the screen behind this bar was written by hand for a demo.
 * The bar is what keeps that honest, so it is:
 *
 *   • PERMANENT — fixed to the top of the viewport, present on every route,
 *     including the launch page.
 *   • NON-DISMISSABLE — there is no close control, and nothing in the app can
 *     unmount it. It is rendered above <App/> in `main.tsx`, outside the router
 *     outlet, so no screen can paint over it.
 *   • LOUD — full-bleed amber against a near-black product. It is not chrome.
 *
 * It doubles as the offline map of the site, because the three ICEFALL surfaces
 * live at three unrelated roots (`/`, `/preview`, `/app`) and nothing on the
 * launch page links to the other two. Without these links a reader offline
 * would see the waitlist page and have no way to reach the marketplace or the
 * app except by typing a URL.
 */

/** Matches `--offline-banner-h` below. Kept in one place so the two agree. */
const HEIGHT = 38;

/**
 * The two product surfaces exist in a dev server only — `src/App.tsx` puts the
 * `lazy()` calls for both inside `import.meta.env.DEV` so Rollup drops them
 * from a public build. Linking to a route that cannot exist would be its own
 * small lie, so the links appear only where the routes do.
 */
const SURFACES = import.meta.env.DEV;

export function OfflineBanner() {
  const { pathname } = useLocation();

  /*
   * Which of the three you are looking at, decided the same way `App.tsx`
   * decides it offline: `/` is the launch page, anything under `/app` is the
   * dashboard, and EVERYTHING ELSE is the marketplace — because offline it
   * answers at the root as well as at /preview, so `/guides` is a marketplace
   * page too. Testing `startsWith("/preview")` would leave every one of those
   * pages showing no pill lit at all.
   */
  const surface = pathname === "/" ? "/" : pathname === "/app" || pathname.startsWith("/app/") ? "/app" : "/preview";

  return (
    <>
      {/*
        Injected here rather than in `index.css` so that not one byte of it
        applies when the flag is unset — this component is the only thing that
        mounts it.

        The rules after the padding are the reason this is a stylesheet and not
        just an inline style. A fixed bar over a page whose own headers are
        `position: sticky; top: 0` puts those headers UNDERNEATH it the moment
        you scroll — the marketplace nav and the dashboard top bar would both
        disappear behind this.

        They are named by their z-index rather than by `.sticky.top-0` alone,
        because "sticks to the viewport" and "sticks to the top of its own
        scrolling panel" are the same two classes in Tailwind and only the first
        wants moving. The three that want it are `Shell.tsx`'s header (z-30),
        `DashboardShell.tsx`'s top bar (z-20) and its full-height sidebar. The
        message-list section headings in `Messages.tsx` (z-10) stick inside an
        `overflow-y-auto` panel and are deliberately left alone.

        Every rule here is unlayered, so it outranks Tailwind's `@layer
        utilities` regardless of specificity.
      */}
      <style>{`
        :root { --offline-banner-h: ${HEIGHT}px; }
        body { padding-top: var(--offline-banner-h); }
        .sticky.top-0.z-30,
        .sticky.top-0.z-20,
        .sticky.top-0.h-screen { top: var(--offline-banner-h); }
        .sticky.top-0.h-screen { height: calc(100vh - var(--offline-banner-h)); }
        .min-h-screen { min-height: calc(100vh - var(--offline-banner-h)); }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          /*
           * Above everything. The tallest stacking context this app creates is
           * the auth modal at z-50; a fixed bar that a modal could cover would
           * stop being permanent at the worst possible moment.
           */
          zIndex: 2147483647,
          height: `${HEIGHT}px`,
          display: "flex",
          alignItems: "center",
          gap: "14px",
          padding: "0 16px",
          background: "var(--ice-alert, #D9A244)",
          color: "#1A1206",
          borderBottom: "1px solid rgba(0,0,0,0.35)",
          boxShadow: "0 6px 22px -12px rgba(0,0,0,0.9)",
          fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
          fontSize: "12px",
          overflowX: "auto",
          whiteSpace: "nowrap",
        }}
      >
        {/*
          The sentence, exactly as the contract words it, and set so both halves
          keep the case they were written in — "OFFLINE DEMO" is a label and
          "sample data, not real" is a statement, and flattening them to one
          typographic voice loses that.
        */}
        <span style={{ fontWeight: 700, letterSpacing: "0.12em", fontSize: "11px" }}>
          OFFLINE DEMO
        </span>
        <span aria-hidden style={{ opacity: 0.45 }}>·</span>
        <span style={{ fontWeight: 500 }}>sample data, not real</span>

        {SURFACES && (
          <nav
            aria-label="Offline demo surfaces"
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <BannerLink to="/" label="Launch page" active={surface === "/"} />
            <BannerLink to="/preview" label="Marketplace" active={surface === "/preview"} />
            <BannerLink to="/app" label="App" active={surface === "/app"} />
          </nav>
        )}
      </div>
    </>
  );
}

function BannerLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      style={{
        color: "#1A1206",
        textDecoration: "none",
        fontSize: "10.5px",
        fontWeight: active ? 600 : 500,
        letterSpacing: "0.09em",
        padding: "3px 9px",
        borderRadius: "999px",
        border: "1px solid rgba(0,0,0,0.35)",
        background: active ? "rgba(0,0,0,0.22)" : "transparent",
      }}
    >
      {label}
    </Link>
  );
}
