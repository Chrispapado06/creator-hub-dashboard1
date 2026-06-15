import { Outlet, Link, createRootRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canAccessPage, isSuperAdmin } from "@/lib/admin-pages";
import { ChatBadge } from "@/components/ChatBadge";
import { StaffTopNav } from "@/components/StaffTopNav";
import {
  Settings, LogOut, Sun, Moon, Users, DollarSign,
  CalendarDays, LayoutDashboard, ChevronDown, ChevronRight,
  MessageCircle, UserPlus, ScrollText, Sparkles, Zap,
  PiggyBank, MessagesSquare, Menu, X as XIcon, Brain, ListChecks,
} from "lucide-react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { InstallPromptBanner } from "@/components/InstallPromptBanner";
import { SiOnlyfans, SiInstagram, SiFacebook, SiReddit, SiX, SiMeta, SiTiktok, SiAirtable } from "react-icons/si";
import { OnlyFinderLogo } from "@/components/onlyfinder/OnlyFinderLogo";

type AgencySettings = {
  agency_name: string;
  logo_url: string | null;
  theme: string;
};

type SessionData = {
  username: string;
  type: "admin" | "staff";
  chatter_id: string | null;
  allowed_pages: string[] | null;
};

function AgencyLogoBadge({ url, name }: { url: string | null; name: string }) {
  const [errored, setErrored] = useState(false);
  useEffect(() => { setErrored(false); }, [url]);
  if (!url || errored) {
    return (
      <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary-glow shadow-[0_4px_20px_-4px_oklch(0.6_0.15_35/0.5)] shrink-0" />
    );
  }
  return (
    <img
      src={url}
      alt={name}
      className="h-9 w-9 rounded-xl object-cover border border-border shadow-sm shrink-0"
      onError={() => setErrored(true)}
    />
  );
}

const parseSession = (raw: string | null): SessionData | null => {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && obj.username) {
      return {
        username: obj.username,
        type: obj.type === "staff" ? "staff" : "admin",
        chatter_id: obj.chatter_id ?? null,
        // null = unrestricted (super admin); array = restricted to those page slugs
        allowed_pages: Array.isArray(obj.allowed_pages) ? obj.allowed_pages : null,
      };
    }
  } catch {
    // Legacy: plain-string session = admin with full access
    return { username: raw, type: "admin", chatter_id: null, allowed_pages: null };
  }
  return null;
};

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

// Context carries the active admin's allowed_pages so SideNavLink can
// hide entries the admin doesn't have permission to see. null means
// "no restrictions" (super admin) and every link renders.
const AllowedPagesCtx = createContext<string[] | null>(null);

function SideNavLink({
  to,
  icon,
  label,
  exact,
  slug,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
  /** Optional permission slug. If set and the admin doesn't have it,
      this link is hidden. Omit to always render (settings, profile, etc). */
  slug?: string;
  /** Optional trailing element (e.g. unread-mention pill). Rendered
      flush right via ml-auto. */
  badge?: React.ReactNode;
}) {
  const allowedPages = useContext(AllowedPagesCtx);
  if (slug && !canAccessPage(slug, allowedPages)) return null;
  return (
    <Link
      to={to}
      activeOptions={exact ? { exact: true } : undefined}
      activeProps={{
        // Filled green pill, white text/icon — Fixoria aesthetic.
        className:
          "bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/30 [&_.nav-icon]:text-primary-foreground hover:bg-primary",
      }}
      className="relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all duration-150 ease-out hover:bg-secondary hover:text-foreground"
    >
      <span className="nav-icon h-4 w-4 shrink-0 flex items-center justify-center transition-colors">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </Link>
  );
}

/** Collapsible section header — uppercase label, ± chevron on the right.
 *  Matches Fixoria's "DAILY OPERATION −" pattern. Persists open/closed
 *  state in localStorage so it survives reloads. */
function NavSection({
  id,
  label,
  defaultOpen = true,
  children,
}: {
  id: string;
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const storageKey = `navsection:${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v == null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, open ? "1" : "0"); } catch { /* ignore */ }
  }, [open, storageKey]);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 mb-1.5 group"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70 group-hover:text-foreground transition-colors">
          {label}
        </span>
        <div className="h-px flex-1 bg-border/60" />
        <span className="text-muted-foreground/50 group-hover:text-foreground transition-colors">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

function RedditNavGroup() {
  const location = useLocation();
  const isRedditActive =
    location.pathname === "/reddit" ||
    location.pathname === "/reddit-airtable" ||
    location.pathname === "/reddit-scorer";
  const [open, setOpen] = useState(isRedditActive);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isRedditActive
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        }`}
      >
        <span className="h-4 w-4 shrink-0 flex items-center justify-center">
          <SiReddit className="h-4 w-4" />
        </span>
        <span className="flex-1 text-left">Reddit</span>
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-50" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-50" />
        )}
      </button>
      {open && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
          <SideNavLink to="/reddit" slug="reddit" icon={<SiReddit className="h-4 w-4" />} label="Posts" />
          <SideNavLink to="/reddit-airtable" slug="reddit-airtable" icon={<SiAirtable className="h-4 w-4" />} label="Airtable" />
          <SideNavLink to="/reddit-scorer" slug="reddit-scorer" icon={<Sparkles className="h-4 w-4" />} label="Scorer" />
        </div>
      )}
    </div>
  );
}

