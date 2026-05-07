import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

/**
 * Bernard's system prompt. Deliberately long — encodes the operator-level
 * domain knowledge of an OnlyFans Management (OFM) agency so Bernard reads as
 * a senior in-house consultant, not a generic analyst.
 */
export const BERNARD_SYSTEM = `You are Bernard, the in-house AI analyst and strategist for an OnlyFans Management (OFM) agency. You have years of operator-level experience: you've grown rosters, run paid traffic, managed chatter teams, and recovered creators from churn. You speak the agency's language — not corporate-speak.

# Identity & voice
- Direct. Confident. Specific. Lead with the answer, then the reasoning.
- Use the agency's own data — actual creator names, dollar amounts, dates, link names, account handles. Never invent numbers or facts.
- If data is sparse, say so plainly: "we don't have enough data on X yet — log a few weeks of Y and come back."
- Avoid generic advice ("post more often", "engage your audience"). Replace it with concrete moves: "test r/UWomen at 2pm EST Tuesday" / "drop sub price to $6.99 for Q4".
- Format with plain markdown (#, ##, ###, **bold**, bullets, occasional tables). Skip code blocks unless quoting raw data.
- When a question implies an action, end with a numbered "Next moves" list — 2-4 concrete steps the operator can run this week.

# OFM domain knowledge

## Reddit & traffic
- Posting cadence: 3-5 posts/account/day, varied subreddits. Same content within a single subreddit gets shadowbanned fast.
- Best times (EST): weekday lunch (12-2pm), evening (8-11pm), weekend mornings. Niche subs vary.
- Karma + age gating: many big subs require 100+ karma and 30+ day-old accounts. Build filler accounts in advance.
- Tag etiquette: [F], [OC], age verification when required. Missing tags = removal.
- Shadowban detection: posts that vanish, stuck at 0 upvotes for 30+ min, or only visible to OP.
- Niche fit drives CVR. A vanilla account in r/altgonewild will underperform a fitting niche account 5-10x.
- Title formula: question or descriptor > generic. "First time on Reddit, be gentle?" > "23 [F]".
- The "OnlyFinder" link in the bio captures attribution; CVR <8% means the content's mismatched to the sub.

## OnlyFinder / paid traffic (the Ads bucket)
- Tracking-link CVR benchmarks: 5% baseline (acceptable), 10-15% solid, 20%+ exceptional. Below 3% = kill the link.
- Conversion windows: most subs convert within 24h of click; revenue logged later (renewals/PPV) is downstream LTV, not first-day attribution.
- Cost-per-sub math: promo cost / new subs. Sustainable if CPS < (sub price × 1.5) given typical retention curves.
- Campaign code organization: never reuse codes across creators or platforms — kills attribution.
- OnlyFinder paid placements often outperform pure organic for cold traffic but underperform Reddit for niche audiences.

## Meta Ads
- Allowed: foot, fitness, lifestyle, cosplay (with workarounds and tasteful creatives). Banned: explicit, "OF" or "OnlyFans" in copy/landing.
- Funnel: ad → linktree/Instafluencer-style landing → OnlyFinder/Beacons → OF. Direct OF links get accounts banned.
- ROAS targets: 1.5x = breakeven (paying for awareness), 2x = sustainable, 3x+ = scale.
- Creative cadence: refresh every 7-14 days; ad fatigue is real on small audiences.
- Lookalike audiences off existing top-spender lists outperform interest-based for warm traffic.

## Chatter operations (Infloww)
- PPV pricing tiers: $5-9 mass blast (low-friction), $15-25 mid (custom-feeling), $50+ VIP (premium / personalized).
- Tagging system: VIP, regular, churned, ghosted, payment-issue. Tags drive segmentation; untagged fans are dead weight.
- Mass DM cadence: max 1-2/day. Repeated same-content blasts fatigue lists.
- Custom workflow: greet → qualify → tease → soft pitch → close. Time-to-close on warm fans should be 24-48h.
- "Date night" / event-driven sales spikes (Friday eve, payday Mon, holidays) are 3-5x normal volume.
- Tip bait: "what would you do tonight if I let you?" outperforms direct "tip me $20".

## OF economics
- Sub price tiers: $4.99 (high-volume entry), $9.99 (sweet spot), $14.99+ (premium positioning).
- Churn: typical monthly is ~30%; <20% is great. Day-3, day-14, day-28 inactivity DMs reduce churn.
- Bundle promos: 3-mo @ 20% off, 6-mo @ 30% off — boost LTV but cap re-engagement opportunities.
- Trial pricing (free/discounted week) works for new accounts but trains low-price expectation.
- Top 1% earner makes $50k+/mo, top 10% $5-15k/mo, median is well below $500/mo. Roster strategy should target the top-10% tier minimum.

## Niches & positioning
- Major niches: vanilla, BBW, alt/goth, fitness, cosplay, milf, latina, asian, foot, fetish-specific. Each has different audience price tolerance and competitive density.
- Underserved niches (alt, BBW, foot) often outperform vanilla on CVR because audience is hungrier.
- Niche fit drives everything downstream: subreddit choice, ad creative, chatter scripts, PPV positioning.

## Lead acquisition / new creators
- Cold DM → signed conversion: 1-2% if list is targeted, lower if mass-blasted.
- Paid lead lists: average quality, mostly already managed. Sourced direct from new accounts is better.
- Onboarding red flags: no ID/DMCA, refusing 2FA share, vague answers about goals.

## What "good" looks like
- Active creators logging $5k+/mo, ROAS >2x on ads, churn <25%, 5+ posts/day organic across platforms, fresh content uploaded weekly.
- Underperformers: dormant (no revenue 14+ days), declining trend, ROAS <1.5x sustained, single-channel reliance.

# How you operate
- When asked about a creator, look at their channel mix (Organic / Internal / Ads), recent revenue trend, and dormancy. Cite the actual numbers from the snapshot.
- When suggesting tactics, reference the niche, the platform mechanics, and the specific accounts involved.
- When data is missing, ask what to log — but only if the question can't be answered at all without it. Otherwise answer with what's there.
- Length: most answers fit in 300-500 words. Deep analyses (preset prompts that ask for full reviews) can go longer. Quick questions get quick answers.`;

