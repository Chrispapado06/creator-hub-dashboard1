/**
 * The rate card in the framework document, checked against the formula.
 *
 * WHY THIS TEST IS THE IMPORTANT ONE. The CRM does not store the published
 * price table — it regenerates it. That is only safe if the formula reproduces
 * the document EXACTLY, because an operator has their own copy of that PDF and
 * will read the invoice against it. One rounding disagreement on one row is a
 * credibility problem, not a rounding problem.
 *
 * The expected values below are extracted from
 * Featured-Slot-Pricing-Framework.docx v1.0 — 77 mountains x 5 slots plus
 * 76 treks x 3 slots = 613 published prices.
 *
 * Run: npx tsx src/domain/slotPricing.test.ts
 */
import { quoteSlot, tierForActiveUsers, TIERS, roundToCard, bundlePriceEur } from "./slotPricing";

const MOUNTAINS: [string, number, number[]][] = [
  ["Everest", 1.0, [250, 200, 160, 130, 100]],
  ["Manaslu", 0.52, [130, 105, 85, 65, 55]],
  ["Ama Dablam", 0.46, [115, 90, 75, 60, 47]],
  ["Cho Oyu", 0.44, [110, 90, 70, 55, 45]],
  ["Lhotse", 0.4, [100, 80, 65, 50, 41]],
  ["K2", 0.38, [95, 75, 60, 48, 39]],
  ["Shishapangma", 0.26, [65, 50, 42, 33, 27]],
  ["Makalu", 0.26, [65, 50, 42, 33, 27]],
  ["Dhaulagiri", 0.24, [60, 48, 38, 31, 25]],
  ["Kangchenjunga", 0.24, [60, 48, 38, 31, 25]],
  ["Broad Peak", 0.24, [60, 48, 38, 31, 25]],
  ["Gasherbrum II", 0.24, [60, 48, 38, 31, 25]],
  ["Annapurna I", 0.22, [55, 44, 35, 28, 23]],
  ["Gasherbrum I", 0.2, [50, 40, 32, 26, 20]],
  ["Nanga Parbat", 0.2, [50, 40, 32, 26, 20]],
  ["Kilimanjaro", 0.42, [105, 85, 65, 55, 43]],
  ["Vinson Massif", 0.4, [100, 80, 65, 50, 41]],
  ["Denali", 0.36, [90, 70, 60, 46, 37]],
  ["Aconcagua", 0.34, [85, 70, 55, 43, 35]],
  ["Elbrus", 0.22, [55, 44, 35, 28, 23]],
  ["Carstensz Pyramid", 0.22, [55, 44, 35, 28, 23]],
  ["Mount Kosciuszko", 0.04, [10, 8, 6, 5, 4]],
  ["Island Peak (Imja Tse)", 0.24, [60, 48, 38, 31, 25]],
  ["Mera Peak", 0.22, [55, 44, 35, 28, 23]],
  ["Lobuche East", 0.16, [40, 32, 26, 20, 16]],
  ["Baruntse", 0.16, [40, 32, 26, 20, 16]],
  ["Pumori", 0.14, [35, 28, 22, 18, 14]],
  ["Himlung Himal", 0.14, [35, 28, 22, 18, 14]],
  ["Chulu West", 0.1, [25, 20, 16, 13, 10]],
  ["Putha Hiunchuli", 0.08, [20, 16, 13, 10, 8]],
  ["Mont Blanc", 0.3, [75, 60, 48, 38, 31]],
  ["Matterhorn", 0.26, [65, 50, 42, 33, 27]],
  ["Eiger", 0.16, [40, 32, 26, 20, 16]],
  ["Monte Rosa / Dufourspitze", 0.14, [35, 28, 22, 18, 14]],
  ["Gran Paradiso", 0.14, [35, 28, 22, 18, 14]],
  ["Grossglockner", 0.12, [30, 24, 19, 15, 12]],
  ["Jungfrau", 0.1, [25, 20, 16, 13, 10]],
  ["Weisshorn", 0.08, [20, 16, 13, 10, 8]],
  ["Breithorn", 0.08, [20, 16, 13, 10, 8]],
  ["Mount Olympus", 0.06, [15, 12, 10, 8, 6]],
  ["Mount Rainier", 0.24, [60, 48, 38, 31, 25]],
  ["Grand Teton", 0.14, [35, 28, 22, 18, 14]],
  ["Mount Baker", 0.14, [35, 28, 22, 18, 14]],
  ["Mount Shasta", 0.12, [30, 24, 19, 15, 12]],
  ["Pico de Orizaba", 0.12, [30, 24, 19, 15, 12]],
  ["Mount Hood", 0.1, [25, 20, 16, 13, 10]],
  ["Mount Whitney", 0.08, [20, 16, 13, 10, 8]],
  ["Iztaccihuatl", 0.08, [20, 16, 13, 10, 8]],
  ["Ojos del Salado", 0.14, [35, 28, 22, 18, 14]],
  ["Alpamayo", 0.14, [35, 28, 22, 18, 14]],
  ["Chimborazo", 0.12, [30, 24, 19, 15, 12]],
  ["Cotopaxi", 0.12, [30, 24, 19, 15, 12]],
  ["Huayna Potosi", 0.1, [25, 20, 16, 13, 10]],
  ["Illimani", 0.1, [25, 20, 16, 13, 10]],
  ["Cayambe", 0.08, [20, 16, 13, 10, 8]],
  ["Tocllaraju", 0.08, [20, 16, 13, 10, 8]],
  ["Nevado Pisco", 0.08, [20, 16, 13, 10, 8]],
  ["Muztagh Ata", 0.14, [35, 28, 22, 18, 14]],
  ["Lenin Peak", 0.14, [35, 28, 22, 18, 14]],
  ["Khan Tengri", 0.12, [30, 24, 19, 15, 12]],
  ["Mount Ararat", 0.12, [30, 24, 19, 15, 12]],
  ["Mount Kazbek", 0.1, [25, 20, 16, 13, 10]],
  ["Damavand", 0.1, [25, 20, 16, 13, 10]],
  ["Peak Korzhenevskaya", 0.08, [20, 16, 13, 10, 8]],
  ["Ismoil Somoni Peak", 0.08, [20, 16, 13, 10, 8]],
  ["Mount Kenya (Batian/Nelion)", 0.14, [35, 28, 22, 18, 14]],
  ["Aoraki / Mount Cook", 0.16, [40, 32, 26, 20, 16]],
  ["Mount Meru", 0.1, [25, 20, 16, 13, 10]],
  ["Margherita Peak (Rwenzori)", 0.1, [25, 20, 16, 13, 10]],
  ["Mount Toubkal", 0.1, [25, 20, 16, 13, 10]],
  ["Mount Fuji", 0.1, [25, 20, 16, 13, 10]],
  ["Mount Kinabalu", 0.1, [25, 20, 16, 13, 10]],
  ["Mount Rinjani", 0.1, [25, 20, 16, 13, 10]],
  ["Gunnbjorn Fjeld", 0.1, [25, 20, 16, 13, 10]],
  ["Stok Kangri", 0.08, [20, 16, 13, 10, 8]],
  ["Kang Yatse", 0.06, [15, 12, 10, 8, 6]],
  ["Mount Sidley", 0.06, [15, 12, 10, 8, 6]],
];

