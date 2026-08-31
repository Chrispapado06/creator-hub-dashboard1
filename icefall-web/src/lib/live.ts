import { useEffect, useState } from "react";
import { OFFLINE } from "@/offline/offline";
import { offlineHealth } from "@/offline/fixtures";
import { searchFlights, type Airport, type Itinerary } from "@/lib/flights";
import { lodgesForObjective, type Lodge } from "@/lib/trip";

/**
 * The live-vs-demo data layer.
 *
 * Every flight/hotel lookup goes through here. It asks the API server (once)
 * whether a provider is connected; if so it fetches real data, and if not — no
 * key, or no server running — it falls back to the app's labelled DEMO data.
 * The browser never sees an API key: it only ever calls `/api/*`, and the
 * server (see `server/`) holds the secrets.
 *
 * Result: the app works identically today (demo), and flips to real fares/rates
 * the moment a key is added — no UI change, because live and demo share the
 * exact same `Itinerary` / `Lodge` shapes.
 */

export type DataSource = "live" | "demo";

interface Health {
  flights: "live" | "not_connected";
  stays: "live" | "not_connected";
}

// One health check per page load, cached. If it fails (server down), we treat
// everything as not-connected and never hammer the search endpoints.
let healthCache: Promise<Health | null> | null = null;

export function getHealth(): Promise<Health | null> {
  /*
   * OFFLINE DEMO — the one gate that keeps this whole file off the network.
   *
   * `resolveFlights` and `resolveStays` only ever call `fetch` inside
   * `if (health?.flights === "live")`, so answering "no provider connected"
   * here — which is the literal truth offline, and already what an absent API
   * server produces — means neither search endpoint is ever contacted. Both
   * then fall through to `searchFlights()` and `lodgesForObjective()`, which
   * are local, deterministic and already labelled demo, so `/plan` stays fully
   * priced with nothing leaving the page.
   */
  if (OFFLINE) return offlineHealth();

  if (!healthCache) {
    healthCache = fetch("/api/health", { signal: AbortSignal.timeout?.(2500) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j): Health | null =>
        j && typeof j === "object"
          ? { flights: j.flights === "live" ? "live" : "not_connected", stays: j.stays === "live" ? "live" : "not_connected" }
          : null,
      )
      .catch(() => null);
  }
  return healthCache as Promise<Health | null>;
}

/* -------------------------------------------------------------------------- */
/* Flights                                                                    */
/* -------------------------------------------------------------------------- */

export interface FlightArgs {
  origin: Airport;
  destination: Airport;
  outIso: string;
  backIso: string;
  pax: number;
}

export async function resolveFlights(args: FlightArgs): Promise<{ source: DataSource; items: Itinerary[] }> {
  const health = await getHealth();
  if (health?.flights === "live") {
    try {
      const r = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (r.ok) {
        const d = await r.json();
        if (d?.connected && Array.isArray(d.items) && d.items.length) {
          return { source: "live", items: d.items as Itinerary[] };
        }
      }
    } catch {
      /* fall through to demo */
    }
  }
  return {
    source: "demo",
    items: searchFlights({ origin: args.origin, destination: args.destination, outIso: args.outIso, backIso: args.backIso }),
  };
}

export function useFlights(args: FlightArgs | null): { items: Itinerary[]; source: DataSource; loading: boolean } {
  const [state, setState] = useState<{ items: Itinerary[]; source: DataSource; loading: boolean }>({
    items: [],
    source: "demo",
    loading: Boolean(args),
  });
  const key = args ? JSON.stringify([args.origin.code, args.destination.code, args.outIso, args.backIso, args.pax]) : null;

  useEffect(() => {
    if (!args) {
      setState({ items: [], source: "demo", loading: false });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    resolveFlights(args).then((r) => {
      if (alive) setState({ items: r.items, source: r.source, loading: false });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

/* -------------------------------------------------------------------------- */
/* Stays                                                                      */
/* -------------------------------------------------------------------------- */

export interface StayArgs {
  objectiveId: string;
  cityName: string;
  country: string;
  lat: number;
  lon: number;
  checkinIso: string;
  checkoutIso: string;
  adults: number;
}

export async function resolveStays(args: StayArgs): Promise<{ source: DataSource; items: Lodge[] }> {
  const health = await getHealth();
  if (health?.stays === "live") {
    try {
      const r = await fetch("/api/stays/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (r.ok) {
        const d = await r.json();
        if (d?.connected && Array.isArray(d.items) && d.items.length) {
          return { source: "live", items: d.items as Lodge[] };
        }
      }
    } catch {
      /* fall through to demo */
    }
  }
  return { source: "demo", items: lodgesForObjective(args.objectiveId) };
}

export function useStays(args: StayArgs | null): { items: Lodge[]; source: DataSource; loading: boolean } {
  const [state, setState] = useState<{ items: Lodge[]; source: DataSource; loading: boolean }>({
    items: args ? lodgesForObjective(args.objectiveId) : [],
    source: "demo",
    loading: Boolean(args),
  });
  const key = args ? JSON.stringify([args.objectiveId, args.checkinIso, args.checkoutIso, args.adults]) : null;

  useEffect(() => {
    if (!args) {
      setState({ items: [], source: "demo", loading: false });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    resolveStays(args).then((r) => {
      if (alive) setState({ items: r.items, source: r.source, loading: false });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
