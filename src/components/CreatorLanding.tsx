import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Trash2, ChevronUp, ChevronDown, Copy, Check, ExternalLink,
  Globe, Eye, BarChart3, Image as ImageIcon, Link as LinkIcon, Upload,
  Info, BadgeCheck, Images, ArrowLeft, MousePointerClick,
  Pencil,
} from "lucide-react";
import { detectPlatform } from "@/lib/landing-platforms";
import { subDays } from "date-fns";
import { logAudit } from "@/lib/audit";
import { LandingAnalytics } from "@/components/LandingAnalytics";

const LANDING_BUCKET = "landing-assets";

type LandingLink = { label: string; url: string };
type LandingMedia = { url: string; caption?: string };
type Landing = {
  id: string;
  creator_id: string;
  slug: string;
  custom_domain: string | null;
  is_published: boolean;
  is_verified: boolean;
  display_name: string | null;
  tagline: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  theme: string;
  accent_color: string | null;
  font: string;
  links: LandingLink[];
  media: LandingMedia[];
  seo_title: string | null;
  seo_description: string | null;
  created_at?: string;
  updated_at?: string;
};

const THEMES = [
  { value: "cream",    label: "Cream + coral", preview: "linear-gradient(135deg, #fcf9ee, #e87852)" },
  { value: "dark",     label: "Dark mono",     preview: "linear-gradient(135deg, #0e0a08, #2a1a13)" },
  { value: "rose",     label: "Soft rose",     preview: "linear-gradient(135deg, #fff1f2, #f43f5e)" },
  { value: "gradient", label: "Vibrant gradient", preview: "linear-gradient(135deg, #6366f1, #ec4899, #f59e0b)" },
  { value: "minimal",  label: "Minimal white", preview: "linear-gradient(135deg, #fafafa, #1a1a1a)" },
] as const;

const FONTS = [
  { value: "poppins", label: "Poppins (sans-serif)" },
  { value: "serif",   label: "Cormorant (serif)" },
  { value: "mono",    label: "IBM Plex (mono)" },
];

const slugify = (s: string): string =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);

const isValidSlug = (s: string): boolean => /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(s);

// ─── Top-level: list of pages → drill into editor ─────────────────────────
//
// A creator can now own multiple landing pages (e.g. "main" linktree, "Q4
// promo", "X-list audience"). This wrapper handles the navigation: renders
// a card grid with stats per page, and drills into LandingPageEditor when
// a card is opened.

type PageWithStats = Landing & { _views30d: number; _clicks30d: number };

type View =
  | { kind: "list" }
  | { kind: "edit"; pageId: string }
  | { kind: "analytics"; pageId: string };

