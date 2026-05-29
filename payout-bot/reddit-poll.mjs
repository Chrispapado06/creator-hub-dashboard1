#!/usr/bin/env node
// Reddit RSS poll — runs every 5 minutes via GitHub Actions.
//
// Reddit blocks Supabase Edge Function IPs, so the Discord bot
// can't fetch post data live during a /shift call. Instead, we
// poll each poster's RSS feed from GitHub Actions (which Reddit
// allows) and upsert new posts into the `reddit_posts` table.
// The bot reads from there.
//
// Required env:
//   SUPABASE_URL              — project URL (https://...supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY — service-role key (write access)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Same list as POSTERS in supabase/functions/discord-bot/index.ts.
// If you add a new poster, mirror them here.
const ACCOUNTS = [
  "blondejuliaaa", "IvyyyyPocket", "Lextaaa", "NoriChimes", "Caalythraa", // Cha
  "KiraaaaNest", "Seraphynne11", "MissMarissaBlonde", "velvetariiia",     // Reylee
  "RareArea11", "Valerizzee", "duskkymira", "Lumiiivrae",                 // Dabi
  "EntireFace00", "Jessieecorner", "Zephyyyrella",                        // Xy
];

const UA = "Bernard-UNCVRD-bot/1.0 (by /u/Chrispapado06)";

function parseRss(xml) {
  // Tolerant regex parse — split by <entry>, pull <id>, <title>,
  // <link>, <published> out of each chunk. The Atom feed Reddit
  // serves is simple enough that we don't need a real XML parser.
  const out = [];
  const chunks = xml.split(/<entry[\s>]/i).slice(1);
  for (const c of chunks) {
    const id  = c.match(/<id>([^<]+)<\/id>/i)?.[1];
    const t   = c.match(/<title>([^<]+)<\/title>/i)?.[1];
    const pub = c.match(/<published>([^<]+)<\/published>/i)?.[1];
    const url = c.match(/<link[^>]*href="([^"]+)"/i)?.[1];
    if (!id || !pub) continue;
    out.push({ post_id: id, title: t ?? "", url: url ?? "", created_at: pub });
  }
  return out;
}

async function pollAccount(account) {
  const r = await fetch(`https://www.reddit.com/user/${account}/submitted/.rss`, {
    headers: { "User-Agent": UA },
  });
  if (!r.ok) {
    console.warn(`u/${account}: HTTP ${r.status}`);
    return 0;
  }
  const posts = parseRss(await r.text());
  if (posts.length === 0) return 0;
  const rows = posts.map((p) => ({ ...p, account }));
  const { error } = await supa
    .from("reddit_posts")
    .upsert(rows, { onConflict: "account,post_id", ignoreDuplicates: true });
  if (error) {
    console.warn(`u/${account}: DB error ${error.message}`);
    return 0;
  }
  return rows.length;
}

async function main() {
  console.log(`[${new Date().toISOString()}] polling ${ACCOUNTS.length} accounts`);
  let total = 0;
  for (const a of ACCOUNTS) {
    const n = await pollAccount(a);
    total += n;
    // Polite gap between requests — Reddit rate-limits per UA.
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`Upserted ${total} post-rows total`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
