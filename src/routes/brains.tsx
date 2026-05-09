import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  BookOpen, Brain as BrainIcon, Plus, Trash2, FileText,
  Sparkles, Upload, Search, Zap, MessageSquare, DollarSign,
  TrendingUp, Database, FileStack, Cpu, X, FileUp, ClipboardPaste,
  CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  listBrains, listDocuments, addDocument, deleteDocument,
  countChunks, searchBrain, type Brain, type BrainDocument,
} from "@/lib/brains";
import {
  extractText, isSupportedFile, SUPPORTED_EXTENSIONS,
} from "@/lib/file-extract";

export const Route = createFileRoute("/brains")({ component: BrainsPage });

// ── Per-brain visual identity ─────────────────────────────────────────────
// Each brain gets its own color tone + icon so the user can tell them apart
// at a glance. Falls back to violet for any brain we don't have a preset for.
type BrainTone = {
  hex: string;
  gradient: string;       // gradient-to-br …
  chip: string;           // bg-…/15 text-…
  ring: string;           // border-…/40
  glow: string;           // shadow-…/30
  softBg: string;         // bg-…/5 (panels)
  icon: React.ReactNode;
};
const BRAIN_TONES: Record<string, BrainTone> = {
  chatting: {
    hex: "#ec4899",
    gradient: "from-pink-500 to-rose-500",
    chip: "bg-pink-500/15 text-pink-500",
    ring: "border-pink-500",
    glow: "shadow-pink-500/30",
    softBg: "bg-pink-500/5",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  revenue: {
    hex: "#10b981",
    gradient: "from-emerald-500 to-teal-500",
    chip: "bg-emerald-500/15 text-emerald-500",
    ring: "border-emerald-500",
    glow: "shadow-emerald-500/30",
    softBg: "bg-emerald-500/5",
    icon: <DollarSign className="h-5 w-5" />,
  },
  growth: {
    hex: "#f59e0b",
    gradient: "from-amber-500 to-orange-500",
    chip: "bg-amber-500/15 text-amber-500",
    ring: "border-amber-500",
    glow: "shadow-amber-500/30",
    softBg: "bg-amber-500/5",
    icon: <TrendingUp className="h-5 w-5" />,
  },
};
const FALLBACK_TONE: BrainTone = {
  hex: "#8b5cf6",
  gradient: "from-violet-500 to-fuchsia-500",
  chip: "bg-violet-500/15 text-violet-500",
  ring: "border-violet-500",
  glow: "shadow-violet-500/30",
  softBg: "bg-violet-500/5",
  icon: <BookOpen className="h-5 w-5" />,
};
const toneFor = (slug: string): BrainTone => BRAIN_TONES[slug] ?? FALLBACK_TONE;

// ── Page ──────────────────────────────────────────────────────────────────

function BrainsPage() {
  const [brains, setBrains] = useState<Brain[]>([]);
  const [activeBrainId, setActiveBrainId] = useState<string | null>(null);
  const [docs, setDocs] = useState<BrainDocument[]>([]);
  const [chunkCount, setChunkCount] = useState(0);
  const [perBrainCounts, setPerBrainCounts] = useState<Record<string, { docs: number; chunks: number }>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  // Upload modes: "files" = drop/pick files, "paste" = paste raw text.
  // Each mode has its own state so switching tabs doesn't clobber input.
  const [uploadMode, setUploadMode] = useState<"files" | "paste">("files");
  // Per-file queue. Items move through pending → extracting → embedding → done/error.
  type QueuedFile = {
    id: string;
    file: File;
    status: "pending" | "extracting" | "embedding" | "done" | "error";
    error?: string;
    chars?: number;
  };
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Paste mode state
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docUrl, setDocUrl] = useState("");

  const [pendingDelete, setPendingDelete] = useState<BrainDocument | null>(null);

  // Test-search panel — preview what Bernard would actually retrieve
  const [testQuery, setTestQuery] = useState("");
  const [testResults, setTestResults] = useState<Array<{ content: string; similarity?: number }>>([]);
  const [testing, setTesting] = useState(false);

  const activeBrain = useMemo(
    () => brains.find((b) => b.id === activeBrainId) ?? null,
    [brains, activeBrainId],
  );
  const activeTone = useMemo(
    () => (activeBrain ? toneFor(activeBrain.slug) : FALLBACK_TONE),
    [activeBrain],
  );

  const totalDocs = useMemo(
    () => Object.values(perBrainCounts).reduce((s, v) => s + v.docs, 0),
    [perBrainCounts],
  );
  const totalChunks = useMemo(
    () => Object.values(perBrainCounts).reduce((s, v) => s + v.chunks, 0),
    [perBrainCounts],
  );

  // Initial load: fetch brains, then per-brain doc/chunk counts in parallel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listBrains();
        if (cancelled) return;
        setBrains(list);
        if (list.length > 0 && !activeBrainId) setActiveBrainId(list[0].id);

        // Pull all per-brain counts up-front so the picker cards can show
        // the doc count without waiting for the user to click each one.
        const counts: Record<string, { docs: number; chunks: number }> = {};
        await Promise.all(
          list.map(async (b) => {
            const [d, c] = await Promise.all([listDocuments(b.id), countChunks(b.id)]);
            counts[b.id] = { docs: d.length, chunks: c };
          }),
        );
        if (!cancelled) setPerBrainCounts(counts);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load brains");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-load docs whenever the active brain changes
  useEffect(() => {
    if (!activeBrainId) return;
    let cancelled = false;
    (async () => {
      try {
        const [d, c] = await Promise.all([
          listDocuments(activeBrainId),
          countChunks(activeBrainId),
        ]);
        if (cancelled) return;
        setDocs(d);
        setChunkCount(c);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load documents");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBrainId]);

  const refresh = async () => {
    if (!activeBrainId) return;
    const [d, c] = await Promise.all([
      listDocuments(activeBrainId),
      countChunks(activeBrainId),
    ]);
    setDocs(d);
    setChunkCount(c);
    setPerBrainCounts((prev) => ({ ...prev, [activeBrainId]: { docs: d.length, chunks: c } }));
    // Re-run test search with fresh data so results reflect the new doc
    if (testQuery.trim()) await onTestSearch(testQuery);
  };

  // ── Paste-mode submit ──
  const onUploadPaste = async () => {
    if (!activeBrainId) return;
    if (!docContent.trim()) {
      toast.error("Paste some content first");
      return;
    }
    setUploading(true);
    try {
      await addDocument(
        activeBrainId,
        docTitle.trim() || "Untitled",
        docContent,
        docUrl.trim() || null,
      );
      toast.success("Document added & embedded");
      setUploadOpen(false);
      setDocTitle("");
      setDocContent("");
      setDocUrl("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // ── File-mode helpers ──
  const addFilesToQueue = (files: File[]) => {
    const accepted: QueuedFile[] = [];
    const rejected: string[] = [];
    for (const f of files) {
      if (!isSupportedFile(f)) {
        rejected.push(f.name);
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file: f,
        status: "pending",
      });
    }
    if (rejected.length > 0) {
      toast.error(
        `Skipped ${rejected.length} unsupported file${rejected.length === 1 ? "" : "s"}. Use ${SUPPORTED_EXTENSIONS.join(", ")}.`,
      );
    }
    if (accepted.length > 0) setQueue((prev) => [...prev, ...accepted]);
  };

  const removeFromQueue = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  // Process the whole queue: extract → addDocument (which embeds + saves).
  // Each file is processed serially so we can show per-file progress and so
  // we don't blast OpenAI's embeddings endpoint with 20 concurrent requests.
  const onUploadFiles = async () => {
    if (!activeBrainId) return;
    const todo = queue.filter((q) => q.status === "pending" || q.status === "error");
    if (todo.length === 0) {
      toast.info("Nothing to upload");
      return;
    }
    setUploading(true);
    let succeeded = 0;
    for (const item of todo) {
      // Extract
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: "extracting", error: undefined } : q)),
      );
      let text = "";
      try {
        const res = await extractText(item.file);
        text = res.text;
        if (!text.trim()) throw new Error("No readable text in this file");
      } catch (err) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "error", error: err instanceof Error ? err.message : "Extract failed" }
              : q,
          ),
        );
        continue;
      }
      // Embed + save
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: "embedding", chars: text.length } : q,
        ),
      );
      try {
        await addDocument(activeBrainId, item.file.name.replace(/\.[^.]+$/, ""), text, null);
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "done" } : q)),
        );
        succeeded++;
      } catch (err) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: "error", error: err instanceof Error ? err.message : "Upload failed" }
              : q,
          ),
        );
      }
    }
    setUploading(false);
    if (succeeded > 0) {
      toast.success(`Embedded ${succeeded} document${succeeded === 1 ? "" : "s"}`);
      await refresh();
    }
  };

  // Drag-and-drop handlers — wired on the dropzone div in the dialog.
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only un-set when leaving the dropzone itself (relatedTarget outside)
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) addFilesToQueue(files);
  };

  // Reset upload state when the dialog closes so reopening is fresh.
  const closeUploadDialog = (open: boolean) => {
    setUploadOpen(open);
    if (!open) {
      setQueue([]);
      setDocTitle("");
      setDocContent("");
      setDocUrl("");
    }
  };

  const onDelete = async (doc: BrainDocument) => {
    try {
      await deleteDocument(doc.id);
      toast.success("Document removed");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPendingDelete(null);
    }
  };

  const onTestSearch = async (qOverride?: string) => {
    const q = (qOverride ?? testQuery).trim();
    if (!activeBrain || !q) return;
    setTesting(true);
    try {
      const results = await searchBrain(activeBrain.slug, q, { topK: 5 });
      setTestResults(
        results.map((r) => ({ content: r.content, similarity: r.similarity })),
      );
      if (results.length === 0) toast.info("No matches yet — upload more docs");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-6">
      <Toaster richColors closeButton position="bottom-right" />

      {/* ── Brand hero ─────────────────────────────────────────────
          Gradient panel that shifts with the active brain. Inline
          stats so the user sees the total knowledge surface at a glance. */}
      <div
        className={`relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card/80 to-transparent p-6 transition-colors`}
        style={{ backgroundImage: `linear-gradient(135deg, var(--card) 0%, color-mix(in srgb, ${activeTone.hex} 12%, var(--card)) 100%)` }}
      >
        <div aria-hidden className="absolute -top-20 -right-20 h-64 w-64 rounded-full blur-3xl pointer-events-none" style={{ backgroundColor: `${activeTone.hex}22` }} />
        <div aria-hidden className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />

        <div className="relative flex items-start gap-4 flex-wrap">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${activeTone.gradient} text-white shadow-lg ${activeTone.glow}`}>
            <BrainIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <Sparkles className="h-3.5 w-3.5" style={{ color: activeTone.hex }} />
              Bernard's memory
            </div>
            <div className="mt-1.5 flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Brains</h1>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-sm">
                <span className="font-semibold text-foreground tabular-nums">{brains.length}</span>
                <span className="text-muted-foreground"> domains </span>
                <span className="text-muted-foreground/50">·</span>
                <span className="font-semibold text-foreground tabular-nums"> {totalDocs}</span>
                <span className="text-muted-foreground"> docs </span>
                <span className="text-muted-foreground/50">·</span>
                <span className="font-semibold text-foreground tabular-nums"> {totalChunks}</span>
                <span className="text-muted-foreground"> chunks indexed</span>
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
              Drop in playbooks, scripts, SOPs. When you ask Bernard about a domain,
              he automatically pulls the relevant pieces and cites them in his answers.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading brains…</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          {/* ── Brain picker — each brain a colored card with its own identity ── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Knowledge domains
              </span>
            </div>
            {brains.map((b) => {
              const t = toneFor(b.slug);
              const counts = perBrainCounts[b.id] ?? { docs: 0, chunks: 0 };
              const active = activeBrainId === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setActiveBrainId(b.id)}
                  style={{
                    // Subtle on rest, brand-tinted glow on hover. We attach
                    // both transitions so scale + shadow animate together.
                    "--hover-glow": `0 0 0 1px ${t.hex}55, 0 8px 24px -8px ${t.hex}66`,
                  } as React.CSSProperties}
                  className={`group relative w-full overflow-hidden rounded-xl border p-3.5 text-left transition-all duration-200 ease-out hover:scale-[1.02] hover:-translate-y-0.5 hover:[box-shadow:var(--hover-glow)] ${
                    active
                      ? `${t.ring} ${t.softBg} shadow-sm scale-[1.01]`
                      : "border-border bg-card hover:bg-secondary/40"
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-1 rounded-l-xl"
                      style={{ backgroundColor: t.hex }}
                    />
                  )}
                  <div className="flex items-start gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${t.gradient} text-white shadow-sm`}>
                      {t.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold leading-tight">{b.name}</div>
                      {b.description && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                          {b.description}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono tabular-nums">{counts.docs}</span>
                        <span>doc{counts.docs === 1 ? "" : "s"}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="font-mono tabular-nums">{counts.chunks}</span>
                        <span>chunks</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Active brain detail ───────────────────────────────── */}
          {activeBrain && (
            <div className="space-y-5">
              {/* KPI tiles — gradient icon chips, colored to match the brand */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <ModernStat
                  icon={<FileStack className="h-3.5 w-3.5" />}
                  toneHex={activeTone.hex}
                  label="Documents"
                  value={docs.length.toString()}
                  sub={docs.length === 1 ? "playbook in this brain" : "playbooks in this brain"}
                />
                <ModernStat
                  icon={<Database className="h-3.5 w-3.5" />}
                  toneHex={activeTone.hex}
                  label="Chunks indexed"
                  value={chunkCount.toString()}
                  sub="searchable pieces"
                />
                <ModernStat
                  icon={<Cpu className="h-3.5 w-3.5" />}
                  toneHex={activeTone.hex}
                  label="Embedding model"
                  value="text-3-small"
                  sub="OpenAI · 1536 dims"
                />
              </div>

              {/* Action card: prominent CTA to add a doc */}
              <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
                <div
                  aria-hidden
                  className="absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl pointer-events-none"
                  style={{ backgroundColor: `${activeTone.hex}1a` }}
                />
                <div className="relative flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                      Active brain
                    </div>
                    <div className="mt-1 text-lg font-bold">{activeBrain.name}</div>
                    {activeBrain.description && (
                      <p className="text-xs text-muted-foreground">{activeBrain.description}</p>
                    )}
                  </div>
                  <Dialog open={uploadOpen} onOpenChange={closeUploadDialog}>
                    <DialogTrigger asChild>
                      <Button
                        className={`bg-gradient-to-br ${activeTone.gradient} text-white border-0 ${activeTone.glow} shadow-lg transition-all duration-200 ease-out hover:scale-105 hover:shadow-xl hover:brightness-110 active:scale-95`}
                      >
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add document
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${activeTone.gradient} text-white`}>
                            {activeTone.icon}
                          </span>
                          Add to {activeBrain.name}
                        </DialogTitle>
                      </DialogHeader>

                      {/* Mode toggle: Files vs Paste — like Claude Projects */}
                      <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
                        <button
                          onClick={() => setUploadMode("files")}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                            uploadMode === "files"
                              ? "bg-background shadow-sm text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <FileUp className="h-3.5 w-3.5" />
                          Upload files
                        </button>
                        <button
                          onClick={() => setUploadMode("paste")}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                            uploadMode === "paste"
                              ? "bg-background shadow-sm text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <ClipboardPaste className="h-3.5 w-3.5" />
                          Paste text
                        </button>
                      </div>

                      {/* ── Files mode ── */}
                      {uploadMode === "files" && (
                        <div className="space-y-3">
                          <div
                            onDragEnter={onDragEnter}
                            onDragLeave={onDragLeave}
                            onDragOver={onDragOver}
                            onDrop={onDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={isDragging ? { borderColor: activeTone.hex, backgroundColor: `${activeTone.hex}10` } : undefined}
                            className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
                              isDragging
                                ? "scale-[1.01]"
                                : "border-border bg-secondary/20 hover:border-border/80 hover:bg-secondary/40"
                            }`}
                          >
                            <input
                              ref={fileInputRef}
                              type="file"
                              multiple
                              accept={SUPPORTED_EXTENSIONS.join(",")}
                              className="hidden"
                              onChange={(e) => {
                                const files = Array.from(e.target.files ?? []);
                                if (files.length > 0) addFilesToQueue(files);
                                e.target.value = ""; // reset so re-picking same file fires onChange
                              }}
                            />
                            <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${activeTone.gradient} text-white shadow-lg ${activeTone.glow} transition-transform ${isDragging ? "scale-110" : ""}`}>
                              <FileUp className="h-6 w-6" />
                            </div>
                            <div className="font-semibold">
                              {isDragging ? "Drop to upload" : "Drag & drop files here"}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              or <span className="underline">click to browse</span>
                            </p>
                            <p className="mt-2 text-[10px] text-muted-foreground/80 font-mono">
                              {SUPPORTED_EXTENSIONS.join(" · ")}
                            </p>
                          </div>

                          {/* Queue */}
                          {queue.length > 0 && (
                            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                              {queue.map((q) => (
                                <div
                                  key={q.id}
                                  className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5"
                                >
                                  <span
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                                    style={{
                                      backgroundColor:
                                        q.status === "done"
                                          ? "rgb(16 185 129 / 0.15)"
                                          : q.status === "error"
                                            ? "rgb(239 68 68 / 0.15)"
                                            : `${activeTone.hex}26`,
                                      color:
                                        q.status === "done"
                                          ? "rgb(16 185 129)"
                                          : q.status === "error"
                                            ? "rgb(239 68 68)"
                                            : activeTone.hex,
                                    }}
                                  >
                                    {q.status === "extracting" || q.status === "embedding" ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : q.status === "done" ? (
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    ) : q.status === "error" ? (
                                      <AlertCircle className="h-3.5 w-3.5" />
                                    ) : (
                                      <FileText className="h-3.5 w-3.5" />
                                    )}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-medium truncate">{q.file.name}</div>
                                    <div className="text-[10px] text-muted-foreground">
                                      {(q.file.size / 1024).toFixed(1)} KB
                                      {q.chars ? ` · ${q.chars.toLocaleString()} chars` : ""}
                                      {q.status === "extracting" && " · reading…"}
                                      {q.status === "embedding" && " · embedding…"}
                                      {q.status === "done" && " · embedded"}
                                      {q.status === "error" && q.error ? ` · ${q.error}` : ""}
                                    </div>
                                  </div>
                                  {q.status !== "extracting" && q.status !== "embedding" && (
                                    <button
                                      onClick={() => removeFromQueue(q.id)}
                                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                                      aria-label="Remove"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Paste mode ── */}
                      {uploadMode === "paste" && (
                        <div className="space-y-3">
                          <div>
                            <Label>Title</Label>
                            <Input
                              value={docTitle}
                              onChange={(e) => setDocTitle(e.target.value)}
                              placeholder="e.g. PPV cadence playbook"
                            />
                          </div>
                          <div>
                            <Label>Source URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <Input
                              value={docUrl}
                              onChange={(e) => setDocUrl(e.target.value)}
                              placeholder="https://notion.so/..."
                            />
                          </div>
                          <div>
                            <Label>Content</Label>
                            <Textarea
                              value={docContent}
                              onChange={(e) => setDocContent(e.target.value)}
                              placeholder="Paste the full doc here. Markdown is fine."
                              rows={12}
                              className="font-mono text-xs"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              Will be split into ~500-token chunks and embedded via OpenAI.
                              Cost is ~$0.00004 per chunk.
                            </p>
                          </div>
                        </div>
                      )}

                      <DialogFooter>
                        <Button variant="outline" onClick={() => closeUploadDialog(false)} disabled={uploading}>
                          Cancel
                        </Button>
                        {uploadMode === "files" ? (
                          <Button
                            onClick={onUploadFiles}
                            disabled={uploading || queue.filter((q) => q.status === "pending" || q.status === "error").length === 0}
                            className={`bg-gradient-to-br ${activeTone.gradient} text-white border-0 shadow-lg ${activeTone.glow} transition-all duration-200 ease-out hover:scale-105 hover:shadow-xl hover:brightness-110 active:scale-95 disabled:opacity-70 disabled:hover:scale-100`}
                          >
                            {uploading ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                Embedding…
                              </>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-1.5" />
                                Embed {queue.filter((q) => q.status === "pending" || q.status === "error").length || ""} file{queue.filter((q) => q.status === "pending" || q.status === "error").length === 1 ? "" : "s"}
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button
                            onClick={onUploadPaste}
                            disabled={uploading}
                            className={`bg-gradient-to-br ${activeTone.gradient} text-white border-0 shadow-lg ${activeTone.glow} transition-all duration-200 ease-out hover:scale-105 hover:shadow-xl hover:brightness-110 active:scale-95 disabled:opacity-70 disabled:hover:scale-100`}
                          >
                            {uploading ? "Embedding…" : (
                              <>
                                <Upload className="h-4 w-4 mr-1.5" />
                                Save & embed
                              </>
                            )}
                          </Button>
                        )}
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* Test search — feels like a search bar, not a form */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${activeTone.chip}`}>
                    <Search className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold leading-tight">Test what Bernard would retrieve</div>
                    <div className="text-[11px] text-muted-foreground">
                      Type a question — see the top chunks that would get injected into his system prompt.
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
                  <Input
                    value={testQuery}
                    onChange={(e) => setTestQuery(e.target.value)}
                    placeholder="Ask a question this brain should know about…"
                    onKeyDown={(e) => e.key === "Enter" && onTestSearch()}
                    className="pl-9 pr-24 h-11"
                  />
                  <Button
                    onClick={() => onTestSearch()}
                    disabled={testing || !testQuery.trim()}
                    size="sm"
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 h-8 bg-gradient-to-br ${activeTone.gradient} text-white border-0 shadow-md transition-all duration-200 ease-out hover:scale-105 hover:shadow-lg hover:brightness-110 active:scale-95 disabled:opacity-60 disabled:hover:scale-100`}
                  >
                    <Zap className="h-3.5 w-3.5 mr-1" />
                    {testing ? "Searching…" : "Test"}
                  </Button>
                </div>
                {testResults.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {testResults.map((r, i) => (
                      <div key={i} className={`rounded-xl border border-border ${activeTone.softBg} p-3.5 text-xs`}>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className={`flex h-5 min-w-5 px-1.5 items-center justify-center rounded ${activeTone.chip} font-mono font-semibold text-[10px]`}>
                            {i + 1}
                          </span>
                          {typeof r.similarity === "number" && (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.max(5, Math.min(100, r.similarity * 100))}%`,
                                    backgroundColor: activeTone.hex,
                                  }}
                                />
                              </div>
                              <span className="font-mono tabular-nums text-muted-foreground">
                                {(r.similarity * 100).toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="whitespace-pre-wrap text-foreground/90 line-clamp-6 leading-relaxed">
                          {r.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Documents list */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/60 text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                    </span>
                    <div className="text-sm font-semibold">Documents</div>
                    <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {docs.length}
                    </span>
                  </div>
                </div>
                {docs.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-8 text-center">
                    <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${activeTone.gradient} text-white shadow-lg ${activeTone.glow} opacity-90`}>
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <div className="font-semibold">No documents yet</div>
                    <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
                      Drop in your first {activeBrain.name.toLowerCase()} playbook to start training Bernard on this domain.
                    </p>
                    <Button
                      onClick={() => setUploadOpen(true)}
                      size="sm"
                      className={`mt-4 bg-gradient-to-br ${activeTone.gradient} text-white border-0 shadow-lg ${activeTone.glow} transition-all duration-200 ease-out hover:scale-105 hover:shadow-xl hover:brightness-110 active:scale-95`}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add first document
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {docs.map((d) => (
                      <div
                        key={d.id}
                        style={{ "--row-glow": `0 6px 20px -10px ${activeTone.hex}40` } as React.CSSProperties}
                        className="group flex items-start gap-3 rounded-xl border border-border bg-background/50 p-3.5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-border/80 hover:bg-secondary/30 hover:[box-shadow:var(--row-glow)]"
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${activeTone.chip}`}>
                          <FileText className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-medium truncate">{d.title}</div>
                            {d.source_url && (
                              <a
                                href={d.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                              >
                                source ↗
                              </a>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            Added {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                          </div>
                          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {d.content.slice(0, 280)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(d)}
                          className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.title}" and all its embedded chunks will be removed.
              Bernard will no longer be able to recall it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && onDelete(pendingDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── ModernStat tile ────────────────────────────────────────────────────────
// Brand-tinted icon chip (uses the active brain's hex), bold value, sub.
// Matches the look of TikTok / Instagram / Facebook page tiles.
function ModernStat({
  icon, label, value, sub, toneHex,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  toneHex: string;
}) {
  return (
    <div
      style={{ "--tile-glow": `0 8px 28px -10px ${toneHex}55` } as React.CSSProperties}
      className="group rounded-xl border border-border bg-card p-4 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-border/80 hover:[box-shadow:var(--tile-glow)]"
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="h-7 w-7 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
          style={{ backgroundColor: `${toneHex}26`, color: toneHex }}
        >
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>
    </div>
  );
}