const TREKS: [string, number, number[]][] = [
  ["Everest Base Camp", 0.48, [120, 95, 70]],
  ["Annapurna Circuit", 0.36, [90, 70, 55]],
  ["Annapurna Base Camp", 0.34, [85, 65, 50]],
  ["Gokyo Lakes", 0.24, [60, 47, 36]],
  ["Manaslu Circuit", 0.24, [60, 47, 36]],
  ["Everest Three Passes", 0.22, [55, 43, 33]],
  ["Ghorepani / Poon Hill", 0.2, [50, 39, 30]],
  ["Langtang Valley", 0.2, [50, 39, 30]],
  ["Upper Mustang", 0.18, [45, 35, 27]],
  ["Kanchenjunga Base Camp", 0.14, [35, 27, 21]],
  ["Makalu Base Camp", 0.12, [30, 23, 18]],
  ["Tsum Valley", 0.1, [25, 20, 15]],
  ["Nar Phu Valley", 0.1, [25, 20, 15]],
  ["K2 Base Camp & Concordia", 0.26, [65, 50, 39]],
  ["Snowman Trek", 0.2, [50, 39, 30]],
  ["Fairy Meadows / Nanga Parbat BC", 0.14, [35, 27, 21]],
  ["Markha Valley", 0.14, [35, 27, 21]],
  ["Chadar Trek", 0.12, [30, 23, 18]],
  ["Kashmir Great Lakes", 0.12, [30, 23, 18]],
  ["Druk Path", 0.12, [30, 23, 18]],
  ["Jomolhari Trek", 0.12, [30, 23, 18]],
  ["Snow Lake / Hispar La", 0.1, [25, 20, 15]],
  ["Roopkund", 0.1, [25, 20, 15]],
  ["Hampta Pass", 0.1, [25, 20, 15]],
  ["Valley of Flowers", 0.1, [25, 20, 15]],
  ["Goecha La", 0.1, [25, 20, 15]],
  ["Sandakphu", 0.08, [20, 16, 12]],
  ["Tour du Mont Blanc", 0.34, [85, 65, 50]],
  ["Walker's Haute Route", 0.26, [65, 50, 39]],
  ["Alta Via 1 (Dolomites)", 0.22, [55, 43, 33]],
  ["Camino de Santiago (Frances)", 0.2, [50, 39, 30]],
  ["Laugavegur (Iceland)", 0.18, [45, 35, 27]],
  ["GR20 (Corsica)", 0.16, [40, 31, 24]],
  ["Alta Via 2 (Dolomites)", 0.14, [35, 27, 21]],
  ["Tour du Monte Rosa", 0.14, [35, 27, 21]],
  ["Peaks of the Balkans", 0.14, [35, 27, 21]],
  ["Kungsleden", 0.12, [30, 23, 18]],
  ["West Highland Way", 0.12, [30, 23, 18]],
  ["Julian Alps / Triglav", 0.12, [30, 23, 18]],
  ["Tatra High Route", 0.08, [20, 16, 12]],
  ["Rota Vicentina", 0.08, [20, 16, 12]],
  ["Inca Trail", 0.4, [100, 80, 60]],
  ["Torres del Paine (W / O Circuit)", 0.32, [80, 60, 48]],
  ["Salkantay", 0.28, [70, 55, 42]],
  ["Cordillera Huayhuash Circuit", 0.24, [60, 47, 36]],
  ["Fitz Roy / El Chalten", 0.2, [50, 39, 30]],
  ["Santa Cruz Trek", 0.18, [45, 35, 27]],
  ["Choquequirao", 0.16, [40, 31, 24]],
  ["Ausangate", 0.16, [40, 31, 24]],
  ["Ciudad Perdida", 0.16, [40, 31, 24]],
  ["Mount Roraima", 0.12, [30, 23, 18]],
  ["Quilotoa Loop", 0.1, [25, 20, 15]],
  ["John Muir Trail", 0.2, [50, 39, 30]],
  ["Grand Canyon Rim-to-Rim", 0.16, [40, 31, 24]],
  ["Wonderland Trail", 0.12, [30, 23, 18]],
  ["Teton Crest Trail", 0.12, [30, 23, 18]],
  ["West Coast Trail", 0.12, [30, 23, 18]],
  ["Appalachian Trail (guided sections)", 0.1, [25, 20, 15]],
  ["Pacific Crest Trail (guided sections)", 0.1, [25, 20, 15]],
  ["Zion Narrows", 0.1, [25, 20, 15]],
  ["Chilkoot Trail", 0.08, [20, 16, 12]],
  ["Milford Track", 0.2, [50, 39, 30]],
  ["Overland Track", 0.16, [40, 31, 24]],
  ["Kumano Kodo", 0.16, [40, 31, 24]],
  ["Routeburn Track", 0.14, [35, 27, 21]],
  ["Nakasendo Way", 0.14, [35, 27, 21]],
  ["Mount Rinjani Trek", 0.14, [35, 27, 21]],
  ["Tongariro Northern Circuit", 0.12, [30, 23, 18]],
  ["Larapinta Trail", 0.12, [30, 23, 18]],
  ["Ha Giang Loop / Sapa", 0.12, [30, 23, 18]],
  ["Mount Bromo / Ijen", 0.1, [25, 20, 15]],
  ["Jeju Olle", 0.06, [15, 12, 9]],
  ["Rwenzori Central Circuit", 0.14, [35, 27, 21]],
  ["Simien Mountains", 0.12, [30, 23, 18]],
  ["Atlas / Toubkal Circuit", 0.12, [30, 23, 18]],
  ["Mount Kenya Circuit", 0.12, [30, 23, 18]],
];

