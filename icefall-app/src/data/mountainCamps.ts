/**
 * THE CAMPS AND HUTS ON THE MOUNTAIN, AND WHO MAPPED THEM.
 *
 * Charlie, 11 September 2026: "Implement the 3D map with a showcase of camps
 * and trails people can follow."
 *
 * Until today `MountainMap3D` drew one marker — the summit — and its caption
 * said so, because ICEFALL held no coordinates for any camp on any of the
 * fourteen curated mountains. `MountainRoute` carries a name, a grade, a
 * distance and an ascent, and NO GEOMETRY. This file is where the coordinates
 * came from, and the caption now derives from it rather than restating a
 * sentence that was true last week.
 *
 * ── WHERE EVERY POSITION CAME FROM ─────────────────────────────────────────
 *
 * OpenStreetMap, queried through Overpass on the date in `HARVEST_DATE`, one
 * query per mountain. Nothing here was typed from memory, worked out from a
 * photograph, or nudged to look better on the map. Every camp carries its OSM
 * type and id, so `osmUrl()` puts the reader one tap from the object this row
 * was read off — including the day somebody last edited it.
 *
 * USING THIS DATA CARRIES A LICENCE OBLIGATION, not a courtesy. OpenStreetMap
 * is published under the Open Database Licence, which requires attribution
 * wherever the data is shown. `OSM_ATTRIBUTION` is therefore a plain required
 * string, not an optional field: a caller that renders camps and forgets the
 * credit is in breach, so there is nothing to forget.
 *
 * ── WHAT WAS THROWN AWAY, WHICH IS MOST OF IT ──────────────────────────────
 *
 * The raw harvest was wide on purpose — every hut, shelter, campsite and named
 * locality within a radius. Mont Blanc alone returned 248 elements: valley
 * campsites at 1,164 m, unnamed alpages, the bivouacs on the Italian side,
 * chalets in Les Bossons. Four are kept.
 *
 * THE FILTER, applied by hand, one mountain at a time:
 *
 *   1. It has a NAME in OSM. An unnamed shelter node helps nobody and cannot
 *      be checked against anything.
 *   2. It is a place to stay — an alpine hut, an unstaffed hut, a bivouac
 *      shelter or a mapped camp. Every `place=locality` was dropped: those are
 *      names for terrain (Grand Couloir, Wickersham Wall, Le Petit Plateau),
 *      not places with a roof, and 205 of Gran Paradiso's 256 elements were
 *      exactly that.
 *   3. It stands ON A ROUTE ICEFALL ACTUALLY RECORDS for that mountain, or on
 *      that route's approach. This is the rule that did the work, and it is
 *      why the Matterhorn's Italian bivouacs are absent (ICEFALL records the
 *      Hörnli Ridge, not the Lion Ridge) and why the Eiger has exactly one
 *      camp (the Mittellegi hut serves the Mittellegi Ridge; the Heckmair line
 *      on the north face has no hut on it at all).
 *   4. Its altitude is consistent with that route.
 *
 * Where a keep was marginal — a second hut on the same approach, a shelter
 * mapped as basic rather than staffed — the reason is in that camp's `note`,
 * so a later reader can disagree with the judgement rather than guess at it.
 *
 * ── WHAT IS NOT CLAIMED ────────────────────────────────────────────────────
 *
 * ELEVATION IS OSM'S `ele` TAG OR IT IS NULL. It is never interpolated from a
 * DEM, never copied off a neighbouring node, never inferred from how far up
 * the ridge a camp looks. Denali's Camp 2 and Kilimanjaro's Shira 2 have no
 * `ele` in OSM and therefore have none here, and the page shows a dash rather
 * than a plausible number.
 *
 * WIKIDATA IS RECORDED ONLY WHERE THE QID IS THE PLACE. Every Kilimanjaro camp
 * in the harvest carried `wikidata=Q4126733`, which resolves to "Mount
 * Kilimanjaro climbing routes" — an article about the routes, bulk-tagged onto
 * eight different camps. Passing it through would have produced eight rows
 * each linking to the same wrong thing, so Kilimanjaro's camps carry no QID.
 * The twelve QIDs that ARE here were each fetched from Wikidata on the harvest
 * date and confirmed to name that hut.
 *
 * NOTHING HERE IS A SAFETY CLAIM. There is no "safe to camp", no capacity a
 * climber could plan on, no booking status, no opening season. A hut mapped in
 * OSM may be shut, full, burnt down or unreachable this week, and this file
 * cannot tell you which.
 *
 * ── ORDER ──────────────────────────────────────────────────────────────────
 *
 * Each mountain's `camps` array is sorted by recorded elevation, lowest first;
 * a camp whose elevation OSM does not record keeps the position the route
 * gives it rather than being shoved to the end. On a single normal-route line
 * that IS the order a climber reaches them. It is not on Kilimanjaro, where
 * the Machame and Lemosho lines merge and the acclimatisation day crosses Lava
 * Tower at 4,623 m before dropping to Barranco at 3,970 m — so a caller should
 * say "lowest first" and must not say "in walking order".
 *
 * ── THE FOUR MOUNTAINS THAT ARE NOT IN HERE AT ALL ─────────────────────────
 *
 * Everest, K2, Broad Peak and Annapurna were never harvested. That is a
 * different state from "harvested and nothing survived the filter", and
 * `campsFor` keeps the two apart — see the comment on it. Guessing where
 * Everest's Camp 2 sits would be the most convincing lie this app could tell,
 * and refusing it is what the map is for.
 */

