// OnlyFans API (app.onlyfansapi.com) typed client.
//
// Single source of truth for every direct call to the OF API surface.
// All routes / pages should go through these functions instead of
// inlining `fetch("https://app.onlyfansapi.com/...")`. That way:
//   • Typing flows through to the UI
//   • Auth header is centralized
//   • Pagination is uniform
//   • Errors get a consistent shape that the UI can toast on
//
// The API is REST, base URL https://app.onlyfansapi.com/api, auth via
// `Authorization: Bearer <key>`. Per-creator endpoints take an account
// id from /api/accounts → /api/{account}/...
//
// Pagination convention: most list endpoints take ?limit + ?offset, or
// return a `_pagination.next_page` URL we follow. Both are handled by
// the helpers below.

const BASE = "https://app.onlyfansapi.com/api";

// ── Errors ───────────────────────────────────────────────────────────

export class OfApiError extends Error {
  status: number;
  endpoint: string;
  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.status = status;
    this.endpoint = endpoint;
  }
}

// ── Internals ────────────────────────────────────────────────────────

function getApiKey(explicit?: string): string {
  if (explicit) return explicit;
  // Vite injects VITE_ vars at build time — the user already has this
  // set in .env per the existing /onlyfans page.
  const fromEnv = (import.meta.env.VITE_ONLYFANSAPI_KEY as string | undefined) ?? "";
  if (!fromEnv) throw new OfApiError("VITE_ONLYFANSAPI_KEY not set in .env", 0, "");
  return fromEnv;
}

