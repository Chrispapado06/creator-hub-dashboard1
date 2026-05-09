/**
 * Brains — Bernard's domain-specific knowledge bases (RAG).
 *
 * Three concepts:
 *   - Brain        : a knowledge domain (chatting, revenue, growth, ...)
 *   - Document     : a raw doc the user uploaded into a brain
 *   - Chunk        : a ~500-token piece of a document with an embedding vector
 *
 * Flow when a user talks to Bernard:
 *   1. The user's question is embedded via OpenAI text-embedding-3-small.
 *   2. We call match_brain_chunks() in Postgres (pgvector cosine search).
 *   3. The top-K chunks are stitched into Bernard's system prompt.
 *
 * Flow when uploading a doc:
 *   1. Save the raw text to brain_documents.
 *   2. Split into chunks (~500 tokens, ~80-token overlap).
 *   3. Embed each chunk in a single OpenAI batch call.
 *   4. Upsert to brain_chunks.
 */

import { supabase } from "@/integrations/supabase/client";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
const EMBED_MODEL = "text-embedding-3-small"; // 1536 dims, $0.02 / 1M tokens

// ─── Types ────────────────────────────────────────────────────────────────

export type Brain = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  created_at: string;
};

export type BrainDocument = {
  id: string;
  brain_id: string;
  title: string;
  source_url: string | null;
  content: string;
  uploaded_by: string | null;
  created_at: string;
};

export type BrainChunk = {
  id: string;
  document_id: string;
  brain_id: string;
  content: string;
  chunk_index: number;
  similarity?: number;
};

// ─── Embeddings ───────────────────────────────────────────────────────────

/**
 * Embed an array of strings via OpenAI. One HTTP call per batch.
 * Returns the embedding vectors in the same order as the inputs.
 */
async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "Missing VITE_OPENAI_API_KEY. Add it to .env and restart the dev server.",
    );
  }
  if (texts.length === 0) return [];

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${err.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
}

