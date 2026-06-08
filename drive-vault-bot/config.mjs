// Drive → OF vault bot — configuration & shared helpers.
//
// Each model has ONE dedicated Google Drive folder that they (or their
// editor) drop finished content into. This bot polls those folders,
// uploads any new photo/video to that creator's OnlyFans vault via the
// OnlyFans API, then moves the file into a "Posted" subfolder so it's
// never uploaded twice.
//
// ── How to add a creator ──────────────────────────────────────────
//   1. Create (or pick) a Drive folder for the model.
//   2. Share it with the service-account email (see README). Viewer is
//      enough — the bot only reads; it never moves or changes files.
//      Any "script" subfolders you make inside it are scanned too.
//   3. Grab the folder ID from its URL:
//        https://drive.google.com/drive/folders/<THIS_IS_THE_ID>
//   4. Add a row below with the model's name, OF account_id (same id
//      used in payout-bot/config.mjs), and that folder_id.
//
// account_id  = the onlyfansapi acct_... id for the creator's OF page.
// folder_id   = the Drive folder the model uploads content into.

export const DRIVE_MAP = [
  // name                account_id (OF)                              folder_id (Google Drive)
  { name: "Blue Bear",     account_id: "acct_99db42bda91149f58fd68ecccde21fa8", folder_id: "1h4lBdweWfstnjT1yJhVj6BhOE8ygb8Aa" },
  { name: "Meg",           account_id: "acct_996fbed6bab449af89f211b4851896ef", folder_id: "1LbhKLVh-oF0vJuJ6G9xr5VzHokpxRaAI" },
  { name: "Emma",          account_id: "acct_9bae83ac547447798d39e2d816ecd339", folder_id: "1thqHGaI9jEkwbkjxU7RqLYC6wxNIsywi" },
  { name: "Marissa Munoz", account_id: "acct_42e1c9678cfa4d379d44422a39ef7991", folder_id: "1x4T-jb2eElCilO8oi6Tfh_VAdqP4nYza" },
  { name: "Julie",         account_id: "acct_7aa411ae5ab947feba989fe9f63f7a60", folder_id: "1Aue_n68B6AemzZxYfjxjtnJ8Gl_-tryE" },
  // …add the rest of the roster as their folders are created & shared.
];

// ── Tunables ───────────────────────────────────────────────────────

// How deep to dig into nested subfolders. Your model folder is depth 0,
// a "script" folder inside it is depth 1, a folder inside that is depth
// 2, etc. 10 is far more nesting than anyone needs; it's just a guard so
// a weird shortcut loop can't make the bot spin forever.
export const MAX_FOLDER_DEPTH = 10;

// Hard ceiling per file. GitHub Actions runners hold the whole file in
// memory during multipart upload, so a giant 4K master would OOM the
// job. Files larger than this are SKIPPED (logged + Telegram-flagged),
// never silently dropped. Raise if your runner has the headroom.
export const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB

// Max files to process per creator per run, so a backlog can't blow past
// the 5-min cron cadence. Leftovers are picked up on the next run.
export const MAX_FILES_PER_CREATOR_PER_RUN = 25;

// Only these get uploaded; everything else in the folder is ignored.
export const ALLOWED_MIME_PREFIXES = ["image/", "video/"];

// ── OnlyFans vault upload ──────────────────────────────────────────
// OnlyFans has NO "upload straight to vault" API. To make media persist
// in the vault we do the documented 3-step dance:
//   1. Upload the file to the OnlyFans CDN        → POST /media/upload
//   2. Attach it to a post scheduled FAR in the   → POST /posts
//      future (never publishes, no fan
//      notification, invisible to subscribers)
//   3. Delete that scheduled post                 → DELETE /posts/{id}
//      → OnlyFans keeps the media in the vault.
//
// Step 3 is the one we must never skip: a leftover scheduled post is the
// only thing that could ever go live. We retry the delete hard, and if it
// somehow still fails we report it loudly for manual cleanup (the post is
// scheduled ~10 months out, so there's a huge safety margin — it cannot
// publish in the meantime).

