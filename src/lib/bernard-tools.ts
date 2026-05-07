// Bernard's tool registry.
//
// Each tool has a JSON Schema describing its inputs (so Claude knows how to
// call it), a category that drives the confirmation UI, a label/blurb for
// the chat bubble, and an async handler that runs against Supabase or
// Airtable.
//
// Categories:
//   read         — pure query, executes silently
//   write        — mutates data, requires user approval before executing
//   destructive  — irreversible (deletes), requires approval + extra warning
//
// Adding a new tool:
//   1. Append to TOOLS below.
//   2. Update tools_for_anthropic() if you need to filter the manifest.
//   3. The chat UI auto-renders new tools — no UI changes needed.

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import {
  listKnownAirtableBases, getBaseSchema, listRecords as airtableListRecords,
  createRecord as airtableCreateRecord, updateRecord as airtableUpdateRecord,
} from "@/lib/airtable";
import { format, parseISO, addMonths } from "date-fns";

export type ToolCategory = "read" | "write" | "destructive";

export type Tool = {
  name: string;
  description: string;
  /** JSON Schema, sent to Anthropic so the model knows how to call this tool. */
  input_schema: Record<string, unknown>;
  category: ToolCategory;
  /** Short label shown in the chat bubble. */
  label: string;
  /** What this tool does, in one user-readable sentence — shown in the approval bubble. */
  blurb: string;
  /** Render a friendly summary of the call's input for the approval prompt. */
  describeCall?: (input: Record<string, unknown>) => string;
  handler: (input: Record<string, unknown>) => Promise<string>;
};

const num = (v: unknown, fallback?: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : (fallback ?? 0);
};
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const bool = (v: unknown, fallback = false): boolean => (typeof v === "boolean" ? v : fallback);

const getActor = (): string | null => {
  const raw = localStorage.getItem("agency_session");
  if (!raw) return null;
  try { return (JSON.parse(raw) as { username?: string })?.username ?? null; }
  catch { return raw; }
};

const slugify = (s: string): string =>
  s.toLowerCase().trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);

// ════════════════════════════════════════════════════════════════════════════
// READ tools
// ════════════════════════════════════════════════════════════════════════════

const tool_query_creators: Tool = {
  name: "query_creators",
  category: "read",
  label: "Search creators",
  blurb: "Look up creators in the roster.",
  description:
    "Lists creators in the agency, optionally filtered by name (case-insensitive substring match) or status. " +
    "Use this when the user asks about a creator by name. Returns id, name, of_username, and status for each match.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Optional substring to match against the creator's name." },
      status: { type: "string", enum: ["active", "paused", "inactive"], description: "Optional status filter." },
      limit: { type: "integer", description: "Max rows to return (default 25, max 100).", minimum: 1, maximum: 100 },
    },
  },
  handler: async (input) => {
    let q = supabase.from("creators").select("id, name, of_username, status, created_at");
    const name = str(input.name).trim();
    if (name) q = q.ilike("name", `%${name}%`);
    const status = str(input.status);
    if (status) q = q.eq("status", status);
    q = q.order("name").limit(Math.min(100, num(input.limit, 25)));
    const { data, error } = await q;
    if (error) return `Error: ${error.message}`;
    return JSON.stringify({ creators: data ?? [] });
  },
};

