import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Loader2, BadgeCheck } from "lucide-react";
import { detectPlatform } from "@/lib/landing-platforms";

export const Route = createFileRoute("/p/$slug")({
  component: LandingPage,
});

type LandingLink = { label: string; url: string; icon?: string };
type LandingMedia = { url: string; caption?: string };
type Landing = {
  id: string;
  slug: string;
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

// ── Themes ────────────────────────────────────────────────────────────────
//
// Each theme is a self-contained set of background + foreground + accent
// colors. We avoid coupling to the dashboard's CSS variables so a landing
// page renders identically regardless of the visitor's system preferences.

type ThemeStyles = {
  page: React.CSSProperties;
  card: React.CSSProperties;
  primaryText: string;
  mutedText: string;
  link: React.CSSProperties;
  linkHover: React.CSSProperties;
};

const THEMES: Record<string, ThemeStyles> = {
  cream: {
    page: {
      background: "linear-gradient(180deg, #fcf9ee 0%, #f4eede 100%)",
      color: "#3a2a20",
    },
    card: { background: "#fff", border: "1px solid rgba(0,0,0,0.06)" },
    primaryText: "#3a2a20",
    mutedText: "#7a6a5e",
    link: {
      background: "#fff",
      color: "#3a2a20",
      border: "1px solid rgba(0,0,0,0.08)",
      boxShadow: "0 2px 8px -2px rgba(58, 42, 32, 0.06)",
    },
    linkHover: {
      background: "linear-gradient(135deg, #e87852 0%, #f4a374 100%)",
      color: "#fff",
      borderColor: "transparent",
    },
  },
  dark: {
    page: { background: "#0e0a08", color: "#f4eede" },
    card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" },
    primaryText: "#f4eede",
    mutedText: "#9a8e82",
    link: {
      background: "rgba(255,255,255,0.04)",
      color: "#f4eede",
      border: "1px solid rgba(255,255,255,0.1)",
    },
    linkHover: {
      background: "linear-gradient(135deg, #e87852 0%, #f4a374 100%)",
      color: "#fff",
      borderColor: "transparent",
    },
  },
  rose: {
    page: {
      background: "linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)",
      color: "#5b2738",
    },
    card: { background: "#fff", border: "1px solid rgba(190, 24, 93, 0.12)" },
    primaryText: "#5b2738",
    mutedText: "#9a4360",
    link: {
      background: "#fff",
      color: "#5b2738",
      border: "1px solid rgba(190, 24, 93, 0.15)",
    },
    linkHover: {
      background: "linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)",
      color: "#fff",
      borderColor: "transparent",
    },
  },
  gradient: {
    page: {
      background: "linear-gradient(135deg, #6366f1 0%, #ec4899 50%, #f59e0b 100%)",
      color: "#fff",
    },
    card: { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(20px)" },
    primaryText: "#fff",
    mutedText: "rgba(255,255,255,0.75)",
    link: {
      background: "rgba(255,255,255,0.15)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.25)",
      backdropFilter: "blur(10px)",
    },
    linkHover: {
      background: "rgba(255,255,255,0.95)",
      color: "#1a1a2e",
      borderColor: "transparent",
    },
  },
  minimal: {
    page: { background: "#fafafa", color: "#1a1a1a" },
    card: { background: "#fff", border: "1px solid #e5e5e5" },
    primaryText: "#1a1a1a",
    mutedText: "#737373",
    link: {
      background: "#fff",
      color: "#1a1a1a",
      border: "1px solid #e5e5e5",
    },
    linkHover: {
      background: "#1a1a1a",
      color: "#fff",
      borderColor: "#1a1a1a",
    },
  },
};

const FONT_FAMILIES: Record<string, string> = {
  poppins: "'Poppins', system-ui, -apple-system, sans-serif",
  serif:   "'Cormorant Garamond', Georgia, serif",
  mono:    "'IBM Plex Mono', 'Courier New', monospace",
};

// ── Page ────────────────────────────────────────────────────────────────

function LandingPage() {
  const { slug } = useParams({ from: "/p/$slug" });
  const [landing, setLanding] = useState<Landing | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Preview mode bypasses is_published — admins use it to preview a draft
      // before flipping the switch. Triggered by ?preview=1 in the URL AND
      // an active dashboard session (so the draft isn't world-visible).
      const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
      const isPreviewParam = url?.searchParams.get("preview") === "1";
      const hasSession = typeof window !== "undefined" && !!localStorage.getItem("agency_session");
      const allowDraft = isPreviewParam && hasSession;

      // Try slug first — most common path. If the visitor's actually on a
      // custom domain we'll fall back to that lookup.
      let row: Landing | null = null;
      const bySlug = await supabase
        .from("creator_landing_pages")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (bySlug.data) {
        row = bySlug.data as unknown as Landing;
      } else {
        // No match by slug — see if the hostname matches a custom_domain.
        // (This branch fires when a visitor hits the apex of a custom domain
        // and our SPA router still resolved the path to the slug param somehow.)
        if (typeof window !== "undefined") {
          const host = window.location.hostname;
          const byDomain = await supabase
            .from("creator_landing_pages")
            .select("*")
            .eq("custom_domain", host)
            .maybeSingle();
          if (byDomain.data) row = byDomain.data as unknown as Landing;
        }
      }
      if (cancelled) return;
      if (!row) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (!row.is_published && !allowDraft) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setPreviewMode(allowDraft && !row.is_published);
      // Normalize JSONB columns to arrays even if the DB returned null/object
      if (!Array.isArray(row.links)) row.links = [];
      if (!Array.isArray(row.media)) row.media = [];
      setLanding(row);

      // Fire-and-forget view tracking. Skip when the admin is just previewing
      // a draft — those aren't real visits and would pollute the analytics.
      // Best-effort geo enrichment from ipapi.co (free, no key, ~1k/day).
      // If the lookup fails the view still records, just without geo.
      if (!allowDraft) {
        void (async () => {
          let geo: { country?: string; city?: string; region?: string } = {};
          try {
            const r = await fetch("https://ipapi.co/json/");
            if (r.ok) {
              const j = await r.json();
              geo = {
                country: (j.country_code || j.country) ?? undefined,
                city: j.city ?? undefined,
                region: j.region ?? undefined,
              };
            }
          } catch {
            // Network blocked / rate-limited — record the view without geo.
          }
          await supabase.from("landing_views").insert({
            landing_id: row.id,
            referrer: typeof document !== "undefined" ? document.referrer.slice(0, 200) || null : null,
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
            country: geo.country ?? null,
            city: geo.city ?? null,
            region: geo.region ?? null,
          });
        })();
      }
      setLoading(false);

      // Update document head for SEO + sharing
      if (typeof document !== "undefined") {
        document.title = row.seo_title || row.display_name || row.slug;
        const desc = row.seo_description || row.tagline || row.bio || "";
        let m = document.querySelector('meta[name="description"]');
        if (!m) {
          m = document.createElement("meta");
          m.setAttribute("name", "description");
          document.head.appendChild(m);
        }
        m.setAttribute("content", desc.slice(0, 160));
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const theme = useMemo(() => THEMES[landing?.theme ?? "cream"] ?? THEMES.cream, [landing]);
  const fontFamily = FONT_FAMILIES[landing?.font ?? "poppins"] ?? FONT_FAMILIES.poppins;

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#fcf9ee" }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#e87852" }} />
      </div>
    );
  }

  if (notFound || !landing) {
    return <NotFound />;
  }

  return (
    <div
      className="min-h-screen w-full overflow-x-hidden flex flex-col items-center"
      style={{ ...theme.page, fontFamily }}
    >
      {/* Preview banner — shows only when an admin is viewing an unpublished draft */}
      {previewMode && (
        <div className="w-full sticky top-0 z-50 bg-warning text-warning-foreground text-center text-xs font-semibold py-1.5 px-3" style={{ background: "#f59e0b", color: "#1a1a1a" }}>
          ⚠ Preview mode — this page is a draft. Toggle "Published" in the editor to make it live.
        </div>
      )}

      {/* Hero: cover photo as a full-width hero with name + tagline overlaid.
          Falls back to a centered avatar+name layout when there's no cover. */}
      {landing.cover_url ? (
        <HeroWithCover landing={landing} themeBg={(theme.page.background as string) || "#fcf9ee"} />
      ) : (
        <HeroAvatarOnly landing={landing} theme={theme} />
      )}

      <div className={`w-full max-w-md px-5 pb-20 flex flex-col items-center ${landing.cover_url ? "pt-2" : "pt-2"}`}>
        {/* Bio (longer description, sits below the hero) */}
        {landing.bio && (
          <p className="text-sm text-center max-w-xs leading-relaxed whitespace-pre-wrap mb-2" style={{ color: theme.mutedText }}>
            {landing.bio}
          </p>
        )}

        {/* Links */}
        <div className="w-full mt-8 space-y-3">
          {(landing.links as LandingLink[]).filter((l) => l.label && l.url).map((link, i) => (
            <LinkButton
              key={i}
              link={link}
              landingId={landing.id}
              baseStyle={theme.link}
              hoverStyle={theme.linkHover}
            />
          ))}
        </div>

        {/* Photo gallery */}
        {landing.media.length > 0 && (
          <div className="w-full mt-8 grid grid-cols-3 gap-1.5">
            {landing.media.map((m, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl overflow-hidden"
                style={{ background: "rgba(0,0,0,0.04)" }}
              >
                <img
                  src={m.url}
                  alt={m.caption ?? ""}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-[10px] uppercase tracking-[0.2em] opacity-60" style={{ color: theme.mutedText }}>
          @{landing.slug}
        </div>
      </div>
    </div>
  );
}

// ── Hero variants ───────────────────────────────────────────────────────

/**
 * Cover-first hero: the cover photo fills a tall block at the top of the page,
 * with a dark gradient at the bottom so the overlaid name + tagline stay
 * readable. The optional avatar appears as a small inline circle next to the
 * name (vs the big standalone circle in the no-cover variant).
 */
function HeroWithCover({ landing, themeBg }: { landing: Landing; themeBg: string }) {
  return (
    <div className="relative w-full" style={{ height: "min(60vh, 540px)" }}>
      <img
        src={landing.cover_url ?? ""}
        alt={landing.display_name ?? landing.slug}
        className="w-full h-full object-cover"
        loading="eager"
        // Center the subject so portraits crop nicely on wider viewports
        style={{ objectPosition: "center 25%" }}
      />
      {/* Dark gradient fade at the bottom for text readability */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, transparent 40%, rgba(0,0,0,0.55) 75%, rgba(0,0,0,0.85) 100%)",
        }}
      />
      {/* Bottom-fade into the page background so the hero doesn't end with a hard edge */}
      <div
        className="absolute inset-x-0 bottom-0 h-12 pointer-events-none"
        style={{ background: `linear-gradient(180deg, transparent 0%, ${themeBg} 100%)` }}
      />
      {/* Name + tagline overlaid on the bottom of the cover */}
      <div className="absolute inset-x-0 bottom-0 px-5 pb-8 flex flex-col items-center text-center">
        <div className="flex items-center gap-3">
          {landing.avatar_url && (
            <img
              src={landing.avatar_url}
              alt=""
              className="h-14 w-14 rounded-full object-cover border-2"
              style={{ borderColor: "rgba(255,255,255,0.85)", boxShadow: "0 4px 16px -4px rgba(0,0,0,0.6)" }}
            />
          )}
          <div className="flex flex-col items-start">
            <h1
              className="text-2xl sm:text-3xl font-bold tracking-tight inline-flex items-center gap-1.5"
              style={{ color: "#fff", textShadow: "0 2px 16px rgba(0,0,0,0.7)" }}
            >
              {landing.display_name ?? landing.slug}
              {landing.is_verified && (
                <BadgeCheck
                  className="h-5 w-5 sm:h-6 sm:w-6"
                  style={{ color: "#1d9bf0", fill: "currentColor", strokeWidth: 0 }}
                  aria-label="Verified"
                >
                  <title>Verified</title>
                </BadgeCheck>
              )}
            </h1>
            {landing.tagline && (
              <p
                className="text-sm sm:text-base mt-0.5"
                style={{ color: "rgba(255,255,255,0.92)", textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}
              >
                {landing.tagline}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Avatar-first hero (fallback when there's no cover photo). Uses the
 * traditional Linktree-style centered circle + name layout.
 */
function HeroAvatarOnly({ landing, theme }: { landing: Landing; theme: ThemeStyles }) {
  return (
    <div className="w-full max-w-md px-5 pt-12 sm:pt-16 flex flex-col items-center">
      <div
        className="h-28 w-28 rounded-full overflow-hidden border-4 mb-5 shadow-xl"
        style={{
          borderColor: (theme.card.background as string) || "#fff",
          boxShadow: "0 8px 32px -8px rgba(0,0,0,0.2)",
        }}
      >
        {landing.avatar_url ? (
          <img
            src={landing.avatar_url}
            alt={landing.display_name ?? landing.slug}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-3xl font-semibold"
            style={{ background: "linear-gradient(135deg, #e87852, #f4a374)", color: "#fff" }}
          >
            {(landing.display_name ?? landing.slug)[0].toUpperCase()}
          </div>
        )}
      </div>
      <h1
        className="text-2xl font-bold tracking-tight text-center inline-flex items-center gap-1.5"
        style={{ color: theme.primaryText }}
      >
        {landing.display_name ?? landing.slug}
        {landing.is_verified && (
          <BadgeCheck
            className="h-5 w-5"
            style={{ color: "#1d9bf0", fill: "currentColor", strokeWidth: 0 }}
            aria-label="Verified"
          >
            <title>Verified</title>
          </BadgeCheck>
        )}
      </h1>
      {landing.tagline && (
        <p className="text-sm mt-1 text-center" style={{ color: theme.mutedText }}>
          {landing.tagline}
        </p>
      )}
    </div>
  );
}

// ── Link button: tracks clicks ──────────────────────────────────────────

function LinkButton({
  link, landingId, baseStyle, hoverStyle,
}: {
  link: LandingLink;
  landingId: string;
  baseStyle: React.CSSProperties;
  hoverStyle: React.CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  const platform = useMemo(() => detectPlatform(link.url), [link.url]);
  const Icon = platform.Icon;

  const onClick = () => {
    // Fire-and-forget click tracking. Don't block navigation if it fails.
    void supabase.from("landing_clicks").insert({
      landing_id: landingId,
      link_url: link.url,
      link_label: link.label,
      referrer: typeof document !== "undefined" ? document.referrer.slice(0, 200) || null : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
    });
  };

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="grid grid-cols-[24px_1fr_24px] items-center w-full rounded-2xl px-5 py-4 text-sm font-semibold transition-all duration-200 ease-out hover:-translate-y-0.5"
      style={hover ? { ...baseStyle, ...hoverStyle } : baseStyle}
    >
      <Icon className="h-5 w-5 justify-self-start" style={{ color: hover ? "currentColor" : platform.color }} />
      <span className="text-center">{link.label}</span>
      <ExternalLink className="h-3.5 w-3.5 opacity-50 justify-self-end" />
    </a>
  );
}

// ── 404 ─────────────────────────────────────────────────────────────────

function NotFound() {
  return (
    <div className="fixed inset-0 flex items-center justify-center px-6" style={{ background: "#fcf9ee", color: "#3a2a20" }}>
      <div className="text-center max-w-sm">
        <div className="text-6xl font-bold tracking-tight">404</div>
        <p className="mt-2 text-sm opacity-70">
          This page doesn't exist, or hasn't been published yet.
        </p>
      </div>
    </div>
  );
}
