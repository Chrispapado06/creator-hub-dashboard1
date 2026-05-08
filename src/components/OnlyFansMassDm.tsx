// Per-creator mass-DM composer + scheduler.
//
// One subtab on the OF creator-detail view. Lets the agency:
//   • Compose a message + optional PPV price
//   • Pick an audience (active subs / expired / specific OF list)
//   • Send immediately OR schedule for a future ISO time
//   • See the history of every blast we've fired with status
//
// On send, two things happen:
//   1. A row in of_scheduled_messages logs everything (who scheduled,
//      when, recipient, status). Survives even if the API call fails.
//   2. POST to OF /api/{account}/queue/messages does the actual work.
//
// We don't poll OF for status updates after the fact — the local row
// records what we asked for; a refresh button re-pulls /queue/messages
// and reconciles.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import {
  Megaphone, Send, Calendar as CalendarIcon, Users, RefreshCw,
  Trash2, AlertCircle, CheckCircle2, Clock, XCircle, DollarSign,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  sendMassMessage, listLists,
  type MassMessageRecipient, type OfList, OfApiError,
} from "@/lib/of-api";

type RecipientType = MassMessageRecipient["type"];

type ScheduledRow = {
  id: string;
  creator_id: string;
  of_account_id: string;
  text: string;
  price: number;
  recipient_type: RecipientType;
  recipient_list_id: number | null;
  recipient_user_ids: number[];
  scheduled_at: string | null;
  status: "draft" | "scheduled" | "sent" | "failed" | "cancelled";
  of_queue_id: number | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
};

