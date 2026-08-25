import type { NutritionDay, User, WeeklyProgress } from "@/types";
import { daysAgo, isoDate, yearsAgo } from "./clock";

export const USER: User = {
  name: "Alex Morin",
  avatar: "",
  level: 24,
  xp: 12540,
  xpToNext: 14000,
  experience: "experienced",
  disciplines: ["hiking", "mountaineering", "trail-running", "climbing"],
  homeBase: "Chamonix, France",
  memberSince: yearsAgo(3),
  stats: {
    activities: 128,
    distanceKm: 1245,
    elevationM: 78540,
    timeHours: 156,
    summits: 6,
  },
  summits: [
    { mountainId: "mount-olympus", name: "Mount Olympus", elevationM: 2918, date: daysAgo(64) },
    { mountainId: "gran-paradiso", name: "Gran Paradiso", elevationM: 4061, date: daysAgo(9) },
    { mountainId: "toubkal", name: "Toubkal", elevationM: 4167, date: daysAgo(210) },
    { mountainId: "triglav", name: "Triglav", elevationM: 2864, date: daysAgo(400) },
  ],
  achievements: [
    {
      id: "ach-first-4k",
      name: "First 4,000 m",
      detail: "Summited a peak above 4,000 metres",
      earnedAt: daysAgo(210),
      locked: false,
    },
    {
      id: "ach-50k-vert",
      name: "50,000 m Vertical",
      detail: "Cumulative elevation gain",
      earnedAt: daysAgo(120),
      locked: false,
    },
    {
      id: "ach-night-start",
      name: "Alpine Start",
      detail: "Ten activities begun before 05:00",
      earnedAt: daysAgo(30),
      locked: false,
    },
    {
      id: "ach-winter",
      name: "Winter Ascent",
      detail: "A summit between December and March",
      earnedAt: daysAgo(210),
      locked: false,
    },
    {
      id: "ach-100-act",
      name: "One Hundred",
      detail: "100 recorded activities",
      earnedAt: daysAgo(88),
      locked: false,
    },
    {
      id: "ach-5k",
      name: "Five Thousand",
      detail: "Summit a peak above 5,000 metres",
      locked: true,
    },
    {
      id: "ach-mont-blanc",
      name: "Mont Blanc",
      detail: "Summit the highest peak in the Alps",
      locked: true,
    },
    {
      id: "ach-8k",
      name: "Eight Thousand",
      detail: "Summit a peak above 8,000 metres",
      locked: true,
    },
  ],
  privateMember: false,
  onboarded: false,
};

/** Monday-first daily distance for the dashboard sparkline and bars. */
export const WEEKLY_PROGRESS: WeeklyProgress = {
  distanceKm: 32.4,
  activities: 6,
  timeHours: 8.75,
  elevationM: 2460,
  daily: [4.2, 11.6, 0, 6.8, 0, 14.2, 5.4],
};

export const NUTRITION_TODAY: NutritionDay = {
  date: isoDate(new Date()),
  calorieTarget: 2800,
  macroTarget: { carbsG: 380, proteinG: 140, fatG: 78 },
  hydrationTargetMl: 3200,
  hydrationMl: 1850,
  insight:
    "Tomorrow's long elevation session raises your carbohydrate need. Prioritising carbohydrate-rich food today will leave you better fuelled at the start.",
  meals: [
    {
      id: "meal-1",
      name: "Breakfast",
      slot: "breakfast",
      calories: 560,
      macros: { carbsG: 78, proteinG: 22, fatG: 16 },
      detail: "Oats, blueberries, walnuts, honey",
      loggedAt: daysAgo(0, 7, 20),
    },
    {
      id: "meal-2",
      name: "Mid-morning",
      slot: "snack",
      calories: 240,
      macros: { carbsG: 34, proteinG: 8, fatG: 8 },
      detail: "Banana and almond butter",
      loggedAt: daysAgo(0, 10, 30),
    },
    {
      id: "meal-3",
      name: "Lunch",
      slot: "lunch",
      calories: 720,
      macros: { carbsG: 88, proteinG: 42, fatG: 20 },
      detail: "Rice, chicken, roasted vegetables, olive oil",
      loggedAt: daysAgo(0, 13, 15),
    },
    {
      id: "meal-4",
      name: "Afternoon",
      slot: "snack",
      calories: 310,
      macros: { carbsG: 46, proteinG: 12, fatG: 9 },
      detail: "Greek yoghurt, granola, dates",
      loggedAt: daysAgo(0, 16, 40),
    },
  ],
};
