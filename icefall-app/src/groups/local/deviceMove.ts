/**
 * MOVING A GROUP SAVED ON THIS PHONE UP TO AN ICEFALL ACCOUNT.
 *
 * Structure plan §2, decisions D4, D5, D6 (as amended by owner ruling 2) and D7.
 *
 * ── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
 *
 * A phone group is a plan one person wrote on one device. Nobody else can open
 * it, nobody can join it, and its `memberIds` only ever holds the person whose
 * phone it is. A group on ICEFALL's server is the real thing: other people are
 * in it, there is a roster, a chat and a feed. This module is the one road from
 * the first to the second.
 *
 * ── THE FOUR PROMISES IT KEEPS ───────────────────────────────────────────────
 *
 *  1. NOTHING MOVES WITHOUT A TAP (D4). The create screen told people their
 *     group "exists here and nowhere else". Publishing it on sign-in, however
 *     convenient, would break a promise ICEFALL made in writing.
 *  2. ONLY THE GROUP MOVES (D5). The mountain, the dates, the size, the
 *     standing, the description and the door — and nothing else. The notes, the
 *     sessions, the log and the checklist were written privately, and a future
 *     member is not who they were written for. `MoveFields` below is the WHOLE
 *     payload, and the test reads its keys.
 *  3. NOBODY IS CARRIED ACROSS. `memberIds` are ids on a phone. Seating them on
 *     the server would put people in a group who never asked to be in one, so
 *     they are not sent at all — and `group_members_insert` would refuse them
 *     anyway.
 *  4. A PEAK ICEFALL HAS NEVER HEARD OF DOES NOT STOP THE MOVE (owner ruling 2,
 *     16 Sep 2026). It moves with no catalogue row and its own name as the
 *     topic. What DOES stop it is not knowing: when the catalogue could not be
 *     read we cannot tell whether ICEFALL holds that peak, and filing the group
 *     against nothing would be irreversible — `origin_ref` is unique, so the
 *     second tap returns the first tap's group rather than correcting it.
 *
 * ── WHERE THE PIECES LIVE ────────────────────────────────────────────────────
 *
 * `planDeviceMove` is pure: a phone record, the catalogue as it was read, and
 * the name the person typed go in; either a payload or one sentence comes out.
 * `performMove` does the server half through an injected seam, so the test can
 * drive the failure paths without a database. `moveDeviceGroup` is the seam
 * filled in with the real server, and is what a screen calls.
 *
 * NOTHING HERE WRITES TO SAVED STATE. `movedTo` is written by the caller, only
 * after this module has had the group back from the server AND read it again.
 */
import type { PostgrestError } from "@supabase/supabase-js";

import type { DestinationsRead, GroupAbout, GroupDestination } from "@/groups/mountains";
import type { Expedition, ExperienceLevel } from "@/network/types";
import {
  GROUP_WRITE_SIGNED_OUT,
  groupWriteFailure,
  groupWriteGate,
  sourceForGroup,
  type GroupRead,
} from "@/social/groupSpace";
import { hasMoved } from "./phoneGroups";

/* -------------------------------------------------------------------------- */
/* Limits, taken from the columns rather than guessed at                       */
/* -------------------------------------------------------------------------- */

/** `groups.name` — the same ceiling the create form uses. */
export const MAX_MOVED_NAME = 80;
/** `groups.topic` — a label, not a description. */
export const MAX_MOVED_TOPIC = 80;
/** `groups.description`. Longer text is shown to be trimmed, never truncated. */
export const MAX_MOVED_DESCRIPTION = 1000;
/** `groups.capacity` is `between 2 and 50`. A phone group's is 2–8. */
export const MIN_MOVED_CAPACITY = 2;
export const MAX_MOVED_CAPACITY = 50;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const EXPERIENCES: readonly ExperienceLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
];

/* -------------------------------------------------------------------------- */
/* What goes up                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The WHOLE payload. Every argument `group_import_device` takes, and no other
 * field of the phone record.
 *
 * Read this list as the promise in plain terms: a name, a place or a subject, a
 * door, two dates, a number of places, a standing and a description. There is
 * no members field, no notes field, no messages field and no sessions field,
 * and adding one is the change this module exists to make visible.
 */
