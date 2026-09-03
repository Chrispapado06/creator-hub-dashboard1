import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, Bookmark, CalendarCheck, ChevronDown, Compass, Crown, Flag, Footprints, Home, Send,
  MessageCircle, MessageSquare, Moon, Mountain as MountainIcon, Search,
  Settings as SettingsIcon, User, Users,
} from "lucide-react";
import { IcefallMark } from "@/components/IcefallMark";
import { useAuth } from "@/lib/auth";
import { KIND_ORDER, searchAll, type ResultKind } from "@/data/search";
import { cn } from "@/lib/utils";

/**
 * ICEFALL on a desktop — the signed-in application, behind the waitlist.
 *
 * WHAT THIS IS NOT: the phone app rendered wide. Activity tracking has no place
 * here and is deliberately absent from the navigation — recording a climb needs
 * the sensors in your pocket, and a "Start activity" button on a laptop is an
 * invitation to log something you did not do. Everything else the phone has —
 * planning, expeditions, guides, the coach, your record — belongs on a big
 * screen and gets more room here than it can have on a phone.
 *
 * The sidebar is the app's spine: four destinations, then the shortcuts people
 * reach for daily. It does not collapse into a hamburger, because on a desktop
 * hiding navigation to win 240px of a 1,440px screen is a trade nobody asked
 * for.
 */

/**
 * The sidebar, flat.
 *
 * Find a route, Mountains, Expeditions and Guides sat under an "Explore" parent
 * that had to be opened to reach any of them. They are four different
 * destinations, not four views of one, and burying them behind a disclosure put
 * the thing people came for one click further away than the thing they did not.
 * Each is a top-level entry now.
 *
 * Social keeps its children, because Feed, Leaderboard, People and Groups
 * really are views of one product rather than four separate errands.
 */
const SOCIAL_CHILDREN = [
  { to: "/app/social", label: "Feed", end: true },
  { to: "/app/social/leaderboard", label: "Leaderboard" },
  { to: "/app/social/people", label: "People" },
  { to: "/app/social/groups", label: "Groups" },
];

const PRIMARY = [
  { to: "/app", label: "Home", icon: Home, end: true },
  /*
    Messages sits directly under Home, in the primary nav — owner instruction
    2026-09-01. It spent its life in QUICK, which is the wrong shelf for the
    one item in this app that is WAITING ON YOU: quick links are places you
    choose to go, and an inbox is a place you are summoned to. Everything else
    in QUICK (saved, bookings, enquiries, settings) is genuinely passive.
  */
  { to: "/app/messages", label: "Messages", icon: MessageSquare },
  { to: "/app/find", label: "Find a route", icon: Search },
  { to: "/app/mountains", label: "Mountains", icon: MountainIcon },
  { to: "/app/expeditions", label: "Expeditions", icon: Flag },
  { to: "/app/treks", label: "Treks", icon: Footprints },
  { to: "/app/guides", label: "Guides", icon: Users },
  { to: "/app/coach", label: "Coach", icon: Compass },
  { to: "/app/social", label: "Social", icon: MessageCircle, children: SOCIAL_CHILDREN },
  { to: "/app/profile", label: "Profile", icon: User },
];

const QUICK = [
  { to: "/app/saved", label: "Saved expeditions", icon: Bookmark },
  { to: "/app/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/app/enquiries", label: "My enquiries", icon: Send },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const name = session?.name ?? "Guest";

  return (
    <div className="flex min-h-screen bg-obsidian">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar name={name} />
        <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
      </div>
    </div>
  );
}

