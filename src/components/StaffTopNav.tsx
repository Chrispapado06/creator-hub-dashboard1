// Top nav for the staff portal.
//
// Staff sessions skip the admin sidebar entirely (login redirects to
// /clock and the layout renders just Outlet). That means there's no
// way to navigate to other staff-accessible pages like /chat. This
// thin top bar fills that gap with a Clock / Chat tab pair plus the
// agency badge and a sign-out button. Stays compact (~3.5rem) so it
// doesn't eat into the existing /clock layout.

import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clock as ClockIcon, MessagesSquare, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ChatBadge } from "@/components/ChatBadge";

export function StaffTopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [agencyName, setAgencyName] = useState("Agency Console");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from("agency_settings")
      .select("agency_name, logo_url")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.agency_name) setAgencyName(data.agency_name);
        if (data?.logo_url) setLogoUrl(data.logo_url);
      });
  }, []);

  const onSignOut = () => {
    localStorage.removeItem("agency_session");
    window.dispatchEvent(new Event("agency-auth-changed"));
    navigate({ to: "/login" });
  };

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-card/60 backdrop-blur-md flex items-center px-3 sm:px-5 gap-3">
      {/* Brand */}
      <div className="flex items-center gap-2 min-w-0">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-7 w-7 rounded-md object-cover" />
        ) : (
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-primary-glow" />
        )}
        <span className="text-sm font-semibold tracking-tight truncate hidden sm:inline">
          {agencyName}
        </span>
      </div>

      {/* Tabs — centered on desktop, left-aligned on mobile */}
      <nav className="flex items-center gap-1 ml-auto sm:ml-4 sm:mr-auto">
        <StaffTab
          to="/clock"
          icon={<ClockIcon className="h-4 w-4" />}
          label="Clock"
          active={location.pathname === "/clock"}
        />
        <StaffTab
          to="/chat"
          icon={<MessagesSquare className="h-4 w-4" />}
          label="Chat"
          active={location.pathname === "/chat"}
          // Same Discord-style ping pill as the admin sidebar uses.
          badge={<ChatBadge />}
        />
      </nav>

      <button
        onClick={onSignOut}
        className="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors px-2.5 py-1.5 rounded-md hover:bg-destructive/10"
        aria-label="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </header>
  );
}

function StaffTab({
  to, icon, label, active, badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      }`}
    >
      <span className={active ? "text-primary" : ""}>{icon}</span>
      <span>{label}</span>
      {badge}
    </Link>
  );
}
