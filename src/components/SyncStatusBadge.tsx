import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, Pause, Play, Loader2,
} from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  listSyncStatus, runAutoSync, runSyncJob, SYNC_JOB_LABELS,
  type SyncJobId, type SyncStatusRow,
} from "@/lib/sync";
import { supabase } from "@/integrations/supabase/client";

const POLL_MS = 5 * 60 * 1000;          // re-check every 5 min while the tab is open
const ON_FOCUS_DEBOUNCE_MS = 30 * 1000; // when user refocuses the tab, re-check (but not more than once per 30s)

type Props = { enabled: boolean };

/**
 * Top-right pill that:
 *  • Drives the auto-sync orchestrator on a 5-minute cadence (the orchestrator
 *    itself only runs jobs whose `interval_minutes` has elapsed — defaults to 120).
 *  • Shows the freshest sync status across all jobs.
 *  • Lets the user inspect each job's last run, run them on demand, or toggle them off.
 *
 * Pass `enabled={true}` to mount; the parent should set this to `false` while
 * an unauthenticated user is on the login screen, etc.
 */
export function SyncStatusBadge({ enabled }: Props) {
  const [rows, setRows] = useState<SyncStatusRow[]>([]);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    const next = await listSyncStatus();
    setRows(next);
  };

  // Run any overdue syncs, then refresh display
  const tick = async () => {
    if (!enabled) return;
    setRunning(true);
    try {
      await runAutoSync();
    } finally {
      setRunning(false);
      await refresh();
    }
  };

  useEffect(() => {
    if (!enabled) return;
    void tick();
    const id = window.setInterval(tick, POLL_MS);

    // Re-check when the tab regains focus, but throttle.
    let lastFocusTick = 0;
    const onFocus = () => {
      const now = Date.now();
      if (now - lastFocusTick < ON_FOCUS_DEBOUNCE_MS) return;
      lastFocusTick = now;
      void tick();
    };
    window.addEventListener("focus", onFocus);

    // Also refresh display every 60s without running orchestrator (so the
    // "synced 2 minutes ago" label feels live)
    const refreshId = window.setInterval(refresh, 60_000);

    return () => {
      window.clearInterval(id);
      window.clearInterval(refreshId);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const summary = useMemo(() => {
    if (rows.length === 0) return { tone: "neutral" as const, text: "—" };
    const anyRunning = rows.some((r) => r.last_status === "running" || (r.locked_until && new Date(r.locked_until) > new Date()));
    if (anyRunning || running) return { tone: "running" as const, text: "Syncing…" };
    const anyFailed = rows.some((r) => r.auto_enabled && r.last_status === "failed");
    if (anyFailed) return { tone: "failed" as const, text: "Sync failing" };
    const anyPartial = rows.some((r) => r.auto_enabled && r.last_status === "partial");
    if (anyPartial) return { tone: "partial" as const, text: "Partial sync" };
    const newest = rows
      .filter((r) => r.last_synced_at)
      .map((r) => new Date(r.last_synced_at!).getTime())
      .sort((a, b) => b - a)[0];
    if (!newest) return { tone: "neutral" as const, text: "Not synced yet" };
    return {
      tone: "ok" as const,
      text: `Synced ${formatDistanceToNow(new Date(newest), { addSuffix: true })}`,
    };
  }, [rows, running]);

  const tone = summary.tone;

  const onForceRun = async (id: SyncJobId) => {
    setRunning(true);
    try {
      const result = await runSyncJob(id);
      if (!result) {
        toast.info("Another tab is already running this sync — try again in a moment");
      } else if (result.status === "ok") {
        toast.success(`${SYNC_JOB_LABELS[id]}: ${result.message}`);
      } else if (result.status === "partial") {
        toast.warning(`${SYNC_JOB_LABELS[id]}: ${result.message}`);
      } else {
        toast.error(`${SYNC_JOB_LABELS[id]}: ${result.message}`);
      }
    } finally {
      setRunning(false);
      await refresh();
    }
  };

  const onToggleAuto = async (id: SyncJobId, value: boolean) => {
    const { error } = await supabase
      .from("sync_status")
      .update({ auto_enabled: value, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    await refresh();
  };

  if (!enabled) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border bg-card/50 backdrop-blur-sm text-xs font-medium transition-colors ${
            tone === "running" ? "border-primary/40 text-primary" :
            tone === "failed"  ? "border-destructive/40 text-destructive" :
            tone === "partial" ? "border-warning/40 text-warning" :
            tone === "ok"      ? "border-border text-muted-foreground hover:text-foreground" :
                                 "border-border text-muted-foreground hover:text-foreground"
          }`}
          aria-label="Sync status"
        >
          {tone === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
           tone === "failed"  ? <AlertCircle className="h-3.5 w-3.5" /> :
           tone === "partial" ? <AlertTriangle className="h-3.5 w-3.5" /> :
           tone === "ok"      ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                                <RefreshCw className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{summary.text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Auto-sync</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Runs every 2h while any admin has the dashboard open.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={tick} disabled={running}>
            <RefreshCw className={`h-3 w-3 mr-1 ${running ? "animate-spin" : ""}`} />
            Run now
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading sync state…
            </div>
          ) : (
            rows.map((row) => {
              const lockedByOther = row.locked_until && new Date(row.locked_until) > new Date();
              const fresh = row.last_synced_at
                ? formatDistanceToNow(new Date(row.last_synced_at), { addSuffix: true })
                : "never";
              const tone =
                lockedByOther || row.last_status === "running" ? "text-primary" :
                row.last_status === "failed" ? "text-destructive" :
                row.last_status === "partial" ? "text-warning" :
                row.last_status === "ok" ? "text-success" :
                "text-muted-foreground";
              return (
                <div key={row.id} className="px-4 py-3 border-b border-border last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {SYNC_JOB_LABELS[row.id]}
                        </span>
                        {!row.auto_enabled && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">paused</span>
                        )}
                      </div>
                      <div className={`text-[11px] mt-0.5 ${tone}`}>
                        {lockedByOther || row.last_status === "running" ? "Running now" : fresh}
                        {row.last_message && ` · ${row.last_message}`}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                        Every {row.interval_minutes} min
                        {row.last_actor && row.last_synced_at && ` · last triggered by ${row.last_actor}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={row.auto_enabled}
                        onCheckedChange={(v) => onToggleAuto(row.id, v)}
                        aria-label={row.auto_enabled ? "Pause auto-sync" : "Enable auto-sync"}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onForceRun(row.id)}
                        disabled={running || !!lockedByOther}
                        className="h-7 text-xs"
                      >
                        {row.auto_enabled ? <Pause className="h-3 w-3 hidden" /> : <Play className="h-3 w-3 hidden" />}
                        Run
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-border bg-secondary/20">
          <p className="text-[10px] text-muted-foreground/80">
            Locks coordinate across browser tabs — opening the app in a second tab won't double-run jobs.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