/** ISO date the Overpass queries behind this file were run. */
export const HARVEST_DATE = "2026-09-11";

/**
 * REQUIRED wherever these camps are drawn or listed. Not a nicety: the Open
 * Database Licence obliges it. Typed as a plain string so it cannot be left
 * undefined by accident.
 */
export const OSM_ATTRIBUTION =
  "Camp and hut positions © OpenStreetMap contributors, under the Open Database Licence.";

/** The licence page the attribution refers to. */
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

/**
 * What kind of place it is, as OSM classifies it — NOT as ICEFALL judges it.
 * The tag each one came from is kept on the camp in `osmTag`, so the
 * classification can be argued with.
 */
export type CampKind = "hut" | "unstaffed-hut" | "bivouac-shelter" | "camp";

export const CAMP_KIND_LABEL: Record<CampKind, string> = {
  hut: "Mountain hut",
  "unstaffed-hut": "Unstaffed hut",
  "bivouac-shelter": "Bivouac shelter",
  camp: "Camp",
};

export interface Camp {
  /** Exactly as OpenStreetMap spells it — not translated, not tidied. */
  name: string;
  /** OSM's own `name:en`, where it has one. Never a translation of ours. */
  nameEn?: string;
  lat: number;
  lon: number;
  /** OSM's `ele` tag in metres, or null where OSM has none. NEVER interpolated. */
  elevationM: number | null;
  kind: CampKind;
  /** The OSM tag `kind` was read from, so a reader can check the call. */
  osmTag: string;
  osmType: "node" | "way" | "relation";
  osmId: number;
  /** Only where the QID was confirmed to name THIS place. See the header. */
  wikidata?: string;
  /** Why a marginal keep was kept, or what is odd about the OSM record. */
  note?: string;
}

export interface MountainCampRecord {
  mountainId: string;
  /**
   * The ICEFALL route or routes the filter was applied against. Recorded
   * because it is the decision: change the routes and this list should change.
   */
  routeBasis: string;
  /** May be empty — see `campsFor`. */
  camps: Camp[];
}

/* -------------------------------------------------------------------------- */
/* The records                                                                 */
/* -------------------------------------------------------------------------- */