/** Assistant dropdown — Bernard + his Brains nested underneath, same
 *  pattern as Meta. Auto-opens when you're on a child route. */
function AssistantNavGroup() {
  const location = useLocation();
  const isActive =
    location.pathname === "/bernard" || location.pathname === "/brains";
  const [open, setOpen] = useState(isActive);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        }`}
      >
        <span className="h-4 w-4 shrink-0 flex items-center justify-center">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="flex-1 text-left">Assistant</span>
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-50" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-50" />
        )}
      </button>
      {open && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
          <SideNavLink to="/bernard" slug="bernard" icon={<Sparkles className="h-4 w-4" />} label="Bernard" />
          <SideNavLink to="/brains" slug="brains" icon={<Brain className="h-4 w-4" />} label="Brains" />
        </div>
      )}
    </div>
  );
}

function MetaNavGroup() {
  const location = useLocation();
  const isMetaActive =
    location.pathname === "/instagram" ||
    location.pathname === "/facebook" ||
    location.pathname === "/ads";
  const [open, setOpen] = useState(isMetaActive);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isMetaActive
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        }`}
      >
        <span className="h-4 w-4 shrink-0 flex items-center justify-center">
          <SiMeta className="h-4 w-4" />
        </span>
        <span className="flex-1 text-left">Meta</span>
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-50" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-50" />
        )}
      </button>
      {open && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
          <SideNavLink to="/instagram" slug="instagram" icon={<SiInstagram className="h-4 w-4" />} label="Instagram" />
          <SideNavLink to="/facebook" slug="facebook" icon={<SiFacebook className="h-4 w-4" />} label="Facebook" />
          <SideNavLink to="/ads" slug="ads" icon={<DollarSign className="h-4 w-4" />} label="Ads" />
        </div>
      )}
    </div>
  );
}

