/**
 * THE CANONICAL COMPANY RECORD — one list, read by all five apps.
 *
 * WHY THIS FILE EXISTS. Before it, four apps held four completely separate
 * company lists with ZERO overlap:
 *
 *   icefall-web        Solukhumbu Expeditions, Elite Exped, Cordillera Ascents…
 *   icefall-operator   Lantern Ridge Expeditions
 *   icefall-crm        Northwind Ascents, Hollow Ridge Mountaineering…
 *   icefall-app        Falkenrath Expeditions, Halvorsen Alpine…
 *
 * So "the same company" did not exist across the family. The operator portal's
 * live preview had to render a stand-in and say so on screen, because the
 * company being edited in one app simply was not present in the other. Nothing
 * could propagate from the CRM to the web to the app, because there was no
 * shared identity to propagate.
 *
 * This is the same duplication that already bit twice: `trekRecords.ts` drifted
 * from the phone app's copy with no sync script, and two summit altitudes
 * disagreed about Ama Dablam by two metres, which is why `peaks.ts` exists.
 *
 * THE SHAPE IS THE DATABASE'S SHAPE, DELIBERATELY. Every field below mirrors
 * `public.companies` in 20260828100000_crm_foundation.sql — same names, same
 * types, same vocabularies. That is the whole point: when a Supabase project
 * exists, `COMPANIES` is replaced by a query and *no consumer changes*. A
 * fixture shaped differently from its table is a migration waiting to happen.
 *
 * THE COHERENCE RULE IS ENFORCED HERE TOO. The table has
 * `companies_verification_coherent`: a company is 'verified' only with BOTH a
 * checked-at date and a checked-by reviewer, and carries neither otherwise.
 * `assertCoherent()` below applies the same rule at module load, so a fixture
 * cannot claim a verification the database would refuse. A seed that could not
 * survive its own schema is not a seed, it is a future bug.
 *
 * NO COMPANY IS VERIFIED HERE, AND THAT IS THE POINT. Three of these once
 * carried `verificationStatus: "verified"` with an invented check date and an
 * invented reviewer id. The live database refused them, and it was right to:
 * `companies.documents_checked_by` is a foreign key to a real profile, so a
 * verified company requires a real person who really read the documents. There
 * is no such person yet.
 *
 * They were not downgraded merely to make the load succeed. Had the fixture kept
 * its ticks while the database said 'pending', every app would have shown a
 * verification badge today and silently dropped it the day it started reading
 * the database — the badge disappearing being the *correct* behaviour arriving
 * late, and looking like a regression. A fixture that disagrees with its own
 * table is the same duplication this file was written to end.
 *
 * EVERY NAME HERE IS FICTIONAL. Owner decision 2 removed four real, identifiable
 * businesses (Seven Summit Treks, Adventure Consultants, Elite Exped, 14 Peaks)
 * that had been carrying invented ratings and prices. Do not reintroduce a real
 * company name, in this file or in any app's seed.
 *
 * OWNER: Session 03, as backend owner — the same footing as `money.ts`. Consumers
 * import; they do not edit. Written by the brain session at the owner's request
 * on 2026-08-29 and handed over.
 */

/** Mirrors `public.companies.status`. */
export type CompanyStatus = "prospect" | "onboarding" | "active" | "suspended" | "churned";

/** Mirrors `public.companies.verification_status`. */
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected" | "suspended";

