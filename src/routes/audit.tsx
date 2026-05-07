import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { ScrollText, RefreshCw, Filter, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "Audit Log — Agency Console" }] }),
  component: AuditPage,
});

type AuditEntry = {
  id: string;
  actor_username: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  details: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const PAGE_SIZE = 50;

const ACTION_TONE: Record<string, string> = {
  create: "text-success bg-success/10 border-success/20",
  update: "text-primary bg-primary/10 border-primary/20",
  delete: "text-destructive bg-destructive/10 border-destructive/20",
  status_change: "text-warning bg-warning/10 border-warning/20",
  login: "text-muted-foreground bg-secondary border-border",
  payout: "text-success bg-success/10 border-success/20",
};

function actionTone(action: string): string {
  const lower = action.toLowerCase();
  for (const key of Object.keys(ACTION_TONE)) {
    if (lower.includes(key)) return ACTION_TONE[key];
  }
  return "text-muted-foreground bg-secondary border-border";
}

function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  // Filters
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [actors, setActors] = useState<string[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (actorFilter !== "all") q = q.eq("actor_username", actorFilter);
    if (entityFilter !== "all") q = q.eq("entity_type", entityFilter);
    if (actionFilter !== "all") q = q.eq("action", actionFilter);
    if (search.trim()) {
      const s = `%${search.trim()}%`;
      q = q.or(`entity_name.ilike.${s},details.ilike.${s},entity_id.ilike.${s}`);
    }

    const { data, error, count } = await q;
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEntries((data ?? []) as AuditEntry[]);
    setTotal(count ?? 0);
  };

  const loadFacets = async () => {
    const { data } = await supabase
      .from("audit_log")
      .select("actor_username, entity_type, action")
      .order("created_at", { ascending: false })
      .limit(1000);
    const a = new Set<string>();
    const e = new Set<string>();
    const ac = new Set<string>();
    (data ?? []).forEach((r) => {
      if (r.actor_username) a.add(r.actor_username);
      if (r.entity_type) e.add(r.entity_type);
      if (r.action) ac.add(r.action);
    });
    setActors([...a].sort());
    setEntityTypes([...e].sort());
    setActions([...ac].sort());
  };

  useEffect(() => { loadFacets(); }, []);
  useEffect(() => { load(); }, [page, actorFilter, entityFilter, actionFilter]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    load();
  };

  const resetFilters = () => {
    setActorFilter("all");
    setEntityFilter("all");
    setActionFilter("all");
    setSearch("");
    setPage(0);
  };

  const exportCsv = () => {
    if (entries.length === 0) return toast.info("Nothing to export on this page");
    const header = ["timestamp", "actor", "action", "entity_type", "entity_id", "entity_name", "details"];
    const rows = entries.map((e) => [
      e.created_at,
      e.actor_username ?? "",
      e.action,
      e.entity_type,
      e.entity_id ?? "",
      e.entity_name ?? "",
      (e.details ?? "").replace(/\n/g, " "),
    ]);
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map((c) => escape(String(c))).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = useMemo(() => entries, [entries]);

  return (
    <div className="space-y-6">
      <Toaster />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Append-only history of who-did-what across the agency. {total.toLocaleString()} entries total.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => { loadFacets(); load(); }}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter className="h-4 w-4 text-muted-foreground" />
          Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Actor</Label>
            <Select value={actorFilter} onValueChange={(v) => { setActorFilter(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actors</SelectItem>
                {actors.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Entity type</Label>
            <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entity types</SelectItem>
                {entityTypes.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Action</Label>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <form onSubmit={onSearchSubmit} className="space-y-1.5">
            <Label className="text-xs">Search name / details / id</Label>
            <Input
              placeholder="Press Enter to search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
        </div>
        {(actorFilter !== "all" || entityFilter !== "all" || actionFilter !== "all" || search) && (
          <div>
            <Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border">
        {loading && entries.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No entries match your filters yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-3 w-44">When</th>
                <th className="text-left font-medium px-4 py-3 w-32">Actor</th>
                <th className="text-left font-medium px-4 py-3 w-40">Action</th>
                <th className="text-left font-medium px-4 py-3 w-32">Entity</th>
                <th className="text-left font-medium px-4 py-3">Subject</th>
                <th className="text-left font-medium px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const created = new Date(e.created_at);
                return (
                  <tr key={e.id} className="border-t border-border bg-card hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <div className="text-xs text-foreground">{format(created, "MMM d, yyyy")}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {format(created, "h:mm a")} · {formatDistanceToNow(created, { addSuffix: true })}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="font-mono text-xs">{e.actor_username ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded border ${actionTone(e.action)}`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="text-xs text-muted-foreground">{e.entity_type}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {e.entity_name ? (
                        <div className="text-xs font-medium">{e.entity_name}</div>
                      ) : (
                        <div className="text-xs text-muted-foreground">—</div>
                      )}
                      {e.entity_id && (
                        <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5 truncate max-w-[220px]">
                          {e.entity_id}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                      {e.details ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · showing {entries.length} of {total.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
