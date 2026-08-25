/**
 * Who to go through to climb a mountain.
 *
 * ICEFALL is a discovery layer, not an expedition operator, and it will not
 * invent one. Naming a guiding company that doesn't exist is the one failure
 * mode here that could actually put someone on a mountain with nobody — so for
 * any peak outside the curated ten, this module names only things that are
 * verifiably real: the national authority that issues the permit, the
 * certification to insist on, and the questions to ask.
 *
 * Regulations change. Every surface built on this must carry ACCESS_DISCLAIMER.
 */

export interface AccessGuidance {
  /** The body that governs climbing access, where one exists. */
  authority?: string;
  /** What that body actually controls. */
  authorityNote?: string;
  /** Country-specific practicalities worth knowing before booking. */
  notes: string[];
}

/**
 * Countries where climbing access is centrally governed. Keyed on the country
 * names the geocoder returns.
 */
const BY_COUNTRY: Record<string, AccessGuidance> = {
  Nepal: {
    authority: "Department of Tourism, Ministry of Culture, Tourism & Civil Aviation",
    authorityNote:
      "Issues expedition permits for the major peaks. The Nepal Mountaineering Association handles the smaller 'trekking peaks'.",
    notes: [
      "Permits are issued to a registered Nepali agency, not to individuals — you book through an operator.",
      "National park entry and rural municipality fees are charged separately from the climbing permit.",
      "A government liaison officer is assigned to expedition peaks.",
    ],
  },
  Pakistan: {
    authority: "Gilgit-Baltistan tourism authorities, with the Alpine Club of Pakistan",
    authorityNote: "Peaks above 6,500 m require a federal expedition permit and a liaison officer.",
    notes: [
      "Permits and briefings are arranged well in advance through a licensed Pakistani agency.",
      "Some ranges sit in restricted or border zones with additional clearance requirements.",
    ],
  },
  China: {
    authority:
      "China Tibet Mountaineering Association (Tibet) / Chinese Mountaineering Association",
    authorityNote:
      "Climbing permits, liaison staff and travel permits for peaks on the Chinese side.",
    notes: [
      "Independent access is generally not possible; a licensed agency arranges the permit.",
      "Access windows and rules on the Tibetan side change without much notice.",
    ],
  },
  India: {
    authority: "Indian Mountaineering Foundation",
    authorityNote: "Peak permits, plus Inner Line Permits for restricted border regions.",
    notes: ["Foreign expeditions to many peaks require an IMF liaison officer."],
  },
  Tanzania: {
    authority: "Kilimanjaro National Park (TANAPA)",
    authorityNote: "Park entry, hut and camping fees, and mandatory guiding.",
    notes: ["Climbing without a licensed guide is not permitted; you book through an operator."],
  },
  Kenya: {
    authority: "Kenya Wildlife Service",
    authorityNote: "Mount Kenya National Park entry and camping.",
    notes: ["The technical summits need a guide or a self-sufficient, competent party."],
  },
  Argentina: {
    authority: "Aconcagua Provincial Park, Mendoza",
    authorityNote: "Climbing permits are sold by the province, with prices set by season.",
    notes: [
      "Permits must be bought in Mendoza in person or through the provincial system before entering the park.",
      "A medical check at base camp is part of the standard process.",
    ],
  },
  Peru: {
    authority: "SERNANP (Huascarán National Park) and the local Casa de Guías",
    authorityNote:
      "Park entry; guiding standards are held by the Peruvian mountain guide association.",
    notes: ["Registration with the park office is expected before an ascent."],
  },
  "United States": {
    authority: "The managing National Park or Forest Service unit",
    authorityNote:
      "Denali requires registration roughly 60 days ahead; Rainier requires a climbing permit and cost-recovery fee.",
    notes: ["Quotas and registration windows are strict and fill early in the season."],
  },
  Russia: {
    authority: "Regional border service, for peaks in border zones",
    authorityNote: "Elbrus and much of the Caucasus sit inside a controlled border area.",
    notes: ["Border-zone permits take weeks and are handled by the operator."],
  },
  Ecuador: {
    authority: "Ministerio del Ambiente, for the national parks",
    authorityNote: "Glaciated summits generally require a certified guide.",
    notes: ["ASEGUIM is the national guides association; its guides are IFMGA-affiliated."],
  },
  Bolivia: {
    notes: [
      "No national permit system for most peaks; guiding standards vary, so verify certification directly.",
    ],
  },
  "New Zealand": {
    authority: "Department of Conservation",
    authorityNote: "No climbing permit, but intentions and hut bookings go through DOC.",
    notes: [
      "The alpine environment is serious and rescue is not guaranteed — leave detailed intentions.",
    ],
  },
  Switzerland: {
    notes: [
      "No permit required. Huts are booked directly through the Swiss Alpine Club or the hut warden.",
      "Guides are engaged through the local guides office (bureau des guides) or independently.",
    ],
  },
  France: {
    notes: [
      "No permit required. The Chamonix guides office is the reference point for the Mont Blanc massif.",
      "Hut reservations are essentially mandatory in season.",
    ],
  },
  Italy: { notes: ["No permit required. Huts are run by CAI sections and booked directly."] },
  Austria: { notes: ["No permit required. Huts are run by the ÖAV/DAV and booked directly."] },
  Slovenia: { notes: ["No permit required. Huts in Triglav National Park book up in season."] },
  Spain: {
    notes: ["No permit required for most peaks; some national parks limit access seasonally."],
  },
  Norway: {
    notes: [
      "No permit required. Right of access applies, but glaciers demand competence or a guide.",
    ],
  },
  Japan: {
    notes: [
      "No permit required. Filing a climbing plan is expected and, in some prefectures, mandatory.",
    ],
  },
  Mexico: {
    notes: [
      "No general permit; Pico de Orizaba and Iztaccíhuatl are usually climbed with local operators.",
    ],
  },
  Indonesia: {
    notes: ["Access to some peaks is restricted and arranged through licensed local operators."],
  },
};

