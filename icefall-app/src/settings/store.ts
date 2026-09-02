import { useCallback, useEffect, useState } from "react";
import type { Status } from "@/components/settings/kit";

/**
 * Settings that have nowhere else to live yet.
 *
 * Visibility, verification and the three professional applications all belong
 * on a server the day there is one. Until then they are kept here, on the
 * device, so the controls are real controls — a toggle that forgets is worse
 * than a toggle that is missing, because the athlete believes it took.
 *
 * Nothing in here is ever treated as granted. An application is a record that
 * someone applied; `approved` can only ever be set by a backend, which is why
 * no code path in the app sets it.
 */

export type Visibility = "public" | "connections" | "private";

export const VISIBILITY_OPTIONS: readonly { value: Visibility; label: string; detail: string }[] = [
  { value: "public", label: "Public", detail: "Anyone on ICEFALL can see it." },
  {
    value: "connections",
    label: "Connections only",
    detail: "Only people whose connection you have accepted.",
  },
  { value: "private", label: "Private", detail: "Only you." },
];

/**
 * PH-19c — who a POST is for. A different axis from `Visibility`.
 *
 * The owner asked for "friends or followers or public", which is not the
 * existing `public | connections | private` set: a post always has an author,
 * so "private" is not one of its answers, and "followers" is an audience the
 * other three controls do not have.
 *
 * `followers` IS A FORWARD-LOOKING TIER AND THE UI SAYS SO. `profile/following`
 * stores who YOU follow; nothing stores who follows you, and with no backend
 * there is nobody to be followed by. It is offered because the owner named it
 * and because the preference should be recorded before the audience exists —
 * not because the app can currently resolve it.
 */
export type PostVisibility = "public" | "followers" | "connections";

export const POST_VISIBILITY_OPTIONS: readonly {
  value: PostVisibility;
  label: string;
  detail: string;
}[] = [
  { value: "public", label: "Public", detail: "Anyone on ICEFALL can see it." },
  {
    value: "followers",
    label: "Followers",
    detail: "People who follow you. ICEFALL has no followers yet — nobody can follow anybody until accounts can see each other.",
  },
  {
    value: "connections",
    label: "Friends",
    detail: "Only people whose connection you have accepted.",
  },
];

export type VerificationKind = "identity" | "history" | "professional";

export interface Application {
  status: Status;
  /** ISO instant the application was submitted. */
  submittedAt?: string;
  /** What was filled in, kept so the form can be reopened and edited. */
  fields?: Record<string, string>;
}

export interface SettingsState {
  /* Profile */
  /**
   * A JPEG data URL, 256 px square. Stored here rather than uploaded because
   * there is nowhere to upload it to — see `lib/image.ts` for why it is
   * downscaled first.
   */
  avatar?: string;
  /**
   * A JPEG data URL, 1024×384. The profile banner — stored beside the avatar
   * and for the same reason: there is nowhere to upload it to.
   */
  cover?: string;
  username: string;
  bio: string;
  region: string;
  languages: string;
  interests: string;

  /* Visibility */
  profileVisibility: Visibility;
  passportVisibility: Visibility;
  activityVisibility: Visibility;
  summitVisibility: Visibility;
  /** PH-19c — posts, on their own axis. See `PostVisibility`. */
  postVisibility: PostVisibility;
  onlineStatus: boolean;

  /* Who can reach me */
  discoverable: boolean;
  whoCanConnect: "everyone" | "same-mountain" | "nobody";
  whoCanAddToGroups: "connections" | "nobody";

  /* Age band — never displayed publicly, only used to gate interaction. */
  ageBand: "under-18" | "18-24" | "25-34" | "35-44" | "45-54" | "55-plus" | "unset";

  /* Notifications beyond the four the app already had */
  notifyCommunity: boolean;
  notifyConnections: boolean;
  notifyGroups: boolean;
  notifyBookings: boolean;
  notifyMarketing: boolean;

