/* ============================================================================
 * ⚠ READ THIS BEFORE EDITING. Four things in this file will cost you hours if
 * you meet them by surprise. Written 2026-09-02 by the session handing it over.
 *
 * 1. THE 2026-09-02 MOCKUP BUILD HAS BEEN SUPERSEDED BY A NEW ONE, 2026-09-11.
 *    The old note here said "1:1 mockup build, not a design to improve —
 *    Groups(), GroupsBody(), DemoGroupCard() and GroupCoverCard()". The owner
 *    has since sent a NEW drawing of this screen and said "heres how I want the
 *    group page to look like", and it is a different screen: a search field
 *    with a filter control, "Discover groups" over filter chips and a
 *    HORIZONTAL RAIL of tall photographic cards, "My groups" as a vertical list
 *    of thumbnail rows, and a "+ Create group" pill under all of it. The four
 *    functions named above are gone and the ones below replace them. What the
 *    old note was protecting still holds and has been carried over: the owner's
 *    padlock for a private group. The NEW drawing is a competitor's screenshot —
 *    LAYOUT ONLY. Its light ground, its purple and its typography are not
 *    ICEFALL's and none of them shipped.
 *
 * 2. `GroupsBody` IS CALLED AS A FUNCTION (line ~190), NOT RENDERED AS AN
 *    ELEMENT, AND THAT IS DELIBERATE. `Stagger` animates through framer-motion
 *    variants, and VARIANT PROPAGATION REACHES ONLY DIRECT CHILDREN. Write
 *    `<GroupsBody />`, or put any wrapper <div> between Stagger and the Rise
 *    elements, and every card sits at opacity:0 — present in the DOM, invisible
 *    on screen, no console error, tsc green. Two sessions have lost time to
 *    exactly this, twice in this file and once in People.tsx. GroupsBody holds
 *    no hooks, so calling it is safe.
 *
 * 3. THE SECOND HALF OF THIS FILE IS PARKED, NOT ROT. `PeopleAndGroupsMerged`
 *    and its sections (MountainsSection, MountainRow, InterestedList,
 *    CatalogueList, MountainPicker) are the old merged partner-finder: "add a
 *    mountain, see who else wants it". It WORKS. (`YourGroupsSection`,
 *    `Filters`, `Facet` and `Pill` were part of it and are NOT parked — they
 *    drew groups saved on one phone, which nobody can start any more. The note
 *    where they stood says why.) It is unreferenced because it
 *    awaits an owner decision that was asked for and never answered. DO NOT
 *    DELETE IT AS DEAD CODE. `noUnusedLocals` is false in this repo, so nothing
 *    here is compiler-caught — unreferenced has to be judged by eye, and this
 *    one has already been judged.
 *
 * 4. THERE ARE NO DEMO CARDS ANY MORE (structure plan §3.3, S2). Demo builds
 *    show the labelled examples from `groups/demo/exampleSource.ts`, which is
 *    gated at its own definition; every other build shows real groups only, and
 *    "No groups yet." when there are none.
 *
 * ── 5. THE OWNER'S MOCKUP, AND THE ONE PLACE WE MUST DIVERGE FROM IT ────────
 * The drawing is at ~/Downloads/icefall-sessions/mockups/social-pages-owner-mockup.webp
 * (one image, four panels: FEED / PEOPLE / GROUPS / STORIES). Its GROUPS panel:
 *
 *   Mont Blanc Objectives 🔒   1.2K members · 156 posts   [Join]
 *   Alpine Women               843 members · 98 posts     [Join]
 *   Ama Dablam Climbers        612 members · 73 posts     [Join]
 *   Denali Push 2026 🔒        489 members · 64 posts     [Join]
 *
 * THE PADLOCK IS THE OWNER'S OWN CHOICE for private. Use it. Do not invent a
 * badge, and do not drop it — it has shipped and they have seen it.
 *
 * BUT BOTH LOCKED CARDS SAY "JOIN", AND THAT CONTROL CANNOT EXIST. A private
 * group cannot be joined: `group_members_insert` (20260902220000) admits a
 * self-insert only into a PUBLIC group or with an already-accepted request, and
 * `group_join_requests_insert` pins the decision columns NULL so nobody can
 * accept themselves. A Join button on a locked card would do nothing but raise.
 * So: keep the padlock, and label locked cards "Request to join". This is the
 * ONE place the build will not match the image. The owner has been told, in
 * those terms, rather than left to find a renamed button.
 *
 * COUNTS ARE ABBREVIATED IN THE DRAWING and are printed whole here: a real
 * `member_count` is a measured number, and rounding it where the exact figure
 * is knowable is an invention for no reason.
 *
 * THERE IS NO CREATE-GROUP AFFORDANCE ANYWHERE IN THE PANEL — pills, four cards,
 * tab bar, nothing else. The owner asked for "if you create a group you have
 * option to be public or private" but never drew the way in, so ANY entry point
 * is a divergence by necessity. The nearest thing in their own drawing is the
 * blue circular + floating bottom-right on the FEED panel, above the tab bar.
 * Mirroring that on Groups is the choice most likely to read as theirs.
 *
 * THE TAB BAR IS THREE TABS: FEED / PEOPLE / GROUPS. Stories is NOT a tab — it
 * is the rail at the top of Feed plus the full-screen viewer. Adding a Stories
 * tab means the image was misread.
 *
 * ── 6. THE OWNER RULED THE JOIN FLOW, 2026-09-02 (not in the mockup) ────────
 * Asked directly, because the drawing shows the Join button and nothing after it:
 *
 *   TAPPING JOIN ON A PUBLIC GROUP OPENS THE GROUP STRAIGHT AWAY. You are in,
 *   and you land inside it. The join was the decision; a second tap is friction.
 *   So Join = insert the membership row AND navigate to the group.
 *
 *   THE GROUP OPENS ON DETAILS AND MEMBERS, NOT THE CONVERSATION. The mountain,
 *   when they intend to go, and who is in — with the chat one tap away. This is
 *   a climbing party rather than a chat room: who and when matter more than the
 *   talk, and someone who just joined needs to see what they walked into.
 *
 * PRIVATE GROUPS DO NOT GET THIS. "Request to join" writes a request row and the
 * card becomes pending — no navigation, because there is nothing to see yet and
 * the roster is members-only by policy. Landing them anywhere would show a
 * refusal they did not earn.
 *
 * ── 7. WHAT THIS SESSION ADDED, 2026-09-02 (privacy, and creating a group) ──
 * The owner: "If you create a group you have option to be public or private
 * accept". Three things landed here, and each one has a trap worth knowing.
 *
 * A. THE CREATE FLOW HAS ITS OWN ROUTE AGAIN, AS OF SLICE S7 (16 Sep 2026).
 *    This note used to say the opposite — "there is no route for it and there
 *    must not be" — because `/social/groups/new` made an `Expedition`, a plan
 *    held on THIS DEVICE, and pointing the new flow at the old route would
 *    have quietly made one record the other. There is only ONE kind of group
 *    now (structure plan D1), so there is only one form, and that route is it:
 *    `screens/groups/create/CreateGroupPage.tsx` renders `CreateGroupCard`
 *    below, full-screen. `?create=1` still arrives and redirects there.
 *
 * B. THE LIST READ CANNOT TELL A PUBLIC GROUP FROM A PRIVATE ONE, so a second,
 *    narrow read does. `useSharedGroups` (network/interest.ts) deliberately
 *    does NOT ask for `groups.visibility` — that migration is unpushed, and one
 *    column would take the whole shared-mountains feature down with it. But a
 *    card cannot draw a Join button without knowing which kind of group it is:
 *    `group_members_insert` admits a self-insert into a PUBLIC group only, so
 *    "Join" on a private one is a control that can only raise. `useGroupPrivacy`
 *    below asks two questions in two requests for the whole list — the privacy
 *    of every group, and this reader's own outstanding asks — and every card
 *    reads its answer out of those maps. IT BELONGS IN `social/groupSpace.ts`
 *    AS A LIST HOOK; it is here because this session does not own that file.
 *    Whoever adds `useGroups()` there should delete this and use it.
 *
 * C. JOIN NAVIGATES, AND ONLY BECAUSE THE DESTINATION NOW EXISTS. Section 6
 *    records the owner's ruling: joining a public group lands you inside it,
 *    because the join was the decision and a second tap is friction. That
 *    depends entirely on `/social/groups/:id`, which `GroupWorkspace` now
 *    dispatches — a uuid-shaped id renders the server group's space, and a
 *    LOCAL expedition id renders the read-only summary of a group saved on
 *    this phone, or redirects to the group on the account once it has been
 *    moved there (structure plan §1.4). Before that dispatch
 *    existed the same navigation answered a real join with "this device holds
 *    no group with that id", so IF THAT DISPATCH EVER GOES, THIS NAVIGATION
 *    GOES WITH IT: reporting the join and staying put is true, and landing
 *    somebody on a false sentence is not.
 *
 *    PRIVATE GROUPS ARE NOT NAVIGATED. An ask is not an admission — the roster
 *    and the conversation are members-only by policy, so there is nothing there
 *    to land on yet.
 *
 * ── 7. THE CREATE CONTROL MOVED TO THE HEADER, 2026-09-02 ──────────────────
 * The owner: "to create group, need to be added a + sign next and above social
 * page, not under discover."
 *
 * So the floating azure + that used to sit bottom-right above the tab bar is
 * GONE, and a + now lives in the ScreenHeader `action` slot of the screen that
 * shows this one — beside its title, above the tab row, at the same altitude as
 * search and notifications. A create control below the Discover/My Groups pills
 * reads as a filter on the list it sits in rather than a way to add to it.
 *
 * THAT HEADER IS `screens/social/Social.tsx`, NOT `ExploreLayout`. Social was
 * lifted out of Explore on 2026-09-03 and the + travelled with it; the old
 * layout carries no action at all now.
 *
 * IT GOES STRAIGHT TO `/social/groups/new` SINCE SLICE S7, because the form is
 * a screen of its own now rather than a piece of state on this one. It used to
 * set `?tab=groups&create=1` and let this screen open the flow inline. That
 * param still arrives — from links already in the wild, and from
 * `/social/groups?create=1` and the legacy `/explore/groups?create=1`, because
 * every redirect into Social carries the search string — and this screen
 * REPLACE-redirects it to the form.
 *
 * DO NOT re-add a floating +. It was mine, the owner has replaced it, and a
 * second entry point to the same form is how two of them drift apart.
 *
 * ── 8. THERE IS A "+ CREATE GROUP" PILL AT THE FOOT AGAIN, 2026-09-11 ───────
 * AND IT CONTRADICTS §7 ABOVE, KNOWINGLY. §7 records the owner saying "not
 * under discover" and the floating + was duly removed. Their new drawing puts
 * a "+ Create group" pill under the My-groups list, so the instruction and the
 * drawing disagree and the drawing is the later of the two. Three things make
 * it a different control from the one they rejected:
 *   · It is NOT floating. It scrolls with the page and sits at the END of the
 *     list rather than over it, so it reads as the last item rather than a
 *     control over the list beneath it.
 *   · It is not under Discover. It is under everything.
 *   · It carries a WORD. What the owner objected to was a bare glyph below a
 *     filter row, which reads as a filter.
 * IT IS NOT A SECOND FLOW. It is a `Link` to `/social/groups/new`, which is
 * where the header's + goes and where `?create=1` lands, so the two cannot
 * drift.
 * IF THE OWNER RESTATES "not under discover" AFTER SEEING THIS, DELETE THE
 * PILL AND LEAVE THE HEADER +; the flow survives either way.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Check,
  ChevronDown,
  Globe,
  Loader2,
  Lock,
  Mountain as MountainIcon,
  Plus,
  Search,
  SlidersHorizontal,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";

import { Avatar, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { DateField } from "@/components/ui/DateField";
import { supabase } from "@/backend/client";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { MountainThumb, useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtDate, fmtElevation } from "@/lib/format";
import { MOUNTAINS } from "@/data/mock/mountains";
import type { Mountain } from "@/types";
import { SAFETY_REMINDER } from "@/network/privacy";
import { destinationIdForPeak } from "@/enquiries/send";
import { EXAMPLE_GROUPS, EXAMPLE_LABEL, type ExampleGroup } from "@/groups/demo/exampleSource";
/* The groups saved on this phone, and the tap that moves each one up. */
import { DeviceGroupsSection } from "@/screens/groups/sections/tab/DeviceGroupsSection";
import {
  MAX_GROUP_NAME,
  MAX_GROUP_TOPIC,
  VISIBILITY_EXPLAINED,
  useGroupActions,
  type GroupVisibility,
} from "@/social/groupSpace";
import {
  aboutForKind,
  appPeakFor,
  destinationMatches,
  useGroupDestinations,
  type DestinationsState,
  type GroupDestination,
} from "@/groups/mountains";
import { todayKey } from "@/network/groups";
import {
  INTEREST_VISIBLE_NOTICE,
  SHARED_GROUPS_NOT_LIVE,
  SHARED_GROUPS_UNREACHABLE,
  addMountainInterest,
  joinMountainGroup,
  loadInterestedPeople,
  removeMountainInterest,
  useSharedGroups,
  type GroupPlace,
  type InterestFailure,
  type InterestedPerson,
  type MountainGroup,
  type SharedGroups,
} from "@/network/interest";
import { usePrimaryGoal } from "@/state/AppState";