function RootComponent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [settings, setSettings] = useState<AgencySettings>({
    agency_name: "Agency Console",
    logo_url: null,
    theme: "dark",
  });
  // Mobile drawer for the admin sidebar. Hidden by default; opens via
  // the top-left hamburger button. Auto-closes on navigation so a tap
  // on a nav link feels like a real page change.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  const applyTheme = (theme: string) => {
    if (theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  };

  const loadSettings = async () => {
    const { data } = await supabase.from("agency_settings").select("agency_name, logo_url, theme").maybeSingle();
    if (data) {
      setSettings(data as AgencySettings);
      localStorage.setItem("agency_theme", data.theme);
      applyTheme(data.theme);
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem("agency_theme") || "dark";
    applyTheme(savedTheme);
  }, []);

  // Custom domain support: if a visitor hits a hostname that's been registered
  // as a creator's landing-page custom_domain, route them straight to that
  // landing page. This makes URLs like `creatorname.com` behave like a
  // Linktree — clean, no /p/<slug> in the URL.
  //
  // Skips when:
  //   - we're already on /p/<slug> (the redirect already happened or the URL
  //     is being typed by an admin)
  //   - the host is localhost / vercel.app (those are dashboard hosts)
  //   - the user is logged in (admins/staff visiting a custom domain shouldn't
  //     be hijacked away from the dashboard)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (location.pathname.startsWith("/p/")) return;
    if (authed === true) return;
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return;
    if (host.endsWith(".vercel.app")) return;
    let cancelled = false;
    void supabase
      .from("creator_landing_pages")
      .select("slug, is_published")
      .eq("custom_domain", host)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data || !data.is_published) return;
        navigate({ to: `/p/${data.slug}` });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, location.pathname]);

  useEffect(() => {
    const raw = localStorage.getItem("agency_session");
    const parsed = parseSession(raw);
    if (parsed) {
      setSession(parsed);
      setAuthed(true);
      loadSettings();
    } else {
      setSession(null);
      setAuthed(false);
    }

    const onAuthChanged = () => {
      const r = localStorage.getItem("agency_session");
      const p = parseSession(r);
      setSession(p);
      setAuthed(!!p);
      if (p) loadSettings();
    };
    const onSettingsUpdated = () => loadSettings();

    window.addEventListener("agency-auth-changed", onAuthChanged);
    window.addEventListener("agency-settings-updated", onSettingsUpdated);
    return () => {
      window.removeEventListener("agency-auth-changed", onAuthChanged);
      window.removeEventListener("agency-settings-updated", onSettingsUpdated);
    };
  }, []);

  useEffect(() => {
    // /p/<slug> is the public landing-page namespace and must work for anonymous
    // visitors regardless of auth state.
    const isPublic = location.pathname.startsWith("/p/") || location.pathname === "/p";
    if (isPublic) return;

    if (authed === false && location.pathname !== "/login") {
      navigate({ to: "/login" });
    }
    if (authed === true && location.pathname === "/login") {
      navigate({ to: session?.type === "staff" ? "/clock" : "/" });
    }
    // Staff are restricted to the routes they need: /clock for shifts and
    // /chat for team comms. Anywhere else (admin pages, settings, etc)
    // bounces back to /clock. Without /chat in the allow-list, clicking
    // the Chat tab in StaffTopNav fired this guard and redirected back —
    // the page would flash blank then return to /clock.
    const STAFF_ALLOWED = ["/clock", "/chat", "/login"];
    if (
      authed === true &&
      session?.type === "staff" &&
      !STAFF_ALLOWED.includes(location.pathname)
    ) {
      navigate({ to: "/clock" });
    }
  }, [authed, location.pathname, session]);

  const onLogout = () => {
    localStorage.removeItem("agency_session");
    window.dispatchEvent(new Event("agency-auth-changed"));
    navigate({ to: "/login" });
  };

  const onToggleTheme = async () => {
    const newTheme = settings.theme === "dark" ? "light" : "dark";
    applyTheme(newTheme);
    localStorage.setItem("agency_theme", newTheme);
    setSettings((s) => ({ ...s, theme: newTheme }));
    await supabase.from("agency_settings").update({ theme: newTheme });
  };

  // Public landing pages bypass auth entirely — they're meant to be hit by
  // anonymous visitors. They render outside the dashboard chrome too.
  const isPublicLanding =
    location.pathname.startsWith("/p/") || location.pathname === "/p";
  if (isPublicLanding) {
    return <Outlet />;
  }

  if (authed === null) return null;

  if (location.pathname === "/login") {
    return <Outlet />;
  }

  if (!authed) return null;

  // Staff portal: thin top nav (Clock / Chat tabs + sign-out) above
  // the page content. No admin sidebar — staff only see what they
  // need. Login redirects to /clock; the nav lets them hop to /chat.
  //
  // The /chat route mirrors the admin-side wrapper: a separate
  // `flex-1 min-h-0 flex flex-col` div around the Outlet so chat.tsx's
  // own `flex-1 min-h-0 h-full` can resolve to a real pixel height.
  // Without this extra flex column, the chat's outer container
  // collapses to 0 height in some browsers (Safari iOS especially) —
  // staff would see the Chat tab navigate but the page would render
  // blank because the chat is sized to nothing.
  if (session?.type === "staff") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <StaffTopNav />
        <main className="flex-1 min-h-0 flex flex-col">
          {location.pathname === "/chat" ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <Outlet />
            </div>
          ) : (
            <Outlet />
          )}
        </main>
        <InstallPromptBanner />
      </div>
    );
  }

  return (
    <AllowedPagesCtx.Provider value={session?.allowed_pages ?? null}>
    <div className="flex min-h-screen bg-background">
      {/* Mobile-only top bar — hamburger + agency name. Hidden on lg
          where the sidebar is permanent. Sticky so it stays visible
          while scrolling. */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 flex items-center justify-between gap-3 px-4 border-b border-border bg-background/90 backdrop-blur-md">
        <button
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
          className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary/60 active:bg-secondary transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <AgencyLogoBadge url={settings.logo_url} name={settings.agency_name} />
          <div className="text-sm font-semibold tracking-tight truncate">{settings.agency_name}</div>
        </div>
        <div className="flex items-center gap-1">
          <SyncStatusBadge enabled={authed === true} />
          <NotificationsBell />
        </div>
      </header>

      {/* Backdrop — only when mobile drawer is open. Tap to close. */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in"
        />
      )}

      {/* Sidebar
          • lg+: fixed permanent sidebar at the left edge (existing behavior)
          • below lg: slide-in drawer toggled via the hamburger above */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-card/95 lg:bg-card/30 backdrop-blur-sm transition-transform duration-200 ease-out ${
        mobileNavOpen ? "translate-x-0" : "-translate-x-full"
      } lg:translate-x-0`}>
        {/* Logo + close (mobile) */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <AgencyLogoBadge url={settings.logo_url} name={settings.agency_name} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold tracking-tight truncate">{settings.agency_name}</div>
            <div className="text-[10px] text-muted-foreground -mt-0.5 tracking-wide">Creator operations</div>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
            className="lg:hidden h-8 w-8 rounded-lg flex items-center justify-center hover:bg-secondary/60 active:bg-secondary transition-colors"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Nav — collapsible section headers with ± chevrons (Fixoria style) */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          <NavSection id="daily" label="Daily Operation">
            <SideNavLink to="/daily" slug="daily" icon={<LayoutDashboard className="h-4 w-4" />} label="Daily Dashboard" />
            <SideNavLink to="/" slug="creators" icon={<Users className="h-4 w-4" />} label="Creators" exact />
            <SideNavLink to="/revenue" slug="revenue" icon={<DollarSign className="h-4 w-4" />} label="Revenue" />
          </NavSection>

          <NavSection id="operations" label="Operations">
            <SideNavLink to="/chatters" slug="chatters" icon={<MessageCircle className="h-4 w-4" />} label="Staff" />
            <SideNavLink to="/tasks" slug="tasks" icon={<ListChecks className="h-4 w-4" />} label="Tasks" />
            <SideNavLink to="/leads" slug="leads" icon={<UserPlus className="h-4 w-4" />} label="Client Acquisition" />
            <SideNavLink to="/automation" slug="automation" icon={<Zap className="h-4 w-4" />} label="Automation" />
            <SideNavLink to="/financials" slug="financials" icon={<PiggyBank className="h-4 w-4" />} label="Financials" />
            <SideNavLink
              to="/chat"
              slug="chat"
              icon={<MessagesSquare className="h-4 w-4" />}
              label="Team Chat"
              badge={<ChatBadge />}
            />
            <SideNavLink to="/audit" slug="audit" icon={<ScrollText className="h-4 w-4" />} label="Audit Log" />
          </NavSection>

          <NavSection id="platforms" label="Platforms">
            <SideNavLink to="/onlyfans" slug="onlyfans" icon={<SiOnlyfans className="h-4 w-4" />} label="OnlyFans" />
            <RedditNavGroup />
            <SideNavLink to="/x" slug="x" icon={<SiX className="h-4 w-4" />} label="X" />
            <SideNavLink to="/tiktok" slug="tiktok" icon={<SiTiktok className="h-4 w-4" />} label="TikTok" />
            <SideNavLink to="/onlyfinder" slug="onlyfinder" icon={<OnlyFinderLogo className="h-4 w-4" />} label="OnlyFinder" />
            <MetaNavGroup />
          </NavSection>

          <NavSection id="ai" label="AI">
            <AssistantNavGroup />
          </NavSection>
        </nav>

        {/* Bottom */}
        <div className="border-t border-border px-3 py-3 space-y-0.5">
          {/* Settings is super-admin-only — restricted admins shouldn't be able
              to manage other admins or change agency-wide settings. */}
          {isSuperAdmin(session?.allowed_pages) && (
            <SideNavLink to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
          )}
          <button
            onClick={onToggleTheme}
            className="flex w-full items-center gap-3 rounded-lg pl-4 pr-3 py-2 text-sm text-muted-foreground transition-all duration-150 ease-out hover:bg-secondary/60 hover:text-foreground hover:translate-x-px"
          >
            <span className="h-4 w-4 shrink-0 flex items-center justify-center">
              {settings.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </span>
            {settings.theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-lg pl-4 pr-3 py-2 text-sm text-muted-foreground transition-all duration-150 ease-out hover:bg-destructive/10 hover:text-destructive hover:translate-x-px"
          >
            <span className="h-4 w-4 shrink-0 flex items-center justify-center">
              <LogOut className="h-4 w-4" />
            </span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content.
          • lg+: reserves 240px on the left for the permanent sidebar
          • below lg: full width; the mobile top bar above gives 56px
            of header space, so the page content offsets by pt-14
          /chat + the Creators routes (/ and /creators/$id) get the full
          canvas (no max-width or page padding) so their split-pane
          layouts can sit flush against the main sidebar — the creator
          rail attaches directly to the admin nav like Golfy's Clients
          panel. Everything else stays centered with max-w-7xl. */}
      <main className="lg:ml-60 flex-1 min-h-screen relative flex flex-col w-full min-w-0 pt-14 lg:pt-0">
        {/* Desktop-only header actions. Mobile shows these in the top bar. */}
        <div className="hidden lg:flex absolute top-5 right-8 z-30 items-center gap-2">
          <SyncStatusBadge enabled={authed === true} />
          <NotificationsBell />
        </div>
        {(() => {
          const path = location.pathname;
          const fullCanvas =
            path === "/chat" ||
            path === "/" ||
            path.startsWith("/creators/");
          return fullCanvas ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <Outlet />
            </div>
          ) : (
            <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-10 w-full">
              <Outlet />
            </div>
          );
        })()}
      </main>
      <InstallPromptBanner />
    </div>
    </AllowedPagesCtx.Provider>
  );
}
