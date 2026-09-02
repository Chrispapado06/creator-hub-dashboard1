import { useCallback, useEffect, useState } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";

/**
 * A GROUP AS A PLACE — its privacy, its roster and its conversation.
 *
 * The owner, 2026-09-02:
 *   "in a group once they join they can see details people in etc chat send
 *    images and stuff. If you create a group you have option to be public or
 *    private accept"
 *
 * ── WHAT THIS MODULE IS BUILT AGAINST ────────────────────────────────────────
 *
 * `20260902220000_group_privacy_and_chat.sql`, on top of the groups shipped in
 * `20260902100000_social_likes_groups.sql`. FOUR RULES, ALL ENFORCED IN THE
 * DATABASE, which means nothing here can break them by accident and nothing
 * here may try to work around them:
 *
 *   1. PUBLIC = JOIN, PRIVATE = REQUEST. `group_members_insert` lets you seat
 *      YOURSELF in a public group outright; in a private one only if you hold a
 *      request whose `accepted_at` is set. A "Join" on a private group can only
 *      fail, so `join` and `requestJoin` below are two different calls against
 *      two different tables and a screen picks by `GroupSpace.visibility`.
 *
 *   2. THE ROSTER IS MEMBERS-ONLY. `group_members_select` is
 *      `profile_id = auth.uid() or is_group_member(group_id)`. A stranger
 *      cannot enumerate who is going up a mountain and when.
 *
 *   3. THE CONVERSATION IS MEMBERS-ONLY, and `group_messages` has NO UPDATE
 *      POLICY and no UPDATE grant — the same posture as `posts` and
 *      `channel_messages`. What was said is stood behind or deleted, never
 *      quietly rewritten under the replies. THERE IS NO EDIT FUNCTION BELOW AND
 *      THERE MUST NEVER BE ONE; a screen that offers editing is offering
 *      something the database will refuse.
 *
 *   4. THE GROUP ROW STAYS READABLE to anyone signed in, private included.
 *      Private means closed MEMBERSHIP, not secret existence — otherwise a
 *      private group is one nobody can ever ask to join. Name, mountain and
 *      member count are open; the roster and the messages are separate tables
 *      with their own gates.
 *
 * ── RLS FILTERS, IT DOES NOT ERROR, AND THAT IS THE TRAP ─────────────────────
 *
 * A non-member reading `group_members` or `group_messages` does not get a
 * refusal. They get `[]`, with no error at all — row-level security removes
 * rows, it does not fail requests. So a roster hook that simply rendered what
 * came back would tell a stranger "nobody is in this group" and tell them
 * "nothing has been said here", both of which are false and both of which are
 * exactly the invented fact the honesty doctrine exists to prevent.
 *
 * Every members-only read below therefore establishes membership FIRST, off
 * `joined_by_me` (a SECURITY DEFINER computed field on `groups`, so it answers
 * truthfully for a non-member), and returns the status `members-only` — a
 * designed refusal the screen draws as a locked door — rather than an empty
 * list. `ready` with an empty array means one thing only: you are inside, and
 * there is genuinely nothing there yet.
 *
 * ── THREE ABSENCES, AND ONLY ONE OF THEM IS SOMETHING THE APP KNOWS ──────────
 *
 * The shape `highlights.ts` and `channels/store.ts` both settled on today:
 *
 *   no-backend        this build never constructed a client, so nothing was
 *                     asked. Nothing is missing — nothing was requested.
 *   not-provisioned   the server answered and has no such table, column or
 *                     grant. TODAY THIS IS THE NORMAL ANSWER: 20260902220000 is
 *                     written and tested and NOT PUSHED, so `groups.visibility`
 *                     does not exist and the first select fails with 42703.
 *                     Nothing here pretends otherwise, and nothing here mirrors
 *                     a group locally to cover it.
 *   unreachable       a request was made and did not come back.
 *
 * None of the three is "the group is empty", and none of them is softened into
 * it anywhere below.
 *
 * ── NOTHING IS MIRRORED AND NOTHING IS QUEUED ────────────────────────────────
 *
 * A message that could not be written does not exist, and the person is told
 * so. There is no outbox, no optimistic row and no local copy of a roster: a
 * group is other people, and a group drawn from this device's memory is a group
 * of people who may not be in it.
 */

/**
 * The typed client does not know about `groups`, `group_members`,
 * `group_join_requests` or `group_messages` — `backend/types.ts` predates all
 * of those migrations and belongs to another session. Rather than edit a file
 * this module does not own, every call goes through an untyped view of the same
 * client, and each shape below was checked by hand against
 * `20260902100000_social_likes_groups.sql` and
 * `20260902220000_group_privacy_and_chat.sql`. The same escape hatch, for the
 * same reason, as `network/interest.ts`, `social/highlights.ts` and
 * `channels/store.ts`.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/* -------------------------------------------------------------------------- */
/* Limits — every one of them is a database rule, repeated, not invented       */
/* -------------------------------------------------------------------------- */

/** `groups.name check (length(trim(name)) between 1 and 80)`. */
export const MAX_GROUP_NAME = 80;

/** `group_messages.body check (length(trim(body)) between 1 and 4000)`. */
export const MAX_MESSAGE_BODY = 4000;

/**
 * `storage.buckets.file_size_limit` for `group-media`, to the byte.
 *
 * Checked here as well as there so a climber on a slow connection is told
 * before 40MB goes up the wire, not after.
 */
export const MAX_IMAGE_BYTES = 26_214_400;

/**
 * `destinations.id check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`.
 *
 * Checked locally so a malformed slug is a sentence rather than a foreign-key
 * violation, and so nothing files a group against a mountain it guessed.
 */
const DESTINATION_ID_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** `groups.intended_on` is a `date`. An ISO calendar day, or nothing. */
const ISO_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * NOT `post-media`, and this is the single most important line in the file.
 *
 * Reads on `post-media` are open to any authenticated user — a hole recorded in
 * `20260902160000`. Putting a private group's photographs there would hand them
 * to anyone signed in to ICEFALL, which is the exact promise this feature
 * exists to keep. `group-media` is private and its read policy is gated on
 * membership.
 *
 * PATH SHAPE IS LOAD-BEARING: `<group_id>/<uploader_uid>/<filename>`. The read
 * policy matches segment [1] against a group you are a member of and the insert
 * policy additionally matches segment [2] against your own uid. Both segments
 * are checked by the database; neither is decoration.
 */
const GROUP_MEDIA_BUCKET = "group-media";

/**
 * How long a signed URL is good for.
 *
 * An hour, matched to how long a chat plausibly stays open on a phone — the
 * same figure `highlights.ts` settled on. Longer buys nothing, because the list
 * is re-read on every mount, and a long signature is a link to a private
 * group's photograph that outlives the session it was made for.
 */
const SIGNED_URL_TTL_SECONDS = 3600;

/* -------------------------------------------------------------------------- */
/* Copy — every sentence a screen may need, in one place                       */
/* -------------------------------------------------------------------------- */

/** No client in this build. The DEMO and offline builds never construct one. */
export const GROUP_SPACE_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so it cannot open this group. Nothing is missing and nobody has been hidden — nothing was asked for.";

/**
 * Reachable only when a session expires under a screen that is already open.
 *
 * An account is required to be in the app at all (AppShell gates on a real
 * session; DEMO builds are exempt and have no client), so this is not a state
 * anybody browses into — it is the moment a token stops working mid-read, and
 * it says that rather than inviting a sign-in that has already happened.
 */
export const GROUP_SPACE_SIGNED_OUT =
  "Your ICEFALL session ended while this was open, so the group could not be read. Nothing here is missing — sign in again and it comes back.";

/** A missing table, column or grant. Never softened into "this group is empty". */
export const GROUP_SPACE_NOT_LIVE =
  "Groups are not live on ICEFALL's server yet. Nothing is shown here rather than a guess — no member has been hidden from you, no message has been lost, and no count has been invented.";

/** A request that was made and did not come back. Also not an empty group. */
export const GROUP_SPACE_UNREACHABLE =
  "ICEFALL could not reach the server, so it cannot open this group. This is a failed request rather than an answer — the group has not gone anywhere.";

