import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  Zap, Plus, Trash2, Pencil, Play, Pause, History, AlertCircle,
  CheckCircle2, Info, RefreshCw,
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { logAudit } from "@/lib/audit";
import {
  ACTION_LABELS, RULE_TEMPLATES, type AutomationRule, type RuleTemplate,
} from "@/lib/automation";
import { runSyncJob } from "@/lib/sync";

export const Route = createFileRoute("/automation")({
  head: () => ({ meta: [{ title: "Automation — Agency Console" }] }),
  component: AutomationPage,
});

const ROLE_SCOPES = [
  { value: "all",                  label: "All staff" },
  { value: "manager",              label: "Managers (general)" },
  { value: "chatter_manager",      label: "Chatting Managers" },
  { value: "reddit_manager",       label: "Reddit Managers" },
  { value: "instagram_manager",    label: "Instagram Managers" },
  { value: "facebook_manager",     label: "Facebook Managers" },
  { value: "tiktok_manager",       label: "TikTok Managers" },
  { value: "x_manager",            label: "X Managers" },
  { value: "social_media_manager", label: "Social Media Managers" },
  { value: "content_manager",      label: "Content Managers" },
];

const getActor = (): string | null => {
  const raw = localStorage.getItem("agency_session");
  if (!raw) return null;
  try { return (JSON.parse(raw) as { username?: string })?.username ?? null; }
  catch { return raw; }
};

