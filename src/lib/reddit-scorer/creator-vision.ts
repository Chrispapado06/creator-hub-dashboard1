/**
 * Creator photo analysis — pre-fills the assess form's niche tags by showing
 * Claude a few photos. The prompt + forced-tool-use schema are ported from the
 * standalone scorer; the network call goes browser-direct to Anthropic reusing
 * the dashboard's stored key (same pattern as bernard.ts).
 *
 * We force a single tool call so Claude must return a structured object — no
 * free-text JSON parsing.
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

const CREATOR_VISION_SYSTEM = `You are a marketing analyst for an OnlyFans agency assessing whether a creator suits Reddit promotion. You are shown photos of one creator. Infer only what the images actually support — do not guess demographics, names, or anything not visible. Call the record_creator_analysis tool exactly once with your findings. Keep niche tags short, lowercase, and Reddit-subreddit-relevant (e.g. "fitness", "cosplay", "goth", "petite", "milf", "feet", "gamer"). Be objective and clinical; this is internal marketing tooling.`;

const ANALYSIS_USER_PROMPT = `These are photos of one creator. Analyze them and record: the niche/aesthetic tags that describe her content, whether her face is visible in any shot, whether the content looks Reddit-native (casual/amateur/selfie style that performs well on Reddit) versus polished studio work, a one-line content-style summary, and a brief observation noting anything useful or anything you could not determine. Use only what the images show.`;

const ANALYSIS_TOOL = {
  name: "record_creator_analysis",
  description: "Record the structured analysis of the creator's photos.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      niche_tags: { type: "array", items: { type: "string" }, description: "Short lowercase niche/aesthetic tags relevant to subreddit matching." },
      face_visible: { type: "boolean", description: "Is the creator's face visible in any photo?" },
      reddit_native_content: { type: "boolean", description: "Does the content look casual/amateur (Reddit-native) rather than polished studio work?" },
      content_style: { type: "string", description: "One-line summary of the content style." },
      observations: { type: "string", description: "Brief useful observation, or what couldn't be determined." },
    },
    required: ["niche_tags", "face_visible", "reddit_native_content", "content_style", "observations"],
  },
} as const;

export const CreatorVisionSchema = z.object({
  niche_tags: z.array(z.string().trim().toLowerCase().min(1)).max(12).transform((tags) => Array.from(new Set(tags))),
  face_visible: z.boolean(),
  reddit_native_content: z.boolean(),
  content_style: z.string().trim().default(""),
  observations: z.string().trim().default(""),
});
export type CreatorVisionResult = z.infer<typeof CreatorVisionSchema>;

type AnthropicContentBlock = { type: string; name?: string; input?: unknown; [k: string]: unknown };

export function parseAnalysisResponse(json: { content?: AnthropicContentBlock[] }): CreatorVisionResult {
  const block = json.content?.find((b) => b.type === "tool_use" && b.name === ANALYSIS_TOOL.name);
  if (!block) throw new Error("Vision model did not return the expected analysis — try different photos.");
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