async function ofFetch<T = unknown>(
  path: string,
  opts: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; key?: string } = {},
): Promise<T> {
  const key = getApiKey(opts.key);
  const url = path.startsWith("http") ? path : `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = (j as { message?: string; error?: string }).message
        ?? (j as { error?: string }).error
        ?? detail;
    } catch { /* ignore */ }
    throw new OfApiError(detail, res.status, path);
  }
  return (await res.json()) as T;
}

/**
 * Auto-paginate up to `maxPages` pages. Many OF endpoints return
 *   { data: { list: T[] }, _pagination: { next_page: "..." } }
 * Some return a flat array. This helper handles both.
 */
async function ofPaginate<T>(
  initialPath: string,
  opts?: { maxPages?: number; key?: string },
): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = initialPath;
  let pages = 0;
  const max = opts?.maxPages ?? 8;
  while (next && pages < max) {
    const json = await ofFetch<unknown>(next, { key: opts?.key });
    const j = json as {
      data?: { list?: T[] } | T[];
      list?: T[];
      _pagination?: { next_page?: string };
    };
    const list: T[] = Array.isArray(j.data)
      ? j.data
      : Array.isArray(j) ? (j as T[])
      : (j.data && Array.isArray((j.data as { list?: T[] }).list))
        ? ((j.data as { list: T[] }).list)
        : Array.isArray(j.list) ? j.list : [];
    out.push(...list);
    next = j._pagination?.next_page ?? null;
    pages++;
  }
  return out;
}

// Some endpoints return { data: { ... } } and some return a bare object.
// This unwraps either shape into T.
function unwrap<T>(json: unknown): T {
  const j = json as { data?: T };
  return (j && j.data !== undefined ? j.data : json) as T;
}

// The live OF API returns message `text` as HTML, e.g.
// "<p>lowkey you subbed at the Perfect time😅</p>". The UI renders text as
// plain strings, so we strip tags and decode the handful of HTML entities
// OF actually emits before handing text to the normalisers. Mirrors the
// `.replace(/<[^>]+>/g, "")` cleanup in shift-downtime-monitor/probe-of-sync.mjs.
function cleanMessageText(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw
    .replace(/<[^>]+>/g, "")        // drop HTML tags (<p>, <br>, <a …>, …)
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")         // decode &amp; last so &amp;lt; → &lt;, not <
    .replace(/\s+/g, " ")           // collapse the whitespace tags left behind
    .trim();
  return cleaned;
}

// ── Account-level ────────────────────────────────────────────────────

export type OfAccount = {
  id: string;
  onlyfans_username: string;
  onlyfans_display_name?: string;
  onlyfans_user_id?: number;
  state?: string;
};

export async function listAccounts(key?: string): Promise<OfAccount[]> {
  const json = await ofFetch<unknown>("/accounts", { key });
  // API returns { data: [...] } or [...] depending on version
  const j = json as { data?: OfAccount[] } | OfAccount[];
  return Array.isArray(j) ? j : (j.data ?? []);
}

export async function findAccountByUsername(
  username: string,
  key?: string,
): Promise<OfAccount | null> {
  const accs = await listAccounts(key);
  const lower = username.toLowerCase();
  return accs.find((a) => a.onlyfans_username?.toLowerCase() === lower) ?? null;
}

// ── Profile / earnings / statistics ──────────────────────────────────

export type OfProfile = {
  id?: number;
  username?: string;
  name?: string;
  about?: string;
  subscribePrice?: number;
  postsCount?: number;
  photosCount?: number;
  videosCount?: number;
  audiosCount?: number;
  favoritesCount?: number;
  subscribersCount?: number;
  avatar?: string;
  header?: string;
};

export async function getProfile(accountId: string, key?: string): Promise<OfProfile> {
  return unwrap<OfProfile>(await ofFetch(`/${accountId}`, { key }));
}

export type OfEarnings = {
  total?: number;
  subscriptions?: number;
  posts?: number;
  messages?: number;
  tips?: number;
  referrals?: number;
  streams?: number;
};

export async function getEarnings(accountId: string, key?: string): Promise<OfEarnings> {
  return unwrap<OfEarnings>(await ofFetch(`/${accountId}/earnings`, { key }));
}

export type OfTransaction = {
  id: number;
  amount: number;
  net: number;
  fee?: number;
  type: string;        // "tip" | "subscription" | "post" | "message" | etc
  description?: string;
  createdAt: string;
  user?: { id: number; username: string; name?: string };
};

export async function listTransactions(
  accountId: string,
  opts?: { limit?: number; offset?: number; key?: string; maxPages?: number },
): Promise<OfTransaction[]> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return ofPaginate<OfTransaction>(`/${accountId}/transactions?limit=${limit}&offset=${offset}`, opts);
}

export async function getStatistics(
  accountId: string,
  opts?: { from?: string; to?: string; key?: string },
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  const q = params.toString();
  return unwrap<Record<string, unknown>>(
    await ofFetch(`/${accountId}/statistics${q ? `?${q}` : ""}`, { key: opts?.key }),
  );
}

// ── Fans / subscribers ───────────────────────────────────────────────

export type OfFan = {
  id: number;
  username: string;
  name?: string;
  avatar?: string;
  isOnline?: boolean;
  subscribedBy?: string;     // ISO
  subscribedUntil?: string;  // ISO
  totalSpent?: number;
  // OF nests recent activity differently — this shape covers what
  // the agency dashboard usually cares about.
};

export type FansFilter = "all" | "active" | "expired" | "latest";

export async function listFans(
  accountId: string,
  opts?: { filter?: FansFilter; limit?: number; offset?: number; key?: string; maxPages?: number },
): Promise<OfFan[]> {
  const filter = opts?.filter ?? "all";
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  // Filter routes: /fans, /fans/active, /fans/expired, /fans/latest
  const sub = filter === "all" ? "" : `/${filter}`;
  return ofPaginate<OfFan>(`/${accountId}/fans${sub}?limit=${limit}&offset=${offset}`, opts);
}

// ── Chats / messaging ────────────────────────────────────────────────
//
// OnlyFansAPI's actual response uses these field names:
//   GET /api/{account}/chats          → { data: [{ fan, lastMessage, unreadMessagesCount }] }
//   GET /api/{account}/chats/{id}/messages → { data: [{ id, text, fromUser, isSentByMe, chatUserId, ... }] }
//
// Neither endpoint returns a `sentBy`/`isFromUser` sender flag. Who sent a
// message is derived from ids: a message is fan-sent iff its `fromUser.id`
// equals the chat's fan id (`fan.id` for /chats, `chatUserId` for the
// messages endpoint); the messages endpoint also exposes an explicit
// `isSentByMe` boolean. Older docs / older accounts used `withUser` /
// `unreadMessagesCount` / `isFromUser` / `sentBy`; the normalisers below
// map every shape onto a single internal type (with `sentBy` "fan"|"creator")
// so consumers don't have to care which version of the API is responding.
// The `chat_id` path parameter for the messages endpoint accepts the fan's
// user id (data.fan.id) — the OF API treats them as interchangeable.

export type OfChat = {
  id: number;
  // Renamed from `withUser` to match the live API. The fan we're
  // chatting with — their user id is also the chat's id for the
  // messages endpoint.
  fan: { id: number; username: string; name?: string; avatar?: string; isOnline?: boolean };
  lastMessage?: { id: number; text?: string; createdAt: string; sentBy?: "fan" | "creator" };
  unreadCount?: number;
  isPinned?: boolean;
};

function normaliseChat(raw: unknown): OfChat | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // Pull whichever shape is present — `fan` (current API) or
  // `withUser` (legacy / older accounts).
  const fanRaw = (r.fan ?? r.withUser) as Record<string, unknown> | undefined;
  if (!fanRaw || typeof fanRaw.id !== "number") return null;
  const lastRaw = r.lastMessage as Record<string, unknown> | undefined;
  let lastMessage: OfChat["lastMessage"];
  if (lastRaw) {
    // The LIVE OF API's `lastMessage` carries neither `sentBy` nor
    // `isFromUser` — it has `fromUser: { id }`. The fan sent the last
    // message iff that id matches the fan we're chatting with; otherwise
    // it's the creator (whose OF user id is a different constant). `_view`
    // is not a discriminator and `unreadMessagesCount` can be 0 even on a
    // fan-last thread, so neither is usable. We keep the legacy
    // `sentBy`/`isFromUser` checks as fallbacks for any older account shape.
    const lmFrom = lastRaw.fromUser as { id?: unknown } | undefined;
    const sentBy: "fan" | "creator" =
      typeof lastRaw.sentBy === "string"
        ? (lastRaw.sentBy === "fan" ? "fan" : "creator")
        : (lmFrom && typeof lmFrom.id === "number")
          ? (lmFrom.id === Number(fanRaw.id) ? "fan" : "creator")
          : (lastRaw.isFromUser === true ? "fan" : "creator");
    lastMessage = {
      id: Number(lastRaw.id ?? 0),
      text: cleanMessageText(lastRaw.text),
      createdAt: typeof lastRaw.createdAt === "string" ? lastRaw.createdAt : "",
      sentBy,
    };
  }
  return {
    id: Number(r.id ?? fanRaw.id),
    fan: {
      id: Number(fanRaw.id),
      username: String(fanRaw.username ?? ""),
      name: typeof fanRaw.name === "string" ? fanRaw.name : undefined,
      avatar: typeof fanRaw.avatar === "string" ? fanRaw.avatar : undefined,
      isOnline: typeof fanRaw.isOnline === "boolean" ? fanRaw.isOnline : undefined,
    },
    lastMessage,
    unreadCount: Number(r.unreadCount ?? r.unreadMessagesCount ?? 0) || undefined,
    isPinned: typeof r.isPinned === "boolean" ? r.isPinned : undefined,
  };
}

export async function listChats(
  accountId: string,
  opts?: { limit?: number; offset?: number; unreadOnly?: boolean; key?: string; maxPages?: number },
): Promise<OfChat[]> {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  if (opts?.unreadOnly) params.set("filter", "unread");
  const q = params.toString();
  const raw = await ofPaginate<unknown>(`/${accountId}/chats${q ? `?${q}` : ""}`, opts);
  return raw.map(normaliseChat).filter((c): c is OfChat => c !== null);
}

export type OfChatMessage = {
  id: number;
  text?: string;
  // "fan" = sent by the fan, "creator" = sent by the creator.
  // Derived by normaliseMessage from the live API's `isSentByMe` /
  // `fromUser.id` (the raw payload has no `sentBy` field).
  sentBy: "fan" | "creator";
  createdAt: string;
  price?: number;             // PPV price if any
  tip?: number;               // tip amount included in the message
  isOpened?: boolean;
  media?: Array<{ id: number; type: string; src?: string; thumb?: string }>;
};

function normaliseMessage(raw: unknown): OfChatMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // The LIVE OF API's message objects have neither `sentBy` nor
  // `isFromUser`. They expose `isSentByMe` (true → the creator sent it)
  // plus `fromUser.id` and `chatUserId` (the fan's id). Prefer the
  // explicit boolean, then compare the sender id to the chat's fan id,
  // then fall back to the legacy fields for any older account shape.
  const from = r.fromUser as { id?: unknown } | undefined;
  const sentBy: "fan" | "creator" =
    typeof r.sentBy === "string"
      ? (r.sentBy === "fan" ? "fan" : "creator")
      : typeof r.isSentByMe === "boolean"
        ? (r.isSentByMe ? "creator" : "fan")
        : (from && typeof from.id === "number" && typeof r.chatUserId === "number")
          ? (from.id === r.chatUserId ? "fan" : "creator")
          : (r.isFromUser === true ? "fan" : "creator");
  const mediaRaw = r.media as Array<Record<string, unknown>> | undefined;
  const media = Array.isArray(mediaRaw) ? mediaRaw.map((m) => ({
    id: Number(m.id ?? 0),
    type: String(m.type ?? "photo"),
    src: typeof m.src === "string" ? m.src : (typeof m.url === "string" ? m.url : undefined),
    thumb: typeof m.thumb === "string" ? m.thumb : (typeof m.preview === "string" ? m.preview : undefined),
  })) : undefined;
  return {
    id: Number(r.id ?? 0),
    text: cleanMessageText(r.text),
    sentBy,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
    price: typeof r.price === "number" ? r.price : undefined,
    tip: typeof r.tip === "number" ? r.tip : undefined,
    isOpened: typeof r.isOpened === "boolean" ? r.isOpened : undefined,
    media,
  };
}

export async function listChatMessages(
  accountId: string,
  fanUserId: number,
  opts?: { limit?: number; key?: string; maxPages?: number },
): Promise<OfChatMessage[]> {
  const limit = opts?.limit ?? 100;
  const raw = await ofPaginate<unknown>(`/${accountId}/chats/${fanUserId}/messages?limit=${limit}`, opts);
  return raw.map(normaliseMessage).filter((m): m is OfChatMessage => m !== null);
}

export type SendMessageInput = {
  text: string;
  // Optional: paid media unlock
  price?: number;
  // OF media ids returned by uploadMedia / listVaultMedia
  mediaIds?: number[];
  // For one-time PPV with locked preview
  lockedText?: boolean;
};

export async function sendChatMessage(
  accountId: string,
  fanUserId: number,
  input: SendMessageInput,
  key?: string,
): Promise<{ id?: number; ok: true }> {
  await ofFetch(`/${accountId}/chats/${fanUserId}/messages`, {
    method: "POST",
    body: {
      text: input.text,
      price: input.price ?? 0,
      mediaFiles: input.mediaIds ?? [],
      lockedText: input.lockedText ?? false,
    },
    key,
  });
  return { ok: true };
}

// ── Mass messaging ───────────────────────────────────────────────────

export type MassMessageRecipient =
  | { type: "all" }                              // every active sub
  | { type: "active" }
  | { type: "expired" }
  | { type: "list"; listId: number }             // a custom OF list
  | { type: "userIds"; userIds: number[] };      // explicit fan ids

export type MassMessageInput = {
  text: string;
  price?: number;
  mediaIds?: number[];
  recipient: MassMessageRecipient;
  // Schedule for future delivery; omit to send immediately
  scheduledAt?: string; // ISO
};

export async function sendMassMessage(
  accountId: string,
  input: MassMessageInput,
  key?: string,
): Promise<{ id?: number; ok: true }> {
  const body: Record<string, unknown> = {
    text: input.text,
    price: input.price ?? 0,
    mediaFiles: input.mediaIds ?? [],
  };
  // Recipient mapping — OF API uses different keys per audience type
  switch (input.recipient.type) {
    case "all":     body.toUserType = "active"; break;
    case "active":  body.toUserType = "active"; break;
    case "expired": body.toUserType = "expired"; break;
    case "list":    body.lists = [input.recipient.listId]; break;
    case "userIds": body.userIds = input.recipient.userIds; break;
  }
  if (input.scheduledAt) body.scheduledDate = input.scheduledAt;
  await ofFetch(`/${accountId}/queue/messages`, {
    method: "POST",
    body,
    key,
  });
  return { ok: true };
}

export async function listQueuedMessages(
  accountId: string,
  opts?: { key?: string; maxPages?: number },
): Promise<Array<{ id: number; text?: string; scheduledDate?: string; status?: string; createdAt?: string }>> {
  return ofPaginate(`/${accountId}/queue/messages`, opts);
}

// ── Vault (media library) ────────────────────────────────────────────

export type OfVaultMedia = {
  id: number;
  type: "photo" | "video" | "audio";
  src?: string;
  thumb?: string;
  preview?: string;
  duration?: number;
  createdAt?: string;
  size?: number;
};

export async function listVaultMedia(
  accountId: string,
  opts?: { type?: "photo" | "video"; limit?: number; offset?: number; key?: string; maxPages?: number },
): Promise<OfVaultMedia[]> {
  const params = new URLSearchParams();
  if (opts?.type) params.set("type", opts.type);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const q = params.toString();
  return ofPaginate<OfVaultMedia>(`/${accountId}/vault/media${q ? `?${q}` : ""}`, opts);
}

export type OfVaultList = {
  id: number;
  name: string;
  mediaCount?: number;
  type?: string;
};

export async function listVaultLists(accountId: string, key?: string): Promise<OfVaultList[]> {
  return ofPaginate<OfVaultList>(`/${accountId}/vault/lists`, { key });
}

export async function uploadMedia(
  accountId: string,
  file: File,
  key?: string,
): Promise<{ id: number; url?: string }> {
  // Multipart upload — content-type set by FormData, NOT JSON
  const apiKey = getApiKey(key);
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch(`${BASE}/${accountId}/vault/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json() as { message?: string }).message ?? msg; } catch { /* ignore */ }
    throw new OfApiError(msg, res.status, `/${accountId}/vault/media`);
  }
  const j = (await res.json()) as { data?: { id: number; url?: string }; id?: number };
  return j.data ?? (j as { id: number; url?: string });
}