const tool_get_creator_detail: Tool = {
  name: "get_creator_detail",
  category: "read",
  label: "Read creator detail",
  blurb: "Fetch a creator's full record + landing page + recent revenue.",
  description:
    "Returns a creator's full record, their landing page (if any), and last-30-days revenue across all 3 buckets. " +
    "Pass `creator_id` (UUID) — call query_creators first if you only have a name.",
  input_schema: {
    type: "object",
    required: ["creator_id"],
    properties: {
      creator_id: { type: "string", description: "Creator UUID." },
    },
  },
  handler: async (input) => {
    const id = str(input.creator_id);
    const since = format(new Date(Date.now() - 30 * 86400000), "yyyy-MM-dd");
    const [{ data: c }, { data: landing }, { data: org }, { data: int }, { data: rev }, { data: ads }] = await Promise.all([
      supabase.from("creators").select("*").eq("id", id).maybeSingle(),
      supabase.from("creator_landing_pages").select("id, slug, custom_domain, is_published, is_verified").eq("creator_id", id).maybeSingle(),
      supabase.from("organic_entries").select("amount").eq("creator_id", id).gte("entry_date", since),
      supabase.from("internal_entries").select("amount").eq("creator_id", id).gte("entry_date", since),
      supabase.from("revenue_entries").select("amount").eq("creator_id", id).gte("entry_date", since),
      supabase.from("ad_campaigns").select("amount_spent, revenue_generated").eq("creator_id", id).gte("start_date", since),
    ]);
    if (!c) return `Error: creator ${id} not found.`;
    const sum = (rows: { amount?: number }[] | null) => (rows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
    const adRev = (ads ?? []).reduce((s, r) => s + (r.revenue_generated ?? 0), 0);
    const adSpend = (ads ?? []).reduce((s, r) => s + (r.amount_spent ?? 0), 0);
    return JSON.stringify({
      creator: c,
      landing,
      revenue_30d: {
        organic: sum(org),
        internal: sum(int),
        ads_onlyfinder: sum(rev),
        ads_meta_revenue: adRev,
        ads_meta_spend: adSpend,
        ads_net: sum(rev) + (adRev - adSpend),
      },
    });
  },
};

const tool_query_revenue: Tool = {
  name: "query_revenue",
  category: "read",
  label: "Query revenue",
  blurb: "Pull revenue figures for a window, optionally per creator.",
  description:
    "Returns total revenue across all 3 buckets (Organic, Internal, Ads) for the requested window. " +
    "Filter by creator_id to scope to one. Date inputs are ISO 8601 (yyyy-MM-dd).",
  input_schema: {
    type: "object",
    required: ["since"],
    properties: {
      since: { type: "string", description: "Start date inclusive — yyyy-MM-dd." },
      until: { type: "string", description: "End date inclusive — yyyy-MM-dd. Defaults to today." },
      creator_id: { type: "string", description: "Optional UUID to scope to a single creator." },
    },
  },
  handler: async (input) => {
    const since = str(input.since);
    const until = str(input.until) || format(new Date(), "yyyy-MM-dd");
    const cid = str(input.creator_id);
    const filter = (q: ReturnType<typeof supabase.from>) =>
      cid ? q.eq("creator_id", cid).gte("entry_date", since).lte("entry_date", until)
          : q.gte("entry_date", since).lte("entry_date", until);
    const filterAds = (q: ReturnType<typeof supabase.from>) =>
      cid ? q.eq("creator_id", cid).gte("start_date", since).lte("start_date", until)
          : q.gte("start_date", since).lte("start_date", until);
    const [{ data: org }, { data: int }, { data: rev }, { data: ads }] = await Promise.all([
      filter(supabase.from("organic_entries").select("amount, entry_date")),
      filter(supabase.from("internal_entries").select("amount, entry_date")),
      filter(supabase.from("revenue_entries").select("amount, entry_date")),
      filterAds(supabase.from("ad_campaigns").select("amount_spent, revenue_generated, start_date")),
    ]);
    const sum = (rows: unknown): number => (Array.isArray(rows) ? rows.reduce((s: number, r) => s + ((r as { amount?: number }).amount ?? 0), 0) : 0);
    const adRev = ((ads ?? []) as Array<{ revenue_generated?: number }>).reduce((s, r) => s + (r.revenue_generated ?? 0), 0);
    const adSpend = ((ads ?? []) as Array<{ amount_spent?: number }>).reduce((s, r) => s + (r.amount_spent ?? 0), 0);
    return JSON.stringify({
      window: { since, until, creator_id: cid || null },
      organic: sum(org),
      internal: sum(int),
      ads_onlyfinder: sum(rev),
      ads_meta_revenue: adRev,
      ads_meta_spend: adSpend,
      ads_net: sum(rev) + (adRev - adSpend),
      total: sum(org) + sum(int) + sum(rev) + (adRev - adSpend),
    });
  },
};

const tool_list_landing_pages: Tool = {
  name: "list_landing_pages",
  category: "read",
  label: "List landing pages",
  blurb: "Find existing landing pages.",
  description: "Lists all creator landing pages with their slug, custom domain, published status, and verified mark.",
  input_schema: {
    type: "object",
    properties: {
      creator_id: { type: "string", description: "Optional UUID — return only that creator's page." },
    },
  },
  handler: async (input) => {
    let q = supabase.from("creator_landing_pages").select("id, creator_id, slug, custom_domain, is_published, is_verified, display_name, tagline, created_at");
    const cid = str(input.creator_id);
    if (cid) q = q.eq("creator_id", cid);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) return `Error: ${error.message}`;
    return JSON.stringify({ landing_pages: data ?? [] });
  },
};