/** Mirrors one row of `public.companies`. */
export interface Company {
  /** Stable identity across every app. The database default is a uuid; these are
   *  fixed so the same company is the same company in all five trees. */
  id: string;
  /** URL key. Same grammar the table's CHECK enforces: lowercase, hyphenated. */
  slug: string;
  name: string;
  legalName: string | null;
  logoPath: string | null;
  description: string | null;
  countries: string[];
  regions: string[];
  status: CompanyStatus;
  verificationStatus: VerificationStatus;
  /** ISO date, or null. Never a date without a reviewer — see the coherence rule. */
  documentsCheckedAt: string | null;
  documentsCheckedBy: string | null;
  /**
   * TRUE ONLY FOR A REAL, IDENTIFIABLE BUSINESS.
   *
   * Every company below is fictional, so every value is `false`. The field
   * survives because `icefall-web`'s `RealBusiness.tsx` keys its disclosure
   * banner off the RECORD rather than off the page — so a real operator cannot
   * be rendered anywhere without the disclosure travelling with it.
   *
   * NEVER accepted from an operator draft: a draft able to clear this renders a
   * real company's page with the disclosure removed. See the preview protocol.
   */
  /**
   * ═══ READ BEFORE ANY RE-SKIN OR COMPONENT SWAP — 2026-09-03 ═══
   *
   * THE DISCLOSURE HANGS OFF THIS RECORD, NOT OFF THE PAGE, AND THAT IS THE
   * WHOLE POINT. A real operator must be incapable of appearing on a surface
   * where the banner has been left out, so anything that renders a company
   * renders this with it. Losing it is a LEGAL problem, not a cosmetic one.
   *
   * A theme's card component has no slot for a disclosure banner. That is
   * exactly how this vanishes: the row gets rebuilt out of a generic `<Card>`,
   * the banner has nowhere to go, and the diff reads as a visual change. If you
   * are re-skinning a company card, list, row or page, grep `realBusiness`
   * before and after and confirm the render paths still match.
   *
   * Owner decision 2 removed four real, identifiable businesses (Seven Summit
   * Treks, Adventure Consultants, Elite Exped, 14 Peaks) that had been carrying
   * invented ratings and prices. Every name in this fixture is fictional now,
   * deliberately. If a theme ships seeded demo rows — these kits usually do —
   * a plausible real company name must not arrive with them.
   */
  realBusiness: boolean;
}

export const COMPANIES: readonly Company[] = [
  {
    id: "c0000000-0000-4000-8000-000000000001",
    slug: "solukhumbu-expeditions",
    name: "Solukhumbu Expeditions",
    legalName: "Solukhumbu Expeditions Pvt Ltd",
    logoPath: null,
    description:
      "A high-altitude operator working mainly on Everest and Ama Dablam, with guides, Sherpas and support staff who return to the same mountains season after season.",
    countries: ["Nepal"],
    regions: ["Khumbu", "Mahalangur Himal"],
    status: "active",
    // See NO COMPANY IS VERIFIED HERE, below.
    verificationStatus: "pending",
    documentsCheckedAt: null,
    documentsCheckedBy: null,
    realBusiness: false,
  },
  {
    id: "c0000000-0000-4000-8000-000000000002",
    slug: "lantern-ridge-expeditions",
    name: "Lantern Ridge Expeditions",
    legalName: "Lantern Ridge Expeditions Pvt Ltd",
    logoPath: null,
    description:
      "Started by two climbing sirdars who had spent a decade working other people's expeditions and wanted to run them differently: smaller teams, longer acclimatisation, and a turn-around call that belongs to the guide on the ground rather than to an office.",
    countries: ["Nepal"],
    regions: ["Khumbu"],
    status: "active",
    // See NO COMPANY IS VERIFIED HERE, below.
    verificationStatus: "pending",
    documentsCheckedAt: null,
    documentsCheckedBy: null,
    realBusiness: false,
  },
  {
    id: "c0000000-0000-4000-8000-000000000003",
    slug: "northwind-ascents",
    name: "Northwind Ascents",
    legalName: "Northwind Ascents Pvt Ltd",
    logoPath: null,
    description:
      "Expedition logistics on the 8,000 m peaks of Nepal and Pakistan, running fixed departures with their own rope-fixing team rather than buying into a shared line.",
    countries: ["Nepal", "Pakistan"],
    regions: ["Karakoram", "Mahalangur Himal"],
    status: "active",
    // See NO COMPANY IS VERIFIED HERE, below.
    verificationStatus: "pending",
    documentsCheckedAt: null,
    documentsCheckedBy: null,
    realBusiness: false,
  },
  {
    id: "c0000000-0000-4000-8000-000000000004",
    slug: "cordillera-ascents",
    name: "Cordillera Ascents",
    legalName: null,
    logoPath: null,
    description:
      "A Huaraz-based team working the Cordillera Blanca and Huayhuash, mostly on Alpamayo and Huascarán, with acclimatisation built around the valleys rather than a fixed schedule.",
    countries: ["Peru", "Bolivia"],
    regions: ["Cordillera Blanca", "Cordillera Real"],
    status: "active",
    verificationStatus: "pending",
    documentsCheckedAt: null,
    documentsCheckedBy: null,
    realBusiness: false,
  },
  {
    id: "c0000000-0000-4000-8000-000000000005",
    slug: "hollow-ridge-mountaineering",
    name: "Hollow Ridge Mountaineering",
    legalName: null,
    logoPath: null,
    description:
      "Alpine-style ascents in the Mont Blanc massif and the Dolomites, running small rope teams and refusing groups larger than four on technical ground.",
    countries: ["Italy", "France"],
    regions: ["Mont Blanc massif", "Dolomites"],
    status: "onboarding",
    verificationStatus: "unverified",
    documentsCheckedAt: null,
    documentsCheckedBy: null,
    realBusiness: false,
  },
  {
    id: "c0000000-0000-4000-8000-000000000006",
    slug: "halvorsen-alpine",
    name: "Halvorsen Alpine",
    legalName: "Halvorsen Alpine AS",
    logoPath: null,
    description:
      "Ski touring and winter ascents in the Lyngen Alps and Jotunheimen, with a season that runs opposite to most of the catalogue.",
    countries: ["Norway"],
    regions: ["Lyngen Alps", "Jotunheimen"],
    status: "active",
    verificationStatus: "unverified",
    documentsCheckedAt: null,
    documentsCheckedBy: null,
    realBusiness: false,
  },
  {
    id: "c0000000-0000-4000-8000-000000000007",
    slug: "cold-harbour-guides",
    name: "Cold Harbour Guides",
    legalName: "Cold Harbour Guides Ltd",
    logoPath: null,
    description:
      "Scottish winter and Alpine summer, operating out of Fort William. Suspended pending a review of their insurance documentation.",
    countries: ["United Kingdom"],
    regions: ["Scottish Highlands"],
    status: "suspended",
    verificationStatus: "suspended",
    documentsCheckedAt: null,
    documentsCheckedBy: null,
    realBusiness: false,
  },
  {
    id: "c0000000-0000-4000-8000-000000000008",
    slug: "falkenrath-expeditions",
    name: "Falkenrath Expeditions",
    legalName: "Falkenrath Expeditions GmbH",
    logoPath: null,
    description:
      "Austrian operator running 6,000 m and 7,000 m objectives across the Andes and the Pamir, with a long acclimatisation programme and no fixed summit day.",
    countries: ["Austria", "Argentina", "Kyrgyzstan"],
    regions: ["Andes", "Pamir"],
    status: "prospect",
    verificationStatus: "unverified",
    documentsCheckedAt: null,
    documentsCheckedBy: null,
    realBusiness: false,
  },
];

