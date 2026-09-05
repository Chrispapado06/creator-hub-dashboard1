/**
 * THE LISTING, ASSEMBLED — one place the screens read it from.
 *
 * Wires the guide's stored edits over the seed, so every screen sees the same
 * listing and none re-derives it. The seed is a starting point a guide edits,
 * not a floor they cannot go below.
 *
 * A ROUTE IS A MOUNTAIN OR A TREK, and this module is where the two catalogues
 * are resolved into one shape the screens can render without caring which.
 */

import { ME, SEED_ROUTES } from "@/data/demo";
import { loadListing, type Listing, type OfferedRoute, type RouteKind } from "@/data/listingStore";
import { peakById } from "@/data/peaks";
import { sampleAllowed } from "./sampleGate";
import { trekById } from "@/data/treks";

/**
 * The listing a guide starts from.
 *
 * GATED: when somebody is signed in, the sample guide's mountains, rates and
 * profile are not theirs and must not appear — including the copy sitting in
 * this browser's `localStorage`, which was seeded from the sample and is
 * therefore the sample's, not the account's. A real account's listing arrives
 * with the `guide_routes` migration; until then it is honestly empty.
 */
export function seedListing(): Listing {
  if (!sampleAllowed()) return { profile: null, routes: [] };
  return {
    profile: ME
      ? {
          name: ME.name,
          title: ME.title,
          nationality: ME.nationality,
          basedIn: ME.basedIn,
          languages: ME.languages,
          yearsGuiding: ME.yearsGuiding,
          bio: ME.bio,
          heroPeak: ME.heroPeak,
        }
      : null,
    routes: SEED_ROUTES,
  };
}

/**
 * SEPARATED AT THE STORE, NOT REFUSED AT THE STORE.
 *
 * This used to return an empty listing to anyone signed in, to stop the sample
 * guide's mountains reaching a real account through `localStorage`. It did stop
 * that — and it also refused a real guide their OWN work: their write went into
 * the drawer, the read came back empty, and the screen said they had added
 * nothing. The leak and the guide's own listing are two different problems, and
 * one answer served neither.
 *
 * `storeScope()` now keeps them apart by owner, so this reads whatever belongs
 * to whoever is here. `seedListing()` is still gated, so an account's drawer
 * starts genuinely empty rather than pre-filled with somebody else's peaks.
 */
export const listing = (): Listing => loadListing(seedListing());

/** What a screen needs to draw one offering, whichever catalogue it came from. */
export interface ResolvedRoute extends OfferedRoute {
  name: string;
  /** Where the photograph lives — the two libraries are separate directories. */
  photoKind: RouteKind;
  /** Metres: a summit altitude for a peak, the high point for a trek. */
  altitudeM: number | null;
  country: string;
  /** "8,849 m · Nepal" — the one subtitle both kinds can fill honestly. */
  detail: string;
  /** True when the catalogue no longer has this id at all. */
  missing: boolean;
}

export function resolveRoute(r: OfferedRoute): ResolvedRoute {
  if (r.kind === "trek") {
    const t = trekById(r.routeId);
    return {
      ...r,
      name: t?.name ?? r.routeId,
      photoKind: "trek",
      altitudeM: t?.maxAltitudeM ?? null,
      country: t?.country ?? "",
      detail: [
        t?.maxAltitudeM ? `${t.maxAltitudeM.toLocaleString("en-GB")} m high point` : "",
        t?.country ?? "",
      ]
        .filter(Boolean)
        .join(" · "),
      missing: t === undefined,
    };
  }
  const p = peakById(r.routeId);
  return {
    ...r,
    name: p?.name ?? r.routeId,
    photoKind: "mountain",
    altitudeM: p?.elevationM ?? null,
    country: p?.country ?? "",
    detail: [p?.elevationM ? `${p.elevationM.toLocaleString("en-GB")} m` : "", p?.country ?? ""]
      .filter(Boolean)
      .join(" · "),
    missing: p === undefined,
  };
}

/**
 * Everything the guide offers, mountains first and then treks, each group
 * highest first — which is how a guide reads their own list.
 */
export function offeredRoutes(): ResolvedRoute[] {
  return listing()
    .routes.map(resolveRoute)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "mountain" ? -1 : 1;
      return (b.altitudeM ?? 0) - (a.altitudeM ?? 0);
    });
}

export const offeredOfKind = (kind: RouteKind): ResolvedRoute[] =>
  offeredRoutes().filter((r) => r.kind === kind);

/**
 * The cheapest day rate across the listing, for "from €X a day".
 *
 * Null rather than 0 when there is nothing to compare — a guide with nothing
 * listed has not priced themselves at nothing.
 */
export function fromDayRate(): number | null {
  const rates = listing()
    .routes.map((m) => m.dayRateEur)
    .filter((r) => r > 0);
  return rates.length > 0 ? Math.min(...rates) : null;
}