export interface MoveFields {
  /** The phone group's own id, kept as `origin_ref` so a repeat tap is safe. */
  originRef: string;
  name: string;
  /** A catalogue id, or null when ICEFALL has no record of this peak. */
  destinationId: string | null;
  /** The peak's name, when there is no catalogue row for it. Otherwise null. */
  topic: string | null;
  /** Only sent where the server cannot derive it — that is, with no destination. */
  about: GroupAbout | null;
  visibility: "public" | "private";
  intendedOn: string | null;
  endsOn: string | null;
  capacity: number | null;
  experience: ExperienceLevel | null;
  description: string | null;
}

/** Why a group cannot be moved right now. Each has exactly one sentence. */
export type MoveBlock =
  | "already-moved"
  | "catalogue-unknown"
  | "name-empty"
  | "name-too-long"
  | "dates-out-of-order"
  | "description-too-long";

export type MovePlan =
  | {
      status: "ready";
      fields: MoveFields;
      /** The catalogue row this group was matched to, when there was one. */
      matched: GroupDestination | null;
    }
  | { status: "blocked"; reason: MoveBlock; message: string };

/* -------------------------------------------------------------------------- */
/* Copy — one sentence each                                                    */
/* -------------------------------------------------------------------------- */

export const MOVE_ALREADY_MOVED = "This group is already on your account.";

export const MOVE_NAME_EMPTY = "A group needs a name before it can move.";

export const MOVE_NAME_TOO_LONG = `A group's name has to fit in ${MAX_MOVED_NAME} characters.`;

export const MOVE_DATES_OUT_OF_ORDER =
  "This group's last day falls before its first, so fix the dates before moving it.";

export const MOVE_DESCRIPTION_TOO_LONG = `What is written about this group is longer than the ${MAX_MOVED_DESCRIPTION} characters a group can carry, so shorten it before moving it.`;

/**
 * Said when the catalogue could not be read — and it names the peak rather than
 * the catalogue, because the person is looking at a group, not at a list.
 */
export function moveCatalogueUnknown(peakName: string): string {
  return `ICEFALL could not check whether it has a record of ${peakName}, so this group waits rather than moving without one.`;
}

/** Said on the row when the peak is genuinely not in ICEFALL's catalogue. */
export function moveNoRecordOfPeak(peakName: string): string {
  return `ICEFALL has no record of ${peakName}, so the group moves with that name as its subject.`;
}

export const MOVE_WHAT_STAYS =
  "Only the group moves; your notes stay on this phone.";

/** The fuller answer, behind the one sentence above. */
export const MOVE_WHAT_STAYS_FULL =
  "The mountain, the dates, the number of places, the standing, the description and whether the group is open or private all move to your account. Your notes, your planned sessions, the messages you wrote to yourself and your checklist ticks stay on this phone, because they were written privately and the people who join later are not who they were written for. Nothing on this phone is deleted by moving, and nobody is carried across: the group starts with you in it, and other people join it themselves.";

export const MOVE_NO_SERVER =
  "This build has no server, so this group stays on this phone.";

export const MOVE_SIGN_IN = "Sign in to ICEFALL to move this group to your account.";

/** Names the account on the confirm row. Phones are shared (plan R4). */
export function movePublishedUnder(accountName: string): string {
  return `This group will be published under ${accountName}.`;
}

/**
 * Said instead of the Move button when ICEFALL cannot read which account is
 * signed in. The move itself would work — the server uses the session — but the
 * confirm row exists to say WHOSE account a group is published under, and on a
 * shared phone that is the whole point of it.
 */
export const MOVE_ACCOUNT_UNKNOWN =
  "ICEFALL could not read which account you are signed in as, so it cannot say who this group would be published under.";

export const MOVE_DONE = "Moved to your account.";

export const MOVE_READ_BACK_FAILED =
  "ICEFALL could not read the group back, so nothing on this phone was changed.";

/* -------------------------------------------------------------------------- */
/* The pure half                                                               */
/* -------------------------------------------------------------------------- */

