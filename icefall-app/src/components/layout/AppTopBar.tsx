import { Link } from "react-router-dom";
import { Bell, MessageCircle, Search } from "lucide-react";

import { Avatar } from "@/components/ui/primitives";
import { useConversations } from "@/screens/chat/useConversations";
import { useApp } from "@/state/AppState";

/**
 * THE APP'S TOP BAR — you, and the three doors out of whatever you are looking
 * at. On every screen that has the bottom navigation (owner, 2026-09-04).
 *
 * It was Home's alone, drawn over the hero photograph. Hoisting it into the
 * shell means one bar in one place rather than five copies drifting apart, and
 * it means the avatar and the unread count are reachable from Coach, Explore
 * and Social without going Home first.
 *
 * WHAT CHANGED ON HOME BY MOVING IT: the hero photograph used to run up behind
 * these controls. It now begins below them. That is the honest cost of the bar
 * being shared — an overlaid bar would have to sit on top of every OTHER
 * screen's content too, and those screens are not photographs.
 *
 * IT CLEARS THE NOTCH, AND IT IS NOW THE ONLY THING THAT DOES. `AppShell` sets
 * `--screen-safe-top: 0px` on the content below, so the layouts and `Screen`
 * do not clear it a second time — the rule this codebase already had ("the
 * notch, counted ONCE") applied to a new top element. Get this wrong and every
 * screen gains ~50px of dead space on a handset and none at all in a desktop
 * browser, where `env()` resolves to 0.
 *
 * NO DOT ON THE BELL, and this is deliberate and load-bearing. The messages
 * icon earns its badge from a real unread count. There is no notification model
 * anywhere in ICEFALL, so a dot here would assert that something is waiting for
 * you that the app cannot know about. Put one there the day notifications
 * exist, and not before.
 */
export function AppTopBar() {
  const { user } = useApp();
  const conversations = useConversations();
  const unread = conversations.reduce((n, c) => n + c.unread, 0);

  return (
    <header
      className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-5 pb-2"
      style={{ paddingTop: "calc(var(--screen-safe-top, env(safe-area-inset-top, 0px)) + 10px)" }}
    >
      <Link
        to="/profile"
        aria-label="Your profile"
        className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
      >
        <Avatar name={user.name} size={38} />
      </Link>

      <div className="relative flex shrink-0 items-center gap-0.5">
        {/* One door to the whole app — every other search box in ICEFALL is
            local to the screen it sits on. */}
        <Link
          to="/search"
          aria-label="Search"
          className="grid h-9 w-9 place-items-center rounded-full text-snow/90 transition-colors hover:bg-white/[0.07] hover:text-snow"
        >
          <Search size={18} strokeWidth={1.6} />
        </Link>

        <Link
          to="/messages"
          aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
          className="relative grid h-9 w-9 place-items-center rounded-full text-snow/90 transition-colors hover:bg-white/[0.07] hover:text-snow"
        >
          <MessageCircle size={18} strokeWidth={1.5} />
          {/* A real count, and only when there is one to show. */}
          {unread > 0 && (
            <span className="tnum absolute right-0.5 top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-azure px-1 text-[9px] font-medium text-[color:var(--ice-obsidian)] ring-2 ring-[color:var(--ice-obsidian)]/60">
              {unread}
            </span>
          )}
        </Link>

        <Link
          to="/notifications"
          aria-label="Notifications"
          className="relative grid h-9 w-9 place-items-center rounded-full text-snow/90 transition-colors hover:bg-white/[0.07] hover:text-snow"
        >
          <Bell size={18} strokeWidth={1.5} />
        </Link>
      </div>
    </header>
  );
}
