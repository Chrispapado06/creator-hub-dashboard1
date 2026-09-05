/**
 * The frame: navigation, identity, notifications.
 *
 * Built to the operator mockups. Navigation is filtered by role — a Sales
 * Employee is not shown a Company Profile link they would be refused at, because
 * the honest expression of a simple permission model is a nav that offers only
 * what the person can do, rather than one that offers everything and rejects
 * half of it.
 *
 * Expeditions and Treks are separate entries, as the mockups have them. They are
 * one table and one editor underneath — spec §7 treats them as distinct product
 * types sharing the same infrastructure — but an operator thinks about "my
 * expeditions" and "my treks" as two catalogues, and the nav follows the
 * operator rather than the schema.
 */

import {
  Bell, Building2, ChartNoAxesColumn, Columns3, Footprints, LayoutDashboard, LogOut,
  MessagesSquare, Mountain as MountainIcon, Package, Radio, Receipt, Settings as SettingsIcon, Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { can, type Permission } from "@/domain/authz";
import { DEMO } from "@/offline/offline";
import { useAsync, useOperator } from "@/state/OperatorContext";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: Permission;
  badge?: number;
}

/**
 * Initials, never a photograph.
 *
 * The mockups show avatar photos for staff and for customers. An invented face
 * attached to an invented name is a fabricated person, which the doctrine rules
 * out flatly — and a real climber's photograph is not ours to render in a
 * company's back office either.
 */
export function Monogram({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-pill bg-elevated font-medium text-muted"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { session, company, backend, signOut, revision } = useOperator();
  const location = useLocation();

  const conversations = useAsync(
    () => (session ? backend.getConversations(session) : Promise.resolve([])),
    [session, revision],
    [],
  );
  const notifications = useAsync(
    () => (session ? backend.getNotifications(session) : Promise.resolve([])),
    [session, revision],
    [],
  );

  if (!session) return <>{children}</>;

  const unread = conversations.filter((c) => c.unread).length;
  const unreadNotifications = notifications.filter((n) => n.readAt === null).length;

  const items: NavItem[] = [
    { to: "/operator/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "viewAnalytics" },
    { to: "/operator/mountains", label: "My Mountains", icon: MountainIcon, permission: "viewProducts" },
    { to: "/operator/expeditions", label: "Expeditions", icon: Package, permission: "viewProducts" },
    { to: "/operator/treks", label: "Treks", icon: Footprints, permission: "viewProducts" },
    { to: "/operator/leads", label: "Leads & Messages", icon: MessagesSquare, permission: "manageLeads", badge: unread },
    { to: "/operator/pipeline", label: "Pipeline", icon: Columns3, permission: "manageLeads" },
    { to: "/operator/bookings", label: "Bookings", icon: Receipt, permission: "viewAnalytics" },
    { to: "/operator/analytics", label: "Analytics", icon: ChartNoAxesColumn, permission: "viewAnalytics" },
    { to: "/operator/company", label: "Company Profile", icon: Building2, permission: "editCompanyProfile" },
    // A channel is published company content, so it sits under the profile and
    // takes the same permission the adapter checks before it accepts one.
    { to: "/operator/channels", label: "Channels", icon: Radio, permission: "editCompanyProfile" },
    { to: "/operator/team", label: "Team", icon: Users, permission: "manageStaff" },
    { to: "/operator/notifications", label: "Notifications", icon: Bell, permission: "viewInbox", badge: unreadNotifications },
    { to: "/operator/settings", label: "Settings", icon: SettingsIcon, permission: "viewInbox" },
  ];

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-[212px] shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M2 20 L9 6 L13 13 L16 9 L22 20 Z" fill="currentColor" className="text-ink" />
            </svg>
            <span className="text-[13px] font-medium tracking-[0.18em] text-ink">ICEFALL</span>
          </div>
          <div className="lbl mt-2" style={{ letterSpacing: "0.22em" }}>Operator</div>
          <div className="ser mt-3 truncate text-[15px] text-muted" title={company?.name}>
            {company?.name ?? "—"}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {items
            .filter((i) => can(session, i.permission))
            .map((item) => {
              const Icon = item.icon;
              const active = location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`relative mb-0.5 flex items-center gap-3 rounded-tile px-3 py-2.5 text-[12.5px] transition-colors ${
                    active
                      ? "bg-raised font-medium text-ink"
                      : "text-muted hover:bg-raised hover:text-ink"
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute top-1/2 left-0 h-[17px] w-[2px] -translate-y-1/2 rounded-pill bg-azure"
                    />
                  )}
                  <Icon size={15.5} className="shrink-0" aria-hidden />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="tnum rounded-pill bg-azure px-1.5 py-0.5 text-[10px] font-semibold text-canvas">
                      {item.badge}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
        </nav>

        <div className="flex items-center gap-2.5 border-t border-line px-4 py-3.5">
          <Monogram name={session.user.displayName} size={30} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-medium text-ink">{session.user.displayName}</div>
            {/* The mockup's label. `admin` is the schema's word; the person is an Operator. */}
            <div className="text-[11px] text-faint">{session.user.role === "admin" ? "Operator" : "Sales"}</div>
          </div>
          {/*
            NOT DRAWN WHEN IT CANNOT ACT.

            `signOut` returns immediately under DEMO (OperatorContext) — and
            correctly so: the session is seeded at start-up, there is no sign-in
            screen to return to, and clearing it would strand the reader on a
            dead end. But DEMO is the build that is deployed, so what the
            operator saw was a Sign out control that did nothing at all when
            pressed. A control that silently declines is worse than an absent
            one: the reader concludes they are signed out when they are not.

            So the button renders only in a build where signing out signs you
            out. This is a render decision taken from the same flag the action
            reads, so the two cannot drift apart.
          */}
          {!DEMO && (
            <button onClick={signOut} title="Sign out" className="text-faint hover:text-ink">
              <LogOut size={14} aria-hidden />
            </button>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-[1180px] px-7 py-7">{children}</main>
      </div>
    </div>
  );
}
