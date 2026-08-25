import { useEffect, useState } from "react";

/**
 * Comments, replies, and the moderation controls that must exist before any
 * of it does.
 *
 * Every comment here is the athlete's own — there is nobody else on the device
 * to write one. That makes the feature look pointless today and it is not: the
 * thread UI, the reply nesting, the delete/report/block controls and the block
 * list all have to be built and proven BEFORE strangers can write to each
 * other, not bolted on after. Shipping comments and adding "report" later is
 * how a community gets its first bad week.
 *
 * `blockedAuthors` is deliberately enforced at read time rather than by
 * deleting rows: a block must survive the blocked person editing, reposting or
 * a sync arriving later, and a filter at the boundary does that where a
 * one-time delete does not.
 */

export interface Comment {
  id: string;
  /** The post or log this belongs to. */
  subjectId: string;
  /** Set when this is a reply to another comment. One level only. */
  parentId?: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  body: string;
  createdAt: string;
  /** Respect, the single positive interaction. Local, so it is your own mark. */
  respected?: boolean;
}

const KEY = "icefall.comments.v1";
const BLOCK_KEY = "icefall.blocked.v1";
const REPORT_KEY = "icefall.reports.v1";

/** The one author id that exists on a device with no accounts. */
export const ME = "me";

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as T[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let comments = readList<Comment>(KEY);
let blocked = readList<string>(BLOCK_KEY);
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(comments));
    localStorage.setItem(BLOCK_KEY, JSON.stringify(blocked));
  } catch {
    /* quota */
  }
  listeners.forEach((l) => l());
}

/** Comments on a subject, blocked authors filtered out, oldest first. */
export function commentsFor(subjectId: string): Comment[] {
  return comments
    .filter((c) => c.subjectId === subjectId && !blocked.includes(c.authorId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addComment(
  input: Omit<Comment, "id" | "createdAt">,
): Comment {
  const entry: Comment = {
    ...input,
    id: `c:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  comments = [...comments, entry];
  persist();
  return entry;
}

/** Deletes a comment and any replies to it — an orphaned reply reads as a lie. */
export function removeComment(id: string) {
  comments = comments.filter((c) => c.id !== id && c.parentId !== id);
  persist();
}

export function toggleRespect(id: string) {
  comments = comments.map((c) => (c.id === id ? { ...c, respected: !c.respected } : c));
  persist();
}

export function blockAuthor(authorId: string) {
  if (authorId === ME || blocked.includes(authorId)) return;
  blocked = [...blocked, authorId];
  persist();
}

export function unblockAuthor(authorId: string) {
  blocked = blocked.filter((id) => id !== authorId);
  persist();
}

export const blockedAuthors = (): string[] => blocked;
export const isBlocked = (authorId: string) => blocked.includes(authorId);

/**
 * Reports queue locally and go nowhere, because there is nowhere to send them.
 * Kept anyway, and told to the athlete plainly: a report that silently
 * evaporates is worse than a button that admits what it can do.
 */
export function queueReport(subjectId: string, reason: string) {
  const queue = readList<{ subjectId: string; reason: string; at: string }>(REPORT_KEY);
  try {
    localStorage.setItem(
      REPORT_KEY,
      JSON.stringify([...queue, { subjectId, reason, at: new Date().toISOString() }]),
    );
  } catch {
    /* quota */
  }
}

export const reportQueue = () =>
  readList<{ subjectId: string; reason: string; at: string }>(REPORT_KEY);

export function useComments(subjectId: string): Comment[] {
  const [list, setList] = useState(() => commentsFor(subjectId));
  useEffect(() => {
    const update = () => setList(commentsFor(subjectId));
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, [subjectId]);
  return list;
}

export const REPORT_QUEUED_NOTICE =
  "Reported. ICEFALL has no moderation service yet, so this is stored on your device and sent nowhere — blocking is the control that actually takes effect right now.";

export const COMMENTS_LOCAL_NOTICE =
  "Comments stay on this device. When accounts exist, threads like this become the conversation under the post.";
