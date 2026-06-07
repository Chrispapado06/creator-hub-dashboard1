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
  { name: "Blue Bear",     account_id: "acct_99db42bda91149f58fd68ecccde21fa8", folder_id: "REPLACE_WITH_DRIVE_FOLDER_ID" },
  { name: "Meg",           account_id: "acct_996fbed6bab449af89f211b4851896ef", folder_id: "REPLACE_WITH_DRIVE_FOLDER_ID" },
  { name: "Emma",          account_id: "acct_9bae83ac547447798d39e2d816ecd339", folder_id: "REPLACE_WITH_DRIVE_FOLDER_ID" },
  { name: "Marissa Munoz", account_id: "acct_42e1c9678cfa4d379d44422a39ef7991", folder_id: "1x4T-jb2eElCilO8oi6Tfh_VAdqP4nYza" },
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
// Node port of src/lib/of-api.ts → uploadMedia(). Multipart POST; the
// Content-Type boundary is set automatically by FormData. Returns the
// new vault media id.
export async function uploadToVault(accountId, bytes, filename, mimeType) {
  const OF_KEY = process.env.ONLYFANSAPI_KEY;
  if (!OF_KEY) throw new Error("ONLYFANSAPI_KEY missing");

  const fd = new FormData();
  fd.set("file", new Blob([bytes], { type: mimeType || "application/octet-stream" }), filename);

  const res = await fetch(`https://app.onlyfansapi.com/api/${accountId}/vault/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${OF_KEY}` },
    body: fd,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json())?.message ?? msg; } catch { /* keep status */ }
    throw new Error(`OF vault upload failed for ${accountId}: ${msg}`);
  }
  const j = await res.json();
  const data = j?.data ?? j;
  return { id: data?.id, url: data?.url };
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
