// Flux-style "Detailed Analytics" hero used on the per-account detail
// view of every social platform page (TikTok / Instagram / Facebook).
//
// Layout:
//   ┌────────────────────────────────────┬───────────────────┐
//   │ ✨ Here Are Your Creator Matches    │  Total Likes      │
//   │ Discover the data behind …          │  X.XM   ↑ 2.1%    │
//   ├────────────────────────────────────┤                   │
//   │ ┌────┐                              │  Engagement Rate  │
//   │ │ 📷 │ Display Name  ✓ verified    │  X.XX%  ↓ 2.1%    │
//   │ │    │ @handle                      │                   │
//   │ └────┘ Bio text…                    │  Revenue          │
//   │        Joined Dec 2024               │  $X     ↑ X.X%    │
//   └────────────────────────────────────┴───────────────────┘
//
// Props are normalized so the component doesn't have to know about
// platform-specific shapes — the calling page wires its own data.

import { Sparkles, Heart, TrendingUp, DollarSign, BadgeCheck } from "lucide-react";

/** Instagram and Facebook CDN URLs (`scontent-*.cdninstagram.com`,
 *  `*.fbcdn.net`) refuse direct browser loads — they sign URLs that
 *  only work from their own pages. Routing through images.weserv.nl
 *  (a free, well-trusted image proxy) fetches the image server-side
 *  and re-serves it with permissive CORS headers, which the browser
 *  is happy to load.
 *
 *  We only proxy IG/FB CDN URLs — manually-uploaded avatars (e.g.
 *  Supabase Storage) pass through untouched.
 */
function proxiedImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const isIgCdn = /(?:cdninstagram|fbcdn|instagram\.com)/i.test(url);
  if (!isIgCdn) return url;
  // weserv expects the URL without the protocol prefix.
  const stripped = url.replace(/^https?:\/\//i, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}`;
}

export type AccountHeroStat = {
  /** Big primary value (e.g. "23.8M", "56.31%", "$1,234"). Pre-formatted. */
  value: string;
  /** % change vs previous period. null = unknown / not enough history. */
  delta: number | null;
  deltaLabel?: string;
};

