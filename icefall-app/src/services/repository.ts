import { ACTIVITIES, activityById } from "@/data/mock/activities";
import { GOALS, activeGoals, goalById, primaryGoal } from "@/data/mock/goals";
import { MOUNTAINS, mountainById } from "@/data/mock/mountains";
import { GEAR_SYSTEMS, PRODUCTS, productById, systemForMountain } from "@/data/mock/gear";
import { TRAINING_PLAN, currentWeek, todaysSession } from "@/data/mock/training";
import { NUTRITION_TODAY, USER, WEEKLY_PROGRESS } from "@/data/mock/athlete";
import { EVENTS, EXPEDITIONS, eventById, expeditionById } from "@/data/mock/social";

/**
 * The single seam between screens and data.
 *
 * Screens import from here and never from `src/data`. Swapping fixtures for a
 * real API means reimplementing this module — every call is already async so
 * no caller changes shape.
 */
export const repository = {
  athlete: {
    get: async () => USER,
    weeklyProgress: async () => WEEKLY_PROGRESS,
  },
  activities: {
    list: async () => ACTIVITIES,
    byId: async (id: string) => activityById(id),
    recent: async (n = 3) => ACTIVITIES.slice(0, n),
  },
  goals: {
    list: async () => GOALS,
    active: async () => activeGoals(),
    byId: async (id: string) => goalById(id),
    primary: async () => primaryGoal(),
  },
  training: {
    plan: async () => TRAINING_PLAN,
    currentWeek: async () => currentWeek(),
    today: async () => todaysSession(),
  },
  nutrition: {
    today: async () => NUTRITION_TODAY,
  },
  mountains: {
    list: async () => MOUNTAINS,
    byId: async (id: string) => mountainById(id),
  },
  gear: {
    products: async () => PRODUCTS,
    productById: async (id: string) => productById(id),
    systems: async () => GEAR_SYSTEMS,
    systemForMountain: async (mountainId: string) => systemForMountain(mountainId),
  },
  events: {
    list: async () => EVENTS,
    byId: async (id: string) => eventById(id),
  },
  expeditions: {
    list: async () => EXPEDITIONS,
    byId: async (id: string) => expeditionById(id),
  },
};

/** Synchronous accessors for render-time reads of static fixtures. */
export const sync = {
  activities: ACTIVITIES,
  activityById,
  goals: GOALS,
  goalById,
  primaryGoal,
  mountains: MOUNTAINS,
  mountainById,
  products: PRODUCTS,
  productById,
  systemForMountain,
  plan: TRAINING_PLAN,
  currentWeek,
  todaysSession,
  nutrition: NUTRITION_TODAY,
  events: EVENTS,
  eventById,
  expeditions: EXPEDITIONS,
  expeditionById,
  weekly: WEEKLY_PROGRESS,
};