const OF_BASE = "https://app.onlyfansapi.com/api";

// Text on the throwaway staging post. Only ever visible for the split
// second before deletion; worded so a human who ever finds a leftover
// knows it's safe to delete.
const VAULT_POST_TEXT = "[auto vault staging — safe to delete]";

// How far in the future to schedule the throwaway post. Far enough that a
// leftover can't publish for months; well within OnlyFans' scheduling
// window (tested ~1yr ok). Computed at run time so it never drifts close.
function farFutureSchedule() {
  const d = new Date();
  d.setDate(d.getDate() + 300); // ~10 months out
  return d.toISOString().replace(/\.\d+Z$/, ".000Z");
}

async function ofErr(res) {
  try { return (await res.json())?.message ?? `HTTP ${res.status}`; }
  catch { return `HTTP ${res.status}`; }
}

// Returns { mediaId, postId, deleted }. Throws ONLY if the media never
// reached the vault (CDN upload or staging-post creation failed) — those
// are safe to retry. If the media DID reach the vault but the cleanup
// delete failed, it returns deleted:false (so the caller marks the file
// done — no duplicate re-upload — but alerts a human to remove the post).
export async function uploadToVault(accountId, bytes, filename, mimeType) {
  const OF_KEY = process.env.ONLYFANSAPI_KEY;
  if (!OF_KEY) throw new Error("ONLYFANSAPI_KEY missing");
  const H = { Authorization: `Bearer ${OF_KEY}` };

  // 1) Upload to CDN.
  const fd = new FormData();
  fd.set("file", new Blob([bytes], { type: mimeType || "application/octet-stream" }), filename);
  const up = await fetch(`${OF_BASE}/${accountId}/media/upload`, { method: "POST", headers: H, body: fd });
  if (!up.ok) throw new Error(`CDN upload failed for ${accountId}: ${await ofErr(up)}`);
  const mediaId = (await up.json())?.prefixed_id;
  if (!mediaId) throw new Error(`CDN upload returned no media id for ${accountId}`);

  // 2) Attach to a far-future scheduled post (never goes live).
  const post = await fetch(`${OF_BASE}/${accountId}/posts`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ text: VAULT_POST_TEXT, mediaFiles: [mediaId], scheduledDate: farFutureSchedule() }),
  });
  if (!post.ok) throw new Error(`vault staging post failed for ${accountId}: ${await ofErr(post)}`);
  const postId = (await post.json())?.data?.id;
  if (!postId) throw new Error(`vault staging post returned no id for ${accountId}`);
  // ← media is now in the vault from this point on.

  // 3) Delete the staging post. Retry hard — a leftover is the only risk.
  let deleted = false, lastErr = "";
  for (let i = 0; i < 4 && !deleted; i++) {
    try {
      const del = await fetch(`${OF_BASE}/${accountId}/posts/${postId}`, { method: "DELETE", headers: H });
      if (del.ok) { const j = await del.json(); if (j?.data?.success !== false) { deleted = true; break; } }
      lastErr = `HTTP ${del.status}`;
    } catch (e) { lastErr = e.message; }
    if (!deleted) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }

  return { mediaId, postId, deleted, deleteError: deleted ? null : lastErr };
}

// ── Telegram notify (optional) ─────────────────────────────────────
// Mirrors payout-bot's sendTelegram. No-ops (with a warn) if creds are
// absent, so the bot still runs fine without Telegram configured.
export const escHtml = (s) =>
  String(s).replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));

export async function sendTelegram(html, chatId) {
  const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TG_CHAT = chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!TG_TOKEN || !TG_CHAT) {
    console.warn("Telegram: token or chat ID missing — skipping send");
    return false;
  }
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TG_CHAT,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!r.ok) {
    console.warn("Telegram failed:", r.status, await r.text());
    return false;
  }
  return true;
}
