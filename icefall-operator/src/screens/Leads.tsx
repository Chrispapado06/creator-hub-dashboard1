/**
 * Leads & Messages — the mockup's unified screen, in three columns.
 *
 * One place for the whole of spec §9 and §10: the left column is every enquiry
 * and conversation in one scrolling list; the middle column is the selected
 * thread with its composer; the right column is everything ABOUT the customer
 * that the customer never sees — their tags and your team's internal notes. The
 * lead pipeline is one step deeper (the "View lead" menu item → `?view=detail`),
 * not a separate section of the app.
 *
 * URL-addressability is kept: `/operator/leads/:id` selects a row (the id may
 * be a lead id or — via the old inbox route's redirect — a conversation id),
 * so notification deep links and old bookmarks still land on the right thread.
 *
 * Three rules this screen exists to hold:
 *
 *   1. A REPLY CANNOT CARRY CONTACT DETAILS. The adapter's findContactDetails
 *      guard refuses the send and its reason is shown verbatim.
 *
 *   2. AN INTERNAL NOTE MUST NOT LOOK LIKE A MESSAGE. Notes are not in the
 *      conversation column at all — they are in a separate card, on a different
 *      ground, headed team-only, with the whole thread between them and the
 *      composer. That is the strongest form of the separation this screen has
 *      always been trying to hold: an internal note cannot be typed into the
 *      customer's box by accident when the two boxes are not even in the same
 *      column. (OP-05. Before this they sat above the message list, inside the
 *      conversation; before that, collapsed under the composer, which was
 *      worse.)
 *
 *   3. A LEAD THE OPERATOR ADDED HAS NO ICEFALL THREAD. `origin: "company"`
 *      means ICEFALL never carried a word between these two people. The pane
 *      says so plainly instead of drawing an empty message list and a composer
 *      that would post into nothing.
 *
 * The right column is the first thing to go when the window narrows: below
 * `xl` it drops under the conversation, and below `lg` the whole screen stacks.
 * It is never hidden outright — the notes would become unreachable again, which
 * is the complaint that started all of this.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Plus } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  Notice,
  PageHeader,
  Pill,
  RowMenu,
  SearchInput,
  Tabs,
  inputClass,
  type RowMenuItem, PersonAvatar, VerifiedMark } from "@/components/ui";
import {
  AddLeadDialog,
  OriginMark,
  PRIMARY_TAGS,
  StageChip,
  TagEditor,
  TagRow,
} from "@/components/leads";
import { OfferComposer } from "@/components/offer";
import { timeAgo, NOW } from "@/domain/dates";
import type { Conversation, Lead } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

/* -------------------------------------------------------------------------- */
/* The row model — a lead and its conversation, folded into one list entry    */
/* -------------------------------------------------------------------------- */

type RowKind = "enquiry" | "message";

interface Row {
  /** Lead id when a lead exists, else the conversation id. The URL segment. */
  key: string;
  name: string;
  /** "Everest — South Col · Everest" — what the enquiry is about. */
  line: string;
  /** Last activity, for ordering and the time-ago column. */
  at: string;
  unread: boolean;
  kind: RowKind;
  lead: Lead | null;
  conversation: Conversation | null;
}

/**
 * ENQUIRY until the company has recorded a first response, MESSAGE after.
 * Derived from `firstResponseAt` — the stamp the pipeline actually writes —
 * rather than from a field the schema does not have.
 */
function kindOf(lead: Lead | null, conversation: Conversation | null): RowKind {
  return conversation && lead?.firstResponseAt ? "message" : "enquiry";
}

