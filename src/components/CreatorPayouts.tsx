// Per-creator payout dashboard.
//
// Lives as a tab on the creator detail page. Three sections:
//   1. Settings — agency split % and OF platform fee % (snapshotted onto
//      every payout so historical math doesn't shift if these change later)
//   2. Generate — pick a date range, pull gross from organic + internal
//      entries, compute the split, add deductions, save as draft.
//   3. History — table of all payouts with status pills (draft/sent/paid),
//      inline edit, and "mark paid" action.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Wallet, Plus, Trash2, Calculator, CheckCircle2, Send, FileText,
  TrendingUp, Calendar, Save, X, Pencil, DollarSign, Percent,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subDays, subMonths } from "date-fns";
import { logAudit } from "@/lib/audit";

type Deduction = { label: string; amount: number };
type Status = "draft" | "sent" | "paid";

type Payout = {
  id: string;
  creator_id: string;
  period_start: string;
  period_end: string;
  gross_revenue: number;
  of_platform_fee: number;
  agency_cut: number;
  deductions: Deduction[];
  net_to_creator: number;
  split_pct_snapshot: number | null;
  fee_pct_snapshot: number | null;
  status: Status;
  payment_method: string | null;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Settings = {
  payout_split_pct: number;
  of_platform_fee_pct: number;
};

const STATUS_STYLES: Record<Status, string> = {
  draft: "bg-secondary text-muted-foreground border-border",
  sent:  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  paid:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

const sumDeductions = (d: Deduction[]) =>
  d.reduce((s, x) => s + (Number(x.amount) || 0), 0);

// Net to creator: gross → minus OF platform fee → that's the agency-managed
// pool → split between agency and creator → minus deductions
const computeNet = (gross: number, fee: number, agencyCut: number, deductions: Deduction[]) =>
  Math.max(0, gross - fee - agencyCut - sumDeductions(deductions));

export function CreatorPayouts({
  creatorId, creatorName,
}: {
  creatorId: string;
  creatorName?: string;
}) {
  const [settings, setSettings] = useState<Settings>({ payout_split_pct: 80, of_platform_fee_pct: 20 });
  const [savingSettings, setSavingSettings] = useState(false);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate-payout form
  const [genFrom, setGenFrom] = useState<Date | null>(startOfMonth(subMonths(new Date(), 1)));
  const [genTo, setGenTo] = useState<Date | null>(endOfMonth(subMonths(new Date(), 1)));
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: cRow }, { data: pRows }] = await Promise.all([
      supabase
        .from("creators")
        .select("payout_split_pct, of_platform_fee_pct")
        .eq("id", creatorId)
        .maybeSingle(),
      supabase
        .from("creator_payouts")
        .select("*")
        .eq("creator_id", creatorId)
        .order("period_end", { ascending: false }),
    ]);
    if (cRow) {
      setSettings({
        payout_split_pct: Number((cRow as any).payout_split_pct ?? 80),
        of_platform_fee_pct: Number((cRow as any).of_platform_fee_pct ?? 20),
      });
    }
    setPayouts(((pRows ?? []) as unknown as Payout[]).map((p) => ({
      ...p,
      deductions: Array.isArray(p.deductions) ? p.deductions : [],
    })));
    setLoading(false);
  };

  useEffect(() => { void load(); }, [creatorId]);

  // ── Settings ──────────────────────────────────────────────────────────

  const onSaveSettings = async () => {
    if (settings.payout_split_pct < 0 || settings.payout_split_pct > 100) {
      return toast.error("Creator split must be between 0 and 100");
    }
    if (settings.of_platform_fee_pct < 0 || settings.of_platform_fee_pct > 100) {
      return toast.error("OnlyFans fee must be between 0 and 100");
    }
    setSavingSettings(true);
    const { error } = await supabase
      .from("creators")
      .update({
        payout_split_pct: settings.payout_split_pct,
        of_platform_fee_pct: settings.of_platform_fee_pct,
      })
      .eq("id", creatorId);
    setSavingSettings(false);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "creator_payout_settings_updated",
      entity_type: "creator",
      entity_id: creatorId,
      entity_name: creatorName ?? "Creator",
    });
    toast.success("Payout settings saved");
  };

  // ── Generate a new payout ──────────────────────────────────────────────

  const onGenerate = async () => {
    if (!genFrom || !genTo) return toast.error("Pick a start and end date");
    if (genTo < genFrom) return toast.error("End date is before start date");
    setGenerating(true);

    const fromISO = format(genFrom, "yyyy-MM-dd");
    const toISO = format(genTo, "yyyy-MM-dd");

    // Pull gross from the existing per-channel revenue tables. We sum
    // organic + internal — both flow through the agency. Ad campaign
    // revenue is intentionally excluded from gross-to-payout because the
    // ad spend gets reimbursed separately as a deduction line.
    const [{ data: organic }, { data: internal }] = await Promise.all([
      supabase
        .from("organic_entries")
        .select("amount, entry_date")
        .eq("creator_id", creatorId)
        .gte("entry_date", fromISO)
        .lte("entry_date", toISO),
      supabase
        .from("internal_entries")
        .select("amount, entry_date")
        .eq("creator_id", creatorId)
        .gte("entry_date", fromISO)
        .lte("entry_date", toISO),
    ]);

    const orgTotal = (organic ?? []).reduce((s, e: any) => s + Number(e.amount || 0), 0);
    const intTotal = (internal ?? []).reduce((s, e: any) => s + Number(e.amount || 0), 0);
    const gross = orgTotal + intTotal;
    const fee = +(gross * settings.of_platform_fee_pct / 100).toFixed(2);
    const afterFee = gross - fee;
    // Agency keeps (100 - creator's split) of the post-fee pool
    const agencyCut = +(afterFee * (100 - settings.payout_split_pct) / 100).toFixed(2);
    const net = +(gross - fee - agencyCut).toFixed(2);

    const { data, error } = await supabase
      .from("creator_payouts")
      .insert({
        creator_id: creatorId,
        period_start: fromISO,
        period_end: toISO,
        gross_revenue: gross,
        of_platform_fee: fee,
        agency_cut: agencyCut,
        deductions: [],
        net_to_creator: net,
        split_pct_snapshot: settings.payout_split_pct,
        fee_pct_snapshot: settings.of_platform_fee_pct,
        status: "draft",
      })
      .select("id")
      .single();
    setGenerating(false);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "payout_generated",
      entity_type: "creator_payout",
      entity_id: (data as any)?.id,
      entity_name: `${creatorName ?? "Creator"} · ${fromISO} → ${toISO}`,
    });
    toast.success(gross > 0 ? `Payout drafted: ${fmtMoney(net)} net to creator` : "Drafted (no revenue in this window)");
    await load();
  };

  // ── Aggregate stats ───────────────────────────────────────────────────

  const stats = useMemo(() => {
    const ytdStart = `${new Date().getFullYear()}-01-01`;
    const ytd = payouts.filter((p) => p.period_end >= ytdStart);
    return {
      lifetimeGross: payouts.reduce((s, p) => s + Number(p.gross_revenue), 0),
      lifetimeNet: payouts.reduce((s, p) => s + Number(p.net_to_creator), 0),
      lifetimeAgency: payouts.reduce((s, p) => s + Number(p.agency_cut), 0),
      ytdNet: ytd.reduce((s, p) => s + Number(p.net_to_creator), 0),
      pendingCount: payouts.filter((p) => p.status !== "paid").length,
      pendingAmount: payouts.filter((p) => p.status !== "paid").reduce((s, p) => s + Number(p.net_to_creator), 0),
    };
  }, [payouts]);

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) return <div className="text-sm text-muted-foreground">Loading payouts…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" /> Payouts
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generate, track, and pay out the creator's share of OnlyFans revenue.
          Each payout snapshots the split at generation time so historical math stays stable.
        </p>
      </div>

      {/* Lifetime stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BigStat label="Net paid to creator (YTD)" value={fmtMoney(stats.ytdNet)} icon={<TrendingUp className="h-3.5 w-3.5" />} tone="emerald" />
        <BigStat label="Lifetime net" value={fmtMoney(stats.lifetimeNet)} icon={<DollarSign className="h-3.5 w-3.5" />} tone="violet" />
        <BigStat label="Lifetime agency cut" value={fmtMoney(stats.lifetimeAgency)} icon={<Percent className="h-3.5 w-3.5" />} tone="cyan" />
        <BigStat
          label="Pending"
          value={`${fmtMoney(stats.pendingAmount)}`}
          hint={stats.pendingCount > 0 ? `${stats.pendingCount} payout${stats.pendingCount === 1 ? "" : "s"} not yet paid` : undefined}
          icon={<Calendar className="h-3.5 w-3.5" />}
          tone={stats.pendingCount > 0 ? "amber" : "muted"}
        />
      </div>

      {/* Settings */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">Split settings</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              These apply to all <em>new</em> payouts. Existing payouts keep the % they were generated with.
            </p>
          </div>
          <Button onClick={onSaveSettings} disabled={savingSettings} size="sm">
            <Save className="h-3.5 w-3.5 mr-1" /> {savingSettings ? "Saving…" : "Save"}
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Creator split (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={settings.payout_split_pct}
              onChange={(e) => setSettings({ ...settings, payout_split_pct: Number(e.target.value) })}
            />
            <p className="text-[10px] text-muted-foreground">
              Creator keeps {settings.payout_split_pct}% of post-fee revenue. Agency keeps {(100 - settings.payout_split_pct).toFixed(1)}%.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">OnlyFans platform fee (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={settings.of_platform_fee_pct}
              onChange={(e) => setSettings({ ...settings, of_platform_fee_pct: Number(e.target.value) })}
            />
            <p className="text-[10px] text-muted-foreground">
              OnlyFans's standard cut is 20%. Adjust if this creator has a different deal.
            </p>
          </div>
        </div>
      </section>

      {/* Generator */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Calculator className="h-4 w-4 text-primary" /> Generate payout
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pulls gross from <span className="text-foreground">organic + internal</span> revenue entries in the window,
            applies OF fee + agency split, and drops it in the history below as a <em>draft</em> for review.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Period start</Label>
            <DatePicker value={genFrom} onChange={setGenFrom} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Period end</Label>
            <DatePicker value={genTo} onChange={setGenTo} />
          </div>
          <Button onClick={onGenerate} disabled={generating || !genFrom || !genTo}>
            <Plus className="h-4 w-4 mr-1.5" /> {generating ? "Generating…" : "Generate draft"}
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Quick:</span>
          <QuickRange label="This month" onClick={() => { setGenFrom(startOfMonth(new Date())); setGenTo(endOfMonth(new Date())); }} />
          <QuickRange label="Last month" onClick={() => { const m = subMonths(new Date(), 1); setGenFrom(startOfMonth(m)); setGenTo(endOfMonth(m)); }} />
          <QuickRange label="Last 7 days" onClick={() => { setGenFrom(subDays(new Date(), 6)); setGenTo(new Date()); }} />
          <QuickRange label="Last 30 days" onClick={() => { setGenFrom(subDays(new Date(), 29)); setGenTo(new Date()); }} />
        </div>
      </section>

      {/* History */}
      <section className="space-y-3">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-primary" /> Payout history
          <span className="text-[11px] text-muted-foreground font-normal">
            ({payouts.length} {payouts.length === 1 ? "payout" : "payouts"})
          </span>
        </div>
        {payouts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
            <Wallet className="h-7 w-7 text-muted-foreground/50 mx-auto mb-2" />
            <div className="text-sm font-medium">No payouts yet</div>
            <p className="text-xs text-muted-foreground mt-1">Generate one above to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {payouts.map((p) => (
              <PayoutCard
                key={p.id}
                payout={p}
                onChanged={() => void load()}
                creatorName={creatorName}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Single payout card with inline editing ──────────────────────────────

function PayoutCard({
  payout, onChanged, creatorName,
}: {
  payout: Payout;
  onChanged: () => void;
  creatorName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Payout>(payout);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(payout); }, [payout]);

  const recompute = (next: Partial<Payout>) => {
    const merged: Payout = { ...draft, ...next };
    const splitPct = Number(merged.split_pct_snapshot ?? 80);
    const feePct = Number(merged.fee_pct_snapshot ?? 20);
    const fee = +(Number(merged.gross_revenue) * feePct / 100).toFixed(2);
    const afterFee = Number(merged.gross_revenue) - fee;
    const agencyCut = +(afterFee * (100 - splitPct) / 100).toFixed(2);
    const ded = sumDeductions(merged.deductions);
    const net = +(Number(merged.gross_revenue) - fee - agencyCut - ded).toFixed(2);
    setDraft({ ...merged, of_platform_fee: fee, agency_cut: agencyCut, net_to_creator: net });
  };

  const onSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("creator_payouts")
      .update({
        gross_revenue: draft.gross_revenue,
        of_platform_fee: draft.of_platform_fee,
        agency_cut: draft.agency_cut,
        deductions: draft.deductions,
        net_to_creator: draft.net_to_creator,
        notes: draft.notes,
        payment_method: draft.payment_method,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payout.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Payout updated");
    setEditing(false);
    onChanged();
  };

  const onChangeStatus = async (status: Status) => {
    const update: any = { status, updated_at: new Date().toISOString() };
    if (status === "paid") update.paid_at = new Date().toISOString();
    const { error } = await supabase.from("creator_payouts").update(update).eq("id", payout.id);
    if (error) return toast.error(error.message);
    void logAudit({
      action: status === "paid" ? "payout_marked_paid" : `payout_marked_${status}`,
      entity_type: "creator_payout",
      entity_id: payout.id,
      entity_name: `${creatorName ?? "Creator"} · ${payout.period_start} → ${payout.period_end}`,
    });
    toast.success(`Marked ${status}`);
    onChanged();
  };

  const onDelete = async () => {
    if (!confirm("Delete this payout? This is permanent.")) return;
    const { error } = await supabase.from("creator_payouts").delete().eq("id", payout.id);
    if (error) return toast.error(error.message);
    toast.success("Payout deleted");
    onChanged();
  };

  const addDeduction = () => recompute({ deductions: [...draft.deductions, { label: "", amount: 0 }] });
  const updateDeduction = (i: number, patch: Partial<Deduction>) => {
    const next = draft.deductions.map((d, idx) => idx === i ? { ...d, ...patch } : d);
    recompute({ deductions: next });
  };
  const removeDeduction = (i: number) => {
    recompute({ deductions: draft.deductions.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-sm font-semibold">
              {format(new Date(payout.period_start), "MMM d")} – {format(new Date(payout.period_end), "MMM d, yyyy")}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Generated {format(new Date(payout.created_at), "MMM d, yyyy")}
              {payout.split_pct_snapshot != null && (
                <> · split {payout.split_pct_snapshot}% / fee {payout.fee_pct_snapshot ?? 20}%</>
              )}
            </div>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded font-medium border ${STATUS_STYLES[payout.status]}`}>
            {payout.status}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!editing && payout.status !== "paid" && (
            <>
              {payout.status === "draft" && (
                <Button size="sm" variant="outline" onClick={() => onChangeStatus("sent")}>
                  <Send className="h-3.5 w-3.5 mr-1" /> Mark sent
                </Button>
              )}
              <Button size="sm" onClick={() => onChangeStatus("paid")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Mark paid
              </Button>
            </>
          )}
          {!editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {!editing && (
            <Button size="sm" variant="ghost" onClick={onDelete} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Money breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Money label="Gross" value={Number(draft.gross_revenue)} editable={editing} onChange={(v) => recompute({ gross_revenue: v })} />
        <Money label="OF fee" value={Number(draft.of_platform_fee)} muted />
        <Money label="Agency" value={Number(draft.agency_cut)} muted />
        <Money label="Net to creator" value={Number(draft.net_to_creator)} highlight />
      </div>

      {/* Deductions */}
      {(editing || draft.deductions.length > 0) && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
              Deductions {draft.deductions.length > 0 && <span className="text-foreground">— {fmtMoney(sumDeductions(draft.deductions))}</span>}
            </div>
            {editing && (
              <Button size="sm" variant="ghost" onClick={addDeduction}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            )}
          </div>
          {draft.deductions.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">No deductions on this payout.</div>
          ) : (
            <div className="space-y-1.5">
              {draft.deductions.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {editing ? (
                    <>
                      <Input
                        value={d.label}
                        onChange={(e) => updateDeduction(i, { label: e.target.value })}
                        placeholder="Reason (e.g. Ad spend reimbursement)"
                        className="flex-1 h-8 text-xs"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={d.amount}
                        onChange={(e) => updateDeduction(i, { amount: Number(e.target.value) })}
                        className="w-28 h-8 text-xs"
                      />
                      <button
                        onClick={() => removeDeduction(i)}
                        className="text-muted-foreground hover:text-destructive p-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 truncate text-xs">{d.label || <span className="italic text-muted-foreground">Untitled</span>}</div>
                      <div className="text-xs font-semibold tabular-nums">−{fmtMoney(d.amount)}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit-only extras: payment method + notes */}
      {editing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Payment method</Label>
            <Select
              value={draft.payment_method ?? "unset"}
              onValueChange={(v) => setDraft({ ...draft, payment_method: v === "unset" ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">—</SelectItem>
                <SelectItem value="Bank transfer">Bank transfer</SelectItem>
                <SelectItem value="Wise">Wise</SelectItem>
                <SelectItem value="PayPal">PayPal</SelectItem>
                <SelectItem value="Crypto">Crypto</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={2}
              placeholder="Optional — anything the creator should know about this payout."
            />
          </div>
        </div>
      )}

      {/* Notes (read-only) */}
      {!editing && payout.notes && (
        <div className="text-xs text-muted-foreground bg-secondary/30 rounded-md p-2.5 border border-border">
          <span className="font-medium text-foreground">Note: </span>{payout.notes}
        </div>
      )}

      {/* Paid-info footer */}
      {!editing && payout.status === "paid" && payout.paid_at && (
        <div className="text-[11px] text-emerald-400 inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3" />
          Paid {format(new Date(payout.paid_at), "MMM d, yyyy")}
          {payout.payment_method && <span className="text-muted-foreground">via {payout.payment_method}</span>}
        </div>
      )}

      {/* Edit save bar */}
      {editing && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button size="sm" variant="ghost" onClick={() => { setDraft(payout); setEditing(false); }}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Tiny presentational helpers ────────────────────────────────────────

function Money({
  label, value, muted, highlight, editable, onChange,
}: {
  label: string;
  value: number;
  muted?: boolean;
  highlight?: boolean;
  editable?: boolean;
  onChange?: (v: number) => void;
}) {
  return (
    <div className={`rounded-lg border p-2.5 ${
      highlight
        ? "border-emerald-500/30 bg-emerald-500/5"
        : muted
        ? "border-border bg-secondary/30"
        : "border-border bg-card"
    }`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</div>
      {editable ? (
        <Input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className="h-8 mt-1 font-semibold tabular-nums"
        />
      ) : (
        <div className={`font-bold tabular-nums mt-0.5 ${highlight ? "text-emerald-400 text-lg" : "text-base"} ${muted ? "text-muted-foreground" : ""}`}>
          {fmtMoney(value)}
        </div>
      )}
    </div>
  );
}

const TONE_BG: Record<string, string> = {
  emerald: "border-emerald-500/20 bg-emerald-500/5",
  violet:  "border-violet-500/20 bg-violet-500/5",
  cyan:    "border-cyan-500/20 bg-cyan-500/5",
  amber:   "border-amber-500/20 bg-amber-500/5",
  muted:   "border-border bg-secondary/30",
};
const TONE_TEXT: Record<string, string> = {
  emerald: "text-emerald-400",
  violet:  "text-violet-400",
  cyan:    "text-cyan-400",
  amber:   "text-amber-400",
  muted:   "text-muted-foreground",
};

function BigStat({
  label, value, hint, icon, tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone: "emerald" | "violet" | "cyan" | "amber" | "muted";
}) {
  return (
    <div className={`rounded-xl border p-4 ${TONE_BG[tone]}`}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</div>
        <div className={TONE_TEXT[tone]}>{icon}</div>
      </div>
      <div className="text-xl font-bold tabular-nums mt-2">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function QuickRange({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
    >
      {label}
    </button>
  );
}
