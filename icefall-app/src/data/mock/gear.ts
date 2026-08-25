import type { GearSystem, Product } from "@/types";

/**
 * The ICEFALL range.
 *
 * Products render as typographic studio tiles rather than photographs — the
 * range is fictional in this build, and using a real photograph of another
 * brand's jacket to stand in for it would misrepresent both. Real product
 * shots drop straight into `photo`.
 */
export const PRODUCTS: Product[] = [
  {
    id: "shell-summit",
    name: "ICEFALL Summit Hardshell",
    category: "shell",
    categoryLabel: "Shell",
    priceEur: 699,
    photo: "",
    rationale:
      "Your objective sits above the freezing level with sustained wind. This is the layer that keeps the system working when conditions turn.",
    tempRangeC: [-25, 5],
    protection: ["Waterproof 28,000 mm", "Fully windproof", "Helmet-compatible hood"],
    specs: [
      { label: "Membrane", value: "3-layer, 28k/25k" },
      { label: "Weight", value: "440 g" },
      { label: "Seams", value: "Fully taped" },
      { label: "Fit", value: "Alpine, over midlayer" },
    ],
    suitableFor: ["mountaineering", "climbing", "ski-touring", "hiking"],
    weightG: 440,
  },
  {
    id: "insul-alpine",
    name: "ICEFALL Alpine Down Jacket",
    category: "insulation",
    categoryLabel: "Insulation",
    priceEur: 589,
    photo: "",
    rationale:
      "Belay-and-bivouac warmth for cold starts and forced stops. Packs small enough to carry without thinking about it.",
    tempRangeC: [-30, -5],
    protection: ["850 fill-power down", "Hydrophobic treatment", "Wind-resistant shell"],
    specs: [
      { label: "Fill", value: "850 FP responsible down" },
      { label: "Weight", value: "520 g" },
      { label: "Packed", value: "1.9 L" },
      { label: "Baffles", value: "Box-wall" },
    ],
    suitableFor: ["mountaineering", "climbing"],
    weightG: 520,
  },
  {
    id: "insul-expedition",
    name: "ICEFALL Expedition Parka",
    category: "insulation",
    categoryLabel: "Expedition insulation",
    priceEur: 1450,
    photo: "",
    rationale:
      "Built for extreme altitude and prolonged cold. Specified for 8,000 m objectives and Denali-class expeditions.",
    tempRangeC: [-45, -15],
    protection: ["900 fill-power down", "Storm hood with wire brim", "Full baffle construction"],
    specs: [
      { label: "Fill", value: "900 FP responsible down" },
      { label: "Weight", value: "1,180 g" },
      { label: "Rated", value: "−45 °C" },
      { label: "Hood", value: "Insulated, fur-free ruff" },
    ],
    suitableFor: ["mountaineering"],
    weightG: 1180,
  },
  {
    id: "mid-grid",
    name: "ICEFALL Grid Midlayer",
    category: "midlayer",
    categoryLabel: "Midlayer",
    priceEur: 219,
    photo: "",
    rationale:
      "Regulates on the climb without soaking through. The layer you will actually wear for most of the ascent.",
    tempRangeC: [-15, 10],
    protection: ["Grid fleece", "High breathability", "Flat-lock seams"],
    specs: [
      { label: "Fabric", value: "Grid-back polyester" },
      { label: "Weight", value: "290 g" },
      { label: "Fit", value: "Close, layerable" },
      { label: "Finish", value: "Odour control" },
    ],
    suitableFor: ["mountaineering", "hiking", "running", "ski-touring", "climbing"],
    weightG: 290,
  },
  {
    id: "base-merino",
    name: "ICEFALL Merino Base Layer",
    category: "base",
    categoryLabel: "Base layer",
    priceEur: 149,
    photo: "",
    rationale:
      "Next to skin on multi-day objectives where washing is not an option. Regulates warm and cold equally well.",
    tempRangeC: [-20, 15],
    protection: ["Thermoregulating", "Odour resistant", "Flat seams under pack straps"],
    specs: [
      { label: "Fabric", value: "190 gsm merino" },
      { label: "Weight", value: "210 g" },
      { label: "Origin", value: "Mulesing-free" },
      { label: "Fit", value: "Second skin" },
    ],
    suitableFor: ["mountaineering", "hiking", "running", "ski-touring", "climbing", "cycling"],
    weightG: 210,
  },
  {
    id: "pant-alpine",
    name: "ICEFALL Alpine Pant",
    category: "pants",
    categoryLabel: "Alpine pant",
    priceEur: 379,
    photo: "",
    rationale:
      "Softshell for movement, reinforced where crampons catch. Full-length zips for temperature control on the approach.",
    tempRangeC: [-20, 8],
    protection: ["Wind resistant", "DWR treated", "Crampon-resistant cuffs"],
    specs: [
      { label: "Fabric", value: "Softshell, 4-way stretch" },
      { label: "Weight", value: "480 g" },
      { label: "Vents", value: "Full-length side zips" },
      { label: "Harness", value: "Compatible" },
    ],
    suitableFor: ["mountaineering", "climbing", "ski-touring"],
    weightG: 480,
  },
  {
    id: "pack-alpine-35",
    name: "ICEFALL Alpine Pack 35",
    category: "pack",
    categoryLabel: "Pack",
    priceEur: 329,
    photo: "",
    rationale:
      "Carries a summit-day load without swinging on technical ground. Strips down to a summit pack.",
    tempRangeC: [-40, 25],
    protection: ["Water-resistant", "Ice-axe carry", "Rope strap"],
    specs: [
      { label: "Volume", value: "35 L" },
      { label: "Weight", value: "1,040 g" },
      { label: "Frame", value: "Removable" },
      { label: "Access", value: "Top + side" },
    ],
    suitableFor: ["mountaineering", "climbing", "hiking", "ski-touring"],
    weightG: 1040,
  },
  {
    id: "pack-expedition-65",
    name: "ICEFALL Expedition Pack 65",
    category: "pack",
    categoryLabel: "Expedition pack",
    priceEur: 469,
    photo: "",
    rationale: "Load-hauling capacity for expedition rotations and cold-weather kit volume.",
    tempRangeC: [-45, 20],
    protection: ["Water-resistant", "Dual tool carry", "Sled-haul compatible"],
    specs: [
      { label: "Volume", value: "65 L" },
      { label: "Weight", value: "1,780 g" },
      { label: "Frame", value: "Internal alloy" },
      { label: "Load", value: "Rated to 30 kg" },
    ],
    suitableFor: ["mountaineering"],
    weightG: 1780,
  },
];

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);

