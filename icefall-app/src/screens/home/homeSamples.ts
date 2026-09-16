/**
 * Sample inputs for the eight Home layouts — DESIGN PREVIEWS ONLY.
 *
 * Reached with `/home?state=<id>` on dev and demo builds, where the screen
 * shows a "Sample state — preview only" chip. The words are shaped exactly as
 * `useHomeModel` would print them, so a preview shows what the real screen
 * says rather than the mockup's sample copy. The condition is written inline
 * so production builds drop the whole object.
 */
import type { HomeStateId } from "@/home/homeState";
import { HOME_PHOTOS, STEPPING_STONES, type HomeModel, type PeakRef } from "./useHomeModel";

const MONT_BLANC: PeakRef = { name: "Mont Blanc", elevationM: 4806, lat: 45.8326, lon: 6.8652, curatedId: "mont-blanc" };
const GRAN_PARADISO: PeakRef = { name: "Gran Paradiso", elevationM: 4061, lat: 45.5178, lon: 7.2669, curatedId: "gran-paradiso" };

const header = (subtitle: string): HomeModel["header"] => ({
  title: "Mont Blanc",
  subtitle,
  to: "/goals",
  peak: MONT_BLANC,
});

const readiness: HomeModel["readiness"] = { word: "Building", tail: "altitude is your gap", to: "/goals" };

/* A week the model can actually draw: Monday–Wednesday done, Thursday and
   Sunday rest, Friday today, Saturday still to come — five planned sessions. */
const week = (todayDone: boolean): HomeModel["week"] => ({
  days: (["M", "T", "W", "T", "F", "S", "S"] as const).map((letter, i) => ({
    letter,
    mark:
      i < 3 ? "done" : i === 3 || i === 6 ? "rest" : i === 4 ? (todayDone ? "done" : "today") : "upcoming",
  })),
  summary: `${todayDone ? 4 : 3} of 5 sessions done`,
});

/* Today (Friday) is the rest day; Thursday's session is done, Saturday's is ahead. */
const restWeek: HomeModel["week"] = {
  days: (["M", "T", "W", "T", "F", "S", "S"] as const).map((letter, i) => ({
    letter,
    mark: i < 4 ? "done" : i === 4 ? "today" : i === 5 ? "upcoming" : "rest",
  })),
  summary: "4 of 5 sessions done",
};

const exploreStone: HomeModel["explore"] = {
  kind: "card",
  label: "One thing to explore",
  item: {
    title: "Gran Paradiso",
    figure: "4,061 m",
    line: STEPPING_STONES["mont-blanc"].line,
    to: "/explore/mountain/gran-paradiso",
    photo: { peak: GRAN_PARADISO },
  },
};

const coach = (quote: string, chevron = false): HomeModel["coach"] => ({ quote, chevron });

const base: HomeModel = {
  state: "default",
  header: null,
  resume: null,
  today: null,
  passport: null,
  readiness: null,
  week: null,
  coach: null,
  explore: null,
};

