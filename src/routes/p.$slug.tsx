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

  // Layout matches the Kinsley-style reference:
  //   • Outside the phone (desktop only): the cover photo blurred and
  //     darkened acts as an ambient backdrop so the page feels designed
  //     for the creator, not a generic frame.
  //   • Inside the phone: black bg, rounded-3xl, shadow. Cover photo
  //     fills the top portion (no overlay), then the name + @slug +
  //     social icons + CTA + bio + links + gallery stack on the dark
  //     area below the photo.
  return (
    <div className="min-h-screen w-full overflow-x-hidden relative" style={{ fontFamily }}>
      {/* Ambient blurred backdrop — uses the creator's cover so each
          page has its own desktop frame. On mobile it's invisible
          because the phone column fills the viewport. */}
      {landing.cover_url && (
        <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${landing.cover_url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(60px) saturate(1.1)",
              transform: "scale(1.15)",
            }}
          />
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.62)" }} />
        </div>
      )}
      {!landing.cover_url && (
        <div className="fixed inset-0 -z-10" style={theme.page} aria-hidden="true" />
      )}

      {/* Preview banner — shows only when an admin is viewing an unpublished draft */}
      {previewMode && (
        <div className="w-full sticky top-0 z-50 text-center text-xs font-semibold py-1.5 px-3" style={{ background: "#f59e0b", color: "#1a1a1a" }}>
          ⚠ Preview mode — this page is a draft. Toggle "Published" in the editor to make it live.
        </div>
      )}

      {/* Phone-frame column — fixed 480px on desktop, full-bleed on
          mobile. Rounded corners + soft shadow only on desktop so the
          phone frame doesn't fight the actual phone bezel on mobile. */}
      <div className="flex justify-center sm:py-8 min-h-screen">
        <div
          className="w-full max-w-[480px] sm:rounded-3xl overflow-hidden sm:shadow-[0_25px_80px_-20px_rgba(0,0,0,0.5)] flex flex-col items-stretch"
          style={{ background: "#000" }}
        >
          {/* Hero photo — fills the top, no overlay. Avatar-fallback when
              no cover, kept on a black bg to match. */}
          {landing.cover_url ? (
            <HeroWithCover landing={landing} themeBg="#000" />
          ) : (
            <HeroAvatarOnly landing={landing} theme={theme} />
          )}

          {/* Content stack on the black phone interior. Bottom padding
              respects iOS safe-area so the footer + last link don't
              disappear under the home indicator on iPhone. */}
          <div
            className="w-full px-5 pt-7 flex flex-col items-center"
            style={{ paddingBottom: "calc(3rem + env(safe-area-inset-bottom, 0px))" }}
          >
            {/* Name + @slug — centered, big white type just below the photo */}
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight inline-flex items-center gap-2 text-center text-white">
              {landing.display_name ?? landing.slug}
              {landing.is_verified && (
                <BadgeCheck
                  className="h-6 w-6 sm:h-7 sm:w-7 shrink-0"
                  style={{ color: "#1d9bf0", fill: "currentColor", strokeWidth: 0 }}
                  aria-label="Verified"
                >
                  <title>Verified</title>
                </BadgeCheck>
              )}
            </h1>
            <div className="text-base text-white/55 mt-1 font-medium">
              @{landing.slug}
            </div>

            {/* Social icons — small circular brand-colored buttons */}
            <div className="mt-5 w-full">
              <SocialIconStrip links={landing.links} landingId={landing.id} mutedText={theme.mutedText} />
            </div>

            {/* Featured CTA — big colored pill with icon badge on the
                left and the creator's text label centered. */}
            <FeaturedCTA links={landing.links} landingId={landing.id} theme={theme} />

            {/* Tagline / bio area */}
            {landing.bio && (
              <p className="text-sm text-center max-w-xs leading-relaxed whitespace-pre-wrap mt-6 text-white/70">
                {landing.bio}
              </p>
            )}

            {/* Secondary links */}
            {(() => {
              const secondary = secondaryLinks(landing.links);
              if (secondary.length === 0) return null;
              return (
                <div className="w-full mt-6 space-y-3">
                  {secondary.map((link, i) => (
                    <LinkButton
                      key={i}
                      link={link}
                      landingId={landing.id}
                      baseStyle={theme.link}
                      hoverStyle={theme.linkHover}
                    />
                  ))}
                </div>
              );
            })()}

            {/* Photo gallery */}
            {landing.media.length > 0 && (
              <div className="w-full mt-8 grid grid-cols-3 gap-1.5">
                {landing.media.map((m, i) => (
                  <div key={i} className="aspect-square rounded-xl overflow-hidden bg-white/5">
                    <img src={m.url} alt={m.caption ?? ""} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="mt-12 text-[10px] uppercase tracking-[0.2em] text-white/30">
              @{landing.slug}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Link partitioning ───────────────────────────────────────────────────
//
// The new phone-style layout splits links into three buckets so the page
// reads like a native app instead of a stack of identical pills:
//
//   • SOCIAL — Instagram, Snapchat, TikTok, X, Threads, Bluesky, Reddit,
//     YouTube, Facebook, Twitch, Kick, Discord, Pinterest, Tumblr.
//     Rendered as small circular brand icons in a row above the CTA.
//   • FEATURED — first OnlyFans link (typical OFM page intent), or the
//     first link if no OF is present. Renders as a big colored button.
//   • SECONDARY — everything else (Spotify, Patreon, payment apps,
//     custom websites, etc.). Renders as the existing LinkButton list.
//
// We compute each bucket lazily inline rather than tagging the rows in
// the DB so creators can add/remove links without touching schema.

const SOCIAL_KEYS = new Set([
  "instagram", "snapchat", "tiktok", "x", "threads", "bluesky",
  "reddit", "youtube", "facebook", "twitch", "kick", "discord",
  "pinterest", "tumblr",
]);

const isValidLink = (l: LandingLink) => !!(l.label && l.url);

function partitionLinks(links: LandingLink[]) {
  const valid = (links ?? []).filter(isValidLink);
  // Featured = first OF, else first link of any kind
  const ofIdx = valid.findIndex((l) => detectPlatform(l.url).key === "onlyfans");
  const featuredIdx = ofIdx >= 0 ? ofIdx : valid.length > 0 ? 0 : -1;
  const featured = featuredIdx >= 0 ? valid[featuredIdx] : null;

  // Social = any link whose platform is in our social allowlist, but
  // exclude the featured one if it happened to be social.
  const social = valid.filter(
    (l, i) => i !== featuredIdx && SOCIAL_KEYS.has(detectPlatform(l.url).key),
  );

  // Secondary = everything left over.
  const secondary = valid.filter(
    (l, i) =>
      i !== featuredIdx &&
      !SOCIAL_KEYS.has(detectPlatform(l.url).key),
  );
  return { featured, social, secondary };
}

function socialLinks(links: LandingLink[]): LandingLink[] {
  return partitionLinks(links).social;
}
function featuredLink(links: LandingLink[]): LandingLink | null {
  return partitionLinks(links).featured;
}
function secondaryLinks(links: LandingLink[]): LandingLink[] {
  return partitionLinks(links).secondary;
}

// ── Social icon strip ───────────────────────────────────────────────────

function SocialIconStrip({
  links, landingId, mutedText,
}: {
  links: LandingLink[];
  landingId: string;
  mutedText: string;
}) {
  const social = useMemo(() => socialLinks(links ?? []), [links]);
  if (social.length === 0) return null;
  return (
    <div className="flex items-center justify-center gap-3 flex-wrap">
      {social.map((link, i) => (
        <SocialIconButton key={i} link={link} landingId={landingId} mutedText={mutedText} />
      ))}
    </div>
  );
}

function SocialIconButton({
  link, landingId, mutedText,
}: {
  link: LandingLink;
  landingId: string;
  mutedText: string;
}) {
  const platform = useMemo(() => detectPlatform(link.url), [link.url]);
  const Icon = platform.Icon;
  const onClick = () => {
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
      aria-label={platform.label}
      title={link.label || platform.label}
      className="h-11 w-11 rounded-full flex items-center justify-center transition-all hover:-translate-y-0.5 hover:scale-105"
      style={{
        background: platform.color,
        boxShadow: "0 4px 12px -4px rgba(0,0,0,0.25)",
      }}
    >
      <Icon className="h-5 w-5" style={{ color: pickReadableTextOn(platform.color) }} />
    </a>
  );
}

// ── Featured CTA (typically OnlyFans) ───────────────────────────────────

function FeaturedCTA({
  links, landingId, theme: _theme,
}: {
  links: LandingLink[];
  landingId: string;
  theme: ThemeStyles;
}) {
  const link = useMemo(() => featuredLink(links ?? []), [links]);
  const platform = useMemo(() => link ? detectPlatform(link.url) : null, [link]);
  if (!link || !platform) return null;
  const Icon = platform.Icon;
  // OnlyFans CTA renders red to match the Kinsley reference style; for
  // any other platform we use the brand color as the bg.
  const buttonBg = platform.key === "onlyfans" ? "#FF0000" : platform.color;
  const buttonFg = pickReadableTextOn(buttonBg);
  const onClick = () => {
    void supabase.from("landing_clicks").insert({
      landing_id: landingId,
      link_url: link.url,
      link_label: link.label,
      referrer: typeof document !== "undefined" ? document.referrer.slice(0, 200) || null : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
    });
  };
  const label = (link.label || "").trim() || platform.label;
  // Layout: white circular icon badge anchored to the LEFT, label
  // centered across the full button width. Matches the "VIP <3" pill
  // in the reference.
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="relative w-full mt-5 rounded-full flex items-center justify-center pl-16 pr-5 py-4 font-bold text-lg tracking-wide transition-all hover:-translate-y-0.5"
      style={{
        background: buttonBg,
        color: buttonFg,
        boxShadow: "0 8px 24px -8px rgba(0,0,0,0.45)",
      }}
    >
      <span
        className="absolute left-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white flex items-center justify-center"
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" style={{ color: platform.color }} />
      </span>
      <span className="text-center">{label}</span>
    </a>
  );
}

// ── Color contrast helper ───────────────────────────────────────────────
//
// A few platforms use very light brand colors (Snapchat yellow, Kick
// neon green). A black icon reads on those — a white icon disappears.
// Picks the readable text color via a simple luminance check.

function pickReadableTextOn(hex: string): string {
  // Defensive: anything non-hex (like 'currentColor') falls back to white
  if (!/^#([0-9a-f]{6})$/i.test(hex)) return "#fff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Standard relative-luminance approximation
  const lum = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
  return lum > 0.6 ? "#0a0a0a" : "#ffffff";
}

// ── Hero variants ───────────────────────────────────────────────────────

/**
 * Cover-first hero: the cover photo fills a tall block at the top of the page,
 * with a dark gradient at the bottom so the overlaid name + tagline stay
 * readable. The optional avatar appears as a small inline circle next to the
 * name (vs the big standalone circle in the no-cover variant).
 */
function HeroWithCover({ landing, themeBg: _themeBg }: { landing: Landing; themeBg: string }) {
  // Kinsley-style hero: photo only, no overlay. Sized differently per
  // viewport so it dominates the screen the way a phone hero should
  // without dwarfing the layout on tall desktop screens:
  //
  //   • Mobile: the photo fills ~58% of the viewport height (svh, which
  //     accounts for the iOS Safari address bar). Capped by the column
  //     width's natural aspect to avoid super-tall portraits.
  //   • Desktop: aspect-ratio 1:1.15 keeps it visually anchored inside
  //     the 480px frame regardless of screen height.
  return (
    <>
      {/* Mobile sizes by viewport height (svh accounts for iOS Safari's
          collapsing chrome); desktop uses a fixed aspect ratio so the
          phone frame stays balanced regardless of window height. */}
      <style>{`
        .landing-hero-shell { aspect-ratio: 1 / 1.15; }
        @media (max-width: 639px) {
          .landing-hero-shell {
            aspect-ratio: auto;
            height: 58svh;
            min-height: 380px;
            max-height: 620px;
          }
        }
      `}</style>
      <div className="landing-hero-shell relative w-full overflow-hidden">
        <img
          src={landing.cover_url ?? ""}
          alt={landing.display_name ?? landing.slug}
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          style={{ objectPosition: "center 25%" }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
          style={{ background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.35) 60%, #000 100%)" }}
        />
      </div>
    </>
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
