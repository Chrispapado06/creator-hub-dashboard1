import { MAX_ROUTE_PICKS, cleanReason, type RoutePick } from "@/coach/routeSuggestions";

/**
 * THE NINTH TOOL: `suggest_routes`.
 *
 * ============================================================================
 * WHY IT IS PARSED HERE AND NOT IN `tools.ts`
 * ============================================================================
 *
 * `tools.ts` holds `CoachAction` — the closed vocabulary of things that CHANGE
 * THE PLAN. Every member of that union is handed to `planActions.ts`, which
 * computes the plan before and after, puts it through `planGuard.ts` and writes
 * an adjustment record. `suggest_routes` changes nothing: it asks the app to
 * DRAW something it already holds.
 *
 * Folding it into that union would have meant `planActions` receiving a member
 * it has no meaning for, and the exhaustive switch that makes that file safe
 * would have had to grow a branch that does nothing. A do-nothing branch inside
 * the function that applies changes to somebody's training is exactly the kind
 * of thing a later edit gets wrong. Two parsers, two types, one envelope.
 *
 * THE ENVELOPE IS SHARED AND THE PARSERS ARE MUTUALLY EXCLUSIVE. The proxy
 * returns one `{ tool, input }` for the turn. `parseCoachAction` returns null
 * for any name not in `COACH_TOOL_NAMES`, and this returns null for any name
 * that is not `suggest_routes`, so exactly one of them can ever answer and
 * neither needs to know the other exists.
 *
 * ============================================================================
 * WHAT THIS SCHEMA CANNOT EXPRESS
 * ============================================================================
 *
 * A trail. There is no name field, no length, no ascent, no grade, no
 * coordinate and no description — only an id the app put in front of the model
 * a moment earlier, and one sentence of reasoning. A model that wanted to show
 * the athlete a beautiful ridge walk it had made up could not get it through
 * here: the id would not resolve and nothing would be drawn.
 *
 * `reason` is the one string the model authors, and it is the same carve-out
 * `tools.ts` makes for `why`. See the header of `routeSuggestions.ts`.
 *
 * ============================================================================
 * MIRRORED BY HAND IN THE EDGE FUNCTION
 * ============================================================================
 *
 * `icefall-supabase/supabase/functions/coach/index.ts` declares the same tool
 * to the API, because a Deno deploy cannot import from this bundle. Drift fails
 * safe in both directions, exactly as it does for the plan tools: a tool the
 * server declares and this file cannot read is refused here and draws nothing;
 * a tool this file knows and the server never declares is simply never called.
 */

/** The name, in one place, so the parser and any test agree on the spelling. */
export const SUGGEST_ROUTES = "suggest_routes";

/** What survived validation: between one and three picks, or nothing at all. */
export interface RouteSuggestion {
  tool: typeof SUGGEST_ROUTES;
  picks: RoutePick[];
}

/**
 * The model's route picks, or null if this was not that tool or could not be
 * read.
 *
 * STRICT AND TOTAL, written as if the server were hostile — not because it is,
 * but because the interesting failure is a schema that drifted a field name
 * across a deploy, or a model that returned `{"routes": "the GR20"}`. Anything
 * that does not match exactly is refused. Refusing draws nothing, which is
 * always safe; guessing draws a card, which is not.
 *
 * A REASON IS NOT REQUIRED, and that is the one place this is looser than
 * `parseCoachAction`. A plan change with no stated reason is refused there
 * because the history screen shows the reason beside every row and a blank one
 * would leave the athlete looking at a change to their training with nobody's
 * name on why. A card is not a change: with no reason it is simply a route from
 * ICEFALL's catalogue, drawn from ICEFALL's own record, and the card omits the
 * quotation rather than printing an empty one. Losing the sentence is a worse
 * outcome than losing the route.
 */
export function parseRouteSuggestion(name: unknown, raw: unknown): RouteSuggestion | null {
  if (name !== SUGGEST_ROUTES) return null;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const routes = (raw as Record<string, unknown>).routes;
  if (!Array.isArray(routes)) return null;

  const picks: RoutePick[] = [];
  for (const entry of routes) {
    if (picks.length >= MAX_ROUTE_PICKS) break;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const id = (entry as Record<string, unknown>).id;
    if (typeof id !== "string" || id.trim() === "") continue;
    picks.push({ id: id.trim(), reason: cleanReason((entry as Record<string, unknown>).reason) });
  }

  /* An empty call is not a suggestion. Returning `{ picks: [] }` would make the
     screen write "your coach picked routes I could not match", which blames the
     ids for a call that named none. Null means "this was not a usable tool
     call" and the turn is handled as an ordinary reply. */
  return picks.length > 0 ? { tool: SUGGEST_ROUTES, picks } : null;
}
