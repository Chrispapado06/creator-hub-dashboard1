import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff, Eye, Loader2, Megaphone } from "lucide-react";

import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { fmtRelative } from "@/lib/format";
import {
  joinChannel,
  leaveChannel,
  readChannelMessages,
  recordChannelView,
  setChannelMuted,
  useCompanyChannels,
} from "@/channels/store";
import {
  CHANNELS_NOT_CONNECTED,
  CHANNEL_ONE_WAY_NOTICE,
  type Channel,
  type ChannelMessage,
} from "@/channels/types";

/**
 * A COMPANY'S CHANNELS, on their profile.
 *
 * The owner's ask: "expedition companies have like a Channel where they add
 * promotional content that users can join if they want where the company can
 * send offers etc but can't reply to the chat + add how many people viewed the
 * message". This is the climber's half of that.
 *
 * THERE IS NO REPLY CONTROL ANYWHERE BELOW, and its absence is stated rather
 * than left to look unfinished — see `CHANNEL_ONE_WAY_NOTICE`. The guide
 * session's lesson: a disabled control reads as "not built yet" and invites the
 * next person to wire it up as a kindness.
 */
export function CompanyChannels({ companyId }: { companyId: string | undefined }) {
  const { feed, reload } = useCompanyChannels(companyId);

  if (feed.status === "loading") {
    return (
      <Card>
        <p className="text-[13px] text-mist-dim">Loading channels…</p>
      </Card>
    );
  }

  /* Signed-out and not-connected are DIFFERENT and say so. One is fixed by
     signing in; the other is a build with no server behind it. */
  if (feed.status !== "ready") {
    return (
      <Card>
        <p className="text-[13px] leading-relaxed text-mist">
          {feed.status === "signed-out"
            ? "Sign in to see this company's channels. Joining one is a membership held against your account, so it has to know who you are."
            : feed.status === "unreachable"
              ? "ICEFALL could not reach the server, so the channel list did not load. This says nothing about whether the company has one."
              : CHANNELS_NOT_CONNECTED}
        </p>
      </Card>
    );
  }

  if (feed.channels.length === 0) {
    return (
      <Card>
        <p className="text-[13px] leading-relaxed text-mist">
          This company has no channel. A channel is where a company posts promotions to the people
          who chose to follow them.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {feed.channels.map((c) => (
        <ChannelCard key={c.id} channel={c} onChanged={reload} />
      ))}
      <Disclaimer>{CHANNEL_ONE_WAY_NOTICE}</Disclaimer>
    </div>
  );
}

function ChannelCard({ channel, onChanged }: { channel: Channel; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const archived = channel.archivedAt !== null;

  return (
    <Card inset={false} className="overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-tile border border-hairline bg-elevated/40 text-azure">
          <Megaphone size={17} strokeWidth={1.6} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] text-snow">{channel.name}</p>
          {channel.description && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-mist">{channel.description}</p>
          )}
          {archived && (
            <p className="mt-1.5 text-[11.5px] text-mist-dim">
              Archived — no new messages. Everything already posted stays readable.
            </p>
          )}
        </div>

        {/* Muting is the MEMBER's own switch. A company cannot mute anybody, and
            cannot add anybody either — you join yourself, you leave yourself. */}
        {channel.joined && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await setChannelMuted(channel.id, !channel.muted);
              setBusy(false);
              onChanged();
            }}
            aria-label={channel.muted ? "Unmute this channel" : "Mute this channel"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline text-mist transition-colors hover:text-snow"
          >
            {channel.muted ? <BellOff size={15} strokeWidth={1.7} /> : <Bell size={15} strokeWidth={1.7} />}
          </button>
        )}

        <Button
          size="sm"
          variant={channel.joined ? "secondary" : "primary"}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (channel.joined) await leaveChannel(channel.id);
            else await joinChannel(channel.id);
            setBusy(false);
            onChanged();
          }}
        >
          {busy ? "…" : channel.joined ? "Leave" : "Join"}
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full border-t border-hairline px-4 py-2.5 text-left text-[12.5px] text-azure transition-colors hover:text-azure-bright"
      >
        {open ? "Hide messages" : "Read messages"}
      </button>

      {open && <ChannelMessages channelId={channel.id} />}
    </Card>
  );
}