export const GEAR_SYSTEMS: GearSystem[] = [
  {
    id: "sys-mont-blanc",
    mountainId: "mont-blanc",
    title: "Mont Blanc — Summer Alpine System",
    summary:
      "Specified for a two-day Goûter ascent with a −10 °C summit and sustained ridge wind. Layered to be worn, not carried.",
    productIds: [
      "base-merino",
      "mid-grid",
      "insul-alpine",
      "shell-summit",
      "pant-alpine",
      "pack-alpine-35",
    ],
  },
  {
    id: "sys-everest",
    mountainId: "everest",
    title: "Everest — Extreme Altitude System",
    summary:
      "Specified with an expedition operator's kit list in mind. Rated well below the temperatures you expect to meet.",
    productIds: [
      "base-merino",
      "mid-grid",
      "insul-expedition",
      "shell-summit",
      "pack-expedition-65",
    ],
  },
  {
    id: "sys-olympus",
    mountainId: "mount-olympus",
    title: "Mount Olympus — Summer Scramble System",
    summary: "Light, breathable, and enough shell to handle an afternoon storm on the Kaki Skala.",
    productIds: ["base-merino", "mid-grid", "shell-summit", "pack-alpine-35"],
  },
];

export const systemForMountain = (mountainId: string) =>
  GEAR_SYSTEMS.find((s) => s.mountainId === mountainId);
