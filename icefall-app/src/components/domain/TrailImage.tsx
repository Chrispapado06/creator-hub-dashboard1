import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { TrailPlate } from "@/components/domain/TrailPlate";
import {
  PLATE_CAPTION,
  PLATE_CAPTION_LOADING,
  PLATE_CAPTION_NO_IMAGERY,
  PLATE_CAPTION_OFFLINE,
  photoCaption,
  satelliteCredit,
  satelliteTiles,
  tileAttemptUrl,
  verifiedPhoto,
  type TrailPhoto,
} from "@/services/trailImagery";
import { cachedLengthKm } from "@/services/trails";
import { cn } from "@/lib/utils";
import { OFFLINE } from "@/offline/offline";

/**
 * The image on a trail card or hero.
 *
 * Three layers, painted in this order so the card is never blank and never
 * waits on the network to become presentable:
 *
 *   PLATE        drawn on the device, instantly, from the trail's own id
 *   SATELLITE    four Esri tiles of the actual coordinates, ~64 KB, fades in
 *   PHOTOGRAPH   a verified photo — Wikidata's exact relation join, or a
 *              class-filtered Geograph match within 2km — see `TrailPhoto`
 *
 * Each layer only ever covers the one beneath it once it has actually decoded,
 * so a slow or failed tile leaves the plate showing rather than a grey box.
 * `onCaption` reports back what is being shown, because the caption has to
 * describe the layer that won — satellite imagery and a photograph make very
 * different claims and must not share a line of text.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE SATELLITE LAYER IS THE WHOLE PRODUCT, AND WHY IT USED NOT TO ARRIVE
 *
 * 16,099 of 77,141 trails have a photograph — 20.9%, and the honest ceiling for
 * one that is genuinely OF the trail is under 1%. There is no harvest that
 * closes that. Tier 2 closes it: Esri returns real imagery for any coordinate
 * on earth, so every trail can show its own ground. Measured 2026-09-08 across
 * 118 tile loads: zero failures.
 *
 * And yet cards showed a drawing under the words "Contours — imagery loading".
 * Measured on 22 saved trails, 24 s after load, the page in front:
 *
 *   12 / 22   four tiles, correct
 *    1 / 22   TWO tiles, revealed anyway — top half aerial, hard seam, bottom
 *             half drawing, captioned "Satellite imagery · Esri…"
 *    9 / 22   ZERO tiles ever requested, "imagery loading" with no end
 *
 * Three separate defects, all fixed here:
 *
 *  1. `loading="lazy"` fired NEITHER `onLoad` NOR `onError` for a tile that was
 *     never scrolled to (MDN, `img#loading`), so `tilesReady + tilesFailed`
 *     could not reach 4 and the caption's last branch — "imagery loading" —
 *     had no exit at all. The failure counter added earlier fixed the ERROR
 *     path; the NEVER-ASKED path is the common one, because every caller
 *     renders lists. Deferral is still right, so it is done HERE, by an
 *     IntersectionObserver this component can see the answer from, and the
 *     tiles load eagerly once it says go. A gate that reports keeps the saving
 *     and loses the dead end.
 *
 *  2. The reveal threshold was `tilesReady >= 2`. Two tiles is enough to make
 *     the claim and not enough to make the picture. It is now every tile.
 *
 *  3. Nothing retried and nothing timed out. A tile that drops is the ordinary
 *     case on a phone; an <img> will not ask again by itself. Two retries with
 *     backoff, then a watchdog that ends the wait no matter what, so the
 *     caption always reaches a state that is true.
 */

/** Retries per tile before it counts as gone for good. */
const TILE_RETRIES = 2;
/** Backoff before each retry, ms — indexed by the attempt about to be made. */
const RETRY_BACKOFF_MS = [700, 1_800];
/**
 * The longest the caption may say "loading".
 *
 * Nothing here depends on the network being reachable, only on the wait being
 * FINITE. Two retries at 700 ms and 1.8 s plus three real attempts fit inside
 * this comfortably; anything still outstanding at the end is not coming, and
 * the plate is the right picture with the right words under it.
 */
const TILE_WATCHDOG_MS = 15_000;
/**
 * How far outside the viewport a card starts fetching. One card is ~220 px, so
 * this is roughly four cards of runway — enough that a scroll lands on imagery
 * that is already there, not so much that opening a 500-trail list fetches the
 * lot.
 */
