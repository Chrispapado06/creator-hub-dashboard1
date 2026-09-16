import { useCallback, useEffect, useState } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { destinationIdForPeak } from "@/enquiries/send";

/**
 * "Mountains you want to climb" — the shared half of Groups.
 *
 * WHAT AN INTEREST IS, IN THE DATABASE
 *
 * A row in `public.groups` (one mountain, by `destination_id`) plus a row in
 * `public.group_members` naming you. Adding a mountain therefore means exactly
 * what the owner's note asked for: it "creates or joins a group for it", and
 * the group's members ARE the people interested in climbing it together.
 *
 * WHY THIS IS NOT THE `Expedition` IN `@/network/types`
 *
 * `@/network/groups` states the rule that a group IS an `Expedition` and that
 * there must never be a second entity. That rule still holds for the group a
 * person PLANS — the window, the party size, the sessions, the checklist, all
 * of it local to this device. This module is a different thing that happens to
 * share the word: a public, server-side list of who wants a mountain. It has no
 * window, no size and no plan, and it cannot be an `Expedition` because an
 * `Expedition` is local and an interest is only useful when other people can
 * see it. The two are joined at the mountain name and nowhere else.
 *
 * THE TABLES MAY NOT EXIST YET, AND THAT IS A STATE RATHER THAN AN ERROR
 *
 * The migration is written and the owner gates every push, so on any given day
 * `groups` may not be in the schema at all. PostgREST answers a missing table
 * with `PGRST205`/`42P01` and a missing grant with `42501`, and this module
 * turns both into `not-provisioned` — never into an empty list. That
 * distinction is the whole honesty of the feature: "nobody else is interested
 * in Mont Blanc" and "ICEFALL could not ask" would lead a climber to opposite
 * conclusions about whether to keep waiting for a partner, and only one of them
 * is something this app can currently know.
 *
 * NOTHING HERE INVENTS A PERSON, A GROUP OR A COUNT. Every number a screen
 * draws from this module came back from the server on this request. Where a
 * field did not come back, the shape carries `null` and the screen says the
 * count is unavailable rather than printing a zero.
 */

/**
 * The typed client does not know about `groups` or `group_members` —
 * `backend/types.ts` predates this migration and belongs to another session.
 * Rather than edit a file this module does not own, the calls that need the new
 * tables go through an untyped view of the same client, and every shape below
 * was checked by hand against `20260902100000_social_likes_groups.sql`.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Said before anybody adds a mountain, not after.
 *
 * `group_members` is readable by every signed-in user — deliberately, because
 * "who else wants this peak" cannot be built from rows nobody may read. That
 * makes adding a mountain a public act, so the athlete is told it is public
 * while they can still decide not to.
 */
export const INTEREST_VISIBLE_NOTICE =
  "Adding a mountain is public. Anyone signed in to ICEFALL can see that you are interested in it, and you can see who else is. Nothing else about you is shared — no location, no training, no dates you have not set. Remove the mountain and you leave the list.";

/**
 * Shown when the server has no such list — a missing table or a missing grant.
 *
 * It must never be softened into "no groups yet". The list ICEFALL could not
 * read and the list that came back empty are different facts.
 */
export const SHARED_GROUPS_NOT_LIVE =
  "Shared mountains are not live yet. ICEFALL asked the server for the mountains people want to climb and there is no such list on it, so nothing is shown here rather than a guess — nobody has been hidden from you and no count has been invented.";

/** Offline, or the request never came back. Also not an empty list. */
export const SHARED_GROUPS_UNREACHABLE =
  "ICEFALL could not reach the server, so it does not know who else wants these mountains. This is a failed request rather than an answer — the list may not be empty.";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The catalogue row a group is filed against, as little of it as this list needs.
 *
 * READ THROUGH AN OPTIONAL SELECT, so it is null on any server that will not
 * serve the embed, and null is drawn as an absence rather than as "no place".
 * A TREK IS NOT A MOUNTAIN: `kind` is carried so the screen can say which sort
 * of place it is instead of calling a walk a peak.
 */
export interface GroupPlace {
  name: string;
  kind: "mountain" | "trek" | null;
}

