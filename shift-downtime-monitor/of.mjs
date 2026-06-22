// OnlyFans API helpers for the Shift Downtime Monitor.
//
// Deliberately tiny — just the one thing the monitor needs: list a chat's
// most recent threads and tell, per thread, whether the FAN sent the last
// message (i.e. the chatter hasn't replied yet) and when.
//
// IMPORTANT — the live OF API has NO `sentBy`/`isFromUser` field on
// lastMessage. The reliable "fan sent last" signal is
//   lastMessage.fromUser.id === fan.id
// When the creator sent last, fromUser.id is the creator's constant OF user
// id. `_view` is always "i" and unreadMessagesCount can be 0 even on a
// fan-last thread, so neither is usable. (The repo's src/lib/of-api.ts gets
// this wrong — it labels every message "creator". Tracked separately.)
//
// This propagation was verified live: a chatter's Infloww reply surfaces here
// — lastMessage flips fan→creator — within ~3-19s, far under the 5-min SLA.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const BASE = "https://app.onlyfansapi.com/api";

// OF key: env ONLYFANSAPI_KEY (CI) else VITE_ONLYFANSAPI_KEY in .env (local).
export function loadOfKey() {
  if (process.env.ONLYFANSAPI_KEY) return process.env.ONLYFANSAPI_KEY;
  try {
    const env = readFileSync(resolve(REPO_ROOT, ".env"), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^\s*(VITE_ONLYFANSAPI_KEY|ONLYFANSAPI_KEY)\s*=\s*(.+)\s*$/);
      if (m) return m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch { /* no .env */ }
  return null;
}

const OF_KEY = loadOfKey();

async function ofGet(path) {
  if (!OF_KEY) throw new Error("No OF key (ONLYFANSAPI_KEY / VITE_ONLYFANSAPI_KEY)");
  const url = path.startsWith("http") ? path : `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${OF_KEY}`, Accept: "application/json" },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    const err = new Error(`HTTP ${r.status} on ${path} — ${text.slice(0, 160)}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

// Normalise the /chats payload across the two shapes the live API uses and
// resolve who sent the last message via fromUser.id === fan.id.
function normaliseChats(json) {
  const list = Array.isArray(json) ? json
    : Array.isArray(json?.data) ? json.data
    : Array.isArray(json?.data?.list) ? json.data.list
    : Array.isArray(json?.list) ? json.list
    : [];
  const out = [];
  for (const raw of list) {
    const fanRaw = raw?.fan ?? raw?.withUser;
    if (!fanRaw || typeof fanRaw.id !== "number") continue;
    const lm = raw?.lastMessage;
    if (!lm) continue;
    const sentBy = typeof lm.sentBy === "string"
      ? (lm.sentBy === "fan" ? "fan" : "creator")
      : (lm.fromUser && typeof lm.fromUser.id === "number")
        ? (lm.fromUser.id === Number(fanRaw.id) ? "fan" : "creator")
        : (lm.isFromUser === true ? "fan" : "creator");
    out.push({
      fanId: Number(fanRaw.id),
      fanUsername: String(fanRaw.username ?? fanRaw.name ?? fanRaw.id),
      // The "fan" is actually another CREATOR (e.g. a mass-DM from a page the
      // creator is subbed to) when OF flags them as a performer / earner. The
      // chatter isn't expected to reply to those, so we don't flag them.
      fanIsCreator: fanRaw.isPerformer === true || fanRaw.isRealPerformer === true || fanRaw.canEarn === true,
      lastMessage: {
        id: Number(lm.id ?? 0),
        text: typeof lm.text === "string" ? lm.text.replace(/<[^>]+>/g, "").trim() : "",
        createdAt: typeof lm.createdAt === "string" ? lm.createdAt : "",
        sentBy,
      },
    });
  }
  return out;
}

// Every OF account on this API key, normalised. The /accounts endpoint
// returns a bare array (sometimes an object keyed by index), so we coerce.
// `authenticated` false = connected but needs re-auth (can't read its chats).
export async function listAccounts() {
  const json = await ofGet("/accounts");
  const raw = Array.isArray(json) ? json
    : Array.isArray(json?.data) ? json.data
    : (json && typeof json === "object") ? Object.values(json) : [];
  return raw
    .filter((a) => a && typeof a === "object" && a.id && a.onlyfans_username)
    .map((a) => ({
      accountId: a.id,
      username: a.onlyfans_username,
      name: a.display_name || a.onlyfans_username,
      authenticated: a.is_authenticated === true,
    }));
}

// Return the account's most recent chat threads (normalised). Single page —
// the monitor only cares about recent activity, and the OF API returns chats
// newest-activity-first.
export async function listChats(accountId, { limit = 100 } = {}) {
  const json = await ofGet(`/${accountId}/chats?limit=${limit}`);
  return normaliseChats(json);
}

// Recent money transactions (purchases / tips / subs) for an account, newest
// first. Used for whale-handling flags. Each: who spent, how much, when, on what.
export async function listTransactions(accountId, { limit = 20 } = {}) {
  const json = await ofGet(`/${accountId}/transactions?limit=${limit}`);
  const raw = Array.isArray(json) ? json
    : Array.isArray(json?.data) ? json.data
    : Array.isArray(json?.data?.list) ? json.data.list
    : Array.isArray(json?.list) ? json.list : [];
  return raw.map((t) => {
    const u = t.user ?? {};
    const dd = t.descriptionDetails ?? {};
    const url = dd?.params?.URL ? String(dd.params.URL) : "";
    const username = url ? url.split("/").filter(Boolean).pop() : String(u.username ?? "");
    return {
      id: String(t.id ?? `${u.id ?? "x"}-${t.createdAt ?? ""}`),
      type: String(dd.type ?? t.type ?? "purchase"), // message (PPV) | tip | subscribe | stream | post
      amount: Number(t.amount ?? 0),
      createdAt: typeof t.createdAt === "string" ? t.createdAt : "",
      fanId: u.id != null ? String(u.id) : "",
      fanUsername: username,
      fanName: String(dd?.params?.NAME ?? u.name ?? username ?? u.id ?? "fan"),
    };
  }).filter((t) => t.createdAt && t.amount > 0);
}

// Of an account's threads, the ones where the fan sent last (unanswered),
// each with its wait age in seconds, sorted oldest-wait first.
export function unansweredThreads(chats, now = Date.now()) {
  return chats
    .filter((c) => c.lastMessage.sentBy === "fan" && c.lastMessage.createdAt)
    .map((c) => ({
      fanId: c.fanId,
      fanUsername: c.fanUsername,
      fanIsCreator: c.fanIsCreator,
      fanMessageAt: c.lastMessage.createdAt,
      text: c.lastMessage.text,
      waitedSeconds: Math.max(0, Math.round((now - Date.parse(c.lastMessage.createdAt)) / 1000)),
    }))
    .sort((a, b) => b.waitedSeconds - a.waitedSeconds);
}
