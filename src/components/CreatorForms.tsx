import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ClipboardList, ExternalLink, CheckCircle2, Clock, Send,
  XCircle, AlertTriangle, Pencil, Settings as SettingsIcon, Info, FileText,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { logAudit } from "@/lib/audit";
import { Link } from "@tanstack/react-router";

const PROVIDERS = [
  { value: "google_form", label: "Google Form",  icon: "📋" },
  { value: "typeform",    label: "Typeform",     icon: "🟢" },
  { value: "docusign",    label: "DocuSign",     icon: "✍️" },
  { value: "jotform",     label: "Jotform",      icon: "🟧" },
  { value: "tally",       label: "Tally",        icon: "🟣" },
  { value: "other",       label: "Other",        icon: "📄" },
];

const STATUS_META: Record<string, { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending:   { label: "Not sent",  tone: "text-muted-foreground bg-secondary",                  icon: Clock },
  sent:      { label: "Sent",      tone: "text-primary bg-primary/10 border-primary/20",       icon: Send },
  submitted: { label: "Submitted", tone: "text-success bg-success/10 border-success/20",       icon: CheckCircle2 },
  declined:  { label: "Declined",  tone: "text-destructive bg-destructive/10 border-destructive/20", icon: XCircle },
  expired:   { label: "Expired",   tone: "text-warning bg-warning/10 border-warning/20",       icon: AlertTriangle },
};

type Template = {
  id: string;
  label: string;
  description: string | null;
  provider: string;
  master_url: string | null;
  category: string | null;
  required_for_active: boolean;
  archive_as_document: boolean;
  document_category: string | null;
  display_order: number;
};

type Submission = {
  id: string;
  template_id: string;
  creator_id: string;
  status: string;
  share_url: string | null;
  submission_url: string | null;
  notes: string | null;
  sent_at: string | null;
  submitted_at: string | null;
  marked_by: string | null;
};

const getActor = (): string | null => {
  const raw = localStorage.getItem("agency_session");
  if (!raw) return null;
  try { return (JSON.parse(raw) as { username?: string })?.username ?? null; }
  catch { return raw; }
};

// ════════════════════════════════════════════════════════════════════════════
// Per-creator forms view
// ════════════════════════════════════════════════════════════════════════════

