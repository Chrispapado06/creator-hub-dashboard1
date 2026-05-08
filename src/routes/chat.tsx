// /chat — agency-wide team chat.
//
// Three-column layout on desktop (channel list / message pane / details
// panel placeholder), single-pane stack on mobile. Real-time updates
// come from Supabase Realtime postgres-changes subscriptions, scoped
// per active channel so we don't get firehose noise.

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Check, X, Edit2, Trash2, AlertCircle, Volume2,
} from "lucide-react";
import { VoiceCallTray } from "@/components/VoiceCallTray";
import { VoiceJoinBar } from "@/components/VoiceJoinBar";
import {
  VoiceCallManager, listVoiceParticipants,
  type ParticipantRow as VoiceParticipantRow, type RemoteParticipant,
} from "@/lib/voice-call";
import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from "date-fns";
import {
  ensureCurrentChatUser, listChannelsForUser, listMessages, sendMessage,
  deleteMessage, markChannelRead, markAllMentionsRead,
  ensureCreatorChannels, ensureDmChannel, createChannel,
  extractMentions, resolveMentions, uploadChatAttachment,
  hasBroadcastMention, expandBroadcastMention,
  hasRoleMention, expandRoleMention, roleLabelFor,
  listCategories, createCategory, updateCategoryRoles, deleteCategory,
  CHATTER_ROLES,
  type Channel, type Message, type ChatUser, type Attachment, type Category,
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [showStartDm, setShowStartDm] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
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

  // ── Voice/video call state ────────────────────────────────────────
  // The manager survives channel switches so a user can keep talking
  // while reading another channel. Only one call at a time per tab.
  const voiceManagerRef = useRef<VoiceCallManager | null>(null);
  const [voiceActiveChannelId, setVoiceActiveChannelId] = useState<string | null>(null);
  const [voiceLocalStream, setVoiceLocalStream] = useState<MediaStream | null>(null);
  const [voiceRemotes, setVoiceRemotes] = useState<RemoteParticipant[]>([]);
  const [voiceJoining, setVoiceJoining] = useState(false);
  // Per-channel voice presence — drives the join-bar headcount and the
  // sidebar 🔊 N pill. Subscribed once below.
  const [voicePresence, setVoicePresence] = useState<Record<string, VoiceParticipantRow[]>>({});
  // chatter id → display name lookup, used to label voice tiles.
  const [chatterIndex, setChatterIndex] = useState<Record<string, { name: string }>>({});

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
      const [list, cats] = await Promise.all([
        listChannelsForUser(u.id, { user: u }),
        listCategories(),
      ]);
      setChannels(list);
      setCategories(cats);
      setLoadingChannels(false);
      // Restore the channel the user was on when they last left chat —
      // falls back to #general if the saved id is no longer visible
      // (deleted, role-gated out, etc.) or nothing's been saved yet.
      const lastId = typeof window !== "undefined"
        ? localStorage.getItem(`chat:lastChannel:${u.id}`)
        : null;
      const restored = lastId ? list.find((c) => c.id === lastId) : null;
      const general = restored ?? list.find((c) => c.slug === "general") ?? list[0];
      if (general) setActiveChannelId(general.id);
    })();
  }, []);

  // Persist the active channel any time it changes so a refresh keeps
  // the user where they were instead of bouncing back to #general.
  useEffect(() => {
    if (!user || !activeChannelId) return;
    try {
      localStorage.setItem(`chat:lastChannel:${user.id}`, activeChannelId);
    } catch { /* localStorage blocked, ignore */ }
  }, [user, activeChannelId]);

  // Clear ALL of the current user's unread mentions when /chat is open
  // and the tab is visible. The sidebar ping is meant to grab the
  // user's attention when they're elsewhere — once they're on the
  // chat page, that signal has done its job. Per-channel unread
  // pills are not affected — those still need a channel open to clear.
  useEffect(() => {
    if (!user) return;
    const clearMentions = () => {
      if (document.visibilityState !== "visible") return;
      void markAllMentionsRead(user.id);
    };
    clearMentions(); // run immediately on mount
    document.addEventListener("visibilitychange", clearMentions);
    return () => document.removeEventListener("visibilitychange", clearMentions);
  }, [user]);

  // Helper used by every "after the fact" mutation (create channel,
  // create/edit category, etc.) to re-pull both lists with the
  // current user's role gating applied.
  const refreshSidebar = useCallback(async () => {
    if (!user) return;
    const [list, cats] = await Promise.all([
      listChannelsForUser(user.id, { user }),
      listCategories(),
    ]);
    setChannels(list);
    setCategories(cats);
  }, [user]);

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
      // INSERT: new message → append to the list
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
            if (prev.some((p) => p.id === m.id)) return prev;
            return [...prev, m];
          });
          if (user) void markChannelRead(activeChannelId, user.id);
        },
      )
      // UPDATE: message edited or soft-deleted. If deleted_at is set,
      // drop it from the list immediately for every viewer. Otherwise
      // patch the row in place (reserved for future edit feature).
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "team_messages",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          if (updated.deleted_at) {
            setMessages((prev) => prev.filter((m) => m.id !== updated.id));
          } else {
            setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
          }
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

  // ── Voice presence: who's in voice on which channel ───────────────
  // One subscription, all channels. Drives both the per-channel "Join"
  // banner headcount and the sidebar 🔊 N pill. We pull a snapshot on
  // mount, then listen for INSERT/UPDATE/DELETE on the table.
  useEffect(() => {
    if (!user || channels.length === 0) return;
    let cancelled = false;
    const channelIds = channels.map((c) => c.id);
    void (async () => {
      const map = await listVoiceParticipants(channelIds);
      if (!cancelled) setVoicePresence(map);
    })();
    const sub = supabase
      .channel(`voice-presence-global-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_session_participants" },
        () => {
          // Cheap path: re-pull the whole snapshot. The table has at most
          // a handful of rows at any time (people in active calls), so a
          // re-read is fine and avoids hand-merging insert/update/delete.
          void (async () => {
            const map = await listVoiceParticipants(channelIds);
            setVoicePresence(map);
          })();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(sub);
    };
  }, [user, channels.length]);

  // ── Chatter id → name lookup, for voice tile labels ──────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("chatters").select("id, name");
      if (cancelled || !data) return;
      const map: Record<string, { name: string }> = {};
      for (const c of data) map[c.id as string] = { name: c.name as string };
      setChatterIndex(map);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Voice join/leave handlers ────────────────────────────────────
  const onJoinVoice = useCallback(async (channelId: string) => {
    if (!user) return;
    if (voiceManagerRef.current) {
      // Already in another channel's call — leave first.
      await voiceManagerRef.current.leave();
      voiceManagerRef.current = null;
      setVoiceLocalStream(null);
      setVoiceRemotes([]);
      setVoiceActiveChannelId(null);
    }
    setVoiceJoining(true);
    const mgr = new VoiceCallManager({
      channelId,
      chatterId: user.id,
      events: {
        onLocalStream: (s) => setVoiceLocalStream(s),
        onParticipantsChanged: (list) => setVoiceRemotes(list),
        onError: (msg) => toast.error(msg),
        onLeft: () => {
          setVoiceLocalStream(null);
          setVoiceRemotes([]);
          setVoiceActiveChannelId(null);
        },
      },
    });
    try {
      await mgr.join({ withVideo: false });
      voiceManagerRef.current = mgr;
      setVoiceActiveChannelId(channelId);
    } catch {
      // onError already toasted
      voiceManagerRef.current = null;
    } finally {
      setVoiceJoining(false);
    }
  }, [user]);

  const onLeaveVoice = useCallback(async () => {
    const mgr = voiceManagerRef.current;
    if (!mgr) return;
    await mgr.leave();
    voiceManagerRef.current = null;
  }, []);

  // Make sure we leave the call cleanly if the user closes the page.
  useEffect(() => {
    const handler = () => {
      const mgr = voiceManagerRef.current;
      if (mgr) void mgr.leave();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

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
    // Bucket layout matches the sidebar render order:
    //   • Top-level channels (no category, type !== dm/creator)
    //   • Categorized channels (one section per category)
    //   • Creators (per-creator auto-created channels)
    //   • Direct messages
    const topLevel: ChannelWithMeta[] = [];
    const dmsList: ChannelWithMeta[] = [];
    const creatorRooms: ChannelWithMeta[] = [];
    const byCategory = new Map<string, ChannelWithMeta[]>();
    for (const c of filteredChannels) {
      if (c.type === "dm") { dmsList.push(c); continue; }
      if (c.type === "creator") { creatorRooms.push(c); continue; }
      if (c.category_id) {
        const arr = byCategory.get(c.category_id) ?? [];
        arr.push(c);
        byCategory.set(c.category_id, arr);
      } else {
        topLevel.push(c);
      }
    }
    return { topLevel, dmsList, creatorRooms, byCategory };
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
    // Three resolution paths feed the same mention list:
    //   1. Direct @username        → resolveMentions
    //   2. Broadcast @everyone/all/here → expandBroadcastMention
    //   3. Role @rolename          → expandRoleMention (NEW)
    // Authors are excluded from any fan-out so you don't notify
    // yourself when posting an announcement.
    const [directIds, broadcastIds, roleIds] = await Promise.all([
      handles.length > 0 ? resolveMentions(handles) : Promise.resolve([]),
      hasBroadcastMention(handles) ? expandBroadcastMention(handles, activeChannelId, user.id) : Promise.resolve([]),
      hasRoleMention(handles) ? expandRoleMention(handles, user.id) : Promise.resolve([]),
    ]);
    const mentionedIds = [...new Set([...directIds, ...broadcastIds, ...roleIds])];
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

  // The wrapping container is provided by __root.tsx — this page
  // just fills it. flex-1 + min-h-0 = "take all available vertical
  // space". h-full = fallback when the parent isn't a flex column.
  // The admin layout strips its page padding for /chat (in __root)
  // so we don't need negative margins anymore — those used to
  // overlap the staff top nav and block clicks on it.
  return (
    <div className="flex-1 min-h-0 h-full w-full flex bg-background">
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
              {/* Top-level (no category) */}
              <ChannelGroup
                label="Channels"
                channels={grouped.topLevel}
                activeId={activeChannelId}
                onPick={(id) => { setActiveChannelId(id); setMobileShowSidebar(false); }}
                userIsAdmin={user.is_admin}
                voicePresence={voicePresence}
              />

              {/* Categorized channels — one section per category, only
                  rendered if at least one of its channels survived the
                  visibility filter. Admins also get an Edit-roles
                  shortcut on each category header. */}
              {categories
                .filter((cat) => (grouped.byCategory.get(cat.id) ?? []).length > 0)
                .map((cat) => (
                  <ChannelGroup
                    key={cat.id}
                    label={cat.name}
                    channels={grouped.byCategory.get(cat.id) ?? []}
                    activeId={activeChannelId}
                    onPick={(id) => { setActiveChannelId(id); setMobileShowSidebar(false); }}
                    userIsAdmin={user.is_admin}
                    onEditCategory={user.is_admin ? () => setEditCategory(cat) : undefined}
                    categoryRoles={cat.allowed_roles ?? null}
                  />
                ))}

              {grouped.creatorRooms.length > 0 && (
                <ChannelGroup
                  label="Creators"
                  channels={grouped.creatorRooms}
                  activeId={activeChannelId}
                  onPick={(id) => { setActiveChannelId(id); setMobileShowSidebar(false); }}
                  userIsAdmin={user.is_admin}
                />
              )}
              <ChannelGroup
                label="Direct messages"
                channels={grouped.dmsList}
                activeId={activeChannelId}
                onPick={(id) => { setActiveChannelId(id); setMobileShowSidebar(false); }}
                userIsAdmin={user.is_admin}
                voicePresence={voicePresence}
              />

              {user.is_admin && (
                <button
                  onClick={() => setShowCreateCategory(true)}
                  className="mx-2 mt-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/40 hover:text-foreground transition-colors"
                >
                  <Plus className="h-3 w-3" /> New category
                </button>
              )}
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

            {/* Voice join banner — only shown on channels the admin
                has explicitly marked as voice channels. Regular text
                channels stay text-only (no mic/camera prompts, no
                screen-share button). DMs never get a voice banner. */}
            {voiceActiveChannelId !== activeChannel.id
              && activeChannel.type !== "dm"
              && activeChannel.is_voice_channel && (
              <VoiceJoinBar
                channelName={activeChannel.name}
                participants={voicePresence[activeChannel.id] ?? []}
                chatterIndex={chatterIndex}
                joining={voiceJoining}
                onJoin={() => void onJoinVoice(activeChannel.id)}
              />
            )}

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
                <MessageList
                  messages={messages}
                  currentUserId={user.id}
                  onDeleteMessage={async (id) => {
                    if (!confirm("Delete this message? This can't be undone.")) return;
                    // Optimistic remove — realtime UPDATE will arrive
                    // shortly and confirm for everyone else.
                    setMessages((prev) => prev.filter((m) => m.id !== id));
                    const ok = await deleteMessage(id);
                    if (!ok) toast.error("Couldn't delete the message");
                  }}
                />
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Active voice call tray — appears above the composer when
                this user is in a voice channel. Survives switching to
                another channel; visible only on the channel they joined. */}
            {voiceActiveChannelId === activeChannel.id && voiceManagerRef.current && (
              <VoiceCallTray
                manager={voiceManagerRef.current}
                localStream={voiceLocalStream}
                participants={voiceRemotes}
                channelName={activeChannel.name}
                meName={user.name}
                meId={user.id}
                chatterIndex={chatterIndex}
                onLeave={() => void onLeaveVoice()}
              />
            )}

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
            await refreshSidebar();
            setActiveChannelId(id);
            setShowCreateChannel(false);
          }}
          createdBy={user.id}
          categories={categories}
        />
      )}
      {showCreateCategory && (
        <CategoryDialog
          mode="create"
          onClose={() => setShowCreateCategory(false)}
          onSaved={async () => { await refreshSidebar(); setShowCreateCategory(false); }}
          createdBy={user.id}
        />
      )}
      {editCategory && (
        <CategoryDialog
          mode="edit"
          category={editCategory}
          onClose={() => setEditCategory(null)}
          onSaved={async () => { await refreshSidebar(); setEditCategory(null); }}
          createdBy={user.id}
        />
      )}
      {showStartDm && (
        <StartDmDialog
          meId={user.id}
          onClose={() => setShowStartDm(false)}
          onStarted={async (channelId) => {
            await refreshSidebar();
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
  onEditCategory, categoryRoles, voicePresence,
}: {
  label: string;
  channels: ChannelWithMeta[];
  activeId: string | null;
  onPick: (id: string) => void;
  userIsAdmin: boolean;
  /** Optional edit shortcut shown on category headers (admin only). */
  onEditCategory?: () => void;
  /** Allowed roles for the category — drives the lock icon shown next
      to the header so admins can see at a glance which categories are
      gated. NULL/empty = visible to everyone (no lock). */
  categoryRoles?: string[] | null;
  /** Map of channel_id → array of currently-in-voice participants.
      Drives the 🔊 N pill on each channel row. Optional — defaults
      to no pills shown. */
  voicePresence?: Record<string, VoiceParticipantRow[]>;
}) {
  if (channels.length === 0) return null;
  const isLocked = !!(categoryRoles && categoryRoles.length > 0);
  return (
    <div className="space-y-0.5">
      <div className="group flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold px-4 mb-1.5">
        {isLocked && <Lock className="h-2.5 w-2.5 opacity-70" />}
        <span className="flex-1 truncate">{label}</span>
        {onEditCategory && (
          <button
            onClick={onEditCategory}
            className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
            title="Edit category access"
          >
            <Edit2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {channels.map((c) => {
        const inVoice = voicePresence?.[c.id]?.length ?? 0;
        return (
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
            {inVoice > 0 && (
              <span
                title={`${inVoice} in voice`}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 inline-flex items-center gap-0.5"
              >
                <Volume2 className="h-2.5 w-2.5" /> {inVoice}
              </span>
            )}
            {c.unread_count > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground min-w-[18px] text-center">
                {c.unread_count > 99 ? "99+" : c.unread_count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ChannelIcon({ channel, small }: { channel: ChannelWithMeta | Channel; small?: boolean }) {
  const cls = small ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0";
  // Voice channels visually trump every other type — the speaker icon
  // tells you at a glance that clicking joins a call, not a thread.
  if (channel.is_voice_channel) {
    return <Volume2 className={`${cls} text-emerald-400`} />;
  }
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
  messages, currentUserId, onDeleteMessage,
}: {
  messages: Message[];
  currentUserId: string;
  onDeleteMessage: (id: string) => void;
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
        <MessageGroup
          key={g[0].id}
          messages={g}
          mine={g[0].author_chatter_id === currentUserId}
          showDateHeader={i === 0 || !sameDay(groups[i - 1][0].created_at, g[0].created_at)}
          onDeleteMessage={onDeleteMessage}
        />
      ))}
    </div>
  );
}

function sameDay(a: string, b: string) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function MessageGroup({
  messages, mine, showDateHeader, onDeleteMessage,
}: {
  messages: Message[];
  mine: boolean;
  showDateHeader: boolean;
  onDeleteMessage: (id: string) => void;
}) {
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
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                canDelete={mine}
                onDelete={() => onDeleteMessage(m.id)}
              />
            ))}
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

function MessageRow({
  message, canDelete, onDelete,
}: {
  message: Message;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="group relative">
      {canDelete && (
        <button
          onClick={onDelete}
          aria-label="Delete message"
          title="Delete message"
          className="absolute -top-1.5 right-0 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-6 w-6 rounded-md bg-card border border-border text-muted-foreground hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/5"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
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
// @rolename (e.g. @RedditVA) renders with a violet pill so it's
// distinguishable from both broadcasts (amber) and direct user
// mentions (brand blue).
const BROADCAST_HANDLES = new Set(["@everyone", "@here", "@all"]);

function MentionParts({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const re = /@[A-Za-z0-9_-]{2,40}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    const handle = match[0];
    const isBroadcast = BROADCAST_HANDLES.has(handle.toLowerCase());
    const roleLabel = !isBroadcast ? roleLabelFor(handle.slice(1)) : null;
    let className = "text-primary font-medium bg-primary/10 px-1 rounded";
    let display: string = handle;
    if (isBroadcast) {
      className = "font-bold bg-amber-500/15 text-amber-400 px-1 rounded";
    } else if (roleLabel) {
      // Show the friendly label so the message reads "@Reddit VA"
      // instead of "@redditva" / "@reddit_va" / etc.
      className = "font-semibold bg-violet-500/15 text-violet-400 px-1 rounded";
      display = `@${roleLabel}`;
    }
    parts.push(
      <span key={match.index} className={className} title={isBroadcast ? "Notifies everyone" : roleLabel ? `Notifies all ${roleLabel}s` : undefined}>
        {display}
      </span>,
    );
    cursor = match.index + handle.length;
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
  onClose, onCreated, createdBy, categories,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  createdBy: string;
  categories: Category[];
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"public" | "private">("public");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [isVoiceChannel, setIsVoiceChannel] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    const id = await createChannel({
      name,
      type,
      description: description.trim() || undefined,
      createdBy,
      categoryId: categoryId === "none" ? null : categoryId,
      isVoiceChannel,
    });
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
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Category (optional)</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None (top level)</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                      {cat.allowed_roles && cat.allowed_roles.length > 0 && (
                        <span className="text-muted-foreground"> · gated</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Channels in a gated category are only visible to roles the category allows.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What's this channel for?"
            />
          </div>
          {/* Voice toggle — only voice channels show the "Join voice"
              banner and let users turn on cam / share screen. Regular
              text channels stay text-only with no mic prompts. */}
          <label className="flex items-start gap-2.5 rounded-md border border-border bg-secondary/20 p-3 cursor-pointer hover:bg-secondary/40 transition-colors">
            <input
              type="checkbox"
              checked={isVoiceChannel}
              onChange={(e) => setIsVoiceChannel(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Volume2 className="h-3 w-3 text-emerald-400" />
                Voice channel
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Members can join voice calls, turn on their camera, and share their screen.
                Choose this for daily standups, meetings, or VC rooms.
              </p>
            </div>
          </label>
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

// ── Category dialog (create + edit) ─────────────────────────────────────

function CategoryDialog({
  mode, category, onClose, onSaved, createdBy,
}: {
  mode: "create" | "edit";
  category?: Category;
  onClose: () => void;
  onSaved: () => void;
  createdBy: string;
}) {
  const [name, setName] = useState(category?.name ?? "");
  // "all" = visible to everyone (NULL allowed_roles)
  // "gated" = restricted to selected roles
  const [accessMode, setAccessMode] = useState<"all" | "gated">(
    !category?.allowed_roles || category.allowed_roles.length === 0 ? "all" : "gated",
  );
  const [allowedRoles, setAllowedRoles] = useState<string[]>(category?.allowed_roles ?? []);
  const [busy, setBusy] = useState(false);

  const toggleRole = (role: string) => {
    setAllowedRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]);
  };

  const handleSave = async () => {
    if (!name.trim() && mode === "create") {
      toast.error("Name is required");
      return;
    }
    if (accessMode === "gated" && allowedRoles.length === 0) {
      toast.error("Pick at least one role or switch to Visible to everyone");
      return;
    }
    setBusy(true);
    if (mode === "create") {
      const id = await createCategory({
        name,
        allowedRoles: accessMode === "gated" ? allowedRoles : null,
        createdBy,
      });
      setBusy(false);
      if (id) { toast.success("Category created"); onSaved(); }
      else toast.error("Failed to create — try a different name");
    } else if (category) {
      const ok = await updateCategoryRoles(category.id, accessMode === "gated" ? allowedRoles : null);
      setBusy(false);
      if (ok) { toast.success("Category updated"); onSaved(); }
      else toast.error("Update failed");
    }
  };

  const handleDelete = async () => {
    if (!category) return;
    if (!confirm(`Delete category "${category.name}"? Channels inside will move to the top level (not deleted).`)) return;
    const ok = await deleteCategory(category.id);
    if (ok) { toast.success("Category deleted"); onSaved(); }
    else toast.error("Delete failed");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New category" : `Edit "${category?.name ?? ""}"`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {mode === "create" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Category name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reddit Team" autoFocus />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Who can see channels in this category?</Label>
            <div className="inline-flex items-center rounded-md bg-secondary p-0.5 w-full">
              <button
                onClick={() => { setAccessMode("all"); setAllowedRoles([]); }}
                className={`flex-1 text-xs px-3 py-1.5 rounded font-medium ${accessMode === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Everyone
              </button>
              <button
                onClick={() => setAccessMode("gated")}
                className={`flex-1 text-xs px-3 py-1.5 rounded font-medium ${accessMode === "gated" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Specific roles
              </button>
            </div>
          </div>
          {accessMode === "gated" && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
                {CHATTER_ROLES.map((r) => {
                  const checked = allowedRoles.includes(r.value);
                  return (
                    <label
                      key={r.value}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                        checked
                          ? "bg-primary/10 text-foreground border border-primary/30"
                          : "bg-secondary/30 text-muted-foreground hover:bg-secondary border border-transparent"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRole(r.value)}
                        className="h-3.5 w-3.5 rounded border-border accent-primary"
                      />
                      <span className="truncate">{r.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Admins always see every category regardless of role.
              </p>
            </div>
          )}
          {accessMode === "all" && (
            <div className="text-[11px] text-muted-foreground italic flex items-center gap-1.5 p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              Channels in this category will be visible to all team members.
            </div>
          )}
        </div>
        <DialogFooter className="flex sm:justify-between">
          {mode === "edit" ? (
            <Button variant="ghost" onClick={handleDelete} className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
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