/**
 * The table's `companies_verification_coherent` CHECK, applied to the fixture.
 *
 * A company is 'verified' only with BOTH a checked-at date and a checked-by
 * reviewer, and must carry NEITHER otherwise. This runs at module load so a
 * fixture that the database would refuse fails here instead of at the moment
 * somebody tries to seed it — or worse, renders a verification tick nobody
 * earned.
 */
function assertCoherent(list: readonly Company[]): void {
  for (const c of list) {
    const verified = c.verificationStatus === "verified";
    const hasProof = c.documentsCheckedAt !== null && c.documentsCheckedBy !== null;
    if (verified !== hasProof) {
      throw new Error(
        `companies fixture violates companies_verification_coherent: "${c.slug}" is ` +
          `${c.verificationStatus} but ${hasProof ? "carries" : "lacks"} a check date and reviewer. ` +
          `A verification tick must never appear without the record of who checked and when.`,
      );
    }
  }
  const slugs = new Set(list.map((c) => c.slug));
  if (slugs.size !== list.length) throw new Error("companies fixture has a duplicate slug");
  const ids = new Set(list.map((c) => c.id));
  if (ids.size !== list.length) throw new Error("companies fixture has a duplicate id");
}

assertCoherent(COMPANIES);

export function companyBySlug(slug: string): Company | undefined {
  return COMPANIES.find((c) => c.slug === slug);
}

export function companyById(id: string): Company | undefined {
  return COMPANIES.find((c) => c.id === id);
}

/** Companies a climber may see: live on the marketplace, not prospects or churned. */
export function listedCompanies(): readonly Company[] {
  return COMPANIES.filter((c) => c.status === "active" || c.status === "onboarding");
}

/**
 * The sentence ICEFALL may put behind a verification tick, and the only one.
 *
 * It says what was actually done — a member of staff read the documents — and
 * explicitly refuses the reading that the issuing association was contacted,
 * because it was not. A company with no check shows no tick at all rather than
 * a softer claim.
 */
export const DOCUMENTS_CHECKED_NOTICE =
  "Documents checked by ICEFALL. We have not contacted the issuing association.";