// ── Airtable read tools ─────────────────────────────────────────────────

const tool_airtable_list_bases: Tool = {
  name: "airtable_list_bases",
  category: "read",
  label: "List Airtable bases",
  blurb: "See which Airtable bases the agency has connected.",
  description:
    "Returns Airtable bases the user has registered in the dashboard (via airtable_embeds). " +
    "Each entry has: base_id (use this for other airtable_* tools), label, scope (which platform tab it's tied to). " +
    "Call this first when the user asks anything about Airtable.",
  input_schema: { type: "object", properties: {} },
  handler: async () => {
    const bases = await listKnownAirtableBases();
    return JSON.stringify({ bases });
  },
};

const tool_airtable_list_tables: Tool = {
  name: "airtable_list_tables",
  category: "read",
  label: "List Airtable tables",
  blurb: "See the tables + fields inside an Airtable base.",
  description:
    "Returns the schema (tables + fields) of an Airtable base. Pass base_id from airtable_list_bases. " +
    "Use the table id or name + field names for subsequent record operations.",
  input_schema: {
    type: "object",
    required: ["base_id"],
    properties: {
      base_id: { type: "string", description: "Airtable base ID — starts with 'app...'" },
    },
  },
  handler: async (input) => {
    const baseId = str(input.base_id);
    if (!baseId.startsWith("app")) return `Error: invalid base_id "${baseId}".`;
    const schema = await getBaseSchema(baseId);
    // Trim down so we don't burn tokens on field option payloads
    const trimmed = schema.tables.map((t) => ({
      id: t.id,
      name: t.name,
      primaryFieldId: t.primaryFieldId,
      fields: t.fields.map((f) => ({ id: f.id, name: f.name, type: f.type })),
    }));
    return JSON.stringify({ tables: trimmed });
  },
};

const tool_airtable_list_records: Tool = {
  name: "airtable_list_records",
  category: "read",
  label: "List Airtable records",
  blurb: "Read rows from an Airtable table.",
  description:
    "Lists records from an Airtable table. Pass base_id, table (name or id), optional filterByFormula " +
    "(Airtable formula syntax — e.g. \"{Name} = 'Maylee'\"), and optional max_records (default 25, max 100).",
  input_schema: {
    type: "object",
    required: ["base_id", "table"],
    properties: {
      base_id: { type: "string", description: "Airtable base ID." },
      table: { type: "string", description: "Table name or ID." },
      filter: { type: "string", description: "Optional Airtable formula filter, e.g. \"{Status}='Active'\"." },
      max_records: { type: "integer", description: "Max rows to return (default 25, max 100).", minimum: 1, maximum: 100 },
    },
  },
  handler: async (input) => {
    const baseId = str(input.base_id);
    const table = str(input.table);
    const records = await airtableListRecords(baseId, table, {
      filterByFormula: str(input.filter) || undefined,
      maxRecords: num(input.max_records, 25),
    });
    return JSON.stringify({ records });
  },
};

// ════════════════════════════════════════════════════════════════════════════
// WRITE tools (require approval)
// ════════════════════════════════════════════════════════════════════════════

const tool_update_creator: Tool = {
  name: "update_creator",
  category: "write",
  label: "Update creator",
  blurb: "Edit a creator's record.",
  description:
    "Updates fields on a creator's record. Pass creator_id and any of: status (active/paused/inactive), " +
    "name, of_username, notes. Only changed fields need to be passed.",
  input_schema: {
    type: "object",
    required: ["creator_id"],
    properties: {
      creator_id: { type: "string" },
      status: { type: "string", enum: ["active", "paused", "inactive"] },
      name: { type: "string" },
      of_username: { type: "string" },
      notes: { type: "string" },
    },
  },
  describeCall: (input) => {
    const fields: string[] = [];
    if (input.status) fields.push(`status → ${input.status}`);
    if (input.name) fields.push(`name → ${input.name}`);
    if (input.of_username) fields.push(`of_username → ${input.of_username}`);
    if (input.notes !== undefined) fields.push("notes (updated)");
    return `Edit creator ${input.creator_id}: ${fields.join(", ") || "(no changes)"}`;
  },
  handler: async (input) => {
    const id = str(input.creator_id);
    const patch: Record<string, unknown> = {};
    if (input.status) patch.status = input.status;
    if (input.name) patch.name = input.name;
    if (input.of_username !== undefined) patch.of_username = input.of_username || null;
    if (input.notes !== undefined) patch.notes = input.notes || null;
    if (Object.keys(patch).length === 0) return "Nothing to update.";
    const { data, error } = await supabase.from("creators").update(patch).eq("id", id).select("name, status").maybeSingle();
    if (error) return `Error: ${error.message}`;
    void logAudit({ action: "bernard_update_creator", entity_type: "creator", entity_id: id, entity_name: data?.name, details: JSON.stringify(patch) });
    return JSON.stringify({ ok: true, updated: { id, ...patch }, current: data });
  },
};

