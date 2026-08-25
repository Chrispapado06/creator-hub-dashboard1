import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  Building2,
  CircleDollarSign,
  HandCoins,
  LayoutDashboard,
  type LucideIcon,
  MessagesSquare,
  Mountain,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui";

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/deals", label: "Deals", icon: Mountain },
  { to: "/conversations", label: "Conversations", icon: MessagesSquare },
  { to: "/contacts", label: "People", icon: Users },
  { to: "/partners", label: "Partners", icon: Building2 },
  { to: "/verification", label: "Verification", icon: BadgeCheck },
  { to: "/transactions", label: "Transactions", icon: CircleDollarSign },
  { to: "/referrals", label: "Referrals", icon: HandCoins },
];

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const current = NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));

  return (
    <div className="flex h-full">
      {/* ---- Sidebar ------------------------------------------------------ */}
      <aside className="hidden w-[212px] shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
          <IcefallMark />
          <div className="leading-none">
            <p className="text-[13px] font-medium tracking-[0.14em] text-ink">ICEFALL</p>
            <p className="mt-1 text-[10px] tracking-[0.1em] text-faint">OPERATIONS</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-2.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-tile px-3 py-2 text-[13px] transition-colors",
                  isActive
                    ? "bg-accent-soft font-medium text-accent-ink"
                    : "text-muted hover:bg-raised hover:text-ink",
                )
              }
            >
              <Icon size={16} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-2.5">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-tile px-3 py-2 text-[13px] transition-colors",
                isActive ? "bg-accent-soft font-medium text-accent-ink" : "text-muted hover:bg-raised hover:text-ink",
              )
            }
          >
            <Settings size={16} strokeWidth={1.8} />
            Settings
          </NavLink>
        </div>
      </aside>

      {/* ---- Main --------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-5">
          <p className="text-[13px] font-medium text-ink md:hidden">ICEFALL Ops</p>

          <div className="relative hidden max-w-md flex-1 md:block">
            <Search
              size={15}
              strokeWidth={1.8}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              type="search"
              placeholder={`Search ${current?.label.toLowerCase() ?? "everything"}…`}
              className="h-9 w-full rounded-tile border border-line bg-raised pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent focus:bg-surface"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* No auth yet — the sign-in screen is built but not wired, and a
                fake "logged in as" chip would be the first lie on the screen. */}
            <span className="hidden text-[12px] text-faint sm:inline">Not signed in</span>
            <Avatar name="ICEFALL Staff" size={30} tone="accent" />
          </div>
        </header>

        <main className="no-scrollbar flex-1 overflow-y-auto p-5 lg:p-7">{children}</main>
      </div>
    </div>
  );
}

function IcefallMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 20L9 7l4 7 2.5-4L22 20H2Z"
        stroke="var(--adm-accent)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