const TILE_MARGIN_PX = 800;
const TILE_ROOT_MARGIN = `${TILE_MARGIN_PX}px 0px`;
/**
 * If the observer has not reported ANYTHING in this long, stop waiting on it.
 *
 * Not a duplicate of the gate — a distinction between two different silences.
 * An observer that reports `isIntersecting: false` is working, and waiting is
 * correct. An observer that reports nothing at all means observation is not
 * running in this environment, and waiting on it is how "loading" became
 * permanent in the first place. Measured 2026-09-08: in the embedded browser
 * pane, `document.visibilityState` is "hidden" and a freshly-constructed
 * IntersectionObserver on a real element delivered NO callback in two seconds —
 * so this is not a hypothetical branch, it is the one that runs there.
 *
 * What it falls back to is `getBoundingClientRect`, polled — NOT "load
 * everything". Giving up on the observer is not a reason to give up on
 * deferral: a hidden tab is precisely where fetching four tiles for each of
 * five hundred cards would be worst. The rect answers the same question the
 * observer was asked, just at 1.3 Hz and at the cost of a layout read.
 */
const OBSERVER_SILENCE_MS = 1_500;
/** How often the fallback re-asks. Slow — nobody is scrolling a page whose
 *  observer is not running. */
const RECT_POLL_MS = 750;

type TileDone = "ok" | "fail" | null;
interface TileState {
  attempt: number;
  done: TileDone;
}
type TileAction =
  | { t: "reset"; n: number }
  | { t: "ok"; i: number }
  | { t: "error"; i: number }
  | { t: "retry"; i: number }
  | { t: "giveUp" };

const freshTiles = (n: number): TileState[] =>
  Array.from({ length: n }, () => ({ attempt: 0, done: null }));

/**
 * Every transition a tile can make, in one place.
 *
 * A reducer rather than four `setState` calls because the error path has to
 * read the attempt count to decide between "try again" and "gone", and reading
 * state inside a handler is how the previous version ended up unable to tell
 * those apart. Every case is idempotent: a settled tile ignores everything, so
 * a late `onLoad` after the watchdog cannot resurrect a picture the caption has
 * already stopped promising.
 */
function tilesReducer(state: TileState[], a: TileAction): TileState[] {
  switch (a.t) {
    case "reset":
      return freshTiles(a.n);
    case "ok": {
      const cur = state[a.i];
      if (!cur || cur.done) return state;
      const next = state.slice();
      next[a.i] = { ...cur, done: "ok" };
      return next;
    }
    case "error": {
      const cur = state[a.i];
      if (!cur || cur.done) return state;
      // Out of retries: this tile is not coming. Otherwise leave it pending —
      // the retry timer scheduled alongside this dispatch does the re-request.
      if (cur.attempt >= TILE_RETRIES) {
        const next = state.slice();
        next[a.i] = { ...cur, done: "fail" };
        return next;
      }
      return state;
    }
    case "retry": {
      const cur = state[a.i];
      if (!cur || cur.done || cur.attempt >= TILE_RETRIES) return state;
      const next = state.slice();
      next[a.i] = { attempt: cur.attempt + 1, done: null };
      return next;
    }
    case "giveUp":
      if (state.every((t) => t.done)) return state;
      return state.map((t) => (t.done ? t : { ...t, done: "fail" }));
  }
}