  /* The athlete's body.
   *
   * Asked at signup, optional, and each one earns its place: WEIGHT is the only
   * input the calorie estimate has — the recorder defaulted to 72 kg for
   * everyone, so every figure the app ever showed was computed for a stranger.
   * HEIGHT and BIRTH YEAR are recorded but deliberately drive nothing yet: an
   * age-derived maximum heart rate is a population average with a ±10–12 bpm
   * spread, and printing it as this athlete's number is the measurement-that-
   * never-happened this app refuses everywhere else. */
  heightCm?: number;
  birthYear?: number;
  /** The intent the activity screen opens on. See coach/sessionIntent.ts. */
  trainingIntent?: string;

  /* Recording — remembered between sessions so the athlete sets them once. */
  /** Carried load in kilograms. Feeds nothing automatic; it is a record. */
  packWeightKg?: number;
  /** The chosen training intent — see `coach/sessionIntent.ts`. */
  sessionGoal?: string;
  autoPause?: boolean;
  /** The discipline the picker should open on next time. */
  defaultActivity?: string;

  /* Applications */
  verification: Record<VerificationKind, Application>;
  sherpa: Application;
  guide: Application;
  company: Application;
}

const EMPTY: Application = { status: "none" };

export const DEFAULT_SETTINGS: SettingsState = {
  username: "",
  bio: "",
  region: "",
  languages: "",
  interests: "",

  profileVisibility: "connections",
  passportVisibility: "connections",
  activityVisibility: "connections",
  summitVisibility: "connections",
  // The narrowest of the three, like every other visibility default here:
  // nobody is opted into an audience they did not choose.
  postVisibility: "connections",
  onlineStatus: false,

  discoverable: false,
  whoCanConnect: "same-mountain",
  whoCanAddToGroups: "connections",

  ageBand: "unset",

  notifyCommunity: true,
  notifyConnections: true,
  notifyGroups: true,
  notifyBookings: true,
  // Off by default and stays off unless the athlete turns it on. Promotional
  // notification is not something to opt someone out of.
  notifyMarketing: false,

  verification: { identity: EMPTY, history: EMPTY, professional: EMPTY },
  sherpa: EMPTY,
  guide: EMPTY,
  company: EMPTY,
};

const KEY = "icefall.settings.v1";

function read(): SettingsState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<SettingsState>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * One subscriber list, so every settings screen sees the same value the moment
 * it changes. Without this, two screens open at once drift apart.
 */
const listeners = new Set<(s: SettingsState) => void>();
let current = read();

function write(next: SettingsState) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode — the controls still work for this session */
  }
  listeners.forEach((l) => l(next));
}

export function useSettings() {
  const [state, setState] = useState(current);

  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  const patch = useCallback((p: Partial<SettingsState>) => write({ ...current, ...p }), []);

  const apply = useCallback(
    (key: "sherpa" | "guide" | "company", fields: Record<string, string>) =>
      write({
        ...current,
        [key]: { status: "pending", submittedAt: new Date().toISOString(), fields },
      }),
    [],
  );

  const applyVerification = useCallback(
    (kind: VerificationKind) =>
      write({
        ...current,
        verification: {
          ...current.verification,
          [kind]: { status: "pending", submittedAt: new Date().toISOString() },
        },
      }),
    [],
  );

  const withdraw = useCallback(
    (key: "sherpa" | "guide" | "company") => write({ ...current, [key]: EMPTY }),
    [],
  );

  return { settings: state, patch, apply, applyVerification, withdraw };
}

/** ICEFALL member id — derived, stable, and not an internal database key. */
export function memberId(name: string): string {
  let h = 2166136261;
  const seed = `${name || "athlete"}|${KEY}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const s = (h >>> 0).toString(36).toUpperCase().padStart(7, "0");
  return `ICE-${s.slice(0, 4)}-${s.slice(4, 8) || "0000"}`;
}
