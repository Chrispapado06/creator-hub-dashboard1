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

import { randomUUID } from "node:crypto";
import { AwsClient } from "aws4fetch";

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

// Hard ceiling per file = OnlyFans' documented upload limit (1 GB via the
// file_url path). Files larger than this can't be uploaded by any method,
// so the bot records + flags them once and never retries (no per-run spam).
export const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB (OnlyFans' max)

// The direct multipart upload (pushing bytes through Cloudflare) is capped
// at 100 MB by Cloudflare. Anything at/above this goes the file_url route
// instead: stage to a private Cloudflare R2 bucket, hand OnlyFans a short-lived
// signed URL, and let it pull the file itself (supports up to MAX_BYTES).
// 90 MB keeps a safety margin below the 100 MB Cloudflare wall.
export const CDN_DIRECT_MAX_BYTES = 90 * 1024 * 1024; // 90 MB

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

// Transient errors that warrant a retry. 502/503/504 = upstream CDN
// hiccup (most common in the wild), 429 = rate limit. Anything else
// (incl. 413 = file too big, 401 = bad token, 4xx = malformed) is
// permanent for THIS file — we surface it immediately.
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);

async function postWithRetry(url, init, attempts = 4) {
  let last;
  for (let i = 0; i < attempts; i++) {
    const r = await fetch(url, init);
    if (r.ok || !TRANSIENT_STATUSES.has(r.status)) return r;
    last = r;
    // Exponential backoff with jitter — 2s, 4s, 8s. Reads Retry-After
    // header on 429 if Cloudflare/OF send one.
    const ra = Number(r.headers.get("retry-after"));
    const delay = Number.isFinite(ra) && ra > 0
      ? ra * 1000
      : (1000 * Math.pow(2, i + 1)) + Math.floor(Math.random() * 500);
    await new Promise((res) => setTimeout(res, delay));
  }
  return last;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Large-file staging (Cloudflare R2 presigned URLs) ──────────────
// OnlyFans' direct upload caps at 100 MB (Cloudflare). For bigger files we
// hand OnlyFans a URL to pull from instead. Since the content is private,
// that URL must NOT be public — we stage the file in a private Cloudflare R2
// bucket and mint a short-lived PRESIGNED URL (expires in 1h), then delete
// the temp copy as soon as OnlyFans has finished fetching it. R2 is used
// because its egress is free (OnlyFans' download costs nothing) and it has a
// generous free tier.
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "vault-staging";
const R2_ENDPOINT = R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "";

export function stagingConfigured() {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

let _r2;
function r2Client() {
  if (!_r2) {
    _r2 = new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto", // R2 ignores region but the SigV4 signer needs one
    });
  }
  return _r2;
}

const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

// CreateBucket is idempotent on R2: 200 first time, 409 thereafter. We do it
// once per run so a missing bucket self-heals without a dashboard step.
async function ensureStagingBucket(r2) {
  const r = await fetch(await r2.sign(`${R2_ENDPOINT}/${R2_BUCKET}`, { method: "PUT" }));
  if (r.ok || r.status === 409) return;
  const body = await r.text();
  if (/BucketAlreadyOwnedByYou|BucketAlreadyExists/i.test(body)) return;
  throw new Error(`R2 bucket ensure failed: HTTP ${r.status} ${body.slice(0, 150)}`);
}

// Upload bytes to R2 and return { url, cleanup }. url is a 1h presigned GET.
// cleanup() deletes the temp object and never throws (best-effort).
async function stageToSignedUrl(bytes, filename, mimeType) {
  const r2 = r2Client();
  await ensureStagingBucket(r2);
  const safe = String(filename).replace(/[^\w.\-]+/g, "_").slice(-120) || "file";
  const objectUrl = `${R2_ENDPOINT}/${R2_BUCKET}/${enc(`${randomUUID()}/${safe}`)}`;

  const remove = async () => {
    try { await fetch(await r2.sign(objectUrl, { method: "DELETE" })); }
    catch { /* the 1h presigned-URL expiry is the backstop */ }
  };

  // PUT the object, retrying transient 5xx/429. UNSIGNED-PAYLOAD avoids hashing
  // the whole multi-hundred-MB buffer (the header tells SigV4 to skip it).
  let put;
  for (let i = 0; i < 4; i++) {
    const req = await r2.sign(objectUrl, {
      method: "PUT",
      headers: { "Content-Type": mimeType || "application/octet-stream", "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD" },
      body: bytes,
    });
    try { put = await fetch(req); } catch (e) { put = { ok: false, status: 0, text: async () => e.message }; }
    if (put.ok || !TRANSIENT_STATUSES.has(put.status)) break;
    await sleep(2000 * (i + 1));
  }
  if (!put.ok) throw new Error(`R2 staging upload failed: HTTP ${put.status} ${(await put.text()).slice(0, 150)}`);

  // Object now EXISTS — any failure below must delete it before throwing,
  // or we leak a multi-hundred-MB blob (no cleanup handle reaches the caller).
  try {
    // Presigned GET, valid 1h. signQuery puts the signature in the query string
    // so OnlyFans can fetch with a plain GET, no auth headers.
    const signed = await r2.sign(`${objectUrl}?X-Amz-Expires=3600`, { method: "GET", aws: { signQuery: true } });
    return { url: signed.url, cleanup: remove };
  } catch (e) {
    await remove();
    throw e;
  }
}

