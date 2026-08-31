import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BadgeCheck, BarChart3, Bell, Bookmark, Building2, Calculator, CheckSquare, Flag, Megaphone,
  ChevronsLeft, ChevronsRight, FileSearch, HandCoins, LayoutDashboard, LifeBuoy,
  type LucideIcon, MessagesSquare, Mountain, Package, Receipt, Settings,
  ShieldCheck, TrendingUp, UserCog, Users, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui";
import { DESK_LABEL, useSession } from "@/auth/session";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { GOLD, GOLD_HOVER } from "@/components/drawn";
import { listOpenTasks } from "@/data/queries";

type Item = { to: string; label: string; icon: LucideIcon; tag?: string; demoBadge?: string };

/**
 * THE sidebar — the owner's drawn navigation, now the real one.
 *
 * The 31 Aug drawings carried a light sidebar with gold active states, a
 * profile chip under the logo, and a working Collapse ("make the side
 * navigation to smallen and only come back with clicked"). The owner then
 * ruled the drawings are the production design, so this replaced the old grey
 * grouped nav. The drawings named 14 items; the CRM has more screens than
 * that, and the owner uses them — so the extra screens fold into the same
 * business groups rather than being dropped (brain's instruction). Labels
 * follow the drawings where the two disagree (Products, Payouts, Team).
 *
 * BADGES ARE FIGURES: the Tasks count is live (it always was); the drawn
 * "Leads & Messages 5" is a sample figure and renders only under
 * SHOW_DEMO_DATA — a production build shows no count there until a real one
 * is wired.
 */
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3, tag: "New" },
    ],
  },
  {
    label: "Business",
    items: [
      { to: "/admin/products", label: "Products", icon: Package },
      { to: "/admin/companies", label: "Companies", icon: Building2 },
      { to: "/admin/sales", label: "Sales Pipeline", icon: TrendingUp },
      { to: "/admin/placements", label: "Placements", icon: Mountain },
      { to: "/admin/slot-calculator", label: "Slot Calculator", icon: Calculator },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { to: "/admin/bookings", label: "Bookings", icon: Bookmark },
      { to: "/admin/leads", label: "Leads & Messages", icon: MessagesSquare, demoBadge: "5" },
      { to: "/admin/commissions", label: "Commissions", icon: HandCoins },
      { to: "/admin/promotions", label: "Promotions", icon: Megaphone },
      { to: "/admin/approvals", label: "Content Approvals", icon: CheckSquare },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/admin/billing", label: "Payouts", icon: Wallet },
      { to: "/admin/finance", label: "Revenue & Finance", icon: Receipt },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/admin/guides", label: "Guides", icon: BadgeCheck },
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/team", label: "Team", icon: UserCog },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/admin/support", label: "Support", icon: LifeBuoy },
      { to: "/admin/verification", label: "Verification", icon: ShieldCheck },
      { to: "/admin/moderation", label: "Moderation", icon: Flag },
      { to: "/admin/tasks", label: "Tasks & Alerts", icon: Bell },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/admin/activity", label: "Activity Log", icon: FileSearch },
      { to: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

/**
 * The Tasks badge — "he needs to see it" (CR-16). In-app is the only
 * notification that exists: nothing sends push or email, so the count of open
 * tasks with YOUR name on them sits on the nav instead. Refreshed on every
 * route change and on a slow tick; absent (not zero) when it cannot be read.
 */
function useMyOpenTaskCount(profileId: string | null, pathname: string): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!profileId) return;
    let dead = false;
    const read = () =>
      void listOpenTasks().then((r) => {
        if (!dead) setCount(r.state === "ok" ? r.value.filter((t) => t.assigned_to === profileId).length : null);
      });
    read();
    const t = setInterval(read, 60_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [profileId, pathname]);
  return count;
}

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const session = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const myTasks = useMyOpenTaskCount(
    session.kind === "staff" ? session.identity.profileId : null,
    pathname,
  );

  const badgeFor = (item: Item): string | null => {
    if (item.to === "/admin/tasks" && myTasks !== null && myTasks > 0) return String(myTasks);
    if (item.demoBadge && SHOW_DEMO_DATA) return item.demoBadge;
    return null;
  };

  // The signed-in person for the chip under the logo. With the demo flag on
  // and nobody signed in (offline preview, harness), the drawings' sample
  // person stands in; a real session always wins.
  const person =
    session.kind === "staff"
      ? { name: session.identity.displayName, role: DESK_LABEL[session.identity.role] }
      : SHOW_DEMO_DATA
        ? { name: "Ravi Thapa", role: "Operator" }
        : null;
  const initials = person
    ? person.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "··";

  return (
    // Full-bleed on the drawings' white canvas — the rounded grey window of
    // the 28 Aug language went with it.
    <div className="flex h-full bg-canvas">
      {/* ---- Sidebar --------------------------------------------------- */}
      {collapsed ? (
        <aside className="hidden w-[62px] shrink-0 flex-col items-center border-r border-line-soft bg-[#FBFCFC] md:flex">
          <button type="button" onClick={() => setCollapsed(false)} title="Expand navigation" className="grid h-[64px] w-full shrink-0 place-items-center">
            <Mountain size={22} strokeWidth={2.2} className="text-ink" />
          </button>
          <span className="mb-3 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">{initials}</span>
          <nav className="no-scrollbar flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto pb-3">
            {GROUPS.flatMap((g) => g.items).map((it) => (
              <NavLink
                key={it.to + it.label}
                to={it.to}
                title={it.label}
                className={({ isActive }) =>
                  cn(
                    "relative grid h-9 w-9 place-items-center rounded-[10px]",
                    isActive ? "bg-butter/50" : "text-muted hover:bg-raised hover:text-ink",
                  )
                }
                style={({ isActive }) => (isActive ? { color: GOLD_HOVER } : undefined)}
              >
                <it.icon size={16} strokeWidth={1.9} />
                {badgeFor(it) && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" aria-hidden />}
              </NavLink>
            ))}
          </nav>
          <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand" className="grid w-full place-items-center border-t border-line-soft py-3.5 text-muted hover:text-ink">
            <ChevronsRight size={15} strokeWidth={2} />
          </button>
        </aside>
      ) : (
        <aside className="hidden w-[236px] shrink-0 flex-col border-r border-line-soft bg-[#FBFCFC] md:flex">
          <div className="flex h-[64px] shrink-0 items-center gap-2.5 px-5">
            <Mountain size={22} strokeWidth={2.2} className="text-ink" />
            <p className="text-[16px] font-extrabold tracking-[0.04em] text-ink">ICEFALL</p>
          </div>
          <div className="mx-4 mb-3 flex items-center gap-2.5 rounded-[12px] bg-panel px-3 py-2">
            {person ? (
              <>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">{initials}</span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[12.5px] font-semibold text-ink">{person.name}</span>
                  <span className="block text-[10.5px] text-faint">{person.role}</span>
                </span>
              </>
            ) : (
              <>
                <Avatar name="··" size={32} />
                <span className="text-[12px] text-faint">Not signed in</span>
              </>
            )}
          </div>
          <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-3">
            {GROUPS.map((group) => (
              <div key={group.label} className="mb-3 last:mb-0">
                <p className="navgroup px-3 pb-1">{group.label}</p>
                <div className="space-y-0.5">
                  {group.items.map((it) => (
                    <NavLink
                      key={it.to + it.label}
                      to={it.to}
                      className={({ isActive }) =>
                        cn(
                          "relative flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] font-medium",
                          isActive ? "bg-butter/50 font-semibold" : "text-muted hover:bg-raised hover:text-ink",
                        )
                      }
                      style={({ isActive }) => (isActive ? { color: GOLD_HOVER } : undefined)}
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute -left-3 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full" style={{ background: GOLD }} aria-hidden />}
                          <it.icon size={16} strokeWidth={1.9} className={isActive ? undefined : "text-faint"} />
                          <span className="min-w-0 flex-1 truncate">{it.label}</span>
                          {badgeFor(it) && (
                            <span className="tnum grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10.5px] font-bold text-white">
                              {badgeFor(it)}
                            </span>
                          )}
                          {it.tag && (
                            <span className="rounded-pill bg-accent-soft px-1.5 py-[1px] text-[9.5px] font-bold uppercase text-accent-ink">
                              {it.tag}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <button type="button" onClick={() => setCollapsed(true)} className="flex items-center gap-2 border-t border-line-soft px-5 py-3.5 text-[12.5px] font-medium text-muted hover:text-ink">
            <ChevronsLeft size={15} strokeWidth={2} /> Collapse
          </button>
        </aside>
      )}

      {/* ---- Main ------------------------------------------------------ */}
      {/* The drawings start at the page title: no global search header. */}
      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <main className="no-scrollbar flex-1 overflow-y-auto px-6 pb-8 pt-6">{children}</main>
      </div>
    </div>
  );
}
