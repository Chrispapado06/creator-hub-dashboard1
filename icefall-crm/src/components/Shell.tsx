import { Link, NavLink, matchPath, useLocation, useNavigate } from "react-router-dom";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BadgeCheck, BarChart3, Bell, Bookmark, Building2, Calculator, CheckSquare, Flag, Megaphone,
  FileSearch, HandCoins, LayoutDashboard, LifeBuoy, type LucideIcon, MessagesSquare, Mountain,
  Package, Receipt, Search, Settings, ShieldCheck, TrendingUp, UserCog, Users, Wallet,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { DESK_LABEL, useSession } from "@/auth/session";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { OFFLINE } from "@/offline/offline";
import { listOpenTasks } from "@/data/queries";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  CommandSeparator,
} from "@/components/ui/command";

type Item = { to: string; label: string; icon: LucideIcon; tag?: string; demoBadge?: string };

/**
 * THE SHELL — the purchased theme's chrome, 1:1, carrying ICEFALL's navigation.
 *
 * SECOND PASS, 2026-09-03. The first pass took the theme's COMPONENTS and kept
 * ICEFALL's own dimensions and colour on top of them, and the owner's verdict on
 * that was "i dont see any change i want the designs 1:1". So this pass is not a
 * translation. Every measurement below was read off the running theme at
 * localhost:3100/dashboard/default with getComputedStyle and reproduced exactly:
 *
 *   sidebar width  272px (calc(var(--spacing) * 68))   was 256px
 *   header height  48px, sticky, background/50 + blur  was 64px, solid card
 *   sidebar header 48px, no bottom rule                was 64px with a rule
 *   group label    12px/500, sentence case, no track   was 11px uppercase
 *   active row     bg-sidebar-accent, weight 500       was card white + rail + bold
 *   nav icon       16px, stroke 2, inherited colour    was stroke 1.9, tinted
 *   badge          h-5 rounded-sm outline, capitalize  was a filled pill
 *   footer         no rule, avatar + two lines, size lg  was a rule + square chip
 *   page padding   16px, 24px from md                  was 24/24/32
 *   content        centred, max 1536px                 was full bleed
 *
 * The theme is Next and file-routed; none of its layout files can be imported.
 * What is copied is its MARKUP — `app-sidebar.tsx`, `nav-main.tsx`, `nav-user.tsx`
 * and `dashboard/layout.tsx` — rewritten against react-router. The shadcn
 * primitives underneath (`ui/sidebar.tsx`) are already byte-identical to the
 * theme's, which is what makes a copy legitimate rather than an impression.
 *
 * NOTHING IN THE NAVIGATION CHANGED. Same 23 destinations, same routes, same
 * labels, same icons, same seven groups, same live Tasks count, same demo badge,
 * same ⌘K palette, same collapse-to-icons, same offline accommodations. This
 * pass moved no nav item between groups and removed none.
 *
 * THREE THINGS THE THEME HAS THAT ARE DELIBERATELY NOT HERE, each because
 * copying it would mean shipping a control that does nothing:
 *   · "Quick Create" + the inbox icon button above the first group. The theme's
 *     own Quick Create has no handler at all. ICEFALL has no global create
 *     action to put behind it — the create routes are per-screen — and a black
 *     button at the top of the rail that does nothing is worse than the gap.
 *   · The support card above the user block. It is the theme author's own X and
 *     email address.
 *   · The header's four right-hand controls: layout switcher, theme switcher,
 *     GitHub menu, account switcher. There is no layout preference, no dark
 *     mode toggle, no repository and no second account in this application.
 * The location trail takes that right-hand slot instead, because it is the one
 * real thing the CRM's header has and the theme puts its breadcrumbs inside the
 * page — which this pass may not edit.
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
 * One navigation row — the theme's `NavLinkItem`, verbatim.
 *
 * No className reaches `SidebarMenuButton` on purpose. Its own `isActive` fill
 * (`bg-sidebar-accent`, oklch 0.97 against the 0.985 rail) IS the theme's active
 * state now that the tokens underneath are the theme's; the previous pass added
 * a card-white fill, a primary rail and a bolder weight because the OLD palette
 * made that fill invisible, and all three now read as a departure.
 *
 * THE BADGE IS RENDERED TWICE ON PURPOSE. `SidebarMenuBadge` is the theme's
 * count chip and the theme hides it when the rail is collapsed to icons; the
 * old collapsed rail showed a dot there instead, and losing it would be a
 * capability quietly dropped by a re-skin. So the dot is a second element that
 * appears only in icon mode.
 */