/**
 * PEOPLE AND GROUPS — one page.
 *
 * PEOPLE AND GROUPS WERE BRIEFLY ONE PAGE, AND ARE NOT ANY MORE.
 *
 * The PH-08 note read "People and groups need to be one page together", and
 * this file became that page. The owner's 1:1 mockups of 2026-09-02 supersede
 * it and draw Feed, People and Groups as three separate tabs, so the People
 * half has gone back to `./People`, which has its own screen again. The
 * backlog entry is updated — a stale instruction nobody greps is how this gets
 * merged again by the next person.
 *
 * `?tab=people` and `?tab=groups` both still resolve — see `./Social` and the
 * aliases in `App.tsx` — so no existing link breaks.
 *
 * THREE THINGS, IN THE ORDER SOMEBODY ACTUALLY NEEDS THEM
 *
 *   1. MOUNTAINS YOU WANT TO CLIMB. Public, server-side, and the only part of
 *      this page that can show you a stranger. Adding a mountain creates or
 *      joins the group for it in `public.groups`, and the people in that group
 *      are the people interested in climbing it — which is the feature the
 *      owner asked for, in as many words.
 *   2. YOUR GROUPS. The party you are actually planning: the window, the size,
 *      the sessions, the checklist. Local to this device, as it has always
 *      been, and unchanged by this merge.
 *   3. PEOPLE. Matching against a directory of athletes that does not exist.
 *
 * TWO THINGS ARE CALLED A GROUP AND THEY ARE NOT THE SAME THING. The row in
 * `public.groups` is a mountain's public interest list; the `Expedition` in
 * `@/network/types` is a plan held on this phone. The copy below never calls
 * the first one a group in front of a reader — it is "a mountain you want to
 * climb" and "who else wants it" — because two things sharing a word on one
 * screen is how somebody comes to believe their private plan was published.
 *
 * WHAT MAY AND MAY NOT BE DRAWN HERE
 *
 * Section 1 can be live: a count of interested people is a real number from a
 * real table, and where it arrives it is shown. Where it does NOT arrive — no
 * client, signed out, the migration not yet pushed, the request failed — the
 * page says which of those happened. It never renders a failed read as an
 * empty list, because "nobody else wants Mont Blanc" and "ICEFALL could not
 * ask" would lead a climber to opposite decisions and only one of them is
 * something this app knows.
 *
 * Sections 2 and 3 cannot be live and do not pretend to be: no other person's
 * expedition is discoverable, `DISCOVERABLE_ATHLETES` is empty by rule, and
 * neither list is seeded, demoed or padded. A fabricated climbing partner is a
 * hazard rather than a placeholder — this page's own safety copy is about
 * meeting strangers in remote places.
 */

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* GROUPS — the owner's 1:1 mockup, 2026-09-02                                */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Is this group public or private, and where do I stand with it?              */
/* -------------------------------------------------------------------------- */

/**
 * Where somebody stands on a private group they are not in.
 *
 * `declined` is kept rather than folded into `none` because the row is kept:
 * `group_join_requests`'s primary key is `(group_id, profile_id)`, so a second
 * ask collides. Offering "Request to join" to somebody who has already been
 * told no would be a button whose only outcome is being told no again.
 */
type Ask = "pending" | "accepted" | "declined";

/**
 * WHAT THE LIST READ CANNOT ANSWER, ANSWERED IN TWO REQUESTS FOR THE WHOLE LIST.
 *
 * `not-deployed` is the interesting one and it is not a failure. If
 * `groups.visibility` is not on the server then privacy does not exist there,
 * and `group_members_insert` is still the policy from 20260902100000 —
 * `profile_id = auth.uid()` and nothing else. So NO GROUP CAN BE PRIVATE and
 * every one of them can be joined outright. That is a fact this app has
 * established, not a default it picked, which is why the cards keep their Join
 * button in that state instead of going dark.
 *
 * `unknown` is the opposite: the server was asked and would not say. A card in
 * that state offers no join control at all, because it cannot tell which of the
 * two controls would work and the wrong one can only raise.
 */
export type GroupPrivacy =
  | { status: "loading" }
  /** No client in this build. There are no real groups on screen either. */
  | { status: "no-backend" }
  | { status: "signed-out" }
  /** The server has no privacy setting on a group. Nothing here is private. */
  | { status: "not-deployed" }
  /**
   * Asked, and not told. Never softened into "public".
   *
   * The REASON travels, not a sentence. Reading a card and filling in a form
   * are different situations — one person is looking at a group, the other has
   * just typed something and needs to know what happened to it — and a single
   * string would have said the wrong one of those in one of the two places.
   */
  | { status: "unknown"; reason: "unreachable" | "refused" }
  | {
      status: "ready";
      visibility: ReadonlyMap<string, GroupVisibility>;
      /** This reader's own outstanding and decided asks, by group id. */
      asks: ReadonlyMap<string, Ask>;
    };

/**
 * The same untyped-client escape hatch `network/interest.ts` and
 * `social/groupSpace.ts` both take, for the same reason: `backend/types.ts`
 * predates every groups migration and belongs to another session.
 */
const untypedClient = supabase as unknown as SupabaseClient | null;

/** Matched to `readGroups` in `network/interest.ts` so the two see one list. */
const PRIVACY_PAGE = 200;

async function readPrivacy(): Promise<GroupPrivacy> {
  if (!supabase || !untypedClient) return { status: "no-backend" };

  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id ?? null;
  if (!uid) return { status: "signed-out" };

  /*
   * Ordered and limited exactly as `readGroups` orders and limits, so the two
   * reads describe the same 200 groups. A different window would leave the
   * oldest cards on screen with no privacy answer for no reason a reader could
   * ever work out.
   */
  const rows = await untypedClient
    .from("groups")
    .select("id, visibility")
    .order("created_at", { ascending: false })
    .limit(PRIVACY_PAGE);

  if (rows.error) {
    const code = rows.error.code ?? "";
    const message = (rows.error.message ?? "").toLowerCase();
    // A missing column (42703/PGRST204) or a missing table (42P01/PGRST205).
    // Either way the server holds no privacy setting on any group — see the
    // note on `not-deployed`.
    if (
      code === "42703" ||
      code === "PGRST204" ||
      code === "42P01" ||
      code === "PGRST205" ||
      message.includes("schema cache")
    ) {
      return { status: "not-deployed" };
    }
    if (message.includes("fetch")) return { status: "unknown", reason: "unreachable" };
    // A refusal — a missing grant included. The column may well exist and hold
    // 'private', so this must never be read as "everything is public".
    return { status: "unknown", reason: "refused" };
  }

  const visibility = new Map<string, GroupVisibility>();
  for (const raw of Array.isArray(rows.data) ? rows.data : []) {
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : null;
    // An unreadable value is LEFT OUT rather than defaulted. `groupSpace.ts`
    // drops a whole group for this; here the card survives and simply offers
    // no join control, which is the same refusal at a smaller scale.
    if (!id || (row.visibility !== "public" && row.visibility !== "private")) continue;
    visibility.set(id, row.visibility);
  }

  /*
   * MY OWN ASKS, IN ONE REQUEST. `group_join_requests_select` shows a reader
   * their own rows, so filtering on `profile_id` here is not a security control
   * — it is what makes this one request instead of one per card.
   */
  const asked = await untypedClient
    .from("group_join_requests")
    .select("group_id, accepted_at, declined_at")
    .eq("profile_id", uid)
    .limit(PRIVACY_PAGE);

  const asks = new Map<string, Ask>();
  /*
   * A FAILED ASKS READ DOES NOT FAIL THE PRIVACY ANSWER, and the cost is worth
   * naming: somebody with an outstanding request sees "Request to join" again,
   * taps it, and is told they have already asked — the sentence
   * `groupSpace.ts` keeps for exactly that collision. That is a recoverable
   * wrong label. Reporting every card as unknown because one request did not
   * come back would take the working Join button off every public group too.
   */
  if (!asked.error) {
    for (const raw of Array.isArray(asked.data) ? asked.data : []) {
      const row = raw as Record<string, unknown>;
      const groupId = typeof row.group_id === "string" ? row.group_id : null;
      if (!groupId) continue;
      asks.set(
        groupId,
        typeof row.accepted_at === "string"
          ? "accepted"
          : typeof row.declined_at === "string"
            ? "declined"
            : "pending",
      );
    }
  }

  return { status: "ready", visibility, asks };
}

/**
 * Read on mount and after every write this screen makes — the same posture as
 * `useSharedGroups`, and for the same reason: nothing here changes except
 * because of something the reader just did, and a socket held open on a phone
 * that may be on a mountain buys nothing.
 */
export function useGroupPrivacy(): { privacy: GroupPrivacy; reload: () => void } {
  const [privacy, setPrivacy] = useState<GroupPrivacy>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    void readPrivacy().then((next) => {
      if (alive) setPrivacy(next);
    });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { privacy, reload };
}

/* -------------------------------------------------------------------------- */
/* One group, as this screen needs it — example or real, one shape             */
/* -------------------------------------------------------------------------- */

/**
 * WHY THERE IS A SEAM HERE AT ALL.
 *
 * Two records reach this list — the rows of `public.groups`, and in demo builds
 * the labelled examples — and both are drawn by the same card. `Entry` is the
 * narrow shape a CARD can draw, and the two adapters below are the only places
 * that decide what is knowable. A field that is null here is a field ICEFALL
 * was not told, and every card reads null the same way: nothing is drawn, and
 * where the gap matters the reason is.
 */
interface Entry {
  key: string;
  name: string;
  /** Where this group opens. */
  to: string;
  /** Enough of a peak to resolve a photograph, or null where ICEFALL cannot. */
  peak: { name: string; elevationM?: number; lat?: number; lon?: number } | null;
  /** A photograph the record carries itself, which beats resolving one. */
  cover: string | null;
  /** The line above the name: which mountain. Null where it cannot be said. */
  about: string | null;
  /** Said in place of `about` when the mountain could not be resolved at all. */
  aboutAbsence: string | null;
  /** A measured count. Null is UNKNOWN and is never rendered as zero. */
  members: number | null;
  /** Only where the server actually said. Null draws no word and no padlock. */
  visibility: GroupVisibility | null;
  joined: boolean;
  /** This reader's own outstanding or decided ask, where one is known. */
  ask: Ask | null;
  /** ISO, or "" where the record carries no created date to order by. */
  createdAt: string;
  intendedOn: string | null;
  /** True for a labelled example (demo builds only). Its card says "Example". */
  example: boolean;
  /** The peak slug, for matching a group against the reader's own objective. */
  destinationId: string | null;
}

