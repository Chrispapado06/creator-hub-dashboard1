/**
 * "READY FOR NO SIGNAL" — the checklist, as arithmetic (plan §7, brief M8).
 *
 * Pure. No react, no storage, no network: everything it needs is handed in, so
 * the whole checklist can be tested without a browser and the screen and the
 * small card cannot disagree about what is green.
 *
 * TWO KINDS OF LINE, AND THE DIFFERENCE MATTERS.
 *
 *   A CHECK is something this phone can actually finish. It is either done or
 *   it has a one-tap fix beside it.
 *
 *   An INFO line is something that can never go green here — no offline map
 *   pack exists to download (§4.6), the browser has no way to be asked to keep
 *   data, a desktop browser has no Home Screen. Drawing those as unticked boxes
 *   would send somebody looking for a fix that does not exist, so they are
 *   stated instead, and they are not counted in "6 of 8".
 *
 * Nothing here invents a figure. Sizes come measured from the trip pack, the
 * storage figure from the browser's own estimate, and where there is no number
 * the line carries a sentence instead.
 */

import type { InstallMode } from "@/lib/install";

import {
  IOS_CLEARING_SENTENCE,
  persistSentence,
  usedSentence,
  availableSentence,
  type StorageStatus,
} from "@/device/storageStatus";
import { MOUNTAIN_PATHS } from "./paths";
import type { TripDay } from "./tripModel";
import {
  NO_OFFLINE_MAP_SAVED,
  OFFLINE_MAP_LICENCE,
  PACK_LABEL,
  packSizeLabel,
  type PackRow,
} from "./tripPack";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

export type ReadyKey =
  | "trip-data"
  | "map"
  | "contacts"
  | "insurance"
  | "home-screen"
  | "storage"
  | "turnaround"
  | "location";

export type ReadyState =
  /** Done. */
  | "ready"
  /** Not done, and doable here. */
  | "todo"
  /** Cannot go green on this platform. Stated, never ticked. */
  | "info";

/** What the one-tap fix does. The screen owns the doing; this names it. */
export type ReadyAction = "download" | "persist" | "install" | "install-steps" | "location";

export type ReadyFix =
  | { kind: "link"; label: string; to: string }
  | { kind: "action"; label: string; action: ReadyAction };

export interface ReadyItem {
  key: ReadyKey;
  title: string;
  state: ReadyState;
  /** The line under the title. Always present — a bare unticked row explains nothing. */
  detail: string;
  /** Right-hand text: a size, a count, a time. Null where there is no honest figure. */
  value: string | null;
  fix: ReadyFix | null;
}

export interface ReadyInput {
  /** Null when no trip is open: the trip lines then say so instead of going red. */
  trip: { id: string; name: string } | null;
  pack: {
    rows: PackRow[];
    loading: boolean;
    /** False when this phone has no database — nothing can be saved at all. */
    storageOk: boolean;
    storageSentence: string | null;
  };
  /** True when a real offline map source is registered (plan §4). Today: false. */
  offlineMapSource: boolean;
  emergency: { contacts: number; insurance: boolean } | null;
  turnaround: { set: boolean; label: string | null };
  storage: StorageStatus;
  install: InstallMode;
  /** The browser's own answer. "unknown" means it will not say. */
  location: "granted" | "denied" | "prompt" | "unknown";
}

/* -------------------------------------------------------------------------- */
/* Fixed copy                                                                  */
/* -------------------------------------------------------------------------- */

export const NO_TRIP_SENTENCE = "No trip is open, so there is nothing to download yet.";

export const TRIP_DATA_READY = "Everything ICEFALL holds for this trip is on the phone.";

export const HOME_SCREEN_DESKTOP =
  "This browser has no Home Screen. Open ICEFALL on the phone you are taking, and add it there.";

export const LOCATION_DENIED =
  "Location is turned off for ICEFALL. Only the phone's own settings can turn it back on — in Safari, Settings ▸ Apps ▸ Safari ▸ Location.";

export const LOCATION_UNKNOWN =
  "This browser will not say whether location is allowed. Tap Check: if the map finds you, it is.";

export const KEPT_ON_THIS_PHONE_LINE =
  "Your trip, notes and check-ins are kept on this phone. They are not on a server, so nothing here needs a signal to read.";

/* -------------------------------------------------------------------------- */
/* The lines                                                                   */
/* -------------------------------------------------------------------------- */

const SOS = MOUNTAIN_PATHS.sos;
const TURNAROUND = `${MOUNTAIN_PATHS.now}/turnaround`;

