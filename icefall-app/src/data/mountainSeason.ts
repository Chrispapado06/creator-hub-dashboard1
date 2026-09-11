import type { Season } from "@/types";

/**
 * WHEN TO GO, WHAT CAN GO WRONG, AND WHO SAYS SO.
 *
 * A sibling of `mountainCosts.ts`, and it obeys the same law: every sentence a
 * reader sees here was read off a named page on the date in `checked`, and that
 * page's URL travels with it. Nothing is derived from a neighbouring mountain,
 * nothing is remembered, and nothing is smoothed into a plausible shape.
 *
 * ── PART ONE: THE TWELVE MONTHS ────────────────────────────────────────────
 *
 * A month is rated only where a source supports the rating. THE THREE RATINGS
 * MEAN NARROW THINGS, and `RATING_MEANING` is the wording the page should show
 * so a reader is never left to guess:
 *
 *   best      a named source states this month is inside the published season —
 *             the park's own operating window, the hut's own opening dates, the
 *             authority's own peak-season sentence.
 *   possible  the published window covers only part of the month, or the route
 *             is open without the support (rangers, medical, air rescue, a
 *             staffed hut) that the core window carries.
 *   avoid     a named source records the season as SHUT or the month as a
 *             published rain or storm season. It does not mean nobody goes, and
 *             it is never ICEFALL's opinion of your chances.
 *
 * A MONTH WITH NO ENTRY IS NOT A GOOD MONTH AND NOT A BAD ONE. Gran Paradiso
 * has four rated months and eight blanks, because the national park publishes a
 * suggested period and says nothing whatever about October to May. The blanks
 * render `NO_MONTH_RATING`. Filling them in would have been one line of work and
 * a lie.
 *
 * ── THE SEASON-LABEL TRAP, WHICH IS REAL AND IS NOT A BUG ──────────────────
 *
 * The curated records carry `bestSeasons: Season[]` — spring/summer/autumn/
 * winter. `MONTH_SEASON` maps months to those labels on the NORTHERN-hemisphere
 * meteorological convention, because that is the convention the rest of the app
 * already assumes. For Aconcagua and Kilimanjaro that convention is simply
 * wrong about the world, so `seasonComparison()` will report a disagreement
 * that is an artefact of labelling rather than a conflict of fact. Each such
 * record says so in `curatedNote`.
 *
 * THE PAGE MUST REPORT A DISAGREEMENT, NOT RESOLVE ONE. A bug verified on this
 * page on 2026-09-10 had a derived season line contradicting the curated badges
 * in public on Toubkal. Nothing here overwrites `bestSeasons`; where the
 * sourced months and the curated field differ, both are shown and the
 * difference is named.
 *
 * ── PART TWO: HAZARDS, WHICH IS THE PART THAT CAN HURT SOMEBODY ────────────
 *
 * A HAZARD IS A SAFETY CLAIM, so a hazard without a named published source is
 * not a hazard, it is a rumour with a citation-shaped hole. The standard is the
 * Grand Couloir du Goûter: a gendarmerie rescue record covering 27 years, a
 * seismic study by two named laboratories, a published time of day, and a
 * fatality this July that the mountain rescue blog wrote up. Five mountains
 * meet it. Nine do not, and those nine record `hazardsAbsentReason` — "none
 * RECORDED", never "none".
 *
 * DELIBERATELY NOT HERE: "weather can change quickly", "crevasse risk on the
 * glacier", "the summit day is long". All true of every mountain in the file,
 * therefore worth nothing to a reader of any one of them.
 *
 * WHERE TWO SOURCES DISAGREE, BOTH ARE PRINTED. The Petzl/EDYTEM sensors put
 * peak rockfall in the Grand Couloir between 18:00 and 20:00; the study
 * Wikipedia cites puts 75% of it between 10:00 and 16:00. ICEFALL does not pick
 * a winner it has no standing to pick — see `Hazard.disagreement`.
 *
 * ── WHAT IS COVERED, AND WHAT IS NOT ───────────────────────────────────────
 *
 * Nine of the fourteen curated mountains have a season record: denali,
 * mont-blanc, matterhorn, triglav, mount-olympus, gran-paradiso, aconcagua,
 * kilimanjaro, everest. Five have none, and the reason is the same in each
 * case — on 2026-09-11 no source ICEFALL could read tied a month window to a
 * named authority for that peak:
 *
 *   k2, broad-peak   Gilgit-Baltistan's expedition rules were reachable only
 *                    through operator sites quoting them second hand.
 *   annapurna        Nepal's royalty seasons apply, but nothing was found that
 *                    described Annapurna's own window rather than Everest's.
 *   eiger            The Mittellegi hut announces its season a few days ahead
 *                    and extends it on the weather; there is no published
 *                    window to record, only this week's notice.
 *   toubkal          The CAF Maroc refuge publishes a winter tariff period, but
 *                    the tariff PDF could not be read on the date checked.
 *
 * Those five render `NO_SEASON_RECORDED`. Nine of fourteen is the honest
 * number; fourteen of fourteen would have been an invented one.
 */

/* -------------------------------------------------------------------------- */
/* Months                                                                     */
/* -------------------------------------------------------------------------- */

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const MONTHS: Month[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const MONTH_LABEL: Record<Month, string> = {
  1: "January",
  2: "February",
  3: "March",
  4: "April",
  5: "May",
  6: "June",
  7: "July",
  8: "August",
  9: "September",
  10: "October",
  11: "November",
  12: "December",
};

export const MONTH_SHORT: Record<Month, string> = {
  1: "Jan",
  2: "Feb",
  3: "Mar",
  4: "Apr",
  5: "May",
  6: "Jun",
  7: "Jul",
  8: "Aug",
  9: "Sep",
  10: "Oct",
  11: "Nov",
  12: "Dec",
};

/**
 * Months to the app's four season labels, northern-hemisphere meteorological
 * convention. Read the header before using this on a southern or equatorial
 * peak: there it is a labelling convention, not a fact about the mountain.
 */
export const MONTH_SEASON: Record<Month, Season> = {
  12: "winter",
  1: "winter",
  2: "winter",
  3: "spring",
  4: "spring",
  5: "spring",
  6: "summer",
  7: "summer",
  8: "summer",
  9: "autumn",
  10: "autumn",
  11: "autumn",
};

/* -------------------------------------------------------------------------- */
/* Sources and ratings                                                        */
/* -------------------------------------------------------------------------- */

/**
 * WHO IS TALKING. `mountainCosts.ts` needs two kinds; this file needs three,
 * because a peer-reviewed study is neither the body that runs the mountain nor
 * a magazine repeating what that body said.
 *
 *   issuer     the body that runs the place and sets the dates — the national
 *              park, the alpine club that owns the hut, the met authority.
 *              Treated as fact about its own season.
 *   study      a named published study or paper. Authoritative about its own
 *              measurements and its own cohort, and about nothing else.
 *   secondary  a magazine, a federation reporting somebody else's study, a
 *              newspaper, a climber's season log. Usually right, occasionally
 *              stale, never authoritative about a date somebody else sets.
 */
export type SourceKind = "issuer" | "study" | "secondary";

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  issuer: "the body that sets it",
  study: "published study",
  secondary: "reported second hand",
};