function trimmed(value: string | null | undefined): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

/** A calendar day, or nothing. Never a guess and never today. */
function day(value: string | null | undefined): string | null {
  const text = trimmed(value);
  return text !== null && ISO_DATE.test(text) ? text : null;
}

/**
 * `sizeMax` → `capacity`, or null.
 *
 * The create form only ever wrote 2–8, so out of range means a record this app
 * did not write. A number outside the column's range would be refused at the
 * last step, and inventing one in range would tell the group a size nobody
 * chose, so the group moves with no size set — which is a thing the column can
 * say ("not decided") rather than a thing it cannot.
 */
export function capacityFor(sizeMax: unknown): number | null {
  if (typeof sizeMax !== "number" || !Number.isInteger(sizeMax)) return null;
  if (sizeMax < MIN_MOVED_CAPACITY || sizeMax > MAX_MOVED_CAPACITY) return null;
  return sizeMax;
}

/**
 * The door. `invite-only` on a phone is an INTENTION with nothing enforcing it;
 * on the server `private` is a real door. Making it public instead would open a
 * group its owner marked closed, so the stricter of the two is the only honest
 * reading.
 */
export function visibilityFor(privacy: Expedition["privacy"]): "public" | "private" {
  return privacy === "invite-only" ? "private" : "public";
}

/**
 * The catalogue row for a peak, by exact name.
 *
 * MOUNTAINS ONLY. A phone group is a party going up a peak, and matching a trek
 * with a similar name would file it against a walk. The comparison is trimmed
 * and case-folded and is otherwise exact: "Mont Blanc du Tacul" is not Mont
 * Blanc, and a fuzzy match here would quietly send a group to the wrong
 * mountain page for ever.
 */
export function matchPeak(
  peakName: string,
  destinations: readonly GroupDestination[],
): GroupDestination | null {
  const needle = peakName.trim().toLowerCase();
  if (needle.length === 0) return null;
  return (
    destinations.find((d) => d.kind === "mountain" && d.name.trim().toLowerCase() === needle) ??
    null
  );
}

/**
 * What would be sent, or the one sentence that stops it.
 *
 * `name` is what the person has in the confirm row's field, which starts as the
 * peak's name and is theirs to change. The catalogue is passed in as it was
 * read, absence and all, because "no record of that peak" and "could not read
 * the catalogue" are different answers and the screen must not merge them.
 */
