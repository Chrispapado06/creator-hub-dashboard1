/**
 * The Companies roster behind the 30 Aug 2026 mockup — and the one place in the
 * CRM where REAL businesses appear, at the owner's explicit instruction
 * ("add real company logos that exist like 14 peaks, elite exped").
 *
 * That instruction reverses the earlier fictional-names-only rule for THIS
 * surface, so the reversal is written down here, at the point of change (§6p):
 *
 *   - The 16 real operators carry only PUBLIC facts: name, website domain,
 *     country, and (where widely known) home city. Logos are fetched live from
 *     their own domains at render time — nothing is copied into the repo.
 *   - Everything COMMERCIAL about them — revenue YTD, joined dates, trust
 *     states — is invented demo data, gated behind the flag like all fiction.
 *   - No real business ever carries a negative state. "Suspended", "Unverified"
 *     and €0 belong to invented companies only; a demo screenshot must never
 *     read as a claim that a real operator was suspended.
 *
 * The other 32 companies are invented, as before. The status arithmetic is why
 * the counts land on the mockup's exactly: 32 active, 7 onboarding, 5
 * suspended, 4 unverified = 48.
 */
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";

export type OperatorStatus = "active" | "onboarding" | "suspended" | "unverified";
export type OperatorTrust = "verified" | "pending" | "unverified";

export interface OperatorRow {
  id: string;
  name: string;
  /** Real website domain → live logo. Null for invented companies. */
  domain: string | null;
  real: boolean;
  status: OperatorStatus;
  countries: string;
  /** Home city, only where it is public knowledge. Never invented for a real company. */
  city: string | null;
  trust: OperatorTrust;
  joined: string;
  /** Cents. Null carries a reason on screen; 0 is a real zero. */
  revenueYtdCents: number | null;
  revenueReason?: string;
}

const real = (
  id: string,
  name: string,
  domain: string,
  countries: string,
  city: string | null,
  joined: string,
  revenueEur: number,
): OperatorRow => ({
  id,
  name,
  domain,
  real: true,
  status: "active",
  countries,
  city,
  trust: "verified",
  joined,
  revenueYtdCents: revenueEur * 100,
});

const fake = (
  id: string,
  name: string,
  countries: string,
  status: OperatorStatus,
  trust: OperatorTrust,
  joined: string,
  revenueEur: number | null,
  revenueReason?: string,
): OperatorRow => ({
  id,
  name,
  domain: null,
  real: false,
  status,
  countries,
  city: null,
  trust,
  joined,
  revenueYtdCents: revenueEur === null ? null : revenueEur * 100,
  revenueReason,
});

