import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight, CloudOff, Flag, MessageSquare } from "lucide-react";
import { Card, Disclaimer } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { NOTIFICATIONS_NOT_PUSHED, useNotifications, type NoticeKind } from "@/notifications/feed";
import { cn } from "@/lib/utils";

/**
 * Notifications.
 *
 * Everything here is worked out on open from state on this device — see
 * `notifications/feed.ts` for why that distinction is stated rather than
 * glossed. The queued-message warning used to be a banner across the top of
 * Chat; it lives here now, and the affected conversation still carries its own
 * inline marker, so removing the banner lost no information.
 */

const ICON: Record<NoticeKind, typeof MessageSquare> = {
  queued: CloudOff,
  unread: MessageSquare,
  session: CalendarClock,
  objective: Flag,
};

/** Queued messages are the one item here the athlete may be wrong about. */
const TONE: Record<NoticeKind, string> = {
  queued: "border-alert/35 text-alert",
  unread: "border-hairline-strong text-azure",
  session: "border-hairline-strong text-azure",
  objective: "border-hairline-strong text-azure",
};

export default function Notifications() {
  const notices = useNotifications();

  return (
    <Screen>
      <Stagger>
        <ScreenHeader title="Notifications" back />

        {notices.length === 0 ? (
          <Rise>
            <Card>
              <p className="text-[13px] leading-relaxed text-mist">
                Nothing needs you right now — no unread messages, nothing waiting to send, and
                today's session is either done or not scheduled.
              </p>
            </Card>
          </Rise>
        ) : (
          <div className="space-y-2.5">
            {notices.map((n) => {
              const Icon = ICON[n.kind];
              return (
                <Rise key={n.id}>
                  <Link
                    to={n.to}
                    className="flex items-start gap-3.5 rounded-card border border-hairline bg-graphite p-4 transition-colors hover:border-hairline-strong"
                  >
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-full border",
                        TONE[n.kind],
                      )}
                    >
                      <Icon size={15} strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] leading-snug text-snow">{n.title}</span>
                      <span className="clamp-2 mt-1 block text-[12px] leading-relaxed text-mist">
                        {n.body}
                      </span>
                    </span>
                    <ChevronRight
                      size={15}
                      strokeWidth={1.8}
                      className="mt-0.5 shrink-0 text-mist-dim"
                    />
                  </Link>
                </Rise>
              );
            })}
          </div>
        )}

        <Rise className="pt-6">
          <Disclaimer>{NOTIFICATIONS_NOT_PUSHED}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}