function NavRow({ entry, active, badge }: { entry: { group: string; item: Item }; active: boolean; badge: string | null }) {
  const { item } = entry;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <NavLink to={item.to}>
          <item.icon />
          <span>{item.label}</span>
        </NavLink>
      </SidebarMenuButton>

      {/* The theme ships exactly two badge treatments and this is the shape of
          both: h-5, rounded-sm, one-pixel outline, capitalised.
          A COUNT IS NOT A LABEL, so it takes ink rather than the theme's muted
          grey — "he needs to see it" is the whole reason this number exists and
          a grey outline is where it would stop being seen. */}
      {badge && (
        <SidebarMenuBadge className="rounded-sm border border-border text-foreground peer-data-active/menu-button:text-foreground peer-hover/menu-button:text-foreground">
          {badge}
        </SidebarMenuBadge>
      )}
      {badge && (
        <span
          className="pointer-events-none absolute top-1 right-1 hidden size-2 rounded-full bg-foreground group-data-[collapsible=icon]:block"
          aria-hidden
        />
      )}
      {/* "New" — the theme's own green outline, copied colour for colour. */}
      {item.tag && (
        <SidebarMenuBadge className="rounded-sm border border-green-600 capitalize text-green-600 peer-data-active/menu-button:text-green-600 peer-hover/menu-button:text-green-600">
          {item.tag}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

/**
 * The signed-in person — the theme's `NavUser`, minus the menu.
 *
 * Same row: a size-lg button, a 32px rounded-lg avatar, the name over a quiet
 * second line. What is NOT copied is the trailing ellipsis and the dropdown
 * behind it, because this application has no account screen, no billing page,
 * no notification centre and no sign-out. An ellipsis that opens a menu of four
 * things that do not exist is a worse lie than a missing ellipsis.
 */
function NavUser({ name, second }: { name: string; second: string }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild size="lg">
          <div>
            <Avatar className="size-8 rounded-lg grayscale">
              <AvatarFallback className="rounded-lg">{initials(name)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-muted-foreground text-xs">{second}</span>
            </div>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/**
 * Jump to a screen by name — the theme's `SearchDialog`, with the theme's own
 * separator between groups.
 *
 * Grouping 23 destinations costs discoverability — that is the honest price of
 * the seven groups above — and this is the theme's answer to it, in its header.
 * It NAVIGATES AND NOTHING ELSE: it reads no data, so it cannot show a figure,
 * an empty state or a state that was never measured.
 *
 * ⌘K, not the theme's ⌘J. The shortcut is muscle memory that already exists
 * here and a re-skin is no reason to move somebody's hands.
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
          {/* A Fragment, never a wrapper element: cmdk walks the tree to filter
              and to move the selection, and a stray `div` between the list and
              its groups is the classic way to break both. */}
          {GROUPS.map((group, i) => (
            <Fragment key={group.label}>
              {i > 0 && <CommandSeparator />}
              <CommandGroup heading={group.label}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.to}
                    value={`${item.label} ${group.label}`}
                    onSelect={() => {
                      onOpenChange(false);
                      navigate(item.to);
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <item.icon />
                      <span className="truncate">{item.label}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </Fragment>
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
  //
  // ON A FRAME, NOT ON THE EFFECT. Measured on a cold load of /admin/settings:
  // called straight out of the effect this did nothing at all, because the rail
  // has not been laid out yet and `nearest` on an element the browser still
  // thinks is at offset zero resolves to "already visible". One frame later the
  // geometry is real and it scrolls. The capability was silently dead before.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-slot="sidebar-content"] a[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  const badgeFor = (item: Item): string | null => {
    if (item.to === "/admin/tasks" && myTasks !== null && myTasks > 0) return String(myTasks);
    if (item.demoBadge && SHOW_DEMO_DATA) return item.demoBadge;
    return null;
  };

  // The signed-in person for the footer. With the demo flag on and nobody
  // signed in (offline preview, harness), the drawings' sample person stands
  // in; a real session always wins.
  const person =
    session.kind === "staff"
      ? { name: session.identity.displayName, second: DESK_LABEL[session.identity.role] }
      : SHOW_DEMO_DATA
        ? { name: "Ravi Thapa", second: "Operator" }
        : { name: "··", second: "Not signed in" };

  return (
    // TooltipProvider wraps the whole shell because the theme's collapsed rail
    // labels every icon with a Tooltip, and radix needs a provider above them.
    <TooltipProvider>
      <SidebarProvider
        // 272px, the theme's own `calc(var(--spacing) * 68)`. Tailwind v4 sets
        // `--spacing: 0.25rem`, so this resolves identically in both apps.
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 68)",
            // The theme positions the sidebar `fixed`, which resolves against
            // the viewport. Offline builds put a disclosure strip above this
            // shell (OfflineFrame) and a viewport-anchored rail would ride up
            // over it. A transform makes this element the containing block
            // instead, so `inset-y-0` means "the shell", not "the screen".
            // Applied only when the strip actually exists.
            ...(OFFLINE ? { transform: "translateZ(0)" } : null),
          } as React.CSSProperties
        }
        // `h-full`, never `h-svh`, for the same reason: a viewport-height shell
        // would push its own footer off the bottom by the height of that strip.
        className="h-full min-h-0! overflow-hidden"
      >
        <Sidebar collapsible="icon" className="h-full">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/admin/dashboard">
                    <Mountain />
                    <span className="font-semibold text-base">ICEFALL</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            {GROUPS.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">
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

          <SidebarFooter>
            <NavUser name={person.name} second={person.second} />
          </SidebarFooter>

          <SidebarRail />
        </Sidebar>

        {/* THE INSET IS THE SCROLL CONTAINER, not the page div beneath it. That
            is what lets the header be `sticky` and translucent the way the
            theme's is — a header pinned above a separately scrolling pane has
            nothing to blur. `max-w-[1536px]` is the theme's `max-w-screen-2xl`
            written as its measured value, because its default content layout is
            "centered" and every direct child of the inset is centred in it. */}
        <SidebarInset className="min-w-0 overflow-x-clip overflow-y-auto [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-[1536px]">
          {/* ---- Header ---------------------------------------------------- */}
          <header className="sticky top-0 z-50 flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-t-[inherit] border-b bg-background/50 backdrop-blur-md transition-[width,height] ease-linear">
            <div className="flex w-full items-center justify-between px-4 lg:px-6">
              <div className="flex items-center gap-1 lg:gap-2">
                <SidebarTrigger className="-ml-1" />
                <Separator
                  orientation="vertical"
                  className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
                />
                <Button
                  onClick={() => setSearch(true)}
                  variant="link"
                  className="px-0! font-normal text-muted-foreground hover:no-underline"
                >
                  <Search data-icon="inline-start" />
                  Search
                  <kbd className="inline-flex h-5 select-none items-center gap-1 rounded border bg-ui-muted px-1.5 font-medium text-[10px]">
                    <span className="text-xs">⌘</span>K
                  </kbd>
                </Button>
              </div>
              <div className="flex items-center gap-2">
                {/* Where you are, derived from the same table the sidebar is
                    built from. Nothing is printed when the URL matches no
                    section — a made-up crumb is worse than none. */}
                {here && (
                  <nav aria-label="Location" className="flex min-w-0 items-center gap-1.5 text-sm">
                    <span className="hidden text-muted-foreground sm:inline">{here.group}</span>
                    <span className="hidden text-muted-foreground/50 sm:inline">/</span>
                    <span className="truncate font-medium">{here.item.label}</span>
                  </nav>
                )}
              </div>
            </div>
          </header>

          {/* ---- Page container --------------------------------------------
              The theme's classes are `min-h-0 min-w-0 flex-1 overflow-x-hidden`.
              `min-h-0` IS DROPPED, on purpose. In the theme the whole document
              scrolls, so it never bites; here the shell is height-capped for the
              offline strip, and with `min-h-0` this box shrinks to the space
              left over and scrolls INSIDE itself — which pins the header above a
              separate pane instead of letting the page run under it. Without it
              the box grows to its content, the inset scrolls, and the header
              behaves as the theme's does: sticky, translucent, with the page
              visibly passing beneath. Verified by scrolling both.

              `overflow-x-hidden` goes with it, and for the same reason: a box
              with a non-visible overflow IS a scroll container, and a flex
              item's automatic minimum size collapses to zero the moment it
              becomes one — so leaving it in re-creates the inner pane by the
              back door, which is exactly what happened on the first attempt.
              The inset's own `overflow-x-clip` does the horizontal clipping. */}
          <div className={cn("min-w-0 flex-1 p-4 md:p-6")}>{children}</div>
        </SidebarInset>
      </SidebarProvider>

      <ScreenSearch open={search} onOpenChange={setSearch} />
    </TooltipProvider>
  );
}
