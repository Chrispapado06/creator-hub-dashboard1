/**
 * THE PEAK CATALOGUE A GUIDE PICKS FROM.
 *
 * GENERATED, NOT HAND-WRITTEN — from
 * `icefall-sessions/requests/05-canonical-destinations-extract.json`, which the
 * brain session produced from Session 02's owned catalogues precisely so there
 * is ONE place a change has to reach. This family has already been bitten by two
 * copies of a catalogue drifting apart (`trekRecords.ts` against the phone app's
 * copy, and two summit altitudes disagreeing about Ama Dablam by two metres).
 *
 * DO NOT HAND-EDIT. Regenerate from the extract if it changes, and if a peak is
 * missing from the extract that is a request to Session 02, not a line to add
 * here.
 *
 * `hasPhoto` records whether the credited library actually holds a photograph
 * for this peak — checked against the files, not assumed. Where it is false the
 * guide sees the drawn ridge rather than a photograph of somewhere else.
 */

export interface Peak {
  id: string;
  name: string;
  elevationM: number | null;
  range: string;
  country: string;
  region: string;
  hasPhoto: boolean;
}

export const PEAKS: Peak[] = [
  { id: "aconcagua", name: "Aconcagua", elevationM: 6961, range: "Andes", country: "Argentina", region: "Americas", hasPhoto: true },
  { id: "alpamayo", name: "Alpamayo", elevationM: 5947, range: "Cordillera Blanca", country: "Peru", region: "Americas", hasPhoto: true },
  { id: "ama-dablam", name: "Ama Dablam", elevationM: 6814, range: "Mahalangur Himal", country: "Nepal", region: "Himalaya & Asia", hasPhoto: true },
  { id: "annapurna", name: "Annapurna I", elevationM: 8091, range: "Annapurna Himal", country: "Nepal", region: "Himalaya & Asia", hasPhoto: true },
  { id: "aoraki", name: "Aoraki / Mount Cook", elevationM: 3724, range: "Southern Alps", country: "New Zealand", region: "Oceania & Antarctica", hasPhoto: true },
  { id: "baruntse", name: "Baruntse", elevationM: 7129, range: "Mahalangur Himal", country: "Nepal", region: "Himalaya & Asia", hasPhoto: true },
  { id: "broad-peak", name: "Broad Peak", elevationM: 8051, range: "Karakoram", country: "Pakistan / China", region: "Himalaya & Asia", hasPhoto: true },
  { id: "carstensz", name: "Carstensz Pyramid", elevationM: 4884, range: "Sudirman Range", country: "Indonesia", region: "Oceania & Antarctica", hasPhoto: true },
  { id: "chimborazo", name: "Chimborazo", elevationM: 6263, range: "Andes", country: "Ecuador", region: "Americas", hasPhoto: true },
  { id: "cho-oyu", name: "Cho Oyu", elevationM: 8188, range: "Mahalangur Himal", country: "Nepal / China", region: "Himalaya & Asia", hasPhoto: true },
  { id: "cotopaxi", name: "Cotopaxi", elevationM: 5897, range: "Andes", country: "Ecuador", region: "Americas", hasPhoto: true },
  { id: "denali", name: "Denali", elevationM: 6190, range: "Alaska Range", country: "United States", region: "Americas", hasPhoto: true },
  { id: "dhaulagiri", name: "Dhaulagiri I", elevationM: 8167, range: "Dhaulagiri Himal", country: "Nepal", region: "Himalaya & Asia", hasPhoto: true },
  { id: "dykh-tau", name: "Dykh-Tau", elevationM: 5205, range: "Caucasus", country: "Russia", region: "Europe", hasPhoto: true },
  { id: "eiger", name: "Eiger", elevationM: 3967, range: "Bernese Alps", country: "Switzerland", region: "Europe", hasPhoto: true },
  { id: "gasherbrum-i", name: "Gasherbrum I", elevationM: 8080, range: "Karakoram", country: "Pakistan / China", region: "Himalaya & Asia", hasPhoto: true },
  { id: "gasherbrum-ii", name: "Gasherbrum II", elevationM: 8035, range: "Karakoram", country: "Pakistan / China", region: "Himalaya & Asia", hasPhoto: true },
  { id: "grossglockner", name: "Grossglockner", elevationM: 3798, range: "Hohe Tauern", country: "Austria", region: "Europe", hasPhoto: true },
  { id: "himlung-himal", name: "Himlung Himal", elevationM: 7126, range: "Peri Himal", country: "Nepal", region: "Himalaya & Asia", hasPhoto: true },
  { id: "huascaran", name: "Huascar\u00e1n", elevationM: 6768, range: "Cordillera Blanca", country: "Peru", region: "Americas", hasPhoto: true },
  { id: "island-peak", name: "Island Peak", elevationM: 6189, range: "Mahalangur Himal", country: "Nepal", region: "Himalaya & Asia", hasPhoto: true },
  { id: "k2", name: "K2", elevationM: 8611, range: "Karakoram", country: "Pakistan / China", region: "Himalaya & Asia", hasPhoto: true },
  { id: "kangchenjunga", name: "Kangchenjunga", elevationM: 8586, range: "Kangchenjunga Himal", country: "Nepal / India", region: "Himalaya & Asia", hasPhoto: true },
  { id: "khan-tengri", name: "Khan Tengri", elevationM: 7010, range: "Tian Shan", country: "Kazakhstan / Kyrgyzstan", region: "Himalaya & Asia", hasPhoto: true },
  { id: "lenin-peak", name: "Lenin Peak", elevationM: 7134, range: "Trans-Alay", country: "Kyrgyzstan / Tajikistan", region: "Himalaya & Asia", hasPhoto: true },
  { id: "lhotse", name: "Lhotse", elevationM: 8516, range: "Mahalangur Himal", country: "Nepal / China", region: "Himalaya & Asia", hasPhoto: true },
  { id: "lobuche-east", name: "Lobuche East", elevationM: 6119, range: "Mahalangur Himal", country: "Nepal", region: "Himalaya & Asia", hasPhoto: true },
  { id: "makalu", name: "Makalu", elevationM: 8485, range: "Mahalangur Himal", country: "Nepal / China", region: "Himalaya & Asia", hasPhoto: true },
  { id: "manaslu", name: "Manaslu", elevationM: 8163, range: "Mansiri Himal", country: "Nepal", region: "Himalaya & Asia", hasPhoto: true },
  { id: "matterhorn", name: "Matterhorn", elevationM: 4478, range: "Pennine Alps", country: "Switzerland / Italy", region: "Europe", hasPhoto: true },
  { id: "mera-peak", name: "Mera Peak", elevationM: 6476, range: "Mahalangur Himal", country: "Nepal", region: "Himalaya & Asia", hasPhoto: true },
  { id: "mont-blanc", name: "Mont Blanc", elevationM: 4806, range: "Graian Alps", country: "France / Italy", region: "Europe", hasPhoto: true },
  { id: "ararat", name: "Mount Ararat", elevationM: 5137, range: "Armenian Highlands", country: "Turkey", region: "Europe", hasPhoto: true },
  { id: "baker", name: "Mount Baker", elevationM: 3286, range: "Cascades", country: "United States", region: "Americas", hasPhoto: true },
  { id: "elbrus", name: "Mount Elbrus", elevationM: 5642, range: "Caucasus", country: "Russia", region: "Europe", hasPhoto: true },
  { id: "everest", name: "Mount Everest", elevationM: 8849, range: "Mahalangur Himal", country: "Nepal / China", region: "Himalaya & Asia", hasPhoto: true },
  { id: "fuji", name: "Mount Fuji", elevationM: 3776, range: "Fuji Volcanic Zone", country: "Japan", region: "Himalaya & Asia", hasPhoto: true },
  { id: "kailash", name: "Mount Kailash", elevationM: 6638, range: "Gangdise", country: "China", region: "Himalaya & Asia", hasPhoto: true },
  { id: "kazbek", name: "Mount Kazbek", elevationM: 5054, range: "Caucasus", country: "Georgia / Russia", region: "Europe", hasPhoto: true },
  { id: "mount-kenya", name: "Mount Kenya", elevationM: 5199, range: "Eastern Rift", country: "Kenya", region: "Africa", hasPhoto: true },
  { id: "kilimanjaro", name: "Mount Kilimanjaro", elevationM: 5895, range: "Eastern Rift", country: "Tanzania", region: "Africa", hasPhoto: true },
  { id: "kosciuszko", name: "Mount Kosciuszko", elevationM: 2228, range: "Snowy Mountains", country: "Australia", region: "Oceania & Antarctica", hasPhoto: true },
  { id: "logan", name: "Mount Logan", elevationM: 5959, range: "Saint Elias Mountains", country: "Canada", region: "Americas", hasPhoto: true },
  { id: "rainier", name: "Mount Rainier", elevationM: 4392, range: "Cascades", country: "United States", region: "Americas", hasPhoto: true },
  { id: "speke", name: "Mount Speke", elevationM: 4890, range: "Rwenzori", country: "Uganda", region: "Africa", hasPhoto: true },
  { id: "stanley", name: "Mount Stanley", elevationM: 5109, range: "Rwenzori", country: "Uganda / DR Congo", region: "Africa", hasPhoto: true },
  { id: "toubkal", name: "Mount Toubkal", elevationM: 4167, range: "High Atlas", country: "Morocco", region: "Africa", hasPhoto: true },
  { id: "muztagh-tower", name: "Muztagh Tower", elevationM: 7276, range: "Karakoram", country: "Pakistan / China", region: "Himalaya & Asia", hasPhoto: true },
  { id: "nanga-parbat", name: "Nanga Parbat", elevationM: 8126, range: "Himalaya", country: "Pakistan", region: "Himalaya & Asia", hasPhoto: true },
  { id: "ojos-del-salado", name: "Ojos del Salado", elevationM: 6893, range: "Andes", country: "Chile / Argentina", region: "Americas", hasPhoto: true },
  { id: "shishapangma", name: "Shishapangma", elevationM: 8027, range: "Jugal Himal", country: "China", region: "Himalaya & Asia", hasPhoto: true },
  { id: "vinson", name: "Vinson Massif", elevationM: 4892, range: "Sentinel Range", country: "Antarctica", region: "Oceania & Antarctica", hasPhoto: true },
];

export const peakById = (id: string): Peak | undefined => PEAKS.find((p) => p.id === id);

/** Every region present in the catalogue, for the picker's filter. */
export const REGIONS: string[] = [...new Set(PEAKS.map((p) => p.region))].sort();