const RECORDS: MountainCampRecord[] = [
  /* ----------------------------------------------------------- Mont Blanc */
  {
    mountainId: "mont-blanc",
    routeBasis: "Goûter Route and Trois Monts",
    camps: [
      {
        name: "Refuge de Tête Rousse",
        lat: 45.8549387,
        lon: 6.8175254,
        elevationM: 3165,
        kind: "hut",
        osmTag: "tourism=alpine_hut",
        osmType: "way",
        osmId: 246399018,
        wikidata: "Q1152206",
      },
      {
        name: "Refuge des Cosmiques",
        lat: 45.8732313,
        lon: 6.8855883,
        elevationM: 3613,
        kind: "hut",
        osmTag: "tourism=alpine_hut",
        osmType: "way",
        osmId: 193208257,
        wikidata: "Q1546323",
        note: "On the Trois Monts route, not the Goûter. Kept because Trois Monts is one of the two routes ICEFALL records here.",
      },
      {
        name: "Refuge du Goûter",
        nameEn: "Goûter Refuge",
        lat: 45.8510883,
        lon: 6.8305967,
        elevationM: 3815,
        kind: "hut",
        osmTag: "tourism=alpine_hut",
        osmType: "way",
        osmId: 246399016,
        wikidata: "Q843853",
      },
      {
        name: "Refuge Vallot",
        lat: 45.8390886,
        lon: 6.8521931,
        elevationM: 4322,
        kind: "unstaffed-hut",
        osmTag: "tourism=wilderness_hut",
        osmType: "way",
        osmId: 117546967,
        wikidata: "Q1610145",
        note: "Mapped as an unstaffed hut, not an alpine hut. ICEFALL has not checked how it may be used and does not present it as a place to plan a night.",
      },
    ],
  },

  /* ------------------------------------------------------------ Matterhorn */
  {
    mountainId: "matterhorn",
    routeBasis: "Hörnli Ridge",
    camps: [
      {
        name: "Hörnlihütte",
        lat: 45.9821974,
        lon: 7.6770109,
        elevationM: 3260,
        kind: "hut",
        osmTag: "tourism=alpine_hut",
        osmType: "node",
        osmId: 9070906905,
        wikidata: "Q12681203",
      },
      {
        name: "Solvayhütte",
        lat: 45.9786893,
        lon: 7.662978,
        elevationM: 4003,
        kind: "bivouac-shelter",
        osmTag: "amenity=shelter, shelter_type=basic_hut",
        osmType: "way",
        osmId: 439390162,
        wikidata: "Q870458",
        note: "OSM maps it as a basic hut with capacity 10, high on the ridge — not as an alpine hut. ICEFALL has not checked whether it can be booked.",
      },
    ],
  },

  /* ----------------------------------------------------------------- Eiger */
  {
    mountainId: "eiger",
    routeBasis: "Mittellegi Ridge",
    camps: [
      {
        name: "Mittellegihütte",
        lat: 46.5833905,
        lon: 8.0225469,
        elevationM: 3355,
        kind: "hut",
        osmTag: "tourism=alpine_hut",
        osmType: "way",
        osmId: 376355126,
        wikidata: "Q1770993",
        note: "The only one on this mountain. ICEFALL's other recorded Eiger route, the Heckmair line on the north face, has no hut on it, and the huts the harvest found nearby — Bergli, Guggi, Mönchsjoch, Ostegg — serve other peaks or other ridges.",
      },
    ],
  },

  /* --------------------------------------------------------- Gran Paradiso */
  {
    mountainId: "gran-paradiso",
    routeBasis: "Chabod / Vittorio Emanuele Normal",
    camps: [
      {
        name: "Rifugio Federico Chabod",
        lat: 45.5402746,
        lon: 7.2389001,
        elevationM: 2710,
        kind: "hut",
        osmTag: "tourism=alpine_hut",
        osmType: "node",
        osmId: 3290454779,
        wikidata: "Q838240",
      },
      {
        name: "Rifugio Vittorio Emanuele II Nuovo",
        lat: 45.5126737,
        lon: 7.2296059,
        elevationM: 2735,
        kind: "hut",
        osmTag: "tourism=alpine_hut",
        osmType: "way",
        osmId: 58526794,
        wikidata: "Q1448718",
        note: "The two huts are alternatives, not stages: the route ICEFALL records starts from one or the other. The old Vittorio Emanuele building beside this one is mapped separately in OSM and is not a second place to sleep.",
      },
    ],
  },

  /* --------------------------------------------------------------- Triglav */
  {
    mountainId: "triglav",
    routeBasis: "Krma Valley → Kredarica → Summit line",
    camps: [
      {
        name: "Dom Planika pod Triglavom",
        lat: 46.3713497,
        lon: 13.8460993,
        elevationM: 2401,
        kind: "hut",
        osmTag: "tourism=alpine_hut",
        osmType: "way",
        osmId: 454322331,
        wikidata: "Q12787696",
        note: "Not the hut ICEFALL's route names, but on the same Krma approach and the alternative last night below the summit.",
      },
      {
        name: "Triglavski dom na Kredarici",
        lat: 46.3789379,
        lon: 13.8487827,
        elevationM: 2515,
        kind: "hut",
        osmTag: "tourism=alpine_hut",
        osmType: "way",
        osmId: 293182613,
        wikidata: "Q12804416",
      },
    ],
  },

  /* --------------------------------------------------------- Mount Olympus */
  {
    mountainId: "mount-olympus",
    routeBasis: "Prionia → Spilios Agapitos → Mytikas line",
    camps: [
      {
        name: "Καταφύγιο Α' «Σπήλιος Αγαπητός»",
        nameEn: 'Refuge A "Spilios Agapitos"',
        lat: 40.0800169,
        lon: 22.3729521,
        elevationM: 2100,
        kind: "hut",
        osmTag: "tourism=alpine_hut",
        osmType: "way",
        osmId: 306544009,
        note: "The refuge ICEFALL's route names. The Muses Plateau refuges the harvest also found — Apostolidis and Kakkalos — sit on a different finish and are not on this line.",
      },
    ],
  },

  /* --------------------------------------------------------------- Toubkal */
  {
    mountainId: "toubkal",
    routeBasis: "Imlil → Refuge du Toubkal → Summit line",
    camps: [
      {
        name: "Refuge CAF du Toubkal",
        lat: 31.0635142,
        lon: -7.9375557,
        elevationM: 3207,
        kind: "hut",
        osmTag: "tourism=alpine_hut",
        osmType: "way",
        osmId: 307322838,
        note: 'OSM maps a building 40 m away as "Refuge Louis Neltner" (way 1190236696) with the same operator and the same elevation — almost certainly this same refuge under an older name, so it is not listed twice.',
      },
      {
        name: "Refuge des Mouflons",
        lat: 31.0639358,
        lon: -7.9373628,
        elevationM: 3207,
        kind: "hut",
        osmTag: "tourism=alpine_hut",
        osmType: "way",
        osmId: 81950534,
        note: "A separate building about 50 m from the CAF refuge, mapped at the same altitude.",
      },
    ],
  },

  /* ---------------------------------------------------------------- Denali */
  {
    mountainId: "denali",
    routeBasis: "West Buttress",
    camps: [
      {
        name: "Basecamp",
        lat: 62.9679294,
        lon: -151.1710462,
        elevationM: 2100,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 1133167906,
      },
      {
        name: "Camp 1",
        lat: 63.0304075,
        lon: -151.1845029,
        elevationM: 2300,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 1133167908,
      },
      {
        name: "Camp 2",
        lat: 63.0743398,
        lon: -151.1466837,
        elevationM: null,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 1133167899,
        note: "OSM records no elevation for this one. It is mapped between Camp 1 and the 14,000 ft camp, and that is all this file will say about its height.",
      },
      {
        name: "14,000' Camp",
        lat: 63.0698369,
        lon: -151.0766592,
        elevationM: 4300,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 503180372,
      },
      {
        name: "Camp 4 (High Camp)",
        lat: 63.0787788,
        lon: -151.0539437,
        elevationM: 5240,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 1133167937,
      },
    ],
  },

  /* ------------------------------------------------------------- Aconcagua */
  {
    mountainId: "aconcagua",
    routeBasis: "Normal Route (Horcones)",
    camps: [
      {
        name: "Confluencia",
        lat: -32.7582484,
        lon: -69.9672326,
        elevationM: null,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 656097801,
        note: "The first camp on the Horcones approach, 12 km from the summit. OSM records no elevation for it.",
      },
      {
        name: "Plaza de Mulas",
        lat: -32.6487607,
        lon: -70.0579349,
        elevationM: null,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 655930752,
        note: "Base camp on this route. OSM records no elevation for it.",
      },
      {
        name: "Plaza Canada",
        lat: -32.645045,
        lon: -70.0433846,
        elevationM: 5050,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 785937031,
      },
      {
        name: "Nido de Condores",
        lat: -32.6368514,
        lon: -70.0292017,
        elevationM: 5550,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 656097799,
      },
      {
        name: "Berlín",
        lat: -32.638219,
        lon: -70.0214233,
        elevationM: null,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 785937027,
      },
      {
        name: "Cólera",
        lat: -32.6373579,
        lon: -70.0182979,
        elevationM: 5550,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 785936951,
        note: "OSM tags this 5,550 m — the same figure it gives Nido de Cóndores, which its own mapped position puts lower on the route. One of the two is wrong, ICEFALL has not established which, and both are shown as OSM has them rather than quietly corrected.",
      },
    ],
  },

  /* ----------------------------------------------------------- Kilimanjaro */
  {
    mountainId: "kilimanjaro",
    routeBasis: "Machame and Lemosho routes",
    camps: [
      {
        name: "Machame Camp",
        lat: -3.0954701,
        lon: 37.2663754,
        elevationM: 3020,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 499108849,
      },
      {
        name: "Shira 1 Camp",
        lat: -3.0128318,
        lon: 37.2293811,
        elevationM: 3500,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 499566525,
        note: "On the Lemosho line, not the Machame one.",
      },
      {
        name: "Shira Cave Camp",
        lat: -3.0668048,
        lon: 37.2762812,
        elevationM: 3841,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 498670434,
      },
      {
        name: "Shira 2 Camp",
        lat: -3.0543386,
        lon: 37.2761477,
        elevationM: null,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "node",
        osmId: 11361747457,
        note: 'OSM records no elevation on this node. A second OSM object 40 m away, spelt "Shire Huts" (way 499121171), is tagged 3,850 m — the same place under a misspelling, and its figure is not borrowed for this row.',
      },
      {
        name: "Karanga Camp",
        lat: -3.1127417,
        lon: 37.3549822,
        elevationM: 3961,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 499682666,
      },
      {
        name: "Barranco Camp",
        lat: -3.095151,
        lon: 37.3296402,
        elevationM: 3970,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 498670433,
        note: "Reached before Karanga on both routes, although OSM puts it 9 m higher. This list is ordered by altitude, not by walking order.",
      },
      {
        name: "Lava Tower Camp",
        lat: -3.0679764,
        lon: 37.3271241,
        elevationM: 4623,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 498670436,
        note: "Crossed on the acclimatisation day above Barranco rather than slept at on the standard itineraries.",
      },
      {
        name: "Barafu Camp",
        lat: -3.0998715,
        lon: 37.378582,
        elevationM: 4666,
        kind: "camp",
        osmTag: "tourism=camp_site",
        osmType: "way",
        osmId: 499687559,
      },
    ],
  },
];

