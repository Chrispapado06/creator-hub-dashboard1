import { Compass, House, MessageCircle, Play, User } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Primary navigation.
 *
 * Starting an activity is the single most important action in the app, so it
 * sits dead centre as a raised control rather than competing as one tab among
 * five. Activity history is still one tap away from Home and Profile — the
 * centre button is the *doing*, the history is the *looking back*.
 */
const TABS = [
  { to: "/home", label: "Home", icon: House },
  { to: "/explore", label: "Explore", icon: Compass },
  null, // centre slot — the start control
  { to: "/coach", label: "Coach", icon: MessageCircle },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function TabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className="relative z-20 shrink-0 border-t border-hairline bg-obsidian/85 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary"
    >
      <ul className="flex h-[var(--tabbar-h)] items-stretch">
        {TABS.map((tab, i) => {
          if (!tab) {
            return (
              <li key="start" className="relative flex-1">
                <button
                  type="button"
                  onClick={() => navigate("/activity/select")}
                  aria-label="Start an activity"
                  className="group absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[22px]"
                >
                  {/* Obsidian ring punches the button through the bar. */}
                  <span className="grid h-[62px] w-[62px] place-items-center rounded-full bg-obsidian">
                    <span
                      className={cn(
                        "grid h-[54px] w-[54px] place-items-center rounded-full text-snow",
                        "bg-gradient-to-b from-azure to-azure-deep",
                        "transition-all duration-200 ease-[cubic-bezier(.22,1,.36,1)]",
                        "group-hover:from-azure-bright group-hover:to-azure group-active:scale-95",
                        // The glow is the control's whole presence in the bar.
                        "shadow-[0_8px_28px_-6px_var(--ice-azure-glow)]",
                      )}
                    >
                      <Play size={20} strokeWidth={2} className="ml-0.5" fill="currentColor" />
                    </span>
                  </span>
                  <span className="section-label absolute inset-x-0 -bottom-[18px] text-center text-azure">
                    Start
                  </span>
                </button>
              </li>
            );
          }

          const active = pathname === tab.to || pathname.startsWith(`${tab.to}/`);
          const Icon = tab.icon;

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
                <Icon
                  size={20}
                  strokeWidth={active ? 1.7 : 1.4}
                  className={cn(
                    "transition-colors duration-200",
                    active ? "text-azure" : "text-mist-dim group-hover:text-mist",
                  )}
                />
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