export interface MountainGroup {
  id: string;
  /**
   * The place's slug — `mont-blanc`, `everest`. See `destinations`.
   *
   * NULLABLE SINCE `group_type_and_trip.sql`: a group may be about a region, a
   * community of people, or a peak the catalogue has no record of, and then it
   * carries `topic` instead. Such a group is LISTED — dropping it would make a
   * group that exists impossible to find, which is a worse lie than a card with
   * no photograph.
   */
  destinationId: string | null;
  /**
   * The catalogue row itself — its name and which sort of place it is.
   *
   * NULL ALSO MEANS NOT READ, exactly like `topic`: a server that will not
   * serve the embed leaves every one of these null and the list draws the
   * places it cannot name as unnamed. Nothing is ever built from the slug.
   */
  destination: GroupPlace | null;
  /**
   * `groups.topic` — the group's subject in its own words, where it has no
   * catalogue row. NULL ALSO MEANS NOT READ: on a server without that column
   * the second select below is skipped and every group has one of these null.
   * A label, never a place: nothing is linked or drawn from it.
   */
  topic: string | null;
  name: string;
  /** ISO date, or null where the party has not fixed one. Never guessed. */
  intendedOn: string | null;
  createdAt: string;
  /**
   * From the computed `member_count` on the row.
   *
   * NULLABLE ON PURPOSE. A count that did not arrive is unknown, and a screen
   * that renders it as 0 tells the athlete a group is empty when ICEFALL simply
   * does not know how many are in it.
   */
  memberCount: number | null;
  joinedByMe: boolean;
}

export type SharedGroups =
  | { status: "loading" }
  /** No client in this build — the offline build never constructs one. */
  | { status: "no-backend" }
  /** Every policy on these tables is `to authenticated`. Signed out sees none. */
  | { status: "signed-out" }
  /** The table or the grant is not deployed. NOT "nobody is interested". */
  | { status: "not-provisioned" }
  | { status: "unreachable" }
  | { status: "ready"; groups: MountainGroup[] };

export type InterestFailure =
  | "no-backend"
  | "signed-out"
  /** ICEFALL cannot place that peak against a real mountain — see below. */
  | "unknown-mountain"
  | "not-provisioned"
  | "unreachable"
  | "refused";

export type InterestOutcome =
  | {
      ok: true;
      groupId: string;
      /** What actually happened, so the screen can say it rather than guess. */
      how: "created" | "joined" | "already";
    }
  | { ok: false; reason: InterestFailure };

export interface InterestedPerson {
  profileId: string;
  /** Null where the profile row came back without one. Never filled in. */
  name: string | null;
  username: string | null;
  joinedAt: string;
}

export type InterestedPeople =
  | { ok: true; people: InterestedPerson[]; namesReadable: boolean }
  | { ok: false; reason: InterestFailure };

/* -------------------------------------------------------------------------- */
/* Reading a refusal                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Which of the honest absences a PostgREST error is.
 *
 * `PGRST205` is "no such table in the schema cache" and `42P01` is the same
 * thing from Postgres itself: the shared list is not on this server yet, which
 * is not an empty list.
 *
 * `42703` and `PGRST204` are A MISSING COLUMN, and they are here for the same
 * reason `social/groupSpace.ts` has them: a column that arrives in a migration
 * the owner has not applied is a fact about the deployment, not a refusal. This
 * file went a whole slice without them and the optional select below could not
 * retry, which is the one failure that matters — see `selectGroups`.
 *
 * A transport failure carries no code at all and its message mentions `fetch`,
 * the same test `@/enquiries/send` and `social/groupSpace.ts` make. One is
 * worth retrying and the other never is, so they never share a sentence.
 */
