import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  Plus, Pencil, Trash2, ExternalLink, Maximize2, Info,
} from "lucide-react";
import { logAudit } from "@/lib/audit";
import { SiReddit, SiAirtable } from "react-icons/si";

// Airtable's brand-ish accent; close enough to read as Airtable without
// jarring against the warm cream/coral palette.
const AIRTABLE_YELLOW = "#FCB400";

export const Route = createFileRoute("/reddit-airtable")({
  head: () => ({ meta: [{ title: "Reddit · Airtable — Agency Console" }] }),
  component: RedditAirtablePage,
});

const SCOPE = "reddit";

type Embed = {
  id: string;
  scope: string;
  label: string;
  url: string;
  description: string | null;
  display_order: number;
};

type FormState = { label: string; url: string; description: string };
const emptyForm: FormState = { label: "", url: "", description: "" };

/**
 * Best-effort: Airtable accepts share URLs (`https://airtable.com/app.../shr...`)
 * and embed URLs (`https://airtable.com/embed/app.../shr...`). We auto-promote
 * a regular share URL to the embed form so the iframe doesn't 401.
 */
function toEmbedUrl(raw: string): string {
  const u = raw.trim();
  if (!u) return u;
  if (u.includes("airtable.com/embed/")) return u;
  // Match ".../{appId}/shr..." or ".../{appId}/...?..."
  const m = u.match(/airtable\.com\/(app[a-zA-Z0-9]+\/.+)$/);
  if (m) return `https://airtable.com/embed/${m[1]}`;
  return u;
}

function isAirtableUrl(raw: string): boolean {
  return /https?:\/\/(www\.)?airtable\.com\//.test(raw.trim());
}

/**
 * Returns a human-friendly warning if the URL is an Airtable URL but won't
 * embed correctly. Returns null if the URL looks fine.
 */
function airtableUrlWarning(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  if (!isAirtableUrl(u)) return null;
  // Interface Designer page (`pag...`) — not embeddable, requires login
  if (/\/pag[a-zA-Z0-9]+/.test(u)) {
    return "That's an Airtable Interface page — those can't be embedded (they require a logged-in workspace member). Use a view's Share view → Create a shareable link instead. The URL should contain `shr...`.";
  }
  // Record link (`rec...`) — not a share link
  if (/\/rec[a-zA-Z0-9]+/.test(u) && !/\/shr[a-zA-Z0-9]+/.test(u)) {
    return "That looks like a single-record URL, not a share link. Open the view, click Share view → Create a shareable link, and use that URL instead.";
  }
  // Doesn't contain a `shr...` segment — almost certainly a private workspace URL
  if (!/\/shr[a-zA-Z0-9]+/.test(u) && !u.includes("airtable.com/embed/")) {
    return "This Airtable URL doesn't include a share token (the `shr...` segment). Use Share view → Create a shareable link to generate one — embedded private URLs will show a login screen.";
  }
  return null;
}