function tripData(input: ReadyInput): ReadyItem {
  const base = { key: "trip-data" as const, title: "Trip saved on this phone" };

  if (!input.trip) return { ...base, state: "info", detail: NO_TRIP_SENTENCE, value: null, fix: null };

  if (!input.pack.storageOk) {
    return {
      ...base,
      state: "info",
      detail: input.pack.storageSentence ?? "This phone cannot save anything for offline use.",
      value: null,
      fix: null,
    };
  }

  const rows = input.pack.rows.filter((r) => r.kind !== "map");
  const saved = rows.filter((r) => r.status === "saved");
  const missing = rows.filter((r) => r.status === "missing");
  const bytes = saved.reduce((n, r) => n + (r.sizeBytes ?? 0), 0);
  const download: ReadyFix = { kind: "action", label: "Download", action: "download" };

  if (saved.length === 0) {
    return {
      ...base,
      state: "todo",
      detail: input.pack.loading ? "Checking what is saved…" : "Nothing is saved for this trip yet.",
      value: null,
      fix: input.pack.loading ? null : download,
    };
  }

  if (missing.length > 0) {
    const names = missing.map((r) => PACK_LABEL[r.kind] ?? r.label).join(", ");
    return {
      ...base,
      state: "todo",
      detail: `Not saved yet: ${names}.`,
      value: packSizeLabel(bytes),
      fix: download,
    };
  }

  return { ...base, state: "ready", detail: TRIP_DATA_READY, value: packSizeLabel(bytes), fix: null };
}

function map(input: ReadyInput): ReadyItem {
  const base = { key: "map" as const, title: "Map for offline use" };

  // Nothing can download an area today, so this is a statement, not a box to
  // tick. The licence position is the reason and it is shown with it.
  if (!input.offlineMapSource) {
    return {
      ...base,
      state: "info",
      detail: `${NO_OFFLINE_MAP_SAVED} ${OFFLINE_MAP_LICENCE}`,
      value: null,
      fix: null,
    };
  }

  const row = input.pack.rows.find((r) => r.kind === "map");
  if (row?.status === "saved") {
    return {
      ...base,
      state: "ready",
      detail: row.age?.text ? `${row.age.text}.` : "Saved on this phone.",
      value: row.sizeBytes === null ? null : packSizeLabel(row.sizeBytes),
      fix: null,
    };
  }
  return {
    ...base,
    state: "todo",
    detail: row?.sentence ?? "The map area for this trip is not saved yet.",
    value: null,
    fix: { kind: "action", label: "Download", action: "download" },
  };
}

function contacts(input: ReadyInput): ReadyItem {
  const base = { key: "contacts" as const, title: "Emergency contacts" };
  const n = input.emergency?.contacts ?? 0;
  if (n > 0) {
    return {
      ...base,
      state: "ready",
      detail: "On the SOS screen, with no signal needed.",
      value: `${n} saved`,
      fix: null,
    };
  }
  return {
    ...base,
    state: "todo",
    detail: "Nobody to call is saved. Add the people who should hear first.",
    value: null,
    fix: { kind: "link", label: "Add", to: SOS },
  };
}

function insurance(input: ReadyInput): ReadyItem {
  const base = { key: "insurance" as const, title: "Insurance" };
  if (input.emergency?.insurance) {
    return {
      ...base,
      state: "ready",
      detail: "Your insurer and policy number are on the SOS screen.",
      value: "Saved",
      fix: null,
    };
  }
  return {
    ...base,
    state: "todo",
    detail: "A rescue call asks for your policy number. Save it where you can read it with no signal.",
    value: null,
    fix: { kind: "link", label: "Add", to: SOS },
  };
}

function homeScreen(input: ReadyInput): ReadyItem {
  const base = { key: "home-screen" as const, title: "ICEFALL on your Home Screen" };
  if (input.install === "installed" || input.storage.standalone) {
    return { ...base, state: "ready", detail: "ICEFALL opens like any other app.", value: "Added", fix: null };
  }
  if (input.install === "prompt") {
    return {
      ...base,
      state: "todo",
      detail: "Added to the Home Screen, ICEFALL opens without the browser and its saved data is treated better.",
      value: null,
      fix: { kind: "action", label: "Add", action: "install" },
    };
  }
  if (input.install === "manual-ios") {
    return {
      ...base,
      state: "todo",
      detail: "Safari can clear a website's saved data after a period of not using it. Home Screen apps are treated better.",
      value: null,
      fix: { kind: "action", label: "How", action: "install-steps" },
    };
  }
  return { ...base, state: "info", detail: HOME_SCREEN_DESKTOP, value: null, fix: null };
}