/** Optional helper string for callers that want to inject the same OFM context separately. */
export const OFM_GLOSSARY = `Key OFM terms: PPV (pay-per-view DM), CVR (click-to-sub conversion rate), ROAS (return on ad spend), LTV (lifetime value), churn (% of subs who cancel monthly), OnlyFinder (paid placement directory), Infloww (chatter management tool), Beacons/Linktree (link aggregator landing).`;

/**
 * Agentic system prompt — used when Bernard has tools available. Extends the
 * analyst persona with rules for tool use.
 */
export const BERNARD_AGENTIC_SYSTEM = `${BERNARD_SYSTEM}

# Agentic mode

You have a set of tools that let you read AND write to the agency's database
and connected services (Airtable, Supabase). Use them when the user asks for
something concrete — don't just describe what could be done, do it.

## Rules of tool use

1. **Read freely. Write carefully.** Read tools (query_creators, query_revenue,
   list_landing_pages, airtable_list_*) execute silently — call them whenever
   you need data. Write tools require the user's approval, which surfaces
   automatically as a confirmation card; you don't need to ask "should I?"
   before calling them, because the user gets the chance to approve or reject
   the actual call.

2. **Resolve identifiers before mutating.** Most write tools take UUIDs or
   record IDs, not names. If the user says "update Maylee's status," call
   query_creators({ name: "Maylee" }) first, get the id, then call
   update_creator with that id. Never invent IDs.

3. **For Airtable, follow this order:**
   1. airtable_list_bases → get the base_id of the base they're referencing
   2. airtable_list_tables → understand the table + field names
   3. airtable_list_records (with filterByFormula) to find the row
   4. airtable_update_record / airtable_create_record to make the change
   The user usually says "the Airtable" or "Reddit Content Manager"; map that
   to a base_id from list_bases.

4. **One thing at a time.** If the user asks for several changes, plan them
   out, then execute them in sequence. Each write surfaces its own approval
   card — the user can approve all or stop you partway through.

5. **Custom domain reality check.** When asked to "connect a domain" to a
   landing page, you can set the custom_domain field on the landing_page row
   via update_landing_page. THEN tell the user clearly that they still need
   to do two manual steps: (a) add the domain in Vercel → Settings → Domains,
   and (b) point its DNS at Vercel (the registrar shows them an A record /
   CNAME / nameservers to copy in). You can't do those for them.

6. **After every write, summarize what changed.** Don't just say "done" —
   tell the user what record now reads what way, and surface anything they
   should follow up on (e.g. "I set custom_domain=creatorname.com; now add
   the domain in Vercel + point DNS").

7. **Stay in scope.** You only have tools for this app's data and the
   integrations the user has configured (Airtable). You CANNOT browse the
   web, send emails, post to Instagram/Reddit/OF, or call any other API.
   If asked, say so clearly and offer the closest in-scope alternative.

8. **Errors aren't failures, they're information.** If a tool returns an
   error string starting with "Error:", report it to the user, hypothesize
   why, and offer to retry with adjusted parameters.

When you're just analyzing (no action needed), behave the way you always
have — cite numbers, give specific recommendations, end with "Next moves" if
the question implies action. Tools are an addition, not a replacement.`;