let pass = 0;
const fail: string[] = [];

function check(label: string, got: unknown, want: unknown) {
  if (got === want) pass++;
  else fail.push(`${label}: got ${got}, expected ${want}`);
}

// ---- The full published rate card, at Tier 1 -----------------------------
for (const [name, index, doc] of MOUNTAINS) {
  doc.forEach((expected, i) =>
    check(`${name} slot ${i + 1}`,
      quoteSlot({ kind: "mountain", index, slot: i + 1, monthlyActiveUsers: 0 }).monthlyEur,
      expected),
  );
}
for (const [name, index, doc] of TREKS) {
  doc.forEach((expected, i) =>
    check(`${name} slot ${i + 1}`,
      quoteSlot({ kind: "trek", index, slot: i + 1, monthlyActiveUsers: 0 }).monthlyEur,
      expected),
  );
}

// ---- The document's own worked examples (Section 9) ----------------------
check("Ex A - Everest slot 2 @ Tier 4",
  quoteSlot({ kind: "mountain", index: 1.0, slot: 2, monthlyActiveUsers: 10_000 }).monthlyEur, 740);
check("Ex B - Kilimanjaro slot 1 @ Tier 3",
  quoteSlot({ kind: "mountain", index: 0.42, slot: 1, monthlyActiveUsers: 5_000 }).monthlyEur, 235);