export function CreatorLanding({ creatorId, creatorName }: { creatorId: string; creatorName?: string }) {
  const [pages, setPages] = useState<PageWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });

  const loadPages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("creator_landing_pages")
      .select("*")
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    const rows = (data ?? []) as unknown as Landing[];

    // Pull aggregated stats per page in two batched queries (one for views,
    // one for clicks). 30-day window. RLS is public so this is fine.
    const sinceISO = subDays(new Date(), 30).toISOString();
    const ids = rows.map((r) => r.id);
    let viewCounts = new Map<string, number>();
    let clickCounts = new Map<string, number>();
    if (ids.length > 0) {
      const [{ data: views }, { data: clicks }] = await Promise.all([
        supabase.from("landing_views").select("landing_id").in("landing_id", ids).gte("occurred_at", sinceISO),
        supabase.from("landing_clicks").select("landing_id").in("landing_id", ids).gte("occurred_at", sinceISO),
      ]);
      for (const v of (views ?? []) as { landing_id: string }[]) {
        viewCounts.set(v.landing_id, (viewCounts.get(v.landing_id) ?? 0) + 1);
      }
      for (const c of (clicks ?? []) as { landing_id: string }[]) {
        clickCounts.set(c.landing_id, (clickCounts.get(c.landing_id) ?? 0) + 1);
      }
    }

    const enriched: PageWithStats[] = rows.map((r) => ({
      ...r,
      links: Array.isArray(r.links) ? r.links : [],
      media: Array.isArray(r.media) ? r.media : [],
      is_verified: typeof r.is_verified === "boolean" ? r.is_verified : false,
      _views30d: viewCounts.get(r.id) ?? 0,
      _clicks30d: clickCounts.get(r.id) ?? 0,
    }));
    setPages(enriched);
    setLoading(false);
  };

  useEffect(() => { void loadPages(); }, [creatorId]);

  const onCreatePage = async () => {
    if (creating) return;
    const baseSlug = slugify(creatorName ?? "creator");
    if (!isValidSlug(baseSlug)) return toast.error("Couldn't derive a slug from the creator's name. Edit the creator's name first.");
    setCreating(true);
    let attempt = 0;
    let slug = baseSlug;
    // First page → exact slug. Subsequent pages → suffix automatically since
    // the slug column is globally UNIQUE.
    if (pages.length > 0) slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    while (attempt < 6) {
      const { data, error } = await supabase
        .from("creator_landing_pages")
        .insert({
          creator_id: creatorId,
          slug,
          display_name: creatorName ?? null,
          is_published: false,
          links: [],
          theme: "cream",
          font: "poppins",
        })
        .select("id")
        .single();
      if (!error && data) {
        void logAudit({
          action: "landing_created",
          entity_type: "creator_landing_page",
          entity_name: `${creatorName ?? "Creator"} · ${slug}`,
        });
        toast.success("Landing page created");
        setCreating(false);
        await loadPages();
        // Drill straight into the new page so the admin can polish it
        setView({ kind: "edit", pageId: data.id as string });
        return;
      }
      if (error && (error.message.includes("unique") || error.code === "23505")) {
        attempt++;
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      } else {
        setCreating(false);
        return toast.error(error?.message ?? "Failed to create page");
      }
    }
    setCreating(false);
    toast.error("Couldn't allocate a unique slug — try again.");
  };

  const onDeletePage = async (page: PageWithStats) => {
    const ok = confirm(`Delete the "${page.slug}" landing page? This is permanent and removes all view/click history for it.`);
    if (!ok) return;
    const { error } = await supabase.from("creator_landing_pages").delete().eq("id", page.id);
    if (error) return toast.error(error.message);
    void logAudit({
      action: "landing_deleted",
      entity_type: "creator_landing_page",
      entity_id: page.id,
      entity_name: `${creatorName ?? "Creator"} · ${page.slug}`,
    });
    toast.success("Page deleted");
    await loadPages();
  };

  if (view.kind === "edit") {
    return (
      <LandingPageEditor
        key={view.pageId}
        pageId={view.pageId}
        creatorName={creatorName}
        onBack={() => { setView({ kind: "list" }); void loadPages(); }}
      />
    );
  }
  if (view.kind === "analytics") {
    const page = pages.find((p) => p.id === view.pageId);
    return (
      <LandingAnalytics
        key={view.pageId}
        pageId={view.pageId}
        pageSlug={page?.slug ?? ""}
        pageName={page?.display_name || page?.slug || "Landing page"}
        onBack={() => { setView({ kind: "list" }); void loadPages(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold">Landing pages</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            One creator can run multiple pages — a main linktree, a promo funnel, audience-specific landings.
            Each gets its own slug, analytics, and can be published independently.
          </p>
        </div>
        <Button onClick={onCreatePage} disabled={creating}>
          <Plus className="h-4 w-4 mr-1.5" /> {creating ? "Creating…" : "New page"}
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading pages…</div>
      ) : pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <Globe className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
          <div className="text-sm font-medium">No landing page yet</div>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Create a public bio + links page for {creatorName ?? "this creator"}.
            Like a Linktree, hosted by the agency. Ships unpublished — you polish first, then flip the switch.
          </p>
          <Button onClick={onCreatePage} disabled={creating} className="mt-4">
            <Plus className="h-4 w-4 mr-1.5" /> {creating ? "Creating…" : "Create first page"}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pages.map((p) => (
            <PageCard
              key={p.id}
              page={p}
              onEdit={() => setView({ kind: "edit", pageId: p.id })}
              onAnalytics={() => setView({ kind: "analytics", pageId: p.id })}
              onDelete={() => void onDeletePage(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PageCard({
  page, onEdit, onAnalytics, onDelete,
}: {
  page: PageWithStats;
  onEdit: () => void;
  onAnalytics: () => void;
  onDelete: () => void;
}) {
  const ctr = page._views30d > 0 ? Math.round((page._clicks30d / page._views30d) * 100) : 0;
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${page.slug}` : `/p/${page.slug}`;
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition-all overflow-hidden">
      {/* Cover strip — falls back to a theme gradient if no cover */}
      <div
        className="h-20 w-full relative cursor-pointer"
        onClick={onEdit}
        style={{
          backgroundImage: page.cover_url ? `url(${page.cover_url})` : undefined,
          backgroundColor: page.cover_url ? undefined : "#1a1410",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              page.is_published
                ? "bg-success/90 text-success-foreground"
                : "bg-card/90 text-muted-foreground border border-border"
            }`}
          >
            {page.is_published ? "Live" : "Draft"}
          </span>
        </div>
      </div>
      <div className="p-3 space-y-2">
        {/* Avatar overlap row. The avatar is wrapped so the ring-card
            "halo" is part of the layout box (vs ring-4 which extends
            outside and was eating into the name text). Wider gap-4
            keeps the name well clear of the avatar even on narrow
            cards. */}
        <div className="flex items-end gap-4 cursor-pointer -mt-10" onClick={onEdit}>
          <div className="relative z-10 h-16 w-16 rounded-full bg-card shadow-md p-1 shrink-0">
            {page.avatar_url ? (
              <img
                src={page.avatar_url}
                alt=""
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <div className="h-full w-full rounded-full bg-secondary flex items-center justify-center">
                <Globe className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="text-sm font-semibold truncate flex items-center gap-1">
              {page.display_name || page.slug}
              {page.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[#1d9bf0] fill-current shrink-0" />}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">/p/{page.slug}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <Stat label="Views" value={page._views30d} icon={<Eye className="h-3 w-3" />} />
          <Stat label="Clicks" value={page._clicks30d} icon={<MousePointerClick className="h-3 w-3" />} />
          <Stat label="CTR" value={`${ctr}%`} icon={<BarChart3 className="h-3 w-3" />} />
        </div>

        {/* Primary actions — Edit + Analytics, side by side */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <Button size="sm" variant="outline" onClick={onEdit} className="h-8">
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
          <Button size="sm" variant="outline" onClick={onAnalytics} className="h-8">
            <BarChart3 className="h-3.5 w-3.5 mr-1" /> Analytics
          </Button>
        </div>

        {/* Secondary actions — utilities */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-border">
          <span className="text-[10px] text-muted-foreground mr-auto">Last 30 days</span>
          <button
            onClick={onCopy}
            className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-0.5 px-1.5 py-1 rounded hover:bg-secondary"
            title="Copy public URL"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-0.5 px-1.5 py-1 rounded hover:bg-secondary"
            title="Open public page"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
          <button
            onClick={onDelete}
            className="text-[10px] text-muted-foreground hover:text-destructive inline-flex items-center gap-0.5 px-1.5 py-1 rounded hover:bg-secondary"
            title="Delete page"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md bg-secondary/40 px-2 py-1.5">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

// ─── Editor for a single landing page ─────────────────────────────────────

function LandingPageEditor({
  pageId, creatorName, onBack,
}: {
  pageId: string;
  creatorName?: string;
  onBack: () => void;
}) {
  const [landing, setLanding] = useState<Landing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local form state — synced with landing on save
  const [form, setForm] = useState<Landing | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("creator_landing_pages")
      .select("*")
      .eq("id", pageId)
      .maybeSingle();
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (data) {
      const row = data as unknown as Landing;
      if (!Array.isArray(row.links)) row.links = [];
      if (!Array.isArray(row.media)) row.media = [];
      if (typeof row.is_verified !== "boolean") row.is_verified = false;
      setLanding(row);
      setForm(row);
    } else {
      setLanding(null);
      setForm(null);
    }
  };

  useEffect(() => { void load(); }, [pageId]);

  // ── Save the form ─────────────────────────────────────────────────────

  const onSave = async () => {
    if (!form || !landing) return;

    if (!isValidSlug(form.slug)) {
      return toast.error("Slug must be 3-64 chars, lowercase letters/numbers/hyphens only, no leading or trailing hyphen.");
    }
    for (const l of form.links) {
      if (!l.label.trim() || !l.url.trim()) {
        return toast.error("Every link needs a label and a URL.");
      }
      if (!/^https?:\/\//i.test(l.url) && !l.url.startsWith("mailto:") && !l.url.startsWith("tel:")) {
        return toast.error(`"${l.label}" needs https:// at the start of the URL.`);
      }
    }

    setSaving(true);
    const payload = {
      slug: form.slug.trim(),
      custom_domain: form.custom_domain?.trim() || null,
      is_published: form.is_published,
      is_verified: form.is_verified,
      display_name: form.display_name?.trim() || null,
      tagline: form.tagline?.trim() || null,
      bio: form.bio?.trim() || null,
      avatar_url: form.avatar_url || null,
      cover_url: form.cover_url || null,
      theme: form.theme,
      accent_color: form.accent_color || null,
      font: form.font,
      links: form.links,
      media: form.media,
      seo_title: form.seo_title?.trim() || null,
      seo_description: form.seo_description?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("creator_landing_pages").update(payload).eq("id", landing.id);
    setSaving(false);
    if (error) {
      if (error.message.includes("unique")) {
        return toast.error("That slug or custom domain is already taken.");
      }
      return toast.error(error.message);
    }
    void logAudit({
      action: "landing_updated",
      entity_type: "creator_landing_page",
      entity_id: landing.id,
      entity_name: `${creatorName ?? "Creator"} · ${form.slug}`,
    });
    toast.success("Saved");
    await load();
  };

  // ── Image uploads (avatar / cover / gallery) ──────────────────────────

  const onUploadGalleryImage = async (file: File) => {
    if (!landing || !form) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Image must be 10 MB or smaller");
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file");
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const path = `${landing.id}/gallery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from(LANDING_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (error) {
      const msg = error.message;
      if (msg.toLowerCase().includes("not found")) {
        return toast.error("Storage bucket missing — run the landing migration in Supabase");
      }
      return toast.error(msg);
    }
    const { data } = supabase.storage.from(LANDING_BUCKET).getPublicUrl(path);
    setForm({ ...form, media: [...form.media, { url: data.publicUrl }] });
  };

  const onRemoveGalleryImage = (i: number) => {
    if (!form) return;
    setForm({ ...form, media: form.media.filter((_, idx) => idx !== i) });
  };

  const onMoveGalleryImage = (i: number, direction: "up" | "down") => {
    if (!form) return;
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= form.media.length) return;
    const next = [...form.media];
    [next[i], next[j]] = [next[j], next[i]];
    setForm({ ...form, media: next });
  };

  const onUploadImage = async (file: File, kind: "avatar" | "cover") => {
    if (!landing || !form) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("Image must be 10 MB or smaller");
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file");
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const path = `${landing.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(LANDING_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
    if (error) {
      const msg = error.message;
      if (msg.toLowerCase().includes("not found")) {
        return toast.error("Storage bucket missing — run the landing migration in Supabase");
      }
      return toast.error(msg);
    }
    const { data } = supabase.storage.from(LANDING_BUCKET).getPublicUrl(path);
    setForm({ ...form, [kind === "avatar" ? "avatar_url" : "cover_url"]: data.publicUrl });
    toast.success(`${kind === "avatar" ? "Avatar" : "Cover"} uploaded — click Save to finish.`);
  };

  // ── Link list helpers ─────────────────────────────────────────────────

  const addLink = () => {
    if (!form) return;
    setForm({ ...form, links: [...form.links, { label: "", url: "" }] });
  };
  const updateLink = (i: number, patch: Partial<LandingLink>) => {
    if (!form) return;
    const next = form.links.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    setForm({ ...form, links: next });
  };
  const removeLink = (i: number) => {
    if (!form) return;
    setForm({ ...form, links: form.links.filter((_, idx) => idx !== i) });
  };
  const moveLink = (i: number, direction: "up" | "down") => {
    if (!form) return;
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= form.links.length) return;
    const next = [...form.links];
    [next[i], next[j]] = [next[j], next[i]];
    setForm({ ...form, links: next });
  };

  // ── Public URL helpers ────────────────────────────────────────────────

  const publicUrl = useMemo(() => {
    if (!form) return "";
    if (typeof window === "undefined") return `/p/${form.slug}`;
    return `${window.location.origin}/p/${form.slug}`;
  }, [form]);

  const [copied, setCopied] = useState(false);
  const copyUrl = async () => {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="space-y-3">
      <BackBar onBack={onBack} />
      <div className="text-sm text-muted-foreground">Loading landing page…</div>
    </div>
  );

  if (!landing || !form) {
    return (
      <div className="space-y-3">
        <BackBar onBack={onBack} />
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <div className="text-sm font-medium">Page not found</div>
          <p className="text-xs text-muted-foreground mt-1">It may have been deleted. Head back to the list.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackBar onBack={onBack} />

      {/* Status bar */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${form.is_published ? "bg-success" : "bg-muted-foreground"}`} />
          <div className="min-w-0">
            <div className="text-sm font-semibold flex items-center gap-2">
              {form.is_published ? "Published" : "Draft"}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-normal">
                {form.slug}
              </span>
            </div>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-0.5"
            >
              {publicUrl} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={copyUrl}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
            {copied ? "Copied" : "Copy URL"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // ?preview=1 lets admins see drafts without flipping the published switch.
              // The public landing page checks for a session before allowing it, so the
              // URL itself is safe to share — anonymous visitors still get a 404.
              const previewUrl = form.is_published ? publicUrl : `${publicUrl}?preview=1`;
              window.open(previewUrl, "_blank");
            }}
          >
            <Eye className="h-3.5 w-3.5 mr-1" /> Preview
          </Button>
        </div>
      </div>

      {/* Top: published switch + slug + custom domain */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Publishing</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              When unpublished the public URL shows a 404. Toggle on once you're ready.
            </p>
          </div>
          <Switch
            checked={form.is_published}
            onCheckedChange={(v) => setForm({ ...form, is_published: v })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">URL slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">…/p/</span>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                className="font-mono text-sm"
                placeholder="creator-name"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Lowercase letters, numbers, hyphens. 3–64 chars.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Custom domain (optional)</Label>
            <Input
              value={form.custom_domain ?? ""}
              onChange={(e) => setForm({ ...form, custom_domain: e.target.value.trim().toLowerCase() })}
              placeholder="creatorname.com"
              className="font-mono text-sm"
            />
            <p className="text-[10px] text-muted-foreground flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Add this domain in Vercel → your project → Settings → Domains.
                Point its DNS to Vercel (CNAME or A record). Once it resolves to this app,
                visitors hitting it land on this page.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Identity: name, tagline, bio, avatar, cover */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="text-sm font-semibold">Identity</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Display name</Label>
            <Input
              value={form.display_name ?? ""}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder={creatorName ?? "Display name"}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tagline</Label>
            <Input
              value={form.tagline ?? ""}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              placeholder="One-line subtitle (optional)"
              maxLength={80}
            />
          </div>
        </div>

        {/* Verified mark */}
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/20 p-3">
          <div className="flex items-start gap-2.5">
            <BadgeCheck
              className="h-5 w-5 shrink-0 mt-0.5"
              style={{ color: form.is_verified ? "#1d9bf0" : "#94a3b8", fill: form.is_verified ? "currentColor" : "none" }}
            />
            <div>
              <div className="text-sm font-medium">Verified mark</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Shows a blue checkmark next to the name on the public page. Use this for established creators —
                it signals legitimacy to fans visiting from cold traffic.
              </p>
            </div>
          </div>
          <Switch
            checked={form.is_verified}
            onCheckedChange={(v) => setForm({ ...form, is_verified: v })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Bio</Label>
          <Textarea
            value={form.bio ?? ""}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            rows={3}
            placeholder="A short bio. Plain text — line breaks preserved."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ImageUpload
            label="Avatar"
            currentUrl={form.avatar_url}
            onUpload={(f) => onUploadImage(f, "avatar")}
            onClear={() => setForm({ ...form, avatar_url: null })}
            shape="circle"
          />
          <ImageUpload
            label="Cover photo (optional)"
            currentUrl={form.cover_url}
            onUpload={(f) => onUploadImage(f, "cover")}
            onClear={() => setForm({ ...form, cover_url: null })}
            shape="rectangle"
          />
        </div>
      </section>

      {/* Theme */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="text-sm font-semibold">Theme</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => setForm({ ...form, theme: t.value })}
              className={`group rounded-xl border p-3 text-left transition-all ${
                form.theme === t.value ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/30"
              }`}
            >
              <div
                className="h-14 w-full rounded-lg mb-2"
                style={{ background: t.preview }}
              />
              <div className="text-xs font-medium">{t.label}</div>
            </button>
          ))}
        </div>
        <div className="space-y-1.5 max-w-xs">
          <Label className="text-xs">Font</Label>
          <Select value={form.font} onValueChange={(v) => setForm({ ...form, font: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONTS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Links */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <LinkIcon className="h-4 w-4 text-primary" /> Links
          </div>
          <Button size="sm" variant="outline" onClick={addLink}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add link
          </Button>
        </div>
        {form.links.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-3">
            No links yet — add one to get started. Logos auto-match popular platforms (Instagram, OnlyFans, TikTok, etc.).
          </div>
        ) : (
          <div className="space-y-2">
            {form.links.map((link, i) => {
              const platform = link.url ? detectPlatform(link.url) : null;
              const PlatformIcon = platform?.Icon;
              return (
                <div key={i} className="rounded-lg border border-border bg-secondary/20 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col -space-y-0.5 shrink-0">
                      <button
                        onClick={() => moveLink(i, "up")}
                        disabled={i === 0}
                        className="text-muted-foreground hover:text-primary disabled:opacity-20 p-0.5"
                        title="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-[9px] text-muted-foreground font-mono w-3 text-center">{i + 1}</span>
                      <button
                        onClick={() => moveLink(i, "down")}
                        disabled={i === form.links.length - 1}
                        className="text-muted-foreground hover:text-primary disabled:opacity-20 p-0.5"
                        title="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Platform-detected logo preview */}
                    {PlatformIcon && (
                      <div
                        className="h-9 w-9 rounded-lg bg-card border border-border flex items-center justify-center shrink-0"
                        title={platform?.label}
                      >
                        <PlatformIcon
                          className="h-4 w-4"
                          style={{ color: platform?.color ?? "currentColor" }}
                        />
                      </div>
                    )}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2">
                      <Input
                        value={link.label}
                        onChange={(e) => updateLink(i, { label: e.target.value })}
                        placeholder="Label"
                      />
                      <Input
                        value={link.url}
                        onChange={(e) => updateLink(i, { url: e.target.value })}
                        placeholder="https://..."
                        className="font-mono text-xs"
                      />
                    </div>
                    <button
                      onClick={() => removeLink(i)}
                      className="text-muted-foreground hover:text-destructive p-1.5 shrink-0"
                      aria-label="Remove link"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {platform && link.url && (
                    <div className="text-[10px] text-muted-foreground mt-1.5 ml-7 pl-3">
                      Detected: <span className="text-primary font-medium">{platform.label}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Gallery */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Images className="h-4 w-4 text-primary" /> Photo gallery
            {form.media.length > 0 && (
              <span className="text-[10px] text-muted-foreground font-normal">({form.media.length} image{form.media.length === 1 ? "" : "s"})</span>
            )}
          </div>
          <GalleryUploadButton onUpload={onUploadGalleryImage} />
        </div>
        {form.media.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-3">
            No gallery images yet. Optional — adds a 3-column photo grid below the links on the public page.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {form.media.map((m, i) => (
              <div key={i} className="group relative aspect-square rounded-lg overflow-hidden border border-border">
                <img src={m.url} alt={m.caption ?? ""} className="w-full h-full object-cover" />
                {/* Hover overlay with reorder + delete */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => onMoveGalleryImage(i, "up")}
                    disabled={i === 0}
                    className="rounded-full p-1.5 bg-white/90 text-foreground hover:bg-white disabled:opacity-30"
                    title="Move earlier"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onMoveGalleryImage(i, "down")}
                    disabled={i === form.media.length - 1}
                    className="rounded-full p-1.5 bg-white/90 text-foreground hover:bg-white disabled:opacity-30"
                    title="Move later"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onRemoveGalleryImage(i)}
                    className="rounded-full p-1.5 bg-white/90 text-destructive hover:bg-white"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SEO */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="text-sm font-semibold">SEO / sharing (optional)</div>
        <div className="space-y-1.5">
          <Label className="text-xs">Browser tab title</Label>
          <Input
            value={form.seo_title ?? ""}
            onChange={(e) => setForm({ ...form, seo_title: e.target.value })}
            placeholder="Defaults to display name"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Meta description</Label>
          <Textarea
            value={form.seo_description ?? ""}
            onChange={(e) => setForm({ ...form, seo_description: e.target.value })}
            rows={2}
            maxLength={160}
            placeholder="Defaults to tagline + bio. Max 160 chars."
          />
        </div>
      </section>

      {/* Save bar (sticky bottom) */}
      <div className="sticky bottom-4 z-10">
        <div className="rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-md p-3 flex items-center justify-end gap-2">
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 px-2 py-1 -ml-2 rounded hover:bg-secondary"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to landing pages
    </button>
  );
}

// ── Image upload helper ────────────────────────────────────────────────

function ImageUpload({
  label, currentUrl, onUpload, onClear, shape,
}: {
  label: string;
  currentUrl: string | null;
  onUpload: (f: File) => void;
  onClear: () => void;
  shape: "circle" | "rectangle";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`shrink-0 ${shape === "circle" ? "h-16 w-16 rounded-full" : "h-16 w-28 rounded-lg"} border-2 border-dashed border-border hover:border-primary bg-secondary/40 flex items-center justify-center overflow-hidden`}
        >
          {currentUrl ? (
            <img src={currentUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        <div className="flex flex-col gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5 mr-1" /> {currentUrl ? "Replace" : "Upload"}
          </Button>
          {currentUrl && (
            <Button type="button" size="sm" variant="ghost" onClick={onClear}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Gallery upload button helper ───────────────────────────────────────

function GalleryUploadButton({ onUpload }: { onUpload: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          for (const f of files) onUpload(f);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add photos
      </Button>
    </>
  );
}