export async function getAnthropicKey(): Promise<string | null> {
  const { data } = await supabase
    .from("agency_settings")
    .select("anthropic_api_key")
    .maybeSingle();
  return data?.anthropic_api_key?.trim() || null;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

const CLAUDE_HEADERS = (apiKey: string) => ({
  "Content-Type": "application/json",
  "x-api-key": apiKey,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
});

/** One-shot non-streaming call. Used by preset analyses where we just want the final markdown. */
export async function callClaude(
  apiKey: string,
  userPrompt: string,
  opts?: { maxTokens?: number; messages?: ChatMessage[] }
): Promise<string> {
  const messages: ChatMessage[] = opts?.messages
    ? [...opts.messages, { role: "user", content: userPrompt }]
    : [{ role: "user", content: userPrompt }];
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: CLAUDE_HEADERS(apiKey),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts?.maxTokens ?? 2000,
      system: BERNARD_SYSTEM,
      messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  if (!text) throw new Error("Empty response from Claude");
  return text;
}

// ── Agentic streaming (tool use) ───────────────────────────────────────────

/**
 * Anthropic content blocks we care about. Tool-use input arrives as a stream
 * of partial-json deltas — we re-assemble the full JSON before exposing it.
 */
export type AgenticEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_start"; id: string; name: string; index: number }
  | { type: "tool_use_complete"; id: string; name: string; index: number; input: Record<string, unknown> }
  | { type: "message_done"; stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "unknown" };

export type AgenticChatMessage =
  | { role: "user"; content: string | Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> }
  | { role: "assistant"; content: string | Array<{ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }> };

/**
 * Streaming chat with optional tool use. When `tools` are provided, Claude
 * may emit tool_use blocks; the caller is expected to execute them and
 * resume the conversation by appending a user message with `tool_result`
 * content blocks (one per tool_use).
 */
export async function* streamClaudeAgentic(
  apiKey: string,
  messages: AgenticChatMessage[],
  opts?: { maxTokens?: number; signal?: AbortSignal; tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>; system?: string }
): AsyncGenerator<AgenticEvent, void, unknown> {
  const body: Record<string, unknown> = {
    model: MODEL,
    max_tokens: opts?.maxTokens ?? 4000,
    system: opts?.system ?? BERNARD_SYSTEM,
    messages,
    stream: true,
  };
  if (opts?.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: CLAUDE_HEADERS(apiKey),
    signal: opts?.signal,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 300)}`);
  }
  if (!res.body) throw new Error("Streaming response has no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // Per-block scratch — Anthropic streams content in indexed blocks
  const toolBuffers = new Map<number, { id: string; name: string; partialJson: string }>();
  let stopReason: AgenticEvent extends { type: "message_done"; stopReason: infer S } ? S : never = "unknown" as never;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      for (const line of evt.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as {
            type?: string;
            index?: number;
            content_block?: { type?: string; id?: string; name?: string };
            delta?: {
              type?: string;
              text?: string;
              partial_json?: string;
              stop_reason?: string;
            };
          };

          if (json.type === "content_block_start" && typeof json.index === "number") {
            const cb = json.content_block;
            if (cb?.type === "tool_use" && cb.id && cb.name) {
              toolBuffers.set(json.index, { id: cb.id, name: cb.name, partialJson: "" });
              yield { type: "tool_use_start", id: cb.id, name: cb.name, index: json.index };
            }
          } else if (json.type === "content_block_delta" && json.delta) {
            if (json.delta.type === "text_delta" && json.delta.text) {
              yield { type: "text_delta", text: json.delta.text };
            } else if (json.delta.type === "input_json_delta" && typeof json.index === "number") {
              const buf = toolBuffers.get(json.index);
              if (buf) buf.partialJson += json.delta.partial_json ?? "";
            }
          } else if (json.type === "content_block_stop" && typeof json.index === "number") {
            const buf = toolBuffers.get(json.index);
            if (buf) {
              let parsed: Record<string, unknown> = {};
              try {
                parsed = buf.partialJson ? JSON.parse(buf.partialJson) as Record<string, unknown> : {};
              } catch {
                // Tool input arrived malformed — pass empty so the caller can decide what to do
              }
              yield { type: "tool_use_complete", id: buf.id, name: buf.name, index: json.index, input: parsed };
              toolBuffers.delete(json.index);
            }
          } else if (json.type === "message_delta" && json.delta?.stop_reason) {
            stopReason = json.delta.stop_reason as typeof stopReason;
          }
        } catch {
          // Keepalives / malformed lines — ignore
        }
      }
    }
  }
  yield { type: "message_done", stopReason };
}

/**
 * Streaming chat. Yields the assistant's response in chunks as the model
 * generates it. Pass the full conversation history so multi-turn works.
 *
 * Usage:
 *   for await (const chunk of streamClaude(apiKey, history)) {
 *     setText((t) => t + chunk);
 *   }
 */
export async function* streamClaude(
  apiKey: string,
  messages: ChatMessage[],
  opts?: { maxTokens?: number; signal?: AbortSignal }
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: CLAUDE_HEADERS(apiKey),
    signal: opts?.signal,
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts?.maxTokens ?? 3000,
      system: BERNARD_SYSTEM,
      messages,
      stream: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 300)}`);
  }
  if (!res.body) throw new Error("Streaming response has no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE events are delimited by blank lines. Each event has data: {...}\n
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? ""; // last (possibly incomplete) event stays in buffer
    for (const evt of events) {
      for (const line of evt.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as {
            type?: string;
            delta?: { type?: string; text?: string };
          };
          if (json.type === "content_block_delta" && json.delta?.type === "text_delta" && json.delta.text) {
            yield json.delta.text;
          }
        } catch {
          // Ignore malformed event lines — Anthropic occasionally emits keepalives
        }
      }
    }
  }
}

// ── Business snapshot ─────────────────────────────────────────────────────────

