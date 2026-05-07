import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Target, Plus, Trash2, TrendingUp, CheckCircle2 } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { logAudit } from "@/lib/audit";

type Goal = {
  id: string;
  creator_id: string;
  channel: string;
  target_amount: number;
  period_start: string;
  period_end: string;
  created_at: string;
};

type Channel = "total" | "reddit" | "organic" | "internal" | "ads";

const CHANNEL_LABELS: Record<Channel, string> = {
  total: "Total revenue",
  reddit: "Reddit (paid OnlyFinder)",
  organic: "Organic (free social)",
  internal: "Internal sales (DMs/PPV)",
  ads: "Paid ads (net)",
};

const fmtCurrency = (n: number) => `$${Math.round(n).toLocaleString()}`;

type Props = {
  creatorId: string;
  creatorName?: string;
  /** Live revenue figures so we can render progress per channel — passed from parent */
  actuals: {
    /** map of channel -> { amount, periodStart, periodEnd } pairs we can match against */
    redditByMonth: Record<string, number>;   // YYYY-MM -> amount
    organicByMonth: Record<string, number>;
    internalByMonth: Record<string, number>;
    adsNetByMonth: Record<string, number>;
  };
};

function monthKey(d: Date) {
  return format(d, "yyyy-MM");
}

function actualForGoal(goal: Goal, actuals: Props["actuals"]): number {
  const start = parseISO(goal.period_start);
  const end = parseISO(goal.period_end);
  const months: string[] = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    months.push(monthKey(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  const sum = (m: Record<string, number>) =>
    months.reduce((acc, mk) => acc + (m[mk] ?? 0), 0);

  switch (goal.channel as Channel) {
    case "reddit":   return sum(actuals.redditByMonth);
    case "organic":  return sum(actuals.organicByMonth);
    case "internal": return sum(actuals.internalByMonth);
    case "ads":      return sum(actuals.adsNetByMonth);
    case "total":
    default:
      return sum(actuals.redditByMonth) + sum(actuals.organicByMonth) + sum(actuals.internalByMonth) + sum(actuals.adsNetByMonth);
  }
}

export function CreatorGoals({ creatorId, creatorName, actuals }: Props) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    channel: Channel;
    target: string;
    period_start: string;
    period_end: string;
  }>(() => {
    const now = new Date();
    return {
      channel: "total",
      target: "",
      period_start: format(startOfMonth(now), "yyyy-MM-dd"),
      period_end: format(endOfMonth(now), "yyyy-MM-dd"),
    };
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("revenue_goals")
      .select("*")
      .eq("creator_id", creatorId)
      .order("period_start", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setGoals((data ?? []) as Goal[]);
  };

  useEffect(() => { load(); }, [creatorId]);

  const onCreate = async () => {
    const target = Number(form.target);
    if (!target || target <= 0) return toast.error("Target must be a positive number");
    if (!form.period_start || !form.period_end) return toast.error("Pick a period");
    const { error } = await supabase.from("revenue_goals").insert({
      creator_id: creatorId,
      channel: form.channel,
      target_amount: target,
      period_start: form.period_start,
      period_end: form.period_end,
    });
    if (error) return toast.error(error.message);
    void logAudit({
      action: "goal_created",
      entity_type: "revenue_goal",
      entity_name: `${creatorName ?? "Creator"} · ${CHANNEL_LABELS[form.channel]} · ${fmtCurrency(target)}`,
      details: `${form.period_start} → ${form.period_end}`,
    });
    toast.success("Goal added");
    setOpen(false);
    setForm((f) => ({ ...f, target: "" }));
    load();
  };

  const onDelete = async (g: Goal) => {
    if (!confirm("Delete this goal?")) return;
    const { error } = await supabase.from("revenue_goals").delete().eq("id", g.id);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "goal_deleted",
      entity_type: "revenue_goal",
      entity_id: g.id,
      entity_name: `${creatorName ?? "Creator"} · ${CHANNEL_LABELS[g.channel as Channel] ?? g.channel}`,
    });
    load();
  };

  const enriched = useMemo(() =>
    goals.map((g) => {
      const actual = actualForGoal(g, actuals);
      const pct = g.target_amount === 0 ? 0 : Math.min(150, Math.round((actual / g.target_amount) * 100));
      const onTrack = actual >= g.target_amount;
      return { ...g, actual, pct, onTrack };
    })
  , [goals, actuals]);

  const now = new Date();
  const active = enriched.filter((g) => parseISO(g.period_end) >= now);
  const past = enriched.filter((g) => parseISO(g.period_end) < now);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Goals & Targets</h3>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" /> New goal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New revenue goal</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Channel</Label>
                <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v as Channel })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CHANNEL_LABELS) as Channel[]).map((k) => (
                      <SelectItem key={k} value={k}>{CHANNEL_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Target ($)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 25000"
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>From</Label>
                  <Input
                    type="date"
                    value={form.period_start}
                    onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>To</Label>
                  <Input
                    type="date"
                    value={form.period_end}
                    onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={onCreate}>Create goal</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : enriched.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
          <Target className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <div className="text-sm font-medium">No goals yet</div>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Set monthly or quarterly revenue targets. Progress updates automatically as revenue lands.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 mb-2">
                Active
              </div>
              <div className="space-y-2">
                {active.map((g) => <GoalCard key={g.id} goal={g} onDelete={onDelete} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 mb-2">
                Past
              </div>
              <div className="space-y-2">
                {past.map((g) => <GoalCard key={g.id} goal={g} onDelete={onDelete} dim />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GoalCard({
  goal,
  onDelete,
  dim,
}: {
  goal: Goal & { actual: number; pct: number; onTrack: boolean };
  onDelete: (g: Goal) => void;
  dim?: boolean;
}) {
  const pctClamped = Math.min(100, goal.pct);
  const overshoot = goal.pct > 100 ? goal.pct - 100 : 0;
  return (
    <div
      className={`group rounded-xl border bg-card p-4 transition-colors ${
        dim ? "border-border/50 opacity-80" : "border-border hover:border-primary/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {CHANNEL_LABELS[goal.channel as Channel] ?? goal.channel}
            </span>
            {goal.onTrack ? (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-success/30 bg-success/10 text-success">
                <CheckCircle2 className="h-2.5 w-2.5" /> Hit
              </span>
            ) : !dim && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">
                <TrendingUp className="h-2.5 w-2.5" /> In progress
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {format(parseISO(goal.period_start), "MMM d")} — {format(parseISO(goal.period_end), "MMM d, yyyy")}
          </div>
        </div>
        <button
          onClick={() => onDelete(goal)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
          aria-label="Delete goal"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium tabular-nums">
            {fmtCurrency(goal.actual)} <span className="text-muted-foreground font-normal">/ {fmtCurrency(goal.target_amount)}</span>
          </span>
          <span className={`tabular-nums font-semibold ${goal.onTrack ? "text-success" : "text-foreground"}`}>
            {goal.pct}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              goal.onTrack ? "bg-success" : "bg-gradient-to-r from-primary to-primary-glow"
            }`}
            style={{ width: `${pctClamped}%` }}
          />
        </div>
        {overshoot > 0 && (
          <div className="text-[11px] text-success">
            +{overshoot}% over target — {fmtCurrency(goal.actual - goal.target_amount)} above goal
          </div>
        )}
      </div>
    </div>
  );
}
