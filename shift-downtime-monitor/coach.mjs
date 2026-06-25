// AI coach for whale-active pings (Luca's Option C). Reads the whale's recent
// chat history + the team's playbook, returns a tailored move for the
// chatter to make next. Output structure is strict so monitor.mjs can format
// it into the ping.
//
// Uses Claude Haiku 4.5 (cheapest Claude tier; follows strict-JSON instructions
// reliably). Cost ≈ $0.0025 per call (~$10-20/mo at expected whale-flag volume).
//
// Falls back to null (= caller uses the static-rotation behavior) when:
//   • ANTHROPIC_API_KEY isn't set
//   • playbook is empty
//   • OF chat history fetch fails
//   • Anthropic errors or returns un-parseable JSON
// So this layer is failure-tolerant — the whale flag still fires either way.

import { listChatMessages } from "./of.mjs";

const SYSTEM_PROMPT = `You are a senior OnlyFans chatter coach. Read the recent
chat between a model and a whale, then suggest the chatter's next move.

Output STRICT JSON, nothing else:
{
  "topic":     "what they're talking about right now (3-8 words)",
  "interest":  "what the fan likes or has expressed interest in (5-12 words; '' if unclear)",
  "play_name": "exact name of the playbook entry to use (from the list given) — '' if none fit",
  "why":       "one short sentence explaining the call (≤20 words)"
}

Picking the play:
- Don't restart small talk if the convo is already hot.
- Portray the model in a good light — keep her interesting, fun, in control.
- Match her established voice; don't break character.
- Prioritise plays that move the fan toward buying or engaging deeper, respecting the handling tag.
- If the whale is DO_NOT_SELL, focus on rapport / RB / pace — not the close.
- If a playbook entry references the fan's stated interest, prefer it.`;

export async function coachWhaleResponse({ accountId, fanId, whaleCard, playbook }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !playbook?.length) return null;

  let msgs;
  try { msgs = await listChatMessages(accountId, fanId, { limit: 20 }); }
  catch { return null; }
  if (!msgs?.length) return null;

  // Newest last, capped to keep token cost down.
  const transcript = msgs.slice(-15)
    .map((m) => `${m.fromFan ? "FAN" : "MODEL"}: ${(m.text || "").slice(0, 240)}`)
    .join("\n");

  const playbookList = playbook
    .map((p) => `- ${p.name}${p.category ? ` [${p.category}]` : ""}: ${p.text}`)
    .join("\n");

  const userPrompt = `WHALE CARD
name: ${whaleCard?.name || "unknown"}
model: ${whaleCard?.model || "?"}
handling: ${whaleCard?.handling || "SELL"}
known objection: ${whaleCard?.last_objection || "—"}
current_topic (if QA set one): ${whaleCard?.current_topic || "—"}

RECENT CHAT (oldest to newest):
${transcript}

PLAYBOOK (pick by exact name; '' if none fit):
${playbookList}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const txt = j.content?.[0]?.text ?? "";
    // Claude usually returns clean JSON when instructed, but defensively pull
    // out the first {...} block in case it adds any preamble.
    const match = txt.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const play = parsed.play_name
      ? playbook.find((p) => p.name.toLowerCase() === String(parsed.play_name).toLowerCase()) || null
      : null;
    return {
      topic: (parsed.topic || "").trim() || null,
      interest: (parsed.interest || "").trim() || null,
      play,
      why: (parsed.why || "").trim() || null,
    };
  } catch { return null; }
}