export interface SourceRef {
  /** Named, and specific enough to find again if the URL rots. */
  label: string;
  url: string;
  kind: SourceKind;
  /** ISO date this page was read. */
  checked: string;
  /**
   * WHY THIS ISSUER IS THE ISSUER, in a few words, for the source line.
   *
   * Set it ONLY where the body genuinely decides the thing it publishes — a
   * hut declaring its own opening dates, a park decreeing its own season. It
   * is deliberately absent on the Tanzania Meteorological Authority: TMA
   * FORECASTS the Vuli and Masika rains, it does not set them, and nobody
   * sets a rain season. A page that showed "published by the body that sets
   * the season" over a met office would be claiming something no source
   * supports, which is the failure this whole file is built against.
   *
   * Absent means the UI falls back to its neutral issuer wording, which is
   * true of every issuer here.
   */
  issuerRole?: string;
}

export type MonthRating = "best" | "possible" | "avoid";

export const RATING_LABEL: Record<MonthRating, string> = {
  best: "In season",
  possible: "Edge of the season",
  avoid: "Season shut",
};

/** The wording the page should show, so "avoid" is never read as a verdict. */
export const RATING_MEANING: Record<MonthRating, string> = {
  best: "A named source puts this month inside the published season.",
  possible:
    "The published window covers only part of this month, or the route is open without the rangers, medical cover or staffed hut the core season carries.",
  avoid:
    "A named source records the season as shut, or the month as a published rain season. It is not a claim about your chances, and people do go.",
};

/**
 * A block of months that share one sourced sentence. Windows within a record
 * never overlap, and together they cover only the months a source speaks to.
 */
export interface SeasonWindow {
  months: Month[];
  rating: MonthRating;
  /** One sentence. What the source says, not what it implies. */
  reason: string;
  /** Verbatim, where the exact words carry the weight. */
  quote?: string;
  source: SourceRef;
  /** Anything the sentence above would otherwise quietly omit. */
  note?: string;
}

/* -------------------------------------------------------------------------- */
/* Hazards                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How hard the evidence is. Not how frightened to be — that is the reader's
 * call, made on the record below it.
 */
export type HazardSeverity =
  | "deaths-recorded"
  | "rescues-recorded"
  | "authority-warning";

export const SEVERITY_LABEL: Record<HazardSeverity, string> = {
  "deaths-recorded": "Deaths recorded",
  "rescues-recorded": "Rescues recorded",
  "authority-warning": "Warned about by the authority",
};

export interface Hazard {
  /** Named after the thing, not after the feeling. */
  name: string;
  /** Which route or section this belongs to. A hazard with no place is not one. */
  routeScope: string;
  /** What it actually is. */
  what: string;
  /** When it is worst, in the source's own terms. */
  worst: string;
  severity: HazardSeverity;
  /** The page the hazard itself comes from. */
  source: SourceRef;
  /** Published figures and incidents, each carrying its own source. */
  evidence?: { statement: string; source: SourceRef }[];
  /** Where a second published source says something materially different. */
  disagreement?: { statement: string; source: SourceRef };
}

/* -------------------------------------------------------------------------- */
/* The record                                                                 */
/* -------------------------------------------------------------------------- */

export interface MountainSeasonRecord {
  mountainId: string;
  windows: SeasonWindow[];
  hazards: Hazard[];
  /**
   * Required when `hazards` is empty. Says why there are none RECORDED, which
   * is a different sentence from "there are none".
   */
  hazardsAbsentReason?: string;
  /**
   * Where the sourced months and the curated `bestSeasons` need a human
   * sentence — including when the difference is only the season labels.
   */
  curatedNote?: string;
}

/* -------------------------------------------------------------------------- */
/* Sources, declared once so a URL cannot drift between two rows              */
/* -------------------------------------------------------------------------- */

const READ = "2026-09-11";

const S_NPS_FAQ: SourceRef = {
  label: "US National Park Service — Denali mountaineering FAQ",
  url: "https://www.nps.gov/dena/planyourvisit/mountainfaqs.htm",
  kind: "issuer",
  checked: READ,
};

const S_NPS_MOUNTAINEERING: SourceRef = {
  label: "US National Park Service — Denali mountaineering",
  url: "https://www.nps.gov/dena/planyourvisit/mountaineering.htm",
  kind: "issuer",
  checked: READ,
};

const S_DENALI_FROSTBITE: SourceRef = {
  label:
    "Johnson-Arbor K. Frostbite on Denali: a case series and review of treatment options. Journal of Wound Care 33 (2024), doi:10.12968/jowc.2022.0087",
  url: "https://doi.org/10.12968/jowc.2022.0087",
  kind: "study",
  checked: READ,
};

const S_FFCAM_GOUTER: SourceRef = {
  label: "FFCAM — Refuge du Goûter, published opening period",
  url: "https://montblanc.ffcam.fr/gouter.html",
  kind: "issuer",
  checked: READ,
  issuerRole: "published by the body that sets the season",
};

const S_UIAA_GOUTER: SourceRef = {
  label:
    "UIAA — Mont Blanc: when and why do rocks fall in the Couloir du Goûter? (reporting the EDYTEM–ISTerre study by Jacques Mourey, supported by the Petzl Foundation)",
  url: "https://www.theuiaa.org/mont-blanc-when-and-why-do-rocks-fall-in-the-couloir-du-gouter/",
  kind: "secondary",
  checked: READ,
};

