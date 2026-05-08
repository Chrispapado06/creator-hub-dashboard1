// /chat — agency-wide team chat.
//
// Three-column layout on desktop (channel list / message pane / details
// panel placeholder), single-pane stack on mobile. Real-time updates
// come from Supabase Realtime postgres-changes subscriptions, scoped
// per active channel so we don't get firehose noise.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Hash, Lock, Megaphone, Users as UsersIcon, MessageCircle, Plus,
  Send, Paperclip, Smile, Search, ArrowLeft, ChevronRight,
  Check, X, Edit2, Trash2, AlertCircle,
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from "date-fns";
import {
  ensureCurrentChatUser, listChannelsForUser, listMessages, sendMessage,
  markChannelRead, ensureCreatorChannels, ensureDmChannel, createChannel,
  extractMentions, resolveMentions, uploadChatAttachment,
  hasBroadcastMention, expandBroadcastMention,
  type Channel, type Message, type ChatUser, type Attachment,
} from "@/lib/chat";

export const Route = createFileRoute("/chat")({ component: ChatPage });

type ChannelWithMeta = Channel & {
  unread_count: number;
  is_member: boolean;
  dm_partner?: { id: string; name: string } | null;
};

function ChatPage() {
  const [user, setUser] = useState<ChatUser | null>(null);
  const [channels, setChannels] = useState<ChannelWithMeta[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showStartDm, setShowStartDm] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mobile UX: when a channel is active, hide the sidebar; back button
  // returns to the list. Tracked separately from desktop so resizing
  // doesn't lose state.
  const [mobileShowSidebar, setMobileShowSidebar] = useState(true);

  // ── Initial load ────────────────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      const u = await ensureCurrentChatUser();
      if (!u) {
        toast.error("Couldn't load your chat profile.");
        return;
      }
      setUser(u);
      // Side-effect on first load: make sure per-creator channels exist
      await ensureCreatorChannels();
      const list = await listChannelsForUser(u.id);
      setChannels(list);
      setLoadingChannels(false);
      // Default to #general if nothing else picked
      const general = list.find((c) => c.slug === "general") ?? list[0];
      if (general) setActiveChannelId(general.id);
    })();
  }, []);

  // ── Load messages whenever the active channel changes ──────────────

  useEffect(() => {
    if (!activeChannelId || !user) return;
    let cancelled = false;
    setLoadingMessages(true);
    void (async () => {
      const list = await listMessages(activeChannelId);
      if (cancelled) return;
      setMessages(list);
      setLoadingMessages(false);
      // Mark channel read after the load finishes so unread count clears
      void markChannelRead(activeChannelId, user.id).then(() => {
        setChannels((prev) =>
          prev.map((c) => (c.id === activeChannelId ? { ...c, unread_count: 0 } : c)),
        );
      });
    })();
    return () => { cancelled = true; };
  }, [activeChannelId, user]);

  // ── Real-time subscription, scoped to the active channel ────────────

  useEffect(() => {
    if (!activeChannelId) return;
    const sub = supabase
      .channel(`chat-${activeChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "team_messages",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => {
            // Dedupe in case the optimistic insert already added this
            if (prev.some((p) => p.id === m.id)) return prev;
            return [...prev, m];
          });
          // Mark read on incoming because the user is actively viewing
          if (user) void markChannelRead(activeChannelId, user.id);
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(sub); };
  }, [activeChannelId, user]);

  // Also subscribe to ALL message inserts to bump unread counts for
  // non-active channels in the sidebar.
  useEffect(() => {
    if (!user) return;
    const sub = supabase
      .channel(`chat-side-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "team_messages" },
        (payload) => {
          const m = payload.new as Message;
          if (m.channel_id === activeChannelId) return; // already handled
          setChannels((prev) =>
            prev.map((c) =>
              c.id === m.channel_id
                ? {
                    ...c,
                    unread_count: c.unread_count + 1,
                    last_message_at: m.created_at,
                    last_message_preview: (m.content ?? "").slice(0, 120),
                  }
                : c,
            ),
          );
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(sub); };
  }, [user, activeChannelId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Filtering for the channel sidebar ──────────────────────────────

  const filteredChannels = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.dm_partner?.name ?? "").toLowerCase().includes(q),
    );
  }, [channels, search]);

  const grouped = useMemo(() => {
    const channelsList: ChannelWithMeta[] = [];
    const dmsList: ChannelWithMeta[] = [];
    const creatorRooms: ChannelWithMeta[] = [];
    for (const c of filteredChannels) {
      if (c.type === "dm") dmsList.push(c);
      else if (c.type === "creator") creatorRooms.push(c);
      else channelsList.push(c);
    }
    return { channelsList, dmsList, creatorRooms };
  }, [filteredChannels]);

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;

  // ── Compose handlers ────────────────────────────────────────────────

  const onSend = async () => {
    if (!user || !activeChannelId) return;
    if (!draft.trim() && pendingAttachments.length === 0) return;
    if (activeChannel?.read_only_for_staff && !user.is_admin) {
      toast.error("Only admins can post in this channel.");
      return;
    }
    setSending(true);
    const handles = extractMentions(draft);
    // Two paths converge into the same mention list sent to the DB:
    //   • direct @username mentions → resolveMentions
    //   • broadcast @everyone / @all / @here → expand to every active
    //     chatter (or every channel member for @here)
    // Authors are excluded from broadcast fan-out so you don't notify
    // yourself when posting an announcement.
    const directIds = handles.length > 0 ? await resolveMentions(handles) : [];
    const broadcastIds = hasBroadcastMention(handles)
      ? await expandBroadcastMention(handles, activeChannelId, user.id)
      : [];
    const mentionedIds = [...new Set([...directIds, ...broadcastIds])];
    const sent = await sendMessage({
      channelId: activeChannelId,
      author: user,
      content: draft,
      attachments: pendingAttachments,
      mentionedChatterIds: mentionedIds,
    });
    if (sent) {
      // Realtime will append it, but optimistic add covers slow networks
      setMessages((prev) => prev.some((p) => p.id === sent.id) ? prev : [...prev, sent]);
      setDraft("");
      setPendingAttachments([]);
    } else {
      toast.error("Send failed");
    }
    setSending(false);
  };

  const onAttach = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Files must be 25 MB or smaller");
      return;
    }
    setUploading(true);
    const att = await uploadChatAttachment(file);
    setUploading(false);
    if (!att) {
      toast.error("Upload failed");
      return;
    }
    setPendingAttachments((prev) => [...prev, att]);
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-sm text-muted-foreground">
        <div className="animate-pulse">Loading chat…</div>
      </div>
    );
  }

  return (
    {/* flex-1 + min-h-0 lets the chat fill naturally inside the
        staff layout (which is flex-col); the h-calc is a fallback
        for admin where the parent isn't a flex column. Negative
        margins cancel the admin page-container padding so the chat
        goes edge-to-edge there. */}
    <div className="flex-1 min-h-0 -mx-4 sm:-mx-8 -mt-10 -mb-10 h-[calc(100vh-4rem)] flex bg-background">
      <Toaster />

      {/* Sidebar */}
      <aside
        className={`w-full sm:w-72 lg:w-80 shrink-0 border-r border-border bg-card/40 flex flex-col ${
          mobileShowSidebar ? "flex" : "hidden sm:flex"
        }`}
      >
        <div className="px-4 py-3 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" /> Team Chat
            </h1>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowStartDm(true)} title="Start DM">
                <UsersIcon className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowCreateChannel(true)} title="New channel">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search channels…"
              className="pl-7 h-8 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-3">
          {loadingChannels ? (
            <div className="px-4 py-6 text-xs text-muted-foreground italic">Loading channels…</div>
          ) : (
            <>
              <ChannelGroup label="Channels" channels={grouped.channelsList} activeId={activeChannelId} onPick={(id) => { setActiveChannelId(id); setMobileShowSidebar(false); }} userIsAdmin={user.is_admin} />
              {grouped.creatorRooms.length > 0 && (
                <ChannelGroup label="Creators" channels={grouped.creatorRooms} activeId={activeChannelId} onPick={(id) => { setActiveChannelId(id); setMobileShowSidebar(false); }} userIsAdmin={user.is_admin} />
              )}
              <ChannelGroup label="Direct messages" channels={grouped.dmsList} activeId={activeChannelId} onPick={(id) => { setActiveChannelId(id); setMobileShowSidebar(false); }} userIsAdmin={user.is_admin} />
            </>
          )}
        </div>

        <div className="border-t border-border px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center font-semibold text-foreground">
            {user.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-foreground truncate">{user.name}</div>
            <div className="text-[10px] text-muted-foreground truncate">{user.is_admin ? "Admin" : (user.role ?? "Staff")}</div>
          </div>
        </div>
      </aside>

      {/* Message pane */}
      <main className={`flex-1 flex flex-col ${mobileShowSidebar ? "hidden sm:flex" : "flex"}`}>
        {!activeChannel ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Pick a channel to start chatting.
          </div>
        ) : (
          <>
            {/* Channel header */}
            <header className="border-b border-border px-4 py-3 flex items-center gap-2.5 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 sm:hidden"
                onClick={() => setMobileShowSidebar(true)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <ChannelIcon channel={activeChannel} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">
                  {activeChannel.type === "dm"
                    ? (activeChannel.dm_partner?.name ?? "Direct message")
                    : activeChannel.name}
                </div>
                {activeChannel.description && (
                  <div className="text-[11px] text-muted-foreground truncate">{activeChannel.description}</div>
                )}
              </div>
              {activeChannel.read_only_for_staff && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  Admin-only post
                </span>
              )}
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {loadingMessages ? (
                <div className="text-xs text-muted-foreground italic py-4">Loading messages…</div>
              ) : messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <MessageCircle className="h-8 w-8 mb-2 opacity-40" />
                  <div className="text-sm font-medium">No messages yet</div>
                  <div className="text-xs">Be the first to say something.</div>
                </div>
              ) : (
                <MessageList messages={messages} currentUserId={user.id} />
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <Composer
              draft={draft}
              setDraft={setDraft}
              pendingAttachments={pendingAttachments}
              setPendingAttachments={setPendingAttachments}
              uploading={uploading}
              sending={sending}
              onSend={onSend}
              onAttach={onAttach}
              disabled={!!activeChannel.read_only_for_staff && !user.is_admin}
              disabledHint={
                activeChannel.read_only_for_staff && !user.is_admin
                  ? "Only admins can post in #announcements."
                  : undefined
              }
            />
          </>
        )}
      </main>

      {showCreateChannel && (
        <CreateChannelDialog
          onClose={() => setShowCreateChannel(false)}
          onCreated={async (id) => {
            const list = await listChannelsForUser(user.id);
            setChannels(list);
            setActiveChannelId(id);
            setShowCreateChannel(false);
          }}
          createdBy={user.id}
        />
      )}
      {showStartDm && (
        <StartDmDialog
          meId={user.id}
          onClose={() => setShowStartDm(false)}
          onStarted={async (channelId) => {
            const list = await listChannelsForUser(user.id);
            setChannels(list);
            setActiveChannelId(channelId);
            setShowStartDm(false);
            setMobileShowSidebar(false);
          }}
        />
      )}
    </div>
  );
}

