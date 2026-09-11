import { useCallback, useEffect, useState } from "react";

import type { CoachMessage } from "@/types";

/**
 * THE COACH'S CONVERSATIONS, KEPT.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 *
 * `CoachChat` held its transcript in `useState<CoachMessage[]>([])`. React
 * unmounts a route when you navigate away from it, so the array went with the
 * screen: tapping PLAN and coming back erased the conversation, and there was
 * no way to read yesterday's answer. Phase 0 verified this directly — the
 * transcript is component state and there is no other copy of it anywhere.
 *
 * It is a worse loss than it looks. The free tier sells three conversations a
 * month; an athlete who spent one and then tapped the wrong tab lost it with
 * no warning and no way back, and the counter still went down.
 *
 * ============================================================================
 * WHERE THEY LIVE, SAID PLAINLY: THIS DEVICE.
 * ============================================================================
 *
 * `localStorage`, key `icefall.coach.conversations.v1`. There is no server
 * column for a coach transcript — the migration that would create one
 * (`icefall-supabase/migrations/20260911160000_coach_memory.sql`) is a DRAFT
 * and has NOT been applied. Writing to a table that does not exist would fail
 * silently and look exactly like working, so this module does not try.
 *
 * That means: a new phone opens on an empty Coach, and clearing site data or
 * pressing "Erase all data" in Settings takes the conversations with it. Both
 * are said on the memory screen rather than left to be discovered.
 *
 * IT IS ALSO, TODAY, THE MORE PRIVATE ANSWER. This screen tells the athlete
 * "Private · separate from Social" before they type a word. On the device, a
 * coach conversation is readable by this browser profile and nothing else —
 * not by ICEFALL staff, not by a support tool, not by anybody with a database
 * connection. The migration keeps that promise on the server (owner-only RLS,
 * and deliberately no staff read), but a promise in a file nobody has applied
 * is not a promise. See its header.
 *
 * ============================================================================
 * WHAT COUNTS AS ONE CONVERSATION
 * ============================================================================
 *
 * The thread the athlete was last in, resumed whenever they open the screen,
 * however long ago that was. NOT a rolling window that starts a new thread
 * after some number of hours — that was the first design, and it fails the
 * brief's own test: "closing the screen does not erase them" has to mean the
 * screen looks the same when it reopens, not that the words survive somewhere
 * the athlete has to go looking for them.
 *
 * A new thread is therefore something the athlete ASKS for, with the control
 * on the chat screen, and the old one is still on `/coach/memory`.
 *
 * The model is not handed the whole history: `askCoach` already slices the
 * last `HISTORY_TURNS` turns, so a long-running thread costs the same per
 * question as a short one.
 */

export interface Conversation {
  id: string;
  startedAt: string;
  updatedAt: string;
  messages: CoachMessage[];
}

/**
 * How many threads are kept. Twenty is roughly half a year of the free tier's
 * three a month, and well under a megabyte of text.
 */
const MAX_CONVERSATIONS = 20;

/**
 * Messages kept per thread, oldest dropped first.
 *
 * A thread the athlete never resets is otherwise unbounded, and localStorage
 * is a hard 5 MB per origin shared with every other `icefall.` key — a Coach
 * that ate the quota would break the food log and the recorded activities,
 * which is a far worse failure than losing the top of a long conversation.
 */
const MAX_MESSAGES = 120;

/**
 * The whole record's ceiling, checked on the serialised string rather than
 * guessed from the counts above: one 900-token reply is a few kilobytes and
 * the caps alone do not bound bytes. Oldest threads go until it fits.
 */
const MAX_BYTES = 400_000;

const KEY = "icefall.coach.conversations.v1";

interface Stored {
  conversations: Conversation[];
  /** The thread the chat screen is in, or null when they asked for a new one. */
  currentId: string | null;
}

const EMPTY: Stored = { conversations: [], currentId: null };

function isMessage(v: unknown): v is CoachMessage {
  if (!v || typeof v !== "object") return false;
  const m = v as Partial<CoachMessage>;
  return (
    typeof m.id === "string" &&
    typeof m.body === "string" &&
    (m.role === "coach" || m.role === "athlete")
  );
}

function isConversation(v: unknown): v is Conversation {
  if (!v || typeof v !== "object") return false;
  const c = v as Partial<Conversation>;
  return typeof c.id === "string" && Array.isArray(c.messages);
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    /* A half-written record is an empty one. This is read while the chat
       screen mounts; it must never throw the athlete onto a blank app. Every
       message is re-validated rather than trusted, because a stored object
       missing `role` would reach `Bubble` and render as neither voice. */
    const conversations = Array.isArray(parsed.conversations)
      ? parsed.conversations.filter(isConversation).map((c) => ({
          id: c.id,
          startedAt: c.startedAt ?? c.updatedAt ?? new Date().toISOString(),
          updatedAt: c.updatedAt ?? c.startedAt ?? new Date().toISOString(),
          messages: c.messages.filter(isMessage),
        }))
      : [];
    const currentId =
      typeof parsed.currentId === "string" && conversations.some((c) => c.id === parsed.currentId)
        ? parsed.currentId
        : null;
    return { conversations, currentId };
  } catch {
    return EMPTY;
  }
}

