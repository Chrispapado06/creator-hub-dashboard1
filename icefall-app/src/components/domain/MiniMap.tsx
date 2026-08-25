import { cn } from "@/lib/utils";

/**
 * The little map thumbnail in the corner of a result card.
 *
 * The reference this layout follows puts a traced route line in this tile.
 * ICEFALL holds no GPX for any of its lines — `RouteDetail` says so in as many
 * words — so drawing a squiggle here would be the single most convincing lie on
 * the screen: a shape that looks surveyed, at a size too small to question.
 *
 * What it shows instead is true: the actual map at the actual coordinates, with
 * a marker on the summit. Same visual beat, nothing invented.
 *
 * Tiles come from OpenStreetMap's own raster service. That service is intended
 * for light use — a handful of tiles per screen is fine, but if this ever ships
 * at volume it needs a proper tile provider (the app already uses openfreemap's
 * vector tiles for the full-screen map).
 */

const TILE = "https://tile.openstreetmap.org";

/** Web-Mercator tile coordinates for a point. */
function tileFor(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x, y };
}

export function MiniMap({
  lat,
  lon,
  zoom = 11,
  className,
}: {
  lat?: number;
  lon?: number;
  zoom?: number;
  className?: string;
}) {
  if (lat === undefined || lon === undefined) return null;
  const { x, y } = tileFor(lat, lon, zoom);

  return (
    <span
      className={cn(
        "relative block overflow-hidden rounded-[10px] border border-hairline-strong bg-slate",
        className,
      )}
    >
      <img
        src={`${TILE}/${zoom}/${x}/${y}.png`}
        alt=""
        aria-hidden
        loading="lazy"
        // The map is a bright raster in a dark app; hold it back so it reads as
        // a thumbnail rather than a light box punched into the card.
        className="h-full w-full object-cover opacity-70 saturate-[0.6]"
      />
      <span className="absolute inset-0 bg-obsidian/25" />
      {/* The summit itself. The tile is only ever centred to within a tile, so
          this marks the middle rather than pretending to pinpoint. */}
      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-azure ring-2 ring-obsidian/70" />
    </span>
  );
}

/**
 * A wash of map behind the search header.
 *
 * The reference is a map-first app, so its search sits on the map itself. Here
 * it is orientation, not the product: enough to see the shape of the ground you
 * are searching, held well back so the controls stay legible on a dark screen.
 *
 * Two things the first cut got wrong: the tiles were `loading="lazy"`, so the
 * ones off to the left often had not arrived and the header showed a hard edge
 * with half a map in it; and at 38% opacity a street map's labels read as
 * clutter rather than terrain. Now: eager, a grid wide enough to cover any phone,
 * and faint.
 */
export function MapBackdrop({
  lat,
  lon,
  zoom = 8,
  className,
}: {
  lat: number;
  lon: number;
  zoom?: number;
  className?: string;
}) {
  const { x, y } = tileFor(lat, lon, zoom);
  const cols = [-1, 0, 1];
  const rows = [-1, 0];

  return (
    <span className={cn("pointer-events-none absolute inset-0 block overflow-hidden", className)}>
      <span
        className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2"
        style={{ gridTemplateColumns: "repeat(3, 256px)", gridAutoRows: "256px" }}
      >
        {rows.map((dy) =>
          cols.map((dx) => (
            <img
              key={`${dx},${dy}`}
              src={`${TILE}/${zoom}/${x + dx}/${y + dy}.png`}
              alt=""
              aria-hidden
              className="h-[256px] w-[256px] opacity-[0.16] grayscale-[0.5] saturate-[0.4]"
            />
          )),
        )}
      </span>
    </span>
  );
}
