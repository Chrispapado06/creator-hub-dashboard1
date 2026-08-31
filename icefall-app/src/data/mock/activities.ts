import { deriveSplits, generateTrack } from "@/lib/geo";
import type { Activity, Conditions, SportMode } from "@/types";
import { daysAgo } from "./clock";

interface Seed {
  id: string;
  mode: SportMode;
  title: string;
  location: string;
  daysBack: number;
  hour: number;
  distanceKm: number;
  elevationGainM: number;
  durationSec: number;
  startEleM: number;
  avgHr: number;
  maxHr: number;
  calories: number;
  conditions: Conditions;
  insight?: string;
  photo?: string;
  outAndBack?: boolean;
}

const SEEDS: Seed[] = [
  {
    id: "act-01",
    mode: "hiking",
    title: "Aiguillette des Houches",
    location: "Chamonix, France",
    daysBack: 1,
    hour: 7,
    distanceKm: 14.2,
    elevationGainM: 1180,
    durationSec: 4 * 3600 + 22 * 60,
    startEleM: 1020,
    avgHr: 138,
    maxHr: 167,
    calories: 1420,
    conditions: {
      tempC: 11,
      windKph: 14,
      summary: "Clear, light valley wind",
      icon: "clear",
      visibilityKm: 45,
    },
    insight:
      "Strong endurance session. Your climbing pace held within 4% from the treeline to the summit — the aerobic base is consolidating.",
    photo: "/img/onboarding-track.jpg",
  },
  {
    id: "act-02",
    mode: "running",
    title: "Petit Balcon Sud",
    location: "Les Praz, France",
    daysBack: 3,
    hour: 18,
    distanceKm: 11.6,
    elevationGainM: 420,
    durationSec: 62 * 60 + 40,
    startEleM: 1060,
    avgHr: 154,
    maxHr: 178,
    calories: 890,
    conditions: {
      tempC: 16,
      windKph: 9,
      summary: "Warm evening, dry trail",
      icon: "clear",
      visibilityKm: 30,
    },
    /* Was: "Heart rate stayed in zone 2 for 78% of the session." Worse than a
       zone label — it states a PERCENTAGE OF A SESSION SPENT IN A BAND, which
       needs both a heart-rate stream and a measured threshold. ICEFALL has
       neither. A precise figure is the most convincing form an unmeasured
       number can take. */
    insight: "Controlled aerobic run. Effort stayed even from start to finish.",
    outAndBack: false,
  },
  {
    id: "act-03",
    mode: "mountaineering",
    title: "Gran Paradiso — Normal Route",
    location: "Valsavarenche, Italy",
    daysBack: 9,
    hour: 4,
    distanceKm: 16.4,
    elevationGainM: 2080,
    durationSec: 8 * 3600 + 48 * 60,
    startEleM: 1960,
    avgHr: 132,
    maxHr: 171,
    calories: 3240,
    conditions: {
      tempC: -4,
      windKph: 21,
      summary: "Cold start, good refreeze",
      icon: "snow",
      visibilityKm: 50,
    },
    insight:
      "Your first 4,000 m summit this season. Ascent rate above 3,600 m dropped 18% — expected, and the clearest signal to prioritise altitude exposure.",
    photo: "/img/gran-paradiso.jpg",
  },
  {
    id: "act-04",
    mode: "hiking",
    title: "Lac Blanc loop",
    location: "Aiguilles Rouges, France",
    daysBack: 5,
    hour: 9,
    distanceKm: 12.8,
    elevationGainM: 860,
    durationSec: 3 * 3600 + 51 * 60,
    startEleM: 1450,
    avgHr: 129,
    maxHr: 158,
    calories: 1180,
    conditions: {
      tempC: 9,
      windKph: 26,
      summary: "Breezy, high cloud",
      icon: "cloud",
      visibilityKm: 35,
    },
  },
  {
    id: "act-05",
    mode: "climbing",
    title: "Gaillands — technical session",
    location: "Chamonix, France",
    daysBack: 7,
    hour: 17,
    distanceKm: 1.2,
    elevationGainM: 180,
    durationSec: 2 * 3600 + 10 * 60,
    startEleM: 1010,
    avgHr: 118,
    maxHr: 152,
    calories: 640,
    conditions: {
      tempC: 19,
      windKph: 6,
      summary: "Dry rock, warm",
      icon: "clear",
      visibilityKm: 20,
    },
    outAndBack: false,
  },
  {
    id: "act-06",
    mode: "hiking",
    title: "Brévent ascent",
    location: "Chamonix, France",
    daysBack: 12,
    hour: 8,
    distanceKm: 15.9,
    elevationGainM: 1490,
    durationSec: 5 * 3600 + 12 * 60,
    startEleM: 1035,
    avgHr: 141,
    maxHr: 172,
    calories: 1780,
    conditions: {
      tempC: 7,
      windKph: 32,
      summary: "Strong wind on the ridge",
      icon: "wind",
      visibilityKm: 40,
    },
    insight: "Best vertical rate of the block. You are ready to add a loaded pack to long ascents.",
  },
  {
    id: "act-07",
    mode: "cycling",
    title: "Col des Montets",
    location: "Argentière, France",
    daysBack: 15,
    hour: 16,
    distanceKm: 34.6,
    elevationGainM: 640,
    durationSec: 96 * 60,
    startEleM: 1000,
    avgHr: 136,
    maxHr: 165,
    calories: 1120,
    conditions: {
      tempC: 14,
      windKph: 18,
      summary: "Overcast, dry",
      icon: "cloud",
      visibilityKm: 25,
    },
    outAndBack: false,
  },
  {
    id: "act-08",
    mode: "mountaineering",
    title: "Mont Buet",
    location: "Vallorcine, France",
    daysBack: 21,
    hour: 5,
    distanceKm: 21.2,
    elevationGainM: 1900,
    durationSec: 9 * 3600 + 5 * 60,
    startEleM: 1350,
    avgHr: 134,
    maxHr: 169,
    calories: 2960,
    conditions: { tempC: 2, windKph: 24, summary: "Cold, stable", icon: "clear", visibilityKm: 60 },
    photo: "/img/community-b.jpg",
  },
];

function build(s: Seed): Activity {
  const track = generateTrack({
    seed: s.id,
    distanceKm: s.distanceKm,
    durationSec: s.durationSec,
    startEleM: s.startEleM,
    gainM: s.elevationGainM,
    outAndBack: s.outAndBack ?? true,
  });

  return {
    id: s.id,
    mode: s.mode,
    title: s.title,
    location: s.location,
    startedAt: daysAgo(s.daysBack, s.hour),
    durationSec: s.durationSec,
    distanceKm: s.distanceKm,
    elevationGainM: s.elevationGainM,
    elevationLossM: Math.round(s.elevationGainM * (s.outAndBack === false ? 0.72 : 1)),
    avgPaceSecPerKm: Math.round(s.durationSec / s.distanceKm),
    avgHr: s.avgHr,
    maxHr: s.maxHr,
    calories: s.calories,
    conditions: s.conditions,
    track,
    splits: deriveSplits(track, s.distanceKm),
    insight: s.insight,
    photo: s.photo,
  };
}

export const ACTIVITIES: Activity[] = SEEDS.map(build).sort(
  (a, b) => +new Date(b.startedAt) - +new Date(a.startedAt),
);

export const activityById = (id: string) => ACTIVITIES.find((a) => a.id === id);
