/**
 * Channels — a company broadcasts, members listen.
 *
 * THE OWNER'S MODEL, in their words: "like on instagram when creators create
 * channels". A company posts promotional content, a climber joins if they want
 * to hear it, MEMBERS CANNOT REPLY, and the company sees how many people saw
 * each message. This screen is the company side of
 * `20260902180000_company_channels.sql` (written, NOT PUSHED) through the
 * adapter's optional channel block — the swap is a repoint, not a rewrite.
 *
 * FIVE RULES LIVE IN THE DATABASE AND SURVIVE HERE AS ABSENCES. Read the
 * absences as deliberate, because every one of them is:
 *
 *   1. NO REPLY AFFORDANCE, NOT EVEN A DISABLED ONE. There is no reply box, no
 *      comment list and no prop that could turn a message row back into a
 *      conversation. Two-way talk is `Conversation`/`Message` — a different
 *      feature with a different name and its own screen.
 *   2. THE VIEW COUNT IS COUNTED. `getChannelMessageStats` aggregates one row
 *      per person per message, so the number on a row is distinct people who
 *      opened it. Never a counter, never an estimate, never a projection.
 *   3. A COUNT IS NOT A LIST. `ChannelMessageStats` carries a message id and a
 *      number and nothing else, so this file has no identity to leak — there is
 *      no "who viewed" control here and one added later would have nothing
 *      behind it. A company learning that a named climber opened a named
 *      promotional offer at a named time is surveillance, not analytics.
 *   4. NO INVITE, NO ADD-MEMBER, NO IMPORT. People join themselves; an audience
 *      a company assembled is a mailing list nobody consented to.
 *   5. NO EDIT CONTROL ANYWHERE. A promotional claim is stood behind or
 *      deleted. An edit after the view count accrued against the old words
 *      makes the count a measurement of text that no longer exists.
 *
 * A MESSAGE PROMOTES A PRODUCT AND NEVER CARRIES A QUOTE. An `offers` row is
 * addressed to one named climber inside one thread and can be accepted once;
 * broadcasting one would show every member the best price that company ever
 * privately gave anyone, and decision 19 forbids a cold offer outright. So the
 * composer promotes something PURCHASABLE — a trip, and optionally one of its
 * departures — and a member who wants it enquires, which opens a thread, which
 * is where a real offer belongs.
 *
 * `promoNote` IS TERMS, NOT A PRICE, and the field says so. A number there
 * would be an unenforceable commitment sitting outside the money model; every
 * real figure belongs to the trip or to an offer made in a thread. It is never
 * formatted as money.
 *
 * NO MESSAGE MEDIA AND NO DISABLED ATTACH CONTROL. `operator-media` is
 * company-scoped and fine for a channel cover; nothing yet holds a photo that
 * belongs to a message. A dead paperclip reads as "not built yet" and invites
 * the next person to finish it, so there is no paperclip.
 */

import { ArrowLeft, Archive, Megaphone, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Figure,
  Notice,
  PageHeader,
  Pill,
  SectionHeading,
  StatusChip,
  inputClass,
} from "@/components/ui";
import { Listbox, type ListboxOption } from "@/components/controls";
import { findContactDetails } from "@/domain/authz";
import { NOW, formatDay, timeAgo } from "@/domain/dates";
import { OPERATOR_NOTICES } from "@/domain/honesty";
import type { Reading } from "@/domain/honesty";
import { unavailable } from "@/domain/honesty";
import type { Channel, ChannelMessage, Product, ProductDeparture } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

/** The migration's checks, mirrored so a budget cannot drift from the column. */
const NAME_MAX = 60;
const TEXT_MAX = 300;
const BODY_MAX = 2000;

/**
 * The archived refusal, written once and shown AT the send control before the
 * operator types anything, so the reason arrives with the disabled button
 * rather than after a write that was never going to land.
 */
const ARCHIVED_REASON =
  "This channel is archived, so it does not take new messages. Everything already in it stays readable for the people who joined.";

/** "0 views" is a measured zero — never blank, never a dash. */
const viewsLabel = (n: number) => (n === 1 ? "view" : "views");

/**
 * Is the channel surface connected at all?
 *
 * An implementation without the block (the frozen offline demo) is told to say
 * so. It never draws an empty channel list, which would read as "you have no
 * channels" — a different and false statement.
 */
