import type { Difficulty, Season } from "@/types";

/**
 * Automatic peak assessment.
 *
 * OpenStreetMap gives a peak a name, a position and an elevation — and nothing
 * about how hard it is or what you need. Rather than leave a discovered peak as
 * a bare number, ICEFALL derives an assessment from elevation and latitude.
 *
 * This is an ESTIMATE and every screen that shows it says so. It describes the
 * class of mountain, not a route: an easy line and a desperate one share the
 * same summit, and only a guidebook or a guide can tell you which you're on.
 */

export interface PeakAssessment {
  band: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  difficulty: Difficulty;
  label: string;
  /** For stat tiles and chips, where the full label wraps to three lines. */
  shortLabel: string;
  summary: string;
  /** Competences the class of objective normally demands. */
  skills: string[];
  /** ICEFALL products from the existing catalogue. */
  equipmentIds: string[];
  /** Technical kit ICEFALL doesn't make — named so the list is complete. */
  technicalKit: string[];
  seasons: Season[];
  seasonNote: string;
  requiresGuide: boolean;
  acclimatisation?: string;
}

const BANDS: {
  max: number;
  band: PeakAssessment["band"];
  difficulty: Difficulty;
  label: string;
  shortLabel: string;
  summary: string;
  skills: string[];
  equipmentIds: string[];
  technicalKit: string[];
}[] = [
  {
    max: 1000,
    band: 1,
    difficulty: 1,
    label: "Hill walk",
    shortLabel: "Hill walk",
    summary:
      "Walking terrain on paths. The mountain asks for little beyond decent footwear and an eye on the weather.",
    skills: ["Basic route finding", "Reading a forecast"],
    equipmentIds: ["base-merino", "shell-summit"],
    technicalKit: ["Map and compass", "Head torch"],
  },
  {
    max: 2000,
    band: 2,
    difficulty: 2,
    label: "Mountain hike",
    shortLabel: "Mountain hike",
    summary:
      "Sustained walking with real ascent. Weather changes faster than the valley suggests and the descent is longer than it looks.",
    skills: ["Navigation in poor visibility", "Pacing a long ascent", "Judging a turnaround time"],
    equipmentIds: ["base-merino", "mid-grid", "shell-summit", "pack-alpine-35"],
    technicalKit: ["Map and compass", "Head torch", "Trekking poles"],
  },
  {
    max: 2900,
    band: 3,
    difficulty: 3,
    label: "Demanding mountain day",
    shortLabel: "Demanding day",
    summary:
      "Long, steep ground with sections of hands-on scrambling and loose rock. Early starts and firm turnaround discipline matter.",
    skills: ["Grade I–II scrambling", "Comfort with exposure", "Rockfall awareness"],
    equipmentIds: ["base-merino", "mid-grid", "shell-summit", "pant-alpine", "pack-alpine-35"],
    technicalKit: ["Helmet", "Trekking poles", "Head torch", "First aid kit"],
  },
  {
    max: 3600,
    band: 4,
    difficulty: 4,
    label: "Alpine — snow and glacier",
    shortLabel: "Alpine",
    summary:
      "Snow, ice and very likely glacier. Crampon technique and roped travel stop being optional at this altitude.",
    skills: [
      "Crampon and ice-axe technique",
      "Self-arrest on steep snow",
      "Roped glacier travel",
      "Crevasse rescue",
    ],
    equipmentIds: [
      "base-merino",
      "mid-grid",
      "insul-alpine",
      "shell-summit",
      "pant-alpine",
      "pack-alpine-35",
    ],
    technicalKit: [
      "Crampons",
      "Ice axe",
      "Harness and rope",
      "Helmet",
      "Crevasse rescue kit",
      "Glacier glasses",
    ],
  },
  {
    max: 4500,
    band: 5,
    difficulty: 4,
    label: "Serious alpine",
    shortLabel: "Serious alpine",
    summary:
      "A full alpine undertaking. Altitude begins to bite, days are long, and conditions decide whether the objective is on at all.",
    skills: [
      "Sustained movement above 3,500 m",
      "Efficient rope work on mixed ground",
      "Reading snow and serac hazard",
      "Multi-hour endurance under load",
    ],
    equipmentIds: [
      "base-merino",
      "mid-grid",
      "insul-alpine",
      "shell-summit",
      "pant-alpine",
      "pack-alpine-35",
    ],
    technicalKit: [
      "Crampons",
      "Technical ice axe",
      "Harness and rope",
      "Helmet",
      "Crevasse rescue kit",
      "Glacier glasses",
    ],
  },
  {
    max: 6000,
    band: 6,
    difficulty: 5,
    label: "High altitude",
    shortLabel: "High altitude",
    summary:
      "Altitude is the defining difficulty. Staged acclimatisation is required and the margin for a bad decision narrows sharply.",
    skills: [
      "Documented experience above 4,500 m",
      "Staged acclimatisation",
      "Recognising acute mountain sickness",
      "Cold-injury prevention",
    ],
    equipmentIds: [
      "base-merino",
      "mid-grid",
      "insul-expedition",
      "shell-summit",
      "pant-alpine",
      "pack-expedition-65",
    ],
    technicalKit: [
      "Crampons",
      "Ice axe",
      "Harness and rope",
      "Helmet",
      "Double boots",
      "Expedition sleeping system",
    ],
  },
  {
    max: Infinity,
    band: 7,
    difficulty: 5,
    label: "Extreme altitude expedition",
    shortLabel: "Extreme altitude",
    summary:
      "An expedition measured in weeks, undertaken with a professional operator. Nothing about this is a day out.",
    skills: [
      "Prior 7,000 m or 8,000 m experience",
      "Fixed-line ascent and descent",
      "Supplementary oxygen systems",
      "Full expedition self-sufficiency",
    ],
    equipmentIds: [
      "base-merino",
      "mid-grid",
      "insul-expedition",
      "shell-summit",
      "pack-expedition-65",
    ],
    technicalKit: [
      "8,000 m double boots",
      "Supplementary oxygen",
      "Crampons and technical axes",
      "Harness, jumar and rope",
      "Expedition sleeping system",
    ],
  },
];