/** The peak's own record, by slug — never matched on the group's title. */
function peakRecord(destinationId: string | null) {
  if (destinationId === null) return null;
  return MOUNTAINS.find((m) => m.id === destinationId) ?? null;
}

/**
 * The eyebrow over a group's name: WHICH MOUNTAIN, and how high.
 *
 * The mockup puts a discipline there — "Sport Climbing". ICEFALL has no
 * discipline on a group, on either record or in the table, and inventing a
 * taxonomy to fill a slot is how a screen starts describing groups it has
 * never been told anything about. So the slot carries what the group really is
 * about, which is also what a climber scanning this list is looking for.
 *
 * SINCE `group_type_and_trip.sql` A GROUP NEED NOT BE A PEAK: `destination_id`
 * is nullable, `groups_subject_is_coherent` allows a trek as readily as a
 * mountain, and a group with no destination carries its own `topic` instead.
 * This function is the mountain case only — the one where this build holds the
 * record and can say how high it is. `aboutPlace` is the rest.
 */
function aboutPeak(m: Mountain): string {
  return `${m.name} · ${fmtElevation(m.elevationM)} m`;
}

/**
 * The same slot for a place the catalogue named but this build cannot draw.
 *
 * 41 of the server's mountains are absent from the app, and every trek is —
 * see `groups/mountains.ts`. Their names still came back with the list, so the
 * place is named. A TREK SAYS SO: calling a walk a peak is the one thing the
 * owner's ruling of 16 Sep 2026 forbids. No height, because none was asked for.
 */
function aboutPlace(place: GroupPlace): string {
  return place.kind === "trek" ? `${place.name} · Trek` : place.name;
}

/**
 * Said where the place did not come back with the group AT ALL.
 *
 * Not "not a mountain this build carries", which was a claim about a peak on a
 * read that never learnt whether the place was one. This says only what is
 * true: there is a place and its record is not here.
 */
const PLACE_NOT_NAMED = "The place's record did not come back";

/** A real row of `public.groups`, with whatever the second read could add. */
function entryForGroup(group: MountainGroup, privacy: GroupPrivacy): Entry {
  const m = peakRecord(group.destinationId);
  /*
   * WHAT THE GROUP IS ABOUT, in the order of what is actually known: the peak
   * this build holds a record of, the catalogue's own name for a place it does
   * not, the group's own words where there is no place at all, and otherwise
   * nothing — which is drawn as an absence rather than filled in.
   */
  const about = m
    ? aboutPeak(m)
    : group.destination
      ? aboutPlace(group.destination)
      : group.destinationId === null
        ? group.topic
        : null;
  return {
    key: group.id,
    name: group.name,
    to: `/social/groups/${group.id}`,
    peak: m
      ? { name: m.name, elevationM: m.elevationM, lat: m.coords.lat, lon: m.coords.lon }
      : null,
    cover: null,
    /* NOT TITLE-CASED FROM THE SLUG, in any of the branches above. The
       catalogue's name arrives with the list or it does not; turning
       `ama-dablam-south` into a name nobody uses would be ICEFALL naming a
       place for itself. */
    about,
    aboutAbsence:
      about !== null
        ? null
        : group.destinationId === null
          ? "Not about a particular place"
          : PLACE_NOT_NAMED,
    members: group.memberCount,
    visibility: privacy.status === "ready" ? (privacy.visibility.get(group.id) ?? null) : null,
    joined: group.joinedByMe,
    ask: privacy.status === "ready" ? (privacy.asks.get(group.id) ?? null) : null,
    createdAt: group.createdAt,
    intendedOn: group.intendedOn,
    example: false,
    destinationId: group.destinationId,
  };
}

/**
 * A labelled example from `groups/demo/exampleSource.ts` (demo builds only).
 *
 * It opens like a real group: `/social/groups/:id` reads an example id through
 * the same hooks, and every write on it is refused. The card and the row say
 * "Example", and the name carries the word too.
 */
function entryForExample({ group }: ExampleGroup): Entry {
  const m = peakRecord(group.destinationId);
  return {
    key: group.id,
    name: group.name,
    to: `/social/groups/${group.id}`,
    peak: m
      ? { name: m.name, elevationM: m.elevationM, lat: m.coords.lat, lon: m.coords.lon }
      : null,
    cover: null,
    about: m ? aboutPeak(m) : null,
    aboutAbsence: m ? null : PLACE_NOT_NAMED,
    members: group.memberCount,
    visibility: group.visibility,
    joined: group.joinedByMe,
    ask: null,
    createdAt: group.createdAt,
    intendedOn: group.intendedOn,
    example: true,
    destinationId: group.destinationId,
  };
}

/** What a card shows in the member slot, or null where there is nothing true. */
function memberLine(entry: Entry): string | null {
  if (entry.members !== null) {
    return `${entry.members.toLocaleString("en-GB")} ${entry.members === 1 ? "member" : "members"}`;
  }
  return null;
}

/**
 * "Open", "Private", or nothing at all.
 *
 * The mockup writes "Open" and that is the owner's word, so a public group
 * keeps it — a public group here really is open to anyone signed in, because
 * `group_members_insert` takes a self-insert into one outright. Where the
 * visibility column could not be read the slot is EMPTY: "Open" is a claim
 * about who may get in and an unread setting is not an open door.
 */
function doorWord(entry: Entry): string | null {
  return entry.visibility === "public" ? "Open" : entry.visibility === "private" ? "Private" : null;
}

/** Does this group match what somebody typed? Name and mountain, nothing else. */
function matchesQuery(entry: Entry, q: string): boolean {
  if (q === "") return true;
  const needle = q.trim().toLowerCase();
  if (needle === "") return true;
  return (
    entry.name.toLowerCase().includes(needle) ||
    (entry.about ?? "").toLowerCase().includes(needle) ||
    (entry.peak?.name ?? "").toLowerCase().includes(needle)
  );
}

/* -------------------------------------------------------------------------- */
/* The chips, and which of them can honestly exist                             */
/* -------------------------------------------------------------------------- */

/**
 * THE MOCKUP DRAWS FOUR CHIPS. TWO OF THEM HAVE NOTHING BEHIND THEM.
 *
 *   For you    there IS no interest signal: `seedObjectives()` puts all
 *              fourteen curated mountains on a new athlete's list, so filtering
 *              on saved objectives selects everything and the word "personal"
 *              would be doing no work. What IS real is the ACTIVE OBJECTIVE —
 *              one mountain, chosen, with a date — so the chip is named after
 *              it ("For Mont Blanc") and does not render when there is none.
 *   Popular    the only popularity signal on a group is `member_count`. No post
 *              count, no join rate, no activity column. So the chip is "Most
 *              members", which is what it would be sorting by.
 *   Nearby     DROPPED. A group has no location of any kind — no column on
 *              `groups`, no field on `MountainGroup` — and the reader's own
 *              position exists only behind an opt-in that is off by default and
 *              absent entirely in this build. "Near the peak" is a different
 *              claim from "near you" and the chip cannot make either.
 *   New        KEPT, as the order the list is already in and the one every
 *              other chip returns to. It is not a no-op because it is the state
 *              a re-sort is undone by — and the row does not render at all
 *              unless a second chip qualifies beside it (see `chipsFor`).
 */
type Chip = "new" | "goal" | "members";

/**
 * Only the chips that would actually change what is on screen.
 *
 * A sort chip over one group, or a filter chip that matches all of them or none
 * of them, is a control that does nothing — house rule 3 — and the fix is not
 * to disable it but to leave it out. So each one is tested against the pool it
 * would act on, and where only "New" survives the whole row goes.
 */
function chipsFor(pool: Entry[], goalDestinationId: string | null): Chip[] {
  const chips: Chip[] = ["new"];

  if (goalDestinationId !== null) {
    const hit = pool.filter((e) => e.destinationId === goalDestinationId).length;
    if (hit > 0 && hit < pool.length) chips.push("goal");
  }

  /*
   * NOT "the counts differ" — "SORTING BY THEM MOVES SOMETHING". A list already
   * in descending member order would otherwise get a chip that produced the
   * identical rail. Measured against the order the list is really in, which is
   * the only test that catches it.
   */
  const asIs = pool.map((e) => e.key);
  const byMembers = sortByMembers(pool).map((e) => e.key);
  if (asIs.some((k, i) => byMembers[i] !== k)) chips.push("members");

  return chips.length > 1 ? chips : [];
}

/**
 * Most members first.
 *
 * A group whose count DID NOT ARRIVE cannot be ranked at all: it goes last, in
 * the order it already had, rather than being read as nought and ranked bottom
 * as if it were empty.
 */
function sortByMembers(list: Entry[]): Entry[] {
  return [...list].sort((a, b) => {
    const an = a.members;
    const bn = b.members;
    if (an === null && bn === null) return 0;
    if (an === null) return 1;
    if (bn === null) return -1;
    return bn - an;
  });
}

/* -------------------------------------------------------------------------- */
/* GROUPS — the owner's mockup, 2026-09-11                                     */
/* -------------------------------------------------------------------------- */

/**
 * GROUPS.
 *
 * The mockup: a search field with a filter control, "Discover groups" over a
 * row of chips and a horizontal rail of tall photographic cards, then "My
 * groups" as a vertical list of thumbnail-name-mountain-count rows, then a
 * "+ Create group" pill under all of it.
 *
 * ── WHAT THE MOCKUP DRAWS THAT THE DATA CANNOT ANSWER ───────────────────────
 *   "Sport Climbing"  no group carries a discipline. The mountain goes there.
 *   "13 Members"      `member_count` is nullable and null means it did not
 *                     arrive, never zero — a group always has at least its
 *                     founder. Where it is null the card says so.
 *   "· Open"          rides on `groups.visibility`, read in a second request.
 *                     Where that read did not answer, no word is drawn.
 *   "156 posts"       there is no post count on a group anywhere in this app.
 *                     Not drawn. A second figure beside a real one borrows its
 *                     credibility.
 *   "Nearby"          see `chipsFor`. Dropped outright.
 *
 * ── THE BUG THIS REBUILD EXISTS TO FIX ──────────────────────────────────────
 * The previous list rendered every group as a plain <div>. A group you had
 * already joined could NOT BE OPENED from this screen at all — the only way in
 * was the navigation that fires straight after a fresh join. "My groups" was a
 * list you could look at and not enter. Every row and every card is a Link now.
 *
 * ── WHERE THE JOIN BUTTON WENT ──────────────────────────────────────────────
 * It is on the group's own page, where `Standing` already resolves all five
 * membership branches against what the database will actually accept. The
 * owner's ruling of 2026-09-02 — that joining a public group opens it — is
 * kept and inverted: you open the group and join from inside it, having seen
 * the mountain, the date and who is in before deciding. Nothing was lost; a
 * card that carried "Join" carried a second control the whole card competed
 * with, and the mockup draws no button on a card.
 */
