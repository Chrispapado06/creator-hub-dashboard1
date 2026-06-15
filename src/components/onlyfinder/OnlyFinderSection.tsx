import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowLeft } from "lucide-react";
import { FansIncomeChart } from "./FansIncomeChart";
import { OnlyFinderLogo } from "./OnlyFinderLogo";
import {
  listCreators, getCreatorMetrics, getCreatorChanges, getCreatorExperiments,
  getDecisions, getLatestDigest, addCreator, logKeywordChange, logDailySpend,
  type TrackerCreator, type KeywordChange, type DailyMetric, type Experiment,
  type ExperimentStatus, type DailyDigest, type DecisionRow,
} from "@/lib/onlyfinder";

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── small display bits ───────────────────────────────────────────────────────
function Lift({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground">—</span>;
  const cls = pct > 0 ? "text-success" : pct < 0 ? "text-destructive" : "text-muted-foreground";
  return <span className={cls}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
}

const STATUS_STYLES: Record<ExperimentStatus, string> = {
  running: "bg-primary/15 text-primary border-primary/30",
  concluded: "bg-success/15 text-success border-success/30",
  confounded: "bg-warning/15 text-warning border-warning/30",
  insufficient_data: "bg-secondary text-muted-foreground border-border",
};
function StatusBadge({ status }: { status: ExperimentStatus }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status]}`}>{status.replace("_", " ")}</span>;
}

const ACTION_STYLES: Record<string, string> = {
  scale: "bg-success/15 text-success border-success/30",
  hold: "bg-primary/15 text-primary border-primary/30",
  kill: "bg-destructive/15 text-destructive border-destructive/30",
  unreadable: "bg-warning/15 text-warning border-warning/30",
};
function ActionChip({ action }: { action: string }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${ACTION_STYLES[action] ?? "bg-secondary text-muted-foreground border-border"}`}>{action}</span>;
}

