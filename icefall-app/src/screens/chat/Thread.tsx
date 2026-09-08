import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  CalendarCheck,
  ChevronLeft,
  CloudOff,
  Compass,
  Check,
  Flag,
  Lock,
  Paperclip,
  RefreshCw,
  Send,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Avatar, Button, Card, Disclaimer } from "@/components/ui/primitives";
import { CompanyMark } from "@/components/domain/CompanyMark";
import { TABBAR_STICKY_BOTTOM } from "@/components/layout/chrome";
import {
  LOCKED_EXPLAINER,
  LOCKED_EXPLAINER_COMPANY,
  OFF_PLATFORM_WARNING,
  fmtDay,
  fmtTime,
  isLocked,
  type ChatMessage,
  type Conversation,
} from "./data";
import { ReportSheet } from "@/components/social/ReportSheet";
import { useConversation } from "./useConversations";
import {
  ATTACHMENT_PREVIEW,
  MESSAGE_MAX_LENGTH,
  MESSAGING_IS_A_SNAPSHOT,
  PARTICIPANT_NAME_UNAVAILABLE,
  markThreadRead,
  newClientId,
  sendMessage,
  sendToProfile,
  useCorrespondent,
  useDirectConversation,
  useServerConversation,
  useServerConversations,
  useThreadMessages,
  type ServerMessage,
} from "@/messaging";
import { BACKEND_NOT_CONNECTED } from "@/backend/client";
import { cn } from "@/lib/utils";

/**
 * One conversation.
 *
 * ── THIS SCREEN NOW SERVES TWO KINDS OF THREAD, AND KEEPS THEM APART ─────────
 *
 * REAL ones live on ICEFALL's server and are read and written through
 * `messaging/`: `/messages/:id` where the id is a server thread, and
 * `/messages/with/:profileId`, which is where a Message control on somebody's
 * profile points. The second is the important one — it resolves to the
 * existing conversation with that person if there is one and to an EMPTY one
 * if there is not, and NOTHING IS CREATED UNTIL SOMETHING IS SAID. Tapping
 * Message and thinking better of it leaves no empty conversation in a
 * stranger's inbox.
 *
 * ON-DEVICE ones — the operator enquiries in `AppState.threads` and the
 * dev-only fixtures — behave exactly as they always have: no composer, and
 * every outgoing line marked "Not sent — no server yet". Nothing about them
 * changed, and the branch that draws them is the branch that draws that
 * sentence.
 *
 * ── THREE THINGS THIS SCREEN DOES THAT A GENERIC CHAT WOULD NOT ──────────────
 *
 *   A MESSAGE THE SERVER REFUSED IS NOT SHOWN AS SENT. There is no optimistic
 *   bubble here. `messages_insert` can refuse a write — a block in either
 *   direction, or decision 19 — and it answers with a bare 42501 that names
 *   neither. So the words stay in the box, the failure is stated under the
 *   composer, and nothing is drawn in the transcript. An optimistic bubble is
 *   precisely how a blocked person ends up believing they are talking to
 *   somebody.
 *
 *   A message that has not left the device says so. No tick, no "sent" — an
 *   amber cloud and the words "waiting for signal". Someone writing from a hut
 *   needs to know their guide has not seen it.
 *
 *   A guide steering the client off-platform is flagged in place, with a way to
 *   report it, rather than in a help article nobody opens.
 *
 * ── DELIBERATELY ABSENT ──────────────────────────────────────────────────────
 *
 * No typing indicator, no delivery receipt, no "seen by them" and no presence
 * dot. The schema records a per-person `last_read_at` and nothing else, and the
 * `State` component at the foot of this file says why a double tick would be a
 * claim ICEFALL cannot make.
 *
 * No live feed either. `messaging/` reads on open rather than holding a socket
 * — a radio kept awake on a phone that may be on a mountain — so a reply that
 * lands while this screen is open arrives on the next read. There is a reload
 * control in the header saying exactly that, rather than a silence the reader
 * has to interpret.
 */