const ROSTER: OperatorRow[] = [
  // ── The real ones: public facts + invented commercials ─────────────────
  real("elite-exped", "Elite Exped", "eliteexped.com", "Nepal, UK", "Kathmandu", "12 Feb 2024", 48_230),
  real("seven-summit-treks", "Seven Summit Treks", "sevensummittreks.com", "Nepal", "Kathmandu", "03 Jan 2024", 46_120),
  real("14-peaks", "14 Peaks Expedition", "14peaksexpedition.com", "Nepal", "Kathmandu", "11 Feb 2024", 36_780),
  real("alpine-ascents", "Alpine Ascents International", "alpineascents.com", "United States", "Seattle", "21 Jan 2024", 31_440),
  real("adventure-consultants", "Adventure Consultants", "adventureconsultants.com", "New Zealand", "Wanaka", "08 Mar 2024", 28_610),
  real("madison", "Madison Mountaineering", "madisonmountaineering.com", "United States", "Seattle", "15 Feb 2024", 26_340),
  real("furtenbach", "Furtenbach Adventures", "furtenbachadventures.com", "Austria", "Innsbruck", "27 Feb 2024", 24_850),
  real("imagine-nepal", "Imagine Nepal", "imagine-nepal.com", "Nepal", "Kathmandu", "19 Mar 2024", 22_220),
  real("8k-expeditions", "8K Expeditions", "8kexpeditions.com", "Nepal", "Kathmandu", "02 Apr 2024", 19_900),
  real("ctss", "Climbing the Seven Summits", "climbingthesevensummits.com", "United States", "Bozeman", "24 Jan 2024", 18_640),
  real("img", "International Mountain Guides", "mountainguides.com", "United States", "Ashford", "30 Jan 2024", 16_310),
  real("jagged-globe", "Jagged Globe", "jagged-globe.co.uk", "United Kingdom", "Sheffield", "14 Mar 2024", 14_430),
  real("pioneer-adventure", "Pioneer Adventure", "pioneeradventure.com", "Nepal", "Kathmandu", "22 Apr 2024", 12_280),
  real("mtn-professionals", "Mountain Professionals", "mtnprofessionals.com", "United States", "Boulder", "09 Apr 2024", 10_860),
  real("kobler-partner", "Kobler & Partner", "kobler-partner.ch", "Switzerland", "Bern", "17 Apr 2024", 9_540),
  real("summitclimb", "SummitClimb", "summitclimb.com", "United States", null, "29 Apr 2024", 7_920),

  // ── Invented, active (16) ──────────────────────────────────────────────
  fake("northwind", "Northwind Ascents", "Nepal, India", "active", "verified", "05 Jan 2024", 21_780),
  fake("serac-stone", "Serac & Stone Expeditions", "Switzerland", "active", "verified", "18 Jan 2024", 19_310),
  fake("cairn-compass", "Cairn & Compass Trekking", "France", "active", "verified", "26 Jan 2024", 17_040),
  fake("lantern-pass", "Lantern Pass Expeditions", "Nepal", "active", "verified", "06 Feb 2024", 15_620),
  fake("vantage-north", "Vantage North Alpine", "Norway", "active", "verified", "20 Feb 2024", 13_980),
  fake("meridian-col", "Meridian Col Expeditions", "Chile", "active", "verified", "01 Mar 2024", 12_150),
  fake("whiteout-ridge", "Whiteout Ridge Expeditions", "Canada", "active", "verified", "12 Mar 2024", 10_420),
  fake("cloudline", "Cloudline Trekking Co.", "Tanzania", "active", "verified", "21 Mar 2024", 9_310),
  fake("stonefield", "Stonefield Alpine", "Italy", "active", "verified", "28 Mar 2024", 8_270),
  fake("blue-ice", "Blue Ice Journeys", "Iceland", "active", "pending", "04 Apr 2024", 7_140),
  fake("silverfirn", "Silverfirn Expeditions", "Switzerland", "active", "verified", "10 Apr 2024", 6_450),
  fake("northwall", "Northwall Guides", "Austria", "active", "pending", "16 Apr 2024", 5_620),
  fake("monsoon-ridge", "Monsoon Ridge Treks", "India", "active", "verified", "23 Apr 2024", 4_980),
  fake("glacier-gate", "Glacier Gate Adventures", "Argentina", "active", "verified", "30 Apr 2024", 4_110),
  fake("cirrus-alpine", "Cirrus Alpine", "Georgia", "active", "pending", "07 May 2024", 3_540),
  fake("terra-alta", "Terra Alta Expeditions", "Peru", "active", "verified", "14 May 2024", 2_860),

  // ── Invented, onboarding (7) — not yet live, so no revenue to state ────
  fake("windward", "Windward Summits", "Japan", "onboarding", "pending", "21 May 2024", null, "Not yet live"),
  fake("halfmoon", "Halfmoon Pass Trekking", "Nepal", "onboarding", "pending", "28 May 2024", null, "Not yet live"),
  fake("ironpeak", "Ironpeak Expeditions", "Pakistan", "onboarding", "pending", "04 Jun 2024", null, "Not yet live"),
  fake("longview", "Longview Alpine", "United States", "onboarding", "pending", "11 Jun 2024", null, "Not yet live"),
  fake("snowline", "Snowline Collective", "Canada", "onboarding", "pending", "18 Jun 2024", null, "Not yet live"),
  fake("eastray", "Eastray Expeditions", "Kyrgyzstan", "onboarding", "pending", "25 Jun 2024", null, "Not yet live"),
  fake("corniche", "Corniche Guides", "Morocco", "onboarding", "pending", "02 Jul 2024", null, "Not yet live"),

  // ── Invented, suspended (5) — a real zero: they were live and earned it ─
  fake("hollow-ridge", "Hollow Ridge Mountaineering", "Italy", "suspended", "unverified", "08 Feb 2024", 0),
  fake("cold-harbour", "Cold Harbour Guides", "United Kingdom", "suspended", "unverified", "22 Feb 2024", 0),
  fake("palisade", "Palisade Peaks Co.", "United States", "suspended", "unverified", "07 Mar 2024", 0),
  fake("tundra-talus", "Tundra & Talus", "Mongolia", "suspended", "unverified", "19 Mar 2024", 0),
  fake("veilridge", "Veilridge Mountaineering", "Ecuador", "suspended", "unverified", "02 Apr 2024", 0),

  // ── Invented, unverified (4) — never live, so nothing to count ─────────
  fake("quartz-col", "Quartz Col Expeditions", "Tanzania", "unverified", "unverified", "09 Jul 2024", null, "Awaiting verification"),
  fake("driftline", "Driftline Treks", "Vietnam", "unverified", "unverified", "16 Jul 2024", null, "Awaiting verification"),
  fake("highline", "Highline Trekking Co.", "Nepal", "unverified", "unverified", "23 Jul 2024", null, "Awaiting verification"),
  fake("global-treks", "Global Treks", "United Kingdom", "unverified", "unverified", "30 Jul 2024", null, "Awaiting verification"),
];

export const operators: OperatorRow[] = SHOW_DEMO_DATA ? ROSTER : [];

/**
 * The Add/Edit screen's demonstration extras — the mockup's Quick Summary and
 * Verification Status rail. Platform-relationship fiction, same flag.
 */
export const EDITOR_DEMO = SHOW_DEMO_DATA
  ? {
      totalExpeditions: 18,
      mountains: 12,
      activeSlotPlacements: 24,
      countries: 5,
      icefallCheck: "Completed",
      lastChecked: "20 May 2026",
    }
  : null;