const S_CHAMONIX_GOUTER: SourceRef = {
  label:
    "Chamonix.net — How to Avoid Accidents in the Couloir du Goûter (quoting PGHM rescue records)",
  url: "https://www.chamonix.net/english/node/8097",
  kind: "secondary",
  checked: READ,
};

const S_WIKI_GRAND_COULOIR: SourceRef = {
  label:
    "Wikipedia — Grand Couloir (Mont Blanc), citing 'The Goûter Problem' (Blaise Agresti)",
  url: "https://en.wikipedia.org/wiki/Grand_Couloir_(Mont_Blanc)",
  kind: "secondary",
  checked: READ,
};

const S_EXWEB_GOUTER_2026: SourceRef = {
  label: "ExplorersWeb — Two Dead in Mont Blanc's 'Death Couloir', 18 July 2026",
  url: "https://explorersweb.com/two-dead-in-mont-blancs-death-couloir/",
  kind: "secondary",
  checked: READ,
};

const S_HOERNLIHUETTE: SourceRef = {
  label: "Hörnlihütte, Zermatt — published opening dates",
  url: "https://www.hoernlihuette.ch/",
  kind: "issuer",
  checked: READ,
  issuerRole: "published by the body that sets the season",
};

const S_TRIGLAVSKI_DOM: SourceRef = {
  label: "Triglavski dom na Kredarici — operating time",
  url: "https://triglavskidom.si/en/",
  kind: "issuer",
  checked: READ,
  issuerRole: "published by the body that sets the season",
};

const S_OLYMPUS_REFUGE: SourceRef = {
  label:
    "Mount Olympus Refuge A 'Spilios Agapitos' (Hellenic Federation of Mountaineering and Climbing) — FAQ",
  url: "https://mountolympus.gr/resources/faq/?lang=en_GB",
  kind: "issuer",
  checked: READ,
  issuerRole: "published by the body that sets the season",
};

const S_PNGP: SourceRef = {
  label:
    "Parco Nazionale Gran Paradiso — Pont di Valsavarenche to the Vittorio Emanuele II hut",
  url: "https://www.pngp.it/en/node/7134",
  kind: "issuer",
  checked: READ,
  issuerRole: "published by the body that sets the season",
};

const S_MENDOZA_DECREE: SourceRef = {
  label:
    "Gobierno de Mendoza — 'Comienza la temporada estival del Parque Provincial Aconcagua', 31 October 2025",
  url: "https://prensa.mendoza.gob.ar/comienza-la-temporada-estival-del-parque-provincial-aconcagua-normativa-precios-y-medidas-de-seguridad/",
  kind: "issuer",
  checked: READ,
  issuerRole: "published by the body that sets the season",
};

const S_ACONCAGUA_MORTALITY: SourceRef = {
  label:
    "Brillhart A, Abramor B, Duplessis R, Pronce R, Seufferheld J, McIntosh S. Climber Mortality on Mount Aconcagua, 2013–2024. Wilderness & Environmental Medicine 36 (2025), doi:10.1177/10806032251330534",
  url: "https://doi.org/10.1177/10806032251330534",
  kind: "study",
  checked: READ,
};

const S_TMA: SourceRef = {
  label: "Mamlaka ya Hali ya Hewa Tanzania (Tanzania Meteorological Authority)",
  url: "https://www.meteo.go.tz/",
  kind: "issuer",
  checked: READ,
};

const S_TZ_SEASONS: SourceRef = {
  label:
    "Kessy WP et al. Spatiotemporal analysis of compound hot-dry and hot-wet extreme events over Tanzania (2025), doi:10.21203/rs.3.rs-8059890/v1 — PREPRINT, not yet peer reviewed",
  url: "https://doi.org/10.21203/rs.3.rs-8059890/v1",
  kind: "study",
  checked: READ,
};

const S_KILI_DRY_SEASONS: SourceRef = {
  label:
    "Azrag AGA et al. Prediction of insect pest distribution as influenced by elevation… PLoS ONE 13 (2018), doi:10.1371/journal.pone.0199569 — fieldwork on Mt Kilimanjaro, 1,000–1,700 m",
  url: "https://doi.org/10.1371/journal.pone.0199569",
  kind: "study",
  checked: READ,
};

const S_KILI_ALTITUDE_ILLNESS: SourceRef = {
  label:
    "Croughs M, Nyakunga GB, Sakita FM, Kilonzo K, Mmbaga BT, Soentjens P. Incidence and predictors of severe altitude illness symptoms in Mt. Kilimanjaro hikers: a prospective cohort study. Journal of Travel Medicine 29 (2022), doi:10.1093/jtm/taac044",
  url: "https://doi.org/10.1093/jtm/taac044",
  kind: "study",
  checked: READ,
};

const S_NEPAL_SEASONS: SourceRef = {
  label:
    "The Kathmandu Post — 'Nepal bans solo expeditions on Everest and other 8000ers', 5 February 2025 (reporting the amended royalty schedule)",
  url: "https://kathmandupost.com/money/2025/02/05/nepal-bans-solo-expeditions-on-everest-and-other-8000ers",
  kind: "secondary",
  checked: READ,
};

const S_ARNETTE_2026: SourceRef = {
  label: "Alan Arnette — Everest 2026: Season Summary, 2 June 2026",
  url: "https://www.alanarnette.com/2026/06/02/everest-2026-season-summary-records-crowds-trash-winds/",
  kind: "secondary",
  checked: READ,
};

const S_ARNETTE_2014: SourceRef = {
  label: "Alan Arnette — Everest 2014: Season Summary, A Nepal Tragedy, 9 June 2014",
  url: "https://www.alanarnette.com/2014/06/09/everest-2014-season-summary-nepal-tragedy/",
  kind: "secondary",
  checked: READ,
};

const S_EVEREST_BMJ: SourceRef = {
  label:
    "Firth PG, Zheng H, Windsor JS, Sutherland AI, Imray CH, Moore GWK, Semple JL, Roach RC, Salisbury RA. Mortality on Mount Everest, 1921–2006: descriptive study. BMJ 337 (2008), doi:10.1136/bmj.a2654",
  url: "https://doi.org/10.1136/bmj.a2654",
  kind: "study",
  checked: READ,
};

