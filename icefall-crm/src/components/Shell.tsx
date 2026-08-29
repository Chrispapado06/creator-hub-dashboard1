import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import {
  Activity, BadgeCheck, Bell, Building2, CalendarClock, CheckSquare, ClipboardList,
  FileSearch, HandCoins, HelpCircle, LayoutDashboard, LifeBuoy, type LucideIcon,
  Mountain, Package, Receipt, Search, Settings, ShieldCheck, TrendingUp, UserCog,
  Users, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui";
import { DESK_LABEL, useSession } from "@/auth/session";

type Item = { to: string; label: string; icon: LucideIcon };

/**
 * The sidebar, grouped as the owner specified.
 *
 * Twenty-three pages is too many for a flat list — the eye cannot find anything
 * in it, and the grouping is what makes "where do I go to move a company between
 * positions" answerable without reading all of them.
 */
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/admin/analytics", label: "Analytics", icon: Activity },
    ],
  },
  {
    label: "Business",
    items: [
      { to: "/admin/companies", label: "Companies", icon: Building2 },
      { to: "/admin/sales", label: "Sales Pipeline", icon: TrendingUp },
      { to: "/admin/placements", label: "Mountain Placements", icon: Mountain },
      { to: "/admin/products", label: "Expeditions & Treks", icon: Package },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { to: "/admin/approvals", label: "Content Approvals", icon: CheckSquare },
      { to: "/admin/leads", label: "Leads", icon: ClipboardList },
      { to: "/admin/bookings", label: "Bookings", icon: CalendarClock },
      { to: "/admin/commissions", label: "Commissions", icon: HandCoins },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/admin/finance", label: "Revenue & Finance", icon: Wallet },
      { to: "/admin/billing", label: "Invoices & Payments", icon: Receipt },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/admin/guides", label: "Guides", icon: BadgeCheck },
      { to: "/admin/users", label: "Users", icon: Users },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/admin/support", label: "Support", icon: LifeBuoy },
      { to: "/admin/verification", label: "Verification", icon: ShieldCheck },
      { to: "/admin/tasks", label: "Tasks & Alerts", icon: Bell },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/admin/activity", label: "Activity Log", icon: FileSearch },
      { to: "/admin/team", label: "Admin Team", icon: UserCog },
      { to: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const session = useSession();
  const current = ALL.find((n) => pathname.startsWith(n.to));

  return (
    // The whole application is a soft rounded window on the canvas, as drawn.
    <div className="h-full bg-canvas p-0 sm:p-2.5">
      <div className="flex h-full overflow-hidden rounded-[26px] bg-surface shadow-lift">
        {/* ---- Sidebar --------------------------------------------------- */}
        <aside className="hidden w-[250px] shrink-0 flex-col bg-surface md:flex">
          <div className="flex h-[74px] shrink-0 items-center gap-2.5 px-6">
            <IcefallMark />
            <div className="leading-none">
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">ICEFALL</p>
              <p className="mt-1 text-[10px] tracking-[0.1em] text-faint">ADMIN CRM</p>
            </div>
          </div>

          <nav className="no-scrollbar flex-1 overflow-y-auto px-3.5 pb-3">
            {GROUPS.map((group) => (
              <div key={group.label} className="mb-4 last:mb-0">
                <p className="navgroup px-3 pb-1.5">{group.label}</p>
                <div className="space-y-0.5">
                  {group.items.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={({ isActive }) =>
                        cn(
                          "relative flex items-center gap-3 rounded-tile px-3 py-2.5 text-[13.5px] transition-colors",
                          isActive
                            ? "bg-raised font-medium text-ink"
                            : "text-muted hover:bg-raised/70 hover:text-ink",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* The small marker on the far edge, as drawn. */}
                          {isActive && (
                            <span className="absolute -left-3.5 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-solid" />
                          )}
                          <Icon
                            size={17}
                            strokeWidth={isActive ? 2.1 : 1.8}
                            className={isActive ? "text-accent" : "text-faint"}
                          />
                          <span className="truncate">{label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* The signed-in person sits at the foot of the sidebar. */}
          <div className="shrink-0 p-3.5">
            <div className="flex items-center gap-3 rounded-tile bg-raised px-3 py-3">
              {session.kind === "staff" ? (
                <>
                  <Avatar name={session.identity.displayName} size={36} tone="accent" />
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {session.identity.displayName}
                    </p>
                    <p className="text-[11.5px] text-faint">{DESK_LABEL[session.identity.role]}</p>
                  </div>
                </>
              ) : (
                <>
                  <Avatar name="··" size={36} />
                  <p className="text-[12.5px] text-faint">Not signed in</p>
                </>
              )}
            </div>
          </div>
        </aside>

        {/* ---- Main ------------------------------------------------------ */}
        <div className="flex min-w-0 flex-1 flex-col bg-canvas">
          <header className="flex h-[74px] shrink-0 items-center gap-4 px-6">
            <p className="text-[15px] font-semibold text-ink md:hidden">ICEFALL Admin</p>

            <div className="relative hidden max-w-sm flex-1 md:block">
              <Search
                size={16}
                strokeWidth={1.9}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                type="search"
                placeholder={`Search ${current?.label.toLowerCase() ?? "everything"}…`}
                className="h-11 w-full rounded-pill bg-surface pl-11 pr-4 text-[13.5px] text-ink shadow-soft outline-none placeholder:text-faint"
              />
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <IconButton label="Help">
                <HelpCircle size={18} strokeWidth={1.9} />
              </IconButton>
              <IconButton label="Notifications">
                <Bell size={18} strokeWidth={1.9} />
              </IconButton>
            </div>
          </header>

          <main className="no-scrollbar flex-1 overflow-y-auto px-6 pb-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

function IconButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid h-11 w-11 place-items-center rounded-full bg-surface text-ink shadow-soft transition-colors hover:bg-raised"
    >
      {children}
    </button>
  );
}

function IcefallMark() {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-tile bg-solid">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M2 20L9 7l4 7 2.5-4L22 20H2Z"
          stroke="var(--crm-accent)"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