const BY_ID = new Map(RECORDS.map((r) => [r.mountainId, r]));

/**
 * THE TWO ABSENCES ARE NOT THE SAME ABSENCE, which is the whole reason the
 * return type is what it is:
 *
 *   null                    ICEFALL HAS NEVER LOOKED. No harvest has been run
 *                           for this mountain — Everest, K2, Broad Peak and
 *                           Annapurna are all in this state, as is every
 *                           uncurated reference peak. Say so with
 *                           `NO_CAMPS_RECORDED`.
 *
 *   record, camps.length 0  ICEFALL LOOKED AND FOUND NOTHING ON THE ROUTE. The
 *                           harvest ran and nothing in it survived the filter
 *                           in this file's header. Say so with
 *                           `NO_CAMPS_ON_ROUTE` — a different sentence,
 *                           because it is a different fact.
 *
 * Collapsing the two into one empty array would tell a climber a mountain has
 * no huts when the truth is that nobody has checked.
 */
export function campsFor(mountainId: string | undefined): MountainCampRecord | null {
  if (!mountainId) return null;
  return BY_ID.get(mountainId) ?? null;
}

/** Never harvested. */
export const NO_CAMPS_RECORDED =
  "ICEFALL has not mapped the camps and huts on this mountain. Nobody has checked, which is not the same as there being none — so there is nothing here rather than a pin in a plausible place.";

