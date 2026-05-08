// Per-creator mass-DM composer + scheduler.
//
// One subtab on the OF creator-detail view. Lets the agency:
//   • Compose a message + optional PPV price (OF cap: $1–$100)
//   • Attach photos / videos straight from the creator's OF Vault
//   • Pick an audience — built-in segments OR any custom OF list
//     (Whales, VIP, Top spenders, Bookmarks, etc.) the creator has
//     organized on their account
//   • Send immediately OR schedule for a future ISO time
//   • Confirm before firing — no "oh no I sent that to 12k fans"
//   • See the history of every blast we've fired with status
//
// On send, two things happen:
//   1. A row in of_scheduled_messages logs everything (who scheduled,
//      when, recipient, media, status). Survives even if the API call
//      fails — we update status='failed' with error_message in that case.
//   2. POST to OF /api/{account}/queue/messages does the actual work.
//
// Local row vs OF API: we don't poll OF for status updates after the
// fact — the local row records what we asked for. A refresh button
// re-pulls /queue/messages and reconciles.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/ui/date-picker";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Megaphone, Send, Calendar as CalendarIcon, Users, RefreshCw,
  Trash2, AlertCircle, CheckCircle2, Clock, XCircle, DollarSign,
  Image as ImageIcon, Crown, Star, Heart, UserCheck, UserX, Globe, X, Library,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  sendMassMessage, listLists,
  type MassMessageRecipient, type OfList, OfApiError,
} from "@/lib/of-api";
import { OnlyFansVaultPicker } from "./OnlyFansVaultPicker";

type RecipientType = MassMessageRecipient["type"];

