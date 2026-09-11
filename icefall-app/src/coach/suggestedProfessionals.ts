import { useEffect, useState } from "react";

import type { ProfessionalShortlist } from "@/coach/professionals";

/**
 * THE GUIDES AND COMPANIES THIS CONVERSATION HAS SHOWN, KEYED TO THE MESSAGE
 * THAT CARRIED THEM.
 *
 * The same answer `pendingChanges.ts` and `suggestedRoutes.ts` give, and for a
 * sharper version of the same reason.
 *
 * A coach message is persisted — `coach/conversations.ts` keeps the transcript
 * in localStorage so tapping PLAN and coming back does not erase it. A guide
 * card written onto the message would be persisted with it, and a guide card is
 * a snapshot of what somebody said about themselves at the moment it was drawn:
 * their standing availability, their day rate, the ascents they claim.
 * Redrawn without comment three weeks later, that snapshot becomes a claim
 * about a working professional as they are today — and "Taking work" is the
 * one field on it somebody might act on by buying a flight.
 *
 * SO IT IS DELIBERATELY IN MEMORY ONLY. It survives leaving the chat screen and
 * coming back, which is the case that actually happens — the athlete taps into
 * a guide's profile, reads it, and comes back to the thread. It does not
 * survive a reload, and that is correct rather than a limitation: on the next
 * load the same question retrieves the catalogue again.
 *
 * WHAT SURVIVES IS THE MESSAGE, and the coach's sentence is written so it can.
 * It names no figure and no availability — it says what to look for and lets
 * the cards carry the names — so it is as true after a reload as before one.
 *
 * NOTHING HERE IS A RECORD OF ANYTHING. A guide the athlete actually wants is
 * reached on the guide's own page; an enquiry to a company is a row in
 * ICEFALL's own enquiry table. This only remembers which chat bubble to draw
 * cards under.
 */

export interface SuggestedProfessionals {
  /** The coach message these belong under. */
  messageId: string;
  shortlist: ProfessionalShortlist;
}

let suggestions: SuggestedProfessionals[] = [];
const listeners = new Set<(s: SuggestedProfessionals[]) => void>();

function emit() {
  listeners.forEach((l) => l(suggestions));
}

export function recordProfessionals(s: SuggestedProfessionals): void {
  suggestions = [...suggestions.filter((x) => x.messageId !== s.messageId), s];
  emit();
}

export function useSuggestedProfessionals(): SuggestedProfessionals[] {
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

/** Dropped when the athlete starts a new conversation. */
export function clearProfessionals(): void {
  suggestions = [];
  emit();
}
