// =====================================================================
// supabase/functions/translate/index.ts   (Deno / Supabase Edge Function)
//
// Translates an array of strings to a target language using Google Translate's
// public gtx endpoint (no API key). Server-side so there's no CORS/key in the
// client. Called by the "Duplicate as translation" action.
//
// verify_jwt stays true (default): only signed-in users can call it.
// Body: { texts: string[], target: string }  ->  { translations: string[] }
// =====================================================================

const GT = "https://translate.googleapis.com/translate_a/single";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

async function translateOne(text: string, target: string): Promise<string> {
  if (!text.trim()) return text;
  const url = `${GT}?client=gtx&sl=auto&tl=${encodeURIComponent(
    target,
  )}&dt=t&q=${encodeURIComponent(text)}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`Translate failed (${r.status})`);
  const data = await r.json();
  // data[0] = [[translatedChunk, originalChunk, ...], ...]
  const chunks = Array.isArray(data?.[0]) ? data[0] : [];
  return chunks.map((c: unknown[]) => (c?.[0] ?? "")).join("");
}

Deno.serve(async (req) => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...cors },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = await req.json().catch(() => ({}));
    const texts = body.texts;
    const target = String(body.target ?? "");
    if (!Array.isArray(texts) || !target) {
      return json(400, { error: "Provide texts: string[] and target." });
    }
    // Sequential to stay under the public endpoint's rate limits.
    const translations: string[] = [];
    for (const t of texts) {
      translations.push(await translateOne(String(t ?? ""), target));
    }
    return json(200, { translations });
  } catch (e) {
    return json(500, { error: (e as Error)?.message ?? String(e) });
  }
});