function useChannelsAvailable(): boolean {
  const { backend } = useOperator();
  return (
    typeof backend.getChannels === "function" &&
    typeof backend.createChannel === "function" &&
    typeof backend.archiveChannel === "function" &&
    typeof backend.getChannelMessages === "function" &&
    typeof backend.postChannelMessage === "function" &&
    typeof backend.deleteChannelMessage === "function" &&
    typeof backend.getChannelMessageStats === "function" &&
    typeof backend.getChannelMemberCount === "function"
  );
}

function Unavailable() {
  return (
    <EmptyState
      title="Channels are unavailable in this build"
      detail="This version of the portal is not connected to Icefall's channels, so nothing can be shown or sent from here."
    />
  );
}

/* -------------------------------------------------------------------------- */
/* What a channel IS — the two absences, stated plainly and once               */
/* -------------------------------------------------------------------------- */

/**
 * THE STATEMENT THAT STOPS A RULE BEING READ AS A BUG.
 *
 * Both halves are here on purpose and neither is in a tooltip. "Members cannot
 * reply" is the first thing an operator will assume is missing; "you see how
 * many, never who" is the one told in the operator's favour, because it is
 * exactly what makes joining safe for a climber and therefore what makes the
 * channel worth joining at all.
 */
function HowAChannelWorks() {
  return (
    <div className="hairline rounded-card bg-surface p-4">
      <h2 className="text-[13px] font-semibold text-ink">How a channel works</h2>
      <ul className="mt-2 space-y-2 text-[12.5px] leading-relaxed text-muted">
        <li>
          <span className="font-medium text-ink">You broadcast; members listen.</span> Climbers cannot
          reply to a channel — by design, not because a reply box is missing. Someone who wants to talk
          enquires, and that arrives in Leads &amp; Messages as a normal conversation.
        </li>
        <li>
          <span className="font-medium text-ink">You see how many people opened a message, never who.</span>{" "}
          The number is counted — one person per message, however often they re-read it — and no
          climber's name reaches this page. That is what makes joining safe for them, and it is why they
          join at all.
        </li>
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The channel list                                                           */
/* -------------------------------------------------------------------------- */

function NewChannelDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const session = useSession();
  const { backend } = useOperator();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  /*
   * The guard runs on BOTH fields while typing, and the name matters most: a
   * channel name is read every time the list is drawn, far more often than
   * anyone opens the description. Explained before the refusal, never instead
   * of it — the backend still refuses, and its words are shown verbatim below.
   */
  const contactHits = findContactDetails(`${name}\n${description}`);

  const create = async () => {
    if (!backend.createChannel) return;
    const res = await backend.createChannel(session, { name, description });
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    onCreated();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New channel"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-ink">New channel</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Climbers find it on your company profile and join if they want to hear from you. You cannot
            add anyone yourself.
          </p>

          <div className="mt-4 space-y-3.5">
            <Field label="Name" hint="What climbers see in their list. Up to 60 characters.">
              <input
                className={inputClass}
                value={name}
                maxLength={NAME_MAX}
                placeholder="Autumn departures"
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
              />
              <div className="tnum mt-1 text-right text-[11px] text-faint">
                {name.trim().length} / {NAME_MAX}
              </div>
            </Field>

            <Field label="Description" hint="One line on what you will send here. Optional.">
              <textarea
                className={`${inputClass} min-h-[64px] resize-y`}
                value={description}
                maxLength={TEXT_MAX}
                placeholder="Departure news and remaining places, straight from the office."
                onChange={(e) => {
                  setDescription(e.target.value);
                  setError(null);
                }}
              />
              <div className="tnum mt-1 text-right text-[11px] text-faint">
                {description.trim().length} / {TEXT_MAX}
              </div>
            </Field>
          </div>

          {contactHits.length > 0 && (
            <div className="mt-3">
              <Notice
                tone="rejected"
                title={`Remove ${[...new Set(contactHits.map((h) => h.label))].join(" and ")}`}
              >
                {OPERATOR_NOTICES.NO_CONTACT_DETAILS}
              </Notice>
            </div>
          )}

          {error && (
            <div className="mt-3">
              {/* The backend's refusal, verbatim. */}
              <Notice tone="rejected">{error}</Notice>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-3">
            <Button
              variant="primary"
              onClick={() => void create()}
              disabled={name.trim().length === 0 || contactHits.length > 0}
            >
              Create channel
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ChannelRow({
  channel,
  members,
  messageCount,
}: {
  channel: Channel;
  members: Reading<number>;
  messageCount: number | null;
}) {
  const archived = channel.archivedAt !== null;
  return (
    <Link
      to={`/operator/channels/${channel.id}`}
      className="hairline block rounded-card bg-surface p-4 transition-colors hover:bg-raised"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ser text-[17px] leading-tight text-ink">{channel.name}</span>
            {archived && <StatusChip status="archived" />}
          </div>
          {channel.description && (
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">{channel.description}</p>
          )}
          <p className="mt-1.5 text-[11.5px] text-faint">
            Opened {formatDay(channel.createdAt.slice(0, 10))}
            {archived && channel.archivedAt
              ? ` · archived ${formatDay(channel.archivedAt.slice(0, 10))}`
              : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-start gap-7">
          <div>
            <div className="lbl">Members</div>
            <div className="mt-1">
              <Figure reading={members} format={(n) => n.toLocaleString("en-GB")} size="sm" />
            </div>
          </div>
          <div>
            <div className="lbl">Messages</div>
            <div className="mt-1 text-[15px] font-medium text-ink">
              {/* Counted rows, or the honest "still reading" — never a stand-in zero. */}
              {messageCount === null ? (
                <span className="text-[12px] font-normal text-muted">Counting…</span>
              ) : (
                <span className="tnum">{messageCount.toLocaleString("en-GB")}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Channels() {
  const session = useSession();
  const { backend, revision, refresh } = useOperator();
  const available = useChannelsAvailable();
  const [creating, setCreating] = useState(false);

  const channels = useAsync(
    () => (backend.getChannels ? backend.getChannels(session) : Promise.resolve<Channel[]>([])),
    [session, revision],
    [] as Channel[],
  );

  /*
   * A `Reading` per channel, because an implementation with no membership data
   * must say so rather than ship a zero that reads as "nobody joined".
   */
  const members = useAsync(
    async () => {
      if (!backend.getChannelMemberCount || channels.length === 0) {
        return {} as Record<string, Reading<number>>;
      }
      const entries = await Promise.all(
        channels.map(async (c) => [c.id, await backend.getChannelMemberCount!(session, c.id)] as const),
      );
      return Object.fromEntries(entries);
    },
    [session, revision, channels],
    {} as Record<string, Reading<number>>,
  );

  const messageCounts = useAsync(
    async () => {
      if (!backend.getChannelMessages || channels.length === 0) return {} as Record<string, number>;
      const entries = await Promise.all(
        channels.map(async (c) => [c.id, (await backend.getChannelMessages!(session, c.id)).length] as const),
      );
      return Object.fromEntries(entries);
    },
    [session, revision, channels],
    {} as Record<string, number>,
  );

  if (!available) return <Unavailable />;

  return (
    <div>
      <PageHeader
        title="Channels"
        detail="Promotional content climbers choose to join. You send; members read. Nobody replies, and no channel can be deleted once people have joined it — it is archived instead."
        chip={false}
        action={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={13} aria-hidden /> New channel
          </Button>
        }
      />

      <div className="space-y-4">
        <HowAChannelWorks />

        {channels.length === 0 ? (
          <EmptyState
            title="No channels yet"
            detail="A channel is a place to put promotional content — departure news, remaining places, terms worth knowing about. Climbers join it if they want to hear from you, you broadcast to everyone who did, and they cannot reply. Your first one appears here."
          />
        ) : (
          <div className="space-y-2.5">
            {channels.map((c) => (
              <ChannelRow
                key={c.id}
                channel={c}
                members={members[c.id] ?? unavailable("Counting…")}
                messageCount={messageCounts[c.id] ?? null}
              />
            ))}
          </div>
        )}
      </div>

      {creating && (
        <NewChannelDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Archive — the whole lifecycle, because there is no delete                   */
/* -------------------------------------------------------------------------- */

function ArchiveChannelDialog({
  channel,
  onClose,
  onArchived,
}: {
  channel: Channel;
  onClose: () => void;
  onArchived: () => void;
}) {
  const session = useSession();
  const { backend } = useOperator();
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!backend.archiveChannel) return;
    const res = await backend.archiveChannel(session, channel.id);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    onArchived();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Archive channel"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-ink">Archive “{channel.name}”?</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            It stops taking new messages from that moment. Everything already in it stays readable for
            everyone who joined, and it stays on this page marked as archived.
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            There is no way to delete a channel and there will not be one. People joined this; a company
            that could make it vanish could make every promotional claim in it vanish too. Archiving is
            the honest version of being done with it.
          </p>
          {error && (
            <div className="mt-3">
              <Notice tone="rejected">{error}</Notice>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-3">
            <Button variant="danger" onClick={() => void confirm()}>
              <Archive size={13} aria-hidden /> Archive channel
            </Button>
            <Button onClick={onClose}>Keep it open</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Delete one message — the only correction there is                           */
/* -------------------------------------------------------------------------- */

/**
 * DELETE, AND NO EDIT BESIDE IT. The table carries no UPDATE policy and the
 * adapter has no edit method, so there is nothing here to wire one to. Delete
 * and repost is the honest correction precisely because it resets the view
 * count along with the wording.
 */
function DeleteMessageDialog({
  message,
  onClose,
  onDeleted,
}: {
  message: ChannelMessage;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const session = useSession();
  const { backend } = useOperator();
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!backend.deleteChannelMessage) return;
    const res = await backend.deleteChannelMessage(session, message.id);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    onDeleted();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Delete message"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-ink">Delete this message?</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            It comes out of the channel for everyone who joined, and its view count goes with it. A
            message cannot be edited — correcting one means deleting it and sending the new wording, so
            the count always belongs to the words people actually read.
          </p>
          <p className="mt-2 rounded-tile bg-canvas px-3 py-2 text-[12px] leading-snug text-muted">
            “{message.body.length > 140 ? `${message.body.slice(0, 140)}…` : message.body}”
          </p>
          {error && (
            <div className="mt-3">
              <Notice tone="rejected">{error}</Notice>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-3">
            <Button variant="danger" onClick={() => void confirm()}>
              <Trash2 size={13} aria-hidden /> Delete message
            </Button>
            <Button onClick={onClose}>Keep it</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The composer                                                               */
/* -------------------------------------------------------------------------- */

/**
 * THE ONLY WRITE PATH ONTO A CHANNEL — there is no member-facing one to sit
 * beside it, here or in the adapter, and no attach control of any kind.
 *
 * The departure Listbox appears only once a trip is chosen. That is the
 * migration's `channel_messages_departure_needs_product` constraint made
 * VISIBLE rather than validated late: the invalid pair is not a refusal
 * somebody has to read, it is a sentence this form cannot say.
 */
function Composer({ channel, onSent }: { channel: Channel; onSent: () => void }) {
  const session = useSession();
  const { backend } = useOperator();
  const [body, setBody] = useState("");
  const [productId, setProductId] = useState<string | null>(null);
  const [departureId, setDepartureId] = useState<string>("");
  const [promoNote, setPromoNote] = useState("");
  const [message, setMessage] = useState<{ tone: "neutral" | "rejected"; text: string } | null>(null);

  const archived = channel.archivedAt !== null;

  const products = useAsync(() => backend.getProducts(session), [session], [] as Product[]);
  const departures = useAsync(
    () => (productId ? backend.getDepartures(session, productId) : Promise.resolve<ProductDeparture[]>([])),
    [session, productId],
    [] as ProductDeparture[],
  );

  /*
   * LIVE TRIPS ONLY, and the field says why. Broadcasting a draft sends every
   * member to a page they cannot open; the adapter refuses one, and offering
   * it here would be an invitation to read that refusal.
   */
  const liveProducts = products.filter((p) => p.status === "live");
  const productOptions: ListboxOption[] = liveProducts.map((p) => ({ value: p.id, label: p.name }));
  const departureOptions: ListboxOption[] = [
    { value: "", label: "The trip in general", hint: "No particular departure" },
    ...departures.map((d) => ({
      value: d.id,
      label: formatDay(d.departureDate),
      hint: d.endDate ? `to ${formatDay(d.endDate)}` : undefined,
    })),
  ];

  const contactHits = findContactDetails(`${body}\n${promoNote}`);

  const send = async () => {
    if (!backend.postChannelMessage) return;
    const res = await backend.postChannelMessage(session, channel.id, {
      body,
      promotion: productId ? { productId, departureId: departureId || null } : null,
      promoNote,
    });
    if (!res.ok) {
      // The refusal reaches the operator verbatim, never swallowed.
      setMessage({ tone: "rejected", text: res.reason });
      return;
    }
    setBody("");
    setProductId(null);
    setDepartureId("");
    setPromoNote("");
    setMessage({
      tone: "neutral",
      text: "Sent. Everyone who joined this channel can read it now, and the view count starts at zero until somebody opens it.",
    });
    onSent();
  };

  return (
    <Card className="p-4">
      <SectionHeading
        title="Send to this channel"
        detail="Every member reads it. Nobody can reply, and nothing here can be edited afterwards."
      />

      <textarea
        className={`${inputClass} min-h-[92px] resize-y`}
        placeholder="Departure news, remaining places, terms worth knowing about…"
        value={body}
        maxLength={BODY_MAX}
        onChange={(e) => {
          setBody(e.target.value);
          setMessage(null);
        }}
      />
      <div className="tnum mt-1 text-right text-[11px] text-faint">
        {body.trim().length} / {BODY_MAX}
      </div>

      {contactHits.length > 0 && (
        <div className="mt-3">
          <Notice
            tone="rejected"
            title={`Remove ${[...new Set(contactHits.map((h) => h.label))].join(" and ")}`}
          >
            {OPERATOR_NOTICES.NO_CONTACT_DETAILS}
          </Notice>
        </div>
      )}

      {/* ---- Promote a trip, optional ---------------------------------------- */}
      <div className="mt-4 rounded-tile bg-canvas p-3">
        <div className="flex items-center gap-1.5">
          <Megaphone size={13} className="text-faint" aria-hidden />
          <h3 className="text-[12.5px] font-semibold text-ink">Promote a trip</h3>
          <Pill>Optional</Pill>
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-muted">
          Attaches one of your published trips so a member can see what you are talking about and enquire
          about it. An enquiry opens a normal conversation, which is where a price for one person belongs
          — a channel never carries a quote.
        </p>

        <div className="mt-3 space-y-3">
          {/*
            The kit's Listbox, NOT wrapped in ui.tsx's <label>-based Field: a
            click inside a label forwards to its first labelable control, which
            would re-toggle the trigger the moment an option is picked. The kit
            brings its own label; the hint keeps Field's styling, below it.
          */}
          <div>
            {liveProducts.length === 0 ? (
              <>
                <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Trip</span>
                <p className="text-[12px] leading-snug text-muted">
                  You have no published trips yet, so there is nothing to promote. The message sends on
                  its own.
                </p>
              </>
            ) : (
              <>
                <Listbox
                  label="Trip"
                  value={productId}
                  options={productOptions}
                  placeholder="No trip — just the message"
                  onChange={(v) => {
                    setProductId(v || null);
                    setDepartureId("");
                    setMessage(null);
                  }}
                />
                <span className="mt-1 block text-[11.5px] leading-snug text-muted">
                  Published trips only — a member would have nothing to open otherwise.
                </span>
              </>
            )}
          </div>

          {/*
           * ONLY ONCE A TRIP IS CHOSEN. A departure with no trip is not a thing
           * this form can express, which is the constraint made visible.
           */}
          {productId && (
            <div>
              <Listbox
                label="Departure"
                value={departureId}
                options={departureOptions}
                onChange={(v) => {
                  setDepartureId(v);
                  setMessage(null);
                }}
              />
              <span className="mt-1 block text-[11.5px] leading-snug text-muted">
                One dated departure of that trip, or the trip in general.
              </span>
            </div>
          )}

          <Field
            label="Terms, not a price"
            hint="Promotional terms in your own words — “deposit held until the end of September”. Every real figure lives on the trip itself, or in an offer you make inside a conversation."
          >
            <input
              className={inputClass}
              value={promoNote}
              maxLength={TEXT_MAX}
              placeholder="Deposit held until the end of September for anyone on this channel."
              onChange={(e) => {
                setPromoNote(e.target.value);
                setMessage(null);
              }}
            />
            <div className="tnum mt-1 text-right text-[11px] text-faint">
              {promoNote.trim().length} / {TEXT_MAX}
            </div>
          </Field>
        </div>
      </div>

      {message && (
        <div className="mt-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line-soft pt-3">
        <Button
          variant="primary"
          onClick={() => void send()}
          disabled={archived || body.trim().length === 0 || contactHits.length > 0}
        >
          Send to members
        </Button>
        {/*
         * THE REASON SITS AT THE CONTROL. A disabled button with its
         * explanation somewhere else reads as "not built yet" and invites the
         * next person to finish it; this one is not unfinished, it is closed.
         */}
        <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-muted">
          {archived
            ? ARCHIVED_REASON
            : "It goes out the moment you send it — there is no review step and no way to edit it afterwards."}
        </p>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* One message                                                                */
/* -------------------------------------------------------------------------- */

/**
 * THE VIEW COUNT IS THE POINT OF THE ROW, not a footnote on it, so it sits in
 * its own column and is the largest thing in the row after the words.
 *
 * IT IS TEXT, NEVER A CONTROL. Not clickable, not hoverable, with no member
 * list beside it — a count that behaves like an affordance implies a drill-down
 * that must never exist. `getChannelMessageStats` hands this component a number
 * and no identity at all, so there is nothing behind it to open.
 */
function MessageRow({
  message,
  views,
  product,
  departure,
  onAskDelete,
}: {
  message: ChannelMessage;
  views: number | null;
  product: Product | null;
  departure: ProductDeparture | null;
  onAskDelete: (m: ChannelMessage) => void;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-[16rem] flex-1">
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{message.body}</p>

          {product && (
            <div className="mt-3 rounded-tile bg-canvas px-3 py-2">
              <div className="lbl">Promoting</div>
              <Link
                to={`/operator/products/${product.id}`}
                className="mt-0.5 block text-[12.5px] font-medium text-azure-ink hover:underline"
              >
                {product.name}
              </Link>
              {departure && (
                <div className="tnum mt-0.5 text-[12px] text-muted">
                  Departing {formatDay(departure.departureDate)}
                  {departure.endDate ? ` – ${formatDay(departure.endDate)}` : ""}
                </div>
              )}
              {message.promoNote && (
                <div className="mt-1.5">
                  <div className="lbl">Terms</div>
                  {/* Words, never money. Nothing here is formatted as a figure. */}
                  <p className="mt-0.5 text-[12px] leading-snug text-muted">{message.promoNote}</p>
                </div>
              )}
            </div>
          )}

          {!product && message.promoNote && (
            <div className="mt-3 rounded-tile bg-canvas px-3 py-2">
              <div className="lbl">Terms</div>
              <p className="mt-0.5 text-[12px] leading-snug text-muted">{message.promoNote}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
            <span>{message.authorName}</span>
            <span aria-hidden>·</span>
            <span>{timeAgo(message.createdAt, NOW)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-4">
          <div className="text-right">
            {views === null ? (
              <span className="text-[12px] text-muted">Counting…</span>
            ) : (
              <>
                <div className="ser tnum text-[26px] leading-none text-ink">
                  {views.toLocaleString("en-GB")}
                </div>
                <div className="lbl mt-1">{viewsLabel(views)}</div>
              </>
            )}
          </div>
          <Button variant="quiet" onClick={() => onAskDelete(message)} title="Delete this message">
            <Trash2 size={13} aria-hidden />
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* One channel                                                                */
/* -------------------------------------------------------------------------- */

export function ChannelDetail() {
  const { id = "" } = useParams();
  const session = useSession();
  const { backend, revision, refresh } = useOperator();
  const available = useChannelsAvailable();
  const [archiving, setArchiving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChannelMessage | null>(null);

  const channels = useAsync(
    () => (backend.getChannels ? backend.getChannels(session) : Promise.resolve<Channel[]>([])),
    [session, revision],
    [] as Channel[],
  );
  const messages = useAsync(
    () =>
      backend.getChannelMessages
        ? backend.getChannelMessages(session, id)
        : Promise.resolve<ChannelMessage[]>([]),
    [session, revision, id],
    [] as ChannelMessage[],
  );
  /*
   * A MESSAGE ID AND A NUMBER. Nothing else arrives here — no profile id, no
   * name, no viewed-at — so a "who viewed" control could not be built against
   * this state even by someone who tried.
   */
  const stats = useAsync<Record<string, number> | null>(
    async () => {
      if (!backend.getChannelMessageStats) return null;
      const rows = await backend.getChannelMessageStats(session, id);
      return Object.fromEntries(rows.map((r) => [r.messageId, r.views]));
    },
    [session, revision, id],
    null,
  );
  const members = useAsync(
    () =>
      backend.getChannelMemberCount
        ? backend.getChannelMemberCount(session, id)
        : Promise.resolve(unavailable("This build has no membership data.")),
    [session, revision, id],
    unavailable("Counting…") as Reading<number>,
  );
  const products = useAsync(() => backend.getProducts(session), [session, revision], [] as Product[]);
  const departures = useAsync(
    async () => {
      const ids = [...new Set(messages.map((m) => m.departureId).filter((d): d is string => d !== null))];
      if (ids.length === 0) return [] as ProductDeparture[];
      const productIds = [...new Set(messages.filter((m) => m.departureId).map((m) => m.productId!))];
      const lists = await Promise.all(productIds.map((p) => backend.getDepartures(session, p)));
      return lists.flat().filter((d) => ids.includes(d.id));
    },
    [session, revision, messages],
    [] as ProductDeparture[],
  );

  if (!available) return <Unavailable />;

  const channel = channels.find((c) => c.id === id) ?? null;
  if (channels.length === 0) return null;
  if (!channel) {
    return (
      <EmptyState
        title="No such channel"
        detail="This channel is not one of your company's. Channels are visible only to the company that opened them."
      />
    );
  }

  const archived = channel.archivedAt !== null;

  return (
    <div>
      <Link
        to="/operator/channels"
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"
      >
        <ArrowLeft size={13} aria-hidden /> All channels
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="ser text-[27px] leading-tight text-ink">{channel.name}</h1>
            {archived && <StatusChip status="archived" />}
          </div>
          {channel.description && (
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{channel.description}</p>
          )}
          {archived && channel.archivedAt && (
            <p className="mt-1.5 text-[12px] text-faint">
              Archived {formatDay(channel.archivedAt.slice(0, 10))}. It takes no new messages and stays
              readable for everyone who joined.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-start gap-6">
          <div className="text-right">
            <div className="lbl">Members</div>
            <div className="mt-1.5">
              <Figure reading={members} format={(n) => n.toLocaleString("en-GB")} size="sm" />
            </div>
            <p className="mt-1 max-w-[18ch] text-[11px] leading-snug text-faint">
              Climbers who joined themselves. You cannot add anyone.
            </p>
          </div>
          {!archived && (
            <Button onClick={() => setArchiving(true)}>
              <Archive size={13} aria-hidden /> Archive
            </Button>
          )}
        </div>
      </header>

      <div className="space-y-4">
        <HowAChannelWorks />

        <Composer channel={channel} onSent={refresh} />

        <div>
          <SectionHeading
            title="Messages"
            detail="Newest first, the way a member reads them. The figure beside each one is how many different people opened it — counted, one person per message however often they re-read it, not estimated."
          />
          {messages.length === 0 ? (
            <EmptyState
              title="Nothing sent yet"
              detail={
                archived
                  ? "This channel was archived before anything was sent to it."
                  : "Your first message appears here, and in the channel for everyone who joined it."
              }
            />
          ) : (
            <div className="space-y-2.5">
              {messages.map((m) => (
                <MessageRow
                  key={m.id}
                  message={m}
                  views={stats === null ? null : (stats[m.id] ?? null)}
                  product={products.find((p) => p.id === m.productId) ?? null}
                  departure={departures.find((d) => d.id === m.departureId) ?? null}
                  onAskDelete={setDeleteTarget}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {archiving && (
        <ArchiveChannelDialog
          channel={channel}
          onClose={() => setArchiving(false)}
          onArchived={() => {
            setArchiving(false);
            refresh();
          }}
        />
      )}
      {deleteTarget && (
        <DeleteMessageDialog
          message={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
