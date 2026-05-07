// Airtable REST API client.
//
// Authenticated with a Personal Access Token (PAT) stored in
// agency_settings.airtable_api_key. Browser-direct — Airtable's CORS allows
// it. PATs are scoped server-side: admins choose which bases + permissions
// the token gets when they create it at airtable.com/create/tokens.

import { supabase } from "@/integrations/supabase/client";

const API = "https://api.airtable.com/v0";
const META = "https://api.airtable.com/v0/meta";

export type AirtableField = {
  id: string;
  name: string;
  type: string;
  options?: unknown;
};
export type AirtableTable = {
  id: string;
  name: string;
  primaryFieldId: string;
  fields: AirtableField[];
};
export type AirtableBaseSchema = { tables: AirtableTable[] };

export type AirtableRecord = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

let cachedKey: string | null = null;
let cachedKeyAt = 0;

/** Returns the configured Airtable PAT or throws if missing. */
export async function getAirtableKey(force = false): Promise<string> {
  // Cache for 60s — agency_settings rarely changes
  if (!force && cachedKey && Date.now() - cachedKeyAt < 60_000) return cachedKey;
  const { data } = await supabase
    .from("agency_settings")
    .select("airtable_api_key")
    .maybeSingle();
  const key = data?.airtable_api_key?.trim();
  if (!key) {
    throw new Error("Airtable isn't connected — add a Personal Access Token in Settings → Integrations.");
  }
  cachedKey = key;
  cachedKeyAt = Date.now();
  return key;
}

async function airtableFetch(url: string, init: RequestInit = {}): Promise<unknown> {
  const key = await getAirtableKey();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string; type?: string } };
      if (parsed.error?.message) detail = `${parsed.error.type ?? ""}: ${parsed.error.message}`.trim();
    } catch { /* keep raw */ }
    throw new Error(`Airtable ${res.status}: ${detail || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── URL helpers ───────────────────────────────────────────────────────────

/**
 * Pulls the base ID out of any Airtable URL we know about — share, embed,
 * or interface URLs.
 */
export function extractBaseId(url: string): string | null {
  const m = url.match(/airtable\.com\/(?:embed\/)?(app[a-zA-Z0-9]+)/);
  return m?.[1] ?? null;
}

/** Loads the airtable_embeds rows so Bernard knows what bases the user has. */
export async function listKnownAirtableBases(): Promise<Array<{ embed_id: string; label: string; url: string; base_id: string | null; scope: string }>> {
  const { data } = await supabase
    .from("airtable_embeds")
    .select("id, label, url, scope")
    .order("scope")
    .order("display_order");
  return (data ?? []).map((row) => ({
    embed_id: row.id,
    label: row.label,
    url: row.url,
    scope: row.scope,
    base_id: extractBaseId(row.url),
  }));
}

// ── Schema (tables + fields) ──────────────────────────────────────────────

export async function getBaseSchema(baseId: string): Promise<AirtableBaseSchema> {
  const json = await airtableFetch(`${META}/bases/${encodeURIComponent(baseId)}/tables`);
  return json as AirtableBaseSchema;
}

// ── Records ───────────────────────────────────────────────────────────────

export type ListRecordsOptions = {
  /** Field name OR field ID. Caller resolves ambiguity. */
  filterByFormula?: string;
  maxRecords?: number;       // 1..100 per page
  pageSize?: number;
  view?: string;
  sortField?: string;
  sortDirection?: "asc" | "desc";
};

export async function listRecords(
  baseId: string,
  tableNameOrId: string,
  opts: ListRecordsOptions = {},
): Promise<AirtableRecord[]> {
  const params = new URLSearchParams();
  params.set("pageSize", String(Math.min(100, opts.pageSize ?? 25)));
  if (opts.maxRecords) params.set("maxRecords", String(opts.maxRecords));
  if (opts.filterByFormula) params.set("filterByFormula", opts.filterByFormula);
  if (opts.view) params.set("view", opts.view);
  if (opts.sortField) {
    params.set("sort[0][field]", opts.sortField);
    params.set("sort[0][direction]", opts.sortDirection ?? "asc");
  }
  const url = `${API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableNameOrId)}?${params.toString()}`;
  const json = await airtableFetch(url) as { records?: AirtableRecord[] };
  return json.records ?? [];
}

export async function createRecord(
  baseId: string,
  tableNameOrId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  const url = `${API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableNameOrId)}`;
  const json = await airtableFetch(url, {
    method: "POST",
    body: JSON.stringify({ fields, typecast: true }),
  }) as AirtableRecord;
  return json;
}

export async function updateRecord(
  baseId: string,
  tableNameOrId: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  const url = `${API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableNameOrId)}/${encodeURIComponent(recordId)}`;
  const json = await airtableFetch(url, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  }) as AirtableRecord;
  return json;
}
