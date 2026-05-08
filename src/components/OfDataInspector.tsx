// On-page OnlyFans data inspector.
//
// A non-technical user can't open dev tools. When sync "succeeds" but
// numbers stay $0, the answer lives in one of three places:
//   1. Was a row written to of_creator_stats? (sync truly ran)
//   2. What did the OnlyFansAPI /earnings endpoint actually return?
//      (sometimes the API returns a real number, sometimes 0, sometimes
//      a totally different shape than we mapped)
//   3. Did the row include the right fields, or did our parser miss them?
//
// This panel surfaces all three. The user can screenshot the raw JSON
// blob and send it back, which is enough to fix any field-name mismatch
// in 60 seconds.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Activity, ChevronDown, ChevronRight, RefreshCw, AlertCircle,
  CheckCircle2, Bug, Copy, Check,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";

const BASE = "https://app.onlyfansapi.com/api";

type CreatorMin = {
  id: string;
  name: string;
  of_username: string | null;
  onlyfansapi_acct_id: string | null;
};

type StatRow = {
  creator_id: string;
  total_earnings: number;
  earnings_subs: number;
  earnings_tips: number;
  earnings_ppv: number;
  earnings_messages: number;
  active_subscribers: number;
  synced_at: string;
};

type SecondaryAccount = {
  creator_id: string;
  of_username: string;
  onlyfansapi_acct_id: string | null;
  label: string | null;
  is_primary: boolean;
};