const tool_post_announcement: Tool = {
  name: "post_announcement",
  category: "write",
  label: "Post announcement",
  blurb: "Post a staff announcement.",
  description:
    "Posts an announcement to the staff portal. Pass `body` and optional `scope` (default 'all') and `pinned` (default false). " +
    "Scope can be 'all', a role like 'chatter', or a specific manager role.",
  input_schema: {
    type: "object",
    required: ["body"],
    properties: {
      body: { type: "string", description: "The announcement text." },
      scope: { type: "string", description: "Audience — 'all' or a role like 'chatter', 'reddit_va', 'manager'." },
      pinned: { type: "boolean", description: "If true, pin to the top of the staff feed." },
    },
  },
  describeCall: (input) => `Post announcement to ${str(input.scope, "all")}${input.pinned ? " (pinned)" : ""}: "${str(input.body).slice(0, 60)}…"`,
  handler: async (input) => {
    const { error } = await supabase.from("staff_announcements").insert({
      body: str(input.body),
      scope: str(input.scope, "all"),
      pinned: bool(input.pinned),
      created_by: getActor() ?? "bernard",
    });
    if (error) return `Error: ${error.message}`;
    void logAudit({ action: "bernard_post_announcement", entity_type: "staff_announcement", entity_name: str(input.body).slice(0, 60), details: `scope: ${str(input.scope, "all")}` });
    return JSON.stringify({ ok: true });
  },
};

const tool_add_coaching_note: Tool = {
  name: "add_coaching_note",
  category: "write",
  label: "Add coaching note",
  blurb: "Add a coaching note for a chatter.",
  description:
    "Adds a coaching note to a chatter's record. Pass chatter_id, body, and optional visible_to_staff (default false — private to managers).",
  input_schema: {
    type: "object",
    required: ["chatter_id", "body"],
    properties: {
      chatter_id: { type: "string" },
      body: { type: "string" },
      visible_to_staff: { type: "boolean" },
    },
  },
  describeCall: (input) => `Coaching note for ${str(input.chatter_id)} (${bool(input.visible_to_staff) ? "visible to chatter" : "private"}): "${str(input.body).slice(0, 60)}…"`,
  handler: async (input) => {
    const { data, error } = await supabase.from("staff_coaching_notes").insert({
      chatter_id: str(input.chatter_id),
      body: str(input.body),
      visible_to_staff: bool(input.visible_to_staff),
      created_by: getActor() ?? "bernard",
    }).select("id").maybeSingle();
    if (error) return `Error: ${error.message}`;
    void logAudit({ action: "bernard_add_coaching_note", entity_type: "staff_coaching_note", entity_id: data?.id });
    return JSON.stringify({ ok: true });
  },
};

const tool_set_goal: Tool = {
  name: "set_goal",
  category: "write",
  label: "Set goal",
  blurb: "Set a revenue goal for a creator.",
  description:
    "Creates a revenue_goals row for a creator. Pass creator_id, channel ('total' / 'reddit' / 'organic' / 'internal' / 'ads'), target_amount, and an optional period (defaults to current month).",
  input_schema: {
    type: "object",
    required: ["creator_id", "channel", "target_amount"],
    properties: {
      creator_id: { type: "string" },
      channel: { type: "string", enum: ["total", "reddit", "organic", "internal", "ads"] },
      target_amount: { type: "number" },
      period_start: { type: "string", description: "yyyy-MM-dd. Defaults to first of current month." },
      period_end: { type: "string", description: "yyyy-MM-dd. Defaults to one month after period_start." },
    },
  },
  describeCall: (input) =>
    `Set ${str(input.channel)} goal of $${num(input.target_amount)} for creator ${str(input.creator_id)}` +
    (input.period_end ? ` until ${str(input.period_end)}` : ""),
  handler: async (input) => {
    const today = new Date();
    const start = str(input.period_start) || format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd");
    const end = str(input.period_end) || format(addMonths(parseISO(start), 1), "yyyy-MM-dd");
    const { error } = await supabase.from("revenue_goals").insert({
      creator_id: str(input.creator_id),
      channel: str(input.channel),
      target_amount: num(input.target_amount),
      period_start: start,
      period_end: end,
    });
    if (error) return `Error: ${error.message}`;
    void logAudit({ action: "bernard_set_goal", entity_type: "revenue_goal", entity_name: `${str(input.channel)} ${num(input.target_amount)}` });
    return JSON.stringify({ ok: true });
  },
};