// ── Posts ────────────────────────────────────────────────────────────

export type OfPost = {
  id: number;
  text?: string;
  rawText?: string;
  createdAt: string;
  postedAt?: string;
  isPinned?: boolean;
  price?: number;
  likesCount?: number;
  commentsCount?: number;
  tipsAmount?: number;
  media?: Array<{ id: number; type: string; src?: string; thumb?: string }>;
};

export async function listPosts(
  accountId: string,
  opts?: { limit?: number; offset?: number; key?: string; maxPages?: number },
): Promise<OfPost[]> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return ofPaginate<OfPost>(`/${accountId}/posts?limit=${limit}&offset=${offset}`, opts);
}

export async function listScheduledPosts(
  accountId: string,
  opts?: { key?: string; maxPages?: number },
): Promise<OfPost[]> {
  return ofPaginate<OfPost>(`/${accountId}/posts/scheduled`, opts);
}

// ── Lists (custom fan segments) ──────────────────────────────────────

export type OfList = {
  id: number;
  name: string;
  usersCount?: number;
  type?: string;
};

export async function listLists(accountId: string, key?: string): Promise<OfList[]> {
  return ofPaginate<OfList>(`/${accountId}/lists`, { key });
}

// ── Tracking links (already used elsewhere; expose for completeness) ─