function KindPill({ kind }: { kind: RowKind }) {
  const cls = kind === "enquiry" ? "bg-pending-soft text-pending" : "bg-azure-soft text-azure-ink";
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-semibold tracking-[0.07em] uppercase whitespace-nowrap ${cls}`}
    >
      {kind}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Assign — a small member menu on the thread header                          */
/* -------------------------------------------------------------------------- */

function AssignMenu({ ownerId, onAssign }: { ownerId: string | null; onAssign: (id: string | null) => void }) {
  const session = useSession();
  const { backend, revision } = useOperator();
  const team = useAsync(() => backend.getTeam(session), [session, revision], []);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const members = team.filter((t) => t.status === "active");
  const owner = members.find((m) => m.id === ownerId) ?? null;

  return (
    <div ref={ref} className="relative">
      <Button onClick={() => setOpen((o) => !o)}>
        {owner ? `Assigned · ${owner.displayName.split(" ")[0]}` : "Assign"}
        <ChevronDown size={13} aria-hidden />
      </Button>
      {open && (
        <div className="hairline absolute top-full right-0 z-20 mt-1 min-w-[170px] rounded-tile bg-surface py-1 shadow-[0_8px_24px_var(--op-line)]">
          {[{ id: null as string | null, label: "Nobody" }, ...members.map((m) => ({ id: m.id as string | null, label: m.displayName }))].map(
            (item) => (
              <button
                key={item.id ?? "nobody"}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAssign(item.id);
                }}
                className={`block w-full px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-raised ${
                  (item.id ?? null) === (ownerId ?? null) ? "font-medium text-azure-ink" : "text-ink"
                }`}
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Internal notes                                                             */
/* -------------------------------------------------------------------------- */

interface PaneNote {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/**
 * The team-only notes on this customer — out of the conversation entirely.
 *
 * The operator's complaint was that nobody could find these. They were behind a
 * "Show" toggle at the bottom of the pane, below the composer, with no visible
 * way in. Then they moved above the message list, which found them but put them
 * inside the chat. Now they live in the context column beside it: headed, open
 * by default when there is anything to read, and an "Add note" box that is
 * ALWAYS on screen. A toggle you have to discover is not an affordance.
 *
 * TWO STORES, ONE READING. Notes attach to a conversation (`getNotes`) or to a
 * lead (`getLeadNotes` — where the deeper lead view and the add-lead dialog's
 * first note land). Both are the same thing to the person reading them, so both
 * are shown; hiding one store would make the count on this header a lie. A new
 * note is written where this row's notes belong: on the thread when there is
 * one, on the lead when there is not.
 */
function NotesPanel({
  rowKey,
  customerName,
  conversationId,
  leadId,
  focusSignal,
}: {
  rowKey: string;
  customerName: string;
  conversationId: string | null;
  leadId: string | null;
  /** Bumped by the row menu's "Add note" to open and focus this box. */
  focusSignal: number;
}) {
  const session = useSession();
  const { backend, revision, refresh } = useOperator();

  const conversationNotes = useAsync(
    () => (conversationId ? backend.getNotes(session, conversationId) : Promise.resolve([])),
    [session, conversationId, revision],
    [],
  );
  const leadNotes = useAsync(
    () => (leadId ? backend.getLeadNotes(session, leadId) : Promise.resolve([])),
    [session, leadId, revision],
    [],
  );

  const notes = useMemo<PaneNote[]>(
    () =>
      [...conversationNotes, ...leadNotes]
        .map((n) => ({ id: n.id, authorName: n.authorName, body: n.body, createdAt: n.createdAt }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [conversationNotes, leadNotes],
  );

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** null = follow the default (open when there is something to read). */
  const [override, setOverride] = useState<boolean | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft("");
    setError(null);
    setOverride(null);
  }, [rowKey]);

  useEffect(() => {
    if (focusSignal === 0) return;
    setOverride(true);
    input.current?.focus();
  }, [focusSignal]);

  const open = override ?? notes.length > 0;

  const add = async () => {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    const res = conversationId
      ? await backend.addNote(session, conversationId, body)
      : leadId
        ? await backend.addLeadNote(session, leadId, body)
        : null;
    if (!res) return;
    if (!res.ok) {
      // The backend's refusal is the operator's answer, not a console message.
      setError(res.reason);
      return;
    }
    setDraft("");
    setOverride(true);
    refresh();
  };

  if (!conversationId && !leadId) return null;

  const firstName = customerName.split(" ")[0];

  return (
    /* Dashed and on canvas: visibly not the conversation, and not beside it. */
    <div className="border-t border-dashed border-line bg-canvas px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-ink">Internal notes</span>
        <Pill>Your team only</Pill>
        <span className="tnum text-[11.5px] text-faint">
          {notes.length === 0 ? "None yet" : `${notes.length} ${notes.length === 1 ? "note" : "notes"}`}
        </span>
        {notes.length > 0 && (
          <button
            type="button"
            onClick={() => setOverride(!open)}
            aria-expanded={open}
            className="ml-auto text-[11.5px] font-medium text-azure-ink transition-colors hover:underline"
          >
            {open ? "Hide notes" : "Show notes"}
          </button>
        )}
      </div>

      <p className="mt-1 text-[11.5px] leading-snug text-muted">
        Only your team reads these. {firstName} never does — a note is stored apart from the
        conversation and is never sent as a message.
      </p>

      {open && notes.length > 0 && (
        <div className="mt-2 max-h-[260px] space-y-1.5 overflow-y-auto pr-0.5">
          {notes.map((n) => (
            <div key={n.id} className="hairline rounded-tile bg-surface px-3 py-2">
              <div className="text-[11px] font-medium text-muted">
                {n.authorName} · {timeAgo(n.createdAt, NOW)}
              </div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink">{n.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Always on screen — this is the thing the operator could not find. */}
      <div className="mt-2 space-y-2">
        <input
          ref={input}
          className={inputClass}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) void add();
          }}
          placeholder="Write a note for your team…"
          aria-label={`Add an internal note about ${customerName}. Only your team sees it.`}
        />
        <div className="flex justify-end">
          <Button onClick={() => void add()} disabled={!draft.trim()}>
            <span className="whitespace-nowrap">Add note</span>
          </Button>
        </div>
      </div>

      {error && <p className="mt-1.5 text-[11.5px] text-rejected">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Ready-made tags                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The owner's four tags as one-click chips — "tags should be ready so cold
 * lead, waste of time, interested, enquired".
 *
 * `TagEditor` already offers the full twelve, but only once you have opened its
 * text box, which means the common four cost a click and a decision before they
 * cost a tag. These sit permanently under the editor: one click, one write, no
 * typing. A tag already on the lead is dropped from the row rather than shown
 * inert, so the row is always a list of things that will actually do something.
 *
 * The write is the same backend call `TagEditor` makes, and its refusal is
 * shown here rather than swallowed.
 */
function QuickTags({ lead }: { lead: Lead }) {
  const session = useSession();
  const { backend, refresh } = useOperator();
  const [error, setError] = useState<string | null>(null);

  const missing = PRIMARY_TAGS.filter(
    (t) => !lead.tags.some((x) => x.toLowerCase() === t.toLowerCase()),
  );

  const add = async (tag: string) => {
    setError(null);
    const res = await backend.setLeadTags(session, lead.id, [...lead.tags, tag]);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    refresh();
  };

  if (missing.length === 0 && !error) return null;

  return (
    <div className="mt-2.5">
      {missing.length > 0 && (
        <>
          <div className="lbl text-faint">One click</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {missing.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => void add(t)}
                className="rounded-pill bg-raised px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-azure-soft hover:text-azure-ink"
              >
                {t}
              </button>
            ))}
          </div>
        </>
      )}
      {error && <p className="mt-1.5 text-[11.5px] text-rejected">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Right column — everything about the customer they never see                */
/* -------------------------------------------------------------------------- */

/**
 * Tags and internal notes, in their own column beside the conversation.
 *
 * OP-05, the owner's words: "Leads page on chats should remove the notes, and
 * put then next to the right of ui interface + tags should be ready". Both live
 * here now, and neither is in the chat column any more.
 */
function ContextColumn({ row, focusSignal }: { row: Row | null; focusSignal: number }) {
  if (!row) {
    return (
      <div className="px-4 py-3">
        <div className="lbl">Lead context</div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Pick an enquiry on the left. Its tags and your team's internal notes appear here, beside
          the conversation and never inside it.
        </p>
      </div>
    );
  }

  const lead = row.lead;

  return (
    <>
      <div className="border-b border-line-soft px-4 py-3">
        <div className="lbl">Lead context</div>
        <p className="mt-1 truncate text-[12.5px] text-muted" title={row.name}>
          {row.name}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-ink">Tags</span>
            {lead && lead.tags.length > 0 && (
              <span className="tnum text-[11.5px] text-faint">{lead.tags.length}</span>
            )}
          </div>

          {lead ? (
            <>
              <p className="mt-1 text-[11.5px] leading-snug text-muted">
                Your own shorthand, laid on top of the stage — a lead can be Quoted and a cold lead
                at the same time.
              </p>
              <div className="mt-2">
                <TagEditor lead={lead} />
              </div>
              <QuickTags lead={lead} />
            </>
          ) : (
            <p className="mt-1 text-[11.5px] leading-snug text-muted">
              Tags belong to a lead. This conversation has no lead record behind it, so there is
              nothing here to tag.
            </p>
          )}
        </div>

        <NotesPanel
          rowKey={row.key}
          customerName={row.name}
          conversationId={row.conversation?.id ?? null}
          leadId={lead?.id ?? null}
          focusSignal={focusSignal}
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Right pane — the thread                                                    */
/* -------------------------------------------------------------------------- */

function ThreadPane({
  row,
  notFound,
  pending,
  onAddNote,
}: {
  row: Row | null;
  notFound: boolean;
  pending: boolean;
  /** Opens and focuses the note box in the context column. */
  onAddNote: () => void;
}) {
  const session = useSession();
  const { backend, revision, refresh } = useOperator();
  const navigate = useNavigate();

  const conversation = row?.conversation ?? null;
  const lead = row?.lead ?? null;
  const convId = conversation?.id ?? null;
  const convUnread = conversation?.unread ?? false;

  const messages = useAsync(
    () => (convId ? backend.getMessages(session, convId) : Promise.resolve([])),
    [session, convId, revision],
    [],
  );

  /**
   * Opening the thread is what clears the unread mark (spec §9: persistent
   * until opened). Selecting a row IS opening it in a two-pane layout.
   * Guarded on `unread` so the refresh it triggers cannot loop.
   */
  useEffect(() => {
    if (!convId || !convUnread) return;
    void backend.markConversationRead(session, convId).then(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, convUnread, session]);

  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * The custom offer composer (OP-05b), open against the selected row.
   *
   * It is a dialog rather than a fourth column because composing a price is a
   * whole task — lines, party maths, exclusions, a cancellation policy — and it
   * needs the width. It opens from the header, which is the one part of this
   * pane that renders whether or not a thread exists: an operator can compose an
   * offer for a lead ICEFALL has no conversation with, and only the delivery is
   * impossible there.
   */
  const [offering, setOffering] = useState(false);

  // A new selection starts clean: no half-typed reply carried between customers.
  useEffect(() => {
    setReply("");
    setError(null);
    setOffering(false);
  }, [row?.key]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, convId]);

  const send = async () => {
    if (!convId) return;
    setError(null);
    const res = await backend.sendMessage(session, convId, reply);
    if (!res.ok) {
      // The contact-details guard's refusal arrives here, verbatim.
      setError(res.reason);
      return;
    }
    setReply("");
    refresh();
  };

  if (notFound) {
    return (
      <div className="p-4">
        <Notice>This conversation either does not exist or belongs to another company.</Notice>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="grid flex-1 place-items-center p-6 text-center">
        <div>
          <p className="text-[13.5px] font-medium text-ink">
            {pending ? "Opening the lead you just added…" : "Nothing selected"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">
            {pending ? "One moment." : "Pick an enquiry or conversation from the list."}
          </p>
        </div>
      </div>
    );
  }

  const menuItems: RowMenuItem[] = [
    ...(lead
      ? [{ label: "View lead", onClick: () => navigate(`/operator/leads/${lead.id}?view=detail`) }]
      : []),
    { label: "Add note", onClick: onAddNote },
  ];

  const ownLead = lead?.origin === "company";

  return (
    <>
      {offering && (
        <OfferComposer
          customerName={row.name}
          subject={row.line}
          conversationId={conversation?.id ?? null}
          addedByCompany={ownLead}
          onClose={() => setOffering(false)}
        />
      )}

      {/* Header: who, what stage, whose lead it is — and the labels on it. */}
      <div className="border-b border-line-soft px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <PersonAvatar name={row.name} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-ink">{row.name}</span>
              <VerifiedMark name={row.name} />
              <KindPill kind={row.kind} />
              {lead && <StageChip status={lead.status} />}
              {lead && <OriginMark lead={lead} />}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-muted">{row.line}</div>
          </div>
          <div className="flex items-center gap-2">
            {/*
              Available on every row, thread or no thread. An offer for a lead
              the company added itself is still theirs to make; the composer
              says plainly that ICEFALL cannot deliver that one.
            */}
            <Button onClick={() => setOffering(true)}>Custom offer</Button>
            {lead && (
              <AssignMenu
                ownerId={lead.ownerId}
                onAssign={(id) => void backend.assignLead(session, lead.id, id).then(refresh)}
              />
            )}
            {/*
              The mockup's second header button is "Mark done", but nothing in the
              backend archives a conversation and "done" is not a pipeline stage.
              The closest real action, titled honestly: record the first response
              on a still-new lead. (Opening already cleared the unread mark.)
            */}
            {lead && lead.status === "new" && (
              <Button onClick={() => void backend.setLeadStatus(session, lead.id, "contacted").then(refresh)}>
                Mark contacted
              </Button>
            )}
            {menuItems.length > 0 && <RowMenu items={menuItems} />}
          </div>
        </div>

        {/*
          Tags used to sit here and notes directly below. Both are now in the
          context column to the right (OP-05) — a read-only echo of the tags is
          on the list row, so nothing about this customer is only visible in a
          column that a narrow window drops.
        */}
      </div>

      {!conversation ? (
        /*
         * No thread. For a lead the operator typed in that is the whole truth of
         * it — ICEFALL has never carried a message between these two — and an
         * empty message list with a composer under it would suggest otherwise.
         */
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="mx-auto max-w-sm">
            <p className="text-[13.5px] font-medium text-ink">
              {ownLead ? "No Icefall thread — this lead is your own" : "No message thread"}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              {ownLead
                ? `You added ${row.name.split(" ")[0]} yourself, so Icefall has no conversation with them and there is nothing to reply to here. Keep talking to them however they reached you — the stage above, and the tags and notes in Lead context, are live and count as your own.`
                : "This enquiry was recorded without a conversation. Its pipeline and notes live on the lead."}
            </p>
            {lead && (
              <Link
                to={`/operator/leads/${lead.id}?view=detail`}
                className="mt-2 inline-block text-[12.5px] font-medium text-azure-ink hover:underline"
              >
                Open lead detail
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          {conversation.productId === null && conversation.productNameAtCreation && (
            <div className="px-4 pt-3">
              {/* Spec §18: the name shown is the one the customer actually saw. */}
              <Notice>
                This enquiry is about a trip that is no longer in your catalogue. The name shown is the one
                the customer saw when they wrote.
              </Notice>
            </div>
          )}

          {/* The thread: customer left on raised ground, operator right on azure. */}
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.fromCompany ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-card px-3 py-2 ${m.fromCompany ? "bg-azure-soft" : "bg-raised"}`}
                >
                  {/*
                    `whitespace-pre-wrap`: a message may be more than one line.
                    A custom offer (OP-05b) is sent as a message and is a dozen
                    lines of price, exclusions and cancellation tiers — without
                    this they collapse into one paragraph and the bullets run
                    together. Ordinary one-line replies are unaffected.
                  */}
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{m.body}</p>
                  <div className="mt-1 text-[10.5px] text-faint">
                    {m.senderName} · {timeAgo(m.createdAt, NOW)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Composer. The adapter refuses contact details; the reason shows here. */}
          <div className="border-t border-line-soft p-3">
            {error && (
              <div className="mb-2">
                <Notice tone="rejected">{error}</Notice>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                className={inputClass}
                placeholder={`Reply to ${row.name.split(" ")[0]}…`}
                aria-label={`Reply to ${row.name}. The customer sees this.`}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && reply.trim()) void send();
                }}
              />
              <Button variant="primary" onClick={() => void send()} disabled={!reply.trim()}>
                Send
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-faint">
              {row.name.split(" ")[0]} sees this. For something only your team should read, use
              Internal notes in the Lead context column. Keep contact details out — it is what keeps
              the booking yours.
            </p>
          </div>
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