export function AccountAnalyticsHero({
  avatarUrl,
  displayName,
  username,
  verified,
  bio,
  joinedLabel,
  brandIcon,
  brandColor,
  totalLikes,
  engagementRate,
  revenue,
}: {
  avatarUrl: string | null;
  displayName: string;
  username: string;
  verified?: boolean;
  bio?: string | null;
  joinedLabel?: string | null;
  /** Small platform icon (TikTok / IG / FB) drawn next to verified badge. */
  brandIcon?: React.ReactNode;
  /** Hex brand color used for the verified badge background. */
  brandColor: string;
  totalLikes: AccountHeroStat;
  engagementRate: AccountHeroStat;
  /** Pre-formatted revenue string (e.g. "$1,234"). */
  revenue: AccountHeroStat;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5">
      {/* ── Eyebrow row — Flux's "Here Are Your Creator Matches" header. */}
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: brandColor }} />
          <h3 className="text-base font-bold tracking-tight">Detailed Analytics</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Profile, engagement, and revenue rolled up for this account.
        </p>
      </div>

      {/* ── Profile + sidebar split — Flux's centerpiece. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Left: avatar + bio block */}
        <div className="flex items-start gap-5 flex-wrap sm:flex-nowrap">
          {avatarUrl ? (
            <img
              src={proxiedImageUrl(avatarUrl) ?? avatarUrl}
              alt={displayName}
              referrerPolicy="no-referrer"
              onError={(e) => {
                // If the proxied URL also fails (rare), fall back to the
                // initials block by hiding the broken <img>.
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
              className="h-28 w-28 sm:h-32 sm:w-32 rounded-full object-cover ring-4 ring-card shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] shrink-0 bg-muted"
            />
          ) : (
            <div
              className="h-28 w-28 sm:h-32 sm:w-32 rounded-full flex items-center justify-center font-bold text-3xl text-white ring-4 ring-card shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)] shrink-0"
              style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}88)` }}
            >
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight uppercase truncate">
                {displayName}
              </h2>
              {verified && (
                <span
                  className="inline-flex items-center justify-center h-5 w-5 rounded-full text-white shrink-0"
                  style={{ backgroundColor: brandColor }}
                  title="Verified account"
                >
                  <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
                </span>
              )}
              {brandIcon && (
                <span className="inline-flex items-center justify-center h-5 w-5 shrink-0">
                  {brandIcon}
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground font-medium">@{username}</div>
            {bio ? (
              <p className="text-sm text-foreground/80 leading-relaxed max-w-prose pt-1.5 whitespace-pre-wrap line-clamp-4">
                {bio}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground/60 italic pt-1.5">
                No bio set on this account yet.
              </p>
            )}
            {joinedLabel && (
              <div className="text-[11px] text-muted-foreground pt-2">
                {joinedLabel}
              </div>
            )}
          </div>
        </div>

        {/* Right: stat cards stacked vertically (Flux pattern) */}
        <div className="space-y-3">
          <HeroStatCard
            icon={<Heart className="h-4 w-4" />}
            label="Total Likes"
            stat={totalLikes}
            tone="rose"
          />
          <HeroStatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Engagement Rate"
            stat={engagementRate}
            tone="violet"
          />
          <HeroStatCard
            icon={<DollarSign className="h-4 w-4" />}
            label="Revenue"
            stat={revenue}
            tone="emerald"
          />
        </div>
      </div>
    </section>
  );
}

const STAT_TONES = {
  rose:    { iconBg: "bg-rose-500/12",    iconFg: "text-rose-600" },
  violet:  { iconBg: "bg-violet-500/12",  iconFg: "text-violet-600" },
  emerald: { iconBg: "bg-emerald-500/12", iconFg: "text-emerald-600" },
} as const;

function HeroStatCard({
  icon, label, stat, tone,
}: {
  icon: React.ReactNode;
  label: string;
  stat: AccountHeroStat;
  tone: keyof typeof STAT_TONES;
}) {
  const t = STAT_TONES[tone];
  const positive = stat.delta != null && stat.delta > 0;
  const negative = stat.delta != null && stat.delta < 0;
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4 flex items-start gap-3 transition-all hover:bg-background hover:shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground font-medium">{label}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums leading-none">{stat.value}</div>
        {stat.delta != null && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px]">
            <span
              className={`font-bold ${
                positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-muted-foreground"
              }`}
            >
              {positive ? "↑" : negative ? "↓" : "→"} {Math.abs(stat.delta).toFixed(1)}%
            </span>
            <span className="text-muted-foreground">{stat.deltaLabel ?? "vs last month"}</span>
          </div>
        )}
      </div>
      <span className={`h-9 w-9 shrink-0 rounded-lg ${t.iconBg} ${t.iconFg} flex items-center justify-center`}>
        {icon}
      </span>
    </div>
  );
}

// ── Content Type Breakdown ───────────────────────────────────────────────
//
// Flux's "Analysis of engagement by content format" panel — six small
// stat boxes split into two halves (views/impressions on the left,
// watch-time/completion on the right). Use it under the hero on the
// account detail page.

export type ContentBreakdownStat = { label: string; value: string };

export function ContentTypeBreakdown({
  leftStats, rightStats, brandColor,
}: {
  /** Top-left grid (e.g. Total Views, Unique Views, Impressions, View Rate) */
  leftStats: ContentBreakdownStat[];
  /** Top-right grid (e.g. Avg. Watch Time, Total Watch Time, Completion Rate, Avg % Watched) */
  rightStats: ContentBreakdownStat[];
  brandColor: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold tracking-tight">Content Type Breakdown</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Analysis of engagement by content format.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Left card */}
        <div
          className="rounded-xl border border-border bg-background/40 p-4 grid grid-cols-2 gap-x-3 gap-y-3 relative overflow-hidden"
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-0.5"
            style={{ backgroundColor: brandColor }}
          />
          {leftStats.map((s) => (
            <BreakdownCell key={s.label} {...s} />
          ))}
        </div>
        {/* Right card */}
        <div className="rounded-xl border border-border bg-background/40 p-4 grid grid-cols-2 gap-x-3 gap-y-3">
          {rightStats.map((s) => (
            <BreakdownCell key={s.label} {...s} />
          ))}
        </div>
      </div>
    </section>
  );
}

function BreakdownCell({ label, value }: ContentBreakdownStat) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="text-[11px] text-muted-foreground truncate">{label}</span>
      <span className="text-sm font-bold tabular-nums shrink-0">{value}</span>
    </div>
  );
}