/* -------------------------------------------------------------------------- */
/* The records                                                                */
/* -------------------------------------------------------------------------- */

const RECORDS: MountainSeasonRecord[] = [
  /* ---------------------------------------------------------------- Denali */
  {
    mountainId: "denali",
    windows: [
      {
        months: [5, 6],
        rating: "best",
        reason:
          "The park calls late May through early June the peak of the season, with as many as 500 to 600 climbers on the West Buttress at once.",
        quote:
          "Mount McKinley's West Buttress route can have as many as 500 to 600 climbers on it during the peak of the climbing season from late May through early June.",
        source: S_NPS_FAQ,
      },
      {
        months: [4],
        rating: "possible",
        reason:
          "The park's own weather answer puts more settled days at the start of the season, and colder ones with them.",
        quote:
          "If you do not mind colder temperatures, then early season (late April to early May) tends to have more high pressure days.",
        source: S_NPS_FAQ,
        note: "Only the last week of April is described. The first days of the month are inside the permit window and outside this sentence.",
      },
      {
        months: [7],
        rating: "possible",
        reason:
          "Still inside the park's season — the 1,500-climber limit runs to 1 August — but past the settled early-season weather, with cloud and precipitation higher on the mountain as June warms.",
        quote:
          "As temperatures warm up in June, clouds become more common and bring precipitation higher on the mountain.",
        source: S_NPS_FAQ,
        note: "The National Weather Service publishes its Denali forecast May to July, per the park's mountaineering page.",
      },
      {
        months: [8, 9, 10, 11, 12, 1, 2, 3],
        rating: "avoid",
        reason:
          "Outside 1 April to 1 August the park does not run a climbing season: the seasonal climber limit, the ranger presence and the published mountain forecast all sit inside that window.",
        quote:
          "Yes, there is a limit of 1,500 climbers on Mount McKinley from April 1 to August 1. There is not a daily or weekly limit, only a seasonal limit.",
        source: S_NPS_FAQ,
      },
    ],
    hazards: [
      {
        name: "The Autobahn",
        routeScope: "West Buttress — High Camp (17,200 ft) to Denali Pass (18,200 ft)",
        what: "The snow and ice slope above High Camp, which climbers cross tired and high, often unprotected.",
        worst:
          "When it is hard ice rather than deep snow — the park says conditions vary between the two, and that climbers should be ready to place their own protection there.",
        severity: "deaths-recorded",
        source: S_NPS_FAQ,
        evidence: [
          {
            statement:
              "\"The Autobahn has been the scene of more fatalities on Mount McKinley than any other part of the mountain.\"",
            source: S_NPS_FAQ,
          },
        ],
      },
      {
        name: "Wind at and above the 14,200 ft camp",
        routeScope: "West Buttress — 14,200 ft camp and above",
        what: "Sustained storm wind on an Arctic-latitude peak, against camps as much as against climbers.",
        worst:
          "When a northerly system moves in: the park pairs the wind with temperatures below −35 °F and says wind chill accelerates frostbite even when the air is mild.",
        severity: "authority-warning",
        source: S_NPS_FAQ,
        evidence: [
          {
            statement:
              "\"Wind is perhaps the biggest danger on Mount McKinley… Winds in excess of 100mph have been recorded at 14,200 feet (4328 m).\"",
            source: S_NPS_FAQ,
          },
        ],
      },
      {
        name: "Frostbite",
        routeScope: "West Buttress — the whole upper mountain",
        /* This sentence said "routinely ends in amputation" until 11 September
           2026. NEITHER SOURCE SAYS THAT. The case series records thrombolysis,
           pentoxifylline, hyperbaric oxygen and sympathetic blockade — all
           limb-salvage treatment — and names no amputation; the NPS FAQ says
           nothing about outcome at all. It now says what the paper found. */
        what:
          "Tissue freezing. In the three Denali cases ICEFALL has a source for it took the fingers, and left one of the men unable to descend under his own power.",
        worst:
          "In wind, and at the high camps; the park's own answer is that wind chill accelerates it even when temperatures are mild.",
        severity: "rescues-recorded",
        source: S_NPS_FAQ,
        evidence: [
          {
            statement:
              "In 2021 three men were treated at a single US institution for frostbite sustained climbing Denali, all with finger injuries; one could not descend under his own power and required medical evacuation.",
            source: S_DENALI_FROSTBITE,
          },
        ],
      },
      {
        name: "Crevassed glacier travel",
        routeScope: "West Buttress — Kahiltna Glacier, basecamp upward",
        what: "The route's glacier approach, which the park describes as extensive and highly crevassed and which is why rope skills are a registration topic rather than a nicety.",
        worst:
          "The park does not name a time of day or a month; ICEFALL will not invent one.",
        severity: "authority-warning",
        source: S_NPS_FAQ,
        evidence: [
          {
            statement:
              "\"the West Buttress route involves extensive and highly crevassed glacier travel as well as snow and ice climbing to about 40 degrees in steepness.\"",
            source: S_NPS_FAQ,
          },
          {
            statement:
              "\"Because glacier travel is such a huge component of climbing Mount McKinley, it is imperative to your safety and survival that your team is skilled with proper glacier travel, route finding, and crevasse rescue procedures.\"",
            source: S_NPS_MOUNTAINEERING,
          },
        ],
      },
    ],
    curatedNote:
      "The curated record says Spring · Summer. The sourced best months are May and June, which is exactly that. No disagreement.",
  },

  /* ----------------------------------------------------------- Mont Blanc */
  {
    mountainId: "mont-blanc",
    windows: [
      {
        months: [6, 7, 8, 9],
        rating: "best",
        reason:
          "Entirely inside the Refuge du Goûter's published 2026 season — and a Goûter booking is the thing that gates this route, not a permit.",
        quote:
          "Opening of the refuge to the public on May 30, 2026. Closure of the refuge to the public on October 4, 2026 at 7 a.m.",
        source: S_FFCAM_GOUTER,
      },
      {
        months: [5, 10],
        rating: "possible",
        reason:
          "Only the tail of each month is covered: the refuge opens on 30 May and shuts at 7 a.m. on 4 October 2026.",
        source: S_FFCAM_GOUTER,
      },
      {
        months: [11, 12, 1, 2, 3, 4],
        rating: "avoid",
        reason:
          "The refuge is not open to the public, and FFCAM runs a separate unguarded-period booking process rather than a season.",
        source: S_FFCAM_GOUTER,
        note: "ICEFALL found no source saying the mountain is closed — winter ascents happen. What is recorded here is that the hut on the normal route is shut.",
      },
    ],
    hazards: [
      {
        name: "Rockfall in the Grand Couloir du Goûter",
        routeScope: "Goûter Route — the couloir crossing at about 3,340 m",
        what: "A gully the normal route crosses, swept by falling rock and ice; the single most documented objective hazard in the Alps.",
        worst:
          "Late in the day and in the warmth: the EDYTEM–ISTerre sensor study found rockfall most frequent between 18:00 and 20:00, identified 09:00–10:00 as the best window to cross, and found events more frequent during snowmelt or after rain.",
        severity: "deaths-recorded",
        source: S_UIAA_GOUTER,
        evidence: [
          {
            statement:
              "\"From 1990 to 2017, the PGHM carried out 347 rescue operations in the Goûter couloir, which resulted in 102 deaths and 230 injuries; On average, 3.7 fatal accidents per summer season, representing the highest frequency in the Alps.\"",
            source: S_CHAMONIX_GOUTER,
          },
          {
            statement:
              "\"Rock destabilization is responsible for 29% of the accidents that took place in the Couloir du Goûter\" — and the same write-up notes climbers also slip while watching uphill for rocks.",
            source: S_CHAMONIX_GOUTER,
          },
          {
            statement:
              "\"in critical hours rock falls were calculated every 24 minutes, with a maximum frequency between 18:00 and 20:00. Rock falls are more frequent when snow melts in the couloir or after rainfall.\"",
            source: S_UIAA_GOUTER,
          },
          {
            statement:
              "On 15 July 2026 a 57-year-old Czech UIAGM guide and a 49-year-old client were killed by rockfall in the Grand Couloir; a third member of the party was injured and airlifted out.",
            source: S_EXWEB_GOUTER_2026,
          },
        ],
        disagreement: {
          statement:
            "A different study puts the peak in the middle of the day, not the evening: 75% of rockfall between 10:00 and 16:00, and on average one event every 17 minutes between 11:00 and 12:00. ICEFALL has no standing to choose between the two and prints both. What they agree on is that the couloir is dangerous for most of the day.",
          source: S_WIKI_GRAND_COULOIR,
        },
      },
    ],
    curatedNote:
      "The curated record says Summer. The hut's own published season runs to 4 October, so September — an autumn month by the app's labels — sits entirely inside it. ICEFALL reports the difference rather than rewriting the curated field.",
  },

  /* ------------------------------------------------------------ Matterhorn */
  {
    mountainId: "matterhorn",
    windows: [
      {
        months: [7, 8],
        rating: "best",
        reason:
          "Entirely inside the Hörnlihütte's published 2026 season — the hut at the foot of the Hörnli Ridge, and the start of the normal route.",
        quote: "Geöffnet vom 26. Juni bis 19. September 2026.",
        source: S_HOERNLIHUETTE,
      },
      {
        months: [6, 9],
        rating: "possible",
        reason:
          "Part-covered only: the hut opens on 26 June and closes on 19 September 2026.",
        source: S_HOERNLIHUETTE,
      },
      {
        months: [10, 11, 12, 1, 2, 3, 4, 5],
        rating: "avoid",
        reason:
          "The hut is shut; from 19 September only the emergency room is open.",
        quote: "Notraum ab 19. September geöffnet.",
        source: S_HOERNLIHUETTE,
      },
    ],
    hazards: [],
    hazardsAbsentReason:
      "ICEFALL has recorded no hazards for the Matterhorn. Not because the Hörnli Ridge has none — it plainly has — but because nothing found on 11 September 2026 met this file's standard: a named published source giving what the hazard is, where on the route, and when it is worst. A plausible sentence about rockfall or route-finding on the descent would read the same as a sourced one and would be worth nothing. Ask the Zermatt guides' office.",
    curatedNote:
      "The curated record says Summer. The hut's season, 26 June to 19 September, agrees.",
  },

  /* --------------------------------------------------------------- Triglav */
  {
    mountainId: "triglav",
    windows: [
      {
        months: [7, 8, 9],
        rating: "best",
        reason:
          "Inside the staffed season of Triglavski dom na Kredarici, the hut on the Kredarica approach to the summit.",
        quote: "Year 2026: open from June 6th to September 30th!",
        source: S_TRIGLAVSKI_DOM,
      },
      {
        months: [6],
        rating: "possible",
        reason:
          "Part-covered, and the hut's own two statements do not quite agree about when the season starts.",
        source: S_TRIGLAVSKI_DOM,
        note: "The banner says 6 June to 30 September 2026; the operating-time section on the same site says \"Seasonally open (staffed): from mid-June to early October\" and adds that \"The exact opening date is known a few days before the opening and is announced.\" Both are recorded; neither is smoothed away.",
      },
      {
        months: [10, 11, 12, 1, 2, 3, 4, 5],
        rating: "avoid",
        reason:
          "Outside the season the hut is unstaffed: the meteorologists at the observatory provide a bed, a sheet and a blanket in unheated rooms, and no food.",
        quote:
          "Out of season (if our staff is not available), you will be welcomed by meteorologists who will provide emergency accommodation (bed, sheet, blanket, rooms are unheated, no food is provided).",
        source: S_TRIGLAVSKI_DOM,
      },
    ],
    hazards: [],
    hazardsAbsentReason:
      "ICEFALL has recorded no hazards for Triglav. The Slovenian alpine association and the mountain rescue service publish national accident statistics, but nothing found on 11 September 2026 tied a named, documented hazard to the Kredarica route in particular. Generic via ferrata advice would have filled the space without telling a reader anything about this mountain.",
    curatedNote:
      "The curated record says Summer · Autumn. The hut's staffed season, 6 June to 30 September, covers both and agrees.",
  },

  /* --------------------------------------------------------- Mount Olympus */
  {
    mountainId: "mount-olympus",
    windows: [
      {
        months: [6, 7, 8, 9],
        rating: "best",
        reason:
          "Inside the operating season of Refuge A 'Spilios Agapitos', the hut the Prionia route stages through.",
        quote:
          "The refuge typically operates from mid-May to late October each year.",
        source: S_OLYMPUS_REFUGE,
      },
      {
        months: [5, 10],
        rating: "possible",
        reason:
          "The published season starts in mid-May and ends in late October, so only part of each month is covered — and the refuge itself says the dates are typical rather than fixed.",
        source: S_OLYMPUS_REFUGE,
      },
      {
        months: [11, 12, 1, 2, 3, 4],
        rating: "avoid",
        reason:
          "Outside those dates the refuge is closed, or open only as emergency shelter.",
        quote:
          "Outside these dates it is generally closed or only available for emergency shelter.",
        source: S_OLYMPUS_REFUGE,
      },
    ],
    hazards: [],
    hazardsAbsentReason:
      "ICEFALL has recorded no hazards for Mount Olympus. The exposed scrambling between the refuge and Mytikas is well known to Greek mountaineers, but nothing found on 11 September 2026 published it as a named hazard with a time and a record behind it.",
    curatedNote:
      "The curated record says Summer · Autumn. The refuge's mid-May to late-October season is wider at the front — it reaches back into spring — and ICEFALL reports that rather than editing the curated field.",
  },

  /* --------------------------------------------------------- Gran Paradiso */
  {
    mountainId: "gran-paradiso",
    windows: [
      {
        months: [6, 7, 8, 9],
        rating: "best",
        reason:
          "The national park's own suggested period for the approach from Pont di Valsavarenche to the Vittorio Emanuele II hut, which is the first day of the normal route.",
        quote: "Suggested period June - September. Season Summer.",
        source: S_PNGP,
      },
    ],
    hazards: [],
    hazardsAbsentReason:
      "ICEFALL has recorded no hazards for Gran Paradiso. The park publishes a suggested period and a route description; it does not publish a hazard record for the normal route, and no other named source found on 11 September 2026 did either.",
    curatedNote:
      "The curated record says Summer, and the park's suggested period is June to September — agreeing, except that September is an autumn month by the app's labels. October to May carry no rating at all: the park says nothing about them, so neither does ICEFALL.",
  },

  /* ------------------------------------------------------------ Aconcagua */
  {
    mountainId: "aconcagua",
    windows: [
      {
        months: [12, 1, 2],
        rating: "best",
        reason:
          "The months entirely inside the window in which the provincial park keeps rangers, a medical service and air support on the mountain.",
        quote:
          "Desde el 1 de diciembre y hasta el 6 de marzo estarán operativos Guardaparques, Servicio Médico y Trabajo Aéreo, con posibilidad de adelantar o extender la cobertura según la concurrencia.",
        source: S_MENDOZA_DECREE,
        note: "From 1 December to 6 March rangers, the medical service and air operations are in place, and the decree allows the province to bring that forward or extend it depending on numbers.",
      },
      {
        months: [11],
        rating: "possible",
        reason:
          "The summer season opens on 1 November, but the rangers, medical service and air support are not in place until 1 December.",
        quote:
          "El 1 de noviembre comienza la temporada estival del Parque Provincial Aconcagua.",
        source: S_MENDOZA_DECREE,
      },
      {
        months: [3],
        rating: "possible",
        reason:
          "Only the first week: the ranger, medical and air-support window ends on 6 March.",
        source: S_MENDOZA_DECREE,
      },
      {
        months: [5, 6, 7, 8, 9, 10],
        rating: "avoid",
        reason:
          "Before the summer season opens on 1 November there is no park season to enter.",
        source: S_MENDOZA_DECREE,
      },
    ],
    hazards: [
      {
        name: "Dying high — the altitude above 6,000 m",
        routeScope: "Normal Route (Horcones) and the 360°/Vacas route alike",
        what: "Medical collapse at altitude rather than a fall: nine in ten deaths on this mountain happen above 6,000 m, and seven in ten are recorded as medical causes with no further specification.",
        worst:
          "High on the mountain, and in older climbers — the study found climbers over 50 more than five times as likely to die as those under 50.",
        severity: "deaths-recorded",
        source: S_ACONCAGUA_MORTALITY,
        evidence: [
          {
            statement:
              "\"Over the study period, 21 of 29,397 climbers died, yielding a fatality rate of 0.071% (0.71 per 1000). Most fatalities occurred at over 6000 m (90%) and were of unspecified medical cause (71%). Trauma represented 19% of deaths.\" (2013–2024)",
            source: S_ACONCAGUA_MORTALITY,
          },
          {
            statement:
              "\"Climbers older than 50 y were more than 5 times more likely to die on Aconcagua than those younger than 50 y (odds ratio = 5.11).\"",
            source: S_ACONCAGUA_MORTALITY,
          },
          {
            statement:
              "The province requires every ascent and long-trek permit holder to carry insurance or a service covering air evacuation from 5,600 m down to Horcones — the authority pricing the same risk into a rule.",
            source: S_MENDOZA_DECREE,
          },
        ],
      },
    ],
    curatedNote:
      "The curated record says Summer, which is right in Mendoza — but the app's four season labels are northern-hemisphere, so the park's core December-to-February window maps to 'winter' and `seasonComparison()` will report a difference. That is a labelling artefact, not a conflict of fact. Do not 'correct' the curated field on the strength of it.",
  },

  /* --------------------------------------------------------- Kilimanjaro */
  {
    mountainId: "kilimanjaro",
    windows: [
      {
        months: [10, 11, 12],
        rating: "avoid",
        reason:
          "Tanzania's short rains. The national met authority issues a seasonal outlook for exactly these months.",
        quote:
          "Mwelekeo wa Mvua za Vuli (Oktoba - Desemba), 2026 — the outlook for the Vuli (October to December) rains season.",
        source: S_TMA,
      },
      {
        months: [3, 4, 5],
        rating: "avoid",
        reason: "Tanzania's long rains — the heavier of the country's two wet seasons.",
        quote:
          "\"a peak during the March-May (MAM) long rains… the October-December (OND) short rains\"",
        source: S_TZ_SEASONS,
        note: "This window rests on a preprint that has not been peer reviewed. TMA plainly runs a Masika season — it publishes Masika forecasts — but no TMA page naming its months could be read on 11 September 2026. Upgrade this source when one can.",
      },
      {
        months: [1, 2, 6, 7, 8, 9],
        rating: "possible",
        reason:
          "These months fall outside both of Tanzania's published rain seasons — and being outside a rain season is not the same as a source calling them good for climbing, which none that ICEFALL found does.",
        source: S_TMA,
        note: "Fieldwork on Kilimanjaro itself names June the cool dry season and January the warm dry season — but at 1,000–1,700 m on the lower slopes, a long way below Uhuru.",
      },
    ],
    hazards: [
      {
        name: "Severe altitude illness on the trekking routes",
        routeScope:
          "Machame, Lemosho, Marangu, Rongai and Londorosi — the study covered all of them",
        what: "Altitude illness serious enough that the correct response is immediate descent, on a mountain where descent is easy and where hikers keep going up anyway.",
        worst:
          "When mild symptoms are ignored. The study's one finding about what helps was blunt: the only measure associated with fewer severe symptoms was not climbing further.",
        severity: "deaths-recorded",
        source: S_KILI_ALTITUDE_ILLNESS,
        evidence: [
          {
            statement:
              "\"A total of 1237 recreational hikers and 266 porters or guides were included. The incidence of severe symptoms was 8.6% in recreational hikers and 1.5% in porters and guides. One percent (1.1%) of hikers was hospitalized due to SAI.\"",
            source: S_KILI_ALTITUDE_ILLNESS,
          },
          {
            statement:
              "\"The majority climbed further despite the presence of mild or severe symptoms.\"",
            source: S_KILI_ALTITUDE_ILLNESS,
          },
          {
            statement:
              "\"Each year several Mt. Kilimanjaro hikers die due to altitude illness although urgent descent is technically easily possible.\"",
            source: S_KILI_ALTITUDE_ILLNESS,
          },
          {
            statement:
              "Longer itineraries did better: climbing in more days predicted summit success, alongside acetazolamide prophylaxis and gaining height in daylight.",
            source: S_KILI_ALTITUDE_ILLNESS,
          },
          {
            statement:
              "The same fieldwork that names Kilimanjaro's dry and rainy seasons was carried out on the mountain's own slopes, which is why this file uses it for the season rather than a travel site's month chart.",
            source: S_KILI_DRY_SEASONS,
          },
        ],
      },
    ],
    curatedNote:
      "The curated record says Winter · Summer · Autumn. The sourced months have no 'best' at all — no source ICEFALL found calls any month on Kilimanjaro good for climbing; what exists is two published rain seasons and the gaps between them. The curated 'autumn' also sits across October and November, which are inside TMA's Vuli rains. Reported, not overwritten.",
  },

  /* -------------------------------------------------------------- Everest */
  {
    mountainId: "everest",
    windows: [
      {
        months: [5],
        rating: "best",
        reason:
          "The summit month, and by a long way: in 2026 about four in five of the season's summits fell in a ten-day stretch of it.",
        quote:
          "roughly 80% of this year's 1,008 summits occurring between May 17th and May 26th",
        source: S_ARNETTE_2026,
        note: "The first summit of 2026 was 13 May and the last 28 May. Wind shut the mountain from 14 to 18 May in the middle of that. A window is a few days, not a month.",
      },
      {
        months: [3, 4],
        rating: "possible",
        reason:
          "Inside Nepal's spring season, which the royalty schedule defines as March to May and prices highest — USD 15,000 on the standard south route — but these are the trek-in and rotation weeks, not summit weeks.",
        quote:
          "the royalty fee for foreign climbers attempting Everest from the standard south route in the spring season (March-May) has increased from $11,000 to $15,000 per person",
        source: S_NEPAL_SEASONS,
      },
      {
        months: [9, 10, 11],
        rating: "possible",
        reason:
          "Nepal's autumn season, September to November, at half the spring royalty — permits are issued, and very few people use them.",
        source: S_NEPAL_SEASONS,
      },
      {
        months: [6, 7, 8],
        rating: "avoid",
        reason:
          "Nepal's regulation names June to August the monsoon season and prices it at the lowest tier.",
        source: S_NEPAL_SEASONS,
        note: "ICEFALL records the government's name for the season and its price. A cheap royalty is a statement about demand, not about weather, and this file will not dress one up as the other.",
      },
      {
        months: [12, 1, 2],
        rating: "avoid",
        reason:
          "Nepal's winter season, December to February, on the same lowest royalty tier as the monsoon.",
        source: S_NEPAL_SEASONS,
      },
    ],
    hazards: [
      {
        name: "The descent from the summit",
        routeScope: "South Col and North Ridge — above 8,000 m, going down",
        what: "Not the climb but the return from it: of those who died after climbing above 8,000 m, more than half died descending from the summit, most showing signs of neurological failure rather than injury.",
        worst:
          "After a late summit. The median summit time was 09:00–09:59 for survivors and 13:00–13:59 for those who did not come back.",
        severity: "deaths-recorded",
        source: S_EVEREST_BMJ,
        evidence: [
          {
            statement:
              "\"Of 94 mountaineers who died after climbing above 8000 m, 53 (56%) died during descent from the summit, 16 (17%) after turning back, 9 (10%) during the ascent…\"",
            source: S_EVEREST_BMJ,
          },
          {
            statement:
              "\"The median time to reach the summit via standard routes was earlier for survivors than for non-survivors (0900-0959 v 1300-1359, P<0.001).\"",
            source: S_EVEREST_BMJ,
          },
          {
            statement:
              "\"Profound fatigue (n=34), cognitive changes (n=21), and ataxia (n=12) were the commonest symptoms reported in non-survivors\" — the paper concludes these are consistent with high-altitude cerebral oedema presenting on the way down.",
            source: S_EVEREST_BMJ,
          },
          {
            statement:
              "Two of the five deaths on Everest in 2026 were climbers who died descending after summiting on 22 May.",
            source: S_ARNETTE_2026,
          },
        ],
      },
      {
        name: "The Khumbu Icefall",
        routeScope: "South Col route, Nepal side — Base Camp to Camp 1",
        what: "A moving glacier crossed by ladders and re-fixed each season, overhung in part by a serac on the West Shoulder. Load-carrying Nepali staff pass through it many more times than any client does.",
        worst:
          "Early morning, bunched up at a bottleneck under the West Shoulder — which is exactly how the 2014 disaster happened.",
        severity: "deaths-recorded",
        source: S_ARNETTE_2014,
        evidence: [
          {
            statement:
              "On 18 April 2014 at about 06:30 a serac on the West Shoulder released onto Sherpas carrying loads into the Western Cwm. Sixteen were killed — the single deadliest incident in Everest's history. Thirteen bodies were recovered; three remain in the crevasses of the icefall.",
            source: S_ARNETTE_2014,
          },
          {
            statement:
              "They were bunched together under a known hazard, held up while a ladder over a crevasse was repaired. The season on the Nepal side was cancelled afterwards.",
            source: S_ARNETTE_2014,
          },
        ],
      },
    ],
    curatedNote:
      "The curated record says Spring. The sourced best month is May, which is spring. No disagreement — but note that the curated label covers three months and the real window is a few days inside one of them.",
  },
];

