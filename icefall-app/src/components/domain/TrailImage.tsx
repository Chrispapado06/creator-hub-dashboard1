import { useEffect, useState } from "react";
import { TrailPlate } from "@/components/domain/TrailPlate";
import {
  SATELLITE_CREDIT, photoCaption, satelliteTiles, verifiedPhoto, type TrailPhoto,
} from "@/services/trailImagery";
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
 */
export function TrailImage({
  osmId,
  lat,
  lon,
  name,
  onCaption,
  onPhoto,
  className,
}: {
  osmId: number;
  lat: number;
  lon: number;
  name: string;
  onCaption?: (caption: string) => void;
  /** The resolved photo, once one is showing — for a caller that wants to
      render its own linked attribution (Geograph's terms require one). */
  onPhoto?: (photo: TrailPhoto | null) => void;
  className?: string;
}) {
  const [tilesReady, setTilesReady] = useState(0);
  const [photo, setPhoto] = useState<TrailPhoto | null>(null);
  const [photoReady, setPhotoReady] = useState(false);

  const tiles = satelliteTiles(lat, lon);

  useEffect(() => {
    let live = true;
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
    else if (tilesReady >= 2) onCaption(SATELLITE_CREDIT);
    // Offline the satellite layer will never arrive, so the caption must not
    // sit on "loading" forever pretending that it might.
    else if (OFFLINE) onCaption("Contours drawn on the device — imagery needs a connection");
    else onCaption("Contours — imagery loading");
  }, [photo, photoReady, tilesReady, name, onCaption]);

  useEffect(() => {
    onPhoto?.(photoReady ? photo : null);
  }, [photo, photoReady, onPhoto]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
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
          tilesReady >= 2 ? "opacity-100" : "opacity-0",
        )}
      >
        {tiles.map((src) => (
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            onLoad={() => setTilesReady((n) => n + 1)}
            className="block h-full w-full"
          />
        ))}
      </div>

      {/* 3 — a photograph, only when Wikidata vouches for this exact relation */}
      {photo && (
        <img
          src={photo.src}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          onLoad={() => setPhotoReady(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            photoReady ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
