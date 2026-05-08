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
  Users as UsersIcon, ChevronRight, ChevronDown, History, LineChart,
} from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { format, formatDistanceToNow } from "date-fns";
import {
  streamClaudeAgentic, gatherBusinessSnapshot, gatherForecastInputs, getAnthropicKey,
  snapshotToContext, forecastToContext, BERNARD_AGENTIC_SYSTEM,
  type AgenticChatMessage,
} from "@/lib/bernard";
import { TOOLS, getTool, toolsForAnthropic, type Tool } from "@/lib/bernard-tools";
import { logAudit } from "@/lib/audit";
import { Wrench, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";

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
  /** What data context to give Bernard. Defaults to the standard business snapshot. */
  kind?: "snapshot" | "forecast";
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
  {
    id: "revenue_forecast",
    title: "Revenue forecast",
    blurb: "30/60/90-day projection with run-rate + trend math, plus what to do to hit the higher number.",
    icon: LineChart,
    tone: "info",
    days: 90,
    kind: "forecast",
    prompt: `You've been given two scenarios — a flat run-rate projection and a trend-adjusted one. Your job:

# Revenue Forecast
## Bottom line
One sentence: what's the most likely 30 / 60 / 90 day revenue, given the trend? Pick a single number per horizon — don't hedge.

## What's driving it
Reference the channel mix shifts (Organic / Internal / Ads). Which channel is carrying or dragging? Cite the numbers.

## What would change the number
- 3 specific moves that could push revenue toward the OPTIMISTIC scenario (+ rough $ each)
- 1-2 risks that could push it toward the PESSIMISTIC scenario

## Honest assessment
If the data is too thin or too volatile to forecast confidently, say so. Don't pretend.`,
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
  messages: AgenticChatMessage[];
  range: { start: string; end: string };
  created_at: string;
  updated_at: string;
};

// Status of each tool call for the UI — keyed by tool_use_id
type ToolCallStatus = "pending_approval" | "executing" | "done" | "error" | "rejected";
type ToolCallState = {
  status: ToolCallStatus;
  /** Result string or error message — surfaced in the card after execution */
  result?: string;
};

// A tool call awaiting the user's approve/reject. Resolves when they click.
type PendingApproval = {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  resolve: (toolResult: { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }) => void;
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

  // Agentic state: per-tool-call display status + the queue of approvals
  // the user is currently looking at.
  const [toolCallStates, setToolCallStates] = useState<Record<string, ToolCallState>>({});
  const pendingApprovalsRef = useRef<PendingApproval[]>([]);
  // Re-render trigger for the approval queue (since the ref doesn't trigger one)
  const [approvalTick, setApprovalTick] = useState(0);
  const bumpApprovals = () => setApprovalTick((n) => n + 1);
  const setToolStatus = (id: string, status: ToolCallStatus, result?: string) =>
    setToolCallStates((prev) => ({ ...prev, [id]: { status, result } }));

  // Load conversations + API key state on mount.
  // We populate the history sidebar but DON'T auto-open the most recent one —
  // every visit lands on the fresh preset picker. Old conversations are still
  // a click away in the sidebar.
  // Greeting personalisation — uses the logged-in admin's username from
  // the agency_session localStorage record (set by /login). Falls back
  // to a generic "there" if no session is found.
  const [userName, setUserName] = useState<string>("there");

  useEffect(() => {
    getAnthropicKey().then((k) => setHasKey(!!k));
    setConversations(loadConversations());
    try {
      const raw = localStorage.getItem("agency_session");
      if (raw) {
        // Session can be a JSON blob {username, type, ...} or a legacy
        // plain string (admin username).
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.username) setUserName(String(parsed.username));
        } catch {
          if (raw) setUserName(raw);
        }
      }
    } catch {
      // localStorage blocked / disabled — keep the default
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

  // Mutate the live conversation's last assistant message — append text or
  // attach tool_use blocks as they stream in.
  const updateLastAssistant = (convoId: string, mutate: (msg: AgenticChatMessage) => AgenticChatMessage) => {
    setConversations((prev) => prev.map((c) => {
      if (c.id !== convoId) return c;
      const msgs = [...c.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = mutate(last);
      }
      return { ...c, messages: msgs, updated_at: new Date().toISOString() };
    }));
  };

  /**
   * Append plain text to the assistant's last message — handles both the
   * "string content" shape (initial state) and the "array content" shape
   * (after a tool_use block has been added).
   */
  const appendAssistantText = (convoId: string, chunk: string) => {
    setStreamingText((prev) => prev + chunk);
    updateLastAssistant(convoId, (last) => {
      if (last.role !== "assistant") return last;
      if (typeof last.content === "string") {
        return { role: "assistant", content: last.content + chunk };
      }
      // Array form — append to the last text block, or create one
      const blocks = [...last.content];
      const tail = blocks[blocks.length - 1];
      if (tail && tail.type === "text") {
        blocks[blocks.length - 1] = { type: "text", text: tail.text + chunk };
      } else {
        blocks.push({ type: "text", text: chunk });
      }
      return { role: "assistant", content: blocks };
    });
  };

  /** Add a tool_use block to the assistant's last message. */
  const addAssistantToolUse = (convoId: string, id: string, name: string, input: Record<string, unknown>) => {
    updateLastAssistant(convoId, (last) => {
      if (last.role !== "assistant") return last;
      // Convert string content into array form on first tool use
      const blocks = typeof last.content === "string"
        ? (last.content ? [{ type: "text" as const, text: last.content }] : [])
        : [...last.content];
      blocks.push({ type: "tool_use", id, name, input });
      return { role: "assistant", content: blocks };
    });
  };

  /** Append a user message containing tool_result blocks (after Bernard called tools). */
  const appendToolResults = (convoId: string, results: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }>) => {
    setConversations((prev) => prev.map((c) => {
      if (c.id !== convoId) return c;
      const msgs = [...c.messages, { role: "user" as const, content: results }];
      // Add an empty assistant placeholder for the next streaming pass
      msgs.push({ role: "assistant" as const, content: "" });
      return { ...c, messages: msgs, updated_at: new Date().toISOString() };
    }));
  };

  /**
   * Wait for the user to approve or reject a pending tool call.
   * Push a PendingApproval with a resolver into the queue; the UI's
   * approve/reject handlers resolve it.
   */
  const askApproval = (toolUseId: string, toolName: string, input: Record<string, unknown>): Promise<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> => {
    return new Promise((resolve) => {
      pendingApprovalsRef.current = [
        ...pendingApprovalsRef.current,
        { toolUseId, toolName, input, resolve },
      ];
      bumpApprovals();
    });
  };

  /** Approve handler — runs the tool's handler and resolves the waiting promise. */
  const onApproveTool = async (toolUseId: string) => {
    const pending = pendingApprovalsRef.current.find((p) => p.toolUseId === toolUseId);
    if (!pending) return;
    pendingApprovalsRef.current = pendingApprovalsRef.current.filter((p) => p.toolUseId !== toolUseId);
    bumpApprovals();
    setToolStatus(toolUseId, "executing");
    const tool = getTool(pending.toolName);
    if (!tool) {
      setToolStatus(toolUseId, "error", `Tool ${pending.toolName} not found.`);
      pending.resolve({ type: "tool_result", tool_use_id: toolUseId, content: `Tool ${pending.toolName} not found.`, is_error: true });
      return;
    }
    try {
      // 45s timeout so a stuck Supabase / Airtable request can't wedge
      // the loop. Bernard sees the timeout error and can decide to retry.
      const result = await Promise.race([
        tool.handler(pending.input),
        new Promise<string>((_, rej) =>
          setTimeout(() => rej(new Error("Tool timed out after 45s — try again or check network")), 45_000),
        ),
      ]);
      const isError = result.startsWith("Error:");
      setToolStatus(toolUseId, isError ? "error" : "done", result);
      pending.resolve({ type: "tool_result", tool_use_id: toolUseId, content: result || "(no output)", is_error: isError });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToolStatus(toolUseId, "error", msg);
      pending.resolve({ type: "tool_result", tool_use_id: toolUseId, content: `Error: ${msg}`, is_error: true });
    }
  };

  /** Reject handler — short-circuits the tool call with a rejection result. */
  const onRejectTool = (toolUseId: string) => {
    const pending = pendingApprovalsRef.current.find((p) => p.toolUseId === toolUseId);
    if (!pending) return;
    pendingApprovalsRef.current = pendingApprovalsRef.current.filter((p) => p.toolUseId !== toolUseId);
    bumpApprovals();
    setToolStatus(toolUseId, "rejected", "User rejected this action.");
    pending.resolve({ type: "tool_result", tool_use_id: toolUseId, content: "User rejected this action. Don't retry it.", is_error: true });
  };

  const runAgentic = async (convo: Conversation, dataSectionForFirstTurn: string | null, userMessage: string, isFirstMessage: boolean) => {
    setError(null);
    setStreaming(true);
    setStreamingText("");
    abortRef.current = new AbortController();

    try {
      const apiKey = await getAnthropicKey();
      if (!apiKey) throw new Error("Add an Anthropic API key in Settings → AI to enable Bernard.");

      // On the first turn, prepend the data context to the user's prompt so
      // Bernard sees the snapshot. The conversation's persisted user message
      // stays unwrapped so the chat history shows the user's actual question.
      const dataSection = dataSectionForFirstTurn ?? "";
      const wrappedUser = isFirstMessage && dataSection
        ? `${dataSection}\n\n---\n\n${userMessage}`
        : userMessage;

      // Build the messages array we'll send to the API. The convo.messages
      // already has the new user message + an empty assistant placeholder;
      // strip the placeholder and replace the last user with the wrapped one
      // (only on the first turn).
      let history: AgenticChatMessage[] = convo.messages.slice(0, -1);
      if (isFirstMessage && dataSection && history.length > 0) {
        const lastUser = history[history.length - 1];
        if (lastUser.role === "user" && typeof lastUser.content === "string") {
          history = [
            ...history.slice(0, -1),
            { role: "user", content: wrappedUser },
          ];
        }
      }

      // Agentic loop — keeps calling tools until Claude says "end_turn"
      const tools = toolsForAnthropic();
      let safety = 6; // Max round-trips per user turn (covers complex multi-tool flows)
      // Loop-prevention: track every tool call we've already executed
      // this turn, keyed by `${name}::${stable JSON of input}`. If we see
      // a duplicate, we don't re-execute — we feed Claude back the prior
      // result with a "Already ran this" prefix so it stops trying. This
      // catches the failure mode where Bernard re-fires the same query
      // four or five times because earlier output didn't satisfy it,
      // burning credits and looking like a hang to the user.
      const executedCalls = new Map<string, string>(); // hash → prior result content
      const callKey = (name: string, input: unknown) => {
        try { return `${name}::${JSON.stringify(input ?? {})}`; }
        catch { return `${name}::?`; }
      };
      while (safety-- > 0) {
        let stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "unknown" = "unknown";
        // Track everything Bernard streams locally during this iteration.
        // We previously re-read these from React state via a setConversations
        // callback hack, but in React 18's async update model the read could
        // race ahead of the streaming setState commits and return 0 tool
        // blocks even though tool_use_complete had fired. The "Running..."
        // chip stayed forever because the agentic loop bailed early.
        const localTextBuffer: string[] = [];
        const localToolUseBlocks: Array<{ type: "tool_use"; id: string; name: string; input: Record<string, unknown> }> = [];

        for await (const evt of streamClaudeAgentic(apiKey, history, {
          signal: abortRef.current.signal,
          tools,
          system: BERNARD_AGENTIC_SYSTEM,
        })) {
          if (evt.type === "text_delta") {
            appendAssistantText(convo.id, evt.text);
            localTextBuffer.push(evt.text);
          } else if (evt.type === "tool_use_start") {
            // tool_use_start has no input yet — wait for tool_use_complete
            // before recording. The UI shows the loading chip via React
            // state once addAssistantToolUse fires below.
          } else if (evt.type === "tool_use_complete") {
            addAssistantToolUse(convo.id, evt.id, evt.name, evt.input);
            localToolUseBlocks.push({ type: "tool_use", id: evt.id, name: evt.name, input: evt.input });
          } else if (evt.type === "message_done") {
            stopReason = evt.stopReason;
          }
        }

        if (stopReason !== "tool_use" || localToolUseBlocks.length === 0) {
          break;
        }

        // Build the assistant message ourselves from the locally-tracked
        // stream events (text + tool_use blocks). This is what we'll push
        // into `history` for the next API turn — protocol-correct without
        // depending on React having committed all updates yet.
        type AssistantBlock = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
        const assistantContentBlocks: AssistantBlock[] = [];
        const fullText = localTextBuffer.join("");
        if (fullText) assistantContentBlocks.push({ type: "text", text: fullText });
        for (const tb of localToolUseBlocks) assistantContentBlocks.push(tb);
        const latestAssistant: AgenticChatMessage = { role: "assistant", content: assistantContentBlocks };
        const toolUseBlocks = localToolUseBlocks;

        const results: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];
        for (const block of toolUseBlocks) {
          // Skip ones we already executed in earlier rounds (defensive — shouldn't happen but possible if reactions re-trigger)
          const existing = toolCallStates[block.id];
          if (existing && (existing.status === "done" || existing.status === "error" || existing.status === "rejected")) continue;

          // Loop guard — if Bernard tries to run the same tool with
          // identical args again, short-circuit. We feed the prior
          // result back with a prefix that nudges him toward summarising
          // rather than retrying yet again.
          const key = callKey(block.name, block.input);
          if (executedCalls.has(key)) {
            const prior = executedCalls.get(key)!;
            const dedupMsg = `(Loop guard: this exact tool call was already run earlier in this turn. Use the prior result below — do NOT repeat the call.)\n\n${prior}`;
            setToolStatus(block.id, "done", dedupMsg);
            results.push({ type: "tool_result", tool_use_id: block.id, content: dedupMsg });
            continue;
          }

          const tool = getTool(block.name);
          if (!tool) {
            setToolStatus(block.id, "error", `Tool ${block.name} not found.`);
            results.push({ type: "tool_result", tool_use_id: block.id, content: `Tool ${block.name} not found.`, is_error: true });
            continue;
          }

          if (tool.category === "read") {
            // Auto-execute silently with a 45s safety timeout — a stuck
            // Supabase request shouldn't be able to wedge the agentic
            // loop forever. If we time out, surface an error and let
            // Bernard decide whether to retry.
            setToolStatus(block.id, "executing");
            try {
              const result = await Promise.race([
                tool.handler(block.input),
                new Promise<string>((_, rej) =>
                  setTimeout(() => rej(new Error("Tool timed out after 45s — try again or check network")), 45_000),
                ),
              ]);
              const isError = result.startsWith("Error:");
              setToolStatus(block.id, isError ? "error" : "done", result);
              // Cache successful (non-error) reads for the loop guard
              if (!isError) executedCalls.set(key, result || "(no output)");
              // Anthropic rejects user messages with empty content, so guard
              // against a tool returning "" — surface "(no output)" instead.
              results.push({ type: "tool_result", tool_use_id: block.id, content: result || "(no output)", is_error: isError });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              setToolStatus(block.id, "error", msg);
              results.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${msg}`, is_error: true });
            }
          } else {
            // Write / destructive — surface an approval card
            setToolStatus(block.id, "pending_approval");
            const result = await askApproval(block.id, block.name, block.input);
            if (!result.is_error) executedCalls.set(key, result.content || "(no output)");
            // Same guard as the read branch — never let an empty content
            // string leak through.
            results.push({ ...result, content: result.content || "(no output)" });
          }
        }

        // Defensive: if the assistant's stopReason was tool_use but we
        // ended up with no tool_results (e.g. all blocks were already
        // handled in a prior round, or a streaming race left blocks
        // unparsed), DON'T send an empty user message — the Anthropic
        // API 400s on `messages.N: user messages must have non-empty
        // content`. Bail out and surface what we have.
        if (results.length === 0) {
          console.warn("Bernard agentic loop: no tool_results to send back, ending turn early", {
            toolBlocks: toolUseBlocks.length,
          });
          break;
        }
        // Same guard for the assistant side — the fallback used to
        // substitute `{ role: "assistant", content: "" }` which would
        // also 400 the API. If we somehow lost the assistant message,
        // bail rather than send garbage.
        if (!latestAssistant) {
          console.warn("Bernard agentic loop: lost reference to latest assistant message, ending turn early");
          break;
        }

        // Continue: append a user message with the tool_results + a fresh assistant placeholder
        appendToolResults(convo.id, results);

        // Update local history to include what just happened, for the next iteration
        history = [
          ...history,
          latestAssistant,
          { role: "user", content: results },
        ];
      }

      // Persist the conversation with everything we've appended
      setConversations((prev) => {
        saveConversations(prev);
        return prev;
      });

      void logAudit({
        action: isFirstMessage ? "bernard_chat_started" : "bernard_chat_followup",
        entity_type: "ai_analysis",
        entity_id: convo.id,
        entity_name: convo.title,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("abort")) {
        // user cancelled mid-stream — leave the partial state
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

  // Backwards-compat alias so existing call sites keep working
  const runStreaming = runAgentic;

  const startConversation = async (preset: Preset | null, customPrompt?: string) => {
    const userMessage = preset ? preset.prompt : (customPrompt ?? "").trim();
    if (!userMessage) return toast.error("Type a question first");

    const days = preset?.days ?? dataWindow;
    setStreaming(true);
    setError(null);

    // Forecast presets get the deterministic forecast math instead of the
    // standard business snapshot. Everything else uses the snapshot.
    let dataSection: string;
    let range: { start: string; end: string };
    try {
      if (preset?.kind === "forecast") {
        const { summary } = await gatherForecastInputs();
        // Pair the forecast math with the standard 90-day snapshot — Bernard
        // benefits from BOTH the numbers and the qualitative context (which
        // creators / channels are growing or shrinking).
        const snapshot = await gatherBusinessSnapshot(90);
        dataSection = forecastToContext(summary) + "\n\n" + snapshotToContext(snapshot);
        range = snapshot.range;
        setSnapshotInfo({ generated_at: snapshot.generated_at, range });
      } else {
        const snapshot = await gatherBusinessSnapshot(days);
        dataSection = snapshotToContext(snapshot);
        range = snapshot.range;
        setSnapshotInfo({ generated_at: snapshot.generated_at, range });
      }
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
      range,
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

    await runStreaming(convo, dataSection, userMessage, /* isFirstMessage */ true);
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
    <div className="flex flex-col h-[calc(100vh-5rem)] -mx-2 sm:-mx-4 -mt-4">
      <Toaster />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      {/* Compact, ChatGPT/Claude-style — small avatar + name + actions on the right.
          pr-44 leaves room for the absolute-positioned sync + notif badges in __root.tsx */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-border/60 bg-card/40 backdrop-blur-md pr-44">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-[0_2px_12px_-3px_oklch(0.6_0.15_35/0.5)] shrink-0">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight leading-tight">Bernard</h1>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground -mt-0.5">
              {snapshotInfo ? (
                <>
                  <span className="inline-block h-1 w-1 rounded-full bg-success" />
                  <span>{snapshotInfo.range.start} → {snapshotInfo.range.end}</span>
                </>
              ) : (
                <span>OFM strategist · live data</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={newChat} className="text-xs h-8">
            <Plus className="h-3.5 w-3.5 mr-1" /> New chat
          </Button>
          <ConversationsPopover
            conversations={conversations}
            activeId={activeId}
            onPick={(id) => { setActiveId(id); setShowPresets(false); }}
            onDelete={deleteConversation}
            onClearAll={clearAll}
          />
        </div>
      </div>

      {/* ── API key warning ────────────────────────────────────────────── */}
      {hasKey === false && (
        <div className="mx-4 mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <span className="font-medium">Bernard needs an Anthropic API key.</span>{" "}
            <Link to="/settings" className="text-primary hover:underline inline-flex items-center gap-0.5">
              Open Settings <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* ── Streaming indicator with prominent Stop ────────────────────── */}
      {/* Sticky pill near the top of the chat area whenever Bernard is
          working on a turn. The composer's Stop button is small and
          users miss it; this one floats over the response so it's
          impossible to miss. Click stops the in-flight stream + any
          tool execution mid-flight. */}
      {streaming && (
        <div className="sticky top-0 z-20 flex justify-center pointer-events-none">
          <div className="pointer-events-auto mt-3 inline-flex items-center gap-3 rounded-full border border-border bg-card/95 backdrop-blur-md shadow-lg px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/70" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-xs text-muted-foreground">
              Bernard is working…
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={cancelStreaming}
              className="h-7 px-2.5 rounded-full bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
            >
              <X className="h-3 w-3 mr-1" />
              <span className="text-[11px]">Stop</span>
            </Button>
          </div>
        </div>
      )}

      {/* ── Conversation area ──────────────────────────────────────────── */}
      {/* Borderless flow column — content breathes against the page bg the
          way Claude / ChatGPT do, instead of being trapped inside a card. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6">
          {!activeConvo && showPresets && (
            <PresetGrid
              disabled={hasKey === false || streaming}
              onPick={(p) => startConversation(p)}
              userName={userName}
            />
          )}
          {activeConvo && (
            <div className="space-y-6">
              {activeConvo.messages.map((msg, i) => (
                <ChatBubble
                  key={i}
                  message={msg}
                  isStreaming={streaming && i === activeConvo.messages.length - 1 && msg.role === "assistant"}
                  toolCallStates={toolCallStates}
                  onApproveTool={onApproveTool}
                  onRejectTool={onRejectTool}
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
      </div>

      {/* ── Composer ───────────────────────────────────────────────────── */}
      {/* Sticky composer at the bottom of the chat column, soft shadow and
          rounded-2xl to match Claude/ChatGPT. The textarea has no inner
          border — the wrapper carries the visuals. */}
      <div className="border-t border-border/40 bg-gradient-to-b from-background/0 via-background/80 to-background pt-3 pb-4">
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-6">
          <div className="rounded-2xl border border-border bg-card shadow-[0_8px_24px_-12px_rgba(0,0,0,0.4)] focus-within:border-primary/40 focus-within:shadow-[0_8px_28px_-10px_oklch(0.6_0.15_35/0.25)] transition-all">
            <Textarea
              placeholder={
                activeConvo
                  ? "Reply to Bernard…"
                  : "Ask Bernard about the business…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter to send (Shift+Enter for newline) — matches Claude.
                // Cmd/Ctrl+Enter still works as a power-user fallback.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (activeConvo) sendFollowup();
                  else startConversation(null, input);
                }
              }}
              rows={1}
              disabled={hasKey === false}
              className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-4 pt-3.5 pb-1 shadow-none text-[15px] leading-6 max-h-48 overflow-y-auto bg-transparent"
            />
            <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-1">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {!activeConvo ? (
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Window</Label>
                    <Select value={String(dataWindow)} onValueChange={(v) => setDataWindow(Number(v) as 7 | 30 | 90)}>
                      <SelectTrigger className="w-28 h-7 text-[11px] border-border/60">
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
                  <div className="text-[10px] text-muted-foreground truncate">
                    Continuing chat ·{" "}
                    <button onClick={newChat} className="text-primary hover:underline">new chat</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  <kbd className="font-mono text-[9px] bg-secondary/60 px-1 py-0.5 rounded">↵</kbd> send · <kbd className="font-mono text-[9px] bg-secondary/60 px-1 py-0.5 rounded">⇧↵</kbd> newline
                </span>
                {streaming ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelStreaming}
                    className="h-8 px-3 rounded-full bg-rose-500/10 border-rose-500/40 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
                    aria-label="Stop Bernard"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Stop
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    onClick={() => activeConvo ? sendFollowup() : startConversation(null, input)}
                    disabled={hasKey === false || !input.trim()}
                    className="h-8 w-8 rounded-full"
                    aria-label="Send"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground/70 text-center mt-1.5">
            Bernard sees your live agency data — verify before acting on financial decisions.
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
            // Row is a flex container with two siblings — a clickable
            // body and a delete button. Previously we wrapped the whole
            // row in a <button> with the delete <button> nested inside,
            // which is invalid HTML and triggered a React hydration
            // warning.
            conversations.map((c) => (
              <div
                key={c.id}
                className={`group flex items-start gap-2 border-b border-border last:border-0 transition-colors ${
                  activeId === c.id ? "bg-primary/5" : "hover:bg-secondary/40"
                }`}
              >
                <button
                  onClick={() => { onPick(c.id); setOpen(false); }}
                  className="flex-1 min-w-0 text-left p-3"
                >
                  <div className="text-xs font-medium truncate">{c.title}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {c.messages.filter((m) => m.role === "user").length} turn{c.messages.filter((m) => m.role === "user").length === 1 ? "" : "s"} · {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
                  </div>
                </button>
                <button
                  onClick={() => onDelete(c.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-3 -ml-2"
                  aria-label="Delete conversation"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Preset grid ─────────────────────────────────────────────────────────────

// IDs of the 4 presets shown by default on a fresh chat — the
// "executive shortcuts." The remaining presets are hidden behind a
// "Show all" toggle so the empty-state isn't a wall of cards.
const FEATURED_PRESET_IDS = ["weekly_digest", "monthly_review", "top_performers", "revenue_forecast"];

function PresetGrid({
  disabled, onPick, userName,
}: {
  disabled: boolean;
  onPick: (p: Preset) => void;
  userName: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const featured = PRESETS.filter((p) => FEATURED_PRESET_IDS.includes(p.id));
  const rest = PRESETS.filter((p) => !FEATURED_PRESET_IDS.includes(p.id));

  return (
    <div className="space-y-8 py-4">
      {/* Personal greeting — feels like Claude.ai's home screen */}
      <div className="text-center space-y-2 pt-4">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary-glow shadow-[0_4px_20px_-4px_oklch(0.6_0.15_35/0.5)] mb-2">
          <Sparkles className="h-6 w-6 text-primary-foreground" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">
          Hey {userName}, what can I help you with?
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick a shortcut or just type a question.
        </p>
      </div>

      {/* Featured 4 — compact chips, 2x2 on mobile, 4-across on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {featured.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              disabled={disabled}
              className={`group rounded-xl border p-3 text-left transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${TONE_BORDER[p.tone]}`}
            >
              <div className={`h-7 w-7 rounded-md bg-background/50 flex items-center justify-center mb-2 ${TONE_ICON[p.tone]}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="text-xs font-semibold leading-tight">{p.title}</div>
              <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mt-1.5">
                {p.days}d
              </div>
            </button>
          );
        })}
      </div>

      {/* Show-all toggle — hides the long tail until asked for */}
      {!showAll && rest.length > 0 && (
        <div className="flex justify-center">
          <button
            onClick={() => setShowAll(true)}
            disabled={disabled}
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-secondary/50 transition-colors disabled:opacity-50"
          >
            <ChevronDown className="h-3.5 w-3.5" /> Show {rest.length} more presets
          </button>
        </div>
      )}

      {/* Long-tail presets — same compact treatment, scrollable if many */}
      {showAll && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              All presets
            </h3>
            <button
              onClick={() => setShowAll(false)}
              className="text-[11px] text-muted-foreground hover:text-primary"
            >
              Hide
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {rest.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => onPick(p)}
                  disabled={disabled}
                  className={`group rounded-xl border p-3 text-left transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${TONE_BORDER[p.tone]}`}
                >
                  <div className={`h-7 w-7 rounded-md bg-background/50 flex items-center justify-center mb-2 ${TONE_ICON[p.tone]}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="text-xs font-semibold leading-tight">{p.title}</div>
                  <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mt-1.5">
                    {p.days}d
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Chat bubble + markdown render ────────────────────────────────────────────

function ChatBubble({
  message, isStreaming, toolCallStates, onApproveTool, onRejectTool,
}: {
  message: AgenticChatMessage;
  isStreaming: boolean;
  toolCallStates: Record<string, ToolCallState>;
  onApproveTool: (id: string) => void;
  onRejectTool: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  // ── User bubble ─────────────────────────────────────────────────────
  // Right-aligned soft pill, capped width so long messages wrap. Matches
  // Claude.ai's user bubble — content-first, no avatar clutter.
  if (message.role === "user") {
    // Tool-result-only user messages are rendered as compact "Bernard ran X" notes,
    // since they're system-generated bridges in the agentic loop, not real user input.
    if (Array.isArray(message.content)) {
      return null; // tool results are surfaced inside the ToolCallCard above; no separate bubble
    }
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-secondary/70 border border-border/40 px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-foreground/95">
          {message.content}
        </div>
      </div>
    );
  }

  // ── Assistant bubble ────────────────────────────────────────────────
  const blocks = typeof message.content === "string"
    ? (message.content ? [{ type: "text" as const, text: message.content }] : [])
    : message.content;

  // Plain-text concatenation for the Copy button
  const allText = blocks.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n\n");

  const onCopy = async () => {
    if (!allText) return;
    await navigator.clipboard.writeText(allText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Assistant flows in the column without a containing bubble — same as
  // Claude.ai. Small avatar pin to the left, content takes the full width.
  return (
    <div className="flex gap-3 group">
      <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shrink-0 mt-1 shadow-[0_2px_8px_-2px_oklch(0.6_0.15_35/0.4)]">
        <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        {!isStreaming && allText && (
          <div className="flex items-center justify-end mb-1">
            <button
              onClick={onCopy}
              className="opacity-0 group-hover:opacity-100 text-[11px] text-muted-foreground hover:text-foreground transition-opacity inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-secondary/50"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        {blocks.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" /> thinking…
          </div>
        ) : (
          <div className="space-y-2">
            {blocks.map((b, i) => {
              if (b.type === "text") {
                return (
                  <div key={i} className="prose prose-sm max-w-none">
                    {renderMarkdown(b.text)}
                    {isStreaming && i === blocks.length - 1 && b.text && (
                      <span className="inline-block w-1.5 h-3.5 bg-primary/60 ml-0.5 align-middle animate-pulse" />
                    )}
                  </div>
                );
              }
              if (b.type === "tool_use") {
                const state = toolCallStates[b.id];
                return (
                  <ToolCallCard
                    key={b.id}
                    toolName={b.name}
                    input={b.input}
                    state={state}
                    onApprove={() => onApproveTool(b.id)}
                    onReject={() => onRejectTool(b.id)}
                  />
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool call card ──────────────────────────────────────────────────────
//
// Renders inline inside Bernard's bubble for each tool call. Read tools
// auto-execute and show as compact "called X — done" strips. Write tools
// show an approval card with the inputs.

function ToolCallCard({
  toolName, input, state, onApprove, onReject,
}: {
  toolName: string;
  input: Record<string, unknown>;
  state: ToolCallState | undefined;
  onApprove: () => void;
  onReject: () => void;
}) {
  const tool = useMemo(() => getTool(toolName) ?? null, [toolName]);
  const status: ToolCallStatus = state?.status ?? "executing";

  if (!tool) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
        Unknown tool: <code className="font-mono">{toolName}</code>
      </div>
    );
  }

  const isRead = tool.category === "read";
  const callDescription = tool.describeCall?.(input) ?? `${tool.label}`;

  // Compact display for read-only tools (auto-executed, low-friction)
  if (isRead) {
    return (
      <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs flex items-center gap-2">
        <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground font-medium">{tool.label}</span>
        <span className="text-muted-foreground/70 truncate flex-1">· {summarizeInput(input)}</span>
        <ToolStatusBadge status={status} />
      </div>
    );
  }

  // Detailed approval card for write/destructive tools
  const isPending = status === "pending_approval";
  const isExecuting = status === "executing";
  const isDone = status === "done";
  const isError = status === "error";
  const isRejected = status === "rejected";

  return (
    <div className={`rounded-xl border p-3 ${
      isPending ? "border-warning/40 bg-warning/5" :
      isDone ? "border-success/30 bg-success/5" :
      isError ? "border-destructive/30 bg-destructive/5" :
      isRejected ? "border-border bg-secondary/30 opacity-70" :
      "border-border bg-card"
    }`}>
      <div className="flex items-start gap-2.5">
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
          isPending ? "bg-warning/20 text-warning" :
          isDone ? "bg-success/20 text-success" :
          isError ? "bg-destructive/20 text-destructive" :
          "bg-primary/10 text-primary"
        }`}>
          {isPending ? <ShieldAlert className="h-3.5 w-3.5" /> :
           isExecuting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
           isDone ? <ShieldCheck className="h-3.5 w-3.5" /> :
           isError ? <ShieldAlert className="h-3.5 w-3.5" /> :
           isRejected ? <ShieldAlert className="h-3.5 w-3.5" /> :
           <Wrench className="h-3.5 w-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold">{tool.label}</span>
            <ToolStatusBadge status={status} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{tool.blurb}</p>
          <div className="text-[11px] text-foreground/85 mt-2 font-mono bg-secondary/60 rounded p-2 break-words">
            {callDescription}
          </div>
          {state?.result && (status === "done" || status === "error") && (
            <details className="mt-2 text-[10px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">Result</summary>
              <pre className="mt-1 p-2 bg-secondary/40 rounded overflow-x-auto text-[10px] font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                {state.result}
              </pre>
            </details>
          )}
        </div>
        {isPending && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button size="sm" onClick={onApprove} className="text-xs h-7">
              <ShieldCheck className="h-3 w-3 mr-1" /> Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={onReject} className="text-xs h-7 text-muted-foreground hover:text-destructive">
              <X className="h-3 w-3 mr-1" /> Reject
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolStatusBadge({ status }: { status: ToolCallStatus }) {
  const map: Record<ToolCallStatus, { label: string; cls: string }> = {
    pending_approval: { label: "Awaiting approval", cls: "text-warning bg-warning/10 border-warning/20" },
    executing:        { label: "Running…",          cls: "text-primary bg-primary/10 border-primary/20" },
    done:             { label: "Done",              cls: "text-success bg-success/10 border-success/20" },
    error:            { label: "Error",             cls: "text-destructive bg-destructive/10 border-destructive/20" },
    rejected:         { label: "Rejected",          cls: "text-muted-foreground bg-secondary border-border" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  );
}

/** Best-effort one-line summary of a tool call's inputs for compact rendering. */
function summarizeInput(input: Record<string, unknown>): string {
  const keys = Object.keys(input);
  if (keys.length === 0) return "(no args)";
  return keys.slice(0, 3).map((k) => `${k}: ${truncate(JSON.stringify(input[k]), 30)}`).join(", ") + (keys.length > 3 ? "…" : "");
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
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

  // ── Table helpers ───────────────────────────────────────────────────
  // Markdown tables look like:
  //   | Field | Value |
  //   |-------|-------|
  //   | foo   | bar   |
  // We detect them by looking for a "row" line followed by a separator
  // line of dashes — without that pair, we treat the | as plain text so
  // we don't false-positive on regular content.
  const isTableRow = (s: string) => /^\|.+\|$/.test(s.trim());
  const isTableSeparator = (s: string) => /^\|\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|$/.test(s.trim());
  const parseRow = (s: string): string[] => {
    const trimmed = s.trim();
    return trimmed.slice(1, -1).split("|").map((c) => c.trim());
  };

  // Index-based loop so table parsing can advance past consumed lines
  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const t = rawLine.trimEnd();

    // Table block — only kicks in when row+separator pattern is present
    if (isTableRow(t) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushList();
      const headers = parseRow(t);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      out.push(
        <div key={`table-${out.length}`} className="my-3 overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                {headers.map((h, hi) => (
                  <th
                    key={hi}
                    className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: inlineFmt(h) }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`px-3 py-2 align-top text-foreground/90 ${ci === 0 ? "font-medium" : ""}`}
                      dangerouslySetInnerHTML={{ __html: inlineFmt(cell) }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Horizontal rule — `---` on its own line
    if (/^-{3,}$/.test(t.trim())) {
      flushList();
      out.push(<hr key={out.length} className="my-3 border-border" />);
      i++;
      continue;
    }

    if (!t.trim()) { flushList(); i++; continue; }

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
    i++;
  }
  flushList();
  return <>{out}</>;
}