function classify(error: PostgrestError | null): "not-provisioned" | "unreachable" | "refused" {
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

/**
 * The errors the OPTIONAL half of the select is allowed to fail with.
 *
 * Narrower than `classify` on purpose. A missing column (`42703`, `PGRST204`)
 * or an embed this server will not resolve (`PGRST200`) means "ask for less";
 * a missing table means ask again for nothing, so it is left to fail once.
 */
function absentOptional(error: PostgrestError): boolean {
  const code = error.code ?? "";
  return code === "42703" || code === "PGRST204" || code === "PGRST200";
}

/**
 * Everything this list needs from a server that has had nothing applied to it.
 *
 * EXACTLY WHAT WAS ASKED FOR BEFORE ANY OF THE GROUPS WORK. It is the fallback,
 * so it must stay a select today's server can answer.
 */
export const GROUP_COLUMNS =
  "id, destination_id, name, intended_on, created_at, member_count, joined_by_me";

/**
 * The same, plus what a group says it is about.
 *
 * ASKED FOR FIRST AND RETRIED WITHOUT (structure plan D13). `topic` arrives in
 * a migration that is written and not applied, and PostgREST fails the WHOLE
 * select on a column that is not there — so a build that shipped first would
 * otherwise report "shared mountains are not live" about a list that plainly
 * is. The embed is asked for here too rather than in the base select for the
 * same reason: this list must never go down over the nice half of a read.
 */
export const GROUP_COLUMNS_WITH_SUBJECT = `${GROUP_COLUMNS}, topic, destinations(name, kind)`;

/** An embedded row, which PostgREST may hand back as an object or an array. */
function embedded(raw: unknown): Record<string, unknown> | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * A PostgREST row, as loosely as it can honestly be described.
 *
 * The untyped client hands back `any`, so every field is re-checked here rather
 * than trusted: an id that is not a string, or a count that is not a number, is
 * dropped instead of coerced. A coerced 0 is exactly the invented figure this
 * feature must never draw.
 */
function toGroup(row: Record<string, unknown>): MountainGroup | null {
  const id = typeof row.id === "string" ? row.id : null;
  const destinationId = typeof row.destination_id === "string" ? row.destination_id : null;
  const name = typeof row.name === "string" ? row.name : null;
  // A group with no destination is a group about something else, not a bad row.
  if (!id || !name) return null;

  /* The place as the catalogue holds it, or nothing. NEVER BUILT FROM THE SLUG:
     "ama-dablam" title-cased is ICEFALL writing a mountain's name for it. */
  const dest = embedded(row.destinations);
  const destName = dest && typeof dest.name === "string" && dest.name.trim().length > 0 ? dest.name : null;

  return {
    id,
    destinationId,
    destination:
      destName === null
        ? null
        : {
            name: destName,
            kind: dest?.kind === "mountain" || dest?.kind === "trek" ? dest.kind : null,
          },
    topic:
      typeof row.topic === "string" && row.topic.trim().length > 0 ? row.topic.trim() : null,
    name,
    intendedOn: typeof row.intended_on === "string" ? row.intended_on : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    memberCount:
      typeof row.member_count === "number" && Number.isFinite(row.member_count)
        ? row.member_count
        : null,
    joinedByMe: row.joined_by_me === true,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

async function currentUid(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** As much of a PostgREST answer as this list reads. */
export interface GroupsAnswer {
  data: unknown;
  error: PostgrestError | null;
}

/** One way of asking for a set of columns. `readGroups` builds it from the client. */
export type GroupsAsk = (columns: string) => PromiseLike<GroupsAnswer>;

/**
 * THE D13 RETRY, with the client held at arm's length so it can be run.
 *
 * The subject first, and the columns today's server has if the subject is not
 * there. Everything this function decides is a sentence somebody reads — "not
 * live" about a list that IS live is the worst of them — so it takes a way of
 * asking rather than a Supabase client, and `groupsDiscover.test.ts` drives it
 * with a server that has the column, one that has not, and one with no table.
 */
export async function selectGroups(ask: GroupsAsk): Promise<SharedGroups> {
  let { data, error } = await ask(GROUP_COLUMNS_WITH_SUBJECT);
  if (error && absentOptional(error)) {
    ({ data, error } = await ask(GROUP_COLUMNS));
  }

  if (error) {
    const reason = classify(error);
    return { status: reason === "unreachable" ? "unreachable" : "not-provisioned" };
  }

  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return { status: "ready", groups: rows.flatMap((r) => toGroup(r) ?? []) };
}

async function readGroups(): Promise<SharedGroups> {
  if (!supabase || !untyped) return { status: "no-backend" };
  const client = untyped;

  const uid = await currentUid();
  if (!uid) return { status: "signed-out" };

  // `member_count` and `joined_by_me` are functions of the row, so PostgREST
  // serves them like columns. Asking for them by name means a deployment
  // without them FAILS the request rather than quietly omitting the fields —
  // which is why a missing count can only ever be a bug, never a silent zero.
  return selectGroups((columns) =>
    client
      .from("groups")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(200),
  );
}

/**
 * The shared list, and a way to ask for it again.
 *
 * NO POLLING AND NO REALTIME SUBSCRIPTION. `group_members` is in the realtime
 * publication, but a live-updating count on a screen nobody is looking at buys
 * nothing and costs a socket on a phone that may be on a mountain. The list is
 * read on mount and after every write this module makes, which is the only time
 * it can change because of something the athlete did.
 *
 * A sign-in that happens on another screen leaves this at `signed-out` until
 * the screen is remounted. That is acceptable because signing in navigates away
 * and back; it is noted here so the next reader knows it is a choice.
 */
export function useSharedGroups(): { state: SharedGroups; reload: () => void } {
  const [state, setState] = useState<SharedGroups>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    void readGroups().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, reload };
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Add a mountain: join the group that already exists for it, or start one.
 *
 * WHICH GROUP "THE GROUP FOR THIS MOUNTAIN" IS. The OLDEST one for that
 * destination, deterministically. Two people adding Mont Blanc on opposite
 * sides of the world have to land in the same list or the feature does not
 * work, and "oldest" is the only ordering that does not depend on who is
 * asking. Where somebody wants a different party for the same peak, that is a
 * group they create on purpose in the create form, not one this button guesses.
 *
 * The mountain must resolve to a real `destinations` row. `destinationIdForPeak`
 * is imported rather than reimplemented: it is the single mapping from a peak
 * NAME to the slug the database takes, and a second copy of that rule would
 * drift and start filing people against the wrong mountain. A peak it cannot
 * place is refused as `unknown-mountain` — never filed against a nearby one.
 */
export async function addMountainInterest(peakName: string): Promise<InterestOutcome> {
  if (!supabase || !untyped) return { ok: false, reason: "no-backend" };

  const destinationId = destinationIdForPeak(peakName);
  if (destinationId === null) return { ok: false, reason: "unknown-mountain" };

  const uid = await currentUid();
  if (!uid) return { ok: false, reason: "signed-out" };

  const existing = await untyped
    .from("groups")
    .select(GROUP_COLUMNS)
    .eq("destination_id", destinationId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (existing.error) return { ok: false, reason: classify(existing.error) };

  const first = Array.isArray(existing.data)
    ? toGroup((existing.data as Record<string, unknown>[])[0] ?? {})
    : null;

  if (first) {
    if (first.joinedByMe) return { ok: true, groupId: first.id, how: "already" };

    const { error } = await untyped
      .from("group_members")
      .insert({ group_id: first.id, profile_id: uid });

    // A double tap during the request is a duplicate primary key, and it means
    // the athlete is in the group — which is the outcome they asked for.
    if (error && error.code !== "23505") return { ok: false, reason: classify(error) };
    return { ok: true, groupId: first.id, how: error ? "already" : "joined" };
  }

  // `name` is constrained to 1–80 characters. The mountain's own name is used
  // rather than a composed phrase, because the name is what the next person
  // scanning the list has to recognise.
  const name = peakName.trim().slice(0, 80);
  if (name.length === 0) return { ok: false, reason: "unknown-mountain" };

  // `.select("id")` is not decoration: the returned id is the only evidence the
  // row exists. Saying "added" on the strength of a missing error would be
  // claiming a write nothing witnessed. An AFTER INSERT trigger puts the
  // creator into `group_members`, so no second insert is needed here — and
  // adding one would race the trigger for the same primary key.
  const created = await untyped
    .from("groups")
    .insert({ destination_id: destinationId, name, created_by: uid })
    .select("id")
    .single();

  if (created.error || !created.data) return { ok: false, reason: classify(created.error) };

  const id = (created.data as Record<string, unknown>).id;
  if (typeof id !== "string") return { ok: false, reason: "refused" };
  return { ok: true, groupId: id, how: "created" };
}

/**
 * Join a list that is already on screen, by its id.
 *
 * SEPARATE FROM `addMountainInterest` ON PURPOSE. That one starts from a peak
 * NAME and has to resolve it to a destination; this one starts from a row the
 * server just handed us, which already knows its mountain. Routing a join
 * through the name would fail for any group whose name is not exactly a
 * catalogue mountain — "Mont Blanc, June" is a perfectly good group name and
 * resolves to nothing — and the athlete would be told ICEFALL could not place a
 * mountain it had just drawn on their screen.
 */
export async function joinMountainGroup(groupId: string): Promise<InterestOutcome> {
  if (!supabase || !untyped) return { ok: false, reason: "no-backend" };

  const uid = await currentUid();
  if (!uid) return { ok: false, reason: "signed-out" };

  const { error } = await untyped
    .from("group_members")
    .insert({ group_id: groupId, profile_id: uid });

  // Already a member. That is the outcome they asked for, not a failure.
  if (error && error.code !== "23505") return { ok: false, reason: classify(error) };
  return { ok: true, groupId, how: error ? "already" : "joined" };
}

/**
 * Leave the list for a mountain.
 *
 * Only ever your own row — the policy allows nothing else, and the filter says
 * so at the call site as well so a future edit cannot widen it by accident.
 * Leaving a group you started does NOT delete it: other people joined a list
 * about a mountain, and the founder walking away must not take it from them.
 */
export async function removeMountainInterest(groupId: string): Promise<InterestOutcome> {
  if (!supabase || !untyped) return { ok: false, reason: "no-backend" };

  const uid = await currentUid();
  if (!uid) return { ok: false, reason: "signed-out" };

  const { error } = await untyped
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("profile_id", uid);

  if (error) return { ok: false, reason: classify(error) };
  // `how` is meaningless on a leave and no caller reads it — the shape is
  // shared so that every write in this module fails in the same vocabulary.
  return { ok: true, groupId, how: "already" };
}

/* -------------------------------------------------------------------------- */
/* Who else is interested                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The members of one group, with their names where the server will give them.
 *
 * Two requests, in order of how much they say. The first embeds `profiles`,
 * which every signed-in user may read, so the list comes back as names. If the
 * embed is refused — a policy change, a relationship PostgREST cannot resolve —
 * the second asks for the membership rows alone, and the screen is told through
 * `namesReadable: false` that it has people without names. It renders the
 * count and says the names could not be read; it does not label anybody
 * "Someone", which would be ICEFALL writing a person's name for them.
 */
export async function loadInterestedPeople(groupId: string): Promise<InterestedPeople> {
  if (!supabase || !untyped) return { ok: false, reason: "no-backend" };

  const uid = await currentUid();
  if (!uid) return { ok: false, reason: "signed-out" };

  const withNames = await untyped
    .from("group_members")
    .select("profile_id, joined_at, profiles(display_name, username)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true })
    .limit(50);

  if (!withNames.error) {
    const rows = Array.isArray(withNames.data) ? (withNames.data as Record<string, unknown>[]) : [];
    return { ok: true, people: rows.flatMap((r) => toPerson(r) ?? []), namesReadable: true };
  }

  const plain = await untyped
    .from("group_members")
    .select("profile_id, joined_at")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true })
    .limit(50);

  if (plain.error) return { ok: false, reason: classify(plain.error) };

  const rows = Array.isArray(plain.data) ? (plain.data as Record<string, unknown>[]) : [];
  return { ok: true, people: rows.flatMap((r) => toPerson(r) ?? []), namesReadable: false };
}

/**
 * PostgREST returns a to-one embed as an object, but returns an array wherever
 * it cannot prove the relationship is to-one. Both shapes are handled because
 * the difference is decided by the schema cache rather than by this code.
 */
function toPerson(row: Record<string, unknown>): InterestedPerson | null {
  const profileId = typeof row.profile_id === "string" ? row.profile_id : null;
  if (!profileId) return null;

  const raw = row.profiles;
  const profile = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined | null;

  const name =
    profile && typeof profile.display_name === "string" && profile.display_name.trim().length > 0
      ? profile.display_name.trim()
      : null;
  const username =
    profile && typeof profile.username === "string" && profile.username.trim().length > 0
      ? profile.username.trim()
      : null;

  return {
    profileId,
    name,
    username,
    joinedAt: typeof row.joined_at === "string" ? row.joined_at : "",
  };
}
