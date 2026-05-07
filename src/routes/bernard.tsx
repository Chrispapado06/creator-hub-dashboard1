import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  Sparkles, RefreshCw, Copy, Check, AlertCircle,
  TrendingUp, TrendingDown, Megaphone, ListChecks, MessageCircle,
  Lightbulb, Send, Trash2, Plus, X, Target, BarChart3,
  Users as UsersIcon, ChevronRight, History,
} from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { format, formatDistanceToNow } from "date-fns";
import {
  streamClaude, gatherBusinessSnapshot, getAnthropicKey,
  snapshotToContext, type BusinessSnapshot, type ChatMessage,
} from "@/lib/bernard";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/bernard")({
  head: () => ({ meta: [{ title: "Bernard — Agency Console" }] }),
  component: BernardPage,
});

// ── Presets ──────────────────────────────────────────────────────────────────
//
// Each preset is a one-line "starter prompt" the user can click. We seed the
// first message of a fresh conversation with the snapshot context + this prompt.

type Preset = {
  id: string;
  title: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "warning" | "success" | "info";
  days: number;
  prompt: string;
};

const PRESETS: Preset[] = [
  {
    id: "weekly_digest",
    title: "Weekly digest",
    blurb: "Last 7 days · highlights, what worked, what needs attention, focus for next week.",
    icon: Sparkles,
    tone: "primary",
    days: 7,
    prompt: "Write the weekly digest for the period above. Sections: Highlights (2-4 wins), What worked (specific creators / channels / links), What needs attention (slowdowns, alerts), Recommended focus next week (3 concrete actions).",
  },
  {
    id: "monthly_review",
    title: "Monthly review",
    blurb: "30-day deep dive · trends, channel mix, biggest movers, strategic recommendations.",
    icon: TrendingUp,
    tone: "info",
    days: 30,
    prompt: "Run a monthly business review. Headline: was this month good or bad and why? Then: channel mix shifts, biggest movers (creators or links), and 3-5 strategic moves for next month ranked by expected impact.",
  },
  {
    id: "subreddit_strategy",
    title: "Subreddit strategy",
    blurb: "Which subs are working, which are dead, where to expand each creator.",
    icon: Megaphone,
    tone: "primary",
    days: 30,
    prompt: "Audit subreddit strategy across the roster. For the top 5 creators by Reddit-attributed revenue: which subs drive their wins, which are dead/low-CVR, and 2-3 specific new subs each one should test next week (matched to their niche). Use the actual subreddit names from the data.",
  },
  {
    id: "underperformers",
    title: "Underperformer triage",
    blurb: "Find creators slipping or stalled. Recovery actions per creator.",
    icon: TrendingDown,
    tone: "warning",
    days: 30,
    prompt: "Identify the 3-5 creators who are underperforming or stalled in the last 30 days. For each: name + the specific concern, root-cause hypothesis, two concrete recovery actions (specific subs / pricing moves / chatter scripts / ad creative). Skip healthy creators.",
  },
  {
    id: "top_performers",
    title: "Top performers",
    blurb: "What's working — so we can replicate it across the roster.",
    icon: TrendingUp,
    tone: "success",
    days: 30,
    prompt: "Identify the 3-5 top creators of the period. For each: why they're winning (channel mix, niche fit, pricing). Then a 'Patterns to replicate' section with 3 cross-cutting takeaways the agency can apply to other creators.",
  },
  {
    id: "channel_breakdown",
    title: "Channel breakdown",
    blurb: "Organic vs Internal vs Ads — ROI, where to reallocate.",
    icon: BarChart3,
    tone: "info",
    days: 30,
    prompt: "Channel-by-channel breakdown: Organic (Reddit/IG/FB/X/TikTok), Internal (tracking links / chatters), Ads (Meta + OnlyFinder). For each: revenue contribution, efficiency, top contributing creators, and whether to scale up / hold / cut. Close with: 'If we had $5k more this month, where should it go and why?'",
  },
  {
    id: "pricing_audit",
    title: "Pricing audit",
    blurb: "Sub price + PPV strategy review per creator.",
    icon: Target,
    tone: "info",
    days: 30,
    prompt: "Audit sub pricing and PPV strategy across the roster. Which creators are likely under-priced or over-priced given their niche, audience, and current revenue? Suggest test moves (e.g. 'Maylee → drop sub to $6.99 for Q4 to lift volume', 'Marissa → bundle 3-mo at 25% off for retention'). Use specific names.",
  },
  {
    id: "churn_risk",
    title: "Churn & dormancy",
    blurb: "Who's slipping, what re-engagement to run.",
    icon: AlertCircle,
    tone: "warning",
    days: 60,
    prompt: "Look for creators with declining or dormant revenue patterns over the last 60 days. Flag any whose revenue dropped >30% week-over-week, or who have gone 14+ days without revenue. For each: likely cause, and a re-engagement plan (chatter cadence, content cadence, pricing reset).",
  },
  {
    id: "staff_review",
    title: "Chatter performance",
    blurb: "Hours-vs-revenue, who needs coaching, coverage gaps.",
    icon: MessageCircle,
    tone: "info",
    days: 30,
    prompt: "Review chatter performance: top performers (revenue/hour), coaching opportunities (logged shifts but low revenue), capacity gaps (which creators are under-covered), and 3-5 specific 1:1s the manager should run this week.",
  },
  {
    id: "lead_pipeline",
    title: "Lead pipeline",
    blurb: "Funnel health, stale leads, source quality.",
    icon: ListChecks,
    tone: "warning",
    days: 30,
    prompt: "Analyze the lead pipeline: funnel snapshot, top 5 stale leads to contact this week (with a one-line outreach angle each based on their source/notes), source-quality observations, and pipeline process gaps to fix.",
  },
  {
    id: "niche_gaps",
    title: "Roster niche gaps",
    blurb: "Which OFM niches are missing — where to recruit next.",
    icon: UsersIcon,
    tone: "primary",
    days: 90,
    prompt: "Look at the current roster's niches and revenue performance. Which OFM niches are underrepresented or completely missing (e.g. alt/goth, BBW, fitness, foot, latina, asian, milf)? Recommend 2-3 niche profiles the agency should target for new signings, with rationale (audience size, competition, expected revenue per creator).",
  },
  {
    id: "growth_ideas",
    title: "Growth bets",
    blurb: "3-5 specific, testable growth experiments to run this month.",
    icon: Lightbulb,
    tone: "primary",
    days: 30,
    prompt: "Propose 3-5 specific testable growth bets to run in the next 30 days. For each: hypothesis (cite the data), what to do (concrete steps + creators involved), rough cost, expected impact, and the metric we'll watch. Rank by expected ROI. No vague ideas.",
  },
];

