/**
 * The mountains ICEFALL knows about.
 *
 * ONE SOURCE OF TRUTH, and it exists because the alternative already bit us.
 * Summit altitudes were held in two places — the Explore catalogue and
 * `tripDetail.ts` — and they disagreed about Ama Dablam by two metres, which is
 * exactly how the four copies of the departure date came to disagree by six
 * weeks before `trip.ts` was written. A number a user can see in two places has
 * to be defined in one.
 *
 * Elevations are published figures, not ICEFALL's. Where sources differ by a
 * metre or two (Ama Dablam is variously 6,812 m and 6,814 m; Everest was 8,848 m
 * before the 2020 joint China–Nepal survey put it at 8,848.86 m) this file picks
 * one and everything downstream follows it.
 *
 * Only six of these have a bundled photograph. Every other card draws a
 * generated plate — see `app/peakPlate.ts` — never a photograph of a different
 * mountain.
 */

export interface Peak {
  /** Slug, and the image filename for the six that have one: /img/<id>.jpg */
  id: string;
  name: string;
  elevationM: number;
  range: string;
  country: string;
  region: Region;
}

export type Region =
  | "Himalaya & Asia"
  | "Americas"
  | "Europe"
  | "Africa"
  | "Oceania & Antarctica";

export const PEAKS: Peak[] = [
  // ── Himalaya & Asia ───────────────────────────────────────────────────────
  { id: "everest", name: "Mount Everest", elevationM: 8849, range: "Mahalangur Himal", country: "Nepal / China", region: "Himalaya & Asia" },
  { id: "k2", name: "K2", elevationM: 8611, range: "Karakoram", country: "Pakistan / China", region: "Himalaya & Asia" },
  { id: "kangchenjunga", name: "Kangchenjunga", elevationM: 8586, range: "Kangchenjunga Himal", country: "Nepal / India", region: "Himalaya & Asia" },
  { id: "lhotse", name: "Lhotse", elevationM: 8516, range: "Mahalangur Himal", country: "Nepal / China", region: "Himalaya & Asia" },
  { id: "makalu", name: "Makalu", elevationM: 8485, range: "Mahalangur Himal", country: "Nepal / China", region: "Himalaya & Asia" },
  { id: "cho-oyu", name: "Cho Oyu", elevationM: 8188, range: "Mahalangur Himal", country: "Nepal / China", region: "Himalaya & Asia" },
  { id: "dhaulagiri", name: "Dhaulagiri I", elevationM: 8167, range: "Dhaulagiri Himal", country: "Nepal", region: "Himalaya & Asia" },
  { id: "manaslu", name: "Manaslu", elevationM: 8163, range: "Mansiri Himal", country: "Nepal", region: "Himalaya & Asia" },
  { id: "nanga-parbat", name: "Nanga Parbat", elevationM: 8126, range: "Himalaya", country: "Pakistan", region: "Himalaya & Asia" },
  { id: "annapurna", name: "Annapurna I", elevationM: 8091, range: "Annapurna Himal", country: "Nepal", region: "Himalaya & Asia" },
  { id: "gasherbrum-i", name: "Gasherbrum I", elevationM: 8080, range: "Karakoram", country: "Pakistan / China", region: "Himalaya & Asia" },
  { id: "broad-peak", name: "Broad Peak", elevationM: 8051, range: "Karakoram", country: "Pakistan / China", region: "Himalaya & Asia" },
  { id: "gasherbrum-ii", name: "Gasherbrum II", elevationM: 8035, range: "Karakoram", country: "Pakistan / China", region: "Himalaya & Asia" },
  { id: "shishapangma", name: "Shishapangma", elevationM: 8027, range: "Jugal Himal", country: "China", region: "Himalaya & Asia" },
  { id: "muztagh-tower", name: "Muztagh Tower", elevationM: 7276, range: "Karakoram", country: "Pakistan / China", region: "Himalaya & Asia" },
  { id: "lenin-peak", name: "Lenin Peak", elevationM: 7134, range: "Trans-Alay", country: "Kyrgyzstan / Tajikistan", region: "Himalaya & Asia" },
  { id: "baruntse", name: "Baruntse", elevationM: 7129, range: "Mahalangur Himal", country: "Nepal", region: "Himalaya & Asia" },
  { id: "himlung-himal", name: "Himlung Himal", elevationM: 7126, range: "Peri Himal", country: "Nepal", region: "Himalaya & Asia" },
  { id: "khan-tengri", name: "Khan Tengri", elevationM: 7010, range: "Tian Shan", country: "Kazakhstan / Kyrgyzstan", region: "Himalaya & Asia" },
  { id: "ama-dablam", name: "Ama Dablam", elevationM: 6814, range: "Mahalangur Himal", country: "Nepal", region: "Himalaya & Asia" },
  { id: "kailash", name: "Mount Kailash", elevationM: 6638, range: "Gangdise", country: "China", region: "Himalaya & Asia" },
  { id: "mera-peak", name: "Mera Peak", elevationM: 6476, range: "Mahalangur Himal", country: "Nepal", region: "Himalaya & Asia" },
  { id: "island-peak", name: "Island Peak", elevationM: 6189, range: "Mahalangur Himal", country: "Nepal", region: "Himalaya & Asia" },
  { id: "lobuche-east", name: "Lobuche East", elevationM: 6119, range: "Mahalangur Himal", country: "Nepal", region: "Himalaya & Asia" },

  // ── Americas ──────────────────────────────────────────────────────────────
  { id: "aconcagua", name: "Aconcagua", elevationM: 6961, range: "Andes", country: "Argentina", region: "Americas" },
  { id: "ojos-del-salado", name: "Ojos del Salado", elevationM: 6893, range: "Andes", country: "Chile / Argentina", region: "Americas" },
  { id: "huascaran", name: "Huascarán", elevationM: 6768, range: "Cordillera Blanca", country: "Peru", region: "Americas" },
  { id: "chimborazo", name: "Chimborazo", elevationM: 6263, range: "Andes", country: "Ecuador", region: "Americas" },
  { id: "denali", name: "Denali", elevationM: 6190, range: "Alaska Range", country: "United States", region: "Americas" },
  { id: "logan", name: "Mount Logan", elevationM: 5959, range: "Saint Elias Mountains", country: "Canada", region: "Americas" },
  { id: "alpamayo", name: "Alpamayo", elevationM: 5947, range: "Cordillera Blanca", country: "Peru", region: "Americas" },
  { id: "cotopaxi", name: "Cotopaxi", elevationM: 5897, range: "Andes", country: "Ecuador", region: "Americas" },
  { id: "rainier", name: "Mount Rainier", elevationM: 4392, range: "Cascades", country: "United States", region: "Americas" },
  { id: "baker", name: "Mount Baker", elevationM: 3286, range: "Cascades", country: "United States", region: "Americas" },

  // ── Europe ────────────────────────────────────────────────────────────────
  { id: "elbrus", name: "Mount Elbrus", elevationM: 5642, range: "Caucasus", country: "Russia", region: "Europe" },
  { id: "dykh-tau", name: "Dykh-Tau", elevationM: 5205, range: "Caucasus", country: "Russia", region: "Europe" },
  { id: "ararat", name: "Mount Ararat", elevationM: 5137, range: "Armenian Highlands", country: "Turkey", region: "Europe" },
  { id: "kazbek", name: "Mount Kazbek", elevationM: 5054, range: "Caucasus", country: "Georgia / Russia", region: "Europe" },
  { id: "mont-blanc", name: "Mont Blanc", elevationM: 4806, range: "Graian Alps", country: "France / Italy", region: "Europe" },
  { id: "matterhorn", name: "Matterhorn", elevationM: 4478, range: "Pennine Alps", country: "Switzerland / Italy", region: "Europe" },
  { id: "eiger", name: "Eiger", elevationM: 3967, range: "Bernese Alps", country: "Switzerland", region: "Europe" },
  { id: "grossglockner", name: "Grossglockner", elevationM: 3798, range: "Hohe Tauern", country: "Austria", region: "Europe" },

  // ── Africa ────────────────────────────────────────────────────────────────
  { id: "kilimanjaro", name: "Mount Kilimanjaro", elevationM: 5895, range: "Eastern Rift", country: "Tanzania", region: "Africa" },
  { id: "mount-kenya", name: "Mount Kenya", elevationM: 5199, range: "Eastern Rift", country: "Kenya", region: "Africa" },
  { id: "stanley", name: "Mount Stanley", elevationM: 5109, range: "Rwenzori", country: "Uganda / DR Congo", region: "Africa" },
  { id: "speke", name: "Mount Speke", elevationM: 4890, range: "Rwenzori", country: "Uganda", region: "Africa" },
  { id: "toubkal", name: "Mount Toubkal", elevationM: 4167, range: "High Atlas", country: "Morocco", region: "Africa" },

  // ── Oceania & Antarctica ──────────────────────────────────────────────────
  { id: "vinson", name: "Vinson Massif", elevationM: 4892, range: "Sentinel Range", country: "Antarctica", region: "Oceania & Antarctica" },
  { id: "carstensz", name: "Carstensz Pyramid", elevationM: 4884, range: "Sudirman Range", country: "Indonesia", region: "Oceania & Antarctica" },
  { id: "aoraki", name: "Aoraki / Mount Cook", elevationM: 3724, range: "Southern Alps", country: "New Zealand", region: "Oceania & Antarctica" },
  { id: "fuji", name: "Mount Fuji", elevationM: 3776, range: "Fuji Volcanic Zone", country: "Japan", region: "Himalaya & Asia" },
  { id: "kosciuszko", name: "Mount Kosciuszko", elevationM: 2228, range: "Snowy Mountains", country: "Australia", region: "Oceania & Antarctica" },
];