type TabKey = "all" | "unread" | "enquiry" | "message";
/** Who produced the row — the same split the dashboard's figures respect. */
type OriginKey = "all" | "icefall" | "company";

export function LeadsMessages({ selectedId }: { selectedId?: string }) {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { backend, mountains, revision } = useOperator();
  const leads = useAsync(() => backend.getLeads(session), [session, revision], []);
  const conversations = useAsync(() => backend.getConversations(session), [session, revision], []);
  const products = useAsync(() => backend.getProducts(session), [session, revision], []);

  const [tab, setTab] = useState<TabKey>("all");
  /*
   * NO ORIGIN FILTER ON THIS SCREEN — OWNER DECISION, 2026-08-29.
   *
   * It was built here and the owner removed it: an inbox is for working the
   * conversation in front of you, and "show me only the leads I added" is a
   * reporting question that belongs on the Pipeline, which has it. <OriginMark/>
   * stays on the rows, because that is what stops a self-added lead being
   * mistaken for one Icefall sent. Do not reinstate the filter here.
   */
  const origin: OriginKey = "all";
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  /**
   * The lead just created, carried in the navigation rather than in state.
   *
   * `/operator/leads` and `/operator/leads/:id` are two routes rendering this
   * one screen, so selecting the new lead REMOUNTS it and any local state — and
   * the reads that back it — start over from empty. Held in location state, the
   * id survives that, which is what lets the frame in between say "opening the
   * lead you just added" instead of "nothing here yet".
   */
  const createdId = (location.state as { createdLeadId?: string } | null)?.createdLeadId ?? null;

  const rows = useMemo<Row[]>(() => {
    const productName = (id: string | null) => (id ? (products.find((p) => p.id === id)?.name ?? null) : null);
    const mountainName = (id: string | null) => (id ? (mountains.find((m) => m.id === id)?.name ?? null) : null);
    const line = (product: string, mountainId: string | null) => {
      const mtn = mountainName(mountainId);
      return mtn && mtn !== product ? `${product} · ${mtn}` : product;
    };

    const leadRows: Row[] = leads.map((l) => {
      const c =
        conversations.find((x) => x.leadId === l.id) ??
        (l.conversationId ? (conversations.find((x) => x.id === l.conversationId) ?? null) : null);
      const product = c?.productNameAtCreation ?? productName(l.productId) ?? "General enquiry";
      return {
        key: l.id,
        name: l.customerName,
        line: line(product, c?.mountainId ?? l.mountainId),
        at: c?.lastMessageAt ?? l.createdAt,
        unread: c?.unread ?? false,
        kind: kindOf(l, c ?? null),
        lead: l,
        conversation: c ?? null,
      };
    });

    // A conversation with no lead behind it still belongs in the one list.
    const leadIds = new Set(leads.map((l) => l.id));
    const orphanRows: Row[] = conversations
      .filter((c) => !c.leadId || !leadIds.has(c.leadId))
      .map((c) => ({
        key: c.id,
        name: c.customerName,
        line: line(c.productNameAtCreation ?? "General enquiry", c.mountainId),
        at: c.lastMessageAt,
        unread: c.unread,
        kind: kindOf(null, c),
        lead: null,
        conversation: c,
      }));

    return [...leadRows, ...orphanRows].sort((a, b) => b.at.localeCompare(a.at));
  }, [leads, conversations, products, mountains]);

  const matchesTab = (r: Row, t: TabKey) =>
    t === "all" ? true : t === "unread" ? r.unread : r.kind === t;

  /**
   * A conversation with no lead behind it is ICEFALL's by definition — ICEFALL
   * is what delivered the thread. Only a lead can be the operator's own.
   */
  const matchesOrigin = (r: Row, o: OriginKey) =>
    o === "all" ? true : o === "company" ? r.lead?.origin === "company" : r.lead?.origin !== "company";

  const needle = q.trim().toLowerCase();
  const matchesSearch = (r: Row) =>
    needle === "" || r.name.toLowerCase().includes(needle) || r.line.toLowerCase().includes(needle);

  const searched = rows.filter(matchesSearch);
  const shown = searched.filter((r) => matchesTab(r, tab) && matchesOrigin(r, origin));

  // Every count is the same promise: how many rows clicking this leaves you.
  const tabCount = (t: TabKey) => searched.filter((r) => matchesTab(r, t) && matchesOrigin(r, origin)).length;

  /**
   * The URL owns the selection. The id may be a lead id or a conversation id
   * (old inbox links redirect here carrying one); with no id, the most recent
   * row stands selected, as the mockup shows.
   */
  const selected = selectedId
    ? (rows.find((r) => r.key === selectedId || r.lead?.id === selectedId || r.conversation?.id === selectedId) ??
      null)
    : (shown[0] ?? null);
  /*
   * A lead created a moment ago is not "not found" — its read is simply still in
   * flight. Saying so would accuse the operator's own write of having failed.
   */
  const pending = selectedId !== undefined && selectedId === createdId && selected === null;
  const notFound = selectedId !== undefined && rows.length > 0 && selected === null && !pending;

  /*
   * "Add note" is in the thread's ⋮ menu and the note box is in the context
   * column, so the signal between them is held here, above both. Bumped, not
   * set true: the same menu item pressed twice must focus the box twice.
   */
  const [noteFocus, setNoteFocus] = useState(0);
  const selectedKey = selected?.key ?? null;
  useEffect(() => {
    setNoteFocus(0);
  }, [selectedKey]);

  return (
    <>
      <PageHeader
        title="Leads & Messages"
        detail="All enquiries and conversations in one place."
        action={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden />
            Add lead
          </Button>
        }
      />

      {adding && (
        <AddLeadDialog
          products={products}
          mountains={mountains}
          onClose={() => setAdding(false)}
          onCreated={(lead) => navigate(`/operator/leads/${lead.id}`, { state: { createdLeadId: lead.id } })}
        />
      )}

      {rows.length === 0 && !pending ? (
        <EmptyState
          title="Nothing here yet"
          detail="When a climber enquires about one of your trips through Icefall, it appears here. You can also add a lead you got yourself — a phone call, a referral — with Add lead."
        />
      ) : (
        /*
          THREE COLUMNS AT xl: list | conversation | context.

          A grid rather than nested flex rows so the context card can be placed
          rather than moved: at `lg` it sits in row 2 of the conversation's
          column (under the thread, still its own card, still not inside the
          chat), and below `lg` the whole thing stacks. One instance of the
          card in the DOM at every width — rendering it twice would mean two
          note-drafts and two sets of reads.
        */
        <div className="grid gap-5 lg:h-[calc(100vh-190px)] lg:min-h-[440px] lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_auto] xl:grid-cols-[340px_minmax(0,1fr)_320px] xl:grid-rows-[minmax(0,1fr)]">
          {/* Left column: the one list. */}
          <Card className="flex max-h-[320px] flex-col overflow-hidden lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:max-h-none xl:row-span-1">
            <div className="space-y-2.5 border-b border-line-soft p-3">
              <Tabs
                active={tab}
                onChange={setTab}
                tabs={[
                  { key: "all" as const, label: "All", count: tabCount("all") },
                  { key: "unread" as const, label: "Unread", count: tabCount("unread") },
                  { key: "enquiry" as const, label: "Enquiries", count: tabCount("enquiry") },
                  { key: "message" as const, label: "Messages", count: tabCount("message") },
                ]}
              />
              <SearchInput value={q} onChange={setQ} placeholder="Search leads…" />
            </div>
            <div className="flex-1 overflow-y-auto">
              {shown.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12.5px] text-muted">No matches.</p>
              ) : (
                shown.map((r, i) => (
                  <Link
                    key={r.key}
                    to={`/operator/leads/${r.key}`}
                    aria-current={selected?.key === r.key ? "page" : undefined}
                    className={`flex items-start gap-2.5 px-3 py-3 transition-colors ${
                      selected?.key === r.key ? "bg-raised" : "hover:bg-raised"
                    } ${i > 0 ? "border-t border-line-soft" : ""}`}
                  >
                    <PersonAvatar name={r.name} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={`truncate text-[13px] text-ink ${r.unread ? "font-semibold" : "font-medium"}`}
                        >
                          {r.name}
                        </span>
                        <VerifiedMark name={r.name} size={13} />
                        {r.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-azure" aria-hidden />}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-muted">{r.line}</span>
                      {r.lead && (r.lead.origin === "company" || r.lead.tags.length > 0) && (
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <OriginMark lead={r.lead} />
                          <TagRow tags={r.lead.tags} max={2} />
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 pt-0.5 text-[11px] text-faint">{timeAgo(r.at, NOW)}</span>
                  </Link>
                ))
              )}
            </div>
          </Card>

          {/* Middle column: the selected thread. Nothing internal in it. */}
          <Card className="flex min-h-[420px] min-w-0 flex-col overflow-hidden lg:col-start-2 lg:row-start-1 lg:min-h-0">
            <ThreadPane
              row={selected}
              notFound={notFound}
              pending={pending}
              onAddNote={() => setNoteFocus((n) => n + 1)}
            />
          </Card>

          {/*
            Right column: tags and internal notes. First to give way — under the
            conversation at lg, stacked at the bottom below it.
          */}
          <Card className="flex min-w-0 flex-col overflow-hidden lg:col-start-2 lg:row-start-2 lg:max-h-[270px] xl:col-start-3 xl:row-start-1 xl:max-h-none">
            <ContextColumn row={selected} focusSignal={noteFocus} />
          </Card>
        </div>
      )}
    </>
  );
}

export default function Leads() {
  return <LeadsMessages />;
}