// ── Channel sidebar ─────────────────────────────────────────────────────

function ChannelGroup({
  label, channels, activeId, onPick, userIsAdmin: _userIsAdmin,
}: {
  label: string;
  channels: ChannelWithMeta[];
  activeId: string | null;
  onPick: (id: string) => void;
  userIsAdmin: boolean;
}) {
  if (channels.length === 0) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold px-4 mb-1.5">
        {label}
      </div>
      {channels.map((c) => (
        <button
          key={c.id}
          onClick={() => onPick(c.id)}
          className={`group w-full flex items-center gap-2 px-4 py-1.5 text-sm transition-colors ${
            activeId === c.id
              ? "bg-primary/10 text-foreground border-l-2 border-primary"
              : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground border-l-2 border-transparent"
          }`}
        >
          <ChannelIcon channel={c} small />
          <span className="truncate flex-1 text-left">
            {c.type === "dm" ? (c.dm_partner?.name ?? "DM") : c.name}
          </span>
          {c.unread_count > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground min-w-[18px] text-center">
              {c.unread_count > 99 ? "99+" : c.unread_count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function ChannelIcon({ channel, small }: { channel: ChannelWithMeta | Channel; small?: boolean }) {
  const cls = small ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0";
  switch (channel.type) {
    case "announcements": return <Megaphone className={`${cls} text-amber-400`} />;
    case "private":       return <Lock      className={cls} />;
    case "creator":       return <UsersIcon className={cls} />;
    case "dm":            return <MessageCircle className={cls} />;
    default:              return <Hash      className={cls} />;
  }
}

// ── Message list ─────────────────────────────────────────────────────────

function MessageList({
  messages, currentUserId,
}: {
  messages: Message[];
  currentUserId: string;
}) {
  // Group consecutive messages from the same author within 5 minutes
  const groups: Message[][] = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    const lastMsg = last?.[last.length - 1];
    const sameAuthor = lastMsg && lastMsg.author_chatter_id === m.author_chatter_id;
    const closeInTime = lastMsg
      && new Date(m.created_at).getTime() - new Date(lastMsg.created_at).getTime() < 5 * 60_000;
    if (sameAuthor && closeInTime) last.push(m);
    else groups.push([m]);
  }
  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <MessageGroup key={g[0].id} messages={g} mine={g[0].author_chatter_id === currentUserId} showDateHeader={i === 0 || !sameDay(groups[i - 1][0].created_at, g[0].created_at)} />
      ))}
    </div>
  );
}

function sameDay(a: string, b: string) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function MessageGroup({ messages, mine, showDateHeader }: { messages: Message[]; mine: boolean; showDateHeader: boolean }) {
  const first = messages[0];
  return (
    <>
      {showDateHeader && (
        <div className="flex items-center gap-2 my-2">
          <div className="flex-1 h-px bg-border" />
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {humanDate(first.created_at)}
          </div>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}
      <div className="flex gap-3">
        {/* Avatar (initials) */}
        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
          mine ? "bg-primary/20 text-primary" : "bg-secondary text-foreground"
        }`}>
          {(first.author_name || "??").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{first.author_name}</span>
            {first.author_role && (
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{first.author_role}</span>
            )}
            <span className="text-[10px] text-muted-foreground">{format(parseISO(first.created_at), "h:mm a")}</span>
          </div>
          <div className="space-y-1.5 mt-0.5">
            {messages.map((m) => <MessageRow key={m.id} message={m} />)}
          </div>
        </div>
      </div>
    </>
  );
}

function humanDate(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d, yyyy");
}

function MessageRow({ message }: { message: Message }) {
  return (
    <div>
      {message.content && (
        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          <RenderedContent content={message.content} />
          {message.edited_at && (
            <span className="text-[10px] text-muted-foreground/60 ml-1">(edited)</span>
          )}
        </div>
      )}
      {message.attachments.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {message.attachments.map((a, i) => <AttachmentPreview key={i} attachment={a} />)}
        </div>
      )}
    </div>
  );
}

function RenderedContent({ content }: { content: string }) {
  // Highlight @mentions and naive URL detection
  const parts: React.ReactNode[] = [];
  // First split by URL pattern
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(content)) !== null) {
    if (match.index > cursor) {
      parts.push(<MentionParts key={cursor} text={content.slice(cursor, match.index)} />);
    }
    parts.push(
      <a key={`url-${match.index}`} href={match[0]} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
        {match[0]}
      </a>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < content.length) {
    parts.push(<MentionParts key={cursor} text={content.slice(cursor)} />);
  }
  return <>{parts}</>;
}

// @everyone / @here / @all read as broadcasts — render with the
// amber tone Discord uses to signal "this hits the whole team."
const BROADCAST_HANDLES = new Set(["@everyone", "@here", "@all"]);

function MentionParts({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /@[A-Za-z0-9_-]{2,40}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    const isBroadcast = BROADCAST_HANDLES.has(match[0].toLowerCase());
    parts.push(
      <span
        key={match.index}
        className={
          isBroadcast
            ? "font-bold bg-amber-500/15 text-amber-400 px-1 rounded"
            : "text-primary font-medium bg-primary/10 px-1 rounded"
        }
      >
        {match[0]}
      </span>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const isImg = attachment.type.startsWith("image/");
  if (isImg) {
    return (
      <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={attachment.url}
          alt={attachment.name}
          className="max-h-64 rounded-lg border border-border"
        />
      </a>
    );
  }
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-secondary/40 hover:bg-secondary text-xs"
    >
      <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-medium">{attachment.name}</span>
      <span className="text-muted-foreground">{formatFileSize(attachment.size)}</span>
    </a>
  );
}

function formatFileSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// ── Composer ────────────────────────────────────────────────────────────

function Composer({
  draft, setDraft, pendingAttachments, setPendingAttachments,
  uploading, sending, onSend, onAttach,
  disabled, disabledHint,
}: {
  draft: string;
  setDraft: (s: string) => void;
  pendingAttachments: Attachment[];
  setPendingAttachments: (next: Attachment[]) => void;
  uploading: boolean;
  sending: boolean;
  onSend: () => void;
  onAttach: (file: File) => void;
  disabled: boolean;
  disabledHint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="border-t border-border px-3 py-3 shrink-0">
      {disabled && disabledHint && (
        <div className="mb-2 flex items-center gap-2 text-[11px] text-amber-400">
          <AlertCircle className="h-3 w-3" />
          {disabledHint}
        </div>
      )}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingAttachments.map((a, i) => (
            <div key={i} className="inline-flex items-center gap-2 px-2 py-1 bg-secondary/50 rounded-md text-xs">
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[140px] truncate">{a.name}</span>
              <button
                onClick={() => setPendingAttachments(pendingAttachments.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card focus-within:border-primary/40 transition-colors">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={disabled ? disabledHint ?? "Read-only channel" : "Type a message… Enter to send, Shift+Enter for newline"}
          rows={1}
          disabled={disabled}
          className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 pt-2 pb-1 shadow-none text-sm bg-transparent max-h-32"
        />
        <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5">
          <div className="flex items-center gap-1">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onAttach(f);
                e.target.value = "";
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={disabled || uploading}
              onClick={() => fileRef.current?.click()}
              title="Attach file"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button
            size="icon"
            disabled={disabled || sending || (!draft.trim() && pendingAttachments.length === 0)}
            onClick={onSend}
            className="h-7 w-7 rounded-full"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Create-channel dialog ───────────────────────────────────────────────

function CreateChannelDialog({
  onClose, onCreated, createdBy,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  createdBy: string;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"public" | "private">("public");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    const id = await createChannel({ name, type, description: description.trim() || undefined, createdBy });
    setBusy(false);
    if (id) {
      toast.success("Channel created");
      onCreated(id);
    } else {
      toast.error("Failed to create — try a different name");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Channel name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. wins" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Visibility</Label>
            <Select value={type} onValueChange={(v) => setType(v as "public" | "private")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public — visible to everyone</SelectItem>
                <SelectItem value="private">Private — invite only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What's this channel for?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Start-DM dialog ─────────────────────────────────────────────────────

function StartDmDialog({
  meId, onClose, onStarted,
}: {
  meId: string;
  onClose: () => void;
  onStarted: (channelId: string) => void;
}) {
  const [people, setPeople] = useState<{ id: string; name: string; role: string | null }[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from("chatters")
      .select("id, name, role")
      .neq("id", meId)
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setPeople(data ?? []));
  }, [meId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.name.toLowerCase().includes(q));
  }, [people, search]);

  const handleStart = async (otherId: string) => {
    setBusy(otherId);
    const id = await ensureDmChannel(meId, otherId);
    setBusy(null);
    if (id) onStarted(id);
    else toast.error("Couldn't start DM");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start a direct message</DialogTitle>
        </DialogHeader>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people…" autoFocus />
        <div className="max-h-72 overflow-y-auto -mx-1">
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-4 text-center">No matches.</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => handleStart(p.id)}
                disabled={busy === p.id}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/40 transition-colors text-left disabled:opacity-50"
              >
                <span className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-[11px] font-semibold">
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  {p.role && <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{p.role}</div>}
                </div>
                {busy === p.id && <span className="text-[11px] text-muted-foreground">Opening…</span>}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
