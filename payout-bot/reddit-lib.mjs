// Shared helpers + config for the Reddit automations
// (reddit-daily, reddit-watcher, reddit-weekly).
//
// A creator can run multiple Reddit accounts (separate handles posting
// promo content to different subs). Each creator's accounts get
// aggregated in the daily/weekly reports, but the per-account state
// (karma snapshot, viral milestones already alerted, etc.) is tracked
// individually by the watcher.

// ── Who do we track ──────────────────────────────────────────────
// One block per creator. The "Unattributed" group holds warm-up
// accounts whose owning creator isn't confirmed yet — they still
// get scored on the poster leaderboard, just not aggregated under
// a creator in the daily/weekly reports.
export const REDDIT_CREATORS = [
  { name: "Marissa Munoz", accounts: ["blondejuliaaa", "MissMarissaBlonde", "Caalythraa"] },
  { name: "Maylee",        accounts: ["KiraaaaNest", "IvyyyyPocket"] },
  { name: "Meg",           accounts: ["Lextaaa"] },
  { name: "Bella Leah",    accounts: ["NoriChimes", "Seraphynne11"] },
  { name: "June - Sandra", accounts: ["velvetariiia"] },
  // TODO: confirm which creator owns each of these and migrate up.
  { name: "Unattributed (warm-up)", accounts: [
    "RareArea11", "Valerizzee", "duskkymira", "Lumiiivrae",
    "EntireFace00", "Jessieecorner", "Zephyyyrella",
  ] },
];

// Returns every (creator, account) pair so scripts can iterate flat.
export function eachAccount() {
  return REDDIT_CREATORS.flatMap((c) => c.accounts.map((a) => ({ creator: c.name, account: a })));
}

// ── Posters ─────────────────────────────────────────────────────
// Fixed assignment of Reddit accounts → the poster who runs them.
// Used by reddit-leaderboard.mjs to score performance per poster.
// If the same account ever has multiple posters in a day, the
// leaderboard still attributes its points only to the listed owner —
// rotations need to be reflected here when they change.
export const POSTERS = [
  { name: "Cha",    accounts: ["blondejuliaaa", "IvyyyyPocket", "Lextaaa", "NoriChimes", "Caalythraa"] },
  { name: "Reylee", accounts: ["KiraaaaNest", "Seraphynne11", "MissMarissaBlonde", "velvetariiia"] },
  { name: "Dabi",   accounts: ["RareArea11", "Valerizzee", "duskkymira", "Lumiiivrae"] },
  { name: "Xy",     accounts: ["EntireFace00", "Jessieecorner", "Zephyyyrella"] },
];

// Reward formula. Tweak any field and the leaderboard math
// recomputes — no other code changes needed.
//
// FAIRNESS NOTES
//   • per_post is the dominant effort signal — every post counts the
//     same regardless of how it performed.
//   • Upvotes contribute per_upvote, but capped at upvote_cap_per_post
//     so a single 50k-upvote post on a mature account can't single-
//     handedly dominate the leaderboard.
//   • Viral milestones still bonus separately — they're real wins.
//   • All point values are then multiplied by the account's tier
//     multiplier (see ACCOUNT_TIERS) so growing a small/warm-up
//     account is rewarded as much as coasting on a mega one.
export const POINTS = {
  // Pure upvote-driven formula — agency owner spec'd it:
  //   $1 per 1,000 upvotes · $5 per 5,000 upvotes (same linear rate).
  // Nothing for raw posting volume, nothing for comments. Account
  // tier multipliers still apply for fairness (a warm-up upvote is
  // 3× harder to earn than a mature one).
  per_post:            0,    // no payment for posting itself
  per_upvote:          1,    // 1 pt = 1 upvote (capped 2000/post below)
  per_comment:         0,    // disabled
  upvote_cap_per_post: 2000, // single post can't dominate (e.g. a
                             // 50k-upvote outlier still credits 2k)
  bonus_viral_1k:      0,    // disabled — linear $/upvote covers it
  bonus_viral_5k:      0,    // disabled
  penalty_removed:     -100, // ≈ −$0.10 per removed post (mods rejecting
                             // work is a real performance signal)
  // 1,000 pts = $1. So 1,000 upvotes = $1, 5,000 = $5, 10,000 = $10.
  // Tier multiplier applies on top: warm-up upvotes count ×3 etc.
  points_per_dollar:   1000,
  // Share of attributable OF revenue paid out to the poster. e.g.
  // 0.005 = 0.5%, so $2,000 of attributable revenue → $10 bonus.
  // "Attributable" means: revenue of the creator this poster's
  // Reddit accounts represent, weighted by the poster's share of
  // posts to that creator's Reddit accounts in the cycle.
  revenue_rate:        0.005,
  // Per-poster weekly cap. No single poster's bonus exceeds this
  // even on a banger week.
  per_poster_weekly_cap_usd: 50,
};

