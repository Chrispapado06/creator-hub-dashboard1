import { useState, type ReactNode } from "react";
import { OFFLINE } from "@/offline/offline";
import { MapThumbPlaceholder } from "@/offline/MapPlaceholder";
import { tileFor } from "./mapTiles";
import { useTrailPhoto, type Trail } from "./trails";

/**
 * The picture on a trail card — a photograph where one exists, the satellite
 * tile where one does not.
 *
 * ── THE CREDIT IS DRAWN BY THE SAME BRANCH THAT DRAWS THE PHOTOGRAPH ────────
 *
 * Deliberately, and it is the whole point of this file. 14,783 of the 15,928
 * photographs in the index are CC BY or CC BY-SA, which require the
 * photographer's name and the licence to be VISIBLE wherever the image is
 * shown. The phone app has two recorded bugs from getting this wrong in a
 * component: one branch dropped the credit entirely, and another hardcoded
 * "CC BY-SA 2.0 · Geograph" onto every entry, which became false the moment
 * Commons photographs arrived under other licences.
 *
 * Two things stop that happening here. `useTrailPhoto` returns `src` and
 * `attribution` on ONE object or returns null — there is no way to obtain the
 * image without the credit, and the eight entries with no photographer
 * recorded are filtered at that boundary, not here. And the credit is rendered
 * in the same `photo !== null` branch as the `<img>`, so an edit that removes
 * it has to remove the photograph too.
 *
 * **A TRUNCATED ATTRIBUTION IS NOT AN ATTRIBUTION.** Nothing in this file may
 * gain `truncate`, `text-ellipsis`, a fixed height or an `overflow-hidden` that
 * clips the credit — a name cut to "Haef…" satisfies nobody's licence. The
 * plate wraps instead, and the card is wide enough that it rarely needs to.
 *
 * ── WHY THE TILE STAYS FOR THE REST ─────────────────────────────────────────
 *
 * Coverage is 19% and uneven: 99% across England, Wales and Scotland because
 * Geograph is a British archive with a free licence and an API, and 10% in
 * France because there is no Geograph for the Alps. A French trail with no
 * photograph is the ordinary case, four times in five.
 *
 * So the satellite tile the card has always shown remains the fallback. It is
 * not a substitute photograph — it is a picture of the coordinates, which is
 * what it has always been, and it is honest about being that. What must NEVER
 * appear here is a generic mountain stock image standing in for a specific
 * place nobody has photographed.
 *
 * Note that adding photographs NARROWS the app's Esri exposure rather than
 * widening it: 19% of these cards stop requesting a tile. That exposure is
 * real and recorded in `mapTiles.ts` — the keyless World Imagery tier is
 * licensed for noncommercial use only and ICEFALL defines a paid tier.
 */
export function TrailThumb({ trail, children }: { trail: Trail; children?: ReactNode }) {
  const found = useTrailPhoto(trail.osmId);
  /*
    A photograph that fails to load falls back to the tile rather than leaving a
    broken frame.

    Worth having because 2,251 of the 15,928 entries are LOCAL paths
    (`/data/trails/geograph/…`) rather than remote URLs, served out of a 253 MB
    directory that has to be present in this tree — and it is the British
    trails, the best-covered region at 99%, that depend on it. A deploy that
    ships `photos.json` without that directory would put a broken frame on
    every British card where a tile used to be.

    (I first "found" that as a live bug — 19 of 33 images measuring 0px wide.
    They were not broken: `loading="lazy"` means anything below the fold has
    not loaded and reports zero width. Every file was on disk and every URL
    returned 200. Scrolled, all 33 load. The fallback stays because the deploy
    risk above is real, but nothing here was broken.)
  */
  const [failed, setFailed] = useState<string | null>(null);
  const photo = found !== null && found.src !== failed ? found : null;

  return (
    <span className="relative block aspect-[16/9] w-full overflow-hidden bg-slate">
      {photo !== null ? (
        <>
          <img
            src={photo.src}
            alt=""
            aria-hidden
            loading="lazy"
            onError={() => setFailed(photo.src)}
            className="h-full w-full object-cover"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-graphite via-transparent to-transparent" />
          {/*
            The licence line. Same plate as the map's "Esri, Vantor, Earthstar
            Geographics", so the site says "this picture is somebody else's" in
            one voice. No truncation — see the note at the top of this file.
          */}
          <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] rounded-[6px] bg-obsidian/[0.72] px-1.5 py-1 text-[10.5px] leading-tight text-mist">
            {photo.attribution}
          </span>
        </>
      ) : OFFLINE ? (
        <MapThumbPlaceholder />
      ) : (
        <>
          {/*
            The satellite tile — the ONLY <img> on this page with no onError
            fallback. Offline every card becomes an empty slate box and the
            screen reads as broken, so OFFLINE takes the placeholder above
            instead. The list itself is local JSON and stays populated.
          */}
          <img
            src={tileFor(trail.lat, trail.lon, 10)}
            alt=""
            aria-hidden
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-graphite via-transparent to-transparent" />
        </>
      )}
      {children}
    </span>
  );
}
