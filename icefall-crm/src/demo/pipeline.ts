/**
 * The Sales Pipeline board behind the 30 Aug 2026 mockup. Fiction, all of it,
 * behind the flag like every invented figure in this CRM.
 *
 * TWO PLACES THE MOCKUP'S OWN ARITHMETIC DOES NOT CLOSE, both resolved the
 * same way as the calculator's (compute what looks computed, keep the rest as
 * labelled period stats):
 *
 *   - The KPI strip ("48 deals", "€287,450", "12 won") does not equal the sum
 *     of the board's columns (51 deals across stages). It is kept verbatim and
 *     captioned "vs last 30 days" — a PERIOD summary, which a live board need
 *     not agree with.
 *   - The mockup's "Weighted Pipeline Value €179,634" is not Σ(stage value ×
 *     probability) of its own stages (that is €266,941). The screen computes
 *     the real sum from these rows rather than print a figure its own columns
 *     contradict.
 */
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";

export type StageId =
  | "new_lead"
  | "contacted"
  | "qualified"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export interface DemoDeal {
  company: string;
  country: string;
  /** "Lead via Website", "Email sent", … — or null when the pill says it all. */
  note: string | null;
  valueCents: number | null;
  age: string;
  outcome?: "won" | "lost";
}

export interface DemoStage {
  id: StageId;
  label: string;
  dealCount: number;
  valueCents: number;
  /** Close probability, percent. Not shown for Lost. */
  probability: number | null;
  deals: DemoDeal[];
}

const d = (
  company: string,
  country: string,
  note: string | null,
  valueEur: number | null,
  age: string,
  outcome?: "won" | "lost",
): DemoDeal => ({ company, country, note, valueCents: valueEur === null ? null : valueEur * 100, age, outcome });

const STAGE_DATA: DemoStage[] = [
  {
    id: "new_lead", label: "New Lead", dealCount: 8, valueCents: 34_200_00, probability: 23,
    deals: [
      d("Alpine Ascents", "United States", "Lead via Website", 5_600, "2d ago"),
      d("Summit Seekers", "Canada", "Lead via Referral", 4_800, "3d ago"),
      d("Peak Explorers", "Australia", "Lead via LinkedIn", 3_200, "5d ago"),
    ],
  },
  {
    id: "contacted", label: "Contacted", dealCount: 10, valueCents: 58_900_00, probability: 30,
    deals: [
      d("Himalaya Guides", "Nepal", "Email sent", 6_200, "1d ago"),
      d("Andes Experience", "Chile", "Email sent", 5_400, "2d ago"),
      d("North Ridge Expeditions", "UK", "Email sent", 4_100, "3d ago"),
    ],
  },
  {
    id: "qualified", label: "Qualified", dealCount: 9, valueCents: 71_600_00, probability: 50,
    deals: [
      d("Everest Experts", "Nepal", "Needs confirmed", 9_800, "1d ago"),
      d("Kilimanjaro Treks", "Tanzania", "Needs confirmed", 7_400, "2d ago"),
      d("Altai Adventures", "Mongolia", "Needs confirmed", 6_200, "3d ago"),
    ],
  },
  {
    id: "proposal", label: "Proposal Sent", dealCount: 8, valueCents: 64_250_00, probability: 70,
    deals: [
      d("Arctic Guides", "Iceland", "Proposal sent", 8_900, "1d ago"),
      d("Patagonia Treks", "Argentina", "Proposal sent", 7_300, "2d ago"),
      d("Atlas Expeditions", "Morocco", "Proposal sent", 6_100, "4d ago"),
    ],
  },
  {
    id: "negotiation", label: "Negotiation", dealCount: 6, valueCents: 38_700_00, probability: 90,
    deals: [
      d("Elite Expeditions", "Switzerland", "In negotiation", 9_200, "2d ago"),
      d("Seven Summit Co.", "India", "In negotiation", 6_800, "4d ago"),
    ],
  },
  {
    id: "won", label: "Won", dealCount: 7, valueCents: 125_800_00, probability: 100,
    deals: [
      d("Mountain Masters", "Canada", null, null, "Won 2d ago", "won"),
      d("High Altitude Co.", "Nepal", null, null, "Won 5d ago", "won"),
    ],
  },
  {
    id: "lost", label: "Lost", dealCount: 3, valueCents: 12_100_00, probability: null,
    deals: [
      d("Outdoor Pioneers", "USA", null, 4_200, "3d ago", "lost"),
      d("Global Treks", "UK", null, 4_000, "1w ago", "lost"),
    ],
  },
];

export interface PipelineDemo {
  stages: DemoStage[];
  /** The KPI strip — 30-day period stats, kept verbatim from the mockup. */
  kpis: { label: string; value: string; deltaPct: number; marked?: boolean }[];
  forecastThisMonthCents: number;
}

export const PIPELINE_DEMO: PipelineDemo | null = SHOW_DEMO_DATA
  ? {
      stages: STAGE_DATA,
      kpis: [
        { label: "Total Deals", value: "48", deltaPct: 12 },
        { label: "Total Value", value: "€287,450", deltaPct: 18 },
        { label: "Won Deals", value: "12", deltaPct: 20, marked: true },
        { label: "Conversion Rate", value: "25.0%", deltaPct: 4 },
        { label: "Avg. Deal Value", value: "€23,954", deltaPct: 8 },
      ],
      forecastThisMonthCents: 62_300_00,
    }
  : null;