// Account difficulty tiers. Smaller / younger accounts are harder
// to grow → posters running them earn a higher multiplier on every
// point they generate. Lookup is by link_karma, picking the first
// tier whose max_karma the account is below.
export const ACCOUNT_TIERS = [
  { name: "warm-up",     max_karma: 5_000,    multiplier: 3.0 },
  { name: "growing",     max_karma: 25_000,   multiplier: 2.0 },
  { name: "established", max_karma: 100_000,  multiplier: 1.5 },
  { name: "mature",      max_karma: Infinity, multiplier: 1.0 },
];

export function tierFor(linkKarma) {
  for (const t of ACCOUNT_TIERS) {
    if (linkKarma <= t.max_karma) return t;
  }
  return ACCOUNT_TIERS[ACCOUNT_TIERS.length - 1];
}

// ── Reddit fetch ─────────────────────────────────────────────────
// Reddit BLOCKS the default fetch User-Agent. Always send a custom
// one identifying the bot + an owner contact handle.
const UA = "Bernard-UNCVRD-bot/1.0 (by /u/Chrispapado06)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function redditGet(path) {
  const url = `https://www.reddit.com${path}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.status === 429) {
      // Rate-limited — back off and retry. The Retry-After header is
      // usually a small number of seconds.
      const wait = Math.min(60, Number(r.headers.get("retry-after") ?? 5)) * 1000;
      await sleep(wait);
      continue;
    }
    if (!r.ok) {
      console.warn(`Reddit ${path} → HTTP ${r.status}`);
      return null;
    }
    return r.json();
  }
  return null;
}

// Account karma + creation date.
export async function fetchAccountAbout(account) {
  const j = await redditGet(`/user/${account}/about.json`);
  const d = j?.data;
  if (!d) return null;
  return {
    name: d.name,
    link_karma: Number(d.link_karma || 0),
    comment_karma: Number(d.comment_karma || 0),
    total_karma: Number(d.total_karma || (d.link_karma || 0) + (d.comment_karma || 0)),
    created_utc: Number(d.created_utc || 0),
  };
}

// Latest submitted posts (up to 100 per call — that's Reddit's cap).
// For 7-day weekly reports paginate via `after`; for daily we never
// need more than one page.
export async function fetchSubmitted(account, { limit = 100, pages = 1 } = {}) {
  const all = [];
  let after = null;
  for (let i = 0; i < pages; i++) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (after) qs.set("after", after);
    const j = await redditGet(`/user/${account}/submitted.json?${qs}`);
    const children = j?.data?.children ?? [];
    if (children.length === 0) break;
    for (const c of children) all.push(c.data);
    after = j?.data?.after;
    if (!after) break;
    await sleep(250); // be polite between pages
  }
  return all;
}

// Whether the post was taken down by mods/admins/Reddit. The
// `removed_by_category` field shows up only on removed posts.
export function isRemoved(post) {
  return !!post?.removed_by_category;
}

export const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");

// Strip Reddit's URL prefix from a permalink for cleaner display.
export const fullUrl = (p) => p?.permalink ? `https://www.reddit.com${p.permalink}` : "";