export type OfTrackingLink = {
  campaignCode: number;
  campaignUrl: string;
  name?: string;
  clicksCount: number;
  subscribersCount: number;
  spendersCount: number;
  revenue: { total: number; revenuePerSubscriber: number; spendersCount: number };
};

export async function listTrackingLinks(
  accountId: string,
  opts?: { key?: string; maxPages?: number },
): Promise<OfTrackingLink[]> {
  return ofPaginate<OfTrackingLink>(`/${accountId}/tracking-links`, opts);
}

// ── Payouts ──────────────────────────────────────────────────────────

export async function requestManualPayout(accountId: string, key?: string): Promise<{ ok: true }> {
  await ofFetch(`/${accountId}/payouts/manual`, { method: "POST", key });
  return { ok: true };
}

// ── Public creator search ────────────────────────────────────────────

export type OfPublicCreator = {
  id: number;
  username: string;
  name?: string;
  avatar?: string;
  about?: string;
  subscribersCount?: number;
  postsCount?: number;
  isVerified?: boolean;
};

export async function searchPublicCreators(
  query: string,
  opts?: { limit?: number; key?: string },
): Promise<OfPublicCreator[]> {
  const params = new URLSearchParams({ query, limit: String(opts?.limit ?? 25) });
  const json = await ofFetch<unknown>(`/search?${params.toString()}`, { key: opts?.key });
  const j = json as { data?: OfPublicCreator[] } | OfPublicCreator[];
  return Array.isArray(j) ? j : (j.data ?? []);
}
