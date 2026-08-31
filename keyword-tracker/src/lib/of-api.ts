import "server-only";

// Minimal OnlyFans API client (https://app.onlyfansapi.com).
//
// Mirrors the auth + shapes the main dashboard already uses successfully:
//   • Base URL: https://app.onlyfansapi.com/api
//   • Auth:     Authorization: Bearer <ONLYFANS_API_KEY>
//
// NOTE: the brief mentioned an `x-api-key` header. The production dashboard
// authenticates with a Bearer token against this same API, so we use that here.
// If your key only works as x-api-key, swap the header in `ofFetch` below.

const BASE = "https://app.onlyfansapi.com/api";

export class OfApiError extends Error {
  status: number;
  endpoint: string;
  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = "OfApiError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

function apiKey(): string {
  const key = process.env.ONLYFANS_API_KEY;
  if (!key) throw new OfApiError("ONLYFANS_API_KEY is not set in .env.local", 0, "");
  return key;
}

async function ofFetch<T>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (e) {
    throw new OfApiError(`Network error reaching OnlyFans API: ${(e as Error).message}`, 0, path);
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.message || body?.error || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new OfApiError(detail, res.status, path);
  }
  return (await res.json()) as T;
}

// API list endpoints return either a bare array or { data: [...] }.
function unwrapList<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  const j = json as { data?: T[] };
  return j?.data ?? [];
}

export type OfAccount = {
  id: string;
  onlyfans_username: string;
};

/** All OF API accounts connected to this key. */
export async function listAccounts(): Promise<OfAccount[]> {
  return unwrapList<OfAccount>(await ofFetch("/accounts"));
}

/** Resolve a creator's OF account id from their username (case-insensitive). */
export async function findAccountByUsername(username: string): Promise<OfAccount | null> {
  const lower = username.toLowerCase();
  const accounts = await listAccounts();
  return accounts.find((a) => a.onlyfans_username?.toLowerCase() === lower) ?? null;
}

export type OfTrackingLink = {
  campaignCode: number | string;
  campaignUrl?: string;
  name?: string;
  clicksCount?: number;
  subscribersCount?: number;
  spendersCount?: number;
  revenue?: { total?: number; revenuePerSubscriber?: number; spendersCount?: number };
};

/**
 * GET /api/{account}/tracking-links — every tracking link for a creator with
 * its subscriber count and revenue rolled up by the OF API.
 */
export async function listTrackingLinks(accountId: string): Promise<OfTrackingLink[]> {
  return unwrapList<OfTrackingLink>(await ofFetch(`/${accountId}/tracking-links`));
}

/** GET /api/{account}/tracking-links/{id}/stats — detailed stats for one link. */
export async function getTrackingLinkStats(
  accountId: string,
  trackingLinkId: string,
): Promise<OfTrackingLink> {
  const json = await ofFetch<unknown>(`/${accountId}/tracking-links/${trackingLinkId}/stats`);
  const j = json as { data?: OfTrackingLink };
  return (j?.data ?? json) as OfTrackingLink;
}
