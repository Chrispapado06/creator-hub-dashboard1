import { BadgeCheck, CalendarRange, House, MessageCircle, User } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ENQUIRIES, isUnanswered } from "@/data/demo";

/**
 * Primary navigation, five even tabs.
 *
 * No raised centre control, unlike the athlete app. There the centre button is
 * "start an activity" — the one thing a user opens the app to do. A guide has no
 * equivalent single verb; they arrive to answer someone, check a date or fix a
 * document, and promoting any one of those over the others would be a guess.
 */
const TABS = [
  { to: "/", label: "Today", icon: House },
  { to: "/openings", label: "Dates", icon: CalendarRange },
  { to: "/enquiries", label: "Clients", icon: MessageCircle },
  { to: "/verification", label: "Checks", icon: BadgeCheck },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function TabBar() {
  const { pathname } = useLocation();
  /**
   * THE SECOND READER OF THE SEED, and the reason §6e exists.
   *
   * Gating `ENQUIRIES` at its definition stops the invented clients reaching a
   * screen. It does NOT travel to this badge: an aggregate over a now-empty
   * array is a different bug from an ungated fixture, and it only appears in
   * production. Here it is benign — an empty list counts zero and the badge
   * hides — but "benign" is a thing you confirm by looking, not by assuming,
   * and the compiler only surfaced this file because the shape changed too.
   *
   * `unread` is gone as a stored flag. Whether a client is waiting is derived
   * from whether they have been answered, so a badge cannot disagree with the
   * screen it points at.
   */
  const waiting = ENQUIRIES.filter(isUnanswered).length;

  return (
    <nav
      className="relative z-20 shrink-0 border-t border-hairline bg-obsidian/85 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary"
    >
      <ul className="flex h-[var(--tabbar-h)] items-stretch">
        {TABS.map((tab) => {
          const active = tab.to === "/" ? pathname === "/" : pathname.startsWith(tab.to);
          const Icon = tab.icon;
          const badge = tab.to === "/enquiries" ? waiting : 0;

          return (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                className="group relative flex h-full flex-col items-center justify-center gap-1.5"
                aria-current={active ? "page" : undefined}
              >
                {active && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute inset-x-[22%] top-0 h-px bg-azure"
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                <span className="relative">
                  <Icon
                    size={20}
                    strokeWidth={active ? 1.7 : 1.4}
                    className={cn(
                      "transition-colors duration-200",
                      active ? "text-azure" : "text-mist-dim group-hover:text-mist",
                    )}
                  />
                  {badge > 0 && (
                    <span className="tnum absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-azure px-1 text-[9px] font-medium text-obsidian">
                      {badge}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[9px] font-medium uppercase tracking-[0.14em] transition-colors duration-200",
                    active ? "text-azure" : "text-mist-dim group-hover:text-mist",
                  )}
                >
                  {tab.label}
                </span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