function storageLine(input: ReadyInput): ReadyItem {
  const base = { key: "storage" as const, title: "Saved data kept" };
  const s = input.storage;
  const figures = [usedSentence(s), availableSentence(s)].filter(Boolean).join(" ");

  if (s.persisted === "granted") {
    return {
      ...base,
      state: "ready",
      detail: [persistSentence("granted"), figures].filter(Boolean).join(" "),
      value: "Kept",
      fix: null,
    };
  }
  // No way to ask on this browser: it can never go green, so it is not a check.
  if (s.persisted === "unsupported") {
    return {
      ...base,
      state: "info",
      detail: [persistSentence("unsupported"), IOS_CLEARING_SENTENCE, figures].filter(Boolean).join(" "),
      value: null,
      fix: null,
    };
  }
  return {
    ...base,
    state: "todo",
    detail: [persistSentence(s.persisted), s.standalone ? "" : IOS_CLEARING_SENTENCE, figures]
      .filter(Boolean)
      .join(" "),
    value: null,
    fix: { kind: "action", label: "Ask", action: "persist" },
  };
}

function turnaround(input: ReadyInput): ReadyItem {
  const base = { key: "turnaround" as const, title: "Turnaround time" };
  if (!input.trip) {
    return { ...base, state: "info", detail: "Set on the day, once a trip is open.", value: null, fix: null };
  }
  if (input.turnaround.set) {
    return {
      ...base,
      state: "ready",
      detail: "The alarm sounds on this phone with no signal.",
      value: input.turnaround.label,
      fix: null,
    };
  }
  return {
    ...base,
    state: "todo",
    detail: "The hour you turn back whatever happens. It can be changed on the mountain.",
    value: null,
    fix: { kind: "link", label: "Set", to: TURNAROUND },
  };
}

function location(input: ReadyInput): ReadyItem {
  const base = { key: "location" as const, title: "Location" };
  if (input.location === "granted") {
    return {
      ...base,
      state: "ready",
      detail: "Your position, your breadcrumbs and the way back work with no signal.",
      value: "Allowed",
      fix: null,
    };
  }
  if (input.location === "denied") {
    // No button can undo this — only the phone's own settings can.
    return { ...base, state: "todo", detail: LOCATION_DENIED, value: null, fix: null };
  }
  return {
    ...base,
    state: "todo",
    detail:
      input.location === "unknown"
        ? LOCATION_UNKNOWN
        : "Without it there is no dot on the map and no way back along your own track.",
    value: null,
    fix: { kind: "action", label: input.location === "unknown" ? "Check" : "Allow", action: "location" },
  };
}

/** Every line, in the order they are shown. */
export function readyItems(input: ReadyInput): ReadyItem[] {
  return [
    tripData(input),
    map(input),
    contacts(input),
    insurance(input),
    homeScreen(input),
    storageLine(input),
    turnaround(input),
    location(input),
  ];
}

/* -------------------------------------------------------------------------- */
/* The summary                                                                 */
/* -------------------------------------------------------------------------- */

export interface ReadySummary {
  done: number;
  /** Checks only. Info lines are not counted, because they cannot be finished. */
  total: number;
  todo: number;
  allReady: boolean;
  /** "6 of 7 done" / "Ready for no signal". */
  headline: string;
}

export function readySummary(items: ReadyItem[]): ReadySummary {
  const checks = items.filter((i) => i.state !== "info");
  const done = checks.filter((i) => i.state === "ready").length;
  const total = checks.length;
  const todo = total - done;
  return {
    done,
    total,
    todo,
    allReady: total > 0 && todo === 0,
    headline: total === 0 ? "Nothing to check yet" : todo === 0 ? "Ready for no signal" : `${done} of ${total} done`,
  };
}

/* -------------------------------------------------------------------------- */
/* When the small card shows                                                   */
/* -------------------------------------------------------------------------- */

/** Days before the start date the card appears. A week is enough to fix everything on it. */
export const CARD_LEAD_DAYS = 7;

/**
 * Whether the card belongs on the screen. It is for the days before a trip and
 * the trip itself; there is nothing to prepare for a trip that has ended, and
 * a checklist showing all year is furniture.
 */
export function shouldShowCard(day: TripDay | null, summary: ReadySummary): boolean {
  if (!day) return false;
  if (summary.allReady) return false;
  if (day.kind === "before") return day.daysToGo <= CARD_LEAD_DAYS;
  return day.kind === "during";
}