export default function Groups() {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<Chip>("new");
  const [filtering, setFiltering] = useState(false);
  const [door, setDoor] = useState<"any" | "public" | "private">("any");
  const [dated, setDated] = useState(false);

  /*
   * `?create=1` IS A REDIRECT NOW, NOT A FLAG — structure plan §1.4, slice S7.
   *
   * The create form has its own route, `/social/groups/new`, so this screen no
   * longer holds a second copy of it behind a piece of state. Links already in
   * the wild still work: `/social?tab=groups&create=1`, `/social/groups?create=1`
   * and the legacy `/explore/groups?create=1` all arrive here, because every
   * redirect into Social carries the search string, and all three land on the
   * form. REPLACE, so Back returns to whatever the reader was on rather than
   * bouncing off this screen into the form again.
   */
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const wantsCreate = params.get("create") === "1";
  useEffect(() => {
    if (wantsCreate) navigate("/social/groups/new", { replace: true });
  }, [wantsCreate, navigate]);

  /*
   * BOTH READS, AND THEY ARE READ TOGETHER. A group row carries `joined_by_me`
   * and this second read carries the reader's own ask; a row whose two halves
   * disagree is a row that says "Open" beside a group it has already said is
   * closed. Neither is written from this screen any more — joining happens on
   * the group's own page and creating on `/social/groups/new` — so both are
   * read once, on mount.
   */
  const { state } = useSharedGroups();
  const { privacy } = useGroupPrivacy();
  const goal = usePrimaryGoal();

  /* Every group on offer, in one shape. Examples exist only in demo builds, which
     have no server, so the two never really share the list. */
  const pool = useMemo(() => {
    const real = state.status === "ready" ? state.groups : [];
    return [
      ...EXAMPLE_GROUPS.map(entryForExample),
      ...real.map((g) => entryForGroup(g, privacy)),
    ];
  }, [state, privacy]);

  /* A demo build has no server; its examples stand in for the no-server line. */
  const examplesInstead = EXAMPLE_GROUPS.length > 0 && state.status === "no-backend";

  const goalDestinationId = goal ? (goal.mountainId ?? destinationIdForPeak(goal.name)) : null;
  const chips = useMemo(() => chipsFor(pool, goalDestinationId), [pool, goalDestinationId]);

  /*
   * WHICH FACETS THE FILTER CONTROL CAN OFFER, and it offers none unless one of
   * them would genuinely split the list in two. A facet that matches everything
   * or nothing is a control that does nothing; where neither survives, the
   * glyph in the search field is not drawn either, because a filter button over
   * no filters is the same bug one level up.
   */
  const doorFacet =
    pool.some((e) => e.visibility === "public") && pool.some((e) => e.visibility === "private");
  const dateFacet = pool.some((e) => e.intendedOn) && pool.some((e) => !e.intendedOn);
  const anyFacet = doorFacet || dateFacet;
  const facetsOn = (doorFacet && door !== "any") || (dateFacet && dated);

  /* ---- What Discover shows, after everything the reader has asked for ----- */
  const discover = useMemo(() => {
    let list = pool.filter((e) => matchesQuery(e, query));
    if (doorFacet && door !== "any") list = list.filter((e) => e.visibility === door);
    if (dateFacet && dated) list = list.filter((e) => e.intendedOn !== null);
    if (chip === "goal" && goalDestinationId !== null) {
      list = list.filter((e) => e.destinationId === goalDestinationId);
    }
    if (chip === "members") list = sortByMembers(list);
    return list;
  }, [pool, query, door, dated, doorFacet, dateFacet, chip, goalDestinationId]);

  /* ---- The groups this reader is actually in ----------------------------- */
  const mine = useMemo(
    () => pool.filter((e) => e.joined && matchesQuery(e, query)),
    [pool, query],
  );

  /* ---- Creating ---------------------------------------------------------- */

  /*
   * NOT HERE ANY MORE. The form used to replace this list in place; since S7 it
   * is `/social/groups/new`, a screen of its own with its own title and its own
   * way back. `?create=1` above sends anyone holding an old link to it.
   */

  /* An empty screen for the one frame before the redirect above fires, rather
     than the whole list appearing and being taken away again. */
  if (wantsCreate) return <Screen padded={false}>{null}</Screen>;

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-24 pt-1">
        {/* ---- Search, with the filter control inside it ------------------ */}
        <Rise className="pt-1">
          <div className="relative">
            <Search
              size={15}
              strokeWidth={1.7}
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search groups…"
              aria-label="Search groups by name or mountain"
              className={cn(
                "h-11 w-full rounded-pill border border-hairline bg-graphite pl-10 text-[13.5px] text-snow outline-none placeholder:text-mist-dim focus:border-azure [&::-webkit-search-cancel-button]:hidden",
                anyFacet ? "pr-12" : "pr-4",
              )}
            />
            {/* A REAL CONTROL OR NONE AT ALL. Drawn only where there is
                something to filter by — see `doorFacet` / `dateFacet`. */}
            {anyFacet && (
              <button
                type="button"
                aria-label={filtering ? "Hide filters" : "Filter groups"}
                aria-expanded={filtering}
                onClick={() => setFiltering((v) => !v)}
                className={cn(
                  "absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full transition-colors",
                  filtering || facetsOn ? "text-azure" : "text-mist-dim hover:text-snow",
                )}
              >
                <SlidersHorizontal size={15} strokeWidth={1.7} aria-hidden />
              </button>
            )}
          </div>
        </Rise>

        {anyFacet && filtering && (
          <Rise className="pt-3">
            <p className="text-[11px] leading-relaxed text-mist-dim">Filters what Discover shows.</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {doorFacet &&
                (["any", "public", "private"] as const).map((d) => (
                  <FilterChip
                    key={d}
                    on={door === d}
                    onClick={() => setDoor(d)}
                    label={d === "any" ? "Any door" : d === "public" ? "Open to anyone" : "Approval needed"}
                  />
                ))}
              {dateFacet && (
                <FilterChip
                  on={dated}
                  onClick={() => setDated((v) => !v)}
                  label="Has a date set"
                />
              )}
            </div>
          </Rise>
        )}

        {/* ---- Discover --------------------------------------------------- */}
        <Rise className="pt-8">
          <SectionLabel>Discover groups</SectionLabel>
        </Rise>

        {chips.length > 0 && (
          <Rise className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChip(c)}
                aria-pressed={chip === c}
                className={cn(
                  "h-11 shrink-0 rounded-pill border px-4 text-[13px] transition-colors",
                  chip === c
                    ? "border-azure/70 bg-azure/[0.10] text-azure"
                    : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
                )}
              >
                {c === "new"
                  ? "Newest"
                  : c === "members"
                    ? "Most members"
                    : `For ${goal?.name ?? "your objective"}`}
              </button>
            ))}
          </Rise>
        )}

        {/* THE RAIL SITS INSIDE A `Rise`, and it has to. `Stagger` propagates
            its variants to DIRECT CHILDREN ONLY — a wrapper between the two
            leaves every card at opacity 0, in the DOM, with no error and tsc
            green. See §2 in the file header; it has cost three sessions. */}
        {discover.length > 0 ? (
          <Rise className="no-scrollbar -mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-1">
            {discover.map((e) => (
              <DiscoverCard key={e.key} entry={e} />
            ))}
          </Rise>
        ) : (
          /* NO RAIL AT ALL, AND THE REASON IN ITS PLACE. An empty scroller is
             indistinguishable from one that failed to load. */
          <Rise className="pt-5">
            <p className="max-w-[320px] text-[12.5px] leading-relaxed text-mist">
              {discoverAbsence(state, query, chip, facetsOn, goal?.name ?? null)}
            </p>
          </Rise>
        )}

        {/* ---- My groups -------------------------------------------------- */}
        <Rise className="pt-10">
          <SectionLabel>My groups</SectionLabel>
        </Rise>

        {state.status === "loading" ? (
          <Rise className="pt-4">
            <p className="text-[12.5px] text-mist">Looking for the groups you are in…</p>
          </Rise>
        ) : state.status !== "ready" && !examplesInstead ? (
          <Rise className="pt-4">
            <SharedUnavailable state={state} footnote="Nothing you did is lost." />
          </Rise>
        ) : mine.length === 0 ? (
          <Rise className="pt-4">
            <p className="max-w-[320px] text-[12.5px] leading-relaxed text-mist">
              {query.trim().length > 0
                ? `No group you are in matches “${query.trim()}”.`
                : "You have not joined a group yet."}
            </p>
          </Rise>
        ) : (
          mine.map((e) => (
            <Rise key={e.key} className="pt-1">
              <MyGroupRow entry={e} />
            </Rise>
          ))
        )}

        {/* ---- And the groups saved on this phone --------------------------
            A DIFFERENT RECORD, NEVER MERGED INTO THE LIST ABOVE. Each row
            carries the one tap that moves it to the account (§2.2), and the
            section draws nothing when there is none. */}
        <DeviceGroupsSection query={query} />

        {/* ---- Create ------------------------------------------------------ */}
        {/* A LINK, NOT A BUTTON, SINCE S7. The form is its own screen, so this
            is a way to somewhere rather than a switch on this one — which also
            means it can be long-pressed, opened in a tab and shared, like every
            other way into the form. */}
        <Rise className="pt-10">
          <div className="flex justify-center">
            <Link
              to="/social/groups/new"
              className="flex h-11 items-center gap-2 rounded-pill bg-azure px-5 text-[13.5px] font-medium text-obsidian transition-colors hover:bg-azure-bright"
            >
              <Plus size={15} strokeWidth={2} aria-hidden />
              Create group
            </Link>
          </div>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/** A facet toggle. 44px, because every control on this screen is. */
function FilterChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "h-11 rounded-pill border px-3.5 text-[12.5px] transition-colors",
        on
          ? "border-azure/70 bg-azure/[0.10] text-azure"
          : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
      )}
    >
      {label}
    </button>
  );
}

/**
 * WHY THERE IS NOTHING TO DISCOVER — and these are six different sentences on
 * purpose. "Nobody has made a group" and "ICEFALL could not ask" would lead a
 * climber to opposite conclusions and only one of them is something this app
 * knows.
 */
function discoverAbsence(
  state: SharedGroups,
  query: string,
  chip: Chip,
  facetsOn: boolean,
  goalName: string | null,
): string {
  const q = query.trim();
  if (q.length > 0) return `No group matches “${q}”.`;
  if (chip === "goal") return `No group here is for ${goalName ?? "your objective"}.`;
  if (facetsOn) return "No group matches the filters you have set.";
  if (state.status === "loading") return "Looking for groups…";
  /* Honest empty discovery (structure plan §3.4): one sentence per state, and
     never a placeholder card. */
  if (state.status === "no-backend") return "Groups need ICEFALL's server, and this build has none.";
  if (state.status === "signed-out") return "Sign in to see groups.";
  if (state.status === "unreachable") return "ICEFALL's server could not be reached.";
  if (state.status === "not-provisioned") return "Groups are not switched on for this server yet.";
  return "No groups yet.";
}

/* -------------------------------------------------------------------------- */
/* The rail card                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A tall photographic card: the mountain and the member count over the top of
 * the picture, the group's name across the foot of it.
 *
 * EVERY CARD IS A LINK. An example opens through the same route and hooks as a
 * real group, and says "Example" at the top of its picture.
 */