const tool_create_lead_task: Tool = {
  name: "create_lead_task",
  category: "write",
  label: "Create task",
  blurb: "Create a task in the lead pipeline.",
  description:
    "Creates a task. Pass description, optional lead_id (otherwise it's a free-floating task), and optional due_at (ISO 8601).",
  input_schema: {
    type: "object",
    required: ["description"],
    properties: {
      description: { type: "string" },
      lead_id: { type: "string" },
      due_at: { type: "string", description: "ISO 8601 datetime." },
    },
  },
  describeCall: (input) => `Create task: "${str(input.description).slice(0, 60)}…"${input.due_at ? ` (due ${str(input.due_at).slice(0, 10)})` : ""}`,
  handler: async (input) => {
    const { error } = await supabase.from("lead_tasks").insert({
      lead_id: str(input.lead_id) || null,
      description: str(input.description),
      due_at: str(input.due_at) || null,
    });
    if (error) return `Error: ${error.message}`;
    void logAudit({ action: "bernard_create_lead_task", entity_type: "lead_task", entity_name: str(input.description).slice(0, 60) });
    return JSON.stringify({ ok: true });
  },
};

const tool_create_landing_page: Tool = {
  name: "create_landing_page",
  category: "write",
  label: "Create landing page",
  blurb: "Create a landing page for a creator.",
  description:
    "Creates a creator_landing_pages row. Pass creator_id and optional slug (auto-generated from creator name if omitted), " +
    "display_name, tagline, theme ('cream' / 'dark' / 'rose' / 'gradient' / 'minimal'), and is_published (default false).",
  input_schema: {
    type: "object",
    required: ["creator_id"],
    properties: {
      creator_id: { type: "string" },
      slug: { type: "string", description: "Lowercase letters/numbers/hyphens, 3-64 chars. Auto-derived from creator name if omitted." },
      display_name: { type: "string" },
      tagline: { type: "string" },
      theme: { type: "string", enum: ["cream", "dark", "rose", "gradient", "minimal"] },
      is_published: { type: "boolean" },
    },
  },
  describeCall: (input) => `Create landing page for creator ${str(input.creator_id)}${input.slug ? ` at /p/${str(input.slug)}` : ""}`,
  handler: async (input) => {
    const cid = str(input.creator_id);
    if (!cid) return "Error: creator_id required.";
    // Get the creator's name for slug derivation if needed
    let slug = str(input.slug);
    if (!slug) {
      const { data: creator } = await supabase.from("creators").select("name").eq("id", cid).maybeSingle();
      slug = slugify(creator?.name ?? "creator");
    } else {
      slug = slugify(slug);
    }
    if (slug.length < 3) return `Error: slug "${slug}" too short.`;
    // Try insert; if slug taken, append suffix
    let attempt = 0;
    let triedSlug = slug;
    while (attempt < 5) {
      const { data, error } = await supabase.from("creator_landing_pages").insert({
        creator_id: cid,
        slug: triedSlug,
        display_name: str(input.display_name) || null,
        tagline: str(input.tagline) || null,
        theme: str(input.theme, "cream"),
        is_published: bool(input.is_published),
        links: [],
      }).select("id, slug").maybeSingle();
      if (!error && data) {
        void logAudit({ action: "bernard_create_landing_page", entity_type: "creator_landing_page", entity_id: data.id, entity_name: data.slug });
        return JSON.stringify({ ok: true, id: data.id, slug: data.slug, public_url: `/p/${data.slug}` });
      }
      if (error?.message?.toLowerCase().includes("duplicate") || error?.code === "23505") {
        attempt++;
        triedSlug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
        continue;
      }
      return `Error: ${error?.message ?? "unknown"}`;
    }
    return "Error: couldn't allocate a unique slug after 5 tries.";
  },
};

