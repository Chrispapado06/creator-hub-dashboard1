import { Link, useLocation } from "react-router-dom";
import { Bell, MessageCircle, Search } from "lucide-react";

import { Avatar } from "@/components/ui/primitives";
import { useSocialNotices } from "@/notifications/social";
import { useConversations } from "@/screens/chat/useConversations";
import { useSettings } from "@/settings/store";
import { useApp } from "@/state/AppState";

/**
 * What a 15px circle can hold. Ten and above becomes "9+" — the count itself is
 * never touched, only this string, and every caller passes the real number to
 * `aria-label` separately.
 */
function badgeText(n: number): string {
  return n > 9 ? "9+" : String(n);
}

/** One badge, so the two cannot drift in size, colour or ring. */
const BADGE =
  "tnum absolute right-0.5 top-1 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-azure px-1 text-[9px] font-medium text-[color:var(--ice-obsidian)] ring-2 ring-[color:var(--ice-obsidian)]/60";

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
 * THE BELL NOW HAS A BADGE, AND THIS PARAGRAPH USED TO SAY IT NEVER WOULD.
 * The old text — "there is no notification model anywhere in ICEFALL, so a dot
 * here would assert that something is waiting for you that the app cannot know
 * about" — set the condition for changing its mind: put one there the day
 * notifications exist. They exist. `notifications/social.ts` reads follows,
 * likes and comments from three live tables and measures how many of them
 * arrived after this device's last-seen mark. That is a count, from a server,
 * about things other people actually did. So the bell earns a badge on exactly
 * the terms the old comment demanded, and it is NOT a dot: a dot would be the
 * thing that comment was refusing, an assertion with no number behind it.
 *
 * BOTH BADGES ARE NUMBERS, AND BOTH STOP AT "9+". The owner's reviewer,
 * 2026-09-07: "make sure when you receive notification, you can actually see
 * +1 up to 9+". The circle is 15px; three digits burst it and the glyphs
 * collide with the icon behind them. The cap is on the DRAWING ONLY — the
 * aria-label carries the true number, because a screen reader has no width
 * problem and "9+ unread" would be ICEFALL rounding a fact it holds exactly.
 */
export function AppTopBar() {
  const { user } = useApp();
  /* The same stored photo the profile draws (owner, 2026-09-07: "if you add a
     profile then it needs to show the profile on top left as well"). */
  const { settings } = useSettings();
  const conversations = useConversations();
  /* The name beside the photo everywhere EXCEPT Home (owner, 2026-09-07: "if
     you are not on home page, next to profile i want it to display the users
     name"). Home already greets the person by name in its hero a few lines
     below, and saying it twice on one screen is noise. */
  const { pathname } = useLocation();
  const showName = pathname !== "/home";
  const unread = conversations.reduce((n, c) => n + c.unread, 0);

  /*
   * THE BELL'S COUNT, AND WHY IT IS THIS HOOK AND NOT A NEW ONE.
   *
   * `useSocialNotices` already owns every judgement this badge needs, and each
   * of them is one ICEFALL would otherwise get wrong here:
   *
   *   · `unseen` is `number | null`, and `null` means NOT MEASURED — no
   *     last-seen mark stored yet, a browser refusing localStorage, or a capped
   *     window that cannot prove the count is exact. Null draws nothing. It is
   *     never coerced to 0, because a badge is drawn from a count and "ICEFALL
   *     does not know" is not a count.
   *   · The mark it counts against is moved by the Notifications SCREEN, in its
   *     own effect, when the list is genuinely on view. That is what the
   *     high-water mark is for and this bar does not get a second opinion about
   *     when something has been seen. `social.ts` notifies every live instance
   *     when the mark moves, so this badge clears itself the moment the athlete
   *     opens /notifications — no prop, no context, no event of our own.
   *
   * IT IS A SNAPSHOT, NOT A LIVE FEED, and that is deliberate rather than
   * unfinished. The hook reads on mount and never polls — `social.ts` argues
   * the case (a socket held open is a radio kept awake on a phone that may be
   * on a mountain) and `NOTIFICATIONS_NOT_PUSHED` says it to the reader. This
   * bar is mounted outside `AppShell`'s `key={pathname}` wrapper, so it survives
   * every navigation and asks once per cold start rather than once per screen.
   * A follow that lands while the app is open therefore does not bump this
   * number until the next start. Nothing about the badge claims otherwise.
   *
   * (On the shared DEMO links `uid` is null by construction, so `unseen` is
   * null and no bell badge is drawn there. The fixtures could be given a mark
   * to make one appear; they are not, because that would be an invented count.)
   */
  const social = useSocialNotices();
  const unseen = social.unseen;

  return (
    <header
      className="relative z-20 flex shrink-0 items-center justify-between gap-3 px-5 pb-2"
      style={{ paddingTop: "calc(var(--screen-safe-top, env(safe-area-inset-top, 0px)) + 10px)" }}
    >
      <Link
        to="/profile"
        aria-label="Your profile"
        className="flex min-w-0 items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
      >
        <Avatar name={user.name} src={settings.avatar ?? user.avatar} size={38} />
        {showName && (
          <span className="truncate text-[15px] font-medium text-snow">{user.name}</span>
        )}
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
          {/* A real count, and only when there is one to show. Drawn "9+" past
              nine; the `aria-label` above still says twelve when it is twelve. */}
          {unread > 0 && <span className={BADGE}>{badgeText(unread)}</span>}
        </Link>

        <Link
          to="/notifications"
          aria-label={
            unseen !== null && unseen > 0 ? `Notifications, ${unseen} new` : "Notifications"
          }
          className="relative grid h-9 w-9 place-items-center rounded-full text-snow/90 transition-colors hover:bg-white/[0.07] hover:text-snow"
        >
          <Bell size={18} strokeWidth={1.5} />
          {/*
            "NEW", NOT "UNREAD", and the two words are not interchangeable here.
            Unread is a per-item flag, and the Notifications screen says at
            length why ICEFALL does not have one: there is a single device-local
            high-water mark and no `notifications_seen` table anywhere. What
            this number measures is how many arrived after that mark — which is
            "new since you last looked, on this device", the same sentence the
            screen prints in full under its own title. Calling it unread would
            claim a row-level state that does not exist.

            `null` is skipped rather than shown as zero: see the count above.
          */}
          {unseen !== null && unseen > 0 && <span className={BADGE}>{badgeText(unseen)}</span>}
        </Link>
      </div>
    </header>
  );
}