function DiscoverCard({ entry }: { entry: Entry }) {
  const members = memberLine(entry);
  const door = doorWord(entry);

  const body = (
    <>
      <EntryCover entry={entry} />
      <div className="absolute inset-0 scrim-bottom" />
      {/* TWO SCRIMS, as every hero in this app has. `scrim-bottom` darkens the
          foot for the name; the member count and the status mark sit at the TOP
          of the picture, which on a card of sky is the brightest part of it. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-obsidian/70 via-obsidian/25 to-transparent" />

      {/* Top line — what the mockup puts there, as far as it is knowable. */}
      <div className="absolute inset-x-3.5 top-3 flex items-start justify-between gap-2">
        <p className="tnum min-w-0 truncate text-[11px] text-snow/85">
          {members ?? "Member count not available"}
        </p>
        {entry.example ? (
          <span className="shrink-0 rounded-pill bg-obsidian/70 px-2 py-0.5 text-[10px] text-mist backdrop-blur">
            {EXAMPLE_LABEL}
          </span>
        ) : entry.joined ? (
          <span className="shrink-0 rounded-pill bg-obsidian/70 px-2 py-0.5 text-[10px] text-azure backdrop-blur">
            Joined
          </span>
        ) : entry.ask === "pending" ? (
          <span className="shrink-0 rounded-pill bg-obsidian/70 px-2 py-0.5 text-[10px] text-mist backdrop-blur">
            Asked
          </span>
        ) : entry.ask === "declined" ? (
          <span className="shrink-0 rounded-pill bg-obsidian/70 px-2 py-0.5 text-[10px] text-mist backdrop-blur">
            Not accepted
          </span>
        ) : null}
      </div>

      {/* Foot — the eyebrow, then the name, as every hero in this app does it. */}
      <div className="absolute inset-x-3.5 bottom-3.5">
        <p className="truncate text-[10px] uppercase tracking-[0.16em] text-snow/70">
          {entry.about ?? entry.aboutAbsence ?? ""}
        </p>
        {/*
          THE CLAMP IS INLINE, AND IT WAS MEASURED RATHER THAN ASSUMED.
          A group name may be 80 characters (`MAX_GROUP_NAME`) — five lines on a
          228px card, which would climb out of the picture. `src/index.css:411`
          records that Tailwind's `line-clamp-2` resolves to `display: flow-root`
          in this engine and clips to a HEIGHT rather than at a line, showing the
          wrong lines, and adds `.clamp-2` for it.
          MEASURED ON THE RENDERED CARD, 2026-09-11, Chrome 152: an 80-character
          name in this element is 49px tall, which is exactly two lines of its
          24.4px leading — so the clamp holds. Note that `getComputedStyle`
          reports `flow-root` here EVEN WITH `-webkit-box` set inline, so the
          computed value is not the test; the height is. Written inline so no
          cascade can take it away.
        */}
        <p
          className="display mt-1 text-[23px] leading-[1.06] text-snow"
          style={
            {
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 2,
              overflow: "hidden",
            } as React.CSSProperties
          }
        >
          {entry.name}
        </p>
        {door && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-snow/75">
            {entry.visibility === "private" ? (
              <Lock size={11} strokeWidth={1.9} aria-hidden className="shrink-0" />
            ) : (
              <Globe size={11} strokeWidth={1.9} aria-hidden className="shrink-0" />
            )}
            {door}
          </p>
        )}
      </div>
    </>
  );

  const frame = "relative h-[268px] w-[228px] shrink-0 overflow-hidden rounded-[18px] bg-slate";

  return (
    <Link to={entry.to} className={cn(frame, "block")} aria-label={`Open ${entry.name}`}>
      {body}
    </Link>
  );
}

/**
 * The picture on a group, and the three honest answers.
 *
 * A GROUP HAS NO COVER FIELD — not on `public.groups`, not on `MountainGroup`,
 * not on the local `Expedition`. So the picture is the MOUNTAIN's, resolved by
 * `useMountainImage`, which marks its own stand-in terrain rather than passing
 * it off as a summit photograph. Where the peak cannot be resolved at all there
 * is no photograph to draw and none is invented: the card keeps its slate.
 */
function EntryCover({ entry }: { entry: Entry }) {
  if (entry.cover !== null) {
    return (
      <img src={entry.cover} alt="" aria-hidden loading="lazy" className="h-full w-full object-cover" />
    );
  }
  if (entry.peak !== null) return <PeakCover peak={entry.peak} />;
  return null;
}

