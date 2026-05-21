// Shared helpers + config for the Reddit automations
// (reddit-daily, reddit-watcher, reddit-weekly).
//
// A creator can run multiple Reddit accounts (separate handles posting
// promo content to different subs). Each creator's accounts get
// aggregated in the daily/weekly reports, but the per-account state
// (karma snapshot, viral milestones already alerted, etc.) is tracked
// individually by the watcher.

// ── Who do we track ──────────────────────────────────────────────
export const REDDIT_CREATORS = [
  { name: "Marissa Munoz", accounts: ["blondejuliaaa", "MissMarissaBlonde", "Caalythraa"] },
  { name: "Maylee",        accounts: ["KiraaaaNest", "IvyyyyPocket"] },
  { name: "Meg",           accounts: ["Lextaaa"] },
  { name: "Bella Leah",    accounts: ["NoriChimes", "Seraphynne11"] },
];

// Returns every (creator, account) pair so scripts can iterate flat.
export function eachAccount() {
  return REDDIT_CREATORS.flatMap((c) => c.accounts.map((a) => ({ creator: c.name, account: a })));
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