const tool_update_landing_page: Tool = {
  name: "update_landing_page",
  category: "write",
  label: "Update landing page",
  blurb: "Edit a creator's landing page.",
  description:
    "Updates fields on a creator_landing_pages row. Pass landing_id and any of: slug, custom_domain, is_published, " +
    "is_verified, display_name, tagline, bio, theme, font, links (full array — replaces existing). " +
    "Only changed fields need to be passed. Note: setting custom_domain only stores the value — admin still has to add the domain in Vercel + point DNS.",
  input_schema: {
    type: "object",
    required: ["landing_id"],
    properties: {
      landing_id: { type: "string" },
      slug: { type: "string" },
      custom_domain: { type: "string" },
      is_published: { type: "boolean" },
      is_verified: { type: "boolean" },
      display_name: { type: "string" },
      tagline: { type: "string" },
      bio: { type: "string" },
      theme: { type: "string", enum: ["cream", "dark", "rose", "gradient", "minimal"] },
      font: { type: "string", enum: ["poppins", "serif", "mono"] },
      links: {
        type: "array",
        description: "Replaces the entire link list. Each item: { label, url }.",
        items: {
          type: "object",
          properties: { label: { type: "string" }, url: { type: "string" } },
        },
      },
    },
  },
  describeCall: (input) => {
    const fields: string[] = [];
    for (const k of ["slug", "custom_domain", "is_published", "is_verified", "display_name", "tagline", "bio", "theme", "font"]) {
      if (input[k] !== undefined) fields.push(`${k} → ${JSON.stringify(input[k])}`);
    }
    if (input.links !== undefined) fields.push(`${(input.links as unknown[]).length} links`);
    return `Update landing page ${str(input.landing_id)}: ${fields.join(", ") || "(no changes)"}`;
  },
  handler: async (input) => {
    const id = str(input.landing_id);
    const patch: Record<string, unknown> = {};
    for (const k of ["slug", "custom_domain", "display_name", "tagline", "bio", "theme", "font"]) {
      if (input[k] !== undefined) patch[k] = (typeof input[k] === "string" && (input[k] as string).trim() === "") ? null : input[k];
    }
    if (input.is_published !== undefined) patch.is_published = bool(input.is_published);
    if (input.is_verified !== undefined) patch.is_verified = bool(input.is_verified);
    if (input.links !== undefined) patch.links = input.links;
    if (Object.keys(patch).length === 0) return "Nothing to update.";
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("creator_landing_pages").update(patch).eq("id", id).select("slug, custom_domain").maybeSingle();
    if (error) return `Error: ${error.message}`;
    void logAudit({ action: "bernard_update_landing_page", entity_type: "creator_landing_page", entity_id: id, entity_name: data?.slug, details: JSON.stringify(patch) });
    let extra = "";
    if (input.custom_domain && typeof input.custom_domain === "string" && input.custom_domain.trim()) {
      extra = ` Note: the custom_domain field is set, but the domain still needs to be added in Vercel → Settings → Domains, and DNS pointed at Vercel's nameservers/IP.`;
    }
    return JSON.stringify({ ok: true, updated: patch, current: data, note: extra });
  },
};

const tool_update_document_metadata: Tool = {
  name: "update_document_metadata",
  category: "write",
  label: "Update document",
  blurb: "Rename or recategorize a document, or update its expiry / notes.",
  description:
    "Updates a creator_documents row. The actual file isn't replaced — only metadata changes. " +
    "Pass document_id and any of: label, category, expires_at (yyyy-MM-dd or null), notes.",
  input_schema: {
    type: "object",
    required: ["document_id"],
    properties: {
      document_id: { type: "string" },
      label: { type: "string" },
      category: { type: "string", enum: ["contract", "id", "dmca", "w9_1099", "nda", "brand_kit", "agreement", "other"] },
      expires_at: { type: ["string", "null"], description: "yyyy-MM-dd or null to clear." },
      notes: { type: "string" },
    },
  },
  describeCall: (input) => {
    const fields: string[] = [];
    for (const k of ["label", "category", "expires_at", "notes"]) {
      if (input[k] !== undefined) fields.push(`${k} → ${JSON.stringify(input[k])}`);
    }
    return `Update document ${str(input.document_id)}: ${fields.join(", ") || "(no changes)"}`;
  },
  handler: async (input) => {
    const id = str(input.document_id);
    const patch: Record<string, unknown> = {};
    for (const k of ["label", "category", "notes"]) {
      if (input[k] !== undefined) patch[k] = input[k];
    }
    if (input.expires_at !== undefined) patch.expires_at = input.expires_at === null || input.expires_at === "" ? null : input.expires_at;
    if (Object.keys(patch).length === 0) return "Nothing to update.";
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("creator_documents").update(patch).eq("id", id).select("label").maybeSingle();
    if (error) return `Error: ${error.message}`;
    void logAudit({ action: "bernard_update_document", entity_type: "creator_document", entity_id: id, entity_name: data?.label });
    return JSON.stringify({ ok: true, updated: patch });
  },
};