/**
 * One subscriber list, so the chat and the memory screen cannot disagree —
 * deleting a thread on `/coach/memory` while the chat is mounted behind it has
 * to empty the chat, not leave a transcript on screen that no longer exists.
 */
const listeners = new Set<(s: Stored) => void>();
let current: Stored = typeof localStorage === "undefined" ? EMPTY : read();

/** Newest first, capped, and small enough to store. */
function fit(conversations: Conversation[]): Conversation[] {
  let kept = conversations
    .map((c) => ({
      ...c,
      messages: c.messages.length > MAX_MESSAGES ? c.messages.slice(-MAX_MESSAGES) : c.messages,
    }))
    .slice(0, MAX_CONVERSATIONS);

  /* Guard against the pathological case rather than trusting the counts: drop
     whole threads from the oldest end until the record fits. The thread the
     athlete is currently in is at the front, so it is the last to go. */
  while (kept.length > 1 && JSON.stringify(kept).length > MAX_BYTES) {
    kept = kept.slice(0, -1);
  }
  return kept;
}

function write(next: Stored) {
  const conversations = fit(next.conversations);
  const currentId = conversations.some((c) => c.id === next.currentId) ? next.currentId : null;
  current = { conversations, currentId };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* Private mode or a full quota. The thread still works for this session
       and is gone on the next launch. Nothing here may pretend it was kept —
       that is what the memory screen's "kept on this device" line is for. */
  }
  listeners.forEach((l) => l(current));
}

/**
 * A conversation's name, derived rather than asked for.
 *
 * The first thing the athlete typed, truncated. NOT a summary: a summary of a
 * private coaching conversation is a claim about it, and the only thing that
 * can write one honestly is the person who had it. If it is ever worth letting
 * them rename a thread, that is a field on `Conversation`, not a model call.
 */
export function conversationTitle(c: Conversation): string {
  const first = c.messages.find((m) => m.role === "athlete");
  if (!first) return "Empty conversation";
  const text = first.body.replace(/\s+/g, " ").trim();
  return text.length > 64 ? `${text.slice(0, 63).trimEnd()}…` : text;
}

export function currentConversation(): Conversation | null {
  return current.conversations.find((c) => c.id === current.currentId) ?? null;
}

/**
 * Add turns to the thread the athlete is in, starting one if they are not in
 * one.
 *
 * VARIADIC BECAUSE THE SAFETY PATH APPENDS TWO AT ONCE — the question and the
 * fixed reply, in the same tick. Two separate calls would each read `current`,
 * and the second would overwrite the first's thread with a copy that did not
 * have the question in it.
 */
export function appendMessages(...added: CoachMessage[]): void {
  if (added.length === 0) return;
  const at = new Date().toISOString();
  const existing = current.conversations.find((c) => c.id === current.currentId);

  if (existing) {
    const updated: Conversation = {
      ...existing,
      updatedAt: at,
      messages: [...existing.messages, ...added],
    };
    write({
      conversations: [updated, ...current.conversations.filter((c) => c.id !== existing.id)],
      currentId: updated.id,
    });
    return;
  }

  const fresh: Conversation = {
    id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    startedAt: at,
    updatedAt: at,
    messages: [...added],
  };
  write({ conversations: [fresh, ...current.conversations], currentId: fresh.id });
}

/**
 * Leave the current thread without deleting it.
 *
 * No empty conversation is created here — one appears when the next message is
 * sent. A list of blank threads from somebody tapping "New" twice is clutter
 * the athlete then has to tidy.
 */
export function startNewConversation(): void {
  write({ ...current, currentId: null });
}

/** Reopen an earlier thread — the memory screen's rows. */
export function openConversation(id: string): void {
  if (!current.conversations.some((c) => c.id === id)) return;
  write({ ...current, currentId: id });
}

export function removeConversation(id: string): void {
  write({
    conversations: current.conversations.filter((c) => c.id !== id),
    currentId: current.currentId === id ? null : current.currentId,
  });
}

export function clearConversations(): void {
  write(EMPTY);
}

function useStore(): Stored {
  const [state, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

/**
 * The chat screen's view: the messages it shows, and the two writes it makes.
 *
 * `append` deliberately does not return the new array. `CoachChat` reads
 * `messages` from this hook on the next render, which is the same thing
 * `useState` gave it, so the screen's own code barely changes — and there is
 * exactly one copy of the transcript rather than a state array and a store
 * that can drift.
 */
export function useCoachTranscript() {
  const state = useStore();
  const conversation = state.conversations.find((c) => c.id === state.currentId) ?? null;

  return {
    messages: conversation?.messages ?? [],
    conversationId: conversation?.id ?? null,
    /** True when there is an earlier thread to go back to on /coach/memory. */
    hasHistory: state.conversations.length > 0,
    append: useCallback(appendMessages, []),
    startNew: useCallback(startNewConversation, []),
  };
}

/** The memory screen's view: every thread, newest first. */
export function useConversations() {
  const state = useStore();
  return {
    conversations: state.conversations,
    currentId: state.currentId,
    open: useCallback(openConversation, []),
    remove: useCallback(removeConversation, []),
    clear: useCallback(clearConversations, []),
  };
}