const BY_ID = new Map(RECORDS.map((r) => [r.mountainId, r]));

/* -------------------------------------------------------------------------- */
/* Lookups                                                                    */
/* -------------------------------------------------------------------------- */

/** The season and hazard record for a mountain, or null where none is held. */
export function seasonFor(mountainId: string | undefined): MountainSeasonRecord | null {
  if (!mountainId) return null;
  return BY_ID.get(mountainId) ?? null;
}

/** One month's rating, with the sentence and the source that produced it. */
export interface MonthEntry {
  month: Month;
  rating: MonthRating;
  reason: string;
  quote?: string;
  source: SourceRef;
  note?: string;
}

/**
 * Twelve slots, January first. A slot is null where NO SOURCE SPEAKS TO THAT
 * MONTH — render `NO_MONTH_RATING` there, never a neutral-looking "possible".
 * Returns null when the mountain has no record at all, which is a different
 * thing again and gets `NO_SEASON_RECORDED`.
 */
export function monthPictureFor(
  mountainId: string | undefined,
): (MonthEntry | null)[] | null {
  const record = seasonFor(mountainId);
  if (!record) return null;

  const slots: (MonthEntry | null)[] = MONTHS.map(() => null);
  for (const window of record.windows) {
    for (const month of window.months) {
      slots[month - 1] = {
        month,
        rating: window.rating,
        reason: window.reason,
        quote: window.quote,
        source: window.source,
        note: window.note,
      };
    }
  }
  return slots;
}