/**
 * The server answered and said no, for a reason this module did not anticipate.
 *
 * IT MUST NOT REACH FOR `GROUP_SPACE_NOT_LIVE`. That mistake — reporting a
 * refusal as a deployment that had not happened — is documented in
 * `highlights.ts` as the bug that produced its own equivalent constant. A
 * sentence naming a cause the app has not established is the same lie as an
 * invented number.
 */
export const GROUP_SPACE_REFUSED =
  "ICEFALL's server refused that, so it cannot show this group. This is a refusal rather than an answer — nothing has been deleted.";

/** The id resolved to no row. `groups_select` is open, so this is really absent. */
export const GROUP_NOT_FOUND =
  "ICEFALL's server has no group with that link. It may have been removed by whoever started it.";

/**
 * The designed refusal for the roster. NOT an empty list, and the difference is
 * the whole privacy promise of rule 2.
 */
export const ROSTER_MEMBERS_ONLY =
  "Who is in this group is only visible to the people in it. That is the promise the group makes to them — you will see everyone the moment you are a member.";

/** The same door, on the conversation. */
export const MESSAGES_MEMBERS_ONLY =
  "The conversation is only readable by members. Nothing has been hidden from you specifically and nothing here is empty — ICEFALL simply does not read a group's messages to people outside it.";

/**
 * The same door from the other side — a send the server refused.
 *
 * Separate from `MESSAGES_MEMBERS_ONLY` because that sentence is about reading,
 * and a person who has just typed something needs to be told what happened to
 * the words, not what they may look at.
 */
const SEND_MEMBERS_ONLY =
  "Only members can say anything in this group, so nothing was sent. Your words are still here.";

/**
 * Said on the card of a private group, before anybody taps anything.
 *
 * The database will refuse a straight join, so the button has to read
 * "Request to join" — and a person is owed the reason rather than a control
 * that behaves differently from the one next to it.
 */
export const PRIVATE_MEANS_ASK =
  "This group is private. You can ask to join and whoever started it decides — until they do, you cannot see its members or its messages.";

/** Said on the create form, next to the two choices, before either is picked. */
export const VISIBILITY_EXPLAINED =
  "Public: anyone signed in to ICEFALL can join, and members can see each other and talk. Private: people ask, and you accept or decline. Either way the group's name and mountain are visible to everyone — private closes the membership, not the existence.";

/**
 * Said before a private group's founder accepts anybody.
 *
 * Accepting is not a private act: it puts that person in a roster every other
 * member can read, and gives them the whole conversation from the beginning.
 */
export const ACCEPT_MEANS_VISIBLE =
  "Accepting puts this person in the group. They will see everyone in it, and everything that has been said in it, including messages sent before today.";

/**
 * The gap between the founder saying yes and the person actually being in.
 *
 * `group_members_insert` requires `profile_id = auth.uid()`, so the ONLY device
 * that can seat somebody is their own — a founder physically cannot add them.
 * Acceptance is therefore permission, and the person takes the seat on their
 * next visit. See the `accepted` case on `GroupMembership`.
 */
export const ACCEPTED_NOT_SEATED =
  "You were accepted into this group. Join to take your place — ICEFALL cannot do it from the other person's device.";

const WRITE_SIGNED_OUT =
  "Your ICEFALL session ended, so nothing was changed. Sign in again and try it once more.";

const NAME_EMPTY = "A group needs a name — the mountain, or what the party is calling itself.";

const NAME_TOO_LONG = `A group's name has to fit in ${MAX_GROUP_NAME} characters.`;

const NO_MOUNTAIN =
  "A group in ICEFALL is about a mountain, so it needs one from the catalogue. Pick the peak and the group is filed against it.";

const NOT_A_MOUNTAIN =
  "That destination is a trek, not a peak. A group is about a mountain — the database refuses anything else, so nothing was created.";

const BAD_DATE =
  "That date could not be read, so nothing was created. Leave it out if the party has not fixed one — undecided is a normal state for a group and ICEFALL will not put a guess in its place.";

const EMPTY_MESSAGE =
  "A message needs words or a picture. The server refuses an empty one, so nothing was sent.";

const MESSAGE_TOO_LONG = `A message has to fit in ${MAX_MESSAGE_BODY} characters.`;

const NOT_AN_IMAGE =
  "ICEFALL can only attach pictures to a group message. Nothing was sent and nothing was uploaded.";

const IMAGE_TOO_BIG = `That picture is larger than ${Math.round(MAX_IMAGE_BYTES / 1_048_576)}MB, which is the most the server will hold. Nothing was sent and nothing was uploaded.`;

const UPLOAD_FAILED =
  "That picture could not be stored, so nothing was sent — a message pointing at a photograph that is not there would show as a broken image for ever. Your words are still here; send them on their own, or try the picture again.";

const JOIN_PRIVATE_REFUSED =
  "ICEFALL's server refused that. A private group is asked, not joined — request to join and whoever started it decides.";

const REQUEST_REFUSED =
  "ICEFALL's server refused that ask. A request only applies to a private group; a public one you join outright.";

const ALREADY_ASKED =
  "You have already asked to join this group. Whoever started it has not answered yet, and asking again does not reach them any faster.";

const DECIDE_NOT_YOURS =
  "Nothing was changed. Only the person who started a group answers requests to join it, and ICEFALL's server did not record a decision from you.";

const WRITE_REFUSED =
  "ICEFALL's server refused that, so nothing was changed.";

const WRITE_UNREACHABLE =
  "ICEFALL could not reach the server, so nothing was changed. Nothing was half-saved — try again when you have signal.";

const WRITE_NOT_LIVE =
  "ICEFALL's server does not have groups yet, so nothing was changed and nothing was stored.";

const WRITE_FAILED = "That did not go through, and nothing was changed. Try it again.";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** `groups.visibility check (visibility in ('public', 'private'))`. */
export type GroupVisibility = "public" | "private";

/**
 * Where the reader stands in relation to one group.
 *
 * FIVE VALUES, AND `accepted` IS THE ONE WORTH READING THE COMMENT FOR.
 *
 * There is no trigger that seats an accepted requester, and there cannot be a
 * founder-side one: `group_members_insert` requires `profile_id = auth.uid()`,
 * so the row can only be written by the person joining. Between the founder
 * setting `accepted_at` and that person next opening the group they are neither
 * `pending` (the decision HAS been made) nor `member` (the row is not there).
 * Reporting either would be stating something untrue about a decision somebody
 * actually took, so the state exists and is named.
 *
 * A screen switching on this should treat `accepted` as "you're in — one tap to
 * take your place", calling `join`, which the policy admits precisely because
 * the accepted request exists. Never treat it as `none`.
 */
export type GroupMembership = "member" | "accepted" | "pending" | "declined" | "none";

/**
 * What every hook in this module reports instead of guessing.
 *
 * `members-only` is a DESIGNED REFUSAL, not a failure: the server did its job,
 * and the answer is that this is not the reader's to read. It is separate from
 * `refused` — an unexplained no — because a locked door and a broken lock are
 * different things to say to somebody.
 */
export type GroupSpaceStatus =
  | "loading"
  | "no-backend"
  | "signed-out"
  | "not-provisioned"
  | "unreachable"
  | "refused"
  | "not-found"
  | "members-only"
  | "ready";

/**
 * The mountain a group is about, resolved from `destinations`.
 *
 * NULL WHEN THE EMBED DID NOT COME BACK, and never reconstructed from the slug:
 * "ama-dablam" is not a mountain's name, it is an id that looks like one, and
 * title-casing it is ICEFALL writing a peak's name for it.
 */
export interface GroupMountain {
  id: string;
  name: string;
  range: string | null;
  country: string | null;
  /** `destinations.elevation_m`. Null on a mountain nobody has recorded one for. */
  elevationM: number | null;
}

