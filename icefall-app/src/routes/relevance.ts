import type { Route } from "@/routes/model";
import type { CoachContext } from "@/coach/context";

/**
 * Why this route matters to THIS athlete.
 *
 * The whole reason ICEFALL's route system is not a generic trail finder. A
 * route is never presented as a nice walk; it is presented in terms of the
 * mountain the athlete has chosen and the block they are in.
 *
 * ── LANGUAGE RULE, NOT A STYLE PREFERENCE ──────────────────────────────────
 *
 * Never "this route is safe for you", "you are ready for this", "cleared", or
 * anything a person could read as permission. A route's difficulty is a
 * property of the ground; whether a given person should be on it on a given day
 * involves conditions, partners and judgement this app cannot see. Everything
 * below therefore talks about TRAINING MATCH — what the route would give the
 * athlete — and stops there.
 */

export interface RouteRelevance {
  /** One sentence. Null when there is genuinely nothing honest to say. */
  reason: string | null;
  /** True when the route belongs to the athlete's current objective. */
  onObjective: boolean;
}

/** The vertical a session in this block is trying to accumulate, roughly. */
function blockTarget(block: string | null): { label: string; gain: number } | null {
  if (!block) return null;
  const b = block.toLowerCase();
  if (b.startsWith("base")) return { label: "base", gain: 700 };
  if (b.startsWith("build")) return { label: "build", gain: 1100 };
  if (b.startsWith("peak")) return { label: "peak", gain: 1500 };
  if (b.startsWith("taper")) return { label: "taper", gain: 400 };
  return null;
}

export function routeRelevance(route: Route, ctx: CoachContext): RouteRelevance {
  const objective = ctx.objective;
  const onObjective = Boolean(objective && route.mountainId && objective.name === route.mountainName);

  // 1. The route is ON the mountain they are training for. Nothing beats that.
  if (onObjective && objective) {
    const days = objective.daysAway;
    return {
      onObjective: true,
      reason:
        days !== null && days > 0
          ? `A line on ${objective.name} — your objective, ${days} days away.`
          : `A line on ${objective.name}, your current objective.`,
    };
  }

  // 2. It matches the vertical the current training block is building.
  const target = blockTarget(ctx.today.session ? (objective?.block ?? null) : (objective?.block ?? null));
  if (target && objective) {
    const delta = Math.abs(route.elevationGainM - target.gain);
    if (delta <= 400) {
      return {
        onObjective: false,
        reason: `${route.elevationGainM.toLocaleString("en-GB")} m of ascent — close to what your ${objective.block} block is building toward.`,
      };
    }
  }

  // 3. It rehearses the objective's own vertical demand.
  if (objective?.elevationM && route.elevationGainM >= 1000) {
    return {
      onObjective: false,
      reason: `A long vertical day — the kind of stimulus ${objective.name} asks for.`,
    };
  }

  // 4. Nothing specific to say. Say nothing rather than inventing a reason.
  return { onObjective: false, reason: null };
}

/**
 * The training-route categories (§15) — a real-world alternative to a gym
 * session. Each is a vertical band, so a route either falls in it or does not;
 * nothing is scored or ranked.
 */
export interface TrainingBand {
  id: string;
  label: string;
  detail: string;
  minGainM: number;
  maxGainM: number;
}

export const TRAINING_BANDS: TrainingBand[] = [
  { id: "recovery", label: "Recovery hike", detail: "Easy movement, low vertical", minGainM: 0, maxGainM: 600 },
  { id: "zone2", label: "Long aerobic day", detail: "Time on feet over vertical", minGainM: 600, maxGainM: 1000 },
  { id: "vertical", label: "Vertical endurance", detail: "The classic uphill block session", minGainM: 900, maxGainM: 1400 },
  { id: "pack", label: "Pack carrying", detail: "Big vertical with weight", minGainM: 1000, maxGainM: 99_000 },
];

export const routesInBand = (routes: Route[], band: TrainingBand) =>
  routes.filter((r) => r.elevationGainM >= band.minGainM && r.elevationGainM <= band.maxGainM);