/** How many of the twelve months a record actually rates. */
export function ratedMonthCount(record: MountainSeasonRecord): number {
  return new Set(record.windows.flatMap((w) => w.months)).size;
}

const SEASON_ORDER: Season[] = ["spring", "summer", "autumn", "winter"];

const SEASON_LABEL: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
};

/** The seasons implied by the months a source rated "best". Empty is allowed. */
export function sourcedBestSeasons(record: MountainSeasonRecord): Season[] {
  const seasons = new Set<Season>();
  for (const window of record.windows) {
    if (window.rating !== "best") continue;
    for (const month of window.months) seasons.add(MONTH_SEASON[month]);
  }
  return SEASON_ORDER.filter((s) => seasons.has(s));
}

export interface SeasonComparison {
  agrees: boolean;
  sourced: Season[];
  curated: Season[];
  /** In the sourced months but not in the curated field. */
  onlySourced: Season[];
  /** In the curated field but not in any month a source rated "best". */
  onlyCurated: Season[];
  /** A sentence naming the difference. Never a sentence resolving it. */
  sentence: string;
  /** The record's own note, where it has one. Read it before believing the sentence. */
  note?: string;
}

/**
 * Compare the sourced months against the curated `bestSeasons`, and REPORT.
 *
 * This function deliberately has no power to change anything. A previous bug on
 * the mountain page printed a derived season line directly under the curated
 * badges saying the opposite thing; the fix is not a better derivation, it is
 * saying out loud that the two disagree and letting a person settle it.
 *
 * Returns null when no month is rated "best" — there is then nothing to compare,
 * and a caller should say so rather than infer agreement from silence.
 */