type ScheduledRow = {
  id: string;
  creator_id: string;
  of_account_id: string;
  text: string;
  price: number;
  media_ids: number[];
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

// Heuristic — flag a list as a "whale tier" if its name suggests it.
// Visual nudge only; we never silently retarget.
const WHALE_KEYWORDS = ["whale", "vip", "top", "big", "spender", "premium", "diamond", "gold"];
function isWhaleList(name: string): boolean {
  const n = name.toLowerCase();
  return WHALE_KEYWORDS.some((k) => n.includes(k));
}

// Normalised audience selection. The two halves of the picker
// (built-in / OF list) collapse into this single value to drive
// confirm-dialog summaries and the API payload.
type AudienceChoice =
  | { kind: "builtin"; type: "active" | "expired" | "all" }
  | { kind: "list"; listId: number; list: OfList };

function audienceToRecipient(a: AudienceChoice): MassMessageRecipient {
  return a.kind === "builtin" ? { type: a.type } : { type: "list", listId: a.listId };
}

function audienceLabel(a: AudienceChoice | null): string {
  if (!a) return "no audience";
  if (a.kind === "builtin") {
    return a.type === "active" ? "active subscribers"
      : a.type === "expired" ? "expired subscribers"
      : "all fans";
  }
  return `"${a.list.name}"${a.list.usersCount ? ` (${a.list.usersCount} fans)` : ""}`;
}

export function OnlyFansMassDm({
  accountId, creatorId, creatorName,
}: {
  accountId: string;
  creatorId: string;
  creatorName: string;
}) {
  // ── Composer state ────────────────────────────────────────────────
  const [text, setText] = useState("");
  const [price, setPrice] = useState<string>("");
  const [audience, setAudience] = useState<AudienceChoice | null>({ kind: "builtin", type: "active" });
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);

  // Vault picker
  const [vaultOpen, setVaultOpen] = useState(false);
  const [mediaIds, setMediaIds] = useState<number[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<Record<number, string>>({});

  // Confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // Available OF lists
  const [lists, setLists] = useState<OfList[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);

  // History
  const [history, setHistory] = useState<ScheduledRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Load lists on mount / account change
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

  // Sort lists with whale-tier first so they're visually prominent.
  const sortedLists = useMemo(() => {
    return [...lists].sort((a, b) => {
      const aw = isWhaleList(a.name) ? 0 : 1;
      const bw = isWhaleList(b.name) ? 0 : 1;
      if (aw !== bw) return aw - bw;
      // then by users count desc, then alpha
      const ac = a.usersCount ?? 0;
      const bc = b.usersCount ?? 0;
      if (ac !== bc) return bc - ac;
      return a.name.localeCompare(b.name);
    });
  }, [lists]);

  // ── Validation ─────────────────────────────────────────────────────

  const numericPrice = price ? Math.max(0, Number(price)) : 0;
  const priceError =
    price === "" ? null
    : Number.isNaN(Number(price)) ? "Not a number"
    : numericPrice < 0 ? "Must be ≥ 0"
    : numericPrice > 0 && numericPrice < 1 ? "OF requires ≥ $1"
    : numericPrice > 100 ? "OF caps PPV at $100"
    : null;

  const canSubmit =
    text.trim().length > 0 &&
    audience !== null &&
    !priceError &&
    !sending;

  // ── Send / schedule ───────────────────────────────────────────────

  const onSend = async () => {
    if (!audience) {
      toast.error("Pick an audience");
      return;
    }
    setConfirmOpen(false);
    setSending(true);

    const recipient = audienceToRecipient(audience);
    const scheduleIso = scheduledAt ? scheduledAt.toISOString() : null;

    // Local audit row first (status='draft' until API confirms).
    const insertedStatus: ScheduledRow["status"] = scheduleIso ? "scheduled" : "sent";
    const { data: inserted, error: insertErr } = await supabase
      .from("of_scheduled_messages")
      .insert({
        creator_id: creatorId,
        of_account_id: accountId,
        text: text.trim(),
        price: numericPrice,
        media_ids: mediaIds,
        recipient_type: recipient.type,
        recipient_list_id: recipient.type === "list" ? recipient.listId : null,
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
        mediaIds,
        recipient,
        scheduledAt: scheduleIso ?? undefined,
      });
      await supabase.from("of_scheduled_messages").update({
        status: insertedStatus,
        sent_at: scheduleIso ? null : new Date().toISOString(),
      }).eq("id", inserted.id);
      toast.success(scheduleIso
        ? `Scheduled for ${format(scheduledAt!, "MMM d, h:mm a")}`
        : `Sent to ${audienceLabel(audience)}`);
      // Reset composer
      setText("");
      setPrice("");
      setScheduledAt(null);
      setMediaIds([]);
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
    await supabase
      .from("of_scheduled_messages")
      .update({ status: "cancelled" })
      .eq("id", row.id);
    toast.success("Marked cancelled (locally)");
    void refreshHistory();
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-5">
      {/* ── Composer ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Megaphone className="h-4 w-4 text-primary" /> Mass DM blast
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Compose once, fan out to a whole audience. Schedule for later or send right now.
          </p>
        </div>

        {/* ── Audience picker ───────────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1">
            <Users className="h-3 w-3" /> Audience
          </Label>

          {/* Built-in segments */}
          <div className="grid grid-cols-3 gap-2">
            <SegmentCard
              icon={<UserCheck className="h-3.5 w-3.5" />}
              label="Active subs"
              hint="Currently paying"
              selected={audience?.kind === "builtin" && audience.type === "active"}
              onClick={() => setAudience({ kind: "builtin", type: "active" })}
            />
            <SegmentCard
              icon={<UserX className="h-3.5 w-3.5" />}
              label="Expired"
              hint="Lapsed subs"
              selected={audience?.kind === "builtin" && audience.type === "expired"}
              onClick={() => setAudience({ kind: "builtin", type: "expired" })}
            />
            <SegmentCard
              icon={<Globe className="h-3.5 w-3.5" />}
              label="All fans"
              hint="Active + expired"
              selected={audience?.kind === "builtin" && audience.type === "all"}
              onClick={() => setAudience({ kind: "builtin", type: "all" })}
            />
          </div>

          {/* OF custom lists — only shown when there are any */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                OF lists {loadingLists ? "(loading…)" : sortedLists.length > 0 ? `(${sortedLists.length})` : ""}
              </span>
              {!loadingLists && sortedLists.length === 0 && (
                <span className="text-[10px] text-muted-foreground italic">
                  Create lists on OnlyFans → Lists
                </span>
              )}
            </div>
            {sortedLists.length > 0 && (
              <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                {sortedLists.map((l) => (
                  <ListCard
                    key={l.id}
                    list={l}
                    selected={audience?.kind === "list" && audience.listId === l.id}
                    onClick={() => setAudience({ kind: "list", listId: l.id, list: l })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Message body ─────────────────────────────────────── */}
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

        {/* ── Vault attachments ────────────────────────────────── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1">
              <Library className="h-3 w-3" /> Vault attachments
              {mediaIds.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center px-1.5 h-4 text-[9px] rounded bg-secondary text-secondary-foreground font-semibold">
                  {mediaIds.length}
                </span>
              )}
            </Label>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setVaultOpen(true)}
              className="h-7 text-[11px]"
            >
              <ImageIcon className="h-3 w-3 mr-1" />
              {mediaIds.length === 0 ? "Add from vault" : "Edit"}
            </Button>
          </div>
          {mediaIds.length === 0 ? (
            <button
              onClick={() => setVaultOpen(true)}
              className="w-full rounded-md border border-dashed border-border bg-secondary/20 hover:bg-secondary/40 py-3 text-[11px] text-muted-foreground"
            >
              No attachments — text-only DM
            </button>
          ) : (
            <div className="flex gap-1.5 flex-wrap">
              {mediaIds.map((id) => (
                <div key={id} className="relative h-14 w-14 rounded-md overflow-hidden border border-border bg-secondary/40">
                  {mediaPreviews[id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaPreviews[id]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <button
                    onClick={() => setMediaIds((p) => p.filter((x) => x !== id))}
                    className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/70 text-white inline-flex items-center justify-center hover:bg-rose-500"
                    aria-label="Remove attachment"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── PPV price + schedule ─────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <DollarSign className="h-3 w-3" /> PPV price (1–100)
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0 = free"
              aria-invalid={priceError ? true : undefined}
              className={priceError ? "border-rose-500/60" : undefined}
            />
            {priceError && <p className="text-[10px] text-rose-400">{priceError}</p>}
            {!priceError && mediaIds.length > 0 && numericPrice === 0 && (
              <p className="text-[10px] text-amber-400/80">⚠ Media will be free — set a price to lock as PPV</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" /> Schedule (optional)
            </Label>
            <DateTimePicker value={scheduledAt} onChange={setScheduledAt} clearable />
          </div>
        </div>

        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={!canSubmit}
          className="w-full"
        >
          {sending ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sending…</>
          ) : scheduledAt ? (
            <><CalendarIcon className="h-3.5 w-3.5 mr-1.5" /> Review & schedule</>
          ) : (
            <><Send className="h-3.5 w-3.5 mr-1.5" /> Review & send</>
          )}
        </Button>
        <p className="text-[10px] text-muted-foreground">
          Routed through your OnlyFansAPI key. {creatorName}'s {audienceLabel(audience)} will receive it
          {scheduledAt ? ` on ${format(scheduledAt, "MMM d 'at' h:mm a")}` : " immediately"}.
        </p>
      </section>

      {/* ── History ────────────────────────────────────────────── */}
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

      {/* ── Vault picker dialog ───────────────────────────────── */}
      <OnlyFansVaultPicker
        accountId={accountId}
        open={vaultOpen}
        onOpenChange={setVaultOpen}
        selectedMediaIds={mediaIds}
        onConfirm={(ids, previews) => {
          setMediaIds(ids);
          setMediaPreviews((prev) => ({ ...prev, ...previews }));
        }}
      />

      {/* ── Confirm dialog ────────────────────────────────────── */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {scheduledAt ? "Schedule this blast?" : "Send this blast now?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Review the details below — this will land in real fans' inboxes from {creatorName}'s OF account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Rich preview lives outside Description so we don't nest <div>s
              inside the <p> that Radix renders for the description. */}
          <div className="space-y-2 text-xs">
            <SummaryRow label="From" value={creatorName} />
            <SummaryRow label="To" value={audienceLabel(audience)} bold />
            <SummaryRow
              label={scheduledAt ? "Schedules" : "Delivery"}
              value={scheduledAt ? format(scheduledAt, "MMM d, yyyy 'at' h:mm a") : "Immediately"}
            />
            {numericPrice > 0 && (
              <SummaryRow label="PPV price" value={`$${numericPrice.toFixed(2)}`} />
            )}
            {mediaIds.length > 0 && (
              <SummaryRow
                label="Attachments"
                value={`${mediaIds.length} vault item${mediaIds.length === 1 ? "" : "s"}`}
              />
            )}
            <div className="rounded-md border border-border bg-secondary/30 p-2.5 mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px]">
              {text.trim()}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Back</AlertDialogCancel>
            <AlertDialogAction onClick={onSend} disabled={sending}>
              {scheduledAt ? "Yes, schedule" : "Yes, send now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────

function SegmentCard({
  icon, label, hint, selected, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-md border p-2.5 transition-all ${
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary/40"
          : "border-border bg-secondary/30 hover:bg-secondary/60"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium mb-0.5">
        {icon} {label}
      </div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </button>
  );
}

function ListCard({
  list, selected, onClick,
}: {
  list: OfList;
  selected: boolean;
  onClick: () => void;
}) {
  const whale = isWhaleList(list.name);
  const Icon = whale ? Crown : list.type === "favorite" ? Heart : Star;
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-md border p-2.5 transition-all ${
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary/40"
          : whale
            ? "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
            : "border-border bg-secondary/30 hover:bg-secondary/60"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Icon className={`h-3.5 w-3.5 ${whale ? "text-amber-400" : "text-primary"}`} />
        <span className="truncate">{list.name}</span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        {list.usersCount !== undefined ? `${list.usersCount} fan${list.usersCount === 1 ? "" : "s"}` : "—"}
        {whale && <span className="ml-1.5 text-amber-400">· whale tier</span>}
      </div>
    </button>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-semibold text-foreground" : "text-foreground"}>{value}</span>
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
  const mediaCount = Array.isArray(row.media_ids) ? row.media_ids.length : 0;
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
        {mediaCount > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <ImageIcon className="h-2.5 w-2.5" /> {mediaCount} attachment{mediaCount === 1 ? "" : "s"}
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