function RedditAirtablePage() {
  const [embeds, setEmbeds] = useState<Embed[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("airtable_embeds")
      .select("*")
      .eq("scope", SCOPE)
      .order("display_order")
      .order("created_at");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const list = (data ?? []) as Embed[];
    setEmbeds(list);
    if (list.length > 0 && !list.find((e) => e.id === activeTabId)) {
      setActiveTabId(list[0].id);
    }
  };

  useEffect(() => { load(); }, []);

  const onAdd = async () => {
    if (!form.label.trim()) return toast.error("Give this view a name");
    if (!form.url.trim()) return toast.error("Paste an Airtable URL");
    if (!isAirtableUrl(form.url)) return toast.error("That doesn't look like an Airtable URL");
    const warn = airtableUrlWarning(form.url);
    if (warn) return toast.error(warn);
    setSaving(true);
    const finalUrl = toEmbedUrl(form.url);
    const { error } = await supabase.from("airtable_embeds").insert({
      scope: SCOPE,
      label: form.label.trim(),
      url: finalUrl,
      description: form.description.trim() || null,
      display_order: embeds.length,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "airtable_embed_added",
      entity_type: "airtable_embed",
      entity_name: `Reddit · ${form.label}`,
    });
    toast.success("Airtable view added");
    setAddOpen(false);
    setForm(emptyForm);
    await load();
  };

  const startEdit = (e: Embed) => {
    setEditingId(e.id);
    setForm({ label: e.label, url: e.url, description: e.description ?? "" });
  };

  const onSaveEdit = async () => {
    if (!editingId) return;
    if (!form.label.trim()) return toast.error("Give this view a name");
    if (!form.url.trim()) return toast.error("Paste an Airtable URL");
    if (!isAirtableUrl(form.url)) return toast.error("That doesn't look like an Airtable URL");
    const warn = airtableUrlWarning(form.url);
    if (warn) return toast.error(warn);
    setSaving(true);
    const finalUrl = toEmbedUrl(form.url);
    const { error } = await supabase
      .from("airtable_embeds")
      .update({
        label: form.label.trim(),
        url: finalUrl,
        description: form.description.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingId);
    setSaving(false);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "airtable_embed_updated",
      entity_type: "airtable_embed",
      entity_id: editingId,
      entity_name: `Reddit · ${form.label}`,
    });
    toast.success("Updated");
    setEditingId(null);
    setForm(emptyForm);
    await load();
  };

  const onDelete = async (e: Embed) => {
    const { error } = await supabase.from("airtable_embeds").delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "airtable_embed_deleted",
      entity_type: "airtable_embed",
      entity_id: e.id,
      entity_name: `Reddit · ${e.label}`,
    });
    toast.success("Removed");
    await load();
  };

  const activeEmbed = useMemo(
    () => embeds.find((e) => e.id === activeTabId) ?? embeds[0],
    [embeds, activeTabId]
  );

  return (
    <div className="space-y-6">
      <Toaster />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <SiReddit className="h-6 w-6 text-[#FF4500]" />
            <span className="text-muted-foreground/40 text-xl">·</span>
            <SiAirtable className="h-6 w-6" style={{ color: AIRTABLE_YELLOW }} />
            <h1 className="text-3xl font-bold tracking-tight">Reddit · Airtable</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Embed Airtable views you use to plan, schedule, or track Reddit work.
            They render inline with full edit access if your Airtable share permissions allow it.
          </p>
        </div>
        <Dialog
          open={addOpen}
          onOpenChange={(v) => { setAddOpen(v); if (!v) { setForm(emptyForm); } }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1.5" /> Add Airtable view
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Airtable view</DialogTitle>
            </DialogHeader>
            <EmbedForm form={form} setForm={setForm} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={onAdd} disabled={saving}>
                {saving ? "Adding…" : "Add view"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Body */}
      {loading ? (
        <div className="h-64 animate-pulse rounded-xl bg-card/60 border border-border" />
      ) : embeds.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : (
        <Tabs value={activeEmbed?.id} onValueChange={setActiveTabId}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="flex-wrap h-auto gap-1 bg-card/50">
              {embeds.map((e) => (
                <TabsTrigger key={e.id} value={e.id} className="flex items-center gap-1.5">
                  <SiAirtable className="h-3.5 w-3.5" style={{ color: AIRTABLE_YELLOW }} />
                  {e.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {activeEmbed && (
              <div className="flex items-center gap-1">
                <a
                  href={activeEmbed.url.replace("/embed/", "/")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
                  title="Open in Airtable"
                >
                  <ExternalLink className="h-3 w-3" /> Open
                </a>
                <a
                  href={activeEmbed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
                  title="Open embed in new tab (full screen)"
                >
                  <Maximize2 className="h-3 w-3" /> Full screen
                </a>
                <button
                  onClick={() => startEdit(activeEmbed)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
                  title="Edit this view"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded transition-colors"
                      title="Remove this view"
                    >
                      <Trash2 className="h-3 w-3" /> Remove
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove "{activeEmbed.label}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This only unlinks the view from this dashboard. The Airtable base itself is untouched.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(activeEmbed)}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>

          {embeds.map((e) => (
            <TabsContent key={e.id} value={e.id} className="mt-4">
              {e.description && (
                <p className="text-xs text-muted-foreground mb-3">{e.description}</p>
              )}
              <div className="rounded-xl border border-border overflow-hidden bg-card">
                <iframe
                  src={e.url}
                  className="w-full"
                  style={{ height: "calc(100vh - 280px)", minHeight: 500, background: "transparent" }}
                  title={e.label}
                  loading="lazy"
                  // Airtable's embed iframe needs scripts + same-origin to function.
                  // No allowlist tightening here — the user has explicitly added this URL.
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Edit dialog (separate so it can be reopened from the action bar) */}
      <Dialog
        open={!!editingId}
        onOpenChange={(v) => { if (!v) { setEditingId(null); setForm(emptyForm); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Airtable view</DialogTitle>
          </DialogHeader>
          <EmbedForm form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Cancel</Button>
            <Button onClick={onSaveEdit} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmbedForm({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (s: FormState) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          autoFocus
          value={form.label}
          placeholder="e.g. Reddit Content Calendar"
          onChange={(e) => setForm({ ...form, label: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Airtable URL</Label>
        <Input
          value={form.url}
          placeholder="https://airtable.com/app.../shr..."
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          className="font-mono text-xs"
        />
        {(() => {
          const warn = airtableUrlWarning(form.url);
          if (warn) {
            return (
              <p className="text-[11px] text-destructive flex items-start gap-1.5 mt-1.5">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{warn}</span>
              </p>
            );
          }
          return (
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 mt-1.5">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                In Airtable, click <strong>Share view</strong> → <strong>Create a shareable link</strong>.
                The URL must contain <code className="font-mono bg-secondary px-1 rounded">shr…</code> — Interface pages (<code className="font-mono bg-secondary px-1 rounded">pag…</code>) can't be embedded.
              </span>
            </p>
          );
        })()}
      </div>
      <div className="space-y-1.5">
        <Label>Description <span className="text-[11px] text-muted-foreground">(optional)</span></Label>
        <Textarea
          value={form.description}
          rows={2}
          placeholder="What's this view for?"
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
      <div
        className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center mb-4"
        style={{
          backgroundImage: `linear-gradient(135deg, ${AIRTABLE_YELLOW}33, ${AIRTABLE_YELLOW}0d)`,
        }}
      >
        <SiAirtable className="h-7 w-7" style={{ color: AIRTABLE_YELLOW }} />
      </div>
      <h2 className="text-lg font-semibold">No Airtable views yet</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
        Add an Airtable view here to keep your Reddit-related lists, schedules, or trackers right next to the rest of the dashboard.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Airtable view
        </Button>
        <Link
          to="/reddit"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded transition-colors"
        >
          <SiReddit className="h-3.5 w-3.5" /> Back to Reddit page
        </Link>
      </div>
      <p className="text-[11px] text-muted-foreground/70 mt-6">
        Tip: in Airtable, click any view → <strong>Share view</strong> → toggle <em>Create a shareable link</em> → paste it here.
      </p>
    </div>
  );
}
