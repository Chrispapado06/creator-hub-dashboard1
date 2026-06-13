import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { SiReddit } from "react-icons/si";
import { Sparkles, Trash2, Plus, Save, ShieldCheck, Server, Users, History, AlertTriangle, Eye, Upload } from "lucide-react";
import { format } from "date-fns";

import { ViabilityInputsSchema, type CatalogSubreddit, type SubredditMatch, type ViabilityResult } from "@/lib/reddit-scorer/types";
import { scoreViability } from "@/lib/reddit-scorer/rubric";
import { validateCsv } from "@/lib/reddit-scorer/csv";
import { calcAccountsAndProxies } from "@/lib/reddit-scorer/accounts";
import { rankSubreddits } from "@/lib/reddit-scorer/matching";
import { generateLaunchPlan } from "@/lib/reddit-scorer/launch-plan";
import type { AccountPlan } from "@/lib/reddit-scorer/types";

export const Route = createFileRoute("/reddit-scorer")({ component: RedditScorerPage });

// The generated Supabase types don't yet include the new tables. Use a thin
// untyped accessor here; regenerate types after running the migration to
// restore full type-safety (see the route's accompanying notes).
const sb = supabase as unknown as { from: (table: string) => any };

type Creator = { id: string; name: string };

const bandStyles: Record<string, string> = {
  strong: "bg-success/15 text-success border-success/30",
  viable: "bg-primary/15 text-primary border-primary/30",
  marginal: "bg-warning/15 text-warning border-warning/30",
  skip: "bg-destructive/15 text-destructive border-destructive/30",
};

const emptyForm = {
  creatorId: "" as string,
  creatorName: "",
  nicheFit: 5,
  contentVolume: 5,
  visualAppeal: 5,
  existingReach: 3,
  verificationWilling: false,
  complianceOk: true,
  niche: "",
  startingKarma: 0,
  startingAccountAgeDays: 0,
};

const emptyCatalogForm: Omit<CatalogSubreddit, "id"> = {
  name: "",
  display_name: null,
  subscribers: 0,
  nsfw: true,
  niche: [],
  verification_required: false,
  min_karma: 0,
  min_account_age_days: 0,
  allows_promo: true,
  posting_notes: null,
  last_verified: null,
  active: true,
};

function RedditScorerPage() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <Toaster />
      <div className="mb-6 flex items-center gap-3">
        <SiReddit className="h-7 w-7 text-[#FF4500]" />
        <div>
          <h1 className="text-2xl font-bold">Reddit Viability Scorer</h1>
          <p className="text-sm text-muted-foreground">Assess a creator, size the launch, match subreddits.</p>
        </div>
      </div>

      <Tabs defaultValue="assess">
        <TabsList>
          <TabsTrigger value="assess">Assess</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="catalog">Subreddit catalog</TabsTrigger>
        </TabsList>
        <TabsContent value="assess"><AssessTab /></TabsContent>
        <TabsContent value="history"><HistoryTab /></TabsContent>
        <TabsContent value="catalog"><CatalogTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Assess tab ───────────────────────────────────────────────────────────────