/** Harvested, and nothing on the recorded route survived the filter. */
export const NO_CAMPS_ON_ROUTE =
  "ICEFALL looked, and OpenStreetMap maps no camp or hut on the route recorded for this mountain.";

/** The OSM object this row was read from. One tap to the source. */
export function osmUrl(camp: Pick<Camp, "osmType" | "osmId">): string {
  return "https://www.openstreetmap.org/" + camp.osmType + "/" + camp.osmId;
}

/**
 * THE CAPTION UNDER THE MAP, DERIVED FROM THE DATA RATHER THAN REMEMBERED.
 *
 * It used to be a hard-coded sentence saying camps were not marked because
 * ICEFALL held no coordinates for them. The moment this file existed that
 * sentence became false, on exactly the screen where being wrong matters most.
 * So it is computed here, beside the data that decides it, and there is now no
 * way to render markers without the caption changing with them.
 */
export function mapCaption(record: MountainCampRecord | null): string {
  const base = "Satellite imagery over real elevation, tilted. The summit is marked";

  if (!record) {
    return (
      base +
      "; camps, huts and the climbing lines are not — ICEFALL holds no coordinates for them on this mountain, and a pin in a plausible place would be worse than none."
    );
  }

  if (record.camps.length === 0) {
    return (
      base +
      ", and nothing else is: OpenStreetMap maps no camp or hut on the route ICEFALL records here. The climbing lines are not drawn either — ICEFALL holds no geometry for them."
    );
  }

  const n = record.camps.length;
  const marked =
    n === 1
      ? "and so is the one camp OpenStreetMap maps"
      : "and so are the " + n + " camps and huts OpenStreetMap maps";

  return (
    base +
    ", " +
    marked +
    " on the " +
    record.routeBasis +
    ". The climbing lines are not drawn — ICEFALL holds no geometry for any route, and a line invented between two real points would still be an invented line."
  );
}
