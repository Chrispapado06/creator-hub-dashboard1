import { useMemo } from "react";
import { usePrimaryGoal } from "@/state/AppState";
import { useConversations } from "@/screens/chat/useConversations";
import { lastMessage } from "@/screens/chat/data";
import { sync } from "@/services/repository";

/**
 * ICEFALL's notifications — computed, not delivered.
 *
 * THE HONEST SHAPE OF THIS FEATURE. A notification normally means a server
 * decided something mattered and pushed it to a device. ICEFALL has a server
 * now, but no push of any kind — so nothing here was sent to anybody: every
 * item is FOUND when the screen is opened, not delivered. The ones in this file
 * are derived on open from state already on this phone — the plan, the
 * objective, the message queue, the unread counts.
 *
 * That distinction is not pedantry. A climber who believes this screen will
 * wake their phone might rely on it for a weather change or a departure time,
 * and it cannot do that. The screen says so, once, at the top, and the copy is
 * not softened into "you're all caught up".
 *
 * What this rules out, deliberately: no "someone viewed your profile", no
 * streaks, no re-engagement nudges. Every item below is something the athlete
 * would want to act on today, or it does not exist.
 */

export type NoticeKind = "queued" | "unread" | "session" | "objective";

export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  /** Where tapping it goes. */
  to: string;
  /** Sorts the list — lower is more urgent. */
  weight: number;
}

/** Whole days from today until an ISO date, or null if it has passed. */
function daysUntil(iso: string): number | null {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const ms = then.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return ms < 0 ? null : Math.round(ms / 86_400_000);
}

export function useNotifications(): Notice[] {
  const conversations = useConversations();
  const goal = usePrimaryGoal();

  return useMemo(() => {
    const out: Notice[] = [];

    /* 1. Messages written with no signal. The only genuinely urgent item here:
          the athlete believes these were sent, and they were not. */
    const queued = conversations.flatMap((c) => c.messages).filter((m) => m.state === "queued");
    if (queued.length > 0) {
      out.push({
        id: "queued",
        kind: "queued",
        title: `${queued.length} message${queued.length === 1 ? "" : "s"} waiting to send`,
        body: "Written with no signal and held on this device. They go out when you reconnect — nobody has seen them yet.",
        to: "/messages",
        weight: 0,
      });
    }

    /* 2. Unread, per conversation, so it is obvious who is waiting. */
    for (const c of conversations) {
      if (c.unread <= 0) continue;
      const last = lastMessage(c);
      out.push({
        id: `unread-${c.id}`,
        kind: "unread",
        title: `${c.unread} new from ${c.name}`,
        body: last?.body ?? "",
        to: `/messages/${c.id}`,
        weight: 1,
      });
    }

    /* 3. Today's session, only while it is still outstanding. */
    const session = sync.todaysSession();
    if (session !== undefined && !session.completed) {
      const bits = [
        session.distanceKm !== undefined ? `${session.distanceKm} km` : null,
        session.elevationM !== undefined ? `${session.elevationM} m` : null,
        session.durationMin !== undefined ? `${session.durationMin} min` : null,
      ].filter(Boolean);
      out.push({
        id: "session",
        kind: "session",
        title: `Today: ${session.title}`,
        body: bits.length > 0 ? bits.join(" · ") : (session.detail ?? "Planned for today."),
        to: "/coach/today",
        weight: 2,
      });
    }

    /* 4. The objective, at the points where the answer changes what you do
          this month. Not a daily countdown — that is a streak, not a notice. */
    if (goal?.targetDate !== undefined) {
      const days = daysUntil(goal.targetDate);
      if (days !== null && [30, 60, 90, 180].includes(days)) {
        out.push({
          id: "objective",
          kind: "objective",
          title: `${days} days to ${goal.name}`,
          body: "Worth checking your plan still reaches it, and that permits and dates are booked.",
          to: "/goals",
          weight: 3,
        });
      }
    }

    return out.sort((a, b) => a.weight - b.weight);
  }, [conversations, goal]);
}

/*
 * The same stale claim was in this sentence too, and this is the half a person
 * actually reads. "ICEFALL has no server" stopped being true when the migrations
 * went live; "cannot wake your phone" is still exactly true, and it is the part
 * that matters to somebody on a mountain.
 */
export const NOTIFICATIONS_NOT_PUSHED =
  "Nothing here was pushed. ICEFALL has no push notifications, so everything on this screen is found when you open it — worked out from what is on this device, or read back from the server at that moment. It is a summary, not an alert: it cannot wake your phone and it will not reach you on the mountain.";