const TONE_BORDER: Record<Preset["tone"], string> = {
  primary: "border-primary/30 bg-primary/5 hover:bg-primary/10",
  warning: "border-warning/30 bg-warning/5 hover:bg-warning/10",
  success: "border-success/30 bg-success/5 hover:bg-success/10",
  info:    "border-border bg-card hover:bg-secondary/40",
};
const TONE_ICON: Record<Preset["tone"], string> = {
  primary: "text-primary",
  warning: "text-warning",
  success: "text-success",
  info:    "text-muted-foreground",
};

// ── Conversation persistence ─────────────────────────────────────────────────

type Conversation = {
  id: string;
  title: string;
  preset_id: string | null;
  data_window_days: number;
  messages: ChatMessage[];
  range: { start: string; end: string };
  created_at: string;
  updated_at: string;
};

const STORAGE_KEY = "bernard_conversations_v2";
const STORAGE_LIMIT = 20;

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Conversation[]) ?? [];
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, STORAGE_LIMIT)));
  } catch {
    // storage full — ignore
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

function BernardPage() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [dataWindow, setDataWindow] = useState<7 | 30 | 90>(30);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [snapshotInfo, setSnapshotInfo] = useState<{ generated_at: string; range: { start: string; end: string } } | null>(null);
  const [showPresets, setShowPresets] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversations + API key state on mount
  useEffect(() => {
    getAnthropicKey().then((k) => setHasKey(!!k));
    const saved = loadConversations();
    setConversations(saved);
    if (saved.length > 0) {
      setActiveId(saved[0].id);
    }
  }, []);

  // Auto-scroll the chat to bottom on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeId, streamingText, conversations]);

  const activeConvo = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  const persist = (next: Conversation[]) => {
    setConversations(next);
    saveConversations(next);
  };

  const upsertConvo = (convo: Conversation) => {
    persist([convo, ...conversations.filter((c) => c.id !== convo.id)].slice(0, STORAGE_LIMIT));
  };

  // Append a chunk to the assistant's message in-progress
  const appendToActiveAssistant = (chunk: string, convoId: string) => {
    setStreamingText((prev) => prev + chunk);
    setConversations((prev) => prev.map((c) => {
      if (c.id !== convoId) return c;
      const msgs = [...c.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
      }
      return { ...c, messages: msgs, updated_at: new Date().toISOString() };
    }));
  };

  const runStreaming = async (convo: Conversation, snapshot: BusinessSnapshot | null, userMessage: string, isFirstMessage: boolean) => {
    setError(null);
    setStreaming(true);
    setStreamingText("");
    abortRef.current = new AbortController();

    try {
      const apiKey = await getAnthropicKey();
      if (!apiKey) throw new Error("Add an Anthropic API key in Settings → AI to enable Bernard.");

      // Build the message list. On the first turn, the user's content is
      // wrapped with the business snapshot so Bernard sees the data.
      const dataSection = snapshot ? snapshotToContext(snapshot) : "";
      const wrappedUser = isFirstMessage && dataSection
        ? `${dataSection}\n\n---\n\n${userMessage}`
        : userMessage;

      const history: ChatMessage[] = [
        ...convo.messages.slice(0, -2), // already-sent prior turns (we just appended user + empty assistant)
        { role: "user", content: wrappedUser },
      ];

      // Iteratively append to the convo's assistant message as chunks arrive
      for await (const chunk of streamClaude(apiKey, history, { signal: abortRef.current.signal })) {
        appendToActiveAssistant(chunk, convo.id);
      }

      // Final persist (includes the fully-streamed assistant reply)
      setConversations((prev) => {
        const next = prev.map((c) => c);
        saveConversations(next);
        return next;
      });

      void logAudit({
        action: isFirstMessage ? "bernard_chat_started" : "bernard_chat_followup",
        entity_type: "ai_analysis",
        entity_id: convo.id,
        entity_name: convo.title,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Aborts shouldn't be shown as errors
      if (msg.toLowerCase().includes("abort")) {
        // User cancelled — leave the partial response in place
      } else {
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setStreaming(false);
      setStreamingText("");
      abortRef.current = null;
    }
  };

  const startConversation = async (preset: Preset | null, customPrompt?: string) => {
    const userMessage = preset ? preset.prompt : (customPrompt ?? "").trim();
    if (!userMessage) return toast.error("Type a question first");

    const days = preset?.days ?? dataWindow;
    setStreaming(true);
    setError(null);

    let snapshot: BusinessSnapshot;
    try {
      snapshot = await gatherBusinessSnapshot(days);
      setSnapshotInfo({ generated_at: snapshot.generated_at, range: snapshot.range });
    } catch (e) {
      setStreaming(false);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
      return;
    }

    const convo: Conversation = {
      id: crypto.randomUUID(),
      title: preset?.title ?? (userMessage.length > 60 ? userMessage.slice(0, 60) + "…" : userMessage),
      preset_id: preset?.id ?? null,
      data_window_days: days,
      range: snapshot.range,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: "" }, // placeholder — streamed into
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    upsertConvo(convo);
    setActiveId(convo.id);
    setInput("");
    setShowPresets(false);

    await runStreaming(convo, snapshot, userMessage, /* isFirstMessage */ true);
  };

  const sendFollowup = async () => {
    if (!activeConvo) return startConversation(null, input);
    const text = input.trim();
    if (!text) return;
    setInput("");

    const next: Conversation = {
      ...activeConvo,
      messages: [
        ...activeConvo.messages,
        { role: "user", content: text },
        { role: "assistant", content: "" },
      ],
      updated_at: new Date().toISOString(),
    };
    upsertConvo(next);

    await runStreaming(next, /* snapshot */ null, text, /* isFirstMessage */ false);
  };

  const cancelStreaming = () => {
    abortRef.current?.abort();
  };

  const newChat = () => {
    setActiveId(null);
    setInput("");
    setShowPresets(true);
    setError(null);
    setSnapshotInfo(null);
  };

  const deleteConversation = (id: string) => {
    if (!confirm("Delete this conversation?")) return;
    persist(conversations.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setShowPresets(true);
    }
  };

  const clearAll = () => {
    if (!confirm("Clear all of Bernard's saved conversations from this device?")) return;
    persist([]);
    setActiveId(null);
    setShowPresets(true);
  };

  return (
    <div className="flex flex-col gap-4 min-h-[calc(100vh-5rem)]">
      <Toaster />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      {/* pr-44 leaves room for the absolute-positioned sync + notif badges in __root.tsx */}
      <div className="flex items-center justify-between gap-4 flex-wrap pr-44">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-[0_4px_20px_-4px_oklch(0.6_0.15_35/0.5)] shrink-0">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight leading-tight">Bernard</h1>
            <p className="text-xs text-muted-foreground">
              OFM strategist · sees your live data · ask anything
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeConvo && (
            <Button size="sm" variant="ghost" onClick={newChat} className="text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" /> New chat
            </Button>
          )}
          <ConversationsPopover
            conversations={conversations}
            activeId={activeId}
            onPick={(id) => { setActiveId(id); setShowPresets(false); }}
            onDelete={deleteConversation}
            onClearAll={clearAll}
          />
        </div>
      </div>

      {snapshotInfo && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
          Data window: <span className="font-medium text-foreground">{snapshotInfo.range.start} → {snapshotInfo.range.end}</span>
        </div>
      )}

      {/* ── API key warning ────────────────────────────────────────────── */}
      {hasKey === false && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <span className="font-medium">Bernard needs an Anthropic API key.</span>{" "}
            <Link to="/settings" className="text-primary hover:underline inline-flex items-center gap-0.5">
              Open Settings <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* ── Conversation area ──────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border border-border bg-card/30 p-5 min-h-[400px]"
      >
        {!activeConvo && showPresets && (
          <PresetGrid disabled={hasKey === false || streaming} onPick={(p) => startConversation(p)} />
        )}
        {activeConvo && (
          <div className="space-y-5 max-w-3xl mx-auto">
            {activeConvo.messages.map((msg, i) => (
              <ChatBubble
                key={i}
                role={msg.role}
                content={msg.content}
                isStreaming={streaming && i === activeConvo.messages.length - 1 && msg.role === "assistant"}
              />
            ))}
          </div>
        )}
        {error && !streaming && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2 mt-4">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs text-destructive break-words">{error}</div>
          </div>
        )}
      </div>

      {/* ── Input ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <Textarea
          placeholder={
            activeConvo
              ? "Ask a follow-up… (Cmd/Ctrl+Enter to send)"
              : "Ask Bernard anything about the business… (Cmd/Ctrl+Enter to send)"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              if (activeConvo) sendFollowup();
              else startConversation(null, input);
            }
          }}
          rows={2}
          disabled={hasKey === false}
          className="resize-none border-0 focus-visible:ring-0 px-1 py-0 shadow-none"
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {!activeConvo ? (
              <div className="flex items-center gap-2">
                <Label className="text-[11px] text-muted-foreground">Window</Label>
                <Select value={String(dataWindow)} onValueChange={(v) => setDataWindow(Number(v) as 7 | 30 | 90)}>
                  <SelectTrigger className="w-32 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                Continuing chat ·{" "}
                <button onClick={newChat} className="text-primary hover:underline">start new</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {streaming ? (
              <Button size="sm" variant="outline" onClick={cancelStreaming}>
                <X className="h-4 w-4 mr-1" /> Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => activeConvo ? sendFollowup() : startConversation(null, input)}
                disabled={hasKey === false || !input.trim()}
              >
                <Send className="h-4 w-4 mr-1" /> Send
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Conversations popover (replaces the broken inline sidebar) ──────────────

function ConversationsPopover({
  conversations,
  activeId,
  onPick,
  onDelete,
  onClearAll,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs">
          <History className="h-3.5 w-3.5 mr-1.5" />
          History
          {conversations.length > 0 && (
            <span className="ml-1.5 text-[10px] text-muted-foreground">{conversations.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Past chats</span>
          {conversations.length > 0 && (
            <button
              onClick={() => { onClearAll(); setOpen(false); }}
              className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No chats yet. Pick a preset or type a question to start.
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => { onPick(c.id); setOpen(false); }}
                className={`group w-full text-left p-3 border-b border-border last:border-0 transition-colors ${
                  activeId === c.id ? "bg-primary/5" : "hover:bg-secondary/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{c.title}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {c.messages.filter((m) => m.role === "user").length} turn{c.messages.filter((m) => m.role === "user").length === 1 ? "" : "s"} · {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    aria-label="Delete conversation"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Preset grid ─────────────────────────────────────────────────────────────

function PresetGrid({ disabled, onPick }: { disabled: boolean; onPick: (p: Preset) => void }) {
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-primary" /> Quick analyses
        </h2>
        <p className="text-xs text-muted-foreground">
          Pick a preset, or just type a question below. Each preset starts a chat — you can ask follow-ups.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PRESETS.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              disabled={disabled}
              className={`group rounded-xl border p-4 text-left transition-all duration-150 ease-out hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${TONE_BORDER[p.tone]}`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className={`h-9 w-9 rounded-lg bg-background/50 flex items-center justify-center shrink-0 ${TONE_ICON[p.tone]}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{p.title}</div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{p.blurb}</p>
                  <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mt-2">
                    {p.days}-day window
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Chat bubble + markdown render ────────────────────────────────────────────

function ChatBubble({ role, content, isStreaming }: { role: "user" | "assistant"; content: string; isStreaming: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (role === "user") {
    return (
      <div className="flex gap-3 group">
        <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
          <UsersIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">You</div>
          <div className="text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">{content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 group">
      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Sparkles className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Bernard</span>
          {!isStreaming && content && (
            <button
              onClick={onCopy}
              className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground hover:text-foreground transition-opacity inline-flex items-center gap-1"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
        <div className="prose prose-sm max-w-none">
          {content ? renderMarkdown(content) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-spin" /> thinking…
            </div>
          )}
          {isStreaming && content && (
            <span className="inline-block w-1.5 h-3.5 bg-primary/60 ml-0.5 align-middle animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}

function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    const Tag = listBuffer.ordered ? "ol" : "ul";
    out.push(
      <Tag key={`list-${out.length}`} className={`my-3 ml-1 space-y-1.5 ${listBuffer.ordered ? "list-decimal pl-5 marker:text-primary marker:font-semibold" : ""}`}>
        {listBuffer.items.map((b, i) => (
          <li key={i} className={`text-sm text-foreground/90 ${!listBuffer!.ordered ? "flex gap-2" : ""}`}>
            {!listBuffer!.ordered && <span className="text-primary mt-1 shrink-0">•</span>}
            <span dangerouslySetInnerHTML={{ __html: inlineFmt(b) }} />
          </li>
        ))}
      </Tag>
    );
    listBuffer = null;
  };

  const inlineFmt = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>')
      .replace(/\*([^*]+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, '<code class="font-mono text-xs bg-secondary px-1 py-0.5 rounded">$1</code>')
      .replace(/\$(\d[\d,]*(?:\.\d+)?)/g, '<span class="font-semibold text-foreground tabular-nums">$$$1</span>');

  for (const rawLine of lines) {
    const t = rawLine.trimEnd();
    if (!t.trim()) { flushList(); continue; }

    if (t.startsWith("# ")) {
      flushList();
      out.push(<h2 key={out.length} className="text-xl font-bold mt-4 mb-2 first:mt-0">{t.slice(2)}</h2>);
    } else if (t.startsWith("## ")) {
      flushList();
      out.push(<h3 key={out.length} className="text-base font-semibold mt-4 mb-1.5 text-primary">{t.slice(3)}</h3>);
    } else if (t.startsWith("### ")) {
      flushList();
      out.push(<h4 key={out.length} className="text-sm font-semibold mt-3 mb-1">{t.slice(4)}</h4>);
    } else if (/^\s*[-*]\s/.test(t)) {
      const item = t.replace(/^\s*[-*]\s+/, "");
      if (!listBuffer || listBuffer.ordered) { flushList(); listBuffer = { ordered: false, items: [] }; }
      listBuffer.items.push(item);
    } else if (/^\s*\d+[.)]\s/.test(t)) {
      const item = t.replace(/^\s*\d+[.)]\s+/, "");
      if (!listBuffer || !listBuffer.ordered) { flushList(); listBuffer = { ordered: true, items: [] }; }
      listBuffer.items.push(item);
    } else {
      flushList();
      out.push(
        <p key={out.length} className="text-sm text-foreground/90 my-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: inlineFmt(t) }} />
      );
    }
  }
  flushList();
  return <>{out}</>;
}
