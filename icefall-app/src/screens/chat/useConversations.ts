import { useMemo } from "react";
import { useApp } from "@/state/AppState";
import { DEMO_CONVERSATIONS, type Conversation } from "./data";

/**
 * Every conversation the athlete has, from one place.
 *
 * Messages replaced the old Enquiries screen, so this is where the two used to
 * diverge and must not again. An operator enquiry the athlete actually wrote is
 * REAL DATA — it lives in `AppState.threads` and predates this screen — while
 * the guide, group and peer conversations are invented and dev-only. Both are
 * mapped into one shape here so the list cannot show a client two inboxes and
 * leave them guessing which holds what.
 *
 * Real threads sort first and are never mixed into the demo set: they are the
 * only ones a production build has.
 */
export function useConversations(): Conversation[] {
  const { threads } = useApp();

  return useMemo(() => {
    const real: Conversation[] = threads.map((t) => ({
      id: t.id,
      name: t.operatorName,
      kind: "company",
      // No verifiedOn: these are the sample operator listings, which ICEFALL has
      // checked nothing about. The tick must not appear on them.
      credential: t.peakName,
      peak: t.peakName,
      unread: 0,
      messages: t.messages.map((m) => ({
        id: m.id,
        from: m.from === "you" ? ("me" as const) : ("them" as const),
        body: m.body,
        at: m.at,
        // Not "queued" — nothing is waiting for signal. There is no server for
        // it to reach, and the difference matters to someone deciding whether
        // to expect a reply.
        state: m.from === "you" ? ("unsent" as const) : undefined,
      })),
    }));

    const byRecency = (a: Conversation, b: Conversation) => {
      const at = (c: Conversation) => c.messages[c.messages.length - 1]?.at ?? "";
      return at(b).localeCompare(at(a));
    };

    return [...real.sort(byRecency), ...DEMO_CONVERSATIONS];
  }, [threads]);
}

export function useConversation(id: string | undefined): Conversation | undefined {
  const all = useConversations();
  return useMemo(() => all.find((c) => c.id === id), [all, id]);
}