function Sidebar() {
  // Which section is open decides whether the Explore group is expanded.
  const { pathname } = useLocation();

  return (
    <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col border-r border-hairline bg-graphite/40 lg:flex">
      <Link to="/app" className="flex items-center gap-2.5 px-6 py-6">
        <IcefallMark metal className="h-7" />
        <span className="pl-[0.3em] text-[15px] font-light tracking-[0.3em] text-snow">ICEFALL</span>
      </Link>

      <nav className="px-3">
        {PRIMARY.map((item) => {
          const inGroup =
            item.children !== undefined &&
            item.children.some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`));
          return (
            <div key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "mb-1 flex items-center gap-3 rounded-tile px-3 py-2.5 text-[13.5px] transition-colors",
                    isActive || inGroup
                      ? "border border-azure/35 bg-azure/[0.10] text-azure"
                      : "border border-transparent text-mist hover:bg-white/[0.03] hover:text-snow",
                  )
                }
              >
                <item.icon size={16} strokeWidth={1.7} />
                <span className="flex-1">{item.label}</span>
                {item.children !== undefined && (
                  <ChevronDown
                    size={14}
                    strokeWidth={1.8}
                    className={cn("transition-transform", inGroup && "rotate-180")}
                  />
                )}
              </NavLink>

              {/* Open on the sections themselves, so you can see where you are
                  and step sideways without going back up a level. */}
              {item.children !== undefined && inGroup && (
                <div className="mb-2 ml-[26px] border-l border-hairline pl-3">
                  {item.children.map((c) => (
                    <NavLink
                      key={c.to}
                      to={c.to}
                      end={"end" in c ? Boolean((c as { end?: boolean }).end) : undefined}
                      className={({ isActive }) =>
                        cn(
                          "block rounded-tile px-2.5 py-1.5 text-[12.5px] transition-colors",
                          isActive ? "text-azure" : "text-mist-dim hover:text-snow",
                        )
                      }
                    >
                      {c.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <p className="section-label mt-7 px-6">Quick links</p>
      <nav className="mt-3 px-3">
        {QUICK.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "mb-0.5 flex items-center gap-3 rounded-tile px-3 py-2 text-[13px] transition-colors",
                isActive ? "text-azure" : "text-mist-dim hover:text-snow",
              )
            }
          >
            <item.icon size={15} strokeWidth={1.7} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/*
        The upgrade card.
        No countdown, no "3 spots left", no strike-through price. Pressure
        tactics belong to products people buy on impulse, and this one is bought
        by someone planning a year of training.
      */}
      <div className="mx-4 mt-8 rounded-card border border-azure/25 bg-azure/[0.05] p-4 text-center">
        <Crown size={18} strokeWidth={1.6} className="mx-auto text-azure" />
        <p className="mt-2 text-[13px] text-snow">Go Premium</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
          Full training plans, offline maps and the whole expedition directory.
        </p>
        <Link
          to="/app/settings"
          className="mt-3 block rounded-tile bg-azure py-2 text-[12px] font-medium text-obsidian transition-colors hover:bg-azure-bright"
        >
          See plans
        </Link>
      </div>

      <div className="mt-auto flex items-center justify-between px-6 py-5">
        <span aria-hidden className="text-mist-dim/60">
          <Moon size={15} strokeWidth={1.6} />
        </span>
        <p className="text-[10.5px] leading-relaxed text-mist-dim/70">
          © {new Date().getFullYear()} ICEFALL
        </p>
      </div>
    </aside>
  );
}

function TopBar({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-hairline bg-obsidian/90 px-8 py-4 backdrop-blur-xl">
      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1.5">
        <Link
          to="/app/notifications"
          aria-label="Notifications"
          className={cn(
            "grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-white/[0.05]",
            pathname === "/app/notifications" ? "text-azure" : "text-mist",
          )}
        >
          <Bell size={17} strokeWidth={1.7} />
        </Link>
        <Link
          to="/app/messages"
          aria-label="Messages"
          className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05]"
        >
          <MessageCircle size={17} strokeWidth={1.7} />
        </Link>

        <div className="relative ml-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-pill py-1 pl-1 pr-2.5 transition-colors hover:bg-white/[0.04]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full border border-hairline bg-elevated text-[11px] text-mist">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="text-left">
              <span className="block text-[12.5px] leading-tight text-snow">{name}</span>
              <span className="block text-[10.5px] leading-tight text-mist-dim">Free plan</span>
            </span>
            <ChevronDown size={14} strokeWidth={1.8} className="text-mist-dim" />
          </button>

          {open && (
            <>
              <button
                aria-label="Close menu"
                className="fixed inset-0 z-10"
                onClick={() => setOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-card border border-hairline bg-elevated shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]">
                <Link
                  to="/app/profile"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2.5 text-[13px] text-mist transition-colors hover:bg-white/[0.04] hover:text-snow"
                >
                  Your profile
                </Link>
                <Link
                  to="/app/settings"
                  onClick={() => setOpen(false)}
                  className="block border-t border-hairline px-4 py-2.5 text-[13px] text-mist transition-colors hover:bg-white/[0.04] hover:text-snow"
                >
                  Settings
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * The header search.
 *
 * This input existed from the first version of the shell WITH NO HANDLER — it
 * looked like the primary way into the product and did nothing when you typed
 * in it. It now searches mountains, treks, expeditions, guides and companies at
 * once, and groups the results BY KIND, which is the whole job: "Everest" is a
 * mountain, an expedition and several treks, and telling those apart is exactly
 * the decision a reader is making.
 */
function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);

  const results = q.trim().length >= 2 ? searchAll(q) : [];

  useEffect(() => setActive(0), [q]);

  // Close on an outside click — a panel that traps the page is worse than none.
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      if (box.current && !box.current.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    setQ("");
    navigate(to);
  };

  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key === "Escape") return setOpen(false);
    if (!results.length) return;
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      const hit = results[active];
      if (hit) go(hit.to);
    }
  };

  let lastKind: ResultKind | null = null;

  return (
    <div ref={box} className="relative w-full max-w-[420px]">
      <Search
        size={15}
        strokeWidth={1.7}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
      />
      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Search mountains, treks, expeditions, guides…"
        aria-label="Search"
        aria-expanded={open && results.length > 0}
        role="combobox"
        className="h-10 w-full rounded-pill border border-hairline bg-graphite pl-10 pr-4 text-[13px] text-snow outline-none placeholder:text-mist-dim focus:border-azure/50 [&::-webkit-search-cancel-button]:hidden"
      />

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-12 z-30 max-h-[420px] overflow-y-auto rounded-card border border-hairline-strong bg-elevated py-1.5 shadow-[0_28px_70px_-28px_rgba(0,0,0,0.95)]">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-[12.5px] text-mist-dim">
              Nothing matches &ldquo;{q.trim()}&rdquo;.
            </p>
          ) : (
            results.map((r, i) => {
              const header = r.kind !== lastKind ? r.kind : null;
              lastKind = r.kind;
              return (
                <div key={`${r.kind}-${r.id}`}>
                  {header && (
                    <p className="px-4 pb-1 pt-2 text-[9.5px] uppercase tracking-[0.13em] text-mist-dim">
                      {header}
                    </p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r.to)}
                    className={cn(
                      "flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left transition-colors",
                      i === active ? "bg-slate" : "hover:bg-slate/60",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] text-snow">{r.title}</span>
                    <span className="shrink-0 truncate text-[11px] text-mist-dim">{r.detail}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/** Kinds are shown in this order — see data/search.ts. */
void KIND_ORDER;