export type BusinessSnapshot = {
  range: { start: string; end: string; days: number };
  generated_at: string;
  // Three rollup buckets:
  //   • organic = social posts (Reddit, IG, FB, X, TikTok) — organic_revenue_entries
  //   • internal = internal tracking links — internal_revenue_entries
  //   • ads = Meta ad campaigns + OnlyFinder paid traffic (revenue_entries from Infloww sync)
  totals: {
    revenue_organic: number;
    revenue_internal: number;
    revenue_total: number;
    ads_spend: number;
    ads_revenue: number;
    ads_revenue_meta: number;
    ads_revenue_onlyfinder: number;
    ads_net: number;
    ads_roas: number;
    new_leads: number;
    leads_converted: number;
    new_creators: number;
    shifts_logged: number;
    payouts_paid: number;
  };
  creators: Array<{
    id: string;
    name: string;
    status: string;
    revenue: number;
    revenue_organic: number;
    revenue_internal: number;
    ads_net: number;
    ads_revenue_meta: number;
    ads_revenue_onlyfinder: number;
    days_since_last_revenue: number | null;
  }>;
  links: Array<{
    code: number;
    name: string;
    creator_id: string | null;
    revenue: number;
    clicks: number;
    subscribers: number;
    cvr: number;
  }>;
  reddit_accounts: Array<{ username: string; status: string; creator_id: string }>;
  staff: Array<{
    name: string;
    role: string;
    shifts: number;
    hours: number;
    revenue_logged: number;
  }>;
  leads: {
    by_status: Record<string, number>;
    stale: Array<{ name: string; status: string; days_stale: number }>;
  };
  alerts: string[];
};

const num = (v: unknown) => (typeof v === "number" ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : "");

async function fetchAll(table: string, columns: string = "*"): Promise<Record<string, unknown>[]> {
  const q = (supabase as unknown as { from: (t: string) => { select: (c: string) => Promise<{ data: Record<string, unknown>[] | null }> } })
    .from(table).select(columns);
  const res = await q;
  return res.data ?? [];
}

async function fetchRange(table: string, columns: string, dateKey: string, start: string, end: string): Promise<Record<string, unknown>[]> {
  const q = (supabase as unknown as { from: (t: string) => { select: (c: string) => unknown } })
    .from(table).select(columns) as unknown as {
      gte: (k: string, v: string) => { lte: (k: string, v: string) => Promise<{ data: Record<string, unknown>[] | null }> };
    };
  const res = await q.gte(dateKey, start).lte(dateKey, end);
  return res.data ?? [];
}

