import { Link, NavLink, matchPath, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BadgeCheck, BarChart3, Bell, Bookmark, Building2, Calculator, CheckSquare, Flag, Megaphone,
  FileSearch, HandCoins, LayoutDashboard, LifeBuoy, type LucideIcon, MessagesSquare, Mountain,
  Package, Receipt, Search, Settings, ShieldCheck, TrendingUp, UserCog, Users, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui";
import { DESK_LABEL, useSession } from "@/auth/session";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { OFFLINE } from "@/offline/offline";
import { listOpenTasks } from "@/data/queries";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

type Item = { to: string; label: string; icon: LucideIcon; tag?: string; demoBadge?: string };

/**
 * THE sidebar — the purchased theme's layout language, ICEFALL's navigation.
 *
 * The theme is Next and file-routed; none of its layout files can be copied
 * here. What transfers is the LANGUAGE: SidebarProvider / Sidebar / SidebarInset,
 * a header strip above the page container, groups with labels, an icon rail
 * collapse. All of it rewritten against react-router.
 *
 * NOTHING IN THE NAVIGATION WAS DROPPED. All 23 destinations that were here
 * before are still here, with the same route and the same label. What changed
 * is which group each one sits in — see GROUPS below for the argument.
 *
 * THE GROUP LABELS ARE THE ONLY THING RE-CUT, AND THE GROUPS DO NOT COLLAPSE.
 * The theme's own sidebar renders groups flat and collapses the whole rail to
 * icons; per-group collapse is the one mechanism that can hide a section from
 * someone who does not know it is there, so it is deliberately not built.
 *
 * BADGES ARE FIGURES: the Tasks count is live (it always was); the drawn
 * "Leads & Messages 5" is a sample figure and renders only under
 * SHOW_DEMO_DATA — a production build shows no count there until a real one
 * is wired.
 */
const GROUPS: { label: string; items: Item[] }[] = [
  {
    // Where you look to find out how the business is doing, not to do a job.
    label: "Overview",
    items: [
      { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3, tag: "New" },
    ],
  },
  {
    // ONE FUNNEL, ONE GROUP. An enquiry arrives in Leads, becomes a deal in
    // Sales Pipeline, and ends up a row in Companies. The old nav split that
    // chain across "Business" and "Marketplace", which put the two halves of a
    // single day's work in two different places.
    label: "Pipeline",
    items: [
      { to: "/admin/leads", label: "Leads & Messages", icon: MessagesSquare, demoBadge: "5" },
      { to: "/admin/sales", label: "Sales Pipeline", icon: TrendingUp },
      { to: "/admin/companies", label: "Companies", icon: Building2 },
    ],
  },
  {
    // WHAT ICEFALL SELLS. Every screen here defines or prices supply before
    // anyone buys it: the catalogue, the mountain slots, the arithmetic that
    // sizes a slot, and the paid promotion that sits on top of one.
    label: "Inventory",
    items: [
      { to: "/admin/products", label: "Products", icon: Package },
      { to: "/admin/placements", label: "Placements", icon: Mountain },
      { to: "/admin/slot-calculator", label: "Slot Calculator", icon: Calculator },
      { to: "/admin/promotions", label: "Promotions", icon: Megaphone },
    ],
  },
  {
    // THE MONEY CHAIN, IN ORDER. A booking happens, ICEFALL's cut is a
    // commission, the commission lands in revenue, and the rest is paid out.
    // Reading a booking almost always means checking its commission next, so
    // the two sit together rather than a screen apart.
    label: "Money",
    items: [
      { to: "/admin/bookings", label: "Bookings", icon: Bookmark },
      { to: "/admin/commissions", label: "Commissions", icon: HandCoins },
      { to: "/admin/finance", label: "Revenue & Finance", icon: Receipt },
      { to: "/admin/billing", label: "Payouts", icon: Wallet },
    ],
  },
  {
    // Named humans and their access: who guides, who books, who works here.
    label: "People",
    items: [
      { to: "/admin/guides", label: "Guides", icon: BadgeCheck },
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/team", label: "Team", icon: UserCog },
    ],
  },
  {
    // GROUPED BY THE SHAPE OF THE WORK, NOT THE SUBJECT. Every screen here is
    // a list of things that arrived and are waiting on a human decision —
    // content to approve, a guide to verify, a report to act on, a ticket to
    // answer, a task assigned to you. It is the "what needs me today" cluster,
    // and it is the group that carries the live badge.
    label: "Queues",
    items: [
      { to: "/admin/approvals", label: "Content Approvals", icon: CheckSquare },
      { to: "/admin/verification", label: "Verification", icon: ShieldCheck },
      { to: "/admin/moderation", label: "Moderation", icon: Flag },
      { to: "/admin/support", label: "Support", icon: LifeBuoy },
      { to: "/admin/tasks", label: "Tasks & Alerts", icon: Bell },
    ],
  },
  {
    // The record of what was done, and the switches that change it.
    label: "System",
    items: [
      { to: "/admin/activity", label: "Activity Log", icon: FileSearch },
      { to: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

const ALL_ITEMS: { group: string; item: Item }[] = GROUPS.flatMap((g) =>
  g.items.map((item) => ({ group: g.label, item })),
);

/**
 * Which nav row the current URL belongs to.
 *
 * Prefix matching, exactly as `NavLink` did it by default: `/admin/companies/42`
 * lights Companies, because a detail screen is a place inside a section rather
 * than a section of its own. Longest match wins so a future nested route cannot
 * be captured by its shorter parent. Returns null rather than guessing when the
 * URL is in no group — the header then shows no trail at all.
 */
function locate(pathname: string): { group: string; item: Item } | null {
  let best: { group: string; item: Item } | null = null;
  for (const entry of ALL_ITEMS) {
    if (!matchPath({ path: entry.item.to, end: false }, pathname)) continue;
    if (!best || entry.item.to.length > best.item.to.length) best = entry;
  }
  return best;
}

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

/**
 * One navigation row.
 *
 * The badge is rendered TWICE on purpose. `SidebarMenuBadge` is the theme's
 * count chip and the theme hides it when the rail is collapsed to icons; the
 * old collapsed rail showed a dot there instead, and losing it would be a
 * capability quietly dropped by a re-skin. So the dot is a second element that
 * appears only in icon mode.
 */
function NavRow({ entry, active, badge }: { entry: { group: string; item: Item }; active: boolean; badge: string | null }) {
  const { item } = entry;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.label}
        className={cn(
          "gap-2.5 font-medium",
          // The preset's --sidebar-accent sits one lightness step from
          // --sidebar itself, so the theme's own active fill is all but
          // invisible on this ground. The active row gets the card white and a
          // primary rail instead — the same read as the gold rail it replaces.
          "data-active:bg-card data-active:font-semibold data-active:shadow-xs",
        )}
      >
        <NavLink to={item.to}>
          {active && (
            <span
              className="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-primary group-data-[collapsible=icon]:inset-y-1.5"
              aria-hidden
            />
          )}
          <item.icon className={active ? "text-primary" : "text-sidebar-foreground/55"} strokeWidth={1.9} />
          <span>{item.label}</span>
        </NavLink>
      </SidebarMenuButton>

      {badge && (
        <SidebarMenuBadge className="tnum rounded-full bg-primary px-1.5 font-bold text-primary-foreground text-[10.5px] peer-data-active/menu-button:text-primary-foreground peer-hover/menu-button:text-primary-foreground">
          {badge}
        </SidebarMenuBadge>
      )}
      {badge && (
        <span
          className="pointer-events-none absolute top-1 right-1 hidden size-2 rounded-full bg-primary group-data-[collapsible=icon]:block"
          aria-hidden
        />
      )}
      {item.tag && (
        <SidebarMenuBadge className="rounded-full border border-primary/40 px-1.5 text-[9.5px] font-bold uppercase tracking-[0.04em] text-primary peer-data-active/menu-button:text-primary peer-hover/menu-button:text-primary">
          {item.tag}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

/**
 * Jump to a screen by name.
 *
 * Grouping 23 destinations costs discoverability — that is the honest price of
 * the seven groups above — and this is the theme's own answer to it, in its
 * header. It NAVIGATES AND NOTHING ELSE: it reads no data, so it cannot show a
 * figure, an empty state or a state that was never measured.
 */
function ScreenSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Go to screen" description="Jump to any screen in the CRM.">
      {/* The `Command` root is NOT inside this theme's CommandDialog — its own
          search dialog supplies one. Without it cmdk has no store and every
          child throws on mount. */}
      <Command>
        <CommandInput placeholder="Go to screen…" />
        <CommandList>
          <CommandEmpty>No screen by that name.</CommandEmpty>
          {GROUPS.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.to}
                  value={`${item.label} ${group.label}`}
                  onSelect={() => {
                    onOpenChange(false);
                    navigate(item.to);
                  }}
                >
                  <item.icon className="size-4 text-muted" strokeWidth={1.9} />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const session = useSession();
  const [search, setSearch] = useState(false);
  const myTasks = useMyOpenTaskCount(
    session.kind === "staff" ? session.identity.profileId : null,
    pathname,
  );

  const here = useMemo(() => locate(pathname), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Seven groups over twenty-three rows do not fit a short window, so the row
  // you are standing on can sit below the fold. `block: "nearest"` scrolls only
  // when it actually is — a row already in view does not move.
  useEffect(() => {
    document
      .querySelector<HTMLElement>('[data-slot="sidebar-content"] a[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  const badgeFor = (item: Item): string | null => {
    if (item.to === "/admin/tasks" && myTasks !== null && myTasks > 0) return String(myTasks);
    if (item.demoBadge && SHOW_DEMO_DATA) return item.demoBadge;
    return null;
  };

  // The signed-in person for the footer chip. With the demo flag on and nobody
  // signed in (offline preview, harness), the drawings' sample person stands
  // in; a real session always wins.
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
    // TooltipProvider wraps the whole shell because the theme's collapsed rail
    // labels every icon with a Tooltip, and radix needs a provider above them.
    <TooltipProvider>
      <SidebarProvider
        // `h-full`, never `h-svh`: offline builds put a disclosure strip above
        // this shell (OfflineFrame), and a viewport-height shell would push its
        // own footer off the bottom by exactly the height of that strip.
        className="h-full min-h-0! overflow-hidden"
        // Same reason, for the sidebar itself. The theme positions it `fixed`,
        // which resolves against the viewport and would ride up over the strip.
        // A transform makes this element the containing block instead, so
        // `inset-y-0` means "the shell", not "the screen". Applied only when the
        // strip actually exists, so an ordinary build is untouched.
        style={OFFLINE ? { transform: "translateZ(0)" } : undefined}
      >
        <Sidebar collapsible="icon" className="h-full">
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild size="lg" className="gap-2.5 hover:bg-transparent">
                  <Link to="/admin/dashboard">
                    <Mountain className="size-[22px]! text-foreground" strokeWidth={2.2} />
                    <span className="text-[16px] font-extrabold tracking-[0.04em] text-foreground">ICEFALL</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent className="no-scrollbar gap-0 py-1">
            {GROUPS.map((group) => (
              <SidebarGroup key={group.label} className="py-1">
                <SidebarGroupLabel className="label h-6 px-3 text-sidebar-foreground/50">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <NavRow
                        key={item.to}
                        entry={{ group: group.label, item }}
                        active={here?.item.to === item.to}
                        badge={badgeFor(item)}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          {/* The person, not a menu. There is no sign-out, no account screen and
              no notification centre in this application, so this is deliberately
              a label and not a button: a control that opens nothing is worse
              than no control. */}
          <SidebarFooter className="border-t border-sidebar-border p-2">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              {person ? (
                <>
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-[11px] font-bold text-background">
                    {initials}
                  </span>
                  <span className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="block truncate text-[12.5px] font-semibold text-foreground">{person.name}</span>
                    <span className="block truncate text-[10.5px] text-muted-foreground">{person.role}</span>
                  </span>
                </>
              ) : (
                <>
                  <Avatar name="··" size={32} />
                  <span className="text-[12px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                    Not signed in
                  </span>
                </>
              )}
            </div>
          </SidebarFooter>

          <SidebarRail />
        </Sidebar>

        <SidebarInset className="flex min-w-0 flex-col overflow-hidden">
          {/* ---- Header ---------------------------------------------------- */}
          <header className="flex h-16 shrink-0 items-center gap-1 border-b border-line bg-card px-4 md:px-5">
            <SidebarTrigger className="-ml-1 text-muted-foreground" />
            <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center" />
            {/* Where you are, derived from the same table the sidebar is built
                from. Nothing is printed when the URL matches no section — a
                made-up crumb is worse than none. */}
            {here && (
              <nav aria-label="Location" className="flex min-w-0 items-center gap-1.5 text-[13px]">
                <span className="hidden text-muted-foreground sm:inline">{here.group}</span>
                <span className="hidden text-muted-foreground/50 sm:inline">/</span>
                <span className="truncate font-semibold text-foreground">{here.item.label}</span>
              </nav>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearch(true)}
                className="gap-2 text-muted-foreground"
              >
                <Search />
                <span className="hidden sm:inline">Go to screen</span>
                <Kbd className="hidden md:inline-flex">⌘K</Kbd>
              </Button>
            </div>
          </header>

          {/* ---- Page container -------------------------------------------- */}
          <div className="no-scrollbar flex-1 overflow-y-auto px-6 pb-8 pt-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>

      <ScreenSearch open={search} onOpenChange={setSearch} />
    </TooltipProvider>
  );
}
