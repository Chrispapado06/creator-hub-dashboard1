import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Bell, Blocks, BookText, Boxes, CalendarDays, ChevronsLeft, CircleGauge, Command,
  Contact2, FileText, FolderKanban, GitBranch, Handshake, Inbox, LayoutGrid,
  ListChecks, Mail, PanelsTopLeft, Search, Settings, Sparkles, TrendingUp, Users,
  Workflow, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./CommandPalette";

const NAV: { to: string; label: string; icon: LucideIcon; group: string }[] = [
  { to: "/", label: "Dashboard", icon: CircleGauge, group: "Sell" },
  { to: "/leads", label: "Leads", icon: Inbox, group: "Sell" },
  { to: "/deals", label: "Deals", icon: Handshake, group: "Sell" },
  { to: "/contacts", label: "Contacts", icon: Contact2, group: "Sell" },
  { to: "/organizations", label: "Organizations", icon: Users, group: "Sell" },
  { to: "/activities", label: "Activities", icon: ListChecks, group: "Work" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, group: "Work" },
  { to: "/products", label: "Products", icon: Boxes, group: "Work" },
  { to: "/mail", label: "Mail", icon: Mail, group: "Communicate" },
  { to: "/automations", label: "Automations", icon: Workflow, group: "Communicate" },
  { to: "/sequences", label: "Sequences", icon: GitBranch, group: "Communicate" },
  { to: "/reports", label: "Reports", icon: LayoutGrid, group: "Analyze" },
  { to: "/forecast", label: "Forecast", icon: TrendingUp, group: "Analyze" },
  { to: "/projects", label: "Projects", icon: FolderKanban, group: "Deliver" },
  { to: "/documents", label: "Documents", icon: FileText, group: "Deliver" },
  { to: "/marketplace", label: "Marketplace", icon: Blocks, group: "Deliver" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200",
          collapsed ? "w-[60px]" : "w-[216px]",
        )}
      >
        <div className={cn("flex h-14 items-center border-b border-line", collapsed ? "justify-center px-0" : "px-4")}>
          <Mark />
          {!collapsed && <span className="ml-2.5 text-[14px] font-bold tracking-[-0.01em] text-ink">Cadence</span>}
        </div>

        <nav className="no-scrollbar flex-1 space-y-4 overflow-y-auto p-2.5">
          {groups.map((g) => (
            <div key={g}>
              {!collapsed && <p className="label px-2 pb-1.5">{g}</p>}
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === g).map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/"}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-tile px-2.5 py-2 text-[13px] transition-colors",
                        collapsed && "justify-center px-0",
                        isActive ? "bg-accent-soft font-medium text-accent-ink" : "text-muted hover:bg-raised hover:text-ink",
                      )
                    }
                  >
                    <Icon size={16} strokeWidth={1.9} className="shrink-0" />
                    {!collapsed && label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-line p-2.5">
          <NavLink
            to="/settings"
            title={collapsed ? "Settings" : undefined}
            className={({ isActive }) => cn(
              "flex items-center gap-2.5 rounded-tile px-2.5 py-2 text-[13px] transition-colors",
              collapsed && "justify-center px-0",
              isActive ? "bg-accent-soft font-medium text-accent-ink" : "text-muted hover:bg-raised hover:text-ink",
            )}
          >
            <Settings size={16} strokeWidth={1.9} />
            {!collapsed && "Settings"}
          </NavLink>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn("mt-1 flex w-full items-center gap-2.5 rounded-tile px-2.5 py-2 text-[12.5px] text-faint hover:bg-raised hover:text-ink", collapsed && "justify-center px-0")}
          >
            <ChevronsLeft size={16} strokeWidth={1.9} className={cn("transition-transform", collapsed && "rotate-180")} />
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-5">
          <button
            onClick={() => setCmdOpen(true)}
            className="flex h-9 max-w-md flex-1 items-center gap-2.5 rounded-tile border border-line bg-raised px-3 text-left text-[13px] text-faint transition-colors hover:border-faint/40"
          >
            <Search size={15} strokeWidth={1.9} />
            Search or jump to…
            <span className="ml-auto flex items-center gap-0.5 rounded border border-line bg-surface px-1.5 py-0.5 text-[10.5px] text-faint">
              <Command size={10} strokeWidth={2} />K
            </span>
          </button>
          <div className="ml-auto flex items-center gap-3">
            <button aria-label="Notifications" className="relative grid h-9 w-9 place-items-center rounded-tile text-muted hover:bg-raised hover:text-ink">
              <Bell size={17} strokeWidth={1.9} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
            </button>
            <Avatar />
          </div>
        </header>

        <main className="no-scrollbar flex-1 overflow-y-auto p-6" key={pathname}>
          {children}
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}

function Mark() {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-tile bg-accent text-white">
      <PanelsTopLeft size={17} strokeWidth={2} />
    </span>
  );
}

function Avatar() {
  return <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-ink">YO</span>;
}

/** Re-exported so screens can render the same icon set in empty states. */
export { BookText, Sparkles };
