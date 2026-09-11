import { useEffect, useState } from "react";

import type { NearBasis, RouteCard } from "@/coach/routeSuggestions";

/**
 * THE ROUTES THIS CONVERSATION HAS SHOWN, KEYED TO THE MESSAGE THAT CARRIED
 * THEM.
 *
 * ============================================================================
 * WHY A SEPARATE STORE AND NOT A FIELD ON THE MESSAGE
 * ============================================================================
 *
 * The same answer `pendingChanges.ts` gives, for a related reason.
 *
 * A coach message is persisted — `coach/conversations.ts` keeps the transcript
 * in localStorage so tapping PLAN and coming back does not erase it. A trail
 * card put on the message would be persisted with it, and a trail card is a
 * snapshot of a record fetched from an index at the moment it was suggested:
 * its length, its grade and how far away it is. Kept for months in a transcript
 * and redrawn without comment, that snapshot quietly becomes a claim about a
 * trail as it is today, made from data as it was in September.
 *
 * SO IT IS DELIBERATELY IN MEMORY ONLY. It survives leaving the chat screen and
 * coming back, which is the case that actually happens — the athlete taps into
 * a trail, looks at it, and comes back to the thread. It does not survive a
 * reload, and that is correct rather than a limitation.
 *
 * WHAT DOES SURVIVE IS THE MESSAGE, and it is written so it can. Its body is
 * the app's own sentence — "3 routes near your area: Sentier des Aiguilles,
 * Tour du Mont Blanc and Balcon Sud." — which names them and states no figure,
 * so it is as true after a reload as it was before one. See `routeCardsSummary`.
 *
 * ============================================================================
 * WHAT IS RECORDED HERE AND WHAT IS NOT
 * ============================================================================
 *
 * Nothing here is a record of anything. A route the athlete actually wants is
 * saved by them, on the trail's own page, into `savedTrails` — which is
 * persisted, is theirs, and exists whether or not this store ever did. This
 * only remembers which chat bubble to draw pictures under.
 */

export interface SuggestedRoutes {
  /** The coach message these belong under. */
  messageId: string;
  cards: RouteCard[];
  /**
   * How the search was centred, carried so the header line above the cards can
   * say "Near your area" or "Near Mont Blanc" and never blur the two. A card
   * list with no basis on it would let a reader assume the nearer of the two.
   */
  basis: NearBasis;
  /** The place name for `basis: "objective"`. Never the word "you". */
  nearLabel: string | null;
}

let suggestions: SuggestedRoutes[] = [];
const listeners = new Set<(s: SuggestedRoutes[]) => void>();

function emit() {
  listeners.forEach((l) => l(suggestions));
}

export function recordSuggestedRoutes(s: SuggestedRoutes): void {
  suggestions = [...suggestions.filter((x) => x.messageId !== s.messageId), s];
  emit();
}

/** Everything this session has shown, for the screen that renders it. */
export function useSuggestedRoutes(): SuggestedRoutes[] {
  const [state, setState] = useState(suggestions);
  useEffect(() => {
    listeners.add(setState);
    setState(suggestions);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

/**
 * Dropped when the athlete starts a new conversation.
 *
 * The pictures belong to the thread that produced them. Cards left hanging
 * under a conversation the athlete has closed are a recommendation nobody is
 * still making — the same rule the chat screen already applies to pending plan
 * changes, and it is called from the same button.
 */
export function clearSuggestedRoutes(): void {
  suggestions = [];
  emit();
}
