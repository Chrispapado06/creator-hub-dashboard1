/**
 * The demo banner (mounted under DEMO, which OFFLINE implies). Permanent,
 * non-dismissable, above everything.
 *
 * NOT DECORATION. This portal's one standing rule is that it never puts a
 * figure in front of a company that Icefall did not measure — because that
 * company makes commercial decisions on what this screen says. Offline it
 * cannot measure anything: every enquiry, booking, median and revenue figure on
 * screen is invented, and there is no honest way to show them without saying so
 * continuously. The banner is what keeps the whole offline build truthful, so
 * it has no close button and nothing hides it.
 *
 * It also carries the layout offset for the fixed bar, so no screen — including
 * the two full-bleed editors, which are `h-screen` — ends up 32px taller than
 * the window or tucked underneath it.
 */

const H = 32;

const OFFSET_CSS = `
:root { --offline-banner-h: ${H}px; }
#root { padding-top: var(--offline-banner-h); }
.h-screen { height: calc(100vh - var(--offline-banner-h)); }
.min-h-screen { min-height: calc(100vh - var(--offline-banner-h)); }
.sticky.top-0 { top: var(--offline-banner-h); }
.fixed.inset-0 { top: var(--offline-banner-h); }
`;

export function OfflineBanner() {
  return (
    <>
      <style>{OFFSET_CSS}</style>
      <div
        role="note"
        aria-label="Demo — the data on screen is sample data, not real"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: H,
          // Above every overlay in the app — the modals sit at z-50.
          zIndex: 2147483000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          // Not a token: the banner must not follow the theme, because a theme
          // change must never be able to make it quiet.
          background: "#F2B01E",
          color: "#17181B",
          borderBottom: "1px solid rgba(0,0,0,0.28)",
          // It is a statement, never a control. Clicks pass straight through.
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: "#17181B",
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.14em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          DEMO · sample data, not real
        </span>
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: "#17181B",
          }}
        />
      </div>
    </>
  );
}
