import { COMPANIES } from "./companies";
import { EXPEDITIONS, GUIDES, IS_DEMO } from "./demo";
import { PEAKS } from "./peaks";
import { TREKS } from "./treks";

/**
 * One search across everything ICEFALL knows.
 *
 * The header's search box had no handler at all — it has looked functional
 * since the shell was written and did nothing when you typed in it. This is
 * what it was always meant to call.
 *
 * RESULTS ARE TYPED, and that is the point rather than a decoration. "Everest"
 * is a mountain, an expedition and three treks; "Kilimanjaro Machame" is a trek
 * and not a climb of the summit. A flat list would hide the one distinction a
 * reader is actually trying to make.
 */

export type ResultKind = "Mountain" | "Trek" | "Expedition" | "Guide" | "Company";

export interface SearchResult {
  kind: ResultKind;
  id: string;
  title: string;
  /** The line under the title — enough to tell two similar hits apart. */
  detail: string;
  to: string;
  /** Lower sorts first within a kind. */
  rank: number;
}

/** Kinds in the order they are shown. Mountains and treks lead: they are facts. */
export const KIND_ORDER: ResultKind[] = ["Mountain", "Trek", "Expedition", "Guide", "Company"];

/**
 * Scores a hit, or returns null.
 *
 * A prefix match beats a word-boundary match beats a substring, so typing
 * "inca" puts "Inca Trail to Machu Picchu" above "Vilcabamba to Machu Picchu"
 * rather than ordering them by however the array happens to be built.
 */
function score(haystack: string, needle: string): number | null {
  const h = haystack.toLowerCase();
  const i = h.indexOf(needle);
  if (i === -1) return null;
  if (i === 0) return 0;
  if (/\s|[-–/]/.test(h[i - 1] ?? "")) return 1;
  return 2;
}

export function searchAll(query: string, limitPerKind = 5): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: SearchResult[] = [];

  for (const p of PEAKS) {
    const s = score(`${p.name} ${p.range} ${p.country}`, q);
    if (s !== null)
      out.push({
        kind: "Mountain",
        id: p.id,
        title: p.name,
        detail: `${p.elevationM.toLocaleString("en-GB")} m · ${p.country}`,
        to: `/app/mountains/${p.id}`,
        rank: s,
      });
  }

  for (const t of TREKS) {
    const s = score(`${t.name} ${t.country} ${t.style}`, q);
    if (s !== null)
      out.push({
        kind: "Trek",
        id: t.id,
        title: t.name,
        detail: [
          t.country,
          t.durationDays ? `${t.durationDays[0]}–${t.durationDays[1]} days` : null,
          t.difficulty,
        ]
          .filter(Boolean)
          .join(" · "),
        to: `/app/trek/${t.id}`,
        rank: s,
      });
  }

  if (IS_DEMO) {
    for (const e of EXPEDITIONS) {
      const s = score(`${e.objective} ${e.company} ${e.country}`, q);
      if (s !== null)
        out.push({
          kind: "Expedition",
          id: e.id,
          title: e.objective,
          detail: `${e.company} · ${e.durationDays} days`,
          to: `/app/trip/${e.id}`,
          rank: s,
        });
    }

    for (const g of GUIDES) {
      const s = score(`${g.name} ${g.basedIn} ${g.mountains.join(" ")}`, q);
      if (s !== null)
        out.push({
          kind: "Guide",
          id: g.id,
          title: g.name,
          detail: `${g.credential} · ${g.basedIn}`,
          to: `/app/guides/${g.id}`,
          rank: s,
        });
    }

    for (const c of COMPANIES) {
      const s = score(`${c.name} ${c.city} ${c.tagline}`, q);
      if (s !== null)
        out.push({
          kind: "Company",
          id: c.id,
          title: c.name,
          detail: c.city,
          to: `/app/company/${c.id}`,
          rank: s,
        });
    }
  }

  // Best matches first within each kind, then capped so one kind cannot
  // swamp the panel — "everest" matches a great many things.
  const byKind = new Map<ResultKind, SearchResult[]>();
  for (const r of out) {
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }
  return KIND_ORDER.flatMap((k) =>
    (byKind.get(k) ?? [])
      .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
      .slice(0, limitPerKind),
  );
}

/** Totals per kind, for the "N in Treks" line under the panel. */
export function searchCounts(query: string): Record<ResultKind, number> {
  const all = searchAll(query, Number.MAX_SAFE_INTEGER);
  const counts = { Mountain: 0, Trek: 0, Expedition: 0, Guide: 0, Company: 0 };
  for (const r of all) counts[r.kind] += 1;
  return counts;
}
