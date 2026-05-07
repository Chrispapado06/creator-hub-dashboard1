import { Outlet, Link, createRootRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Settings, LogOut, Sun, Moon, Users, DollarSign,
  CalendarDays, LayoutDashboard, ChevronDown, ChevronRight,
  MessageCircle, UserPlus, ScrollText, Sparkles,
} from "lucide-react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { InstallPromptBanner } from "@/components/InstallPromptBanner";
import { SiOnlyfans, SiInstagram, SiFacebook, SiReddit, SiX, SiMeta, SiTiktok, SiAirtable } from "react-icons/si";

type AgencySettings = {
  agency_name: string;
  logo_url: string | null;
  theme: string;
};

type SessionData = { username: string; type: "admin" | "staff"; chatter_id: string | null };

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
      };
    }
  } catch {
    // Legacy: plain-string session = admin
    return { username: raw, type: "admin", chatter_id: null };
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

function SideNavLink({
  to,
  icon,
  label,
  exact,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  exact?: boolean;
}) {
  return (
    <Link
      to={to}
      activeOptions={exact ? { exact: true } : undefined}
      activeProps={{
        className:
          "bg-primary/10 text-foreground font-medium before:bg-primary [&_.nav-icon]:text-primary",
      }}
      className="relative flex items-center gap-3 rounded-lg pl-4 pr-3 py-2 text-sm text-muted-foreground transition-all duration-150 ease-out hover:bg-secondary/60 hover:text-foreground hover:translate-x-px before:content-[''] before:absolute before:left-1 before:top-1/2 before:-translate-y-1/2 before:h-1/2 before:w-[3px] before:rounded-full before:bg-transparent before:transition-colors"
    >
      <span className="nav-icon h-4 w-4 shrink-0 flex items-center justify-center transition-colors">{icon}</span>
      {label}
    </Link>
  );
}

function RedditNavGroup() {
  const location = useLocation();
  const isRedditActive =
    location.pathname === "/reddit" || location.pathname === "/reddit-airtable";
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
          <SideNavLink to="/reddit" icon={<SiReddit className="h-4 w-4" />} label="Posts" />
          <SideNavLink to="/reddit-airtable" icon={<SiAirtable className="h-4 w-4" />} label="Airtable" />
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
          <SideNavLink to="/instagram" icon={<SiInstagram className="h-4 w-4" />} label="Instagram" />
          <SideNavLink to="/facebook" icon={<SiFacebook className="h-4 w-4" />} label="Facebook" />
          <SideNavLink to="/ads" icon={<DollarSign className="h-4 w-4" />} label="Ads" />
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
    if (authed === false && location.pathname !== "/login") {
      navigate({ to: "/login" });
    }
    if (authed === true && location.pathname === "/login") {
      navigate({ to: session?.type === "staff" ? "/clock" : "/" });
    }
    // Force staff to stay on /clock — they have no admin access
    if (authed === true && session?.type === "staff" && location.pathname !== "/clock" && location.pathname !== "/login") {
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

  if (authed === null) return null;

  if (location.pathname === "/login") {
    return <Outlet />;
  }

  if (!authed) return null;

  // Staff portal: no sidebar, no admin nav. Outlet renders /clock.
  if (session?.type === "staff") {
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
        <InstallPromptBanner />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-card/30 backdrop-blur-sm">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-5">
          <AgencyLogoBadge url={settings.logo_url} name={settings.agency_name} />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate">{settings.agency_name}</div>
            <div className="text-[10px] text-muted-foreground -mt-0.5 tracking-wide">Creator operations</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-6">
          {/* Main */}
          <div className="space-y-0.5">
            <SideNavLink to="/daily" icon={<LayoutDashboard className="h-4 w-4" />} label="Daily Dashboard" />
            <SideNavLink to="/" icon={<Users className="h-4 w-4" />} label="Creators" exact />
            <SideNavLink to="/revenue" icon={<DollarSign className="h-4 w-4" />} label="Revenue" />
            <SideNavLink to="/weekly" icon={<CalendarDays className="h-4 w-4" />} label="Weekly" />
          </div>

          {/* Operations */}
          <div>
            <div className="flex items-center gap-2 px-3 mb-2">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                Operations
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <div className="space-y-0.5">
              <SideNavLink to="/chatters" icon={<MessageCircle className="h-4 w-4" />} label="Staff" />
              <SideNavLink to="/leads" icon={<UserPlus className="h-4 w-4" />} label="Client Acquisition" />
              <SideNavLink to="/audit" icon={<ScrollText className="h-4 w-4" />} label="Audit Log" />
            </div>
          </div>

          {/* Platforms */}
          <div>
            <div className="flex items-center gap-2 px-3 mb-2">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                Platforms
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <div className="space-y-0.5">
              <SideNavLink to="/onlyfans" icon={<SiOnlyfans className="h-4 w-4" />} label="OnlyFans" />
              <RedditNavGroup />
              <SideNavLink to="/x" icon={<SiX className="h-4 w-4" />} label="X" />
              <SideNavLink to="/tiktok" icon={<SiTiktok className="h-4 w-4" />} label="TikTok" />
              <MetaNavGroup />
            </div>
          </div>

          {/* AI */}
          <div>
            <div className="flex items-center gap-2 px-3 mb-2">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                AI
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <div className="space-y-0.5">
              <SideNavLink to="/bernard" icon={<Sparkles className="h-4 w-4" />} label="Bernard" />
            </div>
          </div>
        </nav>

        {/* Bottom */}
        <div className="border-t border-border px-3 py-3 space-y-0.5">
          <SideNavLink to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
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

      {/* Main content */}
      <main className="ml-60 flex-1 min-h-screen relative">
        <div className="absolute top-5 right-8 z-30 flex items-center gap-2">
          <SyncStatusBadge enabled={authed === true} />
          <NotificationsBell />
        </div>
        <div className="mx-auto max-w-7xl px-8 py-10">
          <Outlet />
        </div>
      </main>
      <InstallPromptBanner />
    </div>
  );
}