export function OfDataInspector() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creators, setCreators] = useState<CreatorMin[]>([]);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [secondaryAccounts, setSecondaryAccounts] = useState<SecondaryAccount[]>([]);

  // Per-creator raw API peek state
  const [probing, setProbing] = useState<string | null>(null);
  const [probeResults, setProbeResults] = useState<Record<string, ProbeResult>>({});
  const [copied, setCopied] = useState<string | null>(null);

  // Lazy-load only when the panel opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void (async () => {
      const [{ data: cs }, { data: st }, { data: of }] = await Promise.all([
        supabase.from("creators").select("id, name, of_username, onlyfansapi_acct_id").order("name"),
        supabase.from("of_creator_stats").select("creator_id, total_earnings, earnings_subs, earnings_tips, earnings_ppv, earnings_messages, active_subscribers, synced_at"),
        // Pull every secondary OF account too so the inspector shows
        // all of a creator's connected pages, not just the primary.
        // Returns null if the migration hasn't been applied yet —
        // we coalesce to [] so the inspector still renders.
        supabase.from("creator_of_accounts").select("creator_id, of_username, onlyfansapi_acct_id, label, is_primary"),
      ]);
      setCreators((cs ?? []) as CreatorMin[]);
      setStats((st ?? []) as StatRow[]);
      setSecondaryAccounts((of ?? []) as SecondaryAccount[]);
      setLoading(false);
    })();
  }, [open]);

  // Hit OnlyFansAPI for one creator and capture the raw JSON. This is
  // what we need to see when "earnings = 0 in DB" happens — it tells us
  // whether the API actually returned 0 or our parser missed the field.
  const probeCreator = async (c: CreatorMin) => {
    setProbing(c.id);
    const key = (import.meta.env.VITE_ONLYFANSAPI_KEY as string | undefined) ?? "";
    if (!key) {
      setProbeResults((p) => ({ ...p, [c.id]: { error: "VITE_ONLYFANSAPI_KEY not set in .env" } }));
      setProbing(null);
      return;
    }
    if (!c.of_username) {
      setProbeResults((p) => ({ ...p, [c.id]: { error: "Creator has no of_username set" } }));
      setProbing(null);
      return;
    }
    let acctId = c.onlyfansapi_acct_id;
    try {
      // Resolve acct id if missing
      if (!acctId) {
        const r = await fetch(`${BASE}/accounts`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!r.ok) {
          setProbeResults((p) => ({
            ...p, [c.id]: { error: `/accounts returned HTTP ${r.status}` },
          }));
          setProbing(null);
          return;
        }
        const j = (await r.json()) as { data?: Array<{ id: string; onlyfans_username?: string }> } | Array<{ id: string; onlyfans_username?: string }>;
        const arr = Array.isArray(j) ? j : (j.data ?? []);
        const match = arr.find((a) => a.onlyfans_username?.toLowerCase() === c.of_username!.toLowerCase());
        if (!match) {
          setProbeResults((p) => ({
            ...p,
            [c.id]: {
              error: `Creator "${c.of_username}" not found in OnlyFansAPI's connected accounts. Connect the account on app.onlyfansapi.com first.`,
              accountsList: arr.map((a) => a.onlyfans_username).filter(Boolean) as string[],
            },
          }));
          setProbing(null);
          return;
        }
        acctId = match.id;
      }
      // POST /analytics/summary/earnings — the working earnings endpoint
      // for current OnlyFansAPI tiers. We tried the documented GET
      // /payouts/earnings-statistics first but it returns 404 for our
      // accounts. The probe matches the sync's primary path.
      const today = new Date().toISOString().slice(0, 10);
      const r = await fetch(`${BASE}/analytics/summary/earnings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          account_ids: [acctId],
          start_date: "2018-01-01",
          end_date: today,
        }),
      });
      if (!r.ok) {
        let detail = `HTTP ${r.status}`;
        try {
          const err = await r.json();
          if (err && typeof err === "object" && "message" in err) {
            detail = `HTTP ${r.status}: ${(err as { message: string }).message}`;
          }
        } catch { /* ignore */ }
        setProbeResults((p) => ({
          ...p, [c.id]: { error: `/analytics/summary/earnings → ${detail}`, acctId },
        }));
        setProbing(null);
        return;
      }
      const json = await r.json();
      setProbeResults((p) => ({ ...p, [c.id]: { acctId, raw: json } }));
    } catch (e) {
      setProbeResults((p) => ({
        ...p,
        [c.id]: { error: e instanceof Error ? e.message : "Network error" },
      }));
    } finally {
      setProbing(null);
    }
  };

  const onCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.03] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-amber-500/5 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Bug className="h-4 w-4 text-amber-400" />
          <span className="font-semibold">OnlyFans data inspector</span>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            — see exactly what's in the database vs what the API returns
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">Click to {open ? "hide" : "show"}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-amber-500/20">
          {loading ? (
            <div className="py-6 text-xs text-muted-foreground italic text-center">Loading…</div>
          ) : (
            <>
              {/* Summary line */}
              <div className="mt-4 text-xs">
                <span className="text-muted-foreground">Creators:</span>{" "}
                <span className="font-semibold">{creators.length}</span>
                {" · "}
                <span className="text-muted-foreground">With OF username:</span>{" "}
                <span className="font-semibold">{creators.filter((c) => c.of_username).length}</span>
                {" · "}
                <span className="text-muted-foreground">Rows in <code>of_creator_stats</code>:</span>{" "}
                <span className="font-semibold">{stats.length}</span>
                {" · "}
                <span className="text-muted-foreground">Total earnings synced:</span>{" "}
                <span className="font-semibold text-blue-400">
                  ${stats.reduce((s, r) => s + r.total_earnings, 0).toLocaleString()}
                </span>
              </div>

              {/* Per-creator rows */}
              <div className="space-y-2">
                {creators.map((c) => {
                  const stat = stats.find((s) => s.creator_id === c.id);
                  const probe = probeResults[c.id];
                  const hasUsername = !!c.of_username;
                  const hasAcctId = !!c.onlyfansapi_acct_id;
                  const myAccounts = secondaryAccounts.filter((a) => a.creator_id === c.id);
                  // List of OF accounts to show under the creator. If
                  // the creator hasn't been migrated yet (no rows in
                  // creator_of_accounts), we synthesise the primary
                  // from the legacy columns so the inspector still
                  // shows something useful.
                  const accountList = myAccounts.length > 0
                    ? [...myAccounts].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
                    : (hasUsername ? [{
                        creator_id: c.id, of_username: c.of_username!, onlyfansapi_acct_id: c.onlyfansapi_acct_id,
                        label: "main", is_primary: true,
                      } as SecondaryAccount] : []);
                  return (
                    <div key={c.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="text-sm font-medium truncate">{c.name}</span>
                          {accountList.length > 1 && (
                            <span className="text-[10px] text-muted-foreground">
                              · {accountList.length} OF pages
                            </span>
                          )}
                          {/* Status badges */}
                          <Badge ok={hasUsername} label={hasUsername ? `OF: ${c.of_username}` : "No OF username"} />
                          <Badge ok={hasAcctId} label={hasAcctId ? "Connected" : "Not connected"} />
                          <Badge
                            ok={!!stat}
                            label={stat ? `Synced ${formatDistanceToNow(parseISO(stat.synced_at), { addSuffix: true })}` : "Never synced"}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void probeCreator(c)}
                          disabled={probing === c.id || !hasUsername}
                          className="h-7 text-[11px]"
                          title="Hit the OnlyFansAPI /earnings endpoint and show the raw response"
                        >
                          {probing === c.id ? (
                            <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Probing…</>
                          ) : (
                            <><Activity className="h-3 w-3 mr-1" /> Test API</>
                          )}
                        </Button>
                      </div>

                      {/* Per-OF-page strip — only meaningful when more
                          than one page is connected, otherwise just
                          duplicates the badge above. */}
                      {accountList.length > 1 && (
                        <div className="flex flex-wrap gap-1">
                          {accountList.map((a) => (
                            <span
                              key={`${a.of_username}-${a.is_primary}`}
                              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                a.is_primary
                                  ? "border-primary/30 bg-primary/5 text-primary"
                                  : "border-border bg-secondary/40 text-muted-foreground"
                              }`}
                              title={a.onlyfansapi_acct_id ?? "not connected"}
                            >
                              @{a.of_username}{a.label ? ` · ${a.label}` : ""}
                              {!a.onlyfansapi_acct_id && " ⚠"}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* DB row contents */}
                      {stat ? (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
                          <Cell label="Total" value={`$${stat.total_earnings.toLocaleString()}`} highlight={stat.total_earnings === 0} />
                          <Cell label="Subs" value={`$${stat.earnings_subs.toLocaleString()}`} />
                          <Cell label="Tips" value={`$${stat.earnings_tips.toLocaleString()}`} />
                          <Cell label="PPV" value={`$${stat.earnings_ppv.toLocaleString()}`} />
                          <Cell label="Msgs" value={`$${stat.earnings_messages.toLocaleString()}`} />
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground italic">
                          No row in of_creator_stats — click "Test API" to see what the OnlyFansAPI returns.
                        </div>
                      )}

                      {/* Probe result */}
                      {probe && (
                        <div className="rounded-md bg-secondary/40 p-2.5 space-y-2">
                          {probe.error ? (
                            <div className="text-[11px] text-rose-400 flex items-start gap-1.5">
                              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <div className="font-medium">{probe.error}</div>
                                {probe.accountsList && (
                                  <div className="text-[10px] text-muted-foreground mt-1">
                                    OnlyFansAPI knows about: {probe.accountsList.length === 0
                                      ? "(no accounts)"
                                      : probe.accountsList.join(", ")}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                                <CheckCircle2 className="h-3 w-3" />
                                Live response from <code>/{probe.acctId}/earnings</code>
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                If "total" is 0 below, the OF account itself has no recorded earnings.
                                If "total" has a number but the table above shows $0, the parser is missing a field — copy the JSON and send it to the dev.
                              </div>
                              <div className="relative">
                                <pre className="text-[10px] bg-background border border-border rounded p-2 overflow-x-auto max-h-64 leading-relaxed">
                                  {JSON.stringify(probe.raw, null, 2)}
                                </pre>
                                <button
                                  onClick={() => void onCopy(c.id, JSON.stringify(probe.raw, null, 2))}
                                  className="absolute top-1.5 right-1.5 h-6 px-1.5 rounded bg-secondary text-[10px] hover:bg-secondary/70 inline-flex items-center gap-1"
                                >
                                  {copied === c.id ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                                  {copied === c.id ? "Copied" : "Copy"}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Help text */}
              <div className="rounded-md border border-border bg-secondary/20 p-3 text-[11px] text-muted-foreground space-y-1.5">
                <div className="font-semibold text-foreground">How to use this</div>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>If a creator says <span className="text-rose-400">"Never synced"</span>, the Sync button never wrote a row for them. Hit Sync OnlyFans at the top of the page.</li>
                  <li>If a creator says <span className="text-emerald-400">"Synced"</span> but Total is $0, click <span className="font-semibold">Test API</span> to see what the OnlyFansAPI is returning. If the JSON shows a real number, screenshot it and send to the dev — the parser is mapping the wrong field name.</li>
                  <li>If <span className="text-rose-400">"Not connected"</span>, the creator's OF account isn't linked on app.onlyfansapi.com yet. Connect it there first.</li>
                </ol>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tiny presentational helpers ────────────────────────────────────────

type ProbeResult = {
  raw?: unknown;
  acctId?: string | null;
  error?: string;
  accountsList?: string[];
};

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
      ok
        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
        : "bg-rose-500/10 text-rose-400 border-rose-500/30"
    }`}>
      {label}
    </span>
  );
}

function Cell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded px-2 py-1 ${highlight ? "bg-rose-500/10 border border-rose-500/30" : "bg-secondary/40"}`}>
      <div className="uppercase tracking-wider text-muted-foreground/70 text-[9px]">{label}</div>
      <div className={`font-bold tabular-nums ${highlight ? "text-rose-400" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
