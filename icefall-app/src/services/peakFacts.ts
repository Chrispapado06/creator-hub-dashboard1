import { useEffect, useState } from "react";

/**
 * Sourced facts about a catalogue peak, harvested at build time.
 *
 * Built by `scripts/harvest-peak-facts.mjs` into `public/data/peak-facts/*.json`
 * and keyed by Wikidata QID, which joins to the `d` field on a catalogue peak.
 * That id is the ONLY thing linking a peak to its facts: it is an exact entity
 * match, never a name match and never a proximity match. `MountainImage.tsx`
 * records what proximity matching cost the last time it was tried — Cyprus got
 * a stranger's selfie and Chamonix a war memorial.
 *
 * Every value here arrived as a TYPED SPARQL BINDING — a quantity with a unit,
 * a date, an item label. Nothing arrived as a sentence, because a sentence is
 * where an anonymous editor's route advice lives. The harvest script's header
 * carries the measurements behind that rule.
 */

/**
 * How well backed a harvested number is.
 *
 * This distinction is not decoration. Measured across 209 sampled peaks, 90% of
 * elevation statements on Wikidata carry a "reference" — but 70% of those
 * references are P143 "imported from Wikimedia project", which is a bot
 * recording that it scraped the number out of an infobox. That is a
 * breadcrumb, not a source. Only 21% name a citable external source.
 *
 * "Every harvested fact carries its source" is therefore UNACHIEVABLE for about
 * four elevations in five, and the honest response is to say which kind of
 * backing a number has rather than to imply they are all the same.
 */
export type FactSource = "cited" | "imported" | "none";

export interface SourcedMetres {
  m: number;
  src: FactSource;
}
export interface SourcedKm {
  km: number;
  src: FactSource;
}

export interface PeakFacts {
  /** English label, via en → mul → sitelink. See `labelFromMul`. */
  label?: string;
  /**
   * True when the name came from the `mul` (multiple languages) code rather
   * than `en`. DENALI IS ONE OF THESE: its English name migrated to `mul`, so
   * a plain `FILTER(LANG(?l)="en")` misses it and the label service hands back
   * the literal string "Q130018".
   */
  labelFromMul?: boolean;
  labelFromSitelink?: boolean;
  /** Wikidata's own one-line description. CC0, and measured free of judgement. */
  description?: string;
  range?: string;
  country?: string;
  commons?: string;
  article?: string;
  prominence?: SourcedMetres;
  isolation?: SourcedKm;
  /** Wikidata's elevation, kept as CORROBORATION — OSM's is not overwritten. */
  elevationWikidata?: SourcedMetres;
  /**
   * Metres of disagreement between Wikidata and OSM, when it exceeds 10 m.
   *
   * Present means the two sources genuinely differ and the page says so rather
   * than picking a winner behind the reader's back. Measured: 31% of peaks
   * differ by more than 1 m, 7 of 209 by more than 50 m, worst 296 m.
   */
  elevationDisputed?: number;
  firstAscent?: { date?: string; party?: string[] };
}

interface FactsFile {
  v: number;
  built: string;
  attribution: string;
  shard: number;
  of: number;
  facts: Record<string, PeakFacts>;
}

/*
 * SIXTEEN SHARDS, BY ENTITY ID — the same FNV-1a-mod-16 the harvest script
 * uses to write them. One file for the world measured 6.1 MB raw / 870 KB
 * gzipped, all of it pulled the first time any reference page opened. A shard
 * is ~55 KB gzipped, and the service worker keeps each one it has fetched.
 * There is no manifest: this function IS the contract, in two places.
 */
const SHARDS = 16;
function shardOf(qid: string): number {
  let h = 2166136261;
  for (let i = 0; i < qid.length; i += 1) {
    h ^= qid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % SHARDS;
}

const promises = new Map<number, Promise<FactsFile | null>>();

function load(shard: number): Promise<FactsFile | null> {
  let p = promises.get(shard);
  if (!p) {
    p = fetch(`/data/peak-facts/${shard}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<FactsFile>) : null))
      .catch(() => null);
    promises.set(shard, p);
  }
  return p;
}

/**
 * WHY there are no facts, when there are none — because the screen has to say.
 *
 *   none      the peak carries no Wikidata id, so nothing was ever harvested
 *   loading   the shard is on its way
 *   ready     the shard loaded; `facts` is what it holds for this id, which
 *             may legitimately be null
 *   failed    the shard could not be fetched or parsed
 *
 * The last one is the reason this type exists. The hook used to collapse a
 * failed fetch into `null`, and the page rendered `null` as "No description
 * recorded for this peak in Wikidata" — a statement about Wikidata that was
 * simply false. Measured on 2026-09-10 against Mount Robson (Q1161258, which
 * carries a description, a range, a cited prominence and a first ascent): a
 * dev server that answered the shard request with its HTML fallback produced
 * exactly that sentence on a page whose facts existed on disk. A missing value
 * must be a NAMED absence saying why; "could not load" and "Wikidata has
 * nothing" are different reasons and get different sentences.
 */
export type FactsState = "none" | "loading" | "ready" | "failed";

/**
 * Facts for one peak, with the state that explains a null.
 *
 * Null facts are a legitimate and common answer — 38% of catalogue peaks carry
 * no Wikidata id at all, and some that do carry nothing beyond a label. The
 * screen shows what exists and, for what does not, says which of the four
 * reasons applies.
 */
export function usePeakFacts(wikidataId?: string): { facts: PeakFacts | null; state: FactsState } {
  const [result, setResult] = useState<{ facts: PeakFacts | null; state: FactsState }>({
    facts: null,
    state: wikidataId ? "loading" : "none",
  });

  useEffect(() => {
    if (!wikidataId) {
      setResult({ facts: null, state: "none" });
      return;
    }
    let live = true;
    setResult({ facts: null, state: "loading" });
    load(shardOf(wikidataId)).then((file) => {
      if (!live) return;
      // `load` answers null only when the shard could not be fetched or
      // parsed. A shard that loaded and has no row for this id is "ready"
      // with null facts — Wikidata genuinely holds nothing we harvested.
      setResult(
        file ? { facts: file.facts[wikidataId] ?? null, state: "ready" } : { facts: null, state: "failed" },
      );
    });
    return () => {
      live = false;
    };
  }, [wikidataId]);

  return result;
}

/** How a harvested number's backing is described to the reader, in words. */
export const SOURCE_LABEL: Record<FactSource, string> = {
  cited: "Wikidata, cited source",
  imported: "Wikidata, from a Wikipedia infobox",
  none: "Wikidata, unreferenced",
};

export const FACTS_ATTRIBUTION =
  "Facts from Wikidata (CC0). Position and elevation © OpenStreetMap contributors (ODbL).";

/**
 * A Wikidata date is not always a day.
 *
 * Precision varies — "1786-08-08" is a real date, "1865-01-01" is very often
 * an editor recording only the year. The ISO string alone cannot tell you
 * which, so a first-of-January is rendered as the year rather than asserting a
 * day nobody claimed.
 */
export function formatAscentDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  if (mo === "01" && d === "01") return y;
  const month = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][Number(mo) - 1];
  if (d === "01") return `${month} ${y}`;
  return `${Number(d)} ${month} ${y}`;
}
