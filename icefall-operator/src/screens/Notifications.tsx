/**
 * Notifications, built to the mockup.
 *
 * Spec §12's list, with two types that carry the product's most important rule:
 * `placement_expiring` and `placement_expired`. When a placement runs out the
 * system creates a REMINDER and does not reorder the mountain — so these two
 * notices are the whole of the automated response, by design, and the copy says
 * so rather than leaving an operator to fear they have been dropped.
 */

import {
  BadgeCheck, Bell, CalendarClock, CircleAlert, MessageSquare, Receipt, UserPlus, XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { timeAgo, NOW } from "@/domain/dates";
import type { NotificationType } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

const ICON: Record<NotificationType, typeof Bell> = {
  enquiry_new: MessageSquare,
  message_new: MessageSquare,
  lead_assigned: UserPlus,
  lead_status_changed: BadgeCheck,
  booking_recorded: Receipt,
  content_submitted: CircleAlert,
  content_approved: BadgeCheck,
  content_rejected: XCircle,
  content_changes_requested: CircleAlert,
  info_missing: CircleAlert,
  admin_message: Bell,
  placement_expiring: CalendarClock,
  placement_expired: CalendarClock,
};

const TONE: Partial<Record<NotificationType, string>> = {
  content_submitted: "text-pending",
  content_rejected: "text-rejected",
  content_changes_requested: "text-pending",
  content_approved: "text-live",
  placement_expiring: "text-pending",
  placement_expired: "text-expired",
};

export default function Notifications() {
  const session = useSession();
  const { backend, revision, refresh } = useOperator();
  const notifications = useAsync(() => backend.getNotifications(session), [session, revision], []);
  const [tab, setTab] = useState<"all" | "unread">("all");

  const unread = notifications.filter((n) => n.readAt === null);
  const shown = tab === "unread" ? unread : notifications;

  const markAll = async () => {
    for (const n of unread) await backend.markNotificationRead(session, n.id);
    refresh();
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        detail="Stay up to date with important activity."
        action={
          unread.length > 0 ? (
            <Button onClick={() => void markAll()}>Mark all as read</Button>
          ) : undefined
        }
      />

      <div className="mb-3">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "all" as const, label: "All", count: notifications.length },
            { key: "unread" as const, label: "Unread", count: unread.length },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState title="Nothing here" detail="You are up to date." />
      ) : (
        <Card>
          {shown.map((n, i) => {
            const Icon = ICON[n.type] ?? Bell;
            const body = (
              <>
                <span className={`mt-0.5 shrink-0 ${TONE[n.type] ?? "text-muted"}`}>
                  <Icon size={16} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ink">{n.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted">{n.body}</span>
                </span>
                <span className="shrink-0 text-[11.5px] text-faint">{timeAgo(n.createdAt, NOW)}</span>
                {n.readAt === null && (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill bg-azure" aria-hidden />
                )}
              </>
            );
            const cls = `flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-raised ${
              i > 0 ? "border-t border-line-soft" : ""
            }`;
            return n.href ? (
              <Link
                key={n.id}
                to={n.href}
                className={cls}
                onClick={() => {
                  void backend.markNotificationRead(session, n.id);
                }}
              >
                {body}
              </Link>
            ) : n.readAt === null ? (
              // No destination, but clicking still marks it read — the unread
              // dot should never be one an operator cannot clear row by row.
              <button
                key={n.id}
                className={`${cls} w-full text-left`}
                onClick={async () => {
                  await backend.markNotificationRead(session, n.id);
                  refresh();
                }}
              >
                {body}
              </button>
            ) : (
              <div key={n.id} className={cls}>
                {body}
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}