export function seasonComparison(
  record: MountainSeasonRecord,
  curated: Season[],
): SeasonComparison | null {
  const sourced = sourcedBestSeasons(record);
  if (sourced.length === 0) return null;

  const curatedOrdered = SEASON_ORDER.filter((s) => curated.includes(s));
  const onlySourced = sourced.filter((s) => !curatedOrdered.includes(s));
  const onlyCurated = curatedOrdered.filter((s) => !sourced.includes(s));
  const agrees = onlySourced.length === 0 && onlyCurated.length === 0;

  const list = (seasons: Season[]) => seasons.map((s) => SEASON_LABEL[s]).join(" · ");

  const sentence = agrees
    ? `ICEFALL's assessment (${list(curatedOrdered)}) and the sourced months agree.`
    : `ICEFALL's assessment says ${list(curatedOrdered)}; the sourced months point at ${list(
        sourced,
      )}. Both are shown — ICEFALL reports the difference rather than picking one.`;

  return {
    agrees,
    sourced,
    curated: curatedOrdered,
    onlySourced,
    onlyCurated,
    sentence,
    note: record.curatedNote,
  };
}

/* -------------------------------------------------------------------------- */
/* The sentences for absence                                                  */
/* -------------------------------------------------------------------------- */

/** Shown where a mountain has no season record at all. */
export const NO_SEASON_RECORDED =
  "ICEFALL has not recorded a month-by-month season for this mountain yet. Rather than infer one from the latitude or from a comparable peak, there is nothing here — ask the park, the hut or the guides office that runs it.";

/** Shown for a month inside a record that no source speaks to. */
export const NO_MONTH_RATING =
  "No source ICEFALL holds says anything about this month. That is not the same as a bad month, and not the same as a good one.";

/** Shown where a record holds no hazards. */
export const NO_HAZARDS_RECORDED =
  "ICEFALL has recorded no hazards for this mountain. That means none documented to this app's standard — not that the route is safe. The absence is the honest answer; a plausible sentence would not be.";

/** The bar a hazard has to clear to appear at all. Worth showing next to them. */
export const HAZARD_STANDARD =
  "Every hazard here names what it is, where on the route, when it is worst, and the published source it came from. Anything ICEFALL could not source to a named page is not shown.";