/** Summit altitude for a peak NAME, for anything that only holds the name. */
export const SUMMIT_M: Record<string, number> = Object.fromEntries(
  PEAKS.map((p) => [p.name, p.elevationM]),
);

/**
 * The same, under the short names an expedition objective uses.
 *
 * A listing reads "Everest — South Col", not "Mount Everest — South Col", so
 * the objective's peak half will not match `name` for the eight peaks whose
 * catalogue name carries a "Mount"/"Mount X /" prefix.
 */
for (const p of PEAKS) {
  const short = p.name.replace(/^Mount\s+/, "").split(" / ")[0];
  if (!(short in SUMMIT_M)) SUMMIT_M[short] = p.elevationM;
}

/**
 * The name an expedition objective uses for this peak.
 *
 * The catalogue calls it "Mount Everest" and "Aoraki / Mount Cook", because
 * that is what they are called. A listing calls it "Everest — South Col". Both
 * are right, and matching one against the other by string equality quietly
 * broke fifteen peaks — Everest included, which reported "no listing covers
 * this peak" while carrying two. Anything comparing a peak to an objective must
 * go through here.
 */
export const shortPeakName = (p: Peak): string =>
  p.name.replace(/^Mount\s+/, "").split(" / ")[0];

/** The peak half of an objective: "Everest — South Col" -> "Everest". */
export const objectivePeak = (objective: string): string =>
  objective.split(" — ")[0].trim();

/** Whether a listing's objective is on this peak, in either naming form. */
export const objectiveIsOn = (objective: string, p: Peak): boolean => {
  const o = objectivePeak(objective);
  return o === p.name || o === shortPeakName(p);
};

export const peakByName = (name: string): Peak | undefined =>
  PEAKS.find((p) => p.name === name || p.name.replace(/^Mount\s+/, "") === name);
