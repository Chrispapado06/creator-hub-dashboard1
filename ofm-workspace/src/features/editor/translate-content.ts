/** Walk a TipTap doc and collect every text node's string (document order). */
export function collectTexts(node: unknown, out: string[] = []): string[] {
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n?.type === "text" && typeof n.text === "string") out.push(n.text);
  if (Array.isArray(n?.content)) for (const c of n.content) collectTexts(c, out);
  return out;
}

/** Rebuild a doc, replacing text nodes with `texts` in the same order. */
export function applyTexts(
  node: unknown,
  texts: string[],
  cursor: { i: number } = { i: 0 },
): unknown {
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n?.type === "text" && typeof n.text === "string") {
    const next = texts[cursor.i] ?? n.text;
    cursor.i += 1;
    return { ...n, text: next };
  }
  if (Array.isArray(n?.content)) {
    return { ...n, content: n.content.map((c) => applyTexts(c, texts, cursor)) };
  }
  return node;
}

export const TRANSLATE_LANGS: { code: string; label: string }[] = [
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "ru", label: "Russian" },
  { code: "ar", label: "Arabic" },
  { code: "zh-CN", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "hi", label: "Hindi" },
  { code: "en", label: "English" },
];
