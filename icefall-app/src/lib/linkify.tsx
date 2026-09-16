import type { ReactNode } from "react";

/* Turns http(s):// URLs and bare www.-prefixed domains inside plain text into
   real, clickable anchors — everything else stays untouched text. Never uses
   dangerouslySetInnerHTML: the input is split into text/anchor React nodes,
   so there is no way for message content to inject markup. Safe to feed
   straight into a whitespace-pre-wrap paragraph — plain-text segments
   (including newlines) pass through exactly as given. */

const URL_PATTERN = /(https?:\/\/[^\s<>()[\]{}"']+|www\.[^\s<>()[\]{}"']+\.[^\s<>()[\]{}"']+)/gi;

// Trailing punctuation that's almost always sentence punctuation, not part
// of the URL (e.g. "check this out: https://x.com." or "(https://x.com)").
const TRAILING_PUNCTUATION = /[.,!?;:'")\]}]+$/;

const MAX_VISIBLE_LENGTH = 46;

function shortenForDisplay(url: string): string {
  if (url.length <= MAX_VISIBLE_LENGTH) return url;
  const head = Math.ceil(MAX_VISIBLE_LENGTH * 0.65);
  const tail = MAX_VISIBLE_LENGTH - head - 1; // room for the ellipsis char
  return `${url.slice(0, head)}…${url.slice(url.length - tail)}`;
}

/**
 * Renders `text` as React nodes, turning any URL or www.-domain into a
 * clickable link. Text with no URL in it renders as the exact same single
 * string it always did (no wrapping, no extra nodes).
 */
export function linkify(text: string): ReactNode {
  if (!text) return text;

  const matches = text.match(URL_PATTERN);
  if (!matches) return text;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  URL_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;

    // Split off trailing punctuation so "https://x.com." links to x.com,
    // not x.com. (the period stays in the surrounding text).
    let url = raw;
    let trailing = "";
    const punctMatch = url.match(TRAILING_PUNCTUATION);
    if (punctMatch) {
      trailing = punctMatch[0];
      url = url.slice(0, url.length - trailing.length);
    }
    if (url.length === 0) continue;

    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    nodes.push(
      <a
        key={`link-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="break-words text-azure underline decoration-azure/30 underline-offset-2 hover:decoration-azure/70"
      >
        {shortenForDisplay(url)}
      </a>,
    );

    if (trailing) nodes.push(trailing);

    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