export function planDeviceMove(
  expedition: Expedition,
  catalogue: DestinationsRead,
  name: string,
): MovePlan {
  if (hasMoved(expedition)) {
    return { status: "blocked", reason: "already-moved", message: MOVE_ALREADY_MOVED };
  }

  if (catalogue.status !== "ready") {
    return {
      status: "blocked",
      reason: "catalogue-unknown",
      message: moveCatalogueUnknown(expedition.peakName),
    };
  }

  const finalName = name.trim();
  if (finalName.length === 0) {
    return { status: "blocked", reason: "name-empty", message: MOVE_NAME_EMPTY };
  }
  if (finalName.length > MAX_MOVED_NAME) {
    return { status: "blocked", reason: "name-too-long", message: MOVE_NAME_TOO_LONG };
  }

  const from = day(expedition.window?.fromIso);
  const to = day(expedition.window?.toIso);
  if (from !== null && to !== null && to < from) {
    return {
      status: "blocked",
      reason: "dates-out-of-order",
      message: MOVE_DATES_OUT_OF_ORDER,
    };
  }

  const description = trimmed(expedition.description);
  if (description !== null && description.length > MAX_MOVED_DESCRIPTION) {
    return {
      status: "blocked",
      reason: "description-too-long",
      message: MOVE_DESCRIPTION_TOO_LONG,
    };
  }

  const matched = matchPeak(expedition.peakName, catalogue.destinations);
  /* No catalogue row: the peak's own name becomes the subject, cut to the
     column's ceiling rather than refused — a name that long is a label somebody
     typed, and the group is still theirs. */
  const topic =
    matched === null ? (trimmed(expedition.peakName)?.slice(0, MAX_MOVED_TOPIC) ?? null) : null;

  const experience = EXPERIENCES.includes(expedition.experience) ? expedition.experience : null;

  return {
    status: "ready",
    matched,
    fields: {
      originRef: expedition.id,
      name: finalName,
      destinationId: matched?.id ?? null,
      topic,
      /* With a destination the server derives `about` from that row and refuses
         a word that disagrees with it, so it is left alone. With none, this is
         still a mountain — one ICEFALL has no record of. */
      about: matched === null ? "mountain" : null,
      visibility: visibilityFor(expedition.privacy),
      intendedOn: from,
      endsOn: to,
      capacity: capacityFor(expedition.sizeMax),
      experience,
      description,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The server half                                                             */
/* -------------------------------------------------------------------------- */

/** What the move needs from a server, so a test can be the server. */
export interface MoveSeam {
  /** `group_import_device`. Returns the group's id, or the failure. */
  call(fields: MoveFields): Promise<{ groupId: string | null; error: PostgrestError | null }>;
  /** Reading the new group back, exactly as any screen would. */
  readBack(groupId: string): Promise<GroupRead>;
}

export type MoveOutcome =
  | { ok: true; groupId: string; accountId: string }
  | { ok: false; message: string };

/**
 * Sends the move and proves it landed.
 *
 * THE SESSION IS THE CALLER'S. `moveDeviceGroup` below gates once and passes
 * the account id in, which is also what lets the test drive every failure path
 * without a database.
 *
 * THE READ-BACK IS NOT CEREMONY. `movedTo` is what makes the old link redirect
 * and takes the row off the tab, so if it were written on the strength of an id
 * alone, a group that was rolled back — or a row RLS will not show its own
 * creator — would leave somebody tapping through to a page that is not there,
 * with no way back to what they wrote. A failure here changes nothing locally
 * and says so; the next tap returns the same group, because the function is
 * idempotent on `(created_by, origin_ref)`.
 */
export async function performMove(
  fields: MoveFields,
  seam: MoveSeam,
  accountId: string,
): Promise<MoveOutcome> {
  const { groupId, error } = await seam.call(fields);
  if (error || typeof groupId !== "string" || groupId.length === 0) {
    return { ok: false, message: groupWriteFailure(error) };
  }

  const back = await seam.readBack(groupId);
  if (back.status !== "ready") {
    return { ok: false, message: MOVE_READ_BACK_FAILED };
  }

  return { ok: true, groupId, accountId };
}

/**
 * The real move: `group_import_device`, then the group read back.
 *
 * The RPC's arguments are named rather than positional, and the names are the
 * ones in `migrations-staged/groups/group_type_and_trip.sql`. Nothing else on
 * the phone record is in this object — that is promise 2, in code.
 */
export async function moveDeviceGroup(fields: MoveFields): Promise<MoveOutcome> {
  const session = await groupWriteGate();
  if (!session.ok) {
    /*
     * The shared sentences are borrowed WHERE THEY FIT AND NOT WHERE THEY DO
     * NOT. A session that ended mid-tap is the same event everywhere, so that
     * sentence is the module's. "No server" is not: the shared one says ICEFALL
     * "cannot open this group", which is about reading, and the person is
     * trying to move one.
     */
    return {
      ok: false,
      message:
        session.status === "signed-out"
          ? GROUP_WRITE_SIGNED_OUT
          : session.status === "no-backend"
            ? MOVE_NO_SERVER
            : session.message,
    };
  }
  const client = session.client;

  return performMove(
    fields,
    {
      async call(f) {
        const { data, error } = await client.rpc("group_import_device", {
          p_origin_ref: f.originRef,
          p_name: f.name,
          p_destination_id: f.destinationId,
          p_topic: f.topic,
          p_about: f.about,
          p_visibility: f.visibility,
          p_intended_on: f.intendedOn,
          p_ends_on: f.endsOn,
          p_capacity: f.capacity,
          p_experience: f.experience,
          p_description: f.description,
        });
        return { groupId: typeof data === "string" ? data : null, error: error ?? null };
      },
      readBack: (groupId) => sourceForGroup(groupId).readGroup(groupId),
    },
    session.uid,
  );
}
