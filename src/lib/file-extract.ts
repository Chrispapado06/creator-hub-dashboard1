/**
 * File text extraction — turns uploaded files into plain text we can chunk
 * and embed. Same set of formats Claude Projects accepts:
 *
 *   .txt .md .csv  → read directly as UTF-8
 *   .pdf           → pdfjs-dist (Mozilla's PDF.js, runs in the browser)
 *   .docx          → mammoth (extracts text from Word XML)
 *   .json          → stringified for now (raw JSON is fine for embedding)
 *
 * Anything else throws — caller should surface a "format not supported"
 * toast so the user knows to convert it.
 */

import * as pdfjsLib from "pdfjs-dist";
import mammoth from "mammoth";

// Vite-friendly worker import. pdf.js needs a worker for parsing; importing
// the worker as a URL with `?url` lets Vite ship it as a separate asset and
// pdfjs picks it up via workerSrc. Without this, pdf.js falls back to the
// fake worker and warns / fails on big files.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type ExtractedFile = {
  name: string;
  text: string;
  bytes: number;
};

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".json", ".pdf", ".docx"];

export function isSupportedFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Extract text from a single file. Throws on unsupported / corrupt files. */
export async function extractText(file: File): Promise<ExtractedFile> {
  const lower = file.name.toLowerCase();

  // ── Plain text family ──
  if (
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".json")
  ) {
    const text = await file.text();
    return { name: file.name, text: text.trim(), bytes: file.size };
  }

  // ── PDF ──
  if (lower.endsWith(".pdf")) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Each item has a `str` field; we join with spaces and break lines on
      // explicit hasEOL markers when available.
      const pageText = content.items
        .map((it) => {
          const item = it as { str?: string; hasEOL?: boolean };
          return (item.str ?? "") + (item.hasEOL ? "\n" : "");
        })
        .join(" ")
        .replace(/[ \t]+/g, " ")
        .trim();
      if (pageText) pages.push(pageText);
    }
    return {
      name: file.name,
      text: pages.join("\n\n").trim(),
      bytes: file.size,
    };
  }

  // ── DOCX (Word) ──
  if (lower.endsWith(".docx")) {
    const buf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return { name: file.name, text: (result.value ?? "").trim(), bytes: file.size };
  }

  throw new Error(
    `Unsupported file type: ${file.name}. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
  );
}

/** Convenience: extract many files in parallel; preserves order. */
export async function extractMany(files: File[]): Promise<ExtractedFile[]> {
  return Promise.all(files.map((f) => extractText(f)));
}