// ── Section root ─────────────────────────────────────────────────────────────
export function OnlyFinderSection() {
  const [creators, setCreators] = useState<TrackerCreator[]>([]);
  const [selected, setSelected] = useState<TrackerCreator | null>(null);

  const loadCreators = async () => setCreators(await listCreators());
  useEffect(() => { loadCreators(); }, []);

  if (selected) {
    return <CreatorDetail creator={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <OnlyFinderLogo className="h-6 w-6" />
        <div>
          <h2 className="text-lg font-semibold">OnlyFinder experiments</h2>
          <p className="text-xs text-muted-foreground">Keyword-change experiments per creator — movement, not attribution.</p>
        </div>
      </div>

      <Tabs defaultValue="creators">
        <TabsList>
          <TabsTrigger value="creators">Creators</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
          <TabsTrigger value="digest">Digest</TabsTrigger>
        </TabsList>

        <TabsContent value="creators" className="mt-5">
          <CreatorsView creators={creators} onOpen={setSelected} onAdded={loadCreators} />
        </TabsContent>
        <TabsContent value="decisions" className="mt-5">
          <DecisionsView onOpen={(id) => setSelected(creators.find((c) => c.id === id) ?? null)} />
        </TabsContent>
        <TabsContent value="digest" className="mt-5">
          <DigestView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Creators list + add ──────────────────────────────────────────────────────
function CreatorsView({ creators, onOpen, onAdded }: { creators: TrackerCreator[]; onOpen: (c: TrackerCreator) => void; onAdded: () => void }) {
  const [form, setForm] = useState({ name: "", of_username: "", onlyfansapi_acct_id: "", onlyfinder_ref: "", daily_budget_usd: "", other_platforms: "" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const { error } = await addCreator(form);
    setSaving(false);
    if (error) return toast.error(error);
    toast.success("Creator added.");
    setForm({ name: "", of_username: "", onlyfansapi_acct_id: "", onlyfinder_ref: "", daily_budget_usd: "", other_platforms: "" });
    onAdded();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 text-sm font-semibold">Add a creator</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Antonella" /></Field>
          <Field label="OnlyFans username"><Input value={form.of_username} onChange={(e) => setForm({ ...form, of_username: e.target.value })} placeholder="antonella" /></Field>
          <Field label="OFAPI ref (acct id)"><Input value={form.onlyfansapi_acct_id} onChange={(e) => setForm({ ...form, onlyfansapi_acct_id: e.target.value })} placeholder="acct_… (optional)" /></Field>
          <Field label="OnlyFinder ref"><Input value={form.onlyfinder_ref} onChange={(e) => setForm({ ...form, onlyfinder_ref: e.target.value })} placeholder="onlyfinder handle" /></Field>
          <Field label="Daily budget ($)"><Input type="number" step="0.01" value={form.daily_budget_usd} onChange={(e) => setForm({ ...form, daily_budget_usd: e.target.value })} placeholder="25" /></Field>
          <Field label="Other (tracked) platforms"><Input value={form.other_platforms} onChange={(e) => setForm({ ...form, other_platforms: e.target.value })} placeholder="reddit, instagram" /></Field>
        </div>
        <Button size="sm" className="mt-4" onClick={submit} disabled={saving || !form.name.trim()}><Plus className="mr-1.5 h-4 w-4" />{saving ? "Adding…" : "Add creator"}</Button>
      </div>

      {creators.length === 0 ? (
        <Empty title="No creators yet" hint="Add one above — onboarding never needs a code change." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {creators.map((c) => (
            <button key={c.id} onClick={() => onOpen(c)} className="rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/50">
              <div className="font-medium">{c.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {c.of_username ? `@${c.of_username}` : "no OF username"}
                {c.daily_budget_usd != null && ` · $${c.daily_budget_usd}/day`}
              </div>
              {c.other_platforms && c.other_platforms.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.other_platforms.map((p) => <span key={p} className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{p}</span>)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Creator detail ───────────────────────────────────────────────────────────
function CreatorDetail({ creator, onBack }: { creator: TrackerCreator; onBack: () => void }) {
  const [metrics, setMetrics] = useState<DailyMetric[]>([]);
  const [changes, setChanges] = useState<KeywordChange[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);

  const load = async () => {
    const [m, ch, ex] = await Promise.all([
      getCreatorMetrics(creator.id), getCreatorChanges(creator.id), getCreatorExperiments(creator.id),
    ]);
    setMetrics(m); setChanges(ch); setExperiments(ex);
  };
  useEffect(() => { load(); }, [creator.id]);

  const changeById = useMemo(() => new Map(changes.map((c) => [c.id, c])), [changes]);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />All creators</button>

      <div>
        <h2 className="text-xl font-bold">{creator.name}</h2>
        <p className="text-xs text-muted-foreground">
          {[creator.of_username ? `@${creator.of_username}` : null, creator.onlyfinder_ref ? `OnlyFinder: ${creator.onlyfinder_ref}` : null,
            creator.daily_budget_usd != null ? `$${creator.daily_budget_usd}/day` : null,
            creator.other_platforms?.length ? `tracked: ${creator.other_platforms.join(", ")}` : null].filter(Boolean).join("  ·  ")}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 text-sm font-semibold">Direct fans &amp; income</div>
        <FansIncomeChart metrics={metrics} changes={changes} />
      </div>

      <div>
        <div className="mb-3 text-sm font-semibold">Experiments</div>
        {experiments.length === 0 ? (
          <Empty title="No experiments yet" hint="Log a keyword change below to start one." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Change</th>
                  <th className="px-4 py-2 text-left font-medium">Window</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Fans lift</th>
                  <th className="px-4 py-2 text-right font-medium">Income lift</th>
                  <th className="px-4 py-2 text-right font-medium">Fans/$ lift</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((e) => {
                  const ch = changeById.get(e.keyword_change_id);
                  return (
                    <tr key={e.id} className="border-t border-border bg-card">
                      <td className="px-4 py-2">
                        {ch?.changed_on ?? "—"}
                        {ch?.new_keywords?.length ? <span className="block text-[11px] text-muted-foreground">{ch.new_keywords.join(", ")}</span> : null}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{e.observation_start}…{e.observation_end}</td>
                      <td className="px-4 py-2"><StatusBadge status={e.status} /></td>
                      <td className="px-4 py-2 text-right"><Lift pct={e.fans_lift_pct} /></td>
                      <td className="px-4 py-2 text-right"><Lift pct={e.income_lift_pct} /></td>
                      <td className="px-4 py-2 text-right"><Lift pct={e.fans_per_dollar_lift_pct} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <KeywordChangeForm creatorId={creator.id} onSaved={load} />
        <SpendForm creatorId={creator.id} onSaved={load} />
      </div>
    </div>
  );
}

function KeywordChangeForm({ creatorId, onSaved }: { creatorId: string; onSaved: () => void }) {
  const [form, setForm] = useState({ changed_on: todayISO(), action: "replaced", new_keywords: "", note: "" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    const { error } = await logKeywordChange({ creator_id: creatorId, ...form });
    setSaving(false);
    if (error) return toast.error(error);
    toast.success("Keyword change logged — experiment started.");
    setForm({ changed_on: todayISO(), action: "replaced", new_keywords: "", note: "" });
    onSaved();
  };
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 text-sm font-semibold">Log keyword change</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date changed *"><Input type="date" value={form.changed_on} onChange={(e) => setForm({ ...form, changed_on: e.target.value })} /></Field>
        <Field label="Action">
          <Select value={form.action} onValueChange={(v) => setForm({ ...form, action: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["added", "removed", "replaced", "reordered"].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="mt-3"><Field label="New keywords * (comma-separated)"><Input value={form.new_keywords} onChange={(e) => setForm({ ...form, new_keywords: e.target.value })} placeholder="petite, gamer girl" /></Field></div>
      <div className="mt-3"><Field label="Note"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="optional" /></Field></div>
      <Button size="sm" className="mt-4" onClick={submit} disabled={saving || !form.new_keywords.trim()}>{saving ? "Saving…" : "Log change"}</Button>
    </div>
  );
}

function SpendForm({ creatorId, onSaved }: { creatorId: string; onSaved: () => void }) {
  const [form, setForm] = useState({ metric_date: todayISO(), spend_usd: "" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    const { error } = await logDailySpend({ creator_id: creatorId, ...form });
    setSaving(false);
    if (error) return toast.error(error);
    toast.success("Spend saved.");
    setForm({ metric_date: todayISO(), spend_usd: "" });
    onSaved();
  };
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 text-sm font-semibold">Log daily OnlyFinder spend</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date *"><Input type="date" value={form.metric_date} onChange={(e) => setForm({ ...form, metric_date: e.target.value })} /></Field>
        <Field label="Spend ($) *"><Input type="number" step="0.01" value={form.spend_usd} onChange={(e) => setForm({ ...form, spend_usd: e.target.value })} placeholder="25.00" /></Field>
      </div>
      <Button size="sm" className="mt-4" onClick={submit} disabled={saving || form.spend_usd === ""}>{saving ? "Saving…" : "Log spend"}</Button>
    </div>
  );
}

// ── Decisions ────────────────────────────────────────────────────────────────
const DEC_COLS = [
  { key: "scale", title: "Scale", cls: "text-success" },
  { key: "hold", title: "Hold", cls: "text-primary" },
  { key: "kill", title: "Kill", cls: "text-destructive" },
] as const;

function DecisionsView({ onOpen }: { onOpen: (creatorId: string) => void }) {
  const [d, setD] = useState<Record<"scale" | "hold" | "kill", DecisionRow[]>>({ scale: [], hold: [], kill: [] });
  useEffect(() => { getDecisions().then(setD); }, []);
  const total = d.scale.length + d.hold.length + d.kill.length;

  if (total === 0) return <Empty title="No concluded experiments yet" hint="Decisions appear once a 7-day observation window closes." />;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {DEC_COLS.map((col) => (
        <div key={col.key} className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className={`text-sm font-semibold ${col.cls}`}>{col.title}</span>
            <span className="text-xs text-muted-foreground">{d[col.key].length}</span>
          </div>
          <div className="space-y-2 p-3">
            {d[col.key].length === 0 ? <p className="py-4 text-center text-xs text-muted-foreground">None</p> : d[col.key].map((row) => (
              <button key={row.id} onClick={() => onOpen(row.creator_id)} className="block w-full rounded-lg border border-border bg-secondary/40 p-3 text-left transition hover:border-primary/50">
                <div className="text-sm font-medium">{row.creator_name}</div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>fans <Lift pct={row.fans_lift_pct} /></span>
                  <span>income <Lift pct={row.income_lift_pct} /></span>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">ended {row.observation_end}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Digest ───────────────────────────────────────────────────────────────────
function DigestView() {
  const [digest, setDigest] = useState<DailyDigest | null | undefined>(undefined);
  useEffect(() => { getLatestDigest().then(setDigest); }, []);

  if (digest === undefined) return <div className="h-32 animate-pulse rounded-xl border border-border bg-card/60" />;
  if (!digest) return <Empty title="No digest yet" hint="The daily pull generates this each morning (claude-haiku-4-5)." />;

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">For {digest.digest_date}{digest.model ? ` · ${digest.model}` : ""}</div>
      {digest.prose_summary && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{digest.prose_summary}</p>
        </div>
      )}
      <div className="space-y-3">
        {(digest.items ?? []).length === 0 ? <Empty title="No experiments in today's digest" /> : (digest.items ?? []).map((it, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{it.status_line}</div>
                <p className="mt-1 text-sm text-muted-foreground">{it.read}</p>
                {it.confound_warning && <p className="mt-1 text-xs text-warning">⚠ {it.confound_warning}</p>}
              </div>
              <ActionChip action={it.recommended_action} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
      <div className="text-sm font-medium">{title}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