/** One row of `public.groups`, with what a stranger is allowed to see resolved. */
export interface GroupSpace {
  id: string;
  name: string;
  /** `groups.destination_id` — the catalogue slug, always present. */
  destinationId: string;
  mountain: GroupMountain | null;
  visibility: GroupVisibility;
  /**
   * `groups.intended_on`. NULL means UNDECIDED, which is most groups on the day
   * they are made. The column's own comment says it: render that as undecided,
   * never as a placeholder date and never as "TBC 2027".
   */
  intendedOn: string | null;
  createdAt: string;
  /**
   * `groups.created_by`. NULLABLE, and not by accident — a founder deleting
   * their account must not delete a group other people joined, so the column
   * goes null and the group carries on unowned. An unowned private group has
   * nobody who can accept requests; a screen showing one should say so rather
   * than leaving people asking into a void.
   */
  createdBy: string | null;
  /**
   * The computed `member_count` on the row — SECURITY DEFINER server-side, so
   * it is the true total and not a count filtered by what the reader may see.
   *
   * NULL MEANS IT DID NOT ARRIVE. A screen renders nothing in that case. A `0`
   * here would say a group nobody could count is a group nobody is in, and a
   * group always has at least its founder.
   */
  memberCount: number | null;
  joinedByMe: boolean;
  /** `created_by === me`. The founder is the only person who answers requests. */
  foundedByMe: boolean;
}

/**
 * A person, as `profiles` describes them and no further.
 *
 * `name` is nullable even though `display_name` is NOT NULL in the table,
 * because null here means THE PROFILE ROW DID NOT COME BACK — an embed that was
 * refused, a row that has gone. Nothing fills it with "Someone": labelling a
 * person is writing their name for them, which `interest.ts` refuses for the
 * same reason.
 *
 * WHAT IS DELIBERATELY ABSENT: `identity_verified`. It is a computed field, and
 * a computed field that is not deployed fails the WHOLE select rather than
 * quietly omitting itself — `20260902200000` records that
 * `identity_verified(profiles)` did not resolve on this project at least once.
 * This module already has one hard dependency on a migration that is not pushed
 * (`groups.visibility`); a second, avoidable one would take a group's roster
 * dark for a reason that has nothing to do with groups. Absent reads as "not
 * asked", which is true, and no mark is drawn.
 */
export interface GroupPerson {
  profileId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}

/** One row of `group_members`, with its profile resolved. */
export interface GroupMember extends GroupPerson {
  joinedAt: string;
  /**
   * `profiles.location_label` — a place they typed ("Chamonix, France"), and
   * deliberately never a coordinate: the identity migration stores a label and
   * a country and no lat/lon at all, so no roster can leak a position.
   */
  location: string | null;
  isFounder: boolean;
}

/**
 * An UNDECIDED row of `group_join_requests`, with its profile resolved.
 *
 * Only the founder ever sees more than their own — `group_join_requests_select`
 * is `profile_id = auth.uid() or is_group_founder(group_id)` — and only the
 * founder can act, so `useGroupRoster` returns these to the founder alone.
 */
export interface GroupJoinRequest extends GroupPerson {
  requestedAt: string;
}

/**
 * A picture on a message, resolved for display.
 *
 * `url` is required and always a SIGNED url: `group-media` is private, so a
 * path is not a URL and no component may build one out of a bucket name.
 */
export interface GroupMessageMedia {
  url: string;
  /** The raw `media_path`, kept so a delete or a re-resolve has the key. */
  path: string;
  /**
   * From `media_meta.kind`. This module only ever WRITES `image`; `video` is
   * read because a future writer may put one there and a renderer handed a kind
   * it half recognises draws the wrong element.
   */
  kind?: "image" | "video";
  mime?: string;
  bytes?: number;
}

/** One row of `public.group_messages`, with its author resolved. */
export interface GroupMessage {
  id: string;
  groupId: string;
  author: GroupPerson;
  /**
   * `group_messages.body` — NULLABLE, because a message may be a picture with
   * no words. `group_message_has_content` guarantees it is not null when there
   * is also no `media_path`, so an empty message cannot exist.
   */
  body: string | null;
  media?: GroupMessageMedia;
  /**
   * The row carried a `media_path` and no signed URL came back for it.
   *
   * THE MESSAGE IS STILL RENDERED. Dropping it would hide something a person
   * really said; showing an `<img>` at an unsigned storage path would draw a
   * broken frame. A screen says "a picture that could not be loaded" and leaves
   * the words, if there are any, exactly as they were sent.
   */
  mediaUnavailable: boolean;
  createdAt: string;
  /** Written by the reader. There is no edit; deletion is the author's own. */
  mine: boolean;
}

/* -------------------------------------------------------------------------- */
/* Reading a refusal                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which honest absence a PostgREST error is.
 *
 * `PGRST205` is "no such table in the schema cache" and `42P01` is the same
 * thing from Postgres. `42501` is a missing grant or an RLS refusal on a write.
 * `42703` and `PGRST204` are A MISSING COLUMN, and they matter more here than
 * anywhere else in the app: `groups.visibility` arrives in a migration that is
 * written and not pushed, so until it is, every read of a group answers 42703
 * and this module has to call that "not live" rather than "refused".
 *
 * A transport failure carries no code and its message mentions `fetch` — the
 * same test `network/interest.ts` and `enquiries/send.ts` make. One is worth
 * retrying and the other never is, so they never share a sentence.
 *
 * The three-way test is repeated rather than imported because the other modules
 * own their copies and this one must not start depending on a private helper in
 * somebody else's file.
 */
function classify(
  error: PostgrestError | null,
): "not-provisioned" | "unreachable" | "refused" {
  if (!error) return "refused";
  const code = error.code ?? "";
  if (code === "PGRST205" || code === "42P01") return "not-provisioned";
  if (code === "42703" || code === "PGRST204") return "not-provisioned";
  /* 42501 is NOT a deployment fact — it is a refusal. Measured 2026-09-02: a
     deployed table with no grant for this role answers 42501, a missing one
     answers PGRST205. Telling somebody whose session expired that the feature
     is not live yet is a false claim about the server. See backend/pgErrors.ts. */
  if (code === "42501") return "refused";
  if ((error.message ?? "").toLowerCase().includes("fetch")) return "unreachable";
  return "refused";
}

/** `classify`'s three answers as the status and the sentence a reader is told. */
function absence(error: PostgrestError): { status: GroupSpaceStatus; message: string } {
  switch (classify(error)) {
    case "unreachable":
      return { status: "unreachable", message: GROUP_SPACE_UNREACHABLE };
    case "not-provisioned":
      return { status: "not-provisioned", message: GROUP_SPACE_NOT_LIVE };
    default:
      return { status: "refused", message: GROUP_SPACE_REFUSED };
  }
}

/**
 * Postgres speaks to operators. Every branch here ends in something a climber
 * can act on — the rule `Composer.tsx` and `support/tickets.ts` both follow.
 */
function writeFailure(error: PostgrestError | null): string {
  if (!error) return WRITE_FAILED;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();

  // `groups_destination_is_a_mountain()` raises this by hand (P0001) when the
  // destination is a trek. Matched on the words the trigger actually uses.
  if (message.includes("is not a mountain")) return NOT_A_MOUNTAIN;
  // `groups_guard()` — the mountain and the origin of a group are facts.
  if (message.includes("about its mountain") || message.includes("is a fact, not a field")) {
    return "A group stays about the mountain it was made for, and who started it does not change. Nothing was altered — make a new group for a different peak.";
  }

  // A duplicate primary key. Every caller that can hit one handles it before
  // reaching here, so this is the sentence for the ones that cannot.
  if (code === "23505") return "That is already recorded, so nothing was changed.";
  if (code === "23514") return "The server refused those values, so nothing was changed.";
  if (code === "23503") {
    return "Something that write referred to is not on ICEFALL's server, so nothing was changed.";
  }
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("schema cache")
  ) {
    return WRITE_NOT_LIVE;
  }
  if (
    code === "42501" ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return WRITE_REFUSED;
  }
  if (message.includes("fetch")) return WRITE_UNREACHABLE;
  return WRITE_FAILED;
}

/* -------------------------------------------------------------------------- */
/* The session gate                                                            */
/* -------------------------------------------------------------------------- */

type Gate =
  | { ok: true; uid: string; client: SupabaseClient }
  | { ok: false; status: GroupSpaceStatus; message: string };

/**
 * Nothing in this module touches the network without going through here.
 *
 * It narrows `untyped` to non-null for the caller, which is why every call
 * below reads `gate.client` rather than the module constant — a `!` on
 * `untyped` at a dozen call sites is a dozen places a later edit can be wrong.
 */