/** Guidance that holds regardless of where the mountain is. */
const UNIVERSAL: string[] = [
  "Insist on IFMGA/UIAGM certification for glaciated or technical ground — it is the only internationally recognised mountain guide qualification.",
  "Ask for the guide-to-client ratio in writing. On technical terrain it should be 1:1 or 1:2.",
  "Check what the price excludes: permits, park fees, insurance, oxygen and evacuation are often separate.",
  "Confirm the operator's emergency and evacuation plan, and that your insurance covers helicopter rescue at the altitude you'll reach.",
];

export const ACCESS_DISCLAIMER =
  "ICEFALL does not operate, guide or vet expeditions, and lists no operators for peaks outside its own catalogue — a guiding company invented by an app is a real danger. Permit rules and access change; confirm everything with the authority named here and the local guides office before you commit money or travel.";

/**
 * What a climber needs to know about getting onto this mountain legally and
 * with the right support.
 */
export function accessFor(args: { country?: string; requiresGuide: boolean; elevationM: number }): {
  authority?: string;
  authorityNote?: string;
  notes: string[];
  /** True when the objective is serious enough that this section is not optional reading. */
  professionalSupportExpected: boolean;
} {
  // Curated mountains carry a compound country — "France / Italy" — because
  // they sit on a border. An exact lookup therefore missed Mont Blanc, the
  // Matterhorn and Everest, and told the athlete no permit information existed
  // when the table held it all along.
  const named = (args.country ?? "")
    .split(/[/,]|\band\b/)
    .map((c) => c.trim())
    .filter(Boolean);
  const entry = named.map((c) => BY_COUNTRY[c]).find(Boolean);
  const notes = [...(entry?.notes ?? [])];

  // Only surface the guiding checklist where a guide is actually warranted;
  // padding a hill walk with expedition advice trains people to skim it.
  if (args.requiresGuide) notes.push(...UNIVERSAL);

  return {
    authority: entry?.authority,
    authorityNote: entry?.authorityNote,
    notes,
    professionalSupportExpected: args.requiresGuide || args.elevationM >= 4000,
  };
}

/** A search that finds real, current operators — rather than ICEFALL naming one. */
export function operatorSearchUrl(peakName: string) {
  return `https://duckduckgo.com/?q=${encodeURIComponent(`${peakName} IFMGA guided expedition operator`)}`;
}