function AssessTab() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [catalog, setCatalog] = useState<CatalogSubreddit[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [result, setResult] = useState<ViabilityResult | null>(null);
  const [plan, setPlan] = useState<AccountPlan | null>(null);
  const [matches, setMatches] = useState<SubredditMatch[]>([]);
  const [launchPlan, setLaunchPlan] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("creators").select("id, name").order("name").then(({ data }) => setCreators((data ?? []) as Creator[]));
    sb.from("subreddit_catalog").select("*").then(({ data }: { data: CatalogSubreddit[] | null }) => setCatalog(data ?? []));
  }, []);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const runAssessment = () => {
    const parsed = ViabilityInputsSchema.safeParse({
      creatorName: form.creatorName.trim(),
      creatorId: form.creatorId || null,
      nicheFit: form.nicheFit,
      contentVolume: form.contentVolume,
      visualAppeal: form.visualAppeal,
      existingReach: form.existingReach,
      verificationWilling: form.verificationWilling,
      complianceOk: form.complianceOk,
      niche: form.niche.split(",").map((s) => s.trim()).filter(Boolean),
      startingKarma: Number(form.startingKarma) || 0,
      startingAccountAgeDays: Number(form.startingAccountAgeDays) || 0,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid inputs");
      return;
    }
    const r = scoreViability(parsed.data);
    const p = calcAccountsAndProxies(r.band);
    const m = rankSubreddits(parsed.data, catalog, new Date(), 25);
    setResult(r);
    setPlan(p);
    setMatches(m);
    setLaunchPlan("");
  };

  const generatePlan = async () => {
    if (!result || !plan) return;
    setGenerating(true);
    try {
      const text = await generateLaunchPlan({ creatorName: form.creatorName.trim(), result, accountPlan: plan, matches });
      setLaunchPlan(text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate launch plan");
    } finally {
      setGenerating(false);
    }
  };

  const saveAssessment = async () => {
    if (!result || !plan) return;
    setSaving(true);
    const { error } = await sb.from("reddit_assessments").insert({
      creator_id: form.creatorId || null,
      creator_name: form.creatorName.trim(),
      inputs: form,
      score: result.score,
      band: result.band,
      breakdown: result.breakdown,
      accounts_needed: plan.accountsNeeded,
      proxies_needed: plan.proxiesNeeded,
      matched_subreddits: matches.map((m) => ({ name: m.subreddit.name, score: m.score, stale: m.stale, eligibleNow: m.eligibleNow })),
      launch_plan: launchPlan || null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Assessment saved");
  };

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      {/* Inputs */}
      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold">Creator inputs</h2>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Creator</Label>
            <Select
              value={form.creatorId}
              onValueChange={(id) => set({ creatorId: id, creatorName: creators.find((c) => c.id === id)?.name ?? form.creatorName })}
            >
              <SelectTrigger><SelectValue placeholder="Pick a creator (or type a name below)" /></SelectTrigger>
              <SelectContent>
                {creators.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Creator name" value={form.creatorName} onChange={(e) => set({ creatorName: e.target.value })} />
          </div>

          <RatingRow label="Niche fit / demand" value={form.nicheFit} onChange={(v) => set({ nicheFit: v })} />
          <RatingRow label="Content volume" value={form.contentVolume} onChange={(v) => set({ contentVolume: v })} />
          <RatingRow label="Visual appeal" value={form.visualAppeal} onChange={(v) => set({ visualAppeal: v })} />
          <RatingRow label="Existing reach" value={form.existingReach} onChange={(v) => set({ existingReach: v })} />

          <ToggleRow label="Willing to verify" hint="Unlocks verification-gated subs" checked={form.verificationWilling} onChange={(v) => set({ verificationWilling: v })} />
          <ToggleRow label="Reddit-compliant content" hint="No banned categories" checked={form.complianceOk} onChange={(v) => set({ complianceOk: v })} />

          <div className="grid gap-2">
            <Label>Niche tags (comma-separated)</Label>
            <Input placeholder="fitness, cosplay, gonewild" value={form.niche} onChange={(e) => set({ niche: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Starting karma</Label>
              <Input type="number" min={0} value={form.startingKarma} onChange={(e) => set({ startingKarma: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <Label>Account age (days)</Label>
              <Input type="number" min={0} value={form.startingAccountAgeDays} onChange={(e) => set({ startingAccountAgeDays: Number(e.target.value) })} />
            </div>
          </div>

          <Button className="w-full" onClick={runAssessment}>Assess viability</Button>
        </div>
      </Card>

      {/* Results */}
      <div className="space-y-4">
        {!result ? (
          <Card className="flex h-full items-center justify-center p-10 text-center text-sm text-muted-foreground">
            Fill in the inputs and run an assessment to see the score, infrastructure needs, and matched subreddits.
          </Card>
        ) : (
          <>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Viability score</div>
                  <div className="text-4xl font-bold">{result.score}<span className="text-lg text-muted-foreground">/100</span></div>
                </div>
                <Badge className={`border px-3 py-1 text-sm uppercase ${bandStyles[result.band]}`}>{result.band}</Badge>
              </div>
              <div className="mt-4 space-y-1.5">
                {result.breakdown.map((c) => (
                  <div key={c.key} className="flex items-center gap-2 text-sm">
                    <div className="w-44 shrink-0 text-muted-foreground">{c.label}</div>
                    <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${(c.points / c.weight) * 100}%` }} />
                    </div>
                    <div className="w-12 text-right tabular-nums">{c.points}/{c.weight}</div>
                  </div>
                ))}
              </div>
            </Card>

            {plan && (
              <Card className="p-5">
                <h3 className="mb-3 flex items-center gap-2 font-semibold"><Server className="h-4 w-4" /> Infrastructure</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <Stat icon={<Users className="h-4 w-4" />} label="Accounts" value={plan.accountsNeeded} />
                  <Stat icon={<Server className="h-4 w-4" />} label="4G proxies" value={plan.proxiesNeeded} />
                  <Stat icon={<Sparkles className="h-4 w-4" />} label="Posts/day" value={plan.targetDailyPosts} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Includes a 20% shadowban buffer · 1 dedicated proxy per account · launch accounts post {plan.postsPerAccountPerDay}/day while warming.</p>
              </Card>
            )}

            <Card className="p-5">
              <h3 className="mb-3 font-semibold">Matched subreddits ({matches.length})</h3>
              {matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subreddits matched. Add entries in the catalog tab, or the creator's niche/verification settings excluded them all.</p>
              ) : (
                <div className="max-h-72 space-y-1.5 overflow-auto">
                  {matches.map((m) => (
                    <div key={m.subreddit.id} className="flex items-center gap-2 rounded border border-border px-3 py-1.5 text-sm">
                      <span className="font-medium">r/{m.subreddit.name}</span>
                      <span className="text-xs text-muted-foreground">{m.subreddit.subscribers.toLocaleString()}</span>
                      <div className="ml-auto flex items-center gap-1">
                        {m.nicheOverlap.length > 0 && <Badge variant="secondary" className="text-[10px]">{m.nicheOverlap.join(", ")}</Badge>}
                        {!m.eligibleNow && <Badge className="border bg-warning/15 text-warning border-warning/30 text-[10px]">warm-up</Badge>}
                        {m.stale && <Badge className="border bg-muted text-muted-foreground text-[10px]">stale</Badge>}
                        {m.subreddit.verification_required && <Badge className="text-[10px]"><ShieldCheck className="mr-1 h-3 w-3" />verify</Badge>}
                        <span className="w-10 text-right tabular-nums text-xs text-muted-foreground">{m.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" /> AI launch plan</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={generatePlan} disabled={generating}>{generating ? "Generating…" : "Generate"}</Button>
                  <Button size="sm" onClick={saveAssessment} disabled={saving}><Save className="mr-1 h-3.5 w-3.5" />{saving ? "Saving…" : "Save"}</Button>
                </div>
              </div>
              {launchPlan ? (
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-sm leading-relaxed">{launchPlan}</pre>
              ) : (
                <p className="text-sm text-muted-foreground">Generate a Claude-written launch plan narrative, then save the whole assessment.</p>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between text-sm"><Label>{label}</Label><span className="tabular-nums text-muted-foreground">{value}/10</span></div>
      <Slider min={0} max={10} step={1} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded border border-border px-3 py-2">
      <div><div className="text-sm font-medium">{label}</div><div className="text-xs text-muted-foreground">{hint}</div></div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1 flex justify-center text-muted-foreground">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// ── History tab ──────────────────────────────────────────────────────────────
type SavedAssessment = {
  id: string;
  creator_name: string;
  score: number;
  band: string;
  accounts_needed: number;
  proxies_needed: number;
  matched_subreddits: { name: string; score: number; stale?: boolean; eligibleNow?: boolean }[];
  launch_plan: string | null;
  created_at: string;
};

const STALE_AFTER_DAYS = 45;
function isStale(lastVerified: string | null): boolean {
  if (!lastVerified) return true;
  const ageDays = (Date.now() - new Date(lastVerified).getTime()) / 86_400_000;
  return ageDays >= STALE_AFTER_DAYS;
}

function HistoryTab() {
  const [rows, setRows] = useState<SavedAssessment[]>([]);
  const [stale, setStale] = useState<CatalogSubreddit[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<SavedAssessment | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: a }, { data: subs }] = await Promise.all([
      sb.from("reddit_assessments").select("*").order("created_at", { ascending: false }).limit(100),
      sb.from("subreddit_catalog").select("*").eq("active", true),
    ]);
    setRows((a ?? []) as SavedAssessment[]);
    setStale(((subs ?? []) as CatalogSubreddit[]).filter((s) => isStale(s.last_verified)));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    const { error } = await sb.from("reddit_assessments").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Stale-subreddit nudge */}
      {stale.length > 0 && (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <div className="text-sm font-semibold">{stale.length} subreddit{stale.length === 1 ? "" : "s"} need re-verifying</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Not verified in {STALE_AFTER_DAYS}+ days — their rules may have changed. They're down-weighted in matching until refreshed on the catalog tab.
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {stale.slice(0, 20).map((s) => (
                  <Badge key={s.id} variant="outline" className="text-[10px]">r/{s.name}</Badge>
                ))}
                {stale.length > 20 && <span className="text-[10px] text-muted-foreground">+{stale.length - 20} more</span>}
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Creator</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Band</TableHead>
              <TableHead>Infra</TableHead>
              <TableHead>Subs matched</TableHead>
              <TableHead>When</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">No saved assessments yet — run one on the Assess tab and hit Save.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.creator_name}</TableCell>
                <TableCell className="tabular-nums">{r.score}</TableCell>
                <TableCell><Badge className={`border text-[10px] uppercase ${bandStyles[r.band] ?? ""}`}>{r.band}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground tabular-nums">{r.accounts_needed} acct · {r.proxies_needed} proxy</TableCell>
                <TableCell className="text-sm text-muted-foreground tabular-nums">{r.matched_subreddits?.length ?? 0}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button size="sm" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete this assessment?</AlertDialogTitle><AlertDialogDescription>Removes the saved record for {r.creator_name}. Can't be undone.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(r.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {viewing.creator_name}
                  <Badge className={`border text-[10px] uppercase ${bandStyles[viewing.band] ?? ""}`}>{viewing.band}</Badge>
                  <span className="text-sm font-normal text-muted-foreground">{viewing.score}/100</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex gap-4 text-muted-foreground">
                  <span>{viewing.accounts_needed} accounts</span>
                  <span>{viewing.proxies_needed} proxies</span>
                  <span>{format(new Date(viewing.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
                </div>
                {viewing.matched_subreddits?.length > 0 && (
                  <div>
                    <div className="mb-1.5 font-semibold">Matched subreddits ({viewing.matched_subreddits.length})</div>
                    <div className="flex flex-wrap gap-1">
                      {viewing.matched_subreddits.map((m) => (
                        <Badge key={m.name} variant="secondary" className="text-[10px]">
                          r/{m.name}{m.stale ? " · stale" : ""}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {viewing.launch_plan ? (
                  <div>
                    <div className="mb-1.5 font-semibold">AI launch plan</div>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs leading-relaxed">{viewing.launch_plan}</pre>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No launch plan was generated for this assessment.</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Catalog tab ──────────────────────────────────────────────────────────────
function CatalogTab() {
  const [rows, setRows] = useState<CatalogSubreddit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CatalogSubreddit | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await sb.from("subreddit_catalog").select("*").order("name");
    setRows((data ?? []) as CatalogSubreddit[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    const { error } = await sb.from("subreddit_catalog").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} subreddits in catalog</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" />Import CSV</Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />Add subreddit</Button>
        </div>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subreddit</TableHead>
              <TableHead>Subscribers</TableHead>
              <TableHead>Niche</TableHead>
              <TableHead>Gates</TableHead>
              <TableHead>Last verified</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Empty — add your first subreddit.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id} className={!r.active ? "opacity-50" : ""}>
                <TableCell className="font-medium">r/{r.name}</TableCell>
                <TableCell>{r.subscribers.toLocaleString()}</TableCell>
                <TableCell className="space-x-1">{r.niche.map((n) => <Badge key={n} variant="secondary" className="text-[10px]">{n}</Badge>)}</TableCell>
                <TableCell className="space-x-1">
                  {r.verification_required && <Badge className="text-[10px]">verify</Badge>}
                  {r.min_karma > 0 && <Badge variant="outline" className="text-[10px]">{r.min_karma}k</Badge>}
                  {!r.allows_promo && <Badge className="border bg-destructive/15 text-destructive border-destructive/30 text-[10px]">no promo</Badge>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.last_verified ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>Edit</Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button size="sm" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete r/{r.name}?</AlertDialogTitle><AlertDialogDescription>This removes it from the catalog. Saved assessments keep their snapshot.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => remove(r.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <CatalogDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={() => { setOpen(false); load(); }} />
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => { setImportOpen(false); load(); }} />
    </div>
  );
}

// ── CSV import dialog ────────────────────────────────────────────────────────
function CsvImportDialog({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void }) {
  const [text, setText] = useState("");
  const [validation, setValidation] = useState<ReturnType<typeof validateCsv> | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => { if (!open) { setText(""); setValidation(null); } }, [open]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const content = await file.text();
    setText(content);
    setValidation(validateCsv(content));
  };

  const onPaste = (value: string) => {
    setText(value);
    setValidation(value.trim() ? validateCsv(value) : null);
  };

  const doImport = async () => {
    if (!validation || validation.validCount === 0) return;
    setImporting(true);
    const payloads = validation.rows.filter((r) => r.values).map((r) => r.values!);
    const { error } = await sb.from("subreddit_catalog").upsert(payloads, { onConflict: "name" });
    setImporting(false);
    if (error) toast.error(error.message);
    else { toast.success(`Imported ${payloads.length} subreddit${payloads.length === 1 ? "" : "s"}`); onImported(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-auto">
        <DialogHeader>
          <DialogTitle>Import subreddits from CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Header row required. Recognised columns: <code className="text-[11px]">name</code> (required),
            subscribers, niche, nsfw, verification_required, min_karma, min_account_age_days, allows_promo,
            posting_notes, last_verified, active. Aliases like <code className="text-[11px]">subreddit</code>,
            <code className="text-[11px]"> members</code>, <code className="text-[11px]">tags</code> work too.
            Rows upsert on <code className="text-[11px]">name</code>.
          </p>
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-xs" />
          <div className="text-center text-[11px] text-muted-foreground">or paste CSV below</div>
          <Textarea
            value={text}
            onChange={(e) => onPaste(e.target.value)}
            placeholder="name,subscribers,niche,verification_required&#10;gonewild,4500000,gonewild|amateur,false"
            className="h-32 font-mono text-xs"
          />

          {validation && (
            <div className="rounded border border-border p-3">
              {validation.fileErrors.length > 0 ? (
                <div className="text-destructive">
                  {validation.fileErrors.map((e, i) => <div key={i}>⚠ {e}</div>)}
                </div>
              ) : (
                <>
                  <div className="flex gap-4">
                    <span className="text-success">{validation.validCount} valid</span>
                    {validation.errorCount > 0 && <span className="text-destructive">{validation.errorCount} with errors</span>}
                    {validation.unknownHeaders.length > 0 && (
                      <span className="text-muted-foreground">ignored: {validation.unknownHeaders.join(", ")}</span>
                    )}
                  </div>
                  {validation.errorCount > 0 && (
                    <div className="mt-2 max-h-32 space-y-0.5 overflow-auto text-xs text-destructive">
                      {validation.rows.filter((r) => !r.values).slice(0, 20).map((r) => (
                        <div key={r.line}>Line {r.line}: {r.errors.join("; ")}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={doImport} disabled={importing || !validation || validation.validCount === 0}>
            {importing ? "Importing…" : `Import ${validation?.validCount ?? 0}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CatalogDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; editing: CatalogSubreddit | null; onSaved: () => void }) {
  const [f, setF] = useState<Omit<CatalogSubreddit, "id">>({ ...emptyCatalogForm });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) { const { id: _id, ...rest } = editing; setF(rest); }
    else setF({ ...emptyCatalogForm });
  }, [editing, open]);

  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));

  const save = async () => {
    if (!f.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const payload = { ...f, name: f.name.trim().replace(/^r\//, "") };
    const { error } = editing
      ? await sb.from("subreddit_catalog").update(payload).eq("id", editing.id)
      : await sb.from("subreddit_catalog").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success(editing ? "Updated" : "Added"); onSaved(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>{editing ? `Edit r/${editing.name}` : "Add subreddit"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Name (no r/)</Label><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Subscribers</Label><Input type="number" value={f.subscribers} onChange={(e) => set({ subscribers: Number(e.target.value) })} /></div>
          </div>
          <div className="grid gap-1.5"><Label>Niche tags (comma-separated)</Label><Input value={f.niche.join(", ")} onChange={(e) => set({ niche: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Min karma</Label><Input type="number" value={f.min_karma} onChange={(e) => set({ min_karma: Number(e.target.value) })} /></div>
            <div className="grid gap-1.5"><Label>Min account age (days)</Label><Input type="number" value={f.min_account_age_days} onChange={(e) => set({ min_account_age_days: Number(e.target.value) })} /></div>
          </div>
          <div className="grid gap-1.5"><Label>Last verified</Label><Input type="date" value={f.last_verified ?? ""} onChange={(e) => set({ last_verified: e.target.value || null })} /></div>
          <div className="grid gap-1.5"><Label>Posting notes</Label><Textarea value={f.posting_notes ?? ""} onChange={(e) => set({ posting_notes: e.target.value || null })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <ToggleRow label="NSFW" hint="18+ sub" checked={f.nsfw} onChange={(v) => set({ nsfw: v })} />
            <ToggleRow label="Verification required" hint="Gated" checked={f.verification_required} onChange={(v) => set({ verification_required: v })} />
            <ToggleRow label="Allows promo" hint="OF links ok" checked={f.allows_promo} onChange={(v) => set({ allows_promo: v })} />
            <ToggleRow label="Active" hint="In rotation" checked={f.active} onChange={(v) => set({ active: v })} />
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