function PeakCover({ peak }: { peak: NonNullable<Entry["peak"]> }) {
  const image = useMountainImage(peak);
  return (
    <>
      <img
        src={image.src}
        alt=""
        aria-hidden
        loading="lazy"
        className={cn("h-full w-full object-cover", image.real ? "opacity-100" : "opacity-45")}
      />
      {!image.real && (
        /* The stand-in keeps saying so. Dimmed AND marked: a reader glancing at
           a rail must not come away believing they have seen the summit. */
        <span className="absolute left-3.5 top-9 rounded-pill bg-obsidian/70 px-2 py-0.5 text-[10px] text-mist backdrop-blur">
          {image.caption ?? "Representative terrain"}
        </span>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The list rows                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One group you are in: thumbnail, name, mountain, and the count with the door.
 *
 * A ROW IS A LINK. The list this replaces rendered plain <div>s, so a group you
 * had joined could not be opened from this screen at all.
 */
function MyGroupRow({ entry }: { entry: Entry }) {
  const members = memberLine(entry);
  const door = doorWord(entry);
  const meta = [members ?? "Member count not available", door].filter(Boolean).join(" · ");

  return (
    <Link
      to={entry.to}
      className="flex min-h-[64px] items-center gap-3.5 py-2 transition-opacity hover:opacity-80"
    >
      {entry.peak ? (
        <MountainThumb peak={entry.peak} size={52} />
      ) : (
        <span
          aria-hidden
          className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[10px] border border-hairline bg-slate text-mist-dim"
        >
          <MountainIcon size={18} strokeWidth={1.5} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14px] text-snow">{entry.name}</span>
          {entry.visibility === "private" && (
            <Lock size={11} strokeWidth={1.9} aria-label="Private" className="shrink-0 text-mist-dim" />
          )}
          {entry.example && (
            <span className="shrink-0 rounded-pill border border-hairline px-1.5 py-px text-[10px] text-mist">
              {EXAMPLE_LABEL}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] text-mist">
          {entry.about ?? entry.aboutAbsence ?? ""}
        </span>
        <span className="tnum mt-0.5 block truncate text-[11.5px] text-mist-dim">
          {meta}
          {entry.intendedOn && ` · ${fmtDate(entry.intendedOn)}`}
        </span>
      </span>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Creating a group                                                            */
/* -------------------------------------------------------------------------- */

/** Nothing is "already taken" when the group does not exist yet. */
const NOTHING_TAKEN: ReadonlySet<string> = new Set<string>();

/**
 * FOUR SENTENCES FOR THE CREATE BUTTON, AND NONE OF THEM IS THE MODULE'S.
 *
 * `groupSpace.ts` exports a sentence for every one of these absences and each
 * one is about a group that could not be OPENED — "it cannot open this group",
 * "the group could not be read", "nothing is shown here rather than a guess".
 * Read out under a form somebody has just filled in, they answer a question
 * nobody asked. What that person needs to know is what happened to what they
 * typed, which is the rule the module's own `SEND_MEMBERS_ONLY` was split out
 * to follow.
 */
const CREATE_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so there is nowhere to put a group. Nothing was sent and nothing you have typed is lost.";

const CREATE_SIGNED_OUT =
  "Your ICEFALL session ended, so nothing was created. Sign in again and this is still here.";

const CREATE_NOT_LIVE =
  "Choosing public or private is not live on ICEFALL's server yet — a group there has no privacy setting to record — so this would be refused and no group would be created. Nothing you have typed is lost.";

const CREATE_UNREACHABLE =
  "ICEFALL could not reach the server, so it cannot create a group just now. Nothing was half-saved — try again when you have signal.";

const CREATE_REFUSED =
  "ICEFALL's server would not say how a group's privacy is set, so this form cannot record your choice and nothing would be created.";

/**
 * START A GROUP: what it is about, a name, and who may get in.
 *
 * ── IT IS THE ONLY CREATE FORM, AND IT HAS A ROUTE ──────────────────────────
 * `/social/groups/new` renders this, full-screen, through
 * `screens/groups/create/CreateGroupPage.tsx` (slice S7). It used to be inline
 * here and could not have a route, because that path made an `Expedition` — a
 * plan held on one phone — and two records sharing the word "group" is how
 * somebody comes to believe their private plan was published. There is one
 * kind of group now, so there is one form and one door to it.
 *
 * ── WHAT THE DATABASE INSISTS ON ────────────────────────────────────────────
 *   NOT A MOUNTAIN. Since `group_type_and_trip.sql`, `destination_id` is
 *   nullable and `groups_subject_is_coherent` takes a mountain, a trek, or no
 *   place at all with the group's own `topic` instead. The subject is still
 *   chosen first, and from the SERVER's catalogue where it is a place, because
 *   a row the foreign key does not know is refused at the last tap.
 *   A NAME, 1–80 characters, checked here so the limit is a sentence rather
 *   than a constraint violation.
 *   A VISIBILITY, and `useGroupActions.create` takes it as a required argument
 *   with no default precisely so this form cannot quietly decide it.
 *
 * ── WHY PUBLIC IS PRE-SELECTED ──────────────────────────────────────────────
 * The column's own default, and the migration says why: a group that turns out
 * more open than its founder meant is visible and fixable, where one that is
 * silently closed just looks broken to everyone trying to join it. The reason
 * is on screen rather than only in the SQL, because a pre-selected privacy
 * setting is a decision this app made on somebody's behalf.
 */
/**
 * What a new group is about, as the form holds it.
 *
 * THREE ANSWERS, AND "NOTHING IN PARTICULAR" IS ONE OF THEM. The owner's ruling
 * of 16 Sep 2026 is that a group need not be mountain related, so the picker is
 * not a wall any more — but the three are kept apart in the type, because a
 * catalogue row and a line somebody typed are different kinds of fact and only
 * the first is a place ICEFALL can draw anything from.
 */
type GroupSubject =
  | { kind: "destination"; destination: GroupDestination }
  | { kind: "topic"; label: string }
  | { kind: "none" };

export function CreateGroupCard({
  privacy,
  onClose,
  onCreated,
  titleRow = true,
}: {
  privacy: GroupPrivacy;
  onClose: () => void;
  /** Called once the server has answered with an id. Nothing to refresh on the
      create route, where the list is not on screen. */
  onCreated?: () => void;
  /**
   * The form's own "Start a group" row with its Close. Drawn when the form is
   * inside another screen; suppressed on `/social/groups/new`, where the page's
   * own `ScreenHeader` is the title and the back chevron is the way out. Two of
   * either would be two ways to leave one form.
   */
  titleRow?: boolean;
}) {
  const actions = useGroupActions();
  const navigate = useNavigate();
  const goal = usePrimaryGoal();

  // The subject comes first, so the picker is what opens.
  const [picking, setPicking] = useState(true);
  const [subject, setSubject] = useState<GroupSubject | null>(null);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<GroupVisibility>("public");
  const [day, setDay] = useState("");
  const [made, setMade] = useState<{
    id: string;
    name: string;
    visibility: GroupVisibility;
  } | null>(null);

  /*
   * THE PLACES COME FROM THE SERVER, not from the app's own catalogue (R14).
   * The two lists differ in both directions, so a group filed against the app's
   * idea of a peak is a group the database refuses — see `groups/mountains.ts`.
   */
  const catalogue = useGroupDestinations();
  const destination = subject?.kind === "destination" ? subject.destination : null;
  /* The app's record of the same peak, for the photograph and nothing else.
     Absent for most of the server's mountains, which is not a fault. */
  const peak = appPeakFor(destination?.id ?? null);

  /**
   * Why the server cannot take this group, where that is already known.
   *
   * Established BEFORE the button is pressed, so the reason sits at the control
   * rather than arriving as a failure after somebody has filled the form. The
   * fields stay live and editable in every one of these states: the form is not
   * what is broken.
   */
  const blocked =
    privacy.status === "no-backend"
      ? CREATE_NO_BACKEND
      : privacy.status === "signed-out"
        ? CREATE_SIGNED_OUT
        : privacy.status === "not-deployed"
          ? CREATE_NOT_LIVE
          : privacy.status === "unknown"
            ? privacy.reason === "unreachable"
              ? CREATE_UNREACHABLE
              : CREATE_REFUSED
            : null;

  /* ---- Made ------------------------------------------------------------- */

  if (made) {
    return (
      /* Said on the page. A box around "your group exists" is a container
         around a sentence; the medallion is the mark, the air is the frame. */
      <div className="pt-6">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 place-items-center rounded-full border border-azure/40 text-azure"
        >
          <Check size={17} strokeWidth={1.8} />
        </span>
        <p className="mt-3.5 text-[14px] text-snow">{made.name} is on ICEFALL's server</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
          {made.visibility === "public"
            ? "You are its first member. Anyone signed in to ICEFALL can join it from here, and everyone in it can see each other and talk."
            : "You are its first member. People can ask to join and you decide — its name and what it is about are visible to everyone, its members and its messages are not."}
        </p>
        {/* The founder is seated by `groups_creator_joins`, an AFTER INSERT
            trigger, so they are genuinely in the group and this really does
            open. Same destination as a join — see §7C. */}
        <Button className="mt-4 w-full" onClick={() => navigate(`/social/groups/${made.id}`)}>
          Open the group
        </Button>
        <Button variant="secondary" className="mt-2.5 w-full" onClick={onClose}>
          Not now
        </Button>
      </div>
    );
  }

  /* ---- What the group is about ------------------------------------------ */

  if (picking) {
    return (
      <MountainPicker
        title="What is this group about?"
        intro="A mountain or a trek from ICEFALL's catalogue, so the group is filed against a real record and the people who want it can find it — or the group's own subject, if it is about something else."
        footer={null}
        busyPeak={null}
        suggested={goal?.name ?? null}
        takenIds={NOTHING_TAKEN}
        catalogue={catalogue}
        onPickDestination={(picked) => {
          setSubject({ kind: "destination", destination: picked });
          // Offered as a starting point in an editable field, never submitted
          // on somebody's behalf: the place's name is what the next person
          // scanning the list has to recognise, and most groups are called it.
          setName((current) => (current.trim().length === 0 ? picked.name : current));
          setPicking(false);
        }}
        onSubject={(label) => {
          setSubject(label.length > 0 ? { kind: "topic", label } : { kind: "none" });
          if (label.length > 0) {
            setName((current) => (current.trim().length === 0 ? label : current));
          }
          setPicking(false);
        }}
        onClose={() => {
          // Backing out of the picker with nothing chosen closes the whole
          // flow — a create form nobody has said anything to has nothing to
          // show. "Nothing in particular" is a choice and is not this.
          if (subject === null) onClose();
          else setPicking(false);
        }}
      />
    );
  }

  /* ---- The form --------------------------------------------------------- */

  const trimmed = name.trim();
  /* The subject is no longer a condition: a group may be about nothing in
     particular. The name is, because a group nobody can recognise is a group
     nobody joins. */
  const ready = trimmed.length > 0 && trimmed.length <= MAX_GROUP_NAME;

  return (
    /*
     * A FORM IS NOT A CARD.
     *
     * The fields inside it keep their borders — a boundary is what tells you
     * that you may type — but the panel around a group of fields was only
     * saying "these belong together", which the heading row and the air
     * already say. Two real divisions survive, as single hairlines: under the
     * title row, and above the one control that commits all of it.
     */
    <div className="pt-2">
      {titleRow && (
        <div className="flex items-center gap-3 border-b border-hairline pb-3">
          <Users size={15} strokeWidth={1.6} className="shrink-0 text-mist-dim" aria-hidden="true" />
          <span className="flex-1 text-[13px] text-snow">Start a group</span>
          <button
            type="button"
            onClick={onClose}
            className="section-label shrink-0 text-mist-dim transition-colors hover:text-snow"
          >
            Close
          </button>
        </div>
      )}

      <div className="space-y-6 py-5">
        {/* ---- What it is about -------------------------------------------- */}
        <div>
          <p className="section-label">What it is about</p>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="mt-2 flex w-full items-center gap-3 rounded-tile border border-hairline px-3 py-2.5 text-left transition-colors hover:border-hairline-strong"
          >
            {peak && (
              <MountainThumb
                peak={{
                  name: peak.name,
                  elevationM: peak.elevationM,
                  lat: peak.coords.lat,
                  lon: peak.coords.lon,
                }}
                size={36}
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-snow">
                {destination
                  ? destination.name
                  : subject?.kind === "topic"
                    ? subject.label
                    : "Nothing in particular"}
              </span>
              <span className="tnum mt-0.5 block truncate text-[11px] text-mist-dim">
                {destination
                  ? destinationDetail(destination)
                  : subject?.kind === "topic"
                    ? "The group's own subject"
                    : "Filed against no place"}
              </span>
            </span>
            <span className="section-label shrink-0 text-mist-dim">Change</span>
          </button>

          {/* A subject in somebody's own words is a label, and ICEFALL says so
              rather than letting it look like a place it has a record of. */}
          {subject?.kind === "topic" && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-mist">
              ICEFALL has no record to file this against, so the group carries these words and
              nothing else — no mountain page, no photograph and no height.
            </p>
          )}
        </div>

        {/* ---- Name -------------------------------------------------------- */}
        <div>
          <label className="block">
            <span className="section-label">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_GROUP_NAME}
              placeholder="What the party is calling itself"
              className="mt-2 h-11 w-full rounded-tile border border-hairline bg-elevated/40 px-3 text-[13px] text-snow placeholder:text-mist-dim focus:border-azure/50 focus:outline-none"
            />
          </label>
          {/* Shown near the limit rather than always — a counter on an empty
              field is a warning about a problem nobody has. */}
          {trimmed.length > MAX_GROUP_NAME - 20 && (
            <p className="tnum mt-1.5 text-[11px] text-mist-dim">
              {MAX_GROUP_NAME - trimmed.length} characters left
            </p>
          )}
        </div>

        {/* ---- Who can get in ---------------------------------------------- */}
        <div>
          <p className="section-label">Who can join</p>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {(["public", "private"] as const).map((option) => {
              const chosen = visibility === option;
              const Icon = option === "public" ? Globe : Lock;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => setVisibility(option)}
                  className={cn(
                    "rounded-tile border px-3 py-3 text-left transition-colors",
                    chosen
                      ? "border-azure/60 bg-azure/[0.08]"
                      : "border-hairline hover:border-hairline-strong",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon
                      size={14}
                      strokeWidth={1.7}
                      aria-hidden="true"
                      className={cn("shrink-0", chosen ? "text-azure" : "text-mist-dim")}
                    />
                    <span className={cn("text-[13px]", chosen ? "text-azure" : "text-snow")}>
                      {option === "public" ? "Public" : "Private"}
                    </span>
                    {chosen && (
                      <Check
                        size={13}
                        strokeWidth={2}
                        aria-hidden="true"
                        className="ml-auto shrink-0 text-azure"
                      />
                    )}
                  </span>
                  <span className="mt-1.5 block text-[11.5px] leading-relaxed text-mist">
                    {option === "public" ? "Anyone can join." : "You approve who joins."}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-2.5 text-[11.5px] leading-relaxed text-mist">{VISIBILITY_EXPLAINED}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">Public to start — the safer mistake, and changeable.</p>
        </div>

        {/* ---- When ------------------------------------------------------- */}
        <div>
          {/* THE WORDING FOLLOWS THE SUBJECT. A group about a community of
              people is not "on the mountain" on any date, and a screen reader
              reads the label out as written. */}
          <p className="section-label">{destination ? "When you mean to go" : "When it happens"}</p>
          <DateField
            className="mt-2"
            label={
              destination
                ? `The date this group means to be on ${destination.name}`
                : "The date this group means to go"
            }
            value={day}
            onChange={setDay}
            min={todayKey()}
            placeholder="Not decided"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">Optional.</p>
        </div>
      </div>

      {/* ---- Create ------------------------------------------------------- */}
      <div className="border-t border-hairline pt-4">
        <Button
          className="w-full"
          disabled={!ready || blocked !== null || actions.busy}
          onClick={async () => {
            const id = await actions.create({
              name: trimmed,
              destinationId: destination?.id ?? null,
              topic: subject?.kind === "topic" ? subject.label : null,
              /* With a destination the server derives this from that row and
                 refuses a word that disagrees with it, so it is left alone.
                 Without one, nobody has been asked what sort of subject it is
                 — "other" is what ICEFALL actually knows. */
              about: destination ? aboutForKind(destination.kind) : "other",
              visibility,
              intendedOn: day.length > 0 ? day : undefined,
            });
            // `create` returns the id the server sent back, not the absence of
            // an error. Nothing is reported as made without it.
            if (id === null) return;
            setMade({ id, name: trimmed, visibility });
            onCreated?.();
          }}
        >
          {actions.busy ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Creating…
            </>
          ) : (
            <>
              <Plus size={15} strokeWidth={1.8} aria-hidden="true" /> Create group
            </>
          )}
        </Button>

        {/* THE REASON AT THE CONTROL, never in a header. A disabled button with
            its explanation somewhere above reads as a half-built feature. */}
        {blocked !== null && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-mist">{blocked}</p>
        )}
        {blocked === null && !ready && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-mist-dim">
            Give the group a name.
          </p>
        )}
        {actions.error && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-mist">{actions.error}</p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The merged page, kept                                                       */
/* -------------------------------------------------------------------------- */

/**
 * THE PH-08 MERGED PAGE — no longer rendered.
 *
 * "Mountains you want to climb" plus "Your groups", built when People and
 * Groups were one screen. The owner's mockups supersede that layout, and the
 * Groups tab above is what they draw.
 *
 * KEPT, NOT DELETED, because "add a mountain and see who else wants it" is a
 * feature the owner asked for in as many words and it works — the server write
 * path, the interest list and every failure sentence are real. Whether it comes
 * back as its own screen is their call, not a side effect of a redesign. If the
 * answer is no, delete this and everything below it that only it uses.
 */
export function PeopleAndGroupsMerged() {
  return (
    <Screen>
      <Stagger className="pt-5">
        <Rise>
          <h2 className="display text-[34px] text-snow">Find your people.</h2>
          <p className="mt-2.5 max-w-[36ch] text-[13px] leading-relaxed text-mist">
            Add the mountains you want to climb, see who else wants them, and plan the party you go
            with.
          </p>
        </Rise>

        <MountainsSection />

        {/* "Your groups" used to sit here. It drew groups saved on one phone,
            which nobody can start any more — see the note where it stood. */}

        {/* PEOPLE IS ITS OWN TAB AGAIN. It was fused in here under the old
            PH-08 note ("People and groups need to be one page together"); the
            owner's 1:1 mockups supersede that and draw them separately, and
            the backlog entry has been updated to say so. */}

        {/* Drawn ONCE, at the end, where it covers everything above it. Both
            halves used to carry their own copy of this; two of them on one page
            is how a safety notice becomes furniture. */}
        <Rise className="pt-8">
          <SectionLabel>Before you meet anyone</SectionLabel>
        </Rise>
        <Rise className="pt-3">
          <Disclaimer>{SAFETY_REMINDER}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* 1 — Mountains you want to climb                                             */
/* -------------------------------------------------------------------------- */

/**
 * The public half.
 *
 * Everything drawn here came back from `public.groups` on this request. The
 * mountains offered in the picker are the ones ICEFALL can resolve to a real
 * `destinations` row, because a list filed against a peak the database cannot
 * place is a list nobody else will ever find.
 */
function MountainsSection() {
  const { state, reload } = useSharedGroups();
  const goal = usePrimaryGoal();

  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<InterestFailure | null>(null);
  const [done, setDone] = useState<{ peak: string; how: "created" | "joined" | "already" } | null>(
    null,
  );

  const ready = state.status === "ready";
  const groups = useMemo(() => (state.status === "ready" ? state.groups : []), [state]);

  const mine = useMemo(() => groups.filter((g) => g.joinedByMe), [groups]);
  const others = useMemo(() => groups.filter((g) => !g.joinedByMe), [groups]);

  /** From the picker: a peak NAME, which has to resolve to a destination. */
  const add = useCallback(
    async (peakName: string) => {
      setBusy(peakName);
      setFailure(null);
      setDone(null);
      const result = await addMountainInterest(peakName);
      setBusy(null);
      if (!result.ok) {
        setFailure(result.reason);
        return;
      }
      setDone({ peak: peakName, how: result.how });
      setPicking(false);
      reload();
    },
    [reload],
  );

  /**
   * From a list already on screen: its id, never its name. A group may be
   * called anything within 80 characters, and re-resolving that string to a
   * mountain would refuse to join a row the server has just drawn.
   */
  const join = useCallback(
    async (group: MountainGroup) => {
      setBusy(group.id);
      setFailure(null);
      setDone(null);
      const result = await joinMountainGroup(group.id);
      setBusy(null);
      if (!result.ok) {
        setFailure(result.reason);
        return;
      }
      setDone({ peak: group.name, how: result.how });
      reload();
    },
    [reload],
  );

  const leave = useCallback(
    async (group: MountainGroup) => {
      setBusy(group.id);
      setFailure(null);
      setDone(null);
      const result = await removeMountainInterest(group.id);
      setBusy(null);
      if (!result.ok) {
        setFailure(result.reason);
        return;
      }
      reload();
    },
    [reload],
  );

  return (
    <>
      <Rise className="pt-7">
        <SectionLabel>Mountains you want to climb</SectionLabel>
      </Rise>

      <Rise className="pt-3">
        {/* A definition rather than a promise. The sentence has to stay true
            in the states where nothing can be added — a lead-in that says
            "adding a mountain puts you on its list" sitting directly above
            "the list is not live yet" is the screen contradicting itself. */}
        <p className="text-[13px] leading-relaxed text-mist">
          A mountain here is a public list of the people who want to climb it. It is not a plan and
          it commits you to nothing — no dates, no party, no reply owed to anybody.
        </p>
      </Rise>

      {state.status === "loading" && (
        <Rise className="pt-3">
          <Card>
            <div className="flex items-center gap-2.5 text-[12px] text-mist-dim">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              Asking the server which mountains people want.
            </div>
          </Card>
        </Rise>
      )}

      {/* Not-ready is never rendered as an empty list — see the module note in
          `@/network/interest`. Each reason gets its own sentence, because
          "sign in" and "this is not built yet" are different problems with
          different next steps. */}
      {state.status !== "loading" && state.status !== "ready" && (
        <Rise className="pt-3">
          <SharedUnavailable
            state={state}
            footnote="The rest of this page is unaffected: the group you plan under “Your groups” is held on this device and has never needed a server."
          />
        </Rise>
      )}

      {ready && mine.length > 0 && (
        <div className="space-y-3 pt-3">
          {mine.map((group) => (
            <Rise key={group.id}>
              <MountainRow
                group={group}
                busy={busy === group.id}
                onLeave={() => void leave(group)}
              />
            </Rise>
          ))}
        </div>
      )}

      {ready && mine.length === 0 && !picking && (
        <Rise className="pt-3">
          <Card>
            <span
              aria-hidden="true"
              className="grid h-11 w-11 place-items-center rounded-full border border-dashed border-hairline-strong text-mist-dim"
            >
              <MountainIcon size={18} strokeWidth={1.4} />
            </span>
            <p className="mt-4 text-[14px] text-snow">You have not added a mountain yet</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
              {others.length > 0
                ? `${others.length === 1 ? "One mountain has" : `${others.length} mountains have`} a list already — they are below. Add one of your own and the people who want it can find you.`
                : "Nobody has added one yet, so there is nothing to join. Being first is a real state of affairs rather than an empty screen."}
            </p>
            <Button className="mt-4 w-full" onClick={() => setPicking(true)}>
              <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
              Add a mountain
            </Button>
          </Card>
        </Rise>
      )}

      {picking && (
        <Rise className="pt-3">
          <MountainPicker
            busyPeak={busy}
            suggested={goal?.name ?? null}
            /* Only a group filed against a catalogue row can make a peak
               "already taken" — one about something else takes none. */
            takenIds={new Set(mine.flatMap((g) => (g.destinationId === null ? [] : [g.destinationId])))}
            onPick={(name) => void add(name)}
            onClose={() => setPicking(false)}
          />
        </Rise>
      )}

      {!picking && ready && mine.length > 0 && (
        <Rise className="pt-3">
          <Button variant="secondary" className="w-full" onClick={() => setPicking(true)}>
            <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
            Add another mountain
          </Button>
        </Rise>
      )}

      {done && (
        <Rise className="pt-3">
          <p className="text-[12px] leading-relaxed text-azure">
            {done.how === "created"
              ? `You are the first on the ${done.peak} list. Anyone who adds it from now on joins you.`
              : done.how === "joined"
                ? `Added. You are on the ${done.peak} list with everyone else who wants it.`
                : `You were already on the ${done.peak} list, so nothing changed.`}
          </p>
        </Rise>
      )}

      {failure && (
        <Rise className="pt-3">
          <InterestFailureNote reason={failure} />
        </Rise>
      )}

      {/* Other people's lists. This is the one place on the page where somebody
          who is not the athlete can appear, and every name in it came from the
          server. */}
      {ready && others.length > 0 && (
        <>
          <Rise className="pt-7">
            <SectionLabel>Mountains other people want · {others.length}</SectionLabel>
          </Rise>
          <div className="space-y-3 pt-3">
            {others.map((group) => (
              <Rise key={group.id}>
                <MountainRow
                  group={group}
                  busy={busy === group.id}
                  onJoin={() => void join(group)}
                />
              </Rise>
            ))}
          </div>
        </>
      )}

      <Rise className="pt-4">
        <Disclaimer>{INTEREST_VISIBLE_NOTICE}</Disclaimer>
      </Rise>
    </>
  );
}

/**
 * One mountain and the people on its list.
 *
 * The count is `member_count` from the row and nothing else. Where it did not
 * arrive the card says so rather than printing a zero — a group always has at
 * least the person who started it, so a zero here would be visibly false and
 * an invisible lie everywhere else.
 */
function MountainRow({
  group,
  busy,
  onJoin,
  onLeave,
}: {
  group: MountainGroup;
  busy: boolean;
  onJoin?: () => void;
  onLeave?: () => void;
}) {
  const [open, setOpen] = useState(false);

  // The catalogue entry, where ICEFALL has one, only to draw the mountain and
  // its height. Nothing about the list itself is read from local data.
  const mountain = useMemo(
    () => MOUNTAINS.find((m) => m.id === group.destinationId) ?? null,
    [group.destinationId],
  );

  const count = group.memberCount;
  const others = count === null ? null : Math.max(0, count - (group.joinedByMe ? 1 : 0));

  return (
    <Card>
      <div className="flex items-start gap-3.5">
        <MountainThumb
          peak={{
            name: group.name,
            elevationM: mountain?.elevationM,
            lat: mountain?.coords.lat,
            lon: mountain?.coords.lon,
          }}
          size={48}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-snow">{group.name}</p>
          <p className="tnum mt-1 text-[12px] text-mist">
            {mountain ? `${fmtElevation(mountain.elevationM)} m · ` : ""}
            {count === null
              ? "Number interested not available"
              : count === 1
                ? "1 person interested"
                : `${count} people interested`}
          </p>
          {group.intendedOn && (
            <p className="tnum mt-0.5 text-[11px] text-mist-dim">
              Aiming for {fmtDate(group.intendedOn)}
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3.5 flex w-full items-center gap-2 text-left text-[12px] text-mist transition-colors hover:text-snow"
      >
        <Users size={14} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-mist-dim" />
        <span className="flex-1">
          {others === null
            ? "See who is on this list"
            : others === 0
              ? group.joinedByMe
                ? "Only you so far"
                : "Nobody on this list yet"
              : `See who else wants it${group.joinedByMe ? ` · ${others} besides you` : ""}`}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.8}
          aria-hidden="true"
          className={cn("shrink-0 text-mist-dim transition-transform", open && "rotate-180")}
        />
      </button>

      {open && <InterestedList groupId={group.id} />}

      {onJoin && (
        <Button size="sm" className="mt-4 w-full" onClick={onJoin} disabled={busy}>
          {busy ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Adding…
            </>
          ) : (
            <>
              <UserPlus size={14} strokeWidth={1.8} aria-hidden="true" /> Add this mountain
            </>
          )}
        </Button>
      )}

      {onLeave && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4 w-full"
          onClick={onLeave}
          disabled={busy}
        >
          {busy ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Leaving…
            </>
          ) : (
            <>
              <UserMinus size={14} strokeWidth={1.8} aria-hidden="true" /> Remove from my mountains
            </>
          )}
        </Button>
      )}
    </Card>
  );
}

/**
 * The members of one list, fetched when it is opened rather than on page load.
 *
 * Loaded lazily on purpose: a page with a dozen mountains on it would otherwise
 * fire a dozen membership requests nobody asked for, and the count on the card
 * already answers the question most people have.
 */
function InterestedList({ groupId }: { groupId: string }) {
  const [people, setPeople] = useState<InterestedPerson[] | null>(null);
  const [namesReadable, setNamesReadable] = useState(true);
  const [failure, setFailure] = useState<InterestFailure | null>(null);

  useEffect(() => {
    let alive = true;
    setPeople(null);
    setFailure(null);
    void loadInterestedPeople(groupId).then((result) => {
      if (!alive) return;
      if (!result.ok) {
        setFailure(result.reason);
        return;
      }
      setPeople(result.people);
      setNamesReadable(result.namesReadable);
    });
    return () => {
      alive = false;
    };
  }, [groupId]);

  if (failure) {
    return (
      <div className="mt-3">
        <InterestFailureNote reason={failure} />
      </div>
    );
  }

  if (people === null) {
    return (
      <div className="mt-3 flex items-center gap-2.5 text-[12px] text-mist-dim">
        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
        Reading the list.
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
        Nobody is on this list. That is the server's answer, not a placeholder.
      </p>
    );
  }

  return (
    /* NOT A PANEL. The loading and empty answers directly above are already
       type on the page; a box around the third answer said only "these lines
       belong together", and the avatar column already aligns the list. */
    <div className="mt-3">
      {namesReadable ? (
        <ul className="space-y-2.5">
          {people.map((person) => (
            <li key={person.profileId} className="flex items-center gap-2.5">
              <Avatar name={person.name ?? "?"} size={28} />
              <div className="min-w-0 flex-1">
                {/* No name is not "Someone" — writing a placeholder name for a
                    real person is ICEFALL naming them on their behalf. */}
                <p className="truncate text-[13px] text-snow">
                  {person.name ?? "This person has not set a name"}
                </p>
                {person.username && (
                  <p className="truncate text-[11px] text-mist-dim">@{person.username}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] leading-relaxed text-mist">
          {people.length === 1 ? "One person is" : `${people.length} people are`} on this list, but
          ICEFALL could not read their names just now. The count is real; the names are missing
          rather than absent.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">Wanting the same mountain is all this says about anybody.</p>
    </div>
  );
}

/**
 * One catalogue row, in a line.
 *
 * A trek is drawn as a trek. Its `region` is a slug in the catalogue ("alps"),
 * so the country is used instead — printing a slug at somebody is showing them
 * a database, and a trek has no elevation to show because a trek has no summit.
 */
function destinationDetail(destination: GroupDestination): string {
  if (destination.kind === "trek") {
    return destination.country ? `Trek · ${destination.country}` : "Trek";
  }
  const parts: string[] = [];
  if (destination.elevationM !== null) parts.push(`${fmtElevation(destination.elevationM)} m`);
  const where = destination.range ?? destination.country;
  if (where) parts.push(where);
  return parts.join(" · ");
}

/**
 * The server's catalogue as rows, or the one sentence that says why there are
 * none. Every absence keeps its own words — see `groups/mountains.ts`.
 */
function CatalogueList({
  state,
  matches,
  onPick,
}: {
  state: DestinationsState;
  matches: GroupDestination[];
  onPick: (destination: GroupDestination) => void;
}) {
  if (state.status === "loading") {
    return (
      <p className="px-4 py-4 text-[12px] leading-relaxed text-mist-dim">
        Reading ICEFALL's catalogue of places…
      </p>
    );
  }
  if (state.status !== "ready") {
    return <p className="px-4 py-4 text-[12px] leading-relaxed text-mist">{state.message}</p>;
  }
  if (matches.length === 0) {
    return (
      <p className="px-4 py-4 text-[12px] leading-relaxed text-mist">
        Nothing in ICEFALL's catalogue matches that.
      </p>
    );
  }
  return (
    <ul>
      {matches.map((destination) => {
        // The app draws 14 of the server's 52 mountains, so most rows have no
        // photograph here. That is the ordinary case and not a gap to fill.
        const app = appPeakFor(destination.id);
        return (
          <li key={destination.id}>
            <button
              type="button"
              onClick={() => onPick(destination)}
              className="flex w-full items-center gap-3 border-b border-hairline px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-white/[0.02]"
            >
              {app && (
                <MountainThumb
                  peak={{
                    name: app.name,
                    elevationM: app.elevationM,
                    lat: app.coords.lat,
                    lon: app.coords.lon,
                  }}
                  size={36}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-snow">{destination.name}</span>
                <span className="tnum mt-0.5 block truncate text-[11px] text-mist-dim">
                  {destinationDetail(destination)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The picker, in its two modes.
 *
 * WITHOUT `catalogue` it is what it has always been: the app's own 14 peaks,
 * handing back a NAME, for the parked interest lists.
 *
 * WITH `catalogue` it offers the SERVER's list — every mountain and every trek
 * in `destinations` — and hands back the row itself. That difference is the
 * whole of risk R14: the app's catalogue is not the server's, three of the
 * app's peaks have no row there at all, and 41 of the server's mountains are
 * missing from the app (counted by `npm run test:groups-mountain-lists`). A
 * create form built on the app's list would offer three peaks that cannot be
 * saved and hide the Ama Dablams that can.
 *
 * NOTHING FALLS BACK. Where the catalogue cannot be read the picker says so in
 * one sentence and offers the other honest route — a group with its own subject
 * — rather than quietly showing a list that would be refused at the last tap.
 */
function MountainPicker({
  busyPeak,
  suggested,
  takenIds,
  onPick,
  onClose,
  title,
  intro,
  footer,
  catalogue,
  onPickDestination,
  onSubject,
}: {
  busyPeak: string | null;
  /** The athlete's own objective, floated to the top. Never an invented pick. */
  suggested: string | null;
  takenIds: ReadonlySet<string>;
  /** The app's own catalogue mode. Required there, unused with `catalogue`. */
  onPick?: (peakName: string) => void;
  onClose: () => void;
  /*
   * THREE COPY OVERRIDES, AND THEY EXIST SO THERE IS ONLY ONE PICKER.
   *
   * The create flow picks a mountain for a different reason than the interest
   * list does — one files a group against a peak, the other puts you on its
   * list "straight away" — and the sentences below said the second thing in
   * both places. A second picker component would have drifted from this one on
   * the day the catalogue rule changed, which is the failure the whole
   * `destinationIdForPeak` note warns about. Every default is exactly what this
   * file rendered before, so the parked interest section is untouched.
   */
  title?: string;
  intro?: string;
  /** `null` hides the footer entirely; undefined keeps the default. */
  footer?: React.ReactNode;
  /**
   * The server's catalogue. Given it, the picker offers those rows instead of
   * the app's, and `onPickDestination` is what answers.
   */
  catalogue?: DestinationsState;
  onPickDestination?: (destination: GroupDestination) => void;
  /**
   * The group's subject in its own words. `""` means "not about a place at
   * all", which is a real answer and not a skipped question.
   */
  onSubject?: (label: string) => void;
}) {
  const [query, setQuery] = useState("");

  const serverOptions = useMemo(() => {
    if (!catalogue || catalogue.status !== "ready") return [];
    return catalogue.destinations.filter((d) => destinationMatches(d, query));
  }, [catalogue, query]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = MOUNTAINS.filter(
      (m) =>
        q.length === 0 ||
        m.name.toLowerCase().includes(q) ||
        m.range.toLowerCase().includes(q) ||
        m.country.toLowerCase().includes(q),
    );
    if (!suggested) return matching;
    const wanted = suggested.trim().toLowerCase();
    return [...matching].sort((a, b) => {
      const av = a.name.toLowerCase() === wanted ? 0 : 1;
      const bv = b.name.toLowerCase() === wanted ? 0 : 1;
      return av - bv;
    });
  }, [query, suggested]);

  return (
    <Card inset={false}>
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
        <MountainIcon size={15} strokeWidth={1.6} className="shrink-0 text-mist-dim" />
        <span className="flex-1 text-[13px] text-snow">{title ?? "Add a mountain"}</span>
        <button
          type="button"
          onClick={onClose}
          className="section-label shrink-0 text-mist-dim transition-colors hover:text-snow"
        >
          Close
        </button>
      </div>

      <div className="px-4 py-3">
        <p className="text-[11px] leading-relaxed text-mist-dim">
          {intro ??
            "These are the mountains ICEFALL can place against a real record, which is what a shared list has to be filed against. Picking one puts you on its list straight away."}
        </p>

        <label className="mt-3 block">
          <span className="sr-only">Search the catalogue</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the catalogue"
            className="w-full rounded-tile border border-hairline bg-white/[0.02] px-3 py-2.5 text-[13px] text-snow placeholder:text-mist-dim focus:border-azure/50 focus:outline-none"
          />
        </label>
      </div>

      <div className="max-h-[19rem] overflow-y-auto border-t border-hairline">
        {catalogue ? (
          <CatalogueList
            state={catalogue}
            matches={serverOptions}
            onPick={(destination) => onPickDestination?.(destination)}
          />
        ) : options.length === 0 ? (
          <p className="px-4 py-4 text-[12px] leading-relaxed text-mist">
            No mountain in the catalogue matches that. ICEFALL can only file a list against a
            mountain it can place, so nothing is offered here that it cannot.
          </p>
        ) : (
          <ul>
            {options.map((mountain) => {
              const already = takenIds.has(mountain.id);
              const busy = busyPeak === mountain.name;
              const detail = `${fmtElevation(mountain.elevationM)} m · ${mountain.range}`;

              const body = (
                <>
                  <MountainThumb
                    peak={{
                      name: mountain.name,
                      elevationM: mountain.elevationM,
                      lat: mountain.coords.lat,
                      lon: mountain.coords.lon,
                    }}
                    size={36}
                  />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[13px] text-snow">{mountain.name}</span>
                    <span className="tnum mt-0.5 block truncate text-[11px] text-mist-dim">
                      {already ? `Already on your list · ${detail}` : detail}
                    </span>
                  </span>
                  {busy && <Loader2 size={14} className="animate-spin text-mist-dim" />}
                </>
              );

              const shell =
                "flex w-full items-center gap-3 border-b border-hairline px-4 py-3 text-left transition-colors last:border-b-0";

              return (
                <li key={mountain.id}>
                  <button
                    type="button"
                    onClick={() => onPick?.(mountain.name)}
                    disabled={already || busyPeak !== null}
                    className={cn(
                      shell,
                      already || busyPeak !== null ? "opacity-50" : "hover:bg-white/[0.02]",
                    )}
                  >
                    {body}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/*
       * THE OTHER HONEST ROUTE, and the reason the picker is no longer a wall.
       * The owner's ruling is that a group need not be about a mountain: it can
       * be about a region, a community of people, or a peak ICEFALL has no
       * record of. Those become the group's own subject, which is a label and
       * never a place — nothing is linked to it and nothing is drawn from it.
       */}
      {onSubject && (
        <div className="border-t border-hairline px-4 py-3">
          <p className="text-[11px] leading-relaxed text-mist-dim">
            A group does not have to be about a place in the catalogue.
          </p>
          {query.trim().length > 0 && query.trim().length <= MAX_GROUP_TOPIC && (
            <button
              type="button"
              onClick={() => onSubject(query.trim())}
              className="mt-2 block w-full truncate rounded-tile border border-hairline px-3 py-2.5 text-left text-[13px] text-snow transition-colors hover:border-hairline-strong"
            >
              Make this group about “{query.trim()}”
            </button>
          )}
          <button
            type="button"
            onClick={() => onSubject("")}
            className="section-label mt-2 block text-mist-dim transition-colors hover:text-snow"
          >
            Nothing in particular
          </button>
        </div>
      )}

      {footer === undefined ? (
        <div className="border-t border-hairline px-4 py-3">
          <p className="text-[11px] leading-relaxed text-mist-dim">
            Climbing something outside this catalogue?{" "}
            <Link to="/social/groups/new" className="text-azure">
              Start a group for it
            </Link>{" "}
            — a group can carry its own subject, with or without a place from here.
          </p>
        </div>
      ) : (
        footer
      )}
    </Card>
  );
}

/**
 * Why the shared lists are not showing.
 *
 * Four different absences, four different sentences, and not one of them is
 * "no groups found". The state the athlete is in decides what they can do next,
 * so collapsing these would leave somebody tapping a button that was never
 * going to work.
 */
function SharedUnavailable({
  state,
  footnote,
}: {
  state: Exclude<SharedGroups, { status: "ready" } | { status: "loading" }>;
  /**
   * WHAT IS STILL WORKING ON *THIS* PAGE, and it is not the same page twice.
   *
   * The parked `MountainsSection` draws a "Your groups" list below itself, so
   * there the honest reassurance is that the device-held plan under it is fine.
   * The live Groups screen has no such section — pointing somebody at one there
   * would send them looking for a list that is not on the screen, which is the
   * same class of untruth as an invented count. Each caller says what is true
   * where it stands.
   */
  footnote: string;
}) {
  if (state.status === "signed-out") {
    return (
      <Card>
        <p className="text-[14px] text-snow">Sign in to see who wants your mountains</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
          A list is per person — it has to know who you are before it can put you on one, and before
          it can show you anybody else. Nothing about you is shared until you add a mountain.
        </p>
        <Button asChild variant="secondary" className="mt-4 w-full">
          <Link to="/auth/signin">Sign in</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Users size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
        <div className="min-w-0">
          <p className="text-[13px] text-snow">
            {state.status === "unreachable"
              ? "ICEFALL could not reach the server"
              : "Shared mountains are not live yet"}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
            {state.status === "unreachable"
              ? SHARED_GROUPS_UNREACHABLE
              : state.status === "no-backend"
                ? "This build has no server connection at all, so there is no shared list to read."
                : SHARED_GROUPS_NOT_LIVE}
          </p>
          <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">{footnote}</p>
        </div>
      </div>
    </Card>
  );
}

/** One sentence per way a write can fail. Never "something went wrong". */
function InterestFailureNote({ reason }: { reason: InterestFailure }) {
  const text =
    reason === "signed-out"
      ? "You are signed out, so nothing was written. Sign in and the mountain can go on your list."
      : reason === "no-backend"
        ? "This build has no server connection, so nothing was written and no list exists to write to."
        : reason === "unknown-mountain"
          ? "ICEFALL could not place that mountain against a real record, so it did not file you against a peak it had to guess."
          : reason === "not-provisioned"
            ? SHARED_GROUPS_NOT_LIVE
            : reason === "unreachable"
              ? SHARED_GROUPS_UNREACHABLE
              : "The server refused it and nothing was written. Nothing about your lists has changed.";

  return <p className="text-[12px] leading-relaxed text-mist">{text}</p>;
}

/* -------------------------------------------------------------------------- */
/* 2 — Your groups: GONE, AND NOT AS DEAD CODE                                 */
/* -------------------------------------------------------------------------- */

/*
 * `YourGroupsSection`, `Filters`, `Facet` and `Pill` were deleted in slice S7,
 * and this note is here so nobody restores them from git believing they were
 * lost by accident with the rest of the parked page.
 *
 * They listed, filtered and offered to create an `Expedition` — a group saved
 * on one phone. Structure plan D1 makes a group one thing, a row in
 * `public.groups`, and D7 says no new group can be started on the phone alone.
 * So that section's "Create a group" pointed at a form that no longer exists,
 * its copy ("stored on this device", "opens a workspace to plan it in")
 * described a screen that has been retired, and `GroupCard`, which drew each
 * row, is retired with it (structure plan §2.5).
 *
 * WHAT IS PARKED IS STILL PARKED. The half of this page the guard block at the
 * top of this file protects — "add a mountain, see who else wants it":
 * `MountainsSection`, `MountainRow`, `InterestedList`, `CatalogueList` and
 * `MountainPicker` — is untouched and still works.
 *
 * AND PHONE GROUPS ARE NOT GONE. They are read-only on the Groups tab and at
 * `/social/groups/expedition-…`, each with one tap that moves it to the
 * account (structure plan §2).
 */