/** Matches a message pushing payment off ICEFALL. Deliberately narrow. */
const OFF_PLATFORM =
  /\b(bank transfer|pay me directly|cash|paypal|revolut|outside the app|off the platform|knock the .*fee)\b/i;

export default function Thread() {
  const { id, profileId } = useParams<{ id?: string; profileId?: string }>();
  const navigate = useNavigate();

  /* The device / fixture / server row this route names, if any. On the
     `/messages/with/:profileId` route there is none until the first message. */
  const fixture = useConversation(id);
  const list = useServerConversations();
  const direct = useDirectConversation(profileId);
  const correspondent = useCorrespondent(profileId);

  /**
   * Which server thread this screen is showing, or null.
   *
   * Null on the `with/:profileId` route until the pair has a conversation, and
   * null forever for a device or fixture row. Everything server-shaped below
   * turns on it.
   */
  const serverThreadId = profileId
    ? (direct.conversation?.threadId ?? null)
    : (fixture?.serverThreadId ?? null);
  const isServer = profileId !== undefined || serverThreadId !== null;

  /* The server's own row for this thread, which is where the OTHER PERSON'S
     ACCOUNT ID comes from — `useConversation` above maps to the shape this
     screen has always drawn and that shape carries a name, not an id. */
  const serverConvo = useServerConversation(serverThreadId);

  const live = useThreadMessages(serverThreadId);

  const [draft, setDraft] = useState("");
  /** The thread being reported, or null. See `ReportSheet` at the foot of this file's render. */
  const [reporting, setReporting] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  /**
   * ONE CLIENT ID PER SET OF WORDS, kept across every retry OF THOSE WORDS.
   *
   * This is the whole of the offline-safety contract 20260818090000 describes:
   * a retry carrying the same `client_id` conflicts on
   * `messages_sender_client_id_key` and comes back as the message that already
   * arrived, instead of a second copy. Minting a fresh one on each attempt
   * would produce exactly the duplication the index exists to prevent.
   *
   * IT IS KEYED ON THE TEXT, NOT ON THE SCREEN, and that is the correction. A
   * key held for the whole route meant that editing a draft that had failed and
   * pressing send again reused it — and `send_message` looks the key up and
   * NEVER COMPARES THE BODY, so when the first attempt had actually committed
   * and only its answer was lost (the hut connection this is all written for),
   * the server returned the ORIGINAL row: the box emptied of words that were
   * never sent and a bubble appeared carrying different ones. So the pair is
   * held together, and a draft that no longer matches the words the key was
   * minted for gets a new key.
   */
  const [attempt, setAttempt] = useState<{ clientId: string; text: string } | null>(null);
  /**
   * Messages this screen sent and the server confirmed, held until the shared
   * list catches up.
   *
   * NOT OPTIMISTIC. Every row in here is one the server returned, with its own
   * id and timestamp — they are shown because they are stored, not in the hope
   * that they will be. They are merged by id, so the next read replaces rather
   * than duplicates them.
   */
  const [justSent, setJustSent] = useState<ServerMessage[]>([]);

  /* A new conversation means a new draft, a new idempotency key and no stale
     failure from the last one. */
  useEffect(() => {
    setDraft("");
    setSendError(null);
    setJustSent([]);
    setAttempt(null);
  }, [id, profileId]);

  /**
   * OPENING A CONVERSATION IS READING IT — UP TO THE LAST LINE ACTUALLY DRAWN.
   *
   * The mark is what makes the badge on the messages icon fall, and it is
   * stamped at the newest message this screen holds rather than at the clock.
   * The difference is a message that lands between the transcript query and
   * this call: `now()` would mark it read though it was never drawn, and the
   * mark only moves forward, so nothing could ever count it again. The
   * timestamp claims what can be witnessed — everything up to this row has been
   * seen — and leaves anything later correctly unread.
   */
  const newestShownAt = live.messages[live.messages.length - 1]?.at ?? null;
  useEffect(() => {
    if (!serverThreadId) return;
    void markThreadRead(serverThreadId, newestShownAt);
  }, [serverThreadId, newestShownAt]);

  const serverMessages = useMemo(() => {
    const seen = new Set(live.messages.map((m) => m.id));
    const merged = [...live.messages, ...justSent.filter((m) => !seen.has(m.id))];
    return merged.map(toChatMessage);
  }, [live.messages, justSent]);

  /* Memoised rather than computed inline: the grouping below depends on it, and
     a fresh array every render would regroup the whole conversation on every
     keystroke in the composer. */
  const fixtureMessages = fixture?.messages;
  const shown = useMemo(
    () => (isServer ? serverMessages : (fixtureMessages ?? [])),
    [isServer, serverMessages, fixtureMessages],
  );

  const grouped = useMemo(() => {
    const out: { day: string; items: ChatMessage[] }[] = [];
    for (const m of shown) {
      const day = fmtDay(m.at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [shown]);

  const send = useCallback(async () => {
    if (sending) return;
    const text = draft.trim();
    if (text.length === 0) return;

    setSending(true);
    setSendError(null);
    /* The same key only while the words are the same. See `attempt` above. */
    const key = attempt && attempt.text === text ? attempt.clientId : newClientId();
    setAttempt({ clientId: key, text });
    const outcome = serverThreadId
      ? await sendMessage(serverThreadId, text, key)
      : profileId
        ? await sendToProfile(profileId, text, key)
        : null;
    setSending(false);
    if (!outcome) return;

    if (!outcome.ok) {
      /* THE DRAFT IS KEPT. The words were not delivered, and clearing the box
         would be the screen agreeing that they had been. */
      setSendError(outcome.message);
      return;
    }

    setDraft("");
    setSendError(null);
    setJustSent((prev) => [...prev, outcome.message]);
    // The key just used is spent — its row exists, and holding it would make
    // the next message a "retry" of this one.
    setAttempt(null);
    live.reload();
  }, [sending, draft, serverThreadId, profileId, attempt, live]);

  /*
   * A ROUTE THAT NAMES NOTHING. Only after the list has actually answered — a
   * server thread is unknown while the first read is in flight, and bouncing to
   * /messages on a cold start would throw the athlete out of a conversation
   * they had just opened from a link.
   */
  if (!fixture && !profileId) {
    if (list.state === "loading") return <Opening />;
    return <Navigate to="/messages" replace />;
  }

  const name = profileId
    ? (direct.conversation?.other?.displayName ??
      correspondent?.displayName ??
      PARTICIPANT_NAME_UNAVAILABLE)
    : (fixture?.name ?? PARTICIPANT_NAME_UNAVAILABLE);

  const kind: Conversation["kind"] = profileId ? "athlete" : (fixture?.kind ?? "athlete");

  /*
   * WHOSE PROFILE THIS IS WITH, when it is with exactly one person.
   *
   * Null for a group — several people behind one title, and no single profile
   * to open — and for a device fixture, which names no account at all. The
   * route parameter is preferred because on `/messages/with/:profileId` it IS
   * the account id; otherwise it comes off the server row's roster.
   */
  const personRoute =
    kind === "athlete" && (profileId ?? serverConvo.conversation?.other?.id)
      ? `/social/people/${profileId ?? serverConvo.conversation?.other?.id}`
      : null;
  const locked = fixture ? isLocked(fixture) : false;
  const subtitle = profileId
    ? correspondent?.username
      ? `@${correspondent.username}`
      : ""
    : kind === "group"
      ? `${fixture?.members ?? 0} people · ${fixture?.peak ?? ""}`
      : (fixture?.credential ?? (fixture?.peak ? `Climbing ${fixture.peak}` : ""));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ---- Header -------------------------------------------------------- */}
      <header
        className="flex shrink-0 items-center gap-3 border-b border-hairline bg-obsidian/90 px-3 py-3 backdrop-blur"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top, 0px))" }}
      >
        <button
          onClick={() => navigate("/messages")}
          aria-label="Back"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <ChevronLeft size={20} strokeWidth={1.6} />
        </button>

        {/* A COMPANY IS NOT A PERSON. This branch tested only for "group", so an
            expedition company fell through to `Avatar` — the round, person
            avatar, identical to the climber in the row above.

            THE PERSON IS REACHABLE FROM THEIR OWN MESSAGE, when ICEFALL knows
            which account this conversation is with. A stranger's message used
            to be a dead end — back, avatar, name, reload — so the one place a
            block or a report lives, their profile, could not be got to from the
            message that made somebody want it. */}
        <HeaderIdentity to={personRoute}>
          {kind === "group" ? (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline-strong bg-slate text-mist">
              <Users size={16} strokeWidth={1.6} />
            </span>
          ) : kind === "company" ? (
            <CompanyMark name={name} logoPath={fixture?.logo} size={36} />
          ) : (
            <Avatar name={name} src={correspondent?.avatarUrl ?? undefined} size={36} />
          )}

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="block truncate text-[14px] text-snow">{name}</span>
              {/* NO VERIFICATION TICK, AND NO DATE.
                  This rendered "Documents checked by ICEFALL on 5 Jun 2026. We
                  have not contacted the issuing association." Careful second
                  half, invented first half: nobody has read anybody's
                  documents, on that date or any other. `verifiedOn` stays in
                  the fixture type for the day a real check produces a real
                  date, and until then nothing draws it. */}
            </span>
            {subtitle !== "" && (
              <span className="block truncate text-[11px] text-mist-dim">{subtitle}</span>
            )}
          </span>
        </HeaderIdentity>

        {/* THE RELOAD IS THE HONEST ALTERNATIVE TO A LIVE SOCKET. Only on a
            server thread, because there is nothing to fetch for the others. */}
        {isServer && (
          <button
            type="button"
            onClick={() => live.reload()}
            aria-label="Check for new messages"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
          >
            <RefreshCw size={16} strokeWidth={1.7} />
          </button>
        )}
      </header>

      {locked ? (
        <LockedBody
          convo={fixture as Conversation}
          onAction={() => navigate(kind === "company" ? "/explore/expeditions" : "/book")}
        />
      ) : (
        <>
          {/* ---- Messages ------------------------------------------------------ */}
          <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            <div className="space-y-5 pt-5">
              {isServer && live.state === "loading" && shown.length === 0 && (
                <p className="pt-6 text-center text-[12.5px] text-mist-dim">Reading…</p>
              )}

              {/* WHY THIS CONVERSATION IS EMPTY, IN ITS OWN WORDS. A blank
                  transcript with a composer under it is the one place a reader
                  cannot tell "nothing has been said" from "nothing loaded".

                  "NOTHING HAS BEEN SAID YET" IS A CLAIM AND IS DRAWN ONLY ON
                  `ready`. It used to be the fallback for a missing message,
                  which meant an unreachable server — where `serverThreadId` is
                  null and nothing was read at all — told an athlete with fifty
                  messages from that person that nobody had ever written. Every
                  other state carries the reason instead, and a state with
                  neither draws nothing rather than guessing. */}
              {isServer &&
                live.state !== "loading" &&
                shown.length === 0 &&
                (live.state === "ready" || live.message !== null) && (
                  <p className="mx-auto max-w-[24rem] pt-6 text-center text-[12.5px] leading-relaxed text-mist">
                    {live.state === "ready"
                      ? `Nothing has been said yet. Whatever you write is the first thing ${firstNameOf(name)} sees from you.`
                      : live.message}
                  </p>
                )}

              {grouped.map((g) => (
                <div key={g.day}>
                  <p className="mb-4 text-center text-[10.5px] uppercase tracking-[0.14em] text-mist-dim">
                    {g.day}
                  </p>

                  <div className="space-y-2.5">
                    {g.items.map((m) => {
                      if (m.kind === "system") {
                        return (
                          <p key={m.id} className="text-center text-[11.5px] text-mist-dim">
                            {m.body}
                          </p>
                        );
                      }

                      const mine = m.from === "me";
                      const flagged = !mine && OFF_PLATFORM.test(m.body);

                      return (
                        <div key={m.id}>
                          <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[84%] rounded-card px-3.5 py-2.5",
                                mine
                                  ? "rounded-br-sm bg-azure/[0.14] ring-1 ring-azure/25"
                                  : "rounded-bl-sm border border-hairline bg-graphite",
                              )}
                            >
                              {m.author && (
                                <p className="mb-1 text-[11px] text-azure/80">{m.author}</p>
                              )}
                              <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-snow">
                                {m.body}
                              </p>
                              <p className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] text-mist-dim">
                                <span className="tnum">{fmtTime(m.at)}</span>
                                {mine && <State state={m.state} />}
                              </p>
                            </div>
                          </div>

                          {flagged && (
                            <Card className="mt-2.5 border-alert/35">
                              <div className="flex items-start gap-2.5">
                                <ShieldAlert
                                  size={15}
                                  strokeWidth={1.8}
                                  className="mt-px shrink-0 text-alert"
                                />
                                <div className="min-w-0">
                                  <p className="text-[12.5px] text-snow">
                                    This message suggests paying outside ICEFALL
                                  </p>
                                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist">
                                    {OFF_PLATFORM_WARNING}
                                  </p>
                                  {/* THIS BUTTON NOW FILES A REPORT. It used to
                                      set a local flag and print "reporting is
                                      not connected yet", which was false in
                                      both halves: `reports.thread_id` is a live
                                      column and `social/safety.ts` writes it,
                                      so the one message this control exists for
                                      — a stranger asking to be paid directly —
                                      was the one ICEFALL kept nothing about.
                                      The sheet says where the report went; this
                                      screen does not guess. */}
                                  {serverThreadId ? (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      className="mt-3"
                                      onClick={() => setReporting(serverThreadId)}
                                    >
                                      <Flag size={13} strokeWidth={1.8} />
                                      Report this
                                    </Button>
                                  ) : (
                                    /* A sample conversation names nothing on
                                       ICEFALL's server, so there is genuinely
                                       nothing for moderation to look at. */
                                    <p className="mt-3 text-[11.5px] leading-relaxed text-mist-dim">
                                      This conversation is not on ICEFALL's server, so there is
                                      nothing here for moderation to look at and nothing to report.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </Card>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Two different promises, and the branch that draws each is the
                  branch that knows which is true. A server thread DELIVERS —
                  what it does not do is push. A device thread delivers nothing
                  at all, and still says so. */}
              <Disclaimer className="pt-3">
                {isServer ? MESSAGING_IS_A_SNAPSHOT : BACKEND_NOT_CONNECTED}
              </Disclaimer>
            </div>
          </div>

          {/* ---- Composer ------------------------------------------------------- */}
          <div
            className="shrink-0 border-t border-hairline bg-obsidian/90 px-3 py-2.5 backdrop-blur"
            /* The tab bar floats over the bottom of this column; the composer
               clears it itself — pill, inset and all. */
            style={{ paddingBottom: `calc(${TABBAR_STICKY_BOTTOM} + 10px)` }}
          >
            {/* THE REFUSAL SITS WITH THE WORDS IT REFUSED, above the box the
                words are still in. It is not a toast: a message ICEFALL would
                not carry is not something to be dismissed after four seconds. */}
            {sendError !== null && (
              <p className="mb-2 px-1 text-[11.5px] leading-relaxed text-alert">{sendError}</p>
            )}

            <div className="flex items-end gap-2">
              <button
                disabled
                aria-label="Attach"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-mist-dim disabled:opacity-45"
              >
                <Paperclip size={18} strokeWidth={1.6} />
              </button>

              <textarea
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter breaks the line. On a touch
                  // keyboard the Send button is the one that gets used.
                  if (e.key === "Enter" && !e.shiftKey && isServer) {
                    e.preventDefault();
                    void send();
                  }
                }}
                maxLength={MESSAGE_MAX_LENGTH}
                disabled={!isServer}
                placeholder="Message"
                className="no-scrollbar max-h-28 min-h-[40px] flex-1 resize-none rounded-card border border-hairline bg-graphite px-3.5 py-2.5 text-[13.5px] text-snow outline-none placeholder:text-mist-dim focus:border-azure disabled:opacity-60"
              />

              {/* A control that cannot deliver is DISABLED and says why below,
                  rather than looking live and failing silently. */}
              <button
                type="button"
                onClick={() => void send()}
                disabled={!isServer || sending || draft.trim().length === 0}
                aria-label="Send"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-azure text-obsidian transition-opacity disabled:opacity-45"
              >
                <Send size={16} strokeWidth={1.9} />
              </button>
            </div>

            {!isServer && (
              <p className="mt-1.5 text-center text-[10.5px] text-mist-dim">
                Sending is not connected — nothing leaves this device.
              </p>
            )}
          </div>
        </>
      )}

      {/* Mounted for the life of the screen and opened by `reporting`, which is
          the thread id — a report about a conversation, which is the one thing
          `public.reports` can take about a message today. */}
      <ReportSheet
        kind="thread"
        id={reporting}
        title="Report this conversation"
        intro="Pick the closest reason, then say what happened. ICEFALL can see the messages in this conversation."
        initialReason="off_platform_payment"
        onClose={() => setReporting(null)}
      />
    </div>
  );
}

/**
 * The name and picture at the top of a conversation: a link to the person when
 * there is one person to link to, and plain text otherwise.
 *
 * A LINK IS NOT DRAWN WHERE IT WOULD GO NOWHERE — a group, a fixture company —
 * which is the same rule the Message control on a profile follows.
 */
function HeaderIdentity({ to, children }: { to: string | null; children: React.ReactNode }) {
  const shape = "flex min-w-0 flex-1 items-center gap-3 text-left";
  if (to === null) return <div className={shape}>{children}</div>;
  return (
    <Link to={to} className={cn(shape, "transition-opacity hover:opacity-80")}>
      {children}
    </Link>
  );
}

/** The list has not answered yet, and a conversation is not missing until it has. */
function Opening() {
  return (
    <div className="grid h-full place-items-center px-6">
      <p className="text-[12.5px] text-mist-dim">Opening…</p>
    </div>
  );
}

/**
 * The name to address somebody by in a sentence, or "they".
 *
 * THE CONSTANT IS COMPARED BEFORE THE SPLIT, and that is the whole of the bug
 * this shape fixes. `PARTICIPANT_NAME_UNAVAILABLE` is "Name unavailable", two
 * words — so testing the FIRST TOKEN against it could never match, and a
 * correspondent whose profile row did not come back (after 20260903010000, the
 * block case) was addressed on screen as a person called "Name".
 */
function firstNameOf(name: string): string {
  const full = name.trim();
  if (full === PARTICIPANT_NAME_UNAVAILABLE) return "they";
  return full.split(/\s+/)[0] || "they";
}

/**
 * A stored message, as this screen draws one.
 *
 * `state` IS DELIBERATELY UNSET ON EVERY OUTGOING SERVER MESSAGE. What ICEFALL
 * knows is that the row exists on its server; it does not know the other
 * phone received it and it does not know it was read. `State` below draws the
 * single plain tick for exactly that, and there is no path here that can
 * produce "Seen".
 */
function toChatMessage(m: ServerMessage): ChatMessage {
  return {
    id: m.id,
    from: m.mine ? "me" : "them",
    body: m.body ?? ATTACHMENT_PREVIEW,
    at: m.at,
    kind: m.kind === "system" ? "system" : "text",
  };
}

/**
 * The channel before it is unlocked.
 *
 * No history and no composer, because there is nothing to show and nothing to
 * send. HOW it unlocks depends on who is on the other side, and the two are not
 * the same: a GUIDE opens on a paid booking (an in-app purchase), a COMPANY
 * opens on a qualified enquiry (an expedition is arranged and paid off-platform,
 * so there is nothing to charge — ICEFALL earns a referral on what results). One
 * action is offered, and it is the one that opens the channel.
 *
 * THIS ONLY EVER DRAWS FOR A FIXTURE. `isLocked` returns false for anything
 * with a `serverThreadId`, because a real conversation is governed by
 * `messages_insert` on ICEFALL's server and not by the booking field on a
 * sample row.
 */
function LockedBody({ convo, onAction }: { convo: Conversation; onAction: () => void }) {
  const first = convo.name.split(" ")[0];
  const company = convo.kind === "company";
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
      {/* THE LOCK IS THE STATE; THE MARK IS THE IDENTITY. For a company this is
          the whole screen — its name is the headline — and its only glyph was a
          padlock, which every locked conversation shares. The mark goes back in
          and the padlock rides on it as a pip, so neither claim displaces the
          other. A guide or a climber keeps the plain padlock: `CompanyMark` is
          for companies, and a person is not one. */}
      {company ? (
        <span className="relative">
          <CompanyMark name={convo.name} logoPath={convo.logo} size={56} />
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border border-hairline bg-graphite text-mist-dim"
          >
            <Lock size={12} strokeWidth={1.8} />
          </span>
        </span>
      ) : (
        <span className="grid h-14 w-14 place-items-center rounded-full border border-hairline bg-graphite text-mist-dim">
          <Lock size={22} strokeWidth={1.5} />
        </span>
      )}
      <h2 className="mt-5 text-[16px] text-snow">
        {company
          ? `Message ${convo.name} after a qualified enquiry`
          : `Message ${first} after you book`}
      </h2>
      <p className="mt-2.5 max-w-[19rem] text-[12.5px] leading-relaxed text-mist">
        {company ? LOCKED_EXPLAINER_COMPANY : LOCKED_EXPLAINER}
      </p>
      <Button size="lg" className="mt-6 w-full max-w-[16rem]" onClick={onAction}>
        {company ? (
          <>
            <Compass size={15} strokeWidth={1.8} />
            Send a qualified enquiry
          </>
        ) : (
          <>
            <CalendarCheck size={15} strokeWidth={1.8} />
            Book {first}
          </>
        )}
      </Button>
      <p className="mt-3 text-[11px] text-mist-dim">
        {company
          ? "It costs nothing and reaches them with your verified readiness."
          : "Free cancellation up to 14 days before you start."}
      </p>
    </div>
  );
}

/**
 * The delivery state, told straight.
 *
 * There is no double-tick here. ICEFALL knows a message was stored and knows
 * when the other party last opened the thread; it does not know their phone
 * received it. So: waiting, sent, seen — and nothing in between that would imply
 * more than is known.
 *
 * "SEEN" IS REACHABLE ONLY FROM A FIXTURE. A real conversation never sets it:
 * `last_read_at` is readable through `thread_participants_select`, so the fact
 * exists, but nothing on this screen reads the other party's row — and until
 * something does, drawing "Seen" would be a claim about somebody else's phone.
 * That is the one honest reason to leave it undrawn rather than to delete it.
 */
function State({ state }: { state?: ChatMessage["state"] }) {
  if (state === "queued")
    return (
      <span className="flex items-center gap-1 text-alert">
        <CloudOff size={11} strokeWidth={1.9} />
        Waiting for signal
      </span>
    );
  if (state === "failed") return <span className="text-danger">Failed</span>;
  // Distinct from "queued": nothing is waiting for signal, because there is no
  // server for it to reach.
  if (state === "unsent") return <span className="text-mist-dim">Not sent — no server yet</span>;
  if (state === "read")
    return (
      <span className="flex items-center gap-0.5 text-azure">
        <Check size={11} strokeWidth={2.4} />
        Seen
      </span>
    );
  return <Check size={11} strokeWidth={2.2} className="text-mist-dim" />;
}
