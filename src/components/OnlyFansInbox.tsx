// Per-creator OnlyFans inbox.
//
// Lives as a subtab inside the OnlyFans creator-detail view. Lets the
// agency:
//   • see every recent conversation for a creator's account
//   • read the full message history for a fan
//   • reply directly from the dashboard (with optional PPV price)
//
// All data comes from the OnlyFansAPI live; we don't cache messages
// locally because OF has its own storage and our cache would lag the
// real source. Refresh button forces a re-pull. List-poll runs every
// 30 seconds while the tab is open.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  RefreshCw, Send, Search, MessageCircle, ArrowLeft, DollarSign,
  Clock, ExternalLink,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  listChats, listChatMessages, sendChatMessage,
  type OfChat, type OfChatMessage, OfApiError,
} from "@/lib/of-api";

export function OnlyFansInbox({ accountId, creatorName }: { accountId: string; creatorName: string }) {
  const [chats, setChats] = useState<OfChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [activeFanId, setActiveFanId] = useState<number | null>(null);

  // Refresh chats on mount + every 30s while the tab is open.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await listChats(accountId, { limit: 100, unreadOnly });
        if (!cancelled) setChats(list);
      } catch (e) {
        if (e instanceof OfApiError) toast.error(`OF API: ${e.message}`);
      } finally {
        if (!cancelled) setLoadingChats(false);
      }
    };
    void load();
    const t = setInterval(() => { void load(); }, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [accountId, unreadOnly]);

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) =>
      c.withUser.username.toLowerCase().includes(q) ||
      (c.withUser.name ?? "").toLowerCase().includes(q),
    );
  }, [chats, search]);

  const activeChat = activeFanId
    ? chats.find((c) => c.withUser.id === activeFanId) ?? null
    : null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex h-[640px]">
        {/* Chat list */}
        <aside className={`w-full sm:w-72 lg:w-80 border-r border-border bg-card/40 flex flex-col ${activeFanId ? "hidden sm:flex" : "flex"}`}>
          <div className="px-3 py-2.5 border-b border-border space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4 text-primary" />
                Inbox
              </h3>
              <span className="text-[10px] text-muted-foreground">{filteredChats.length} chats</span>
            </div>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search fans…"
                className="pl-7 h-8 text-xs"
              />
            </div>
            <button
              onClick={() => setUnreadOnly((v) => !v)}
              className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                unreadOnly ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              Unread only
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingChats ? (
              <div className="px-4 py-6 text-xs text-muted-foreground italic">Loading…</div>
            ) : filteredChats.length === 0 ? (
              <div className="px-4 py-8 text-xs text-muted-foreground italic text-center">
                No chats {unreadOnly ? "with unread messages" : "to show"}.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredChats.map((c) => (
                  <li key={c.withUser.id}>
                    <button
                      onClick={() => setActiveFanId(c.withUser.id)}
                      className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors ${
                        activeFanId === c.withUser.id ? "bg-primary/5 border-l-2 border-primary" : "border-l-2 border-transparent"
                      }`}
                    >
                      <div className="relative shrink-0">
                        {c.withUser.avatar ? (
                          <img src={c.withUser.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-[11px] font-semibold">
                            {c.withUser.username.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        {c.withUser.isOnline && (
                          <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 border-2 border-card" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-medium truncate">
                            {c.withUser.name || c.withUser.username}
                          </span>
                          {c.lastMessage?.createdAt && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {formatDistanceToNow(parseISO(c.lastMessage.createdAt), { addSuffix: false })}
                            </span>
                          )}
                        </div>
                        {c.lastMessage?.text && (
                          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {c.lastMessage.isFromUser ? "" : "You: "}
                            {c.lastMessage.text}
                          </div>
                        )}
                      </div>
                      {(c.unreadMessagesCount ?? 0) > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground min-w-[18px] text-center self-center">
                          {c.unreadMessagesCount}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Conversation pane */}
        <main className={`flex-1 flex flex-col ${activeFanId ? "flex" : "hidden sm:flex"}`}>
          {activeChat ? (
            <ConversationPane
              accountId={accountId}
              creatorName={creatorName}
              chat={activeChat}
              onBack={() => setActiveFanId(null)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Pick a chat to read or reply.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Conversation pane ───────────────────────────────────────────────

function ConversationPane({
  accountId, creatorName, chat, onBack,
}: {
  accountId: string;
  creatorName: string;
  chat: OfChat;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<OfChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState("");
  const [price, setPrice] = useState<string>("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await listChatMessages(accountId, chat.withUser.id, { limit: 200 });
      // OF returns newest-first; reverse so we stack chronologically.
      setMessages([...list].reverse());
    } catch (e) {
      if (e instanceof OfApiError) toast.error(`OF API: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [accountId, chat.withUser.id]);

  const onSend = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const numericPrice = price ? Math.max(0, Number(price)) : 0;
      await sendChatMessage(accountId, chat.withUser.id, {
        text: draft.trim(),
        price: numericPrice,
      });
      setDraft("");
      setPrice("");
      toast.success(numericPrice > 0 ? `PPV $${numericPrice.toFixed(2)} sent` : "Message sent");
      // Wait a tick then refresh — OF takes a moment to commit
      setTimeout(() => void load(), 800);
    } catch (e) {
      if (e instanceof OfApiError) toast.error(`Send failed: ${e.message}`);
      else toast.error("Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Header */}
      <header className="border-b border-border px-4 py-2.5 flex items-center gap-2.5 shrink-0">
        <Button size="icon" variant="ghost" className="h-8 w-8 sm:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {chat.withUser.avatar ? (
          <img src={chat.withUser.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-semibold">
            {chat.withUser.username.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{chat.withUser.name || chat.withUser.username}</div>
          <a
            href={`https://onlyfans.com/${chat.withUser.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            @{chat.withUser.username} <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="text-xs text-muted-foreground italic py-4">Loading messages…</div>
        ) : messages.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-8 text-center">No messages yet.</div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} creatorName={creatorName} />)
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border px-3 py-3 shrink-0 space-y-2">
        <div className="rounded-xl border border-border bg-card focus-within:border-primary/40 transition-colors">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
            placeholder={`Reply to ${chat.withUser.name || chat.withUser.username}…  (Enter to send)`}
            rows={1}
            className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 pt-2 pb-1 shadow-none text-sm bg-transparent max-h-32"
          />
          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                className="h-6 w-20 text-[11px] px-2"
                min={0}
                step={0.01}
              />
              <span>PPV (optional)</span>
            </div>
            <Button
              size="icon"
              disabled={sending || !draft.trim()}
              onClick={onSend}
              className="h-7 w-7 rounded-full"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Sent through your OnlyFansAPI key — appears in {creatorName}'s OnlyFans inbox immediately.
        </p>
      </div>
    </>
  );
}

function MessageBubble({ message, creatorName }: { message: OfChatMessage; creatorName: string }) {
  // OF's `isFromUser=true` means "from the FAN" (the OF user).
  // false / undefined = the creator (us).
  const fromFan = !!message.isFromUser;
  return (
    <div className={`flex ${fromFan ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
        fromFan
          ? "bg-secondary/70 text-foreground/95 rounded-bl-sm"
          : "bg-primary/15 text-foreground rounded-br-sm border border-primary/20"
      }`}>
        {!fromFan && (
          <div className="text-[10px] text-primary uppercase tracking-wide font-semibold mb-0.5">
            {creatorName}
          </div>
        )}
        {message.text && (
          <div className="whitespace-pre-wrap break-words leading-relaxed">{message.text}</div>
        )}
        {(message.price ?? 0) > 0 && (
          <div className="mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
            <DollarSign className="h-2.5 w-2.5" /> PPV ${message.price?.toFixed(2)}
            {message.isOpened ? <span className="opacity-70">· opened</span> : <span className="opacity-70">· locked</span>}
          </div>
        )}
        {message.media && message.media.length > 0 && (
          <div className="mt-1.5 grid grid-cols-2 gap-1">
            {message.media.slice(0, 4).map((m) => (
              <div key={m.id} className="aspect-square rounded-md overflow-hidden bg-card">
                {m.thumb ? (
                  <img src={m.thumb} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                    {m.type}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="text-[9px] opacity-50 mt-1 inline-flex items-center gap-0.5">
          <Clock className="h-2 w-2" /> {format(parseISO(message.createdAt), "MMM d, h:mm a")}
        </div>
      </div>
    </div>
  );
}
