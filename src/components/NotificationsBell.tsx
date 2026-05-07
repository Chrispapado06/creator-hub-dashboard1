import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, AlertTriangle, Clock, CheckCircle2, ScrollText, ListChecks, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";

type AuditEntry = {
  id: string;
  actor_username: string | null;
  action: string;
  entity_type: string;
  entity_name: string | null;
  details: string | null;
  created_at: string;
};

type LeadTask = {
  id: string;
  lead_id: string | null;
  description: string;
  due_at: string | null;
  completed_at: string | null;
  lead_name?: string;
};

type Shift = {
  id: string;
  chatter_id: string;
  start_at: string;
  end_at: string | null;
  chatter_name?: string;
};

type Notification = {
  id: string;
  kind: "audit" | "task_due" | "task_overdue" | "shift_active";
  icon: React.ReactNode;
  title: string;
  body: string;
  timestamp: string;
  link?: string;
  tone: "info" | "warn" | "danger" | "success";
};

const TONE_STYLES: Record<Notification["tone"], string> = {
  info: "border-l-primary",
  warn: "border-l-warning",
  danger: "border-l-destructive",
  success: "border-l-success",
};

const SEEN_KEY = "agency_notifications_last_seen";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(() => {
    const v = Number(localStorage.getItem(SEEN_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
  const intervalRef = useRef<number | null>(null);

  const load = async () => {
    const sinceISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const nowISO = new Date().toISOString();
    const dueSoonISO = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const [audit, overdueTasks, dueSoonTasks, activeShifts] = await Promise.all([
      supabase
        .from("audit_log")
        .select("id, actor_username, action, entity_type, entity_name, details, created_at")
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("lead_tasks")
        .select("id, lead_id, description, due_at, completed_at, creator_leads(name)")
        .is("completed_at", null)
        .lt("due_at", nowISO)
        .order("due_at", { ascending: true })
        .limit(20),
      supabase
        .from("lead_tasks")
        .select("id, lead_id, description, due_at, completed_at, creator_leads(name)")
        .is("completed_at", null)
        .gte("due_at", nowISO)
        .lt("due_at", dueSoonISO)
        .order("due_at", { ascending: true })
        .limit(10),
      supabase
        .from("shifts")
        .select("id, chatter_id, start_at, end_at, chatters(name)")
        .is("end_at", null)
        .order("start_at", { ascending: true }),
    ]);

    const items: Notification[] = [];

    // Active shifts (people currently clocked in)
    for (const row of (activeShifts.data ?? []) as unknown as (Shift & { chatters: { name?: string } | null })[]) {
      const name = row.chatters?.name ?? "Staff";
      items.push({
        id: `shift_${row.id}`,
        kind: "shift_active",
        icon: <Clock className="h-3.5 w-3.5" />,
        title: `${name} is clocked in`,
        body: `Started ${formatDistanceToNow(new Date(row.start_at), { addSuffix: true })}`,
        timestamp: row.start_at,
        tone: "success",
      });
    }

    // Overdue tasks
    for (const row of (overdueTasks.data ?? []) as unknown as (LeadTask & { creator_leads: { name?: string } | null })[]) {
      if (!row.due_at) continue;
      items.push({
        id: `task_overdue_${row.id}`,
        kind: "task_overdue",
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        title: `Overdue: ${row.description.slice(0, 60)}`,
        body: row.creator_leads?.name
          ? `Lead: ${row.creator_leads.name} · due ${formatDistanceToNow(new Date(row.due_at), { addSuffix: true })}`
          : `Due ${formatDistanceToNow(new Date(row.due_at), { addSuffix: true })}`,
        timestamp: row.due_at,
        link: "/leads",
        tone: "danger",
      });
    }

    // Due soon
    for (const row of (dueSoonTasks.data ?? []) as unknown as (LeadTask & { creator_leads: { name?: string } | null })[]) {
      if (!row.due_at) continue;
      items.push({
        id: `task_due_${row.id}`,
        kind: "task_due",
        icon: <Clock className="h-3.5 w-3.5" />,
        title: `Due soon: ${row.description.slice(0, 60)}`,
        body: row.creator_leads?.name
          ? `Lead: ${row.creator_leads.name} · in ${formatDistanceToNow(new Date(row.due_at))}`
          : `Due in ${formatDistanceToNow(new Date(row.due_at))}`,
        timestamp: row.due_at,
        link: "/leads",
        tone: "warn",
      });
    }

    // Audit feed
    for (const row of (audit.data ?? []) as AuditEntry[]) {
      const titlePrefix = row.entity_name ? `${row.entity_name}` : row.entity_type;
      items.push({
        id: `audit_${row.id}`,
        kind: "audit",
        icon: <ScrollText className="h-3.5 w-3.5" />,
        title: `${row.actor_username ?? "system"} · ${row.action.replace(/_/g, " ")}`,
        body: `${titlePrefix}${row.details ? ` — ${row.details}` : ""}`,
        timestamp: row.created_at,
        link: "/audit",
        tone: "info",
      });
    }

    setNotifications(items);
  };

  useEffect(() => {
    load();
    intervalRef.current = window.setInterval(load, 60_000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  const sorted = useMemo(() => {
    const order = { task_overdue: 0, shift_active: 1, task_due: 2, audit: 3 } as const;
    return [...notifications].sort((a, b) => {
      const ord = order[a.kind] - order[b.kind];
      if (ord !== 0) return ord;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [notifications]);

  const unread = sorted.filter((n) => new Date(n.timestamp).getTime() > lastSeen).length;
  const urgent = sorted.filter((n) => n.kind === "task_overdue").length;

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      const ts = Date.now();
      localStorage.setItem(SEEN_KEY, String(ts));
      setLastSeen(ts);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card/50 backdrop-blur-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {(unread > 0 || urgent > 0) && (
            <span
              className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                urgent > 0 ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
              }`}
            >
              {urgent > 0 ? urgent : unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0 max-h-[70vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Notifications</h3>
          </div>
          <span className="text-[11px] text-muted-foreground">{sorted.length} item{sorted.length === 1 ? "" : "s"}</span>
        </div>

        {sorted.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-success/60 mx-auto mb-2" />
            <div className="text-sm font-medium">All caught up</div>
            <p className="text-xs text-muted-foreground mt-1">
              No overdue tasks, no active shifts, and the audit log is quiet.
            </p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
            {sorted.map((n) => {
              const inner = (
                <div className={`group p-3 hover:bg-secondary/40 border-l-2 ${TONE_STYLES[n.tone]} transition-colors`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 ${
                      n.tone === "danger" ? "text-destructive" :
                      n.tone === "warn" ? "text-warning" :
                      n.tone === "success" ? "text-success" :
                      "text-muted-foreground"
                    }`}>
                      {n.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{n.title}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{n.body}</div>
                      <div className="text-[10px] text-muted-foreground/70 mt-1">
                        {formatDistanceToNow(new Date(n.timestamp), { addSuffix: true })}
                      </div>
                    </div>
                    {n.link && (
                      <ExternalLink className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
                    )}
                  </div>
                </div>
              );
              return n.link ? (
                <Link
                  key={n.id}
                  to={n.link as "/audit" | "/leads"}
                  onClick={() => setOpen(false)}
                  className="block border-b border-border last:border-0"
                >
                  {inner}
                </Link>
              ) : (
                <div key={n.id} className="border-b border-border last:border-0">
                  {inner}
                </div>
              );
            })}
          </div>
        )}

        <div className="px-4 py-2 border-t border-border bg-secondary/20">
          <Link
            to="/audit"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <ListChecks className="h-3 w-3" /> View full audit log
            </span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