function ChannelMessages({ channelId }: { channelId: string }) {
  const [messages, setMessages] = useState<ChannelMessage[] | null | "error">(null);

  useEffect(() => {
    let alive = true;
    void readChannelMessages(channelId).then((rows) => {
      if (alive) setMessages(rows ?? "error");
    });
    return () => {
      alive = false;
    };
  }, [channelId]);

  if (messages === null) {
    return (
      <div className="grid place-items-center border-t border-hairline py-6">
        <Loader2 size={15} className="animate-spin text-mist-dim" />
      </div>
    );
  }

  if (messages === "error") {
    return (
      <p className="border-t border-hairline px-4 py-4 text-[12.5px] leading-relaxed text-mist">
        The messages did not load. That is a connection problem, not an empty channel.
      </p>
    );
  }

  if (messages.length === 0) {
    return (
      <p className="border-t border-hairline px-4 py-4 text-[12.5px] text-mist">
        Nothing posted yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-hairline border-t border-hairline">
      {messages.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
    </div>
  );
}

/**
 * One broadcast — and the one place a view is recorded.
 *
 * A VIEW IS RECORDED WHEN THE MESSAGE IS GENUINELY ON SCREEN, not when the row
 * mounts. A list that counted on render would count every message below the
 * fold the moment the channel opened, and the count is the single number this
 * feature exists to show. `IntersectionObserver` with a real threshold is the
 * difference between a measured fact and a fabricated one.
 *
 * Recorded once per person per message — the table's key enforces that, so the
 * `sent` ref here is only to save a needless request.
 */
function MessageRow({ message }: { message: ChannelMessage }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || sent.current) return;

    // No IntersectionObserver (old webview): record nothing rather than guess.
    // An uncounted view is a smaller lie than an invented one.
    if (typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting || sent.current) continue;
          sent.current = true;
          io.disconnect();
          void recordChannelView(message.id);
        }
      },
      // Half the row visible: enough that it was actually read past, not a
      // pixel clipping into view during a fast scroll.
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [message.id]);

  const when = useMemo(() => fmtRelative(message.createdAt), [message.createdAt]);

  return (
    <div ref={ref} className="px-4 py-4">
      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-snow">{message.body}</p>

      {/* A PRODUCT PROMOTION, never an offer — an offer needs a thread and one
          named recipient, so a broadcast cannot be one, and showing one would
          leak the best price this company ever privately quoted. Someone who
          wants it enquires, and the offer happens there. */}
      {message.promotion && (
        <div className="mt-3 rounded-tile border border-hairline bg-white/[0.015] p-3">
          <SectionLabel>Promoted trip</SectionLabel>
          {message.promotion.promoNote && (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">
              {message.promotion.promoNote}
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
            Terms in the company's words. Any price is on the trip itself — ask them for a quote
            and it arrives as an offer in your messages.
          </p>
        </div>
      )}

      <p className="mt-3 flex items-center gap-3 text-[11.5px] text-mist-dim">
        <span className="tnum">{when}</span>
        {/*
         * PLAIN TEXT, NEVER A CONTROL. A view count that can be tapped or
         * hovered implies a "who viewed" behind it, and that must never exist —
         * the company can read the total and nothing else. Nothing here is
         * focusable and the number arrives with no identity attached to it.
         *
         * `null` is "the count did not arrive" and prints nothing. A real zero
         * prints "0 views", because a measured zero is a fact.
         */}
        {message.views !== null && (
          <span className="tnum flex items-center gap-1.5">
            <Eye size={12} strokeWidth={1.7} aria-hidden />
            {message.views} {message.views === 1 ? "view" : "views"}
          </span>
        )}
      </p>
    </div>
  );
}