export function TrailImage({
  osmId,
  lat,
  lon,
  name,
  lengthKm,
  onCaption,
  onPhoto,
  className,
}: {
  osmId: number;
  lat: number;
  lon: number;
  name: string;
  /**
   * The trail's mapped length, when the caller holds one.
   *
   * Optional, and absent means exactly what it meant before this existed: the
   * old fixed zoom 12. When it IS known the mosaic is sized to the trail, so a
   * 400 m circuit stops being a 16 km smudge and a 20 km route stops being
   * cropped out of its own picture. See `zoomFor`.
   */
  lengthKm?: number | null;
  onCaption?: (caption: string) => void;
  /** The resolved photo, once one is showing — for a caller that wants to
      render its own linked attribution (Geograph's terms require one). */
  onPhoto?: (photo: TrailPhoto | null) => void;
  className?: string;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  /** False until the card is near enough the viewport to be worth the bytes. */
  const [inRange, setInRange] = useState(false);
  const [photo, setPhoto] = useState<TrailPhoto | null>(null);
  const [photoReady, setPhotoReady] = useState(false);

  /*
   * THE FRAME IS DECIDED ONCE PER TRAIL AND THEN LEFT ALONE.
   *
   * Length arrives late for the many relations OSM gives no `distance` tag:
   * Routes measures the line itself, one trail at a time, and that can land
   * seconds after the card has settled. Feeding it straight into `satelliteTiles`
   * would change the zoom, change the tile URLs, reset the counters and fade a
   * finished mosaic back to the drawing for about a second — a card that had
   * real imagery visibly losing it, which is a worse thing to look at than a
   * slightly wide frame. So the length is taken once, when this trail first
   * appears, and held. Re-keyed on `osmId` rather than frozen outright, because
   * a list that re-orders can hand this component a different trail without
   * remounting it, and the previous trail's frame is simply wrong.
   *
   * `cachedLengthKm` is the fallback for callers that pass nothing — the trail
   * hero among them — so a length measured on an earlier visit still frames the
   * picture without every caller having to thread the prop through.
   */
  const framed = useRef<{ id: number; km: number | null | undefined }>({
    id: osmId,
    km: lengthKm ?? cachedLengthKm(osmId),
  });
  if (framed.current.id !== osmId) {
    framed.current = { id: osmId, km: lengthKm ?? cachedLengthKm(osmId) };
  }
  const framedKm = framed.current.km;

  const tiles = useMemo(() => satelliteTiles(lat, lon, framedKm), [lat, lon, framedKm]);
  /** Identity of the current tile set, so counts reset when the place changes. */
  const tileKey = tiles.join("|");

  const [tileState, dispatch] = useReducer(tilesReducer, tiles.length, freshTiles);

  // Without this a second trail inherits the first one's counts and can caption
  // itself from imagery it never loaded.
  useEffect(() => {
    dispatch({ t: "reset", n: tiles.length });
    // `tiles.length` is constant for a given tileKey; keying on the URLs is what
    // makes "different place" the trigger rather than "re-render".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileKey]);

  /* ---------------------------------------------------------------- the gate */
  useEffect(() => {
    if (inRange) return;
    const el = root.current;
    if (!el) {
      setInRange(true);
      return;
    }

    /** The observer's question, asked directly. */
    const nearViewport = () => {
      const r = el.getBoundingClientRect();
      const h = window.innerHeight || document.documentElement.clientHeight || 0;
      if (r.bottom >= -TILE_MARGIN_PX && r.top <= h + TILE_MARGIN_PX) setInRange(true);
    };

    let observerSpoke = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              observerSpoke = true;
              if (entries.some((e) => e.isIntersecting)) setInRange(true);
            },
            { rootMargin: TILE_ROOT_MARGIN },
          );
    io?.observe(el);

    const silence = setTimeout(
      () => {
        if (observerSpoke) return;
        nearViewport();
        poll = setInterval(nearViewport, RECT_POLL_MS);
      },
      io ? OBSERVER_SILENCE_MS : 0,
    );

    return () => {
      clearTimeout(silence);
      if (poll) clearInterval(poll);
      io?.disconnect();
    };
  }, [inRange]);

  /* ------------------------------------------------------------ the watchdog */
  useEffect(() => {
    if (!inRange || tiles.length === 0) return;
    const t = setTimeout(() => dispatch({ t: "giveUp" }), TILE_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [inRange, tileKey, tiles.length]);

  /* -------------------------------------------------------------- the retries */
  const retryTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const t of retryTimers.current) clearTimeout(t);
      retryTimers.current = [];
    },
    [tileKey],
  );

  const onTileError = useCallback((i: number, attempt: number) => {
    // Marks the tile gone if this was the last attempt; a no-op otherwise.
    dispatch({ t: "error", i });
    if (attempt >= TILE_RETRIES) return;
    const wait = RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
    const timer = setTimeout(() => dispatch({ t: "retry", i }), wait);
    retryTimers.current.push(timer);
  }, []);

  /** Every tile decoded. Nothing less is shown — see defect 2 above. */
  const tilesShowing = tiles.length > 0 && tileState.every((t) => t.done === "ok");
  /** Every tile answered one way or the other. */
  const tilesSettled = tiles.length > 0 && tileState.every((t) => t.done !== null);

  useEffect(() => {
    let live = true;
    // Cleared FIRST, not on unmount: a card recycled onto a different trail
    // otherwise keeps the previous trail's photograph mounted — invisible, but
    // still the thing `onPhoto` reports and the thing the caption describes.
    setPhoto(null);
    setPhotoReady(false);
    verifiedPhoto(osmId).then((p) => {
      if (live) setPhoto(p);
    });
    return () => {
      live = false;
    };
  }, [osmId]);

  // The caption follows whichever layer is actually visible.
  useEffect(() => {
    if (!onCaption) return;
    if (photo && photoReady) onCaption(photoCaption(name, photo));
    else if (tilesShowing) onCaption(satelliteCredit(lat, framedKm));
    /*
     * Every tile answered and too few arrived to show. This is the terminal
     * state the caption used to lack: it names what the picture IS — a drawing
     * made on the device — rather than promising a photograph that is not
     * coming. "Loading" that never resolves is a lie with a spinner's manners.
     */
    else if (tilesSettled) onCaption(PLATE_CAPTION_NO_IMAGERY);
    // Offline the satellite layer will never arrive, so the caption must not
    // sit on "loading" forever pretending that it might.
    else if (OFFLINE) onCaption(PLATE_CAPTION_OFFLINE);
    /*
     * Nothing has been ASKED for yet — the card is below the fold. Describing
     * the drawing is the truth here; "loading" would be a promise about a
     * request that does not exist, which is precisely the sentence that used to
     * sit on nine cards in twenty-two forever.
     */
    else if (!inRange) onCaption(PLATE_CAPTION);
    else onCaption(PLATE_CAPTION_LOADING);
  }, [
    photo,
    photoReady,
    tilesShowing,
    tilesSettled,
    inRange,
    name,
    lat,
    framedKm,
    onCaption,
  ]);

  useEffect(() => {
    onPhoto?.(photoReady ? photo : null);
  }, [photo, photoReady, onPhoto]);

  return (
    <div ref={root} className={cn("relative overflow-hidden", className)}>
      {/* 1 — always painted, never waits on anything */}
      <TrailPlate seed={osmId} className="absolute inset-0 h-full w-full" />

      {/*
        2 — the ground itself.

        The mosaic is a SQUARE that is centred and allowed to overflow, rather
        than a grid stretched to the card. Map tiles are square; fitting four of
        them into a 2:1 card meant each cell was 167x85 and `object-cover`
        cropped every tile independently, so the halves no longer lined up and a
        seam ran across the middle of every card. Sized to the card's width and
        centred vertically, each tile keeps its own aspect, the four butt
        together exactly, and the card crops the square top and bottom.
      */}
      <div
        className={cn(
          "absolute left-1/2 top-1/2 aspect-square w-full -translate-x-1/2 -translate-y-1/2",
          "grid grid-cols-2 grid-rows-2 transition-opacity duration-500",
          tilesShowing ? "opacity-100" : "opacity-0",
        )}
      >
        {inRange &&
          tiles.map((src, i) => (
            /*
              `key` carries the attempt, so a retry is a NEW element rather than
              a src swap on a broken one — the only way to be sure the browser
              re-requests rather than re-serving what it already failed on.

              `loading="eager"` is deliberate and is the fix for defect 1: this
              element does not exist until the gate above says the card is worth
              loading, so lazily deferring it a second time buys nothing and
              costs the events the caption depends on.
            */
            <img
              key={`${src}#${tileState[i]?.attempt ?? 0}`}
              src={tileAttemptUrl(src, tileState[i]?.attempt ?? 0)}
              alt=""
              aria-hidden
              loading="eager"
              decoding="async"
              onLoad={() => dispatch({ t: "ok", i })}
              onError={() => onTileError(i, tileState[i]?.attempt ?? 0)}
              className="block h-full w-full"
            />
          ))}
      </div>

      {/* 3 — a photograph, only when a person recorded the link — see `kind` */}
      {photo && inRange && (
        <img
          src={photo.src}
          alt=""
          aria-hidden
          loading="eager"
          decoding="async"
          onLoad={() => setPhotoReady(true)}
          /* A photo that 404s must not leave the caller rendering attribution
             for a picture nobody can see. Dropping it hands the card back to
             the satellite layer, which is a true image of the same place. */
          onError={() => {
            setPhotoReady(false);
            setPhoto(null);
          }}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            photoReady ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
