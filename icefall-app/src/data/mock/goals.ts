import type { Goal } from "@/types";
import { daysAgo, monthsAhead } from "./clock";

export const GOALS: Goal[] = [
  {
    id: "goal-mont-blanc",
    name: "Mont Blanc",
    subtitle: "Goûter Route",
    elevationM: 4806,
    mountainId: "mont-blanc",
    trainingStartedAt: daysAgo(11 * 7),
    targetDate: monthsAhead(8),
    preparation: 62,
    status: "active",
    photo: "/img/mont-blanc.jpg",
    gaps: [
      "Altitude exposure above 4,000 m — one rotation completed of three",
      "Crevasse rescue refresher outstanding",
      "Loaded carries at 15 kg not yet started",
    ],
  },
  {
    id: "goal-matterhorn",
    name: "Matterhorn",
    subtitle: "Hörnli Ridge",
    elevationM: 4478,
    mountainId: "matterhorn",
    trainingStartedAt: daysAgo(3 * 7),
    targetDate: monthsAhead(23),
    preparation: 25,
    status: "active",
    photo: "/img/matterhorn.jpg",
    gaps: [
      "Sustained grade III scrambling in mountain boots",
      "Ascent rate of 1,400 m in under 3 hours",
      "Multi-pitch rappel systems",
    ],
  },
  {
    id: "goal-everest",
    name: "Everest",
    subtitle: "South Col — long horizon",
    elevationM: 8849,
    mountainId: "everest",
    targetDate: monthsAhead(58),
    preparation: 10,
    status: "active",
    photo: "/img/everest.jpg",
    gaps: [
      "No 7,000 m summit yet",
      "Expedition-length logistics experience",
      "Documented high-altitude record required by operators",
    ],
  },
  {
    id: "goal-olympus",
    name: "Mount Olympus",
    subtitle: "Mytikas via Kaki Skala",
    elevationM: 2918,
    mountainId: "mount-olympus",
    targetDate: daysAgo(64),
    preparation: 100,
    status: "completed",
    completedAt: daysAgo(64),
    photo: "/img/mount-olympus.jpg",
  },
  {
    id: "goal-toubkal",
    name: "Toubkal",
    subtitle: "Winter ascent",
    elevationM: 4167,
    mountainId: "toubkal",
    targetDate: daysAgo(210),
    preparation: 100,
    status: "completed",
    completedAt: daysAgo(210),
    photo: "/img/toubkal.jpg",
  },
];

export const goalById = (id: string) => GOALS.find((g) => g.id === id);
export const activeGoals = () => GOALS.filter((g) => g.status === "active");
/** The dashboard's NEXT GOAL card — soonest active objective. */
export const primaryGoal = () =>
  activeGoals().sort((a, b) => +new Date(a.targetDate) - +new Date(b.targetDate))[0];
