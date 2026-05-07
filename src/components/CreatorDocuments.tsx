import { useEffect, useMemo, useRef, useState } from "react";
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
  Upload, FileText, Image as ImageIcon, FileArchive, FileSpreadsheet,
  Trash2, Pencil, Download, AlertTriangle, Calendar, Plus, Eye, History,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { logAudit } from "@/lib/audit";

const BUCKET = "creator-documents";
const MAX_BYTES = 50 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour

type Document = {
  id: string;
  creator_id: string;
  label: string;
  category: string;
  file_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  notes: string | null;
  expires_at: string | null;
  supersedes_id: string | null;
  uploaded_by: string | null;
  created_at: string;
};

const CATEGORIES = [
  { value: "contract",   label: "Contract" },
  { value: "id",         label: "Government ID" },
  { value: "dmca",       label: "DMCA / takedown auth" },
  { value: "w9_1099",    label: "W-9 / 1099 / tax form" },
  { value: "nda",        label: "NDA" },
  { value: "agreement",  label: "Other agreement" },
  { value: "brand_kit",  label: "Brand kit / guidelines" },
  { value: "other",      label: "Other" },
] as const;

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const getActor = (): string | null => {
  const raw = localStorage.getItem("agency_session");
  if (!raw) return null;
  try { return (JSON.parse(raw) as { username?: string })?.username ?? null; }
  catch { return raw; }
};

function fileIcon(mime: string | null) {
  if (!mime) return FileText;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.includes("zip") || mime.includes("compressed")) return FileArchive;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv")) return FileSpreadsheet;
  return FileText;
}