/**
 * The assessment taxonomy itself, easiest first — for filter chips and legends
 * that need to offer the bands as choices rather than derive one from a peak.
 * Read-only projection of `BANDS`; nothing here is invented.
 */
export const ASSESSMENT_BANDS: readonly {
  band: PeakAssessment["band"];
  label: string;
  shortLabel: string;
  /**
   * The band as an ELEVATION RANGE — what it actually is.
   *
   * The filter chips on the objectives screen used `shortLabel`, so a control
   * that partitions a list purely by height wore grade words: "Alpine",
   * "Serious alpine". Two problems with that. It presented a derived grade as
   * a category in a list that is mostly CURATED mountains, whose real grades
   * are known and frequently disagree — the Matterhorn is written up as
   * "Technical alpine" and its elevation puts it in "Serious alpine". And a
   * grade is a judgement about a route, which is exactly what
   * `services/peakTier.ts` stops the app asserting anywhere it has not been.
   *
   * The split itself is unchanged and useful: height IS what people filter a
   * mountain list by. It just says so now.
   */
  rangeLabel: string;
}[] = BANDS.map((b, i) => {
  const lo = i === 0 ? 0 : BANDS[i - 1].max;
  const hi = b.max;
  return {
    band: b.band,
    label: b.label,
    shortLabel: b.shortLabel,
    rangeLabel: !Number.isFinite(hi)
      ? `${lo.toLocaleString()} m +`
      : lo === 0
        ? `Under ${hi.toLocaleString()} m`
        : `${lo.toLocaleString()}–${hi.toLocaleString()} m`,
  };
});

/**
 * Season windows from latitude, not guesswork. A 4,000 m peak in Patagonia does
 * not share a season with one in the Alps, and the tropics have none at all.
 */
function seasonsFor(
  lat: number,
  elevationM: number,
  lon?: number,
): { seasons: Season[]; note: string } {
  // The South Asian monsoon overrides latitude entirely. Nepal, Sikkim, Garhwal
  // and Bhutan sit at ~27–31°N, where the generic "high northern peak" rule
  // would return summer — which is the monsoon, and the single worst time to be
  // on those mountains. Getting this wrong is not a cosmetic error.
  const himalayanMonsoon = lon !== undefined && lat >= 25 && lat <= 32 && lon >= 79 && lon <= 97;
  if (himalayanMonsoon && elevationM >= 3000) {
    return {
      seasons: ["spring", "autumn"],
      note: "Himalayan monsoon belt — the windows are pre-monsoon (April–May) and post-monsoon (October–November). Summer is the monsoon itself: heavy snowfall, high avalanche danger and almost no visibility.",
    };
  }

  // The Karakoram sits north-west of the monsoon's reach and runs the opposite
  // way — its season is the height of summer.
  const karakoram = lon !== undefined && lat >= 33 && lat <= 38 && lon >= 70 && lon <= 80;
  if (karakoram && elevationM >= 3000) {
    return {
      seasons: ["summer"],
      note: "Karakoram and Hindu Kush — the window is roughly late June to August, outside the monsoon that closes the Himalaya further east.",
    };
  }

  const tropical = Math.abs(lat) < 23.5;
  if (tropical) {
    return {
      seasons: ["spring", "summer", "autumn", "winter"],
      note: "Tropical latitude — climbable year round, but go in the local dry season.",
    };
  }

  const north = lat >= 0;
  const high = elevationM >= 3000;

  if (high) {
    return {
      seasons: north ? ["summer"] : ["winter"],
      note: north
        ? "High northern peak — the window is generally June to September."
        : "High southern peak — the window is generally December to March.",
    };
  }

  return {
    seasons: north ? ["spring", "summer", "autumn"] : ["autumn", "winter", "spring"],
    note: north
      ? "Snow-free for much of the year; expect winter conditions from November."
      : "Snow-free for much of the year; expect winter conditions from May.",
  };
}

/**
 * @param lon Optional, but seasons are materially wrong without it in the
 *            Himalaya and Karakoram — pass it wherever it's known.
 */
export function assessPeak(elevationM: number, lat: number, lon?: number): PeakAssessment {
  const spec = BANDS.find((b) => elevationM < b.max) ?? BANDS[BANDS.length - 1];
  const { seasons, note } = seasonsFor(lat, elevationM, lon);

  return {
    band: spec.band,
    difficulty: spec.difficulty,
    label: spec.label,
    shortLabel: spec.shortLabel,
    summary: spec.summary,
    skills: spec.skills,
    equipmentIds: spec.equipmentIds,
    technicalKit: spec.technicalKit,
    seasons,
    seasonNote: note,
    requiresGuide: spec.band >= 4,
    acclimatisation:
      elevationM >= 5500
        ? "Plan several weeks of staged acclimatisation, gaining no more than 300–500 m of sleeping altitude per night above 3,000 m."
        : elevationM >= 3500
          ? "Sleep at altitude beforehand if you can. Above 3,000 m, climb high and sleep low."
          : undefined,
  };
}

export const ASSESSMENT_DISCLAIMER =
  "This assessment is generated from the peak's elevation and latitude. It describes the class of mountain, not a specific route — an easy line and a serious one can share a summit. Check a guidebook, the local guides office and a mountain forecast before committing, and hire a certified guide for anything glaciated or technical.";