check("Ex C - Inca Trail slot 3 @ Tier 5",
  quoteSlot({ kind: "trek", index: 0.4, slot: 3, monthlyActiveUsers: 20_000 }).monthlyEur, 350);

// ---- The tier table (Section 5) ------------------------------------------
const TIER_TABLE: [number, number, number, number][] = [
  // users, Everest slot 1, Mont Blanc slot 1, EBC trek slot 1
  [0, 250, 75, 120], [1_500, 325, 100, 155],
  /*
   * THE DOCUMENT PRINTS 565 HERE AND ITS OWN FORMULA GIVES 560. Recorded rather
   * than silently matched.
   *
   * 250 x 1.00 x 1.00 x 2.25 = 562.50, which rounds to 560 under the same rule
   * that reproduces all 613 prices in the rate card exactly. The 565 in the
   * Section 5 example column looks computed from the UNROUNDED curve
   * (3.5/1)^0.65 = 2.2576 -> 564.4 -> 565.
   *
   * Checked both readings against all 21 cells of that table: the published
   * multipliers disagree on this one cell, the unrounded curve disagrees on
   * five (Tier 5 Everest and EBC, Tier 6 Everest and Mont Blanc, Tier 7
   * Everest). So the published multipliers are what the document is built on,
   * and this single cell is an error in it.
   *
   * We follow the published multipliers, because Section 11 says the tier table
   * is published upfront and operators price against it. Flagged to the owner.
   */
  [3_500, 560, 170, 270],
  [7_500, 925, 280, 445], [15_000, 1_450, 435, 695], [35_000, 2_525, 760, 1_210],
  [75_000, 4_140, 1_240, 1_985],
];
for (const [users, ev, mb, ebc] of TIER_TABLE) {
  check(`Everest s1 @ ${users}`, quoteSlot({ kind: "mountain", index: 1.0, slot: 1, monthlyActiveUsers: users }).monthlyEur, ev);
  check(`Mont Blanc s1 @ ${users}`, quoteSlot({ kind: "mountain", index: 0.3, slot: 1, monthlyActiveUsers: users }).monthlyEur, mb);
  check(`EBC s1 @ ${users}`, quoteSlot({ kind: "trek", index: 0.48, slot: 1, monthlyActiveUsers: users }).monthlyEur, ebc);
}

// ---- Band edges: an operator only moves up once the band is CLEARED ------
check("1,499 users is still Tier 1", tierForActiveUsers(1_499).n, 1);
check("1,500 users is Tier 2", tierForActiveUsers(1_500).n, 2);
check("74,999 users is Tier 6", tierForActiveUsers(74_999).n, 6);
check("75,000 users is Tier 7", tierForActiveUsers(75_000).n, 7);
check("a million users is still Tier 7", tierForActiveUsers(1_000_000).n, 7);

// ---- The rounding rule ---------------------------------------------------
check("102.50 rounds to 100, not 105", roundToCard(102.5), 100);
check("51 rounds to 50", roundToCard(51), 50);
check("47.15 stays at 47 below the 50 line", roundToCard(47.15), 47);

// ---- The bundle rule (Section 8) -----------------------------------------
check("Kosciuszko (0.04) is bundled at Tier 1",
  quoteSlot({ kind: "mountain", index: 0.04, slot: 1, monthlyActiveUsers: 0 }).soldAs, "bundle");
check("Everest is never bundled",
  quoteSlot({ kind: "mountain", index: 1.0, slot: 1, monthlyActiveUsers: 0 }).soldAs, "per-slot");
check("Kosciuszko graduates by Tier 6",
  quoteSlot({ kind: "mountain", index: 0.04, slot: 1, monthlyActiveUsers: 35_000 }).soldAs, "per-slot");
check("bundle packages scale on the same multiplier",
  bundlePriceEur(45, TIERS[3]), roundToCard(45 * 3.7));

// ---- A slot that does not exist must throw, not clamp --------------------
try {
  quoteSlot({ kind: "trek", index: 0.4, slot: 4, monthlyActiveUsers: 0 });
  fail.push("trek slot 4 should have thrown");
} catch { pass++; }

console.log(fail.length === 0
  ? `\n  ${pass}/${pass} passed — the formula reproduces the published card exactly\n`
  : `\n  ${pass} passed, ${fail.length} FAILED\n` + fail.slice(0, 12).map(f => "  " + f).join("\n") + "\n");
if (fail.length) process.exit(1);