function formatBytes(b: number | null): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function expiryStatus(expiresAt: string | null): { tone: "ok" | "soon" | "expired" | "none"; label: string } {
  if (!expiresAt) return { tone: "none", label: "No expiry" };
  const days = differenceInDays(parseISO(expiresAt), new Date());
  if (days < 0) return { tone: "expired", label: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago` };
  if (days <= 30) return { tone: "soon", label: `Expires in ${days} day${days === 1 ? "" : "s"}` };
  return { tone: "ok", label: `Expires ${format(parseISO(expiresAt), "MMM d, yyyy")}` };
}

const TONE_COLOR: Record<"ok" | "soon" | "expired" | "none", string> = {
  ok:      "text-success",
  soon:    "text-warning",
  expired: "text-destructive",
  none:    "text-muted-foreground",
};

// ────────────────────────────────────────────────────────────────────────────

export function CreatorDocuments({ creatorId, creatorName }: { creatorId: string; creatorName?: string }) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("creator_documents")
      .select("*")
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setDocs((data ?? []) as Document[]);
  };

  useEffect(() => { void load(); }, [creatorId]);

  // The "active" docs hide superseded ones — older versions are accessible via History button
  const activeDocs = useMemo(() => {
    const supersededIds = new Set(docs.map((d) => d.supersedes_id).filter(Boolean) as string[]);
    return docs.filter((d) => !supersededIds.has(d.id));
  }, [docs]);

  const visible = filter === "all" ? activeDocs : activeDocs.filter((d) => d.category === filter);

  // Group by category
  const grouped = useMemo(() => {
    const out = new Map<string, Document[]>();
    for (const d of visible) {
      if (!out.has(d.category)) out.set(d.category, []);
      out.get(d.category)!.push(d);
    }
    return out;
  }, [visible]);

  // Counts for top-of-page status banner
  const expiringSoon = activeDocs.filter((d) => {
    if (!d.expires_at) return false;
    const days = differenceInDays(parseISO(d.expires_at), new Date());
    return days >= 0 && days <= 30;
  }).length;
  const expired = activeDocs.filter((d) => {
    if (!d.expires_at) return false;
    return differenceInDays(parseISO(d.expires_at), new Date()) < 0;
  }).length;

  const onDelete = async (d: Document) => {
    if (!confirm(`Delete "${d.label}"? The file is permanently removed from storage.`)) return;
    // Best-effort: remove the actual file too
    await supabase.storage.from(BUCKET).remove([d.file_path]).catch(() => undefined);
    const { error } = await supabase.from("creator_documents").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "document_deleted",
      entity_type: "creator_document",
      entity_id: d.id,
      entity_name: `${creatorName ?? "Creator"} · ${d.label}`,
    });
    toast.success("Removed");
    void load();
  };

  const onDownload = async (d: Document) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(d.file_path, SIGNED_URL_TTL_SECONDS, { download: true });
    if (error || !data?.signedUrl) {
      return toast.error(error?.message ?? "Could not generate download link");
    }
    window.open(data.signedUrl, "_blank");
  };

  const onPreview = async (d: Document) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(d.file_path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      return toast.error(error?.message ?? "Could not generate link");
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Documents
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Contracts, IDs, DMCA forms, tax docs, brand kits — anything that needs to be on file.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Upload
          </Button>
        </div>
      </div>

      {/* Expiry banner */}
      {(expiringSoon > 0 || expired > 0) && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            {expired > 0 && <span className="font-medium text-destructive">{expired} document{expired === 1 ? "" : "s"} expired</span>}
            {expired > 0 && expiringSoon > 0 && <span className="text-muted-foreground"> · </span>}
            {expiringSoon > 0 && <span className="font-medium text-warning">{expiringSoon} expiring within 30 days</span>}
            <p className="text-xs text-muted-foreground mt-1">
              Renew or replace to keep records current. Click the document to upload a new version.
            </p>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
          <div className="text-sm font-medium">No documents on file yet</div>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Upload contracts, ID, DMCA authorization, tax forms — anything you'd want to have when this creator's audited or onboarded onto a new platform.
          </p>
          <Button size="sm" onClick={() => setUploadOpen(true)} className="mt-4">
            <Upload className="h-4 w-4 mr-1.5" /> Upload first document
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {[...grouped.entries()].map(([cat, list]) => (
            <div key={cat} className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80 px-1">
                {CATEGORY_LABEL[cat] ?? cat} · {list.length}
              </div>
              {list.map((d) => {
                const Icon = fileIcon(d.mime_type);
                const exp = expiryStatus(d.expires_at);
                const olderVersions = docs.filter((x) => x.supersedes_id === d.id);
                return (
                  <div key={d.id} className="group rounded-xl border border-border bg-card p-3 hover:bg-secondary/20 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{d.label}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 space-x-2">
                          <span>{formatBytes(d.file_size_bytes)}</span>
                          <span>·</span>
                          <span>uploaded {format(parseISO(d.created_at), "MMM d, yyyy")}</span>
                          {d.uploaded_by && <><span>·</span><span>by {d.uploaded_by}</span></>}
                        </div>
                        <div className={`text-[11px] mt-1 inline-flex items-center gap-1 ${TONE_COLOR[exp.tone]}`}>
                          <Calendar className="h-3 w-3" />
                          {exp.label}
                        </div>
                        {d.notes && <div className="text-xs text-muted-foreground mt-1.5 italic">"{d.notes}"</div>}
                        {olderVersions.length > 0 && (
                          <button
                            onClick={() => setShowHistory(showHistory === d.id ? null : d.id)}
                            className="text-[10px] text-primary hover:underline mt-1.5 inline-flex items-center gap-1"
                          >
                            <History className="h-2.5 w-2.5" />
                            {olderVersions.length} previous version{olderVersions.length === 1 ? "" : "s"}
                          </button>
                        )}
                        {showHistory === d.id && olderVersions.length > 0 && (
                          <div className="mt-2 ml-1 pl-3 border-l-2 border-border space-y-1">
                            {olderVersions.map((old) => (
                              <div key={old.id} className="text-[11px] text-muted-foreground">
                                <button onClick={() => onDownload(old)} className="hover:text-foreground">
                                  {old.label}
                                </button>
                                <span className="ml-2 text-muted-foreground/70">
                                  · {format(parseISO(old.created_at), "MMM d, yyyy")}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => onPreview(d)} className="text-muted-foreground hover:text-primary p-1.5" title="Open in new tab"><Eye className="h-3.5 w-3.5" /></button>
                        <button onClick={() => onDownload(d)} className="text-muted-foreground hover:text-primary p-1.5" title="Download"><Download className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditing(d)} className="text-muted-foreground hover:text-primary p-1.5" title="Edit metadata"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => onDelete(d)} className="text-muted-foreground hover:text-destructive p-1.5" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        creatorId={creatorId}
        creatorName={creatorName}
        existingDocs={activeDocs}
        onUploaded={load}
      />

      {/* Edit dialog */}
      <EditDialog
        doc={editing}
        onClose={() => setEditing(null)}
        creatorName={creatorName}
        onSaved={load}
      />
    </div>
  );
}

// ── Upload dialog ──────────────────────────────────────────────────────────

function UploadDialog({
  open, onOpenChange, creatorId, creatorName, existingDocs, onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  creatorId: string;
  creatorName?: string;
  existingDocs: Document[];
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("contract");
  const [expires, setExpires] = useState("");
  const [notes, setNotes] = useState("");
  const [supersedes, setSupersedes] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null); setLabel(""); setCategory("contract");
    setExpires(""); setNotes(""); setSupersedes("");
  };

  const onPickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_BYTES) { toast.error("File must be 50 MB or smaller"); return; }
    setFile(f);
    if (!label) {
      // Strip the extension from the filename for a default label
      setLabel(f.name.replace(/\.[^.]+$/, ""));
    }
  };

  const onUpload = async () => {
    if (!file) return toast.error("Pick a file first");
    if (!label.trim()) return toast.error("Label required");
    setUploading(true);
    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
    const path = `${creatorId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (upErr) {
      setUploading(false);
      const msg = upErr.message;
      if (msg.toLowerCase().includes("not found")) {
        return toast.error("Storage bucket missing — run the creator_documents migration in Supabase");
      }
      return toast.error(msg);
    }
    const { error: insErr } = await supabase.from("creator_documents").insert({
      creator_id: creatorId,
      label: label.trim(),
      category,
      file_path: path,
      file_size_bytes: file.size,
      mime_type: file.type || null,
      notes: notes.trim() || null,
      expires_at: expires || null,
      supersedes_id: supersedes || null,
      uploaded_by: getActor(),
    });
    setUploading(false);
    if (insErr) {
      // Best-effort: remove the orphaned file if metadata insert failed
      await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
      return toast.error(insErr.message);
    }
    void logAudit({
      action: "document_uploaded",
      entity_type: "creator_document",
      entity_name: `${creatorName ?? "Creator"} · ${label.trim()}`,
      details: supersedes ? "(supersedes previous version)" : null,
    });
    toast.success("Uploaded");
    reset();
    onOpenChange(false);
    onUploaded();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {/* File picker */}
          <div
            className={`rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
              file ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-secondary/30"
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) onPickFile(f);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,image/*"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="space-y-0.5">
                <div className="text-sm font-medium truncate">{file.name}</div>
                <div className="text-[11px] text-muted-foreground">{formatBytes(file.size)} · click to change</div>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="h-6 w-6 text-muted-foreground/60 mx-auto" />
                <div className="text-sm font-medium">Drop a file here or click to choose</div>
                <div className="text-[11px] text-muted-foreground">PDF, DOC, XLS, image — max 50 MB</div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Management agreement v3" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expires (optional)</Label>
              <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </div>
          </div>

          {existingDocs.filter((d) => d.category === category).length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Replaces (optional)</Label>
              <Select value={supersedes || "__none"} onValueChange={(v) => setSupersedes(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="(new — not a replacement)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">(new — not a replacement)</SelectItem>
                  {existingDocs.filter((d) => d.category === category).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Older version stays accessible under "previous versions" but is hidden from the main list.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="What this is, who signed, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onUpload} disabled={uploading || !file}>
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit metadata dialog ───────────────────────────────────────────────────

function EditDialog({
  doc, onClose, creatorName, onSaved,
}: {
  doc: Document | null;
  onClose: () => void;
  creatorName?: string;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("other");
  const [expires, setExpires] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (doc) {
      setLabel(doc.label);
      setCategory(doc.category);
      setExpires(doc.expires_at ?? "");
      setNotes(doc.notes ?? "");
    }
  }, [doc]);

  const onSave = async () => {
    if (!doc) return;
    if (!label.trim()) return toast.error("Label required");
    setSaving(true);
    const { error } = await supabase
      .from("creator_documents")
      .update({
        label: label.trim(),
        category,
        expires_at: expires || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "document_updated",
      entity_type: "creator_document",
      entity_id: doc.id,
      entity_name: `${creatorName ?? "Creator"} · ${label.trim()}`,
    });
    toast.success("Saved");
    onClose();
    onSaved();
  };

  return (
    <Dialog open={!!doc} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expires</Label>
              <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
