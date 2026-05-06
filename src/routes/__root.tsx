import { Outlet, Link, createRootRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Settings, LogOut, Sun, Moon, Users, DollarSign,
  CalendarDays, LayoutDashboard, ChevronDown, ChevronRight,
} from "lucide-react";
import { SiOnlyfans, SiInstagram, SiFacebook, SiReddit, SiX, SiMeta } from "react-icons/si";

type AgencySettings = {
  agency_name: string;
  logo_url: string | null;
  theme: string;
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
      activeProps={{ className: "bg-secondary text-foreground" }}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
    >
      <span className="h-4 w-4 shrink-0 flex items-center justify-center">{icon}</span>
      {label}
    </Link>
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
    const session = localStorage.getItem("agency_session");
    if (session) {
      setAuthed(true);
      loadSettings();
    } else {
      setAuthed(false);
    }

    const onAuthChanged = () => {
      const s = localStorage.getItem("agency_session");
      setAuthed(!!s);
      if (s) loadSettings();
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
      navigate({ to: "/" });
    }
  }, [authed, location.pathname]);

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

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-border bg-background">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
          {settings.logo_url ? (
            <img
              src={settings.logo_url}
              alt={settings.agency_name}
              className="h-7 w-7 rounded-md object-cover border border-border"
            />
          ) : (
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-primary-glow shadow-[0_0_16px_oklch(0.72_0.18_30/0.35)] shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate">{settings.agency_name}</div>
            <div className="text-[10px] text-muted-foreground -mt-0.5">Creator operations</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {/* Main */}
          <div className="space-y-0.5">
            <SideNavLink to="/daily" icon={<LayoutDashboard className="h-4 w-4" />} label="Daily Dashboard" />
            <SideNavLink to="/" icon={<Users className="h-4 w-4" />} label="Creators" exact />
            <SideNavLink to="/revenue" icon={<DollarSign className="h-4 w-4" />} label="Revenue" />
            <SideNavLink to="/weekly" icon={<CalendarDays className="h-4 w-4" />} label="Weekly" />
          </div>

          {/* Platforms */}
          <div>
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Platforms
            </div>
            <div className="space-y-0.5">
              <SideNavLink to="/onlyfans" icon={<SiOnlyfans className="h-4 w-4" />} label="OnlyFans" />
              <SideNavLink to="/reddit" icon={<SiReddit className="h-4 w-4" />} label="Reddit" />
              <SideNavLink to="/x" icon={<SiX className="h-4 w-4" />} label="X" />
              <MetaNavGroup />
            </div>
          </div>
        </nav>

        {/* Bottom */}
        <div className="border-t border-border px-3 py-3 space-y-0.5">
          <SideNavLink to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
          <button
            onClick={onToggleTheme}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            <span className="h-4 w-4 shrink-0 flex items-center justify-center">
              {settings.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </span>
            {settings.theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-destructive"
          >
            <span className="h-4 w-4 shrink-0 flex items-center justify-center">
              <LogOut className="h-4 w-4" />
            </span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-56 flex-1 min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