// Async upload from a URL. OnlyFans downloads the file itself (no Cloudflare
// 100 MB wall), so we poll until it reports completed/failed. Returns the
// usable media id.
async function cdnUploadFromUrl(accountId, fileUrl, H) {
  const fd = new FormData();
  fd.set("file_url", fileUrl);
  fd.set("async", "true");
  const r = await postWithRetry(`${OF_BASE}/${accountId}/media/upload`, { method: "POST", headers: H, body: fd });
  if (!r.ok) throw new Error(`async CDN upload failed for ${accountId}: ${await ofErr(r)}`);
  // Fields are top-level on this endpoint (confirmed live), but unwrap a
  // `data` envelope too in case the API changes — matches of-api.ts's `data ?? j`.
  const j = await r.json();
  const d = j?.data ?? j;
  const mediaId = d?.prefixed_id;
  const pollUrl = d?.polling_url;
  if (!mediaId || !pollUrl) throw new Error(`async upload missing id/poll_url for ${accountId}: ${JSON.stringify(j).slice(0, 150)}`);

  const deadline = Date.now() + 25 * 60 * 1000; // 25 min — generous for a ~1 GB transcode
  let delay = 6000;
  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.3), 20000);
    let sr;
    try { sr = await fetch(pollUrl, { headers: H }); } catch { continue; }
    if (!sr.ok) continue; // transient — keep polling
    const sj = await sr.json().catch(() => ({}));
    if (sj.status === "completed") return mediaId;
    if (sj.status === "failed") throw new Error(`async upload failed for ${accountId}: ${sj.error || "unknown"}`);
    // pending / processing → keep polling
  }
  throw new Error(`async upload timed out for ${accountId} (>25 min)`);
}

// Push bytes directly through the CDN (≤100 MB). Synchronous.
async function cdnUploadDirect(accountId, bytes, filename, mimeType, H) {
  const fd = new FormData();
  fd.set("file", new Blob([bytes], { type: mimeType || "application/octet-stream" }), filename);
  const up = await postWithRetry(`${OF_BASE}/${accountId}/media/upload`, { method: "POST", headers: H, body: fd });
  if (!up.ok) throw new Error(`CDN upload failed for ${accountId}: ${await ofErr(up)}`);
  const uj = await up.json();
  const mediaId = (uj?.data ?? uj)?.prefixed_id;
  if (!mediaId) throw new Error(`CDN upload returned no media id for ${accountId}`);
  return mediaId;
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
  const size = bytes.length ?? bytes.byteLength ?? 0;

  // 1) Get the media onto OnlyFans. Small files push directly; big files go
  //    via a staged signed URL so they dodge the 100 MB Cloudflare cap.
  let mediaId;
  if (size <= CDN_DIRECT_MAX_BYTES) {
    mediaId = await cdnUploadDirect(accountId, bytes, filename, mimeType, H);
  } else {
    if (!stagingConfigured()) {
      throw new Error(
        `large file (${(size / 1e6).toFixed(0)} MB) needs R2 staging, but ` +
        `R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not set`);
    }
    const staged = await stageToSignedUrl(bytes, filename, mimeType);
    try {
      mediaId = await cdnUploadFromUrl(accountId, staged.url, H);
    } finally {
      await staged.cleanup(); // always remove the temp copy, success or not
    }
  }

  // 2) Attach to a far-future scheduled post (never goes live). Retry on
  //    5xx/429 like the upload — for big files a failure here would otherwise
  //    re-upload the whole file next run and orphan this CDN media.
  const post = await postWithRetry(`${OF_BASE}/${accountId}/posts`, {
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
