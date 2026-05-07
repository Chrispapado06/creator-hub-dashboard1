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
  Info, BadgeCheck, Images,
} from "lucide-react";
import { detectPlatform } from "@/lib/landing-platforms";
import { format, parseISO, subDays } from "date-fns";
import { logAudit } from "@/lib/audit";

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

export function CreatorLanding({ creatorId, creatorName }: { creatorId: string; creatorName?: string }) {
  const [landing, setLanding] = useState<Landing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  // Local form state — synced with landing on save
  const [form, setForm] = useState<Landing | null>(null);

  // Click analytics for the last 30 days
  const [clicks, setClicks] = useState<{ link_url: string; link_label: string | null; count: number }[]>([]);
  const [totalClicks, setTotalClicks] = useState(0);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("creator_landing_pages")
      .select("*")
      .eq("creator_id", creatorId)
      .maybeSingle();
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (data) {
      const row = data as unknown as Landing;
      if (!Array.isArray(row.links)) row.links = [];
      if (!Array.isArray(row.media)) row.media = [];
      // Tolerate older rows where the column didn't exist yet
      if (typeof row.is_verified !== "boolean") row.is_verified = false;
      setLanding(row);
      setForm(row);
      void loadClicks(row.id);
    } else {
      setLanding(null);
      setForm(null);
    }
  };

  const loadClicks = async (landingId: string) => {
    const sinceISO = subDays(new Date(), 30).toISOString();
    const { data } = await supabase
      .from("landing_clicks")
      .select("link_url, link_label")
      .eq("landing_id", landingId)
      .gte("occurred_at", sinceISO);
    const rows = (data ?? []) as { link_url: string; link_label: string | null }[];
    setTotalClicks(rows.length);
    const byLink = new Map<string, { link_url: string; link_label: string | null; count: number }>();
    for (const r of rows) {
      const key = r.link_url;
      if (!byLink.has(key)) byLink.set(key, { link_url: r.link_url, link_label: r.link_label, count: 0 });
      byLink.get(key)!.count++;
    }
    setClicks([...byLink.values()].sort((a, b) => b.count - a.count));
  };

  useEffect(() => { void load(); }, [creatorId]);

  // ── Create the page for the first time ────────────────────────────────

  const onCreate = async () => {
    if (creating) return;
    const baseSlug = slugify(creatorName ?? "creator");
    if (!isValidSlug(baseSlug)) return toast.error("Couldn't derive a slug from the creator name. Edit the creator's name first.");
    setCreating(true);
    // Try the simple slug first; if taken, append a random suffix and retry.
    let attempt = 0;
    let slug = baseSlug;
    while (attempt < 5) {
      const { error } = await supabase.from("creator_landing_pages").insert({
        creator_id: creatorId,
        slug,
        display_name: creatorName ?? null,
        is_published: false, // start unpublished so admin can polish before going live
        links: [],
        theme: "cream",
        font: "poppins",
      });
      if (!error) {
        void logAudit({
          action: "landing_created",
          entity_type: "creator_landing_page",
          entity_name: `${creatorName ?? "Creator"} · ${slug}`,
        });
        toast.success("Landing page created");
        setCreating(false);
        await load();
        return;
      }
      // Unique violation? Try a new slug.
      if (error.message.includes("unique") || error.code === "23505") {
        attempt++;
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      } else {
        setCreating(false);
        return toast.error(error.message);
      }
    }
    setCreating(false);
    toast.error("Couldn't allocate a unique slug — try again.");
  };

  // ── Save the form ─────────────────────────────────────────────────────

  const onSave = async () => {
    if (!form || !landing) return;

    if (!isValidSlug(form.slug)) {
      return toast.error("Slug must be 3-64 chars, lowercase letters/numbers/hyphens only, no leading or trailing hyphen.");
    }
    // Validate links — warn but don't block on missing protocol
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

  // ── Image uploads (avatar / cover) ────────────────────────────────────

  // ── Gallery uploads ───────────────────────────────────────────────────

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

  if (loading) return <div className="text-sm text-muted-foreground">Loading landing page…</div>;

  if (!landing || !form) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
        <Globe className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
        <div className="text-sm font-medium">No landing page yet</div>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          Create a public bio + links page for {creatorName ?? "this creator"}. Like a Linktree, hosted by the agency. Ships unpublished — you polish first, then flip the switch.
        </p>
        <Button onClick={onCreate} disabled={creating} className="mt-4">
          <Plus className="h-4 w-4 mr-1.5" /> {creating ? "Creating…" : "Create landing page"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            onClick={() => window.open(publicUrl, "_blank")}
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

      {/* Click analytics */}
      {clicks.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" /> Last 30 days
            </div>
            <span className="text-xs text-muted-foreground">{totalClicks.toLocaleString()} total clicks</span>
          </div>
          <div className="space-y-1.5">
            {clicks.map((c) => {
              const pct = totalClicks > 0 ? (c.count / totalClicks) * 100 : 0;
              return (
                <div key={c.link_url} className="flex items-center gap-3 text-xs">
                  <div className="w-32 truncate text-muted-foreground" title={c.link_label ?? c.link_url}>
                    {c.link_label || c.link_url}
                  </div>
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-primary-glow" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-12 text-right font-medium tabular-nums">{c.count}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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