function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<RuleTemplate | null>(null);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("automation_rules")
      .select("*")
      .order("enabled", { ascending: false })
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setRules((data ?? []) as AutomationRule[]);
  };

  useEffect(() => { void load(); }, []);

  const onToggle = async (r: AutomationRule, enabled: boolean) => {
    const { error } = await supabase.from("automation_rules").update({ enabled, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) return toast.error(error.message);
    void logAudit({ action: enabled ? "rule_enabled" : "rule_disabled", entity_type: "automation_rule", entity_id: r.id, entity_name: r.label });
    void load();
  };

  const onDelete = async (r: AutomationRule) => {
    if (!confirm(`Delete "${r.label}"? Past fires stay in audit log; the rule itself is removed.`)) return;
    const { error } = await supabase.from("automation_rules").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    void logAudit({ action: "rule_deleted", entity_type: "automation_rule", entity_id: r.id, entity_name: r.label });
    toast.success("Removed");
    void load();
  };

  const onRunNow = async () => {
    setRunning(true);
    try {
      const result = await runSyncJob("automation_rules");
      if (!result) toast.info("Already running in another tab");
      else if (result.status === "ok") toast.success(result.message);
      else if (result.status === "partial") toast.warning(result.message);
      else toast.error(result.message);
    } finally {
      setRunning(false);
      void load();
    }
  };

  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-6">
      <Toaster />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Automation</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              If-this-then-that rules. {enabledCount} enabled · {rules.length} total. Evaluated every hour while a tab's open.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onRunNow} disabled={running}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${running ? "animate-spin" : ""}`} />
            Evaluate now
          </Button>
        </div>
      </div>

      {/* Add a rule */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Add a rule</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {RULE_TEMPLATES.map((t) => (
            <button
              key={t.trigger}
              onClick={() => setCreating(t)}
              className="group rounded-xl border border-border bg-card hover:bg-secondary/30 hover:border-primary/30 p-4 text-left transition-all"
            >
              <div className="text-sm font-semibold">{t.trigger_label}</div>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{t.trigger_description}</p>
              <div className="text-[10px] text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                + Add rule
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Existing rules */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">Your rules</h2>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No rules yet. Pick a template above to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => <RuleRow key={r.id} rule={r} onToggle={onToggle} onEdit={setEditing} onDelete={onDelete} />)}
          </div>
        )}
      </section>

      {/* Create dialog */}
      <RuleEditor
        open={!!creating}
        template={creating}
        onClose={() => setCreating(null)}
        onSaved={() => { setCreating(null); void load(); }}
      />

      {/* Edit dialog */}
      <RuleEditor
        open={!!editing}
        rule={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void load(); }}
      />
    </div>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────

function RuleRow({
  rule, onToggle, onEdit, onDelete,
}: {
  rule: AutomationRule;
  onToggle: (r: AutomationRule, v: boolean) => void;
  onEdit: (r: AutomationRule) => void;
  onDelete: (r: AutomationRule) => void;
}) {
  const tmpl = RULE_TEMPLATES.find((t) => t.trigger === rule.trigger);
  const lastFired = rule.last_fired_at ? formatDistanceToNow(parseISO(rule.last_fired_at), { addSuffix: true }) : null;
  const lastEval = rule.last_evaluated_at ? formatDistanceToNow(parseISO(rule.last_evaluated_at), { addSuffix: true }) : null;
  const evalIsError = rule.last_eval_message?.startsWith("error:");

  return (
    <div className={`rounded-xl border p-4 transition-colors ${rule.enabled ? "border-border bg-card" : "border-border/50 bg-card/50 opacity-75"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${rule.enabled ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
            {rule.enabled ? <Play className="h-4 w-4" fill="currentColor" /> : <Pause className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
              {rule.label}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-normal">
                {tmpl?.trigger_label ?? rule.trigger}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-normal">
                → {ACTION_LABELS[rule.action] ?? rule.action}
              </span>
            </div>
            {rule.description && <p className="text-[11px] text-muted-foreground mt-0.5">{rule.description}</p>}
            <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <History className="h-3 w-3" />
                Fired {rule.fire_count}x
                {lastFired && ` · last ${lastFired}`}
              </span>
              <span>·</span>
              <span>{rule.cooldown_hours}h cooldown</span>
              {lastEval && (
                <>
                  <span>·</span>
                  <span className={evalIsError ? "text-destructive" : ""}>
                    Last eval {lastEval}{rule.last_eval_message ? `: ${rule.last_eval_message}` : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Switch checked={rule.enabled} onCheckedChange={(v) => onToggle(rule, v)} />
          <button onClick={() => onEdit(rule)} className="text-muted-foreground hover:text-primary p-1.5"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={() => onDelete(rule)} className="text-muted-foreground hover:text-destructive p-1.5"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────

function RuleEditor({
  open, template, rule, onClose, onSaved,
}: {
  open: boolean;
  template?: RuleTemplate | null;
  rule?: AutomationRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!rule;
  const tmpl = isEdit
    ? RULE_TEMPLATES.find((t) => t.trigger === rule!.trigger)
    : template;

  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [triggerParams, setTriggerParams] = useState<Record<string, unknown>>({});
  const [action, setAction] = useState<string>("audit_entry");
  const [actionParams, setActionParams] = useState<Record<string, unknown>>({});
  const [cooldownHours, setCooldownHours] = useState(24);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (rule) {
      setLabel(rule.label);
      setDescription(rule.description ?? "");
      setEnabled(rule.enabled);
      setTriggerParams(rule.trigger_params ?? {});
      setAction(rule.action);
      setActionParams(rule.action_params ?? {});
      setCooldownHours(rule.cooldown_hours);
    } else if (template) {
      setLabel(template.default_label);
      setDescription(template.default_description);
      setEnabled(true);
      setTriggerParams({ ...template.default_trigger_params });
      const firstAction = template.suggested_actions[0];
      setAction(firstAction.action);
      setActionParams({ ...firstAction.default_action_params });
      setCooldownHours(24);
    }
  }, [open, rule, template]);

  const switchAction = (newAction: string) => {
    setAction(newAction);
    if (tmpl) {
      const found = tmpl.suggested_actions.find((s) => s.action === newAction);
      if (found) setActionParams({ ...found.default_action_params });
    }
  };

  const onSave = async () => {
    if (!label.trim()) return toast.error("Label required");
    if (!tmpl) return toast.error("Pick a trigger template first");
    setSaving(true);
    const payload = {
      label: label.trim(),
      description: description.trim() || null,
      enabled,
      trigger: tmpl.trigger,
      trigger_params: triggerParams,
      action,
      action_params: actionParams,
      cooldown_hours: cooldownHours,
      updated_at: new Date().toISOString(),
    };
    if (isEdit && rule) {
      const { error } = await supabase.from("automation_rules").update(payload).eq("id", rule.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      void logAudit({ action: "rule_updated", entity_type: "automation_rule", entity_id: rule.id, entity_name: payload.label });
      toast.success("Updated");
    } else {
      const { error } = await supabase.from("automation_rules").insert({ ...payload, created_by: getActor() });
      setSaving(false);
      if (error) return toast.error(error.message);
      void logAudit({ action: "rule_created", entity_type: "automation_rule", entity_name: payload.label });
      toast.success("Rule added");
    }
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            {isEdit ? "Edit rule" : "New rule"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* What it is */}
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          {/* Trigger */}
          {tmpl && (
            <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">When</div>
                <div className="text-sm font-semibold mt-0.5">{tmpl.trigger_label}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{tmpl.trigger_description}</p>
              </div>
              <TriggerParamFields
                trigger={tmpl.trigger}
                params={triggerParams}
                onChange={setTriggerParams}
              />
            </div>
          )}

          {/* Action */}
          {tmpl && (
            <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Then</div>
                <Select value={action} onValueChange={switchAction}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tmpl.suggested_actions.map((a) => (
                      <SelectItem key={a.action} value={a.action}>{a.action_label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ActionParamFields
                action={action}
                params={actionParams}
                onChange={setActionParams}
              />
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  Use <code className="bg-secondary px-1 rounded text-[10px]">{`{{token}}`}</code> placeholders
                  in messages — they'll be filled in with context like <code className="bg-secondary px-1 rounded text-[10px]">{`{{creator_name}}`}</code>, <code className="bg-secondary px-1 rounded text-[10px]">{`{{days}}`}</code>, etc.
                </span>
              </p>
            </div>
          )}

          {/* Bookkeeping */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cooldown (hours)</Label>
              <Input
                type="number"
                min="1"
                value={cooldownHours}
                onChange={(e) => setCooldownHours(Number(e.target.value) || 24)}
              />
              <p className="text-[10px] text-muted-foreground">
                After firing for an entity, wait this long before re-firing for it.
              </p>
            </div>
            <div className="space-y-1.5 flex items-end pb-1">
              <div className="flex items-center gap-2">
                <Switch checked={enabled} onCheckedChange={setEnabled} id="enabled" />
                <Label htmlFor="enabled" className="text-xs cursor-pointer">
                  {enabled ? "Enabled" : "Disabled"}
                </Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Param fields per trigger / action ──────────────────────────────────

function TriggerParamFields({
  trigger, params, onChange,
}: {
  trigger: string;
  params: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const num = (v: unknown, fb: number) => (typeof v === "number" ? v : fb);
  const set = (key: string, value: unknown) => onChange({ ...params, [key]: value });

  switch (trigger) {
    case "creator_dormant":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">Days without revenue</Label>
          <Input type="number" min="1" value={num(params.days, 14)} onChange={(e) => set("days", Number(e.target.value) || 14)} />
        </div>
      );
    case "subreddit_low_cvr":
      return (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">CVR threshold</Label>
            <Input type="number" step="0.01" min="0" max="1" value={num(params.cvr_threshold, 0.05)} onChange={(e) => set("cvr_threshold", Number(e.target.value) || 0.05)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Min clicks</Label>
            <Input type="number" min="1" value={num(params.min_clicks, 100)} onChange={(e) => set("min_clicks", Number(e.target.value) || 100)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Window (days)</Label>
            <Input type="number" min="1" value={num(params.days, 14)} onChange={(e) => set("days", Number(e.target.value) || 14)} />
          </div>
        </div>
      );
    case "shift_zero_revenue":
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Min shift hours</Label>
            <Input type="number" min="1" step="0.5" value={num(params.min_hours, 4)} onChange={(e) => set("min_hours", Number(e.target.value) || 4)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Look-back (days)</Label>
            <Input type="number" min="1" value={num(params.days, 7)} onChange={(e) => set("days", Number(e.target.value) || 7)} />
          </div>
        </div>
      );
    case "document_expiring":
    case "goal_period_ending":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">Days before {trigger === "document_expiring" ? "expiry" : "period end"}</Label>
          <Input type="number" min="1" value={num(params.days, trigger === "document_expiring" ? 30 : 7)} onChange={(e) => set("days", Number(e.target.value) || 30)} />
        </div>
      );
    case "ads_roas_below":
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">ROAS threshold</Label>
            <Input type="number" step="0.1" min="0" value={num(params.roas, 1.5)} onChange={(e) => set("roas", Number(e.target.value) || 1.5)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Window (days)</Label>
            <Input type="number" min="1" value={num(params.days, 14)} onChange={(e) => set("days", Number(e.target.value) || 14)} />
          </div>
        </div>
      );
    default:
      return null;
  }
}

function ActionParamFields({
  action, params, onChange,
}: {
  action: string;
  params: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const str = (v: unknown, fb: string) => (typeof v === "string" ? v : fb);
  const num = (v: unknown, fb: number) => (typeof v === "number" ? v : fb);
  const set = (key: string, value: unknown) => onChange({ ...params, [key]: value });

  switch (action) {
    case "audit_entry":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">Audit message</Label>
          <Input value={str(params.message, "")} onChange={(e) => set("message", e.target.value)} />
        </div>
      );
    case "coaching_note":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Note body</Label>
            <Textarea value={str(params.message, "")} onChange={(e) => set("message", e.target.value)} rows={2} />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={!!params.visible_to_staff}
              onCheckedChange={(v) => set("visible_to_staff", v)}
              id="visible"
            />
            <Label htmlFor="visible" className="text-xs cursor-pointer">
              Visible to the chatter (default: private to managers)
            </Label>
          </div>
        </div>
      );
    case "lead_task":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Task description</Label>
            <Input value={str(params.message, "")} onChange={(e) => set("message", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Due in (days)</Label>
            <Input type="number" min="0" value={num(params.due_days, 1)} onChange={(e) => set("due_days", Number(e.target.value) || 1)} />
          </div>
        </div>
      );
    case "pin_announcement":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Announcement body</Label>
            <Textarea value={str(params.message, "")} onChange={(e) => set("message", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Audience</Label>
            <Select value={str(params.scope, "all")} onValueChange={(v) => set("scope", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_SCOPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Auto-expires 24h after firing so the feed doesn't fill up.</p>
          </div>
        </div>
      );
    default:
      return null;
  }
}