async function gate(): Promise<Gate> {
  if (!supabase || !untyped) {
    return { ok: false, status: "no-backend", message: GROUP_SPACE_NO_BACKEND };
  }
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id ?? null;
  if (!uid) return { ok: false, status: "signed-out", message: GROUP_SPACE_SIGNED_OUT };
  return { ok: true, uid, client: untyped };
}

/* -------------------------------------------------------------------------- */
/* Pictures                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Storage paths to displayable URLs, in ONE request, or none of them.
 *
 * A per-message `createSignedUrl` would be one round trip per picture in a
 * conversation. It also fails soft on purpose: a path that will not sign comes
 * back absent and the message renders as `mediaUnavailable`, because an `<img>`
 * pointed at an unsigned storage path is a broken frame where a sentence would
 * have been fine.
 */
async function signPaths(client: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;

  const { data, error } = await client.storage
    .from(GROUP_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !Array.isArray(data)) return out;

  for (const entry of data) {
    // Each entry carries its OWN error — one unsignable object does not fail
    // the batch, and must not be read as a URL for the others.
    if (!entry || entry.error || typeof entry.path !== "string") continue;
    if (typeof entry.signedUrl === "string" && entry.signedUrl.length > 0) {
      out.set(entry.path, entry.signedUrl);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Row readers — the untyped client hands back `any`, so nothing is trusted    */
/* -------------------------------------------------------------------------- */

/**
 * PostgREST serves a to-one embed as an object, but returns an array wherever
 * it cannot prove the relationship is to-one. Both shapes are read because the
 * difference is decided by the schema cache rather than by this code — the same
 * note `Comments.tsx`, `interest.ts` and `highlights.ts` all carry.
 */
function embedded(raw: unknown): Record<string, unknown> | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** A profile embed to a person, or a person with no name rather than a made-up one. */
function toPerson(profileId: string, profile: Record<string, unknown> | null): GroupPerson {
  return {
    profileId,
    name: profile ? text(profile.display_name) : null,
    username: profile ? text(profile.username) : null,
    avatarUrl: profile ? text(profile.avatar_url) : null,
  };
}

/**
 * `member_count` and `joined_by_me` are functions of the row, so PostgREST
 * serves them like columns. Asking for them BY NAME means a deployment without
 * them fails the request rather than quietly omitting the fields — which is why
 * a missing count below can only ever be a bug, never a silent zero.
 *
 * `destinations(...)` is unambiguous: `groups` reaches that table exactly once,
 * through `destination_id`.
 */
const GROUP_COLUMNS =
  "id, name, destination_id, visibility, intended_on, created_at, created_by, " +
  "member_count, joined_by_me, " +
  "destinations(id, name, range, country, elevation_m)";

function toGroup(row: Record<string, unknown>, uid: string): GroupSpace | null {
  const id = text(row.id);
  const name = text(row.name);
  const destinationId = text(row.destination_id);
  if (!id || !name || !destinationId) return null;

  /*
   * AN UNREADABLE VISIBILITY DROPS THE GROUP, and that is deliberate.
   *
   * Everything a screen does with a group hangs off this one word: a public
   * group offers "Join", a private one offers "Request to join", and the
   * database refuses the wrong call. Defaulting an unknown value either way
   * would put a control in front of somebody that can only fail, and would be
   * ICEFALL asserting a privacy setting it did not read. The column's check
   * constraint means this can only fire if the constraint is gone, so it is a
   * guard rather than a case.
   */
  const visibility =
    row.visibility === "public" || row.visibility === "private" ? row.visibility : null;
  if (!visibility) return null;

  const dest = embedded(row.destinations);
  const destName = dest ? text(dest.name) : null;
  const createdBy = text(row.created_by);

  return {
    id,
    name,
    destinationId,
    // The embed resolves or the mountain is absent. Nothing is reconstructed
    // from the slug — see `GroupMountain`.
    mountain:
      dest && destName
        ? {
            id: text(dest.id) ?? destinationId,
            name: destName,
            range: text(dest.range),
            country: text(dest.country),
            elevationM:
              typeof dest.elevation_m === "number" && Number.isFinite(dest.elevation_m)
                ? dest.elevation_m
                : null,
          }
        : null,
    visibility,
    intendedOn: text(row.intended_on),
    createdAt: text(row.created_at) ?? "",
    createdBy,
    memberCount:
      typeof row.member_count === "number" && Number.isFinite(row.member_count)
        ? row.member_count
        : null,
    joinedByMe: row.joined_by_me === true,
    foundedByMe: createdBy !== null && createdBy === uid,
  };
}

/* -------------------------------------------------------------------------- */
/* Refresh                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A write in one component has to be visible in another.
 *
 * NO POLLING AND NO REALTIME SUBSCRIPTION — the posture `interest.ts` and
 * `highlights.ts` both take. Everything below changes because of something the
 * reader just did, so each list is re-read on mount and after the writes this
 * module makes, and a socket is not held open on a phone that may be on a
 * mountain. The cost is honest and worth naming: SOMEBODY ELSE'S MESSAGE DOES
 * NOT ARRIVE ON ITS OWN. `useGroupMessages` hands back `reload` so a screen can
 * offer that as an act somebody takes, rather than implying a live feed.
 *
 * Two counters rather than one. A sent message must not re-read the roster of
 * every member on every line typed; a join changes everything at once, so it
 * bumps both.
 */
let spaceRevision = 0;
let messageRevision = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

/** Membership changed: the group, the roster and the conversation all move. */
function bumpSpace() {
  spaceRevision += 1;
  messageRevision += 1;
  notify();
}

/** Something was said. Only the conversation moved. */
function bumpMessages() {
  messageRevision += 1;
  notify();
}

function useRevision(scope: "space" | "messages"): number {
  const read = useCallback(
    () => (scope === "space" ? spaceRevision : messageRevision),
    [scope],
  );
  const [value, setValue] = useState(read);

  useEffect(() => {
    const listener = () => setValue(read());
    listeners.add(listener);
    // A write between the render and this effect would otherwise be missed.
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, [read]);

  return value;
}

/* -------------------------------------------------------------------------- */
/* Reading one group                                                           */
/* -------------------------------------------------------------------------- */

export interface GroupState {
  group: GroupSpace | null;
  membership: GroupMembership;
  state: GroupSpaceStatus;
  /** Why, when `state` is not `ready`. Never set alongside a drawn group. */
  message?: string;
  reload(): void;
}

type GroupRead =
  | { status: "ready"; group: GroupSpace; membership: GroupMembership }
  | { status: Exclude<GroupSpaceStatus, "ready">; message: string };

async function readGroup(groupId: string): Promise<GroupRead> {
  const session = await gate();
  if (!session.ok) {
    return {
      status: session.status as Exclude<GroupSpaceStatus, "ready">,
      message: session.message,
    };
  }

  const { data, error } = await session.client
    .from("groups")
    .select(GROUP_COLUMNS)
    .eq("id", groupId)
    // `maybeSingle` rather than `single`: a group that is not there is a state
    // this module reports, not an error it throws. `groups_select` is
    // `using (true)` for any signed-in reader, so no row really does mean no
    // group — a private one would still have come back.
    .maybeSingle();

  if (error) {
    const { status, message } = absence(error);
    return { status: status as Exclude<GroupSpaceStatus, "ready">, message };
  }
  if (!data) return { status: "not-found", message: GROUP_NOT_FOUND };

  const group = toGroup(data as unknown as Record<string, unknown>, session.uid);
  if (!group) return { status: "refused", message: GROUP_SPACE_REFUSED };

  // Already in. `joined_by_me` is SECURITY DEFINER server-side, so it is the
  // real answer and not a count of rows this reader happened to be shown.
  if (group.joinedByMe) return { status: "ready", group, membership: "member" };

  /*
   * A PUBLIC GROUP HAS NO REQUESTS TO READ, and skipping that read is not just
   * a saved round trip. `group_join_requests_insert` requires the group to be
   * private, so a request against a public group cannot exist — asking for one
   * would be asking a question whose only possible answer is "no", and on a
   * server without 20260902220000 it would turn "you have not joined this
   * public group" into "groups are not live".
   */
  if (group.visibility === "public") return { status: "ready", group, membership: "none" };

  const ask = await session.client
    .from("group_join_requests")
    .select("requested_at, accepted_at, declined_at")
    .eq("group_id", groupId)
    .eq("profile_id", session.uid)
    .maybeSingle();

  if (ask.error) {
    const { status, message } = absence(ask.error);
    return { status: status as Exclude<GroupSpaceStatus, "ready">, message };
  }
  if (!ask.data) return { status: "ready", group, membership: "none" };

  const row = ask.data as unknown as Record<string, unknown>;
  /*
   * ACCEPTED, AND NOT YET SEATED. Read the note on `GroupMembership`: nothing
   * seats this person but their own device, so the state is reported rather
   * than smoothed into `member` (untrue — the row is not there) or `pending`
   * (untrue — the founder decided). The screen offers `join`, which the insert
   * policy admits BECAUSE this accepted request exists.
   *
   * `group_request_one_outcome` allows at most one of the two timestamps, so
   * the order of these two tests cannot hide a decision.
   */
  if (text(row.accepted_at)) return { status: "ready", group, membership: "accepted" };
  if (text(row.declined_at)) return { status: "ready", group, membership: "declined" };
  return { status: "ready", group, membership: "pending" };
}

/**
 * One group: what anyone signed in may see of it, and where the reader stands.
 *
 * The group row itself is readable by everybody, private included — rule 4. So
 * a `ready` state with `membership: "none"` is the ordinary case for a stranger
 * looking at a private group's card, and it is NOT a refusal: the name, the
 * mountain and the member count are all real and all theirs to see. The roster
 * and the conversation are separate hooks and refuse separately.
 */
export function useGroup(groupId: string | undefined): GroupState {
  const nonce = useRevision("space");
  const [manual, setManual] = useState(0);
  const [group, setGroup] = useState<GroupSpace | null>(null);
  const [membership, setMembership] = useState<GroupMembership>("none");
  const [state, setState] = useState<GroupSpaceStatus>("loading");
  const [message, setMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    if (!groupId) {
      setGroup(null);
      setMembership("none");
      setState("not-found");
      setMessage(GROUP_NOT_FOUND);
      return;
    }

    setState("loading");
    setMessage(undefined);

    void readGroup(groupId).then((result) => {
      if (!alive) return;
      if (result.status === "ready") {
        setGroup(result.group);
        setMembership(result.membership);
        setState("ready");
        setMessage(undefined);
        return;
      }
      // A failed read draws NO group. A half-group — a name with an unknown
      // privacy setting — is the shape a screen renders a wrong button on.
      setGroup(null);
      setMembership("none");
      setState(result.status);
      setMessage(result.message);
    });

    return () => {
      alive = false;
    };
  }, [groupId, nonce, manual]);

  const reload = useCallback(() => setManual((n) => n + 1), []);
  return { group, membership, state, message, reload };
}

/* -------------------------------------------------------------------------- */
/* The roster                                                                  */
/* -------------------------------------------------------------------------- */

export interface GroupRosterState {
  members: GroupMember[];
  /**
   * Undecided asks to join, and ONLY the founder ever gets any.
   *
   * `group_join_requests_select` shows a requester their own row too, so this
   * is filtered to the founder here rather than left to the policy — otherwise
   * somebody waiting would be shown their own ask as a decision they can make,
   * and `decide` would refuse them.
   */
  requests: GroupJoinRequest[];
  isFounder: boolean;
  /**
   * `requests` is empty because the list did not come back, NOT because nobody
   * is asking. Only ever true for a founder — nobody else is shown the list at
   * all, so nobody else is missing it. A screen must say so rather than draw
   * the same nothing it draws when there genuinely are no asks.
   */
  requestsUnavailable: boolean;
  state: GroupSpaceStatus;
  message?: string;
  reload(): void;
}

/**
 * `profiles(...)` is unambiguous from `group_members`: the two tables are
 * joined once, by `profile_id`. Compare `highlights.ts`, where `posts` reaches
 * `profiles` twice and the constraint has to be named.
 */
const MEMBER_COLUMNS =
  "profile_id, joined_at, profiles(id, display_name, username, avatar_url, location_label)";

/**
 * AND FROM `group_join_requests` IT IS AMBIGUOUS, so the constraint is named.
 *
 * That table reaches `profiles` TWICE — `profile_id` (who asked) and
 * `decided_by` (who answered). PostgREST cannot choose between two foreign keys
 * to the same table and answers a bare `profiles(...)` with PGRST201 rather
 * than rows, which would have taken out the founder's pending list silently:
 * `readRoster` deliberately survives a failed requests read so the members it
 * DID get are still drawn, so the founder would simply never see anybody asking
 * and would have no way to work out why. `!group_join_requests_profile_id_fkey`
 * is the constraint Postgres names for the inline `references` in
 * `20260902220000`, and it picks the asker.
 */
const REQUEST_COLUMNS =
  "profile_id, requested_at, " +
  "profiles!group_join_requests_profile_id_fkey(id, display_name, username, avatar_url)";

type RosterRead =
  | {
      status: "ready";
      members: GroupMember[];
      requests: GroupJoinRequest[];
      isFounder: boolean;
      /**
       * The founder's pending list was asked for and did not come back.
       *
       * `requests` is then empty for a reason that is NOT "nobody is asking",
       * and a founder who is shown nothing would read it as the former. See the
       * note at the read itself.
       */
      requestsUnavailable: boolean;
    }
  | { status: Exclude<GroupSpaceStatus, "ready">; message: string };

async function readRoster(groupId: string): Promise<RosterRead> {
  const session = await gate();
  if (!session.ok) {
    return {
      status: session.status as Exclude<GroupSpaceStatus, "ready">,
      message: session.message,
    };
  }

  /*
   * MEMBERSHIP IS ESTABLISHED BEFORE THE ROSTER IS ASKED FOR, and this is the
   * heart of rule 2 in the client.
   *
   * `group_members_select` FILTERS; it does not refuse. A stranger asking for
   * this roster gets `[]` and no error, and a hook that rendered that would
   * tell them nobody is going up the mountain — a false statement about real
   * people, produced by a security control working exactly as designed.
   *
   * `joined_by_me` is SECURITY DEFINER, so it answers a non-member honestly.
   * `created_by` rides along on the same request, which is what makes the
   * founder's row markable and the requests below fetchable without a third.
   *
   * This select deliberately does NOT ask for `visibility`: a roster does not
   * need it, and asking would take this hook down with the unpushed migration
   * for no reason.
   */
  const head = await session.client
    .from("groups")
    .select("id, created_by, joined_by_me")
    .eq("id", groupId)
    .maybeSingle();

  if (head.error) {
    const { status, message } = absence(head.error);
    return { status: status as Exclude<GroupSpaceStatus, "ready">, message };
  }
  if (!head.data) return { status: "not-found", message: GROUP_NOT_FOUND };

  const headRow = head.data as unknown as Record<string, unknown>;
  const createdBy = text(headRow.created_by);
  const isFounder = createdBy !== null && createdBy === session.uid;

  if (headRow.joined_by_me !== true) {
    return { status: "members-only", message: ROSTER_MEMBERS_ONLY };
  }

  const roster = await session.client
    .from("group_members")
    .select(MEMBER_COLUMNS)
    .eq("group_id", groupId)
    // The order people arrived, which puts the founder first — the trigger
    // seats them in the same transaction the group is created in.
    .order("joined_at", { ascending: true })
    .limit(500);

  if (roster.error) {
    const { status, message } = absence(roster.error);
    return { status: status as Exclude<GroupSpaceStatus, "ready">, message };
  }

  const memberRows = Array.isArray(roster.data)
    ? (roster.data as unknown as Record<string, unknown>[])
    : [];

  const members = memberRows.flatMap<GroupMember>((row) => {
    const profileId = text(row.profile_id);
    if (!profileId) return [];
    const profile = embedded(row.profiles);
    return [
      {
        ...toPerson(profileId, profile),
        joinedAt: text(row.joined_at) ?? "",
        location: profile ? text(profile.location_label) : null,
        isFounder: createdBy !== null && profileId === createdBy,
      },
    ];
  });

  // Only the founder can act on a request, so only the founder is shown any.
  // Nobody else is missing anything, so nothing is flagged as unavailable.
  if (!isFounder) {
    return { status: "ready", members, requests: [], isFounder, requestsUnavailable: false };
  }

  const asked = await session.client
    .from("group_join_requests")
    .select(REQUEST_COLUMNS)
    .eq("group_id", groupId)
    // UNDECIDED ONLY. A decided request is kept on purpose — so a declined
    // person cannot re-ask hourly, and so the founder can see what they decided
    // — but it is not an open question and must not be counted as one.
    .is("accepted_at", null)
    .is("declined_at", null)
    .order("requested_at", { ascending: true })
    .limit(200);

  /*
   * A FAILED REQUEST READ DOES NOT FAIL THE ROSTER, BUT IT IS NOT SILENT EITHER.
   *
   * The members came back and are true; reporting the whole screen as broken
   * because the pending list did not arrive would hide people who really are in
   * the group. But an empty `requests` array on a founder's screen draws NOTHING
   * AT ALL, and nothing is exactly what a group with no pending asks draws — so
   * without this flag a founder whose read failed is shown the "nobody has asked"
   * screen, which is ICEFALL asserting something it does not know about people
   * who may well be waiting on an answer. The flag is what lets the screen say
   * "could not check" instead of implying "nobody asked".
   */
  if (asked.error) {
    return { status: "ready", members, requests: [], isFounder, requestsUnavailable: true };
  }

  const requestRows = Array.isArray(asked.data)
    ? (asked.data as unknown as Record<string, unknown>[])
    : [];

  const requests = requestRows.flatMap<GroupJoinRequest>((row) => {
    const profileId = text(row.profile_id);
    if (!profileId) return [];
    return [
      {
        ...toPerson(profileId, embedded(row.profiles)),
        requestedAt: text(row.requested_at) ?? "",
      },
    ];
  });

  return { status: "ready", members, requests, isFounder, requestsUnavailable: false };
}

/**
 * Who is in a group — and, for the founder, who is asking to be.
 *
 * A NON-MEMBER GETS A DESIGNED REFUSAL, NOT AN EMPTY LIST. `state` comes back
 * `members-only` with `ROSTER_MEMBERS_ONLY`, and `members` is empty because
 * there is nothing to draw, not because nobody is there. A screen must render
 * the sentence, never "0 members".
 */
export function useGroupRoster(groupId: string | undefined): GroupRosterState {
  const nonce = useRevision("space");
  const [manual, setManual] = useState(0);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [requests, setRequests] = useState<GroupJoinRequest[]>([]);
  const [isFounder, setIsFounder] = useState(false);
  const [requestsUnavailable, setRequestsUnavailable] = useState(false);
  const [state, setState] = useState<GroupSpaceStatus>("loading");
  const [message, setMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    if (!groupId) {
      setMembers([]);
      setRequests([]);
      setIsFounder(false);
      setRequestsUnavailable(false);
      setState("not-found");
      setMessage(GROUP_NOT_FOUND);
      return;
    }

    setState("loading");
    setMessage(undefined);

    void readRoster(groupId).then((result) => {
      if (!alive) return;
      if (result.status === "ready") {
        setMembers(result.members);
        setRequests(result.requests);
        setIsFounder(result.isFounder);
        setRequestsUnavailable(result.requestsUnavailable);
        setState("ready");
        setMessage(undefined);
        return;
      }
      setMembers([]);
      setRequests([]);
      setIsFounder(false);
      // Not "unavailable": the roster itself refused or failed, and that has its
      // own sentence. Two explanations for one absence is how a screen ends up
      // saying both.
      setRequestsUnavailable(false);
      setState(result.status);
      setMessage(result.message);
    });

    return () => {
      alive = false;
    };
  }, [groupId, nonce, manual]);

  const reload = useCallback(() => setManual((n) => n + 1), []);
  return { members, requests, isFounder, requestsUnavailable, state, message, reload };
}

/* -------------------------------------------------------------------------- */
/* The conversation                                                            */
/* -------------------------------------------------------------------------- */

export interface GroupMessagesState {
  messages: GroupMessage[];
  state: GroupSpaceStatus;
  message?: string;
  /**
   * Ask again. There is no live feed — see the note on the refresh counters —
   * so a screen offers this as something a person does, and must not dress it
   * up as an inbox that fills itself.
   */
  reload(): void;
}

/**
 * `author:profiles!group_messages_author_id_fkey(...)` NAMES THE CONSTRAINT.
 *
 * `group_messages` reaches `profiles` exactly once today, so a bare embed would
 * resolve — but `highlights.ts` records what happens the day a second path
 * appears: PostgREST refuses the WHOLE select with PGRST201 and the screen
 * reports something about the server that has nothing to do with the fault. The
 * name is the one Postgres gives an inline `references` on `author_id`, so
 * pinning it now costs nothing and cannot become ambiguous later.
 */
const MESSAGE_COLUMNS =
  "id, group_id, author_id, body, media_path, media_meta, created_at, " +
  "author:profiles!group_messages_author_id_fkey(id, display_name, username, avatar_url)";

/**
 * How much of a conversation is read.
 *
 * `group_messages_group_idx` is `(group_id, created_at desc)`, so the newest
 * are the cheap end — the rows are fetched newest-first and reversed here,
 * because a chat is read oldest-to-newest but it is the LAST 200 lines somebody
 * wants, not the first 200 ever said.
 */
const MESSAGE_PAGE = 200;

type MessagesRead =
  | { status: "ready"; messages: GroupMessage[] }
  | { status: Exclude<GroupSpaceStatus, "ready">; message: string };

async function readMessages(groupId: string): Promise<MessagesRead> {
  const session = await gate();
  if (!session.ok) {
    return {
      status: session.status as Exclude<GroupSpaceStatus, "ready">,
      message: session.message,
    };
  }

  // Membership first, for the reason spelled out in `readRoster`:
  // `group_messages_select` filters rather than refuses, so an empty array from
  // a stranger would read as a silent conversation rather than a closed one.
  const head = await session.client
    .from("groups")
    .select("id, joined_by_me")
    .eq("id", groupId)
    .maybeSingle();

  if (head.error) {
    const { status, message } = absence(head.error);
    return { status: status as Exclude<GroupSpaceStatus, "ready">, message };
  }
  if (!head.data) return { status: "not-found", message: GROUP_NOT_FOUND };
  if ((head.data as unknown as Record<string, unknown>).joined_by_me !== true) {
    return { status: "members-only", message: MESSAGES_MEMBERS_ONLY };
  }

  const { data, error } = await session.client
    .from("group_messages")
    .select(MESSAGE_COLUMNS)
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_PAGE);

  if (error) {
    const { status, message } = absence(error);
    return { status: status as Exclude<GroupSpaceStatus, "ready">, message };
  }

  const rows = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];

  const paths = rows
    .map((r) => text(r.media_path))
    .filter((p): p is string => p !== null);
  const signed = await signPaths(session.client, paths);

  const messages = rows.flatMap<GroupMessage>((row) => {
    const id = text(row.id);
    const authorId = text(row.author_id);
    const createdAt = text(row.created_at);
    // A message with no id or no author is a message nobody can be held to and
    // nothing can key on. Dropped rather than drawn under an invented name.
    if (!id || !authorId || !createdAt) return [];

    const mediaPath = text(row.media_path);
    const url = mediaPath ? signed.get(mediaPath) : undefined;

    const meta = (row.media_meta ?? null) as Record<string, unknown> | null;
    const kind = meta && typeof meta.kind === "string" ? meta.kind : null;

    return [
      {
        id,
        groupId: text(row.group_id) ?? groupId,
        author: toPerson(authorId, embedded(row.author)),
        // Carried as it came, including null: a picture with no words is a
        // whole message, and `group_message_has_content` guarantees a row with
        // neither cannot exist.
        body: typeof row.body === "string" ? row.body : null,
        media:
          mediaPath && url
            ? {
                url,
                path: mediaPath,
                kind: kind === "image" || kind === "video" ? kind : undefined,
                mime: meta && typeof meta.mime === "string" ? meta.mime : undefined,
                bytes:
                  meta && typeof meta.bytes === "number" && Number.isFinite(meta.bytes)
                    ? meta.bytes
                    : undefined,
              }
            : undefined,
        mediaUnavailable: mediaPath !== null && !url,
        createdAt,
        mine: authorId === session.uid,
      },
    ];
  });

  // Newest-first off the index, oldest-first on the screen.
  return { status: "ready", messages: messages.reverse() };
}