export const sampleHomeModel: ((id: HomeStateId) => HomeModel) | null =
  import.meta.env.DEV || import.meta.env.VITE_ICEFALL_DEMO === "1"
    ? (id) => {
        switch (id) {
          case "default":
            return {
              ...base,
              state: id,
              header: header("12 July 2027 · 284 days"),
              today: {
                kind: "session",
                title: "Long Mountain Session · 600 m ascent",
                clock: "1h 40m",
                line: "Sustained vertical with a loaded pack",
                note: null,
                to: "/coach",
                start: { to: "/activity/select", label: "Start" },
                photo: { src: HOME_PHOTOS.session },
              },
              readiness,
              week: week(false),
              coach: coach("You're ready for a moderate training day."),
              explore: exploreStone,
            };
          case "done":
            return {
              ...base,
              state: id,
              header: header("12 July 2027 · 284 days"),
              today: { kind: "feel", date: "preview", photo: { src: HOME_PHOTOS.feel } },
              readiness,
              week: week(true),
              coach: coach("You're ready for a moderate training day."),
              explore: exploreStone,
            };
          case "rest":
            return {
              ...base,
              state: id,
              header: header("12 July 2027 · 284 days"),
              today: {
                kind: "rest",
                line: "Full rest. Adaptation happens here.",
                checkedIn: false,
                photo: { src: HOME_PHOTOS.rest },
              },
              readiness,
              week: restWeek,
              coach: coach("Recovery recommended today."),
              explore: exploreStone,
            };
          case "no-objective":
            return {
              ...base,
              state: id,
              today: {
                kind: "session",
                title: "Record a session",
                clock: null,
                line: "Every session you record builds your history",
                note: null,
                to: null,
                start: { to: "/activity/select", label: "Start" },
                photo: { src: HOME_PHOTOS.free },
              },
              readiness: { word: "72% today", tail: null, to: "/coach/readiness" },
              week: {
                days: (["M", "T", "W", "T", "F", "S", "S"] as const).map((letter, i) => ({
                  letter,
                  mark: i < 3 ? (i === 1 ? "missed" : "done") : i === 3 ? "today" : "upcoming",
                })),
                summary: "2 sessions recorded",
              },
              explore: {
                kind: "tiles",
                label: "Explore a starting point",
                items: [
                  {
                    title: "Snowdon",
                    figure: "1,085 m",
                    line: "Wales",
                    to: "/explore",
                    photo: { peak: { name: "Snowdon", elevationM: 1085, lat: 53.0685, lon: -4.0762, wikipedia: "Snowdon" } },
                  },
                  {
                    title: "Ben Nevis",
                    figure: "1,345 m",
                    line: "Scotland",
                    to: "/explore",
                    photo: { peak: { name: "Ben Nevis", elevationM: 1345, lat: 56.7969, lon: -5.0035, wikipedia: "Ben Nevis" } },
                  },
                  {
                    title: "Kilimanjaro",
                    figure: "5,895 m",
                    line: "High-altitude trek",
                    to: "/explore/mountain/kilimanjaro",
                    photo: { peak: { name: "Kilimanjaro", elevationM: 5895, lat: -3.0674, lon: 37.3556, curatedId: "kilimanjaro" } },
                  },
                ],
              },
            };
          case "two-weeks":
            return {
              ...base,
              state: id,
              header: header("12 July 2027 · 14 days"),
              today: {
                kind: "trip-prep",
                photo: { peak: MONT_BLANC },
                rows: [
                  { label: "Gear · 12 of 14 sorted", tone: "partial", to: "/goals" },
                  { label: "Hut booking · booked", tone: "done", to: "/goals" },
                  { label: "Insurance · not added yet", tone: "alert", to: "/goals" },
                ],
                block: "Taper week · 2 sessions",
                to: "/trip",
              },
              readiness,
              week: {
                days: (["M", "T", "W", "T", "F", "S", "S"] as const).map((letter, i) => ({
                  letter,
                  mark: i < 1 ? "done" : i === 1 ? "today" : i === 3 ? "upcoming" : "rest",
                })),
                summary: "1 of 2 sessions done",
              },
              coach: coach("You're ready for a moderate training day.", true),
              explore: {
                kind: "card",
                label: "One thing to explore",
                item: {
                  title: "Packing list",
                  figure: null,
                  line: "What this class of peak actually demands",
                  to: "/goals",
                  photo: { src: HOME_PHOTOS.packing },
                },
              },
            };
          case "on-trip":
            return {
              ...base,
              state: id,
              header: header("Day 2 of 3"),
              today: { kind: "on-trip", title: "Day 2 · Mont Blanc", photo: { src: HOME_PHOTOS.onTrip } },
              readiness,
              week: {
                days: (["M", "T", "W", "T", "F", "S", "S"] as const).map((letter, i) => ({
                  letter,
                  mark: i < 1 ? "done" : i === 1 ? "today" : "upcoming",
                })),
                summary: null,
              },
              explore: {
                kind: "card",
                label: "One thing to explore",
                item: {
                  title: "Mountain coach",
                  figure: null,
                  line: "Turnaround, cold, altitude and fuel",
                  to: "/home?state=on-trip",
                  photo: { src: HOME_PHOTOS.mountainCoach },
                },
              },
            };
          case "just-back":
            return {
              ...base,
              state: id,
              header: header("Back · 14 July 2027"),
              today: {
                kind: "just-back",
                photo: { peak: MONT_BLANC },
                title: "Back from Mont Blanc · 14 July",
                line: "Capture what happened while it is still fresh",
                action: { label: "Add your debrief", to: "/goals" },
              },
              explore: {
                kind: "next",
                label: "A shortlist, not a recommendation",
                caption: "Ordered by height above 4,806 m, the highest point you have recorded. Height says nothing about difficulty.",
                items: [
                  {
                    title: "Kilimanjaro",
                    figure: "5,895 m",
                    line: "High-altitude trek",
                    to: "/explore/mountain/kilimanjaro",
                    photo: { peak: { name: "Kilimanjaro", elevationM: 5895, lat: -3.0674, lon: 37.3556, curatedId: "kilimanjaro" } },
                  },
                  {
                    title: "Denali",
                    figure: "6,190 m",
                    line: "Extreme cold expedition",
                    to: "/explore/mountain/denali",
                    photo: { peak: { name: "Denali", elevationM: 6190, lat: 63.0695, lon: -151.0074, curatedId: "denali" } },
                  },
                ],
              },
            };
          case "new":
            return {
              ...base,
              state: id,
              today: {
                kind: "session",
                title: "Your first session",
                clock: null,
                line: "A small place to begin",
                note: null,
                to: null,
                start: { to: "/activity/select", label: "Start" },
                photo: { src: HOME_PHOTOS.free },
              },
            };
        }
      }
    : null;
