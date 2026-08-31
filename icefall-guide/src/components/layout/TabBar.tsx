import { BarChart3, House, MessageCircle, User, Users } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { THREADS } from "@/data/demo";
import { sample, useSampleGate } from "@/domain/sampleGate";

/**
 * Primary navigation, five even tabs, to the owner's mockup.
 *
 * No raised centre control, unlike the athlete app. There the centre button is
 * "start an activity" — the one thing a user opens the app to do. A guide has no
 * equivalent single verb; they arrive to answer someone, check a date or look at
 * a booking, and promoting any one of those would be a guess.
 */
const TABS = [
  { to: "/", label: "Home", icon: House },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function TabBar() {
  const { pathname } = useLocation();
  /**
   * THE SECOND READER OF THE SEED, and the reason §6e exists. Gating `THREADS`
   * at its definition stops invented clients reaching a screen; it does not
   * travel to this badge. Here an empty list counts zero and the badge hides,
   * which is correct — but "correct" is something you confirm by looking.
   */
  /**
   * THE BADGE IS A THIRTEENTH READER, and it was the one still lit after every
   * screen had been fixed — the sample gone from Clients and the tab bar still
   * promising six unread messages. §6e's rule about a gate not travelling to a
   * second import site, and §6aj's about what quietly keeps doing the old thing,
   * are the same rule seen from two directions: a count is a reader too.
   *
   * `useSampleGate()` rather than a bare read, so the badge clears on the same
   * tick the screens do.
   */
  useSampleGate();
  const unread = sample(THREADS, []).reduce((n, t) => n + t.unread, 0);

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
          const badge = tab.to === "/chat" ? unread : 0;

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
                    className="absolute inset-x-[26%] top-0 h-[2px] rounded-pill bg-azure"
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                <span className="relative">
                  <Icon
                    size={20}
                    strokeWidth={active ? 2 : 1.5}
                    className={cn(
                      "transition-colors duration-200",
                      active ? "text-azure" : "text-mist-dim group-hover:text-mist",
                    )}
                  />
                  {badge > 0 && (
                    <span className="tnum absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-azure px-1 text-[9px] font-semibold text-obsidian">
                      {badge}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[9.5px] font-medium tracking-[0.04em] transition-colors duration-200",
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
