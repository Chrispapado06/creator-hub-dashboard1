/**
 * Satellite imagery for the web app.
 *
 * The SAME Esri World Imagery source the phone app uses, and it carries the
 * same unresolved problem: the keyless tier is licensed for NONCOMMERCIAL USE
 * only (Esri doc G577 §2.2), and ICEFALL defines a paid tier. The fix is an
 * ArcGIS Location Platform key — 2M tiles/month free, then metered — which
 * needs an account nobody has created yet. Adding satellite here widens that
 * exposure to a second app; it does not create a new problem.
 *
 * When the key exists, only `TILE_URL` changes.
 */
export const TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const SATELLITE_CREDIT = "Esri, Vantor, Earthstar Geographics";

const lonToX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** One static tile of a place — the card thumbnail, no map library needed. */
export function tileFor(lat: number, lon: number, z = 11): string {
  return TILE_URL.replace("{z}", String(z))
    .replace("{y}", String(latToY(lat, z)))
    .replace("{x}", String(lonToX(lon, z)));
}

/** A 2x2 mosaic, for a card wide enough that one tile looks stretched. */
export function tileMosaic(lat: number, lon: number, z = 11): string[] {
  const x = lonToX(lon, z);
  const y = latToY(lat, z);
  const max = 2 ** z - 1;
  const cx = Math.min(Math.max(x, 0), max - 1);
  const cy = Math.min(Math.max(y, 0), max - 1);
  const at = (tx: number, ty: number) =>
    TILE_URL.replace("{z}", String(z)).replace("{y}", String(ty)).replace("{x}", String(tx));
  return [at(cx, cy), at(cx + 1, cy), at(cx, cy + 1), at(cx + 1, cy + 1)];
}
