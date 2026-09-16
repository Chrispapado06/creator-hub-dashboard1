/**
 * MOUNTAIN MODE'S OWN LAYOUT (brief M4, plan §3.1).
 *
 * Not the full app's: no AppTopBar, no floating tab pill, no session gate, no
 * entrance animation. A top bar (MOUNTAIN MODE · signal · battery · SOS), the
 * screen, and four 68 px tabs in thumb reach. Everything the full app has for
 * exploring, guides, operators, treks, social, the shop and settings is simply
 * not here.
 *
 * `<main>` is the scroll container. Screens render content only; they do not
 * add a scroller, a top bar or bottom tabs of their own.
 */

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Backpack, ChevronDown, Map as MapIcon, Mountain as MountainIcon, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { DEMO } from "@/offline/offline";
import { useMountainDocument, useReportMountainRuntime } from "@/settings/useMountainSettings";
import { activeSessionSummary } from "@/tracking/activeSession";
import { readConnectivity, useConnectivity, type ConnectivitySignal } from "@/trip/connectivity";

import { useBattery } from "./battery";
import { useBreadcrumbRecorder } from "./breadcrumbs";
import { enterMountainMode, leaveMountainMode } from "./mode";
import { MOUNTAIN_PATHS } from "./paths";
import { useMountainTrip } from "./trip";
import { buttonClass } from "./ui";
import { useSignalPill } from "./useSignal";
/* Dark, glare and large-text tokens. Imported by the shell, so they exist for
   every Mountain screen and for none of the full app's. */
import "./mountainTheme.css";

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

/** The minimum glove-sized tap target, in px (plan §3.0). */
export const TAP_MIN_PX = 64;
/** Mountain mode's own tab bar height, in px (plan §3.1). */
export const MOUNTAIN_TABBAR_PX = 68;

/**
 * Whether "Open full app" may navigate. Offline, the full app's login check can
 * hang with no time limit (plan §2.9), so it does not — except in demo builds,
 * which have no login check.
 */
export function canOpenFullApp(signal: ConnectivitySignal = readConnectivity()): boolean {
  return DEMO || signal.state !== "unreachable";
}

/**
 * The red SOS control. Opens the SOS screen; it never dials (plan §3.1).
 *
 * A ROUNDED RECTANGLE, NOT A CIRCLE (mockup spec §0): the circle read as a
 * decorative badge, and the owner's mockups draw it as a solid red button the
 * width of the word.
 */