// ── Airtable write tools ────────────────────────────────────────────────

const tool_airtable_update_record: Tool = {
  name: "airtable_update_record",
  category: "write",
  label: "Update Airtable record",
  blurb: "Edit an existing row in an Airtable base.",
  description:
    "Updates fields on an Airtable record. Pass base_id, table (name or id), record_id, and a fields object (key = field name, value = new value). " +
    "typecast is enabled, so you can pass strings for select / linked-record fields and Airtable will resolve them.",
  input_schema: {
    type: "object",
    required: ["base_id", "table", "record_id", "fields"],
    properties: {
      base_id: { type: "string" },
      table: { type: "string" },
      record_id: { type: "string", description: "Starts with 'rec'." },
      fields: { type: "object", description: "Map of field name → new value.", additionalProperties: true },
    },
  },
  describeCall: (input) => {
    const fields = (input.fields ?? {}) as Record<string, unknown>;
    const summary = Object.entries(fields).slice(0, 3).map(([k, v]) => `${k} → ${JSON.stringify(v)}`).join(", ");
    return `Airtable: update ${str(input.record_id)} in ${str(input.table)}: ${summary}${Object.keys(fields).length > 3 ? "…" : ""}`;
  },
  handler: async (input) => {
    const result = await airtableUpdateRecord(
      str(input.base_id),
      str(input.table),
      str(input.record_id),
      (input.fields ?? {}) as Record<string, unknown>,
    );
    void logAudit({ action: "bernard_airtable_update", entity_type: "airtable_record", entity_id: result.id, details: JSON.stringify(input.fields) });
    return JSON.stringify({ ok: true, record: result });
  },
};

const tool_airtable_create_record: Tool = {
  name: "airtable_create_record",
  category: "write",
  label: "Create Airtable record",
  blurb: "Add a new row to an Airtable table.",
  description:
    "Creates a new Airtable record. Pass base_id, table (name or id), and a fields object (key = field name, value = field value).",
  input_schema: {
    type: "object",
    required: ["base_id", "table", "fields"],
    properties: {
      base_id: { type: "string" },
      table: { type: "string" },
      fields: { type: "object", description: "Map of field name → value.", additionalProperties: true },
    },
  },
  describeCall: (input) => {
    const fields = (input.fields ?? {}) as Record<string, unknown>;
    const summary = Object.entries(fields).slice(0, 3).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
    return `Airtable: new row in ${str(input.table)} — ${summary}`;
  },
  handler: async (input) => {
    const result = await airtableCreateRecord(
      str(input.base_id),
      str(input.table),
      (input.fields ?? {}) as Record<string, unknown>,
    );
    void logAudit({ action: "bernard_airtable_create", entity_type: "airtable_record", entity_id: result.id, details: JSON.stringify(input.fields) });
    return JSON.stringify({ ok: true, record: result });
  },
};

// ════════════════════════════════════════════════════════════════════════════
// Registry
// ════════════════════════════════════════════════════════════════════════════

export const TOOLS: Tool[] = [
  tool_query_creators,
  tool_get_creator_detail,
  tool_query_revenue,
  tool_list_landing_pages,
  tool_airtable_list_bases,
  tool_airtable_list_tables,
  tool_airtable_list_records,
  tool_update_creator,
  tool_post_announcement,
  tool_add_coaching_note,
  tool_set_goal,
  tool_create_lead_task,
  tool_create_landing_page,
  tool_update_landing_page,
  tool_update_document_metadata,
  tool_airtable_update_record,
  tool_airtable_create_record,
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): Tool | null {
  return TOOL_BY_NAME.get(name) ?? null;
}

/** Returns the tool definitions in the shape Anthropic's API expects. */
export function toolsForAnthropic(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}