/**
 * The conversation, oldest first.
 *
 * A NON-MEMBER GETS `members-only`, never an empty thread — same reason as the
 * roster. `ready` with no messages means one thing: you are in the group and
 * nobody has said anything yet.
 */
export function useGroupMessages(groupId: string | undefined): GroupMessagesState {
  const nonce = useRevision("messages");
  const [manual, setManual] = useState(0);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [state, setState] = useState<GroupSpaceStatus>("loading");
  const [message, setMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;

    if (!groupId) {
      setMessages([]);
      setState("not-found");
      setMessage(GROUP_NOT_FOUND);
      return;
    }

    setState("loading");
    setMessage(undefined);

    void readMessages(groupId).then((result) => {
      if (!alive) return;
      if (result.status === "ready") {
        setMessages(result.messages);
        setState("ready");
        setMessage(undefined);
        return;
      }
      setMessages([]);
      setState(result.status);
      setMessage(result.message);
    });

    return () => {
      alive = false;
    };
  }, [groupId, nonce, manual]);

  const reload = useCallback(() => setManual((n) => n + 1), []);
  return { messages, state, message, reload };
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

export interface GroupActions {
  /**
   * Start a group. Returns the new group's id, or null — `error` says why.
   *
   * `visibility` is a REQUIRED argument with no default. The owner asked for
   * the choice ("you have option to be public or private"), and a default here
   * would be this module quietly making it for them.
   */
  create(
    name: string,
    destinationId: string,
    visibility: GroupVisibility,
    intendedOn?: string,
  ): Promise<string | null>;
  /**
   * Seat yourself. Correct for a PUBLIC group, and for a private one you have
   * been accepted into — those are the two cases `group_members_insert` admits.
   * On any other private group it can only fail, so never offer it there.
   */
  join(groupId: string): Promise<boolean>;
  /** Ask. PRIVATE GROUPS ONLY — the insert policy requires it. */
  requestJoin(groupId: string): Promise<boolean>;
  /** Leave. Your own row only, and it does not delete the group. */
  leave(groupId: string): Promise<boolean>;
  /** Answer somebody's ask. Founder only, enforced in the policy. */
  decide(groupId: string, profileId: string, accept: boolean): Promise<boolean>;
  /** Say something, with or without a picture. Members only. */
  send(groupId: string, body?: string, file?: File): Promise<boolean>;
  /** The last failure, in a sentence a climber can act on. Cleared on success. */
  error: string | null;
  busy: boolean;
}