export function SosButton({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const here = pathname === MOUNTAIN_PATHS.sos;
  return (
    <Link
      to={MOUNTAIN_PATHS.sos}
      aria-current={here ? "page" : undefined}
      aria-label="SOS — emergency numbers and your position"
      className={cn(
        /* The vivid emergency fill, not the ink red — see mountainTheme.css. */
        "grid h-16 min-w-[76px] shrink-0 place-items-center rounded-[12px] bg-[color:var(--ice-danger-fill,#d92b1f)] px-4 text-[19px] font-bold tracking-[0.08em]",
        className,
      )}
      // Not `text-white`: the light theme redefines that token to near-black.
      style={{ color: "#fff" }}
    >
      SOS
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Top bar and menu                                                            */
/* -------------------------------------------------------------------------- */

/**
 * ONE HEADER ROW, THREE PARTS (mockup spec §0): the mode's name, the state
 * pill, the red SOS rectangle. The built version put signal and battery on their
 * own full-width row underneath, which made the top of every screen read as two
 * competing bands; the pill carries both now, battery as a small grey percentage
 * beneath it.
 *
 * The pill is still a control, not a label (brief M2, plan §2.7 CORRECTED):
 * tapping it runs the reachability check, which is the only thing entitled to
 * say "Signal". Regaining signal syncs what was waiting and says so — it never
 * leaves Mountain mode. Where the build never checks, it renders as plain text
 * rather than offering a tap that does nothing.
 *
 * NOTHING IN THE PILL IS A FIXED STRING. `headerPillLabel` builds both halves
 * from the live signal state and the live sync queue.
 */
function TopBar({ menuOpen, onMenu }: { menuOpen: boolean; onMenu: () => void }) {
  const pill = useSignalPill();
  const battery = useBattery();

  const pillText = (
    <span
      className={cn(
        "inline-block max-w-full rounded-full border border-hairline-strong px-3 py-[5px] text-center text-[11px] uppercase leading-[1.35] tracking-[0.06em] text-mist",
        pill.checking && "opacity-70",
      )}
    >
      {pill.headerLabel}
    </span>
  );

  const batteryText = battery && (
    <span className="text-[12px] tabular-nums text-mist-dim">
      {battery.percent}%{battery.charging ? " charging" : ""}
    </span>
  );

  return (
    <header
      className="shrink-0 border-b border-hairline px-3 pb-2"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        {/* The chevron opens the shell menu, which is the only way to Settings
            and the only way to the coach and the end-trip screen from the tabs
            that do not list them. It is not decoration — see the report. */}
        <button
          type="button"
          onClick={onMenu}
          aria-expanded={menuOpen}
          aria-controls="mountain-menu"
          className="flex min-h-16 min-w-0 items-center gap-1 pr-1 pl-2 text-left text-[13px] font-semibold uppercase leading-tight tracking-[0.14em] text-snow"
        >
          {/* Two lines, so the pill beside it keeps one. */}
          <span className="whitespace-pre-line">{"Mountain\nmode"}</span>
          <ChevronDown
            size={16}
            strokeWidth={2}
            aria-hidden
            className={cn("shrink-0 text-mist-dim", menuOpen && "rotate-180")}
          />
        </button>

        {pill.canCheck ? (
          <button
            type="button"
            onClick={pill.check}
            aria-label={`${pill.headerLabel}. Check for a signal.`}
            className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1"
          >
            <span role="status" className="min-w-0">
              {pillText}
            </span>
            {batteryText}
          </button>
        ) : (
          <div className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-1">
            <span role="status" className="min-w-0">
              {pillText}
            </span>
            {batteryText}
          </div>
        )}

        <SosButton />
      </div>
    </header>
  );
}

function Menu({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const signal = useConnectivity();
  const { trip } = useMountainTrip();
  const openable = canOpenFullApp(signal);

  const openFullApp = () => {
    if (!openable) return;
    leaveMountainMode();
    onClose();
    navigate("/home");
  };

  const row = "flex min-h-16 w-full items-center justify-between px-5 text-left text-[17px]";

  return (
    <nav id="mountain-menu" aria-label="Mountain mode menu" className="shrink-0 border-b border-hairline">
      <button
        type="button"
        onClick={openFullApp}
        aria-disabled={!openable}
        className={cn(row, openable ? "text-snow" : "text-mist-dim")}
      >
        {openable ? "Open full app" : "Open the full app · needs a signal"}
      </button>

      <Link to={MOUNTAIN_PATHS.coach} className={cn(row, "border-t border-hairline text-snow")}>
        Ask the coach
      </Link>
      <Link to={MOUNTAIN_PATHS.settings} className={cn(row, "border-t border-hairline text-snow")}>
        Settings
      </Link>

      {/* The confirm, the sync and the debrief are the end-trip screen's, so
          there is one way to end a trip rather than two that can disagree. */}
      {trip && (
        <Link to={MOUNTAIN_PATHS.end} className={cn(row, "border-t border-hairline text-snow")}>
          Back down / End trip
        </Link>
      )}

      <button type="button" onClick={onClose} className={cn(row, "border-t border-hairline text-mist")}>
        Close menu
      </button>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Peak · folded map · person · pack — the icon set from the final mockup, which
 * supersedes the stopwatch/heart/backpack glyphs the earlier ones showed
 * (mockup spec §0).
 */
const TABS = [
  { to: MOUNTAIN_PATHS.now, label: "Now", icon: MountainIcon },
  { to: MOUNTAIN_PATHS.map, label: "Map", icon: MapIcon },
  { to: MOUNTAIN_PATHS.body, label: "Body", icon: User },
  { to: MOUNTAIN_PATHS.trip, label: "Trip", icon: Backpack },
] as const;

function Tabs() {
  return (
    <nav
      aria-label="Mountain mode"
      className="grid shrink-0 grid-cols-4 border-t border-hairline bg-obsidian"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className="relative flex flex-col items-center justify-center gap-1 text-[14px]"
          style={{ minHeight: MOUNTAIN_TABBAR_PX }}
        >
          {({ isActive }) => (
            <>
              {/* A SHORT underline above the active tab, not a full-width rule. */}
              <span
                aria-hidden
                className={cn(
                  "absolute top-0 h-[3px] w-8 rounded-full",
                  isActive ? "bg-azure" : "bg-transparent",
                )}
              />
              <Icon
                size={24}
                strokeWidth={1.8}
                aria-hidden
                className={isActive ? "text-azure" : "text-mist"}
              />
              <span className={isActive ? "text-azure" : "text-mist"}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* A screen that fails to load                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Plan §2.3 CORRECTED: with no signal a reload cannot fetch a missing file and
 * costs the GPS lock and the screen lock, so offline it offers no reload — a
 * plain sentence, and the tabs and SOS stay usable around it.
 */
class ScreenBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const offline = readConnectivity().state === "unreachable";
    return (
      <div className="px-5 py-8">
        <p className="text-[17px] leading-snug text-snow">This screen did not open.</p>
        <p className="mt-2 text-[15px] leading-snug text-mist">
          SOS and the other tabs still work.
        </p>
        {!offline && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={cn(buttonClass("azure"), "mt-6")}
          >
            Try again
          </button>
        )}
      </div>
    );
  }
}

/* -------------------------------------------------------------------------- */
/* The shell                                                                   */
/* -------------------------------------------------------------------------- */

export default function MountainShell() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const signal = useConnectivity();

  /* The theme, motion and text-size attributes, put back on unmount so the full
     app is untouched. */
  useMountainDocument();
  /* What the battery saver stands aside for: a recording keeps full GPS, and no
     signal keeps full GPS whatever the setting says. */
  useReportMountainRuntime({
    noSignal: signal.state === "unreachable",
    recording: activeSessionSummary() !== null,
  });
  /* HERE, NOT ON THE MAP TAB. The track has to record while somebody is on Now
     or Body, or "Retrace my route" has nothing to retrace and pace has no track. */
  useBreadcrumbRecorder();

  useEffect(() => {
    enterMountainMode();
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    // A new screen opens at its first line, not at the last screen's scroll position.
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-obsidian text-snow" data-mountain-mode>
      {/* THE SOS SCREEN REPLACES THIS HEADER WITH ITS OWN RED EMERGENCY BAR
          (mockup spec §5). Two stacked bands is exactly the "competing headers"
          the owner objected to, and the red bar carries its own way out. */}
      {pathname !== MOUNTAIN_PATHS.sos && (
        <>
          <TopBar menuOpen={menuOpen} onMenu={() => setMenuOpen((o) => !o)} />
          {menuOpen && <Menu onClose={() => setMenuOpen(false)} />}
        </>
      )}
      <main ref={mainRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ScreenBoundary resetKey={pathname}>
          <Suspense fallback={<p className="px-5 py-8 text-[17px] text-mist">Opening…</p>}>
            <Outlet />
          </Suspense>
        </ScreenBoundary>
      </main>
      {/* Room for the turnaround alarm's line, which sits here over the tabs'
          top edge; zero height when there is no line. */}
      <div aria-hidden className="shrink-0" style={{ height: "var(--icefall-alarm-line-h, 0px)" }} />
      <Tabs />
    </div>
  );
}
