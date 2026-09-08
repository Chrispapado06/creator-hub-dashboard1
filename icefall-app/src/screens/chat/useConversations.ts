import { useMemo } from "react";
import { useApp } from "@/state/AppState";
import { DEMO_CONVERSATIONS, type Conversation } from "./data";
import { DEMO } from "@/offline/offline";
import { OFFLINE_CONVERSATIONS } from "@/offline/fixtures";
import {
  ATTACHMENT_PREVIEW,
  PARTICIPANT_NAME_UNAVAILABLE,
  useServerConversations,
  type MessagingState,
  type ServerConversation,
} from "@/messaging";

/**
 * Every conversation the athlete has, from one place.
 *
 * THREE KINDS OF ROW, AND THEY MUST NEVER BE CONFUSED FOR EACH OTHER:
 *
 *   SERVER   Threads on ICEFALL's server, read through `messaging/`. Real
 *            people, real messages, a real unread count derived from
 *            `thread_participants.last_read_at`. These are the only ones a
 *            production build can have, and they always sort first.
 *
 *   DEVICE   Operator enquiries the athlete typed into this phone
 *            (`AppState.threads`). They predate the backend and STILL WORK
 *            EXACTLY AS THEY DID: nothing delivers them, so their own messages
 *            are marked "unsent" and their unread is a measured zero — nothing
 *            can arrive at a thread with no server behind it.
 *
 *   INVENTED `DEMO_CONVERSATIONS` (gated on `import.meta.env.DEV`) and
 *            `OFFLINE_CONVERSATIONS` (the offline build's own fixtures).
 *            Nobody in them exists and nothing in them was sent.
 *
 * ── THE RULE THAT WAS HERE BEFORE AND IS STRICTER NOW ────────────────────────
 *
 * Real threads never mix with invented ones. That used to mean "real first,
 * demo after". With a server in the picture it means more: WHEN THERE IS A
 * SIGNED-IN SESSION AND A SERVER, THE INVENTED ROWS DO NOT APPEAR AT ALL. A
 * demo guide sitting under a real conversation with a real climber is two
 * different kinds of truth in one list, and the reader has no way to tell which
 * is which — the fixtures exist to show a DESIGN on a build that has no data,
 * and the moment there is data they have no job. `DEMO`/`import.meta.env.DEV`
 * still gate them exactly as before; this is a second gate, not a replacement.
 *
 * Device enquiries are not invented and are always shown.
 */
export function useConversations(): Conversation[] {
  const { threads } = useApp();
  const server = useServerConversations();

  return useMemo(() => {
    const real: Conversation[] = server.conversations.map(fromServer);

    const device: Conversation[] = threads.map((t) => ({
      id: t.id,
      name: t.operatorName,
      kind: "company",
      // No verifiedOn: these are the sample operator listings, which ICEFALL has
      // checked nothing about. The tick must not appear on them.
      credential: t.peakName,
      peak: t.peakName,
      // A MEASURED ZERO, not a placeholder. There is no server behind this
      // thread, so nothing can have arrived at it unread.
      unread: 0,
      unreadExact: true,
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

    /*
     * The offline build carries its own invented threads, because
     * `DEMO_CONVERSATIONS` is gated on `import.meta.env.DEV` and is therefore
     * empty in any built bundle — including an offline one, which would leave
     * Messages showing nothing at all.
     */
    const invented = DEMO ? OFFLINE_CONVERSATIONS : DEMO_CONVERSATIONS;
    /*
     * A FAILED READ MUST NOT SWITCH THE FIXTURES BACK ON, and the gate has to
     * name the states that mean it rather than the ones that do not.
     *
     * This was `state !== "ready"`, which is every failure — so on a DEV or
     * DEMO build a dropped signal emptied the real list and repopulated it with
     * invented people, which is the opposite of what the sentence above it
     * promised. The two states below are the ones that mean THERE WAS NEVER A
     * SERVER TO ANSWER: no client in this build, or nobody signed in. Those are
     * exactly the conditions the fixtures exist to fill. "unreachable" and
     * "refused" are a server that did not answer THIS TIME, and the honest
     * answer there is the sentence the screen already prints.
     */
    const showInvented = server.state === "no-backend" || server.state === "signed-out";

    return [...real, ...device.sort(byRecency), ...(showInvented ? invented : [])];
  }, [threads, server.conversations, server.state]);
}

export function useConversation(id: string | undefined): Conversation | undefined {
  const all = useConversations();
  return useMemo(() => all.find((c) => c.id === id), [all, id]);
}

/**
 * Why the list is what it is, for a screen that has to say so.
 *
 * The conversations themselves are `useConversations`; this is the sentence
 * that goes under them when the server had something to report. Kept separate
 * so the list stays a plain array and no screen has to unpack a result object
 * to render a row.
 */
export function useConversationsState(): {
  state: MessagingState;
  message: string | null;
  reload(): void;
} {
  const { state, message, reload } = useServerConversations();
  return { state, message, reload };
}

/* -------------------------------------------------------------------------- */
/* Server → the shape this screen already draws                                */
/* -------------------------------------------------------------------------- */

/**
 * One server thread as a `Conversation`.
 *
 * WHAT IS DELIBERATELY NOT SET, because the server does not know it: `booking`,
 * `introduction`, `verifiedOn`, `credential`, `logo`, `photo`, `pinned`. Every
 * one of those is a fixture field, and a real conversation carrying an invented
 * booking reference would be the worst kind of lie this list could tell.
 *
 * Only the LAST message is carried. The list draws one preview line; the thread
 * screen reads the whole conversation for itself.
 */
function fromServer(c: ServerConversation): Conversation {
  const last = c.lastMessage;
  return {
    id: c.threadId,
    serverThreadId: c.threadId,
    name: nameFor(c),
    kind: c.kind === "group" ? "group" : c.kind === "enquiry" ? "company" : "athlete",
    peak: c.peakName ?? undefined,
    members: c.kind === "group" ? c.participantCount : undefined,
    unread: c.unread,
    unreadExact: c.unreadExact,
    messages: last
      ? [
          {
            id: last.id,
            from: last.mine ? "me" : "them",
            body: last.body ?? ATTACHMENT_PREVIEW,
            at: last.at,
            kind: last.kind === "system" ? "system" : "text",
            // NO SEND STATE. It is stored on ICEFALL's server — that is all
            // this app knows, and `undefined` draws the plain tick that means
            // exactly that. There is no delivery receipt and no "seen by them".
          },
        ]
      : [],
  };
}

/** A group's own title, a person's name, or an honest gap. */
function nameFor(c: ServerConversation): string {
  if (c.kind === "group") return c.title ?? c.peakName ?? "Group";
  return c.other?.displayName ?? PARTICIPANT_NAME_UNAVAILABLE;
}