/** Convenience: embed a single string and return the vector. */
async function embedOne(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

// ─── Chunking ─────────────────────────────────────────────────────────────

/**
 * Split text into ~500-token chunks with ~80-token overlap. We approximate
 * tokens as 4 chars (close enough for English prose). Chunking on paragraph
 * boundaries when possible, falling back to char windowing for long blobs.
 */
export function chunkText(text: string, opts?: { chunkChars?: number; overlap?: number }): string[] {
  const chunkChars = opts?.chunkChars ?? 2000;  // ~500 tokens
  const overlap = opts?.overlap ?? 320;          // ~80 tokens

  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (cleaned.length <= chunkChars) return [cleaned];

  // Try paragraph splits first
  const paragraphs = cleaned.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > chunkChars && current.length > 0) {
      chunks.push(current.trim());
      // start next chunk with the tail of the current one for overlap
      current = current.length > overlap ? current.slice(-overlap) + "\n\n" + p : p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // If any single paragraph was monstrous, char-window it
  const final: string[] = [];
  for (const c of chunks) {
    if (c.length <= chunkChars * 1.5) {
      final.push(c);
      continue;
    }
    let i = 0;
    while (i < c.length) {
      final.push(c.slice(i, i + chunkChars));
      i += chunkChars - overlap;
    }
  }
  return final.filter((c) => c.length > 0);
}

// ─── Brain CRUD ───────────────────────────────────────────────────────────

export async function listBrains(): Promise<Brain[]> {
  const { data, error } = await supabase
    .from("brains")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Brain[];
}

export async function getBrainBySlug(slug: string): Promise<Brain | null> {
  const { data, error } = await supabase
    .from("brains")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as Brain | null;
}

export async function listDocuments(brainId: string): Promise<BrainDocument[]> {
  const { data, error } = await supabase
    .from("brain_documents")
    .select("*")
    .eq("brain_id", brainId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BrainDocument[];
}

export async function countChunks(brainId: string): Promise<number> {
  const { count, error } = await supabase
    .from("brain_chunks")
    .select("id", { count: "exact", head: true })
    .eq("brain_id", brainId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Upload a document into a brain: save it, chunk it, embed each chunk,
 * insert the chunks. Returns the new document ID.
 */
export async function addDocument(
  brainId: string,
  title: string,
  content: string,
  sourceUrl?: string | null,
): Promise<string> {
  if (!content.trim()) throw new Error("Document content is empty.");

  // 1. Save the raw doc
  const { data: doc, error: docErr } = await supabase
    .from("brain_documents")
    .insert({
      brain_id: brainId,
      title: title.trim() || "Untitled",
      content,
      source_url: sourceUrl ?? null,
    })
    .select("*")
    .single();
  if (docErr) throw docErr;

  // 2. Chunk
  const pieces = chunkText(content);
  if (pieces.length === 0) return doc.id;

  // 3. Embed in one batch
  const vectors = await embedTexts(pieces);

  // 4. Insert chunks
  const rows = pieces.map((piece, i) => ({
    document_id: doc.id,
    brain_id: brainId,
    content: piece,
    embedding: vectors[i] as unknown as string, // pgvector accepts arrays via PostgREST
    chunk_index: i,
  }));
  const { error: chunkErr } = await supabase.from("brain_chunks").insert(rows);
  if (chunkErr) {
    // Roll back the doc so we don't leave orphans
    await supabase.from("brain_documents").delete().eq("id", doc.id);
    throw chunkErr;
  }
  return doc.id as string;
}

export async function deleteDocument(documentId: string): Promise<void> {
  const { error } = await supabase
    .from("brain_documents")
    .delete()
    .eq("id", documentId);
  if (error) throw error;
}

// ─── Search (the part Bernard calls) ──────────────────────────────────────

/**
 * Embed the query, run pgvector similarity search via the
 * match_brain_chunks() RPC, return the top-K chunks for that brain.
 * Returns [] if no key is set or no chunks match — never throws on
 * "empty brain" so Bernard degrades gracefully.
 */
export async function searchBrain(
  brainSlugOrId: string,
  query: string,
  opts?: { topK?: number; isId?: boolean },
): Promise<BrainChunk[]> {
  if (!query.trim()) return [];
  if (!OPENAI_API_KEY) return [];   // Soft-fail — Bernard works without brains

  // Resolve slug → id if needed
  let brainId = brainSlugOrId;
  if (!opts?.isId) {
    const brain = await getBrainBySlug(brainSlugOrId);
    if (!brain) return [];
    brainId = brain.id;
  }

  let queryVec: number[];
  try {
    queryVec = await embedOne(query);
  } catch (err) {
    console.warn("[brains] embed failed:", err);
    return [];
  }

  const { data, error } = await supabase.rpc("match_brain_chunks", {
    query_embedding: queryVec as unknown as string,
    match_brain_id: brainId,
    match_count: opts?.topK ?? 5,
  });
  if (error) {
    console.warn("[brains] RPC failed:", error.message);
    return [];
  }
  return (data ?? []) as BrainChunk[];
}

/**
 * Build the "## Knowledge from the X brain" block to splice into Bernard's
 * system prompt. Returns "" if there's nothing relevant — don't pollute the
 * prompt with empty headers.
 */
export async function buildBrainContext(
  brainSlug: string,
  query: string,
  topK = 5,
): Promise<string> {
  const chunks = await searchBrain(brainSlug, query, { topK });
  if (chunks.length === 0) return "";
  const numbered = chunks
    .map((c, i) => `[${i + 1}] ${c.content}`)
    .join("\n\n---\n\n");
  return [
    "",
    `## Knowledge from the "${brainSlug}" brain`,
    "(These snippets were retrieved from the agency's playbook for this query. Use them when relevant and cite them as [1], [2], etc. in your answer. If they don't apply, ignore them.)",
    "",
    numbered,
  ].join("\n");
}

/**
 * Lightweight intent classifier — looks at keywords in the user message
 * and returns the most likely brain slug. Cheap and deterministic; we'd
 * upgrade to an LLM call if precision matters more.
 *
 * Returns null when no brain is clearly indicated — caller should then
 * skip RAG entirely (don't waste tokens stuffing irrelevant context).
 */
export function detectBrain(message: string): string | null {
  const m = message.toLowerCase();

  const chattingHits =
    /\b(ppv|chat|chatter|dm|message|tip|fan|whale|sext|script|tone|reply|response|caption|cta|sales|funnel|unlock)\b/.test(
      m,
    );
  const revenueHits =
    /\b(revenue|earnings|net|gross|profit|payout|monetiz|pricing|price|churn|win[- ]?back|retention|ltv|arpu|subscription|sub|renewal)\b/.test(
      m,
    );
  const growthHits =
    /\b(growth|grow|traffic|reddit|tiktok|instagram|facebook|x[\s\-]?twitter|follower|reach|impressions|conversion|funnel|onboard|onboarding|leads?)\b/.test(
      m,
    );

  // Pick the strongest signal; ties broken by chatting > revenue > growth
  // since chatting is the highest-volume domain in OFM.
  const scores: Array<{ slug: string; hit: boolean }> = [
    { slug: "chatting", hit: chattingHits },
    { slug: "revenue", hit: revenueHits },
    { slug: "growth", hit: growthHits },
  ];
  const winner = scores.find((s) => s.hit);
  return winner ? winner.slug : null;
}
