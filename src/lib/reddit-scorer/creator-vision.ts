/**
 * Prospect scan — shows Claude a few photos of a POTENTIAL model and returns a
 * marketability assessment for Reddit/OnlyFans promotion: is she a commercial
 * fit, or just an average next-door girl who won't convert? The scan grades
 * the photo-judgeable rubric criteria (visual appeal, niche demand) and gives
 * an overall verdict, which pre-fills the assessment form.
 *
 * This is talent-scouting tooling for an adult-content agency evaluating
 * consenting-adult prospects. The schema also forces a compliance check so any
 * apparent-minor / non-consensual / banned content is flagged, not scored.
 *
 * A single forced tool call guarantees structured output. The network call
 * goes browser-direct to Anthropic reusing the dashboard's stored key.
 */
import { z } from "zod";
import { getAnthropicKey } from "@/lib/bernard";

export const CREATOR_VISION_MODEL = "claude-sonnet-4-6";
export const CREATOR_VISION_MAX_TOKENS = 1024;
export const MAX_IMAGES = 6;

export const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];
export function isAllowedMediaType(t: string): t is AllowedMediaType {
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(t);
}

const CREATOR_VISION_SYSTEM = `You are a talent scout for an OnlyFans marketing agency. You are shown photos of a PROSPECTIVE adult model the agency is considering signing for Reddit promotion. Your job is to judge her COMMERCIAL VIABILITY for that channel — would Reddit audiences click, subscribe, and pay, or is she an average prospect who won't convert?

Assess objectively and commercially, the way a modelling/talent agency grades a portfolio:
- visual_appeal (0–10): overall marketability and selling power for paid adult content — attractiveness as a commercial signal, photogenic quality, distinctiveness, production value. Be discerning and honest: a genuinely average "girl next door" with no standout draw should land around 3–5; reserve 8–10 for prospects with clear, scroll-stopping commercial appeal. Do not inflate.
- niche_demand (0–10): how much active Reddit audience exists for her look/aesthetic/niche.
- A clear verdict on whether she's worth running.

Flag (do not score) any compliance concern: anyone who could be a minor, non-consensual material, or content Reddit bans outright — set compliance_concern true and explain.

Judge only what the photos support. Be clinical and professional — this is internal commercial tooling, not commentary about the person. Call the record_prospect_assessment tool exactly once.`;

const ANALYSIS_USER_PROMPT = `These are photos of a potential model we may sign for Reddit promotion. Grade her commercial viability for paid adult content on Reddit: marketability/visual selling power, demand for her niche, the niche/aesthetic tags that describe her, whether her face is visible, an overall verdict (strong / viable / marginal / skip), the reasoning, and the single biggest thing that makes or breaks her as a prospect. Be honest — most prospects are average; say so when they are.`;

const ANALYSIS_TOOL = {
  name: "record_prospect_assessment",
  description: "Record the structured marketability assessment of the prospective model.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      visual_appeal: { type: "integer", minimum: 0, maximum: 10, description: "Marketability / visual selling power for paid adult content (0 = not marketable, 10 = exceptional). Be honest; average prospects score 3–5." },
      niche_demand: { type: "integer", minimum: 0, maximum: 10, description: "Estimated active Reddit audience demand for her look/niche (0–10)." },
      niche_tags: { type: "array", items: { type: "string" }, description: "Short lowercase niche/aesthetic tags relevant to subreddit matching (e.g. fitness, cosplay, goth, petite, milf, gamer)." },
      face_visible: { type: "boolean", description: "Is her face visible in any photo? (Face content typically converts better.)" },
      compliance_concern: { type: "boolean", description: "True if anything suggests a possible minor, non-consensual content, or Reddit-banned material." },
      verdict: { type: "string", enum: ["strong", "viable", "marginal", "skip"], description: "Overall fitness as a Reddit promotion prospect." },
      reasoning: { type: "string", description: "Concise commercial justification for the verdict." },
      standout: { type: "string", description: "The single biggest factor that makes or breaks her as a prospect." },
    },
    required: ["visual_appeal", "niche_demand", "niche_tags", "face_visible", "compliance_concern", "verdict", "reasoning", "standout"],
  },
} as const;

export const CreatorVisionSchema = z.object({
  visual_appeal: z.number().int().min(0).max(10),
  niche_demand: z.number().int().min(0).max(10),
  niche_tags: z.array(z.string().trim().toLowerCase().min(1)).max(12).transform((tags) => Array.from(new Set(tags))),
  face_visible: z.boolean(),
  compliance_concern: z.boolean().default(false),
  verdict: z.enum(["strong", "viable", "marginal", "skip"]),
  reasoning: z.string().trim().default(""),
  standout: z.string().trim().default(""),
});
export type CreatorVisionResult = z.infer<typeof CreatorVisionSchema>;

type AnthropicContentBlock = { type: string; name?: string; input?: unknown; [k: string]: unknown };

export function parseAnalysisResponse(json: { content?: AnthropicContentBlock[] }): CreatorVisionResult {
  const block = json.content?.find((b) => b.type === "tool_use" && b.name === ANALYSIS_TOOL.name);
  if (!block) throw new Error("Vision model did not return the expected assessment — try clearer photos.");
  const parsed = CreatorVisionSchema.safeParse(block.input);
  if (!parsed.success) {
    throw new Error(`Malformed analysis from the model: ${parsed.error.issues.map((i) => i.message).join(", ")}`);
  }
  return parsed.data;
}

export function buildVisionRequest(images: Array<{ media_type: string; data: string }>) {
  return {
    model: CREATOR_VISION_MODEL,
    max_tokens: CREATOR_VISION_MAX_TOKENS,
    system: CREATOR_VISION_SYSTEM,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: "tool", name: ANALYSIS_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } })),
          { type: "text", text: ANALYSIS_USER_PROMPT },
        ],
      },
    ],
  };
}

/** Read a File as a base64 payload (strips the data: URL prefix). */
export function fileToBase64(file: File): Promise<{ media_type: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const data = result.includes(",") ? result.split(",")[1] : result;
      resolve({ media_type: file.type, data });
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

/** Browser-direct vision call. Throws with a clear message if no key is set. */
export async function analyzeCreatorPhotos(
  images: Array<{ media_type: string; data: string }>,
): Promise<CreatorVisionResult> {
  const apiKey = await getAnthropicKey();
  if (!apiKey) throw new Error("No Anthropic API key configured. Add it in the dashboard's AI settings.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(buildVisionRequest(images)),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vision API ${res.status}: ${body.slice(0, 200)}`);
  }
  return parseAnalysisResponse(await res.json());
}