/**
 * Everything that writes.
 *
 * EVERY RETURN VALUE IS WITNESSED. `create` returns the id the server sent back
 * rather than the absence of an error, and `decide` reads its own row back,
 * because a PostgREST update that RLS refuses returns zero rows and NO ERROR —
 * a screen saying "accepted" on the strength of a missing error would be
 * claiming a decision nothing recorded.
 *
 * NOTHING IS MIRRORED LOCALLY AND NOTHING IS QUEUED. A message that could not
 * be written does not exist and the person is told so, rather than shown a line
 * that vanishes on the next load.
 */
export function useGroupActions(): GroupActions {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = useCallback(
    async (
      name: string,
      destinationId: string,
      visibility: GroupVisibility,
      intendedOn?: string,
    ): Promise<string | null> => {
      const trimmedName = name.trim();
      // Checked here as well as in the column, so a bad value costs nothing and
      // the person is told the rule instead of a constraint violation.
      if (trimmedName.length === 0) {
        setError(NAME_EMPTY);
        return null;
      }
      if (trimmedName.length > MAX_GROUP_NAME) {
        setError(NAME_TOO_LONG);
        return null;
      }

      const slug = destinationId.trim();
      if (!DESTINATION_ID_SHAPE.test(slug)) {
        setError(NO_MOUNTAIN);
        return null;
      }

      /*
       * A DATE IS EITHER A REAL CALENDAR DAY OR IT IS ABSENT.
       *
       * `intended_on` is nullable precisely so "we have not decided" can be
       * stored as itself. An unparseable string is refused rather than coerced
       * to today or dropped silently — the first invents a plan, the second
       * loses one somebody typed.
       */
      const day = intendedOn?.trim();
      if (day !== undefined && day.length > 0 && !ISO_DATE_SHAPE.test(day)) {
        setError(BAD_DATE);
        return null;
      }

      const session = await gate();
      if (!session.ok) {
        setError(session.status === "signed-out" ? WRITE_SIGNED_OUT : session.message);
        return null;
      }

      setBusy(true);
      /*
       * THE FOUNDER IS NOT INSERTED HERE, and adding that line is the one
       * change most likely to break this.
       *
       * `groups_creator_joins` is an AFTER INSERT trigger on `groups` that puts
       * `created_by` into `group_members` in the same transaction. A second
       * insert from this side races it for the same primary key and comes back
       * as a duplicate — turning a group that was created perfectly well into a
       * reported failure. `interest.ts` carries the same warning.
       *
       * `created_by` is sent because the INSERT needs a value; `groups_insert`
       * then requires it to equal `auth.uid()`, so a client that sent somebody
       * else's is refused rather than believed.
       */
      const { data, error: failure } = await session.client
        .from("groups")
        .insert({
          destination_id: slug,
          name: trimmedName,
          created_by: session.uid,
          visibility,
          intended_on: day && day.length > 0 ? day : null,
        })
        .select("id")
        .single();
      setBusy(false);

      const id = (data as { id?: unknown } | null)?.id;
      if (failure || typeof id !== "string") {
        setError(writeFailure(failure));
        return null;
      }

      setError(null);
      bumpSpace();
      return id;
    },
    [],
  );

  const join = useCallback(async (groupId: string): Promise<boolean> => {
    const session = await gate();
    if (!session.ok) {
      setError(session.status === "signed-out" ? WRITE_SIGNED_OUT : session.message);
      return false;
    }

    setBusy(true);
    /*
     * `profile_id` is your own uid and can be nothing else — the policy pins
     * it. Passing it explicitly rather than leaving it to a default means the
     * statement says out loud what the rule is, and a future edit that widened
     * it would be visible here rather than only in the migration.
     */
    const { error: failure } = await session.client
      .from("group_members")
      .insert({ group_id: groupId, profile_id: session.uid });
    setBusy(false);

    // Already a member. That is the outcome the tap asked for, not a failure.
    if (failure && failure.code === "23505") {
      setError(null);
      bumpSpace();
      return true;
    }

    if (failure) {
      // The one refusal worth naming exactly: a private group with no accepted
      // request behind it. The policy is the only thing that can produce it, so
      // the sentence points at the door that is actually open.
      setError(failure.code === "42501" ? JOIN_PRIVATE_REFUSED : writeFailure(failure));
      return false;
    }

    setError(null);
    bumpSpace();
    return true;
  }, []);

  const requestJoin = useCallback(async (groupId: string): Promise<boolean> => {
    const session = await gate();
    if (!session.ok) {
      setError(session.status === "signed-out" ? WRITE_SIGNED_OUT : session.message);
      return false;
    }

    setBusy(true);
    /*
     * THE ASK ARRIVES UNDECIDED, AND NOTHING ELSE IS SENT.
     *
     * `group_join_requests_insert` requires `accepted_at`, `declined_at` and
     * `decided_by` to all be null on the way in — without that, a requester
     * could set `accepted_at` themselves and then walk straight through
     * `group_members_insert`, and "private" would be decorative. The columns
     * are omitted here so that no future edit can helpfully "initialise" them.
     */
    const { error: failure } = await session.client
      .from("group_join_requests")
      .insert({ group_id: groupId, profile_id: session.uid });
    setBusy(false);

    if (failure) {
      // The primary key is `(group_id, profile_id)`, so a second ask collides —
      // including one that was already declined, which the migration keeps on
      // purpose so a decline cannot be re-asked hourly.
      if (failure.code === "23505") {
        // The ask exists — an earlier one, still open or already answered. The
        // screen is refreshed so `useGroup` can show WHICH (pending, or
        // declined), because "you already asked" and "they said no" are
        // different things to be told and only the read knows which it is.
        setError(ALREADY_ASKED);
        bumpSpace();
        return false;
      }
      setError(failure.code === "42501" ? REQUEST_REFUSED : writeFailure(failure));
      return false;
    }

    setError(null);
    bumpSpace();
    return true;
  }, []);

  /**
   * Leave.
   *
   * THIS DOES NOT DELETE THE GROUP, including when the founder leaves: other
   * people joined a party about a mountain, and the person who started it
   * walking away must not take it from them. `groups.created_by` still names
   * them, so they still answer requests — a founder who wants the group gone
   * deletes it, which is a different act.
   *
   * IT ALSO DOES NOT WITHDRAW AN ACCEPTED REQUEST, and that is worth knowing:
   * leaving a private group you were accepted into leaves the acceptance
   * standing, so `join` will seat you again without asking. The migration keeps
   * decided requests deliberately, and quietly deleting one here would be this
   * module overruling that.
   */
  const leave = useCallback(async (groupId: string): Promise<boolean> => {
    const session = await gate();
    if (!session.ok) {
      setError(session.status === "signed-out" ? WRITE_SIGNED_OUT : session.message);
      return false;
    }

    setBusy(true);
    // `profile_id` is filtered here as well as in the policy, so a later edit
    // cannot widen this into a delete of somebody else's membership.
    const { error: failure } = await session.client
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("profile_id", session.uid);
    setBusy(false);

    if (failure) {
      setError(writeFailure(failure));
      return false;
    }

    // A delete that matched nothing is not a failure and is not reported as
    // one: the person asked not to be in the group, and they are not in it.
    setError(null);
    bumpSpace();
    return true;
  }, []);

  /**
   * Answer somebody's ask.
   *
   * `decided_by` IS SET EXPLICITLY because the policy's `with check` requires
   * `decided_by = auth.uid()` — there is no default on the column, so an update
   * that omitted it would leave it null and be refused. The founder test is
   * repeated in the check as well as the using clause precisely so a founder
   * cannot hand the decision to somebody else.
   *
   * THE OTHER TIMESTAMP IS CLEARED rather than left alone.
   * `group_request_one_outcome` allows at most one of the two, so setting
   * `accepted_at` on a row that already carries `declined_at` would be a check
   * violation. Nulling the other makes changing your mind a thing that works,
   * which is the behaviour a person expects from a decision they took by hand.
   *
   * The timestamp is this DEVICE's clock, unlike `requested_at`, which the
   * server sets. It is stored because the column takes a value, and a screen
   * should not render it as an authoritative moment.
   */
  const decide = useCallback(
    async (groupId: string, profileId: string, accept: boolean): Promise<boolean> => {
      const session = await gate();
      if (!session.ok) {
        setError(session.status === "signed-out" ? WRITE_SIGNED_OUT : session.message);
        return false;
      }

      const now = new Date().toISOString();
      setBusy(true);
      const { data, error: failure } = await session.client
        .from("group_join_requests")
        .update({
          accepted_at: accept ? now : null,
          declined_at: accept ? null : now,
          decided_by: session.uid,
        })
        .eq("group_id", groupId)
        .eq("profile_id", profileId)
        // WITNESSED, not assumed. An update RLS refuses matches zero rows and
        // returns NO ERROR, so without reading a row back this function would
        // report "accepted" to somebody who is not the founder and nothing
        // whatever would have changed.
        .select("group_id, profile_id, accepted_at, declined_at")
        .maybeSingle();
      setBusy(false);

      if (failure) {
        setError(writeFailure(failure));
        return false;
      }
      if (!data) {
        setError(DECIDE_NOT_YOURS);
        return false;
      }

      setError(null);
      bumpSpace();
      return true;
    },
    [],
  );

  /**
   * Say something in a group, with or without a picture.
   *
   * THE UPLOAD HAPPENS FIRST AND THE MESSAGE ONLY EXISTS IF IT SUCCEEDED. A row
   * pointing at bytes that are not there renders as a broken image for ever and
   * cannot be repaired from the app, because there is no UPDATE on
   * `group_messages` — the message could only be deleted and retyped. So a
   * failed upload sends nothing at all and says so, and a failed INSERT takes
   * the uploaded object back out rather than leaving an orphan in a private
   * bucket nobody can see or account for.
   */
  const send = useCallback(
    async (groupId: string, body?: string, file?: File): Promise<boolean> => {
      const words = body?.trim() ?? "";
      if (words.length === 0 && !file) {
        setError(EMPTY_MESSAGE);
        return false;
      }
      if (words.length > MAX_MESSAGE_BODY) {
        setError(MESSAGE_TOO_LONG);
        return false;
      }

      /*
       * PICTURES ONLY, and refused before anything touches the network.
       *
       * The bucket takes any mime type, so this is a product rule rather than a
       * database one: nothing in this app decodes or plays video, so a 25MB
       * clip would upload perfectly and then render as a broken image. Saying
       * no here costs a sentence; saying nothing costs somebody their upload.
       */
      if (file) {
        if (!file.type.toLowerCase().startsWith("image/")) {
          setError(NOT_AN_IMAGE);
          return false;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setError(IMAGE_TOO_BIG);
          return false;
        }
      }

      const session = await gate();
      if (!session.ok) {
        setError(session.status === "signed-out" ? WRITE_SIGNED_OUT : session.message);
        return false;
      }

      setBusy(true);

      let mediaPath: string | null = null;
      let mediaMeta: Record<string, unknown> | null = null;

      if (file) {
        /*
         * `<group_id>/<uploader_uid>/<filename>` — BOTH LEADING SEGMENTS ARE
         * MATCHED BY POLICY. Segment [1] is the group whose members may read
         * the object; segment [2] must be the uploader's own uid. Neither is
         * cosmetic and neither may be reordered.
         *
         * The person's own filename is NOT used. A random name cannot collide,
         * cannot carry a `/` that quietly adds a path segment, and does not
         * leak what somebody called a file on their phone.
         */
        const ext = extensionFor(file);
        const path = `${groupId}/${session.uid}/${crypto.randomUUID()}${ext}`;

        const upload = await session.client.storage
          .from(GROUP_MEDIA_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });

        if (upload.error) {
          setBusy(false);
          setError(UPLOAD_FAILED);
          return false;
        }

        mediaPath = path;
        // Everything here was MEASURED from the file the person chose. No
        // dimensions and no duration: this module does not decode media, so it
        // does not describe what it has not read.
        mediaMeta = { kind: "image", mime: file.type, bytes: file.size };
      }

      const { data, error: failure } = await session.client
        .from("group_messages")
        .insert({
          group_id: groupId,
          // Pinned by the policy to `auth.uid()`; sent explicitly so the
          // statement says the rule out loud.
          author_id: session.uid,
          // Null, not "", when there are no words — `group_message_has_content`
          // reads null as "this is a picture", and an empty string would pass
          // the has-content check while failing the length check.
          body: words.length > 0 ? words : null,
          media_path: mediaPath,
          media_meta: mediaMeta,
        })
        .select("id")
        .single();

      const id = (data as { id?: unknown } | null)?.id;
      if (failure || typeof id !== "string") {
        // Take the orphan back out. A failure here is not reported — the
        // message did not send either way, and that is what the person needs to
        // know; a second sentence about storage housekeeping would only bury it.
        if (mediaPath) {
          await session.client.storage.from(GROUP_MEDIA_BUCKET).remove([mediaPath]);
        }
        setBusy(false);
        setError(failure?.code === "42501" ? SEND_MEMBERS_ONLY : writeFailure(failure));
        return false;
      }

      setBusy(false);
      setError(null);
      bumpMessages();
      return true;
    },
    [],
  );

  return { create, join, requestJoin, leave, decide, send, error, busy };
}

/**
 * A file extension for the stored object, from the MIME TYPE rather than the
 * name.
 *
 * The name is untrusted text from another device — it can carry a path
 * separator, a second extension, or nothing at all. The browser's own type is
 * what was actually read, and it is the value written into `media_meta.mime`,
 * so deriving both from one source means the two can never disagree. An
 * unrecognised image type keeps no extension at all: storage does not need one,
 * and a guessed `.jpg` on a `.heic` is a small lie that becomes a broken image.
 */
function extensionFor(file: File): string {
  switch (file.type.toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "image/avif":
      return ".avif";
    default:
      return "";
  }
}