export function CreatorForms({ creatorId, creatorName }: { creatorId: string; creatorName?: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSubmission, setEditingSubmission] = useState<{ template: Template; submission: Submission | null } | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: tpl }, { data: sub }] = await Promise.all([
      supabase
        .from("creator_form_templates")
        .select("*")
        .order("display_order")
        .order("label"),
      supabase
        .from("creator_form_submissions")
        .select("*")
        .eq("creator_id", creatorId),
    ]);
    setTemplates((tpl ?? []) as Template[]);
    setSubmissions((sub ?? []) as Submission[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [creatorId]);

  const subByTemplate = useMemo(() => {
    const m = new Map<string, Submission>();
    for (const s of submissions) m.set(s.template_id, s);
    return m;
  }, [submissions]);

  const stats = useMemo(() => {
    const total = templates.length;
    const submitted = templates.filter((t) => subByTemplate.get(t.id)?.status === "submitted").length;
    const requiredOutstanding = templates
      .filter((t) => t.required_for_active)
      .filter((t) => {
        const s = subByTemplate.get(t.id);
        return !s || s.status !== "submitted";
      }).length;
    return { total, submitted, requiredOutstanding };
  }, [templates, subByTemplate]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading forms…</div>;

  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
        <ClipboardList className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
        <div className="text-sm font-medium">No form templates set up yet</div>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          Form templates live at the agency level (e.g. "2024 W-9", "DMCA Authorization"). Create them once,
          track each creator's submission status here.
        </p>
        <Link
          to="/settings"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-3"
        >
          <SettingsIcon className="h-3 w-3" /> Manage form templates in Settings
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + stats */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Forms & agreements
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stats.submitted} of {stats.total} submitted{stats.requiredOutstanding > 0 ? ` · ${stats.requiredOutstanding} required outstanding` : ""}.
          </p>
        </div>
        <Link
          to="/settings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <SettingsIcon className="h-3 w-3" /> Manage templates
        </Link>
      </div>

      {/* Required-outstanding banner */}
      {stats.requiredOutstanding > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-medium text-warning">{stats.requiredOutstanding} required form{stats.requiredOutstanding === 1 ? "" : "s"} outstanding</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {creatorName ?? "This creator"} can't be considered fully onboarded until these are submitted.
            </p>
          </div>
        </div>
      )}

      {/* Templates × this creator */}
      <div className="space-y-1.5">
        {templates.map((t) => {
          const s = subByTemplate.get(t.id);
          const status = s?.status ?? "pending";
          const meta = STATUS_META[status];
          const Icon = meta.icon;
          const provider = PROVIDERS.find((p) => p.value === t.provider);
          return (
            <div key={t.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0 text-base">
                    {provider?.icon ?? "📄"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{t.label}</span>
                      {t.required_for_active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-warning/30 bg-warning/10 text-warning font-medium">
                          required
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${meta.tone}`}>
                        <Icon className="h-2.5 w-2.5" />
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 space-x-2">
                      <span>{provider?.label ?? t.provider}</span>
                      {t.category && <><span>·</span><span>{t.category}</span></>}
                    </div>
                    {t.description && <p className="text-xs text-muted-foreground mt-2">{t.description}</p>}
                    {(s?.submitted_at || s?.sent_at) && (
                      <div className="text-[10px] text-muted-foreground mt-2 space-x-2">
                        {s.sent_at && <span>Sent {format(parseISO(s.sent_at), "MMM d, yyyy")}</span>}
                        {s.submitted_at && (
                          <>
                            {s.sent_at && <span>·</span>}
                            <span>Submitted {format(parseISO(s.submitted_at), "MMM d, yyyy")}{s.marked_by ? ` by ${s.marked_by}` : ""}</span>
                          </>
                        )}
                      </div>
                    )}
                    {s?.notes && <div className="text-[11px] text-muted-foreground mt-1.5 italic">"{s.notes}"</div>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {t.master_url && (
                    <a
                      href={s?.share_url || t.master_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      Open form <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {s?.submission_url && (
                    <a
                      href={s.submission_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-success hover:underline"
                    >
                      View response <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingSubmission({ template: t, submission: s ?? null })}
                  >
                    <Pencil className="h-3 w-3 mr-1" /> Update
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <SubmissionEditor
        creatorId={creatorId}
        creatorName={creatorName}
        open={!!editingSubmission}
        template={editingSubmission?.template ?? null}
        submission={editingSubmission?.submission ?? null}
        onClose={() => setEditingSubmission(null)}
        onSaved={() => { setEditingSubmission(null); void load(); }}
      />
    </div>
  );
}

// ── Submission editor ───────────────────────────────────────────────────

function SubmissionEditor({
  creatorId, creatorName, open, template, submission, onClose, onSaved,
}: {
  creatorId: string;
  creatorName?: string;
  open: boolean;
  template: Template | null;
  submission: Submission | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState("pending");
  const [shareUrl, setShareUrl] = useState("");
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [submittedAt, setSubmittedAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatus(submission?.status ?? "pending");
    setShareUrl(submission?.share_url ?? "");
    setSubmissionUrl(submission?.submission_url ?? "");
    setNotes(submission?.notes ?? "");
    setSubmittedAt(submission?.submitted_at ? submission.submitted_at.slice(0, 10) : "");
  }, [open, submission]);

  const onSave = async () => {
    if (!template) return;
    setSaving(true);
    const actor = getActor();
    const now = new Date().toISOString();

    const wasSubmitted = submission?.status === "submitted";
    const willBeSubmitted = status === "submitted";

    const payload: Record<string, unknown> = {
      status,
      share_url: shareUrl.trim() || null,
      submission_url: submissionUrl.trim() || null,
      notes: notes.trim() || null,
      updated_at: now,
    };

    // Only set sent_at the first time we move to 'sent'
    if (status === "sent" && !submission?.sent_at) {
      payload.sent_at = now;
    }
    // Submission timestamp
    if (willBeSubmitted) {
      payload.submitted_at = submittedAt ? new Date(submittedAt + "T12:00:00Z").toISOString() : (submission?.submitted_at ?? now);
      payload.marked_by = actor;
    } else if (!willBeSubmitted && submission?.submitted_at) {
      // Reverted — clear the submitted timestamps
      payload.submitted_at = null;
      payload.marked_by = null;
    }

    let error;
    if (submission) {
      ({ error } = await supabase.from("creator_form_submissions").update(payload).eq("id", submission.id));
    } else {
      ({ error } = await supabase.from("creator_form_submissions").insert({
        ...payload,
        template_id: template.id,
        creator_id: creatorId,
      }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);

    void logAudit({
      action: willBeSubmitted && !wasSubmitted ? "form_submitted" : "form_status_updated",
      entity_type: "creator_form_submission",
      entity_id: submission?.id,
      entity_name: `${creatorName ?? "Creator"} · ${template.label}`,
      details: `${submission?.status ?? "pending"} → ${status}`,
    });

    // Optionally archive a record into creator_documents when newly submitted
    if (willBeSubmitted && !wasSubmitted && template.archive_as_document && submissionUrl.trim()) {
      // Create a synthetic document row pointing at the submission URL.
      // file_path uses the URL itself — we don't store the file in our bucket
      // since the response lives in the form provider's system. Note: download
      // / preview won't work via signed URL for these external rows, but the
      // metadata is on file.
      await supabase.from("creator_documents").insert({
        creator_id: creatorId,
        label: `${template.label} (signed)`,
        category: template.document_category || "agreement",
        file_path: submissionUrl.trim(),  // external URL, not a storage path
        mime_type: "application/external-link",
        notes: `Auto-archived from form submission. Provider: ${template.provider}.`,
        uploaded_by: actor,
      }).catch(() => undefined);
    }

    toast.success("Saved");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            {template?.label}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_META).map(([k, m]) => (
                  <SelectItem key={k} value={k}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {status === "submitted" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Submitted on</Label>
              <Input type="date" value={submittedAt} onChange={(e) => setSubmittedAt(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Share link <span className="text-muted-foreground">(optional, per-creator pre-filled URL if you generate them)</span></Label>
            <Input value={shareUrl} onChange={(e) => setShareUrl(e.target.value)} placeholder="https://typeform.com/to/abc?creator=maylee" className="font-mono text-xs" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Response URL <span className="text-muted-foreground">(this creator's specific submission)</span></Label>
            <Input value={submissionUrl} onChange={(e) => setSubmissionUrl(e.target.value)} placeholder="https://docusign.net/Member/EmailStart..." className="font-mono text-xs" />
            {template?.archive_as_document && status === "submitted" && submissionUrl && (
              <p className="text-[11px] text-success flex items-start gap-1">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                <span>Will auto-create a "{template.label} (signed)" entry in Documents.</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any context (e.g. 'sent via DocuSign envelope #1234')" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Admin: form-templates manager (lives in Settings)
// ════════════════════════════════════════════════════════════════════════════

const DOC_CATEGORIES = [
  { value: "contract",   label: "Contract" },
  { value: "id",         label: "Government ID" },
  { value: "dmca",       label: "DMCA / takedown auth" },
  { value: "w9_1099",    label: "W-9 / 1099 / tax form" },
  { value: "nda",        label: "NDA" },
  { value: "agreement",  label: "Other agreement" },
  { value: "brand_kit",  label: "Brand kit / guidelines" },
  { value: "other",      label: "Other" },
];

const FORM_CATEGORIES = ["onboarding", "tax", "legal", "brand", "compliance", "other"];

const emptyTemplateForm = {
  label: "",
  description: "",
  provider: "google_form",
  master_url: "",
  category: "onboarding",
  required_for_active: false,
  archive_as_document: false,
  document_category: "agreement",
};

export function FormTemplatesManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [creatorCount, setCreatorCount] = useState(0);
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<Template | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyTemplateForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: tpl }, { count: cnt }, { data: subs }] = await Promise.all([
      supabase.from("creator_form_templates").select("*").order("display_order").order("label"),
      supabase.from("creators").select("id", { count: "exact", head: true }),
      supabase.from("creator_form_submissions").select("template_id, status").eq("status", "submitted"),
    ]);
    setTemplates((tpl ?? []) as Template[]);
    setCreatorCount(cnt ?? 0);
    const counts: Record<string, number> = {};
    for (const s of (subs ?? []) as { template_id: string }[]) {
      counts[s.template_id] = (counts[s.template_id] ?? 0) + 1;
    }
    setSubmissionCounts(counts);
  };

  useEffect(() => { void load(); }, []);

  const reset = () => { setForm(emptyTemplateForm); setEditing(null); setAdding(false); };

  const startEdit = (t: Template) => {
    setEditing(t);
    setAdding(true);
    setForm({
      label: t.label,
      description: t.description ?? "",
      provider: t.provider,
      master_url: t.master_url ?? "",
      category: t.category ?? "onboarding",
      required_for_active: t.required_for_active,
      archive_as_document: t.archive_as_document,
      document_category: t.document_category ?? "agreement",
    });
  };

  const onSave = async () => {
    if (!form.label.trim()) return toast.error("Label required");
    setSaving(true);
    const payload = {
      label: form.label.trim(),
      description: form.description.trim() || null,
      provider: form.provider,
      master_url: form.master_url.trim() || null,
      category: form.category || null,
      required_for_active: form.required_for_active,
      archive_as_document: form.archive_as_document,
      document_category: form.archive_as_document ? form.document_category : null,
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      const { error } = await supabase.from("creator_form_templates").update(payload).eq("id", editing.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      void logAudit({ action: "form_template_updated", entity_type: "creator_form_template", entity_id: editing.id, entity_name: payload.label });
      toast.success("Updated");
    } else {
      const { error } = await supabase.from("creator_form_templates").insert({ ...payload, created_by: getActor() });
      setSaving(false);
      if (error) return toast.error(error.message);
      void logAudit({ action: "form_template_added", entity_type: "creator_form_template", entity_name: payload.label });
      toast.success("Added");
    }
    reset();
    void load();
  };

  const onDelete = async (t: Template) => {
    if (!confirm(`Delete "${t.label}"? All ${submissionCounts[t.id] ?? 0} submission rows will also be removed.`)) return;
    const { error } = await supabase.from("creator_form_templates").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    void logAudit({ action: "form_template_deleted", entity_type: "creator_form_template", entity_id: t.id, entity_name: t.label });
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Templates apply to all creators. Track each creator's submission status on their detail page.
          </p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => { reset(); setAdding(true); }}>
            <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> Add template
          </Button>
        )}
      </div>

      {adding && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-semibold">{editing ? "Edit template" : "New template"}</div>
          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. 2024 W-9 Tax Form" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Internal note about what this is, who it's for, etc." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Provider</Label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => <SelectItem key={p.value} value={p.value}>{p.icon} {p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category (optional)</Label>
              <Select value={form.category || "onboarding"} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORM_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Master URL <span className="text-muted-foreground">(the form's share link)</span></Label>
            <Input value={form.master_url} onChange={(e) => setForm({ ...form, master_url: e.target.value })} placeholder="https://forms.gle/..." className="font-mono text-xs" />
          </div>
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.required_for_active}
                onChange={(e) => setForm({ ...form, required_for_active: e.target.checked })}
                className="mt-0.5"
              />
              <div>
                <div className="text-xs font-medium">Required for active creators</div>
                <div className="text-[11px] text-muted-foreground">Outstanding required forms surface a warning on the creator's detail page.</div>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.archive_as_document}
                onChange={(e) => setForm({ ...form, archive_as_document: e.target.checked })}
                className="mt-0.5"
              />
              <div>
                <div className="text-xs font-medium">Auto-archive submissions to Documents</div>
                <div className="text-[11px] text-muted-foreground">When a creator's response URL is set, mirror it as a row in their Documents tab. Useful for signed agreements.</div>
              </div>
            </label>
            {form.archive_as_document && (
              <div className="ml-6 space-y-1.5 pt-1">
                <Label className="text-xs">Archive as category</Label>
                <Select value={form.document_category} onValueChange={(v) => setForm({ ...form, document_category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add template"}</Button>
            <Button variant="ghost" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}

      {/* List */}
      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
          No templates yet — add the first one above.
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => {
            const provider = PROVIDERS.find((p) => p.value === t.provider);
            const submitted = submissionCounts[t.id] ?? 0;
            const completionPct = creatorCount > 0 ? Math.round((submitted / creatorCount) * 100) : 0;
            return (
              <div key={t.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0 text-base">
                      {provider?.icon ?? "📄"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                        {t.label}
                        {t.required_for_active && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-warning/30 bg-warning/10 text-warning font-medium">required</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 space-x-2">
                        <span>{provider?.label ?? t.provider}</span>
                        {t.category && <><span>·</span><span>{t.category}</span></>}
                        <span>·</span>
                        <span>{submitted} / {creatorCount} submitted ({completionPct}%)</span>
                        {t.archive_as_document && (
                          <>
                            <span>·</span>
                            <span className="text-success inline-flex items-center gap-1">
                              <FileText className="h-2.5 w-2.5" /> auto-archives
                            </span>
                          </>
                        )}
                      </div>
                      {t.description && <p className="text-[11px] text-muted-foreground mt-1.5">{t.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {t.master_url && (
                      <a href={t.master_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary p-1.5" title="Open form">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button onClick={() => startEdit(t)} className="text-muted-foreground hover:text-primary p-1.5"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => onDelete(t)} className="text-muted-foreground hover:text-destructive p-1.5">
                      <span className="text-base leading-none">×</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