export async function gatherBusinessSnapshot(days: number): Promise<BusinessSnapshot> {
  const end = new Date();
  const start = subDays(end, days);
  const startISO = format(start, "yyyy-MM-dd");
  const endISO = format(end, "yyyy-MM-dd");

  const [
    revenue,
    organic,
    internal,
    ads,
    leadsAll,
    creatorsAll,
    snaps,
    accounts,
    chatters,
    shifts,
    payouts,
    leadActivities,
  ] = await Promise.all([
    fetchRange("revenue_entries", "creator_id, amount, entry_date", "entry_date", startISO, endISO),
    // Tables were renamed in a schema refactor — these used to be
    // organic_revenue_entries / internal_revenue_entries.
    fetchRange("organic_entries", "creator_id, amount, entry_date", "entry_date", startISO, endISO),
    fetchRange("internal_entries", "creator_id, amount, entry_date", "entry_date", startISO, endISO),
    fetchRange("ad_campaigns", "creator_id, amount_spent, revenue_generated, start_date", "start_date", startISO, endISO),
    // creator_leads.source was renamed to source_platform; last_contact_at
    // was removed (use lead_activities.occurred_at as the source of truth).
    fetchAll("creator_leads", "id, name, status, source_platform, created_at, signed_at"),
    fetchAll("creators", "id, name, status, created_at"),
    // daily_link_snapshots was retired; infloww_tracking_stats is the live
    // current-state equivalent. No date column on this so pull all of it
    // and let the consumer aggregate cumulatively.
    fetchAll("infloww_tracking_stats", "campaign_code, campaign_url, clicks_count, subscribers_count, revenue_total"),
    fetchAll("reddit_accounts", "username, status, creator_id"),
    fetchAll("chatters", "id, name, role, status"),
    fetchRange("shifts", "chatter_id, start_at, end_at, total_revenue, creator_id", "start_at", start.toISOString(), end.toISOString()),
    fetchRange("staff_payouts", "amount, period_start, paid_at", "period_start", startISO, endISO),
    fetchAll("lead_activities", "lead_id, occurred_at"),
  ]);

  // Three rollup buckets:
  //   • organic = social posts (Reddit, IG, FB, X, TikTok) — organic_revenue_entries
  //   • internal = internal tracking links — internal_revenue_entries
  //   • ads = Meta ads (ad_campaigns) + OnlyFinder paid traffic (revenue_entries from Infloww sync)
  const totalOnlyFinder = revenue.reduce((s, r) => s + num(r.amount), 0);
  const totalOrganic = organic.reduce((s, r) => s + num(r.amount), 0);
  const totalInternal = internal.reduce((s, r) => s + num(r.amount), 0);
  const adsSpend = ads.reduce((s, r) => s + num(r.amount_spent), 0);
  const totalMetaAds = ads.reduce((s, r) => s + num(r.revenue_generated), 0);
  const adsRevenue = totalOnlyFinder + totalMetaAds;

  // Per-creator revenue rollup
  type CR = { organic: number; internal: number; ads_meta_net: number; ads_onlyfinder: number; lastRevenueDate?: string };
  const perCreator = new Map<string, CR>();
  const ensure = (id: string): CR => {
    let cur = perCreator.get(id);
    if (!cur) { cur = { organic: 0, internal: 0, ads_meta_net: 0, ads_onlyfinder: 0 }; perCreator.set(id, cur); }
    return cur;
  };
  const touchDate = (cur: CR, date?: string) => {
    if (date && (!cur.lastRevenueDate || date > cur.lastRevenueDate)) cur.lastRevenueDate = date;
  };
  for (const r of organic)  { const c = ensure(str(r.creator_id)); c.organic += num(r.amount); touchDate(c, str(r.entry_date)); }
  for (const r of internal) { const c = ensure(str(r.creator_id)); c.internal += num(r.amount); touchDate(c, str(r.entry_date)); }
  for (const r of revenue)  { const c = ensure(str(r.creator_id)); c.ads_onlyfinder += num(r.amount); touchDate(c, str(r.entry_date)); }
  for (const r of ads)      { const c = ensure(str(r.creator_id)); c.ads_meta_net += num(r.revenue_generated) - num(r.amount_spent); touchDate(c, str(r.start_date)); }

  const today = new Date();
  const creators = creatorsAll
    .map((c) => {
      const id = str(c.id);
      const stats = perCreator.get(id) ?? { organic: 0, internal: 0, ads_meta_net: 0, ads_onlyfinder: 0 };
      const adsNet = stats.ads_meta_net + stats.ads_onlyfinder;
      const total = stats.organic + stats.internal + adsNet;
      const lastDate = stats.lastRevenueDate;
      const days_since = lastDate
        ? Math.max(0, Math.floor((today.getTime() - new Date(lastDate).getTime()) / 86400000))
        : null;
      return {
        id,
        name: str(c.name),
        status: str(c.status),
        revenue: total,
        revenue_organic: stats.organic,
        revenue_internal: stats.internal,
        ads_net: adsNet,
        ads_revenue_meta: stats.ads_meta_net,
        ads_revenue_onlyfinder: stats.ads_onlyfinder,
        days_since_last_revenue: days_since,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // Links
  const linkAgg = new Map<number, { name: string; revenue: number; clicks: number; subs: number }>();
  for (const s of snaps) {
    const code = num(s.campaign_code);
    // infloww_tracking_stats has no `link_name` — fall back to the URL or
    // the campaign code so we always have something readable to render.
    const linkName = str(s.link_name) || str(s.campaign_url) || `Code ${code}`;
    const cur = linkAgg.get(code) ?? { name: linkName, revenue: 0, clicks: 0, subs: 0 };
    cur.revenue += num(s.revenue_total);
    cur.clicks += num(s.clicks_count);
    cur.subs += num(s.subscribers_count);
    linkAgg.set(code, cur);
  }
  const links = [...linkAgg.entries()]
    .map(([code, v]) => ({
      code,
      name: v.name,
      creator_id: null as string | null,
      revenue: v.revenue,
      clicks: v.clicks,
      subscribers: v.subs,
      cvr: v.clicks > 0 ? v.subs / v.clicks : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Staff
  const staffAgg = new Map<string, { shifts: number; hoursMs: number; revenue: number }>();
  for (const s of shifts) {
    const cid = str(s.chatter_id);
    const cur = staffAgg.get(cid) ?? { shifts: 0, hoursMs: 0, revenue: 0 };
    cur.shifts += 1;
    cur.revenue += num(s.total_revenue);
    if (s.end_at && s.start_at) {
      cur.hoursMs += new Date(str(s.end_at)).getTime() - new Date(str(s.start_at)).getTime();
    }
    staffAgg.set(cid, cur);
  }
  const staff = chatters
    .map((c) => {
      const cid = str(c.id);
      const stats = staffAgg.get(cid) ?? { shifts: 0, hoursMs: 0, revenue: 0 };
      return {
        name: str(c.name),
        role: str(c.role),
        shifts: stats.shifts,
        hours: Math.round((stats.hoursMs / 3600000) * 10) / 10,
        revenue_logged: stats.revenue,
      };
    })
    .filter((s) => s.shifts > 0 || s.role)
    .sort((a, b) => b.revenue_logged - a.revenue_logged);

  // Leads
  const leadsByStatus: Record<string, number> = {};
  for (const l of leadsAll) {
    const s = str(l.status) || "unknown";
    leadsByStatus[s] = (leadsByStatus[s] ?? 0) + 1;
  }
  const lastActivity = new Map<string, string>();
  for (const a of leadActivities) {
    const id = str(a.lead_id);
    const occ = str(a.occurred_at);
    if (!lastActivity.has(id) || occ > (lastActivity.get(id) ?? "")) lastActivity.set(id, occ);
  }
  const stale = leadsAll
    .filter((l) => {
      const status = str(l.status);
      if (status === "signed" || status === "lost") return false;
      // last_contact_at was removed from creator_leads; lead_activities is
      // now the source of truth, falling back to created_at if no activity.
      const last = lastActivity.get(str(l.id)) ?? str(l.created_at);
      const days = (today.getTime() - new Date(last).getTime()) / 86400000;
      return days > 7;
    })
    .map((l) => {
      // last_contact_at was removed from creator_leads; lead_activities is
      // now the source of truth, falling back to created_at if no activity.
      const last = lastActivity.get(str(l.id)) ?? str(l.created_at);
      return {
        name: str(l.name),
        status: str(l.status),
        days_stale: Math.floor((today.getTime() - new Date(last).getTime()) / 86400000),
      };
    })
    .sort((a, b) => b.days_stale - a.days_stale)
    .slice(0, 15);

  // Alerts
  const alerts: string[] = [];
  const banned = accounts.filter((a) => str(a.status) === "shadowbanned" || str(a.status) === "suspended");
  if (banned.length > 0) alerts.push(`${banned.length} Reddit account(s) shadowbanned/suspended`);
  const paused = creatorsAll.filter((c) => str(c.status) === "paused");
  if (paused.length > 0) alerts.push(`${paused.length} creator(s) currently paused`);
  const dormant = creators.filter((c) => c.status === "active" && (c.days_since_last_revenue ?? 999) > 14);
  if (dormant.length > 0) alerts.push(`${dormant.length} active creator(s) with no revenue in 14+ days: ${dormant.slice(0, 5).map((c) => c.name).join(", ")}`);
  if (stale.length > 0) alerts.push(`${stale.length} lead(s) stale (no activity in 7+ days)`);

  const leadsConverted = leadsAll.filter((l) => {
    const signed = str(l.signed_at);
    return signed && signed >= startISO && signed <= endISO;
  }).length;

  const adsRoas = adsSpend > 0 ? adsRevenue / adsSpend : 0;

  const adsNet = adsRevenue - adsSpend;
  return {
    range: { start: startISO, end: endISO, days },
    generated_at: new Date().toISOString(),
    totals: {
      revenue_organic: totalOrganic,
      revenue_internal: totalInternal,
      revenue_total: totalOrganic + totalInternal + adsNet,
      ads_spend: adsSpend,
      ads_revenue: adsRevenue,
      ads_revenue_meta: totalMetaAds,
      ads_revenue_onlyfinder: totalOnlyFinder,
      ads_net: adsNet,
      ads_roas: adsRoas,
      new_leads: leadsAll.filter((l) => {
        const c = str(l.created_at);
        return c >= start.toISOString() && c <= end.toISOString();
      }).length,
      leads_converted: leadsConverted,
      new_creators: creatorsAll.filter((c) => {
        const cd = str(c.created_at);
        return cd >= start.toISOString();
      }).length,
      shifts_logged: shifts.length,
      payouts_paid: payouts.reduce((s, p) => s + num(p.amount), 0),
    },
    creators,
    links: links.slice(0, 15),
    reddit_accounts: accounts.map((a) => ({
      username: str(a.username),
      status: str(a.status),
      creator_id: str(a.creator_id),
    })),
    staff,
    leads: { by_status: leadsByStatus, stale },
    alerts,
  };
}

// ── Prompt builders ───────────────────────────────────────────────────────────

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function snapshotToContext(s: BusinessSnapshot): string {
  const lines: string[] = [];
  lines.push(`# Business snapshot`);
  lines.push(`Window: ${s.range.start} → ${s.range.end} (${s.range.days} days)`);
  lines.push(``);
  lines.push(`## Totals`);
  lines.push(`Revenue is grouped into three buckets:`);
  lines.push(`  • Organic = social posts on Reddit / IG / FB / X / TikTok`);
  lines.push(`  • Internal = internal tracking links`);
  lines.push(`  • Ads = Meta ad campaigns + OnlyFinder paid traffic`);
  lines.push(``);
  lines.push(`- Total revenue (organic + internal + ads-net): ${fmt(s.totals.revenue_total)}`);
  lines.push(`- Organic revenue: ${fmt(s.totals.revenue_organic)}`);
  lines.push(`- Internal revenue: ${fmt(s.totals.revenue_internal)}`);
  lines.push(`- Ads: spend ${fmt(s.totals.ads_spend)} · revenue ${fmt(s.totals.ads_revenue)} (Meta ${fmt(s.totals.ads_revenue_meta)} + OnlyFinder ${fmt(s.totals.ads_revenue_onlyfinder)}) · net ${fmt(s.totals.ads_net)} · ROAS ${s.totals.ads_roas.toFixed(2)}x`);
  lines.push(`- Leads: ${s.totals.new_leads} new · ${s.totals.leads_converted} converted to creators`);
  lines.push(`- New creators onboarded: ${s.totals.new_creators}`);
  lines.push(`- Staff: ${s.totals.shifts_logged} shifts logged · ${fmt(s.totals.payouts_paid)} paid out in period`);
  lines.push(``);
  lines.push(`## Creators (top by revenue)`);
  for (const c of s.creators.slice(0, 15)) {
    const dormant = c.days_since_last_revenue !== null && c.days_since_last_revenue > 14 ? ` ⚠ ${c.days_since_last_revenue}d since last revenue` : "";
    lines.push(`- ${c.name} (${c.status}): ${fmt(c.revenue)} total — organic ${fmt(c.revenue_organic)}, internal ${fmt(c.revenue_internal)}, ads-net ${fmt(c.ads_net)} (Meta ${fmt(c.ads_revenue_meta)} + OnlyFinder ${fmt(c.ads_revenue_onlyfinder)})${dormant}`);
  }
  lines.push(``);
  lines.push(`## Top tracking links`);
  for (const l of s.links.slice(0, 10)) {
    lines.push(`- ${l.name} (code ${l.code}): ${fmt(l.revenue)} from ${l.clicks.toLocaleString()} clicks → ${l.subscribers} subs (${(l.cvr * 100).toFixed(1)}% CVR)`);
  }
  lines.push(``);
  if (s.staff.length > 0) {
    lines.push(`## Staff activity`);
    for (const m of s.staff.slice(0, 10)) {
      lines.push(`- ${m.name} (${m.role}): ${m.shifts} shifts · ${m.hours}h · ${fmt(m.revenue_logged)} logged`);
    }
    lines.push(``);
  }
  lines.push(`## Lead pipeline`);
  for (const [status, count] of Object.entries(s.leads.by_status)) {
    lines.push(`- ${status}: ${count}`);
  }
  if (s.leads.stale.length > 0) {
    lines.push(``);
    lines.push(`Stale leads (no activity 7+ days):`);
    for (const l of s.leads.stale.slice(0, 8)) {
      lines.push(`- ${l.name} (${l.status}) — ${l.days_stale}d stale`);
    }
  }
  lines.push(``);
  lines.push(`## Operational alerts`);
  if (s.alerts.length === 0) lines.push(`(none)`);
  else for (const a of s.alerts) lines.push(`- ${a}`);
  return lines.join("\n");
}

// ── Forecast-specific data gatherer ───────────────────────────────────────────

export type ForecastInputs = {
  /** Total revenue (organic + internal + ads_net) per ISO date. */
  dailyTotals: Record<string, number>;
  /** Same but split per channel — the AI can read which channel is rising/falling. */
  dailyOrganic: Record<string, number>;
  dailyInternal: Record<string, number>;
  dailyAdsNet: Record<string, number>;
};

export type ForecastSummary = {
  windowDays: number;
  totalRevenue: number;
  dailyAvg: number;
  weeklyAvg: number;
  monthlyAvg: number;
  /** Compares the most recent 30d to the 30d before that. >1 = growing, <1 = shrinking. */
  trendRatio: number;
  trendDirection: "up" | "down" | "flat";
  /** Naive projections off the last-30d run rate. */
  next30Projected: number;
  next60Projected: number;
  next90Projected: number;
  /** Same projections but adjusted for the trend (compounding-ish). */
  next30Adjusted: number;
  next60Adjusted: number;
  next90Adjusted: number;
  /** Per-channel split of the last 30 days, to surface what's growing/shrinking. */
  channelMix: Array<{ channel: string; last30: number; prev30: number; pctChange: number }>;
};

/**
 * Pulls 90 days of revenue across all 3 buckets and computes deterministic
 * trend math. Bernard then gets these numbers PLUS the data to interpret —
 * not pure vibes, not pure formula. Best of both.
 */
export async function gatherForecastInputs(): Promise<{ summary: ForecastSummary; inputs: ForecastInputs }> {
  const end = new Date();
  const start = subDays(end, 90);
  const startISO = format(start, "yyyy-MM-dd");
  const endISO = format(end, "yyyy-MM-dd");

  const [revenue, organic, internal, ads] = await Promise.all([
    fetchRange("revenue_entries", "amount, entry_date", "entry_date", startISO, endISO),
    fetchRange("organic_revenue_entries", "amount, entry_date", "entry_date", startISO, endISO),
    fetchRange("internal_revenue_entries", "amount, entry_date", "entry_date", startISO, endISO),
    fetchRange("ad_campaigns", "amount_spent, revenue_generated, start_date", "start_date", startISO, endISO),
  ]);

  // Daily buckets per channel
  const dailyOrganic: Record<string, number> = {};
  const dailyInternal: Record<string, number> = {};
  const dailyAdsNet: Record<string, number> = {};

  // OnlyFinder/Infloww revenue rolls into the Ads bucket (no separate spend column,
  // so it counts as net here)
  for (const r of revenue) {
    const k = str(r.entry_date);
    if (!k) continue;
    dailyAdsNet[k] = (dailyAdsNet[k] ?? 0) + num(r.amount);
  }
  for (const r of organic) {
    const k = str(r.entry_date);
    if (!k) continue;
    dailyOrganic[k] = (dailyOrganic[k] ?? 0) + num(r.amount);
  }
  for (const r of internal) {
    const k = str(r.entry_date);
    if (!k) continue;
    dailyInternal[k] = (dailyInternal[k] ?? 0) + num(r.amount);
  }
  for (const r of ads) {
    const k = str(r.start_date);
    if (!k) continue;
    dailyAdsNet[k] = (dailyAdsNet[k] ?? 0) + (num(r.revenue_generated) - num(r.amount_spent));
  }

  const dailyTotals: Record<string, number> = {};
  const allDates = new Set([...Object.keys(dailyOrganic), ...Object.keys(dailyInternal), ...Object.keys(dailyAdsNet)]);
  for (const d of allDates) {
    dailyTotals[d] = (dailyOrganic[d] ?? 0) + (dailyInternal[d] ?? 0) + (dailyAdsNet[d] ?? 0);
  }

  const totalRevenue = Object.values(dailyTotals).reduce((s, v) => s + v, 0);

  // Run-rate math
  const sumBetween = (from: Date, to: Date) => {
    let s = 0;
    for (const [date, v] of Object.entries(dailyTotals)) {
      const d = new Date(date);
      if (d >= from && d <= to) s += v;
    }
    return s;
  };
  const last30 = sumBetween(subDays(end, 30), end);
  const prev30 = sumBetween(subDays(end, 60), subDays(end, 30));

  const dailyAvg = last30 / 30;
  const weeklyAvg = dailyAvg * 7;
  const monthlyAvg = dailyAvg * 30;

  const trendRatio = prev30 > 0 ? last30 / prev30 : 1;
  const trendDirection: "up" | "down" | "flat" =
    trendRatio > 1.05 ? "up" : trendRatio < 0.95 ? "down" : "flat";

  // Linear (run-rate) projections
  const next30Projected = monthlyAvg;
  const next60Projected = monthlyAvg * 2;
  const next90Projected = monthlyAvg * 3;

  // Trend-adjusted: each subsequent 30-day window scales by trendRatio,
  // capped to ±50% growth so an outlier week doesn't produce nonsense.
  const cappedTrend = Math.max(0.5, Math.min(1.5, trendRatio));
  const next30Adjusted = monthlyAvg * cappedTrend;
  const next60Adjusted = next30Adjusted + monthlyAvg * Math.pow(cappedTrend, 2);
  const next90Adjusted = next30Adjusted + monthlyAvg * Math.pow(cappedTrend, 2) + monthlyAvg * Math.pow(cappedTrend, 3);

  // Channel mix
  const channelMix = [
    { channel: "Organic",  last30: 0, prev30: 0, pctChange: 0 },
    { channel: "Internal", last30: 0, prev30: 0, pctChange: 0 },
    { channel: "Ads",      last30: 0, prev30: 0, pctChange: 0 },
  ];
  const sumDailyBetween = (m: Record<string, number>, from: Date, to: Date) => {
    let s = 0;
    for (const [date, v] of Object.entries(m)) {
      const d = new Date(date);
      if (d >= from && d <= to) s += v;
    }
    return s;
  };
  channelMix[0].last30 = sumDailyBetween(dailyOrganic,  subDays(end, 30), end);
  channelMix[0].prev30 = sumDailyBetween(dailyOrganic,  subDays(end, 60), subDays(end, 30));
  channelMix[1].last30 = sumDailyBetween(dailyInternal, subDays(end, 30), end);
  channelMix[1].prev30 = sumDailyBetween(dailyInternal, subDays(end, 60), subDays(end, 30));
  channelMix[2].last30 = sumDailyBetween(dailyAdsNet,   subDays(end, 30), end);
  channelMix[2].prev30 = sumDailyBetween(dailyAdsNet,   subDays(end, 60), subDays(end, 30));
  for (const ch of channelMix) {
    ch.pctChange = ch.prev30 > 0 ? ((ch.last30 - ch.prev30) / ch.prev30) * 100 : (ch.last30 > 0 ? 100 : 0);
  }

  return {
    summary: {
      windowDays: 90,
      totalRevenue,
      dailyAvg,
      weeklyAvg,
      monthlyAvg,
      trendRatio,
      trendDirection,
      next30Projected,
      next60Projected,
      next90Projected,
      next30Adjusted,
      next60Adjusted,
      next90Adjusted,
      channelMix,
    },
    inputs: { dailyTotals, dailyOrganic, dailyInternal, dailyAdsNet },
  };
}

/** Converts the deterministic forecast math into a context block for Bernard. */
export function forecastToContext(s: ForecastSummary): string {
  const lines: string[] = [];
  lines.push(`# Revenue forecast inputs (computed deterministically — do not invent these numbers)`);
  lines.push(``);
  lines.push(`## Last 90 days`);
  lines.push(`- Total revenue: ${fmt(s.totalRevenue)}`);
  lines.push(`- Daily average: ${fmt(s.dailyAvg)}`);
  lines.push(`- Weekly run rate: ${fmt(s.weeklyAvg)}`);
  lines.push(`- Monthly run rate: ${fmt(s.monthlyAvg)}`);
  lines.push(``);
  lines.push(`## Trend (last 30d vs prior 30d)`);
  lines.push(`- Direction: ${s.trendDirection.toUpperCase()}`);
  lines.push(`- Ratio: ${s.trendRatio.toFixed(2)}x (${s.trendRatio > 1 ? "+" : ""}${((s.trendRatio - 1) * 100).toFixed(1)}% MoM)`);
  lines.push(``);
  lines.push(`## Channel mix shifts (last 30d vs prior 30d)`);
  for (const ch of s.channelMix) {
    const arrow = ch.pctChange > 5 ? "↑" : ch.pctChange < -5 ? "↓" : "→";
    lines.push(`- ${ch.channel}: ${fmt(ch.last30)} (was ${fmt(ch.prev30)}, ${arrow} ${ch.pctChange > 0 ? "+" : ""}${ch.pctChange.toFixed(1)}%)`);
  }
  lines.push(``);
  lines.push(`## Two projection scenarios`);
  lines.push(``);
  lines.push(`A. **Run rate** (assumes the last 30-day pace simply continues, no trend):`);
  lines.push(`  - Next 30 days: ${fmt(s.next30Projected)}`);
  lines.push(`  - Next 60 days: ${fmt(s.next60Projected)}`);
  lines.push(`  - Next 90 days: ${fmt(s.next90Projected)}`);
  lines.push(``);
  lines.push(`B. **Trend-adjusted** (compounds the recent MoM growth/decline, capped at ±50%):`);
  lines.push(`  - Next 30 days: ${fmt(s.next30Adjusted)}`);
  lines.push(`  - Next 60 days: ${fmt(s.next60Adjusted)}`);
  lines.push(`  - Next 90 days: ${fmt(s.next90Adjusted)}`);
  return lines.join("\n");
}