export function OnlyFansMassDm({
  accountId, creatorId, creatorName,
}: {
  accountId: string;
  creatorId: string;
  creatorName: string;
}) {
  // Composer state
  const [text, setText] = useState("");
  const [price, setPrice] = useState<string>("");
  const [recipientType, setRecipientType] = useState<RecipientType>("active");
  const [recipientListId, setRecipientListId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);

  // Available OF lists (for the recipient picker)
  const [lists, setLists] = useState<OfList[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);

  // History
  const [history, setHistory] = useState<ScheduledRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Load lists + history on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingLists(true);
      try {
        const ls = await listLists(accountId);
        if (!cancelled) setLists(ls);
      } catch (e) {
        if (e instanceof OfApiError) toast.error(`Couldn't load lists: ${e.message}`);
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId]);

  const refreshHistory = async () => {
    setRefreshing(true);
    const { data } = await supabase
      .from("of_scheduled_messages")
      .select("*")
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false })
      .limit(50);
    setHistory((data ?? []) as ScheduledRow[]);
    setRefreshing(false);
  };

  useEffect(() => { void refreshHistory(); }, [creatorId]);

  // ── Send / schedule ───────────────────────────────────────────────

  const onSend = async () => {
    if (!text.trim()) {
      toast.error("Message is empty");
      return;
    }
    if (recipientType === "list" && !recipientListId) {
      toast.error("Pick a list");
      return;
    }
    setSending(true);

    // Build the recipient strategy in the shape the OF lib expects
    const recipient: MassMessageRecipient =
      recipientType === "list"
        ? { type: "list", listId: Number(recipientListId) }
        : recipientType === "userIds"
          ? { type: "userIds", userIds: [] }     // not exposed in v1 UI
          : { type: recipientType };              // all/active/expired

    const numericPrice = price ? Math.max(0, Number(price)) : 0;
    const scheduleIso = scheduledAt ? scheduledAt.toISOString() : null;

    // Always log the attempt locally first so we have history even on
    // API failure. status = scheduled or sent depending on whether
    // there's a future scheduledAt.
    const insertedStatus: ScheduledRow["status"] = scheduleIso ? "scheduled" : "sent";
    const { data: inserted, error: insertErr } = await supabase
      .from("of_scheduled_messages")
      .insert({
        creator_id: creatorId,
        of_account_id: accountId,
        text: text.trim(),
        price: numericPrice,
        recipient_type: recipientType,
        recipient_list_id: recipientType === "list" ? Number(recipientListId) : null,
        recipient_user_ids: [],
        scheduled_at: scheduleIso,
        status: "draft",
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      setSending(false);
      toast.error(`Local save failed: ${insertErr?.message ?? "unknown"}`);
      return;
    }

    // Fire the OF API call
    try {
      await sendMassMessage(accountId, {
        text: text.trim(),
        price: numericPrice,
        recipient,
        scheduledAt: scheduleIso ?? undefined,
      });
      await supabase.from("of_scheduled_messages").update({
        status: insertedStatus,
        sent_at: scheduleIso ? null : new Date().toISOString(),
      }).eq("id", inserted.id);
      toast.success(scheduleIso
        ? `Scheduled for ${format(scheduledAt!, "MMM d, h:mm a")}`
        : `Sent to ${labelForRecipient(recipientType, recipientListId, lists)}`);
      // Reset composer
      setText("");
      setPrice("");
      setScheduledAt(null);
      void refreshHistory();
    } catch (e) {
      const msg = e instanceof OfApiError ? e.message : (e instanceof Error ? e.message : "Unknown error");
      await supabase.from("of_scheduled_messages").update({
        status: "failed",
        error_message: msg,
      }).eq("id", inserted.id);
      toast.error(`OF API: ${msg}`);
      void refreshHistory();
    } finally {
      setSending(false);
    }
  };

  const onCancel = async (row: ScheduledRow) => {
    if (!confirm("Cancel this scheduled message?")) return;
    // Local mark only — we don't have an OF cancel endpoint exposed.
    // Future: call OF /queue/messages/{id} DELETE if available.
    await supabase
      .from("of_scheduled_messages")
      .update({ status: "cancelled" })
      .eq("id", row.id);
    toast.success("Marked cancelled (locally)");
    void refreshHistory();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-5">
      {/* Composer */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Megaphone className="h-4 w-4 text-primary" /> Mass DM blast
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Compose once, fan out to a whole audience. Schedule for later or send right now.
          </p>
        </div>

        {/* Audience picker */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            <Users className="h-3 w-3" /> Audience
          </Label>
          <Select value={recipientType} onValueChange={(v) => setRecipientType(v as RecipientType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active subscribers</SelectItem>
              <SelectItem value="expired">Expired subscribers</SelectItem>
              <SelectItem value="all">All fans (active + expired)</SelectItem>
              <SelectItem value="list" disabled={lists.length === 0}>
                Custom OF list{lists.length === 0 ? " (none found)" : ""}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {recipientType === "list" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Pick a list</Label>
            <Select value={recipientListId} onValueChange={setRecipientListId}>
              <SelectTrigger><SelectValue placeholder={loadingLists ? "Loading…" : "Select list…"} /></SelectTrigger>
              <SelectContent>
                {lists.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}{l.usersCount ? ` (${l.usersCount})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Message body */}
        <div className="space-y-1.5">
          <Label className="text-xs">Message</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Hey babe! 🎁 Just dropped a new set — locked content for you below."
          />
          <div className="text-[10px] text-muted-foreground text-right">{text.length} chars</div>
        </div>

        {/* PPV + schedule row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> PPV price (optional)
            </Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" /> Schedule (optional)
            </Label>
            <DateTimePicker value={scheduledAt} onChange={setScheduledAt} clearable />
          </div>
        </div>

        <Button onClick={onSend} disabled={sending || !text.trim()} className="w-full">
          {sending ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sending…</>
          ) : scheduledAt ? (
            <><CalendarIcon className="h-3.5 w-3.5 mr-1.5" /> Schedule blast</>
          ) : (
            <><Send className="h-3.5 w-3.5 mr-1.5" /> Send now</>
          )}
        </Button>
        <p className="text-[10px] text-muted-foreground">
          Routed through your OnlyFansAPI key. {creatorName}'s {labelForRecipient(recipientType, recipientListId, lists)} will receive it
          {scheduledAt ? ` on ${format(scheduledAt, "MMM d 'at' h:mm a")}` : " immediately"}.
        </p>
      </section>

      {/* History */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Recent blasts</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              History of every mass DM scheduled or sent for {creatorName}.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={refreshHistory} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {history.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-8 text-center border border-dashed border-border rounded-lg">
            No blasts yet. Send your first one ←
          </div>
        ) : (
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {history.map((row) => (
              <BlastCard key={row.id} row={row} lists={lists} onCancel={() => onCancel(row)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BlastCard({
  row, lists, onCancel,
}: {
  row: ScheduledRow;
  lists: OfList[];
  onCancel: () => void;
}) {
  const StatusIcon = row.status === "sent" ? CheckCircle2
    : row.status === "scheduled" ? Clock
    : row.status === "failed" ? AlertCircle
    : row.status === "cancelled" ? XCircle
    : Clock;
  const statusTone = row.status === "sent" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
    : row.status === "scheduled" ? "text-amber-400 border-amber-500/30 bg-amber-500/5"
    : row.status === "failed" ? "text-rose-400 border-rose-500/30 bg-rose-500/5"
    : row.status === "cancelled" ? "text-muted-foreground border-border bg-secondary/30"
    : "text-muted-foreground border-border bg-secondary/30";
  return (
    <div className={`rounded-lg border p-3 ${statusTone}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1">
          <StatusIcon className="h-3 w-3" /> {row.status}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {row.scheduled_at
            ? `Scheduled ${format(parseISO(row.scheduled_at), "MMM d, h:mm a")}`
            : row.sent_at
              ? `Sent ${formatDistanceToNow(parseISO(row.sent_at), { addSuffix: true })}`
              : `Created ${formatDistanceToNow(parseISO(row.created_at), { addSuffix: true })}`}
        </span>
      </div>
      <div className="text-xs text-foreground line-clamp-3 whitespace-pre-wrap">
        {row.text}
      </div>
      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-0.5">
          <Users className="h-2.5 w-2.5" /> {labelForRecipient(row.recipient_type, String(row.recipient_list_id ?? ""), lists)}
        </span>
        {row.price > 0 && (
          <span className="inline-flex items-center gap-0.5 text-amber-400">
            <DollarSign className="h-2.5 w-2.5" /> ${row.price.toFixed(2)} PPV
          </span>
        )}
        {row.error_message && (
          <span className="text-rose-400">· {row.error_message}</span>
        )}
        {row.status === "scheduled" && (
          <button
            onClick={onCancel}
            className="ml-auto inline-flex items-center gap-0.5 hover:text-rose-400"
          >
            <Trash2 className="h-2.5 w-2.5" /> Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function labelForRecipient(
  type: RecipientType,
  listIdStr: string,
  lists: OfList[],
): string {
  switch (type) {
    case "all":     return "all fans";
    case "active":  return "active subscribers";
    case "expired": return "expired subscribers";
    case "list": {
      const id = Number(listIdStr);
      const list = lists.find((l) => l.id === id);
      return list ? `list "${list.name}"` : "selected list";
    }
    case "userIds": return "specific fans";
  }
}
