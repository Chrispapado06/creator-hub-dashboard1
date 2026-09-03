/* ============================================================================
 * ⚠ READ THIS BEFORE EDITING. Four things in this file will cost you hours if
 * you meet them by surprise. Written 2026-09-02 by the session handing it over.
 *
 * 1. LINES ~152-409 ARE A 1:1 MOCKUP BUILD, NOT A DESIGN TO IMPROVE.
 *    The owner sent four mockup images and said "do it 1:1 even with same people
 *    images". Groups(), GroupsBody(), DemoGroupCard() and GroupCoverCard() are
 *    the result — the Discover/My Groups pills, the cover cards, the
 *    "1,240 members · 156 posts" line, the disabled Join. EXTEND these. Do not
 *    rebuild them. The owner checked the last build against the image and will
 *    check this one.
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
 * 3. EVERYTHING FROM ~LINE 411 DOWN IS PARKED, NOT ROT. `PeopleAndGroupsMerged`
 *    and its ~1000 lines (MountainsSection, InterestedList, MountainPicker,
 *    YourGroupsSection, Filters) are the old merged partner-finder: "add a
 *    mountain, see who else wants it". It WORKS. It is unreferenced because it
 *    awaits an owner decision that was asked for and never answered. DO NOT
 *    DELETE IT AS DEAD CODE. `noUnusedLocals` is false in this repo, so nothing
 *    here is compiler-caught — unreferenced has to be judged by eye, and this
 *    one has already been judged.
 *
 * 4. `DemoGroupCard` IS DEMO-GATED WITH `import.meta.env` SPELLED OUT INLINE so
 *    the bundler folds the branch away. Routing that flag through a shared
 *    constant defeats the fold and ships the invented "1,240 members" groups to
 *    production, beside real ones. Do not tidy it.
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
 * COUNTS ARE ABBREVIATED IN THE DRAWING — "1.2K members · 156 posts". The demo
 * card shipped "1,240 members"; theirs is better and `abbreviate` now does it.
 * ONLY on the demo cards: a real `member_count` is a measured number and is
 * printed whole, because rounding a group of 1,204 people to "1.2K" where the
 * exact figure is knowable is an invention for no reason.
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
 * A. THE CREATE FLOW IS INLINE, REACHED BY A FLOATING +. There is no route for
 *    it and there must not be: `/explore/groups/new` is `CreateExpedition`,
 *    which makes an `Expedition` — a plan held on THIS DEVICE. A group with a
 *    privacy setting is a row in `public.groups` on the server. Two different
 *    records, and pointing the new flow at the old route would have quietly
 *    made one of them the other. The + mirrors the Feed's compose button,
 *    portalled into the phone shell exactly as `Community.tsx` does it.
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
 *    depends entirely on `/explore/groups/:id`, which `GroupWorkspace` now
 *    dispatches — a LOCAL expedition id renders the planning workspace, a
 *    uuid-shaped one renders the server group's space. Before that dispatch
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
 * GONE, and a + now lives in ExploreLayout's ScreenHeader `action` slot —
 * beside "Explore", above the tab row, at the same altitude as search and
 * notifications. A create control below the Discover/My Groups pills reads as a
 * filter on the list it sits in rather than a way to add to it.
 *
 * IT TALKS TO THIS FILE THROUGH THE URL, not through shared state. The header
 * button navigates to `/explore/social?tab=groups&create=1`; THIS SCREEN must
 * open its create flow when it sees `create=1`, and clear the param when the
 * flow closes so a back-navigation does not reopen it. Nothing is plumbed
 * between the two components, and the flow becomes linkable for free.
 *
 * DO NOT re-add a floating +. It was mine, the owner has replaced it, and a
 * second entry point to the same form is how two of them drift apart.
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
  SlidersHorizontal,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";

import { Avatar, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { DateField } from "@/components/ui/DateField";
import { supabase } from "@/backend/client";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { GroupCard } from "@/components/network/GroupCard";
import { MountainThumb } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtDate, fmtElevation } from "@/lib/format";
import { MOUNTAINS } from "@/data/mock/mountains";
import { SAFETY_REMINDER } from "@/network/privacy";
import { destinationIdForPeak } from "@/enquiries/send";
import { DEMO_GROUPS, GROUPS_DEMO_NOTICE, type DemoGroup } from "@/social/demoGroups";
import {
  ACCEPTED_NOT_SEATED,
  MAX_GROUP_NAME,
  PRIVATE_MEANS_ASK,
  VISIBILITY_EXPLAINED,
  useGroupActions,
  type GroupVisibility,
} from "@/social/groupSpace";
import { EXPERIENCE_LABELS, type ExperienceLevel } from "@/network/types";
import {
  DATE_FILTER_LABELS,
  NO_FILTERS,
  SIZE_FILTER_LABELS,
  STYLE_FILTER_LABELS,
  activeFilterCount,
  anyFilterActive,
  matchesFilters,
  todayKey,
  type DateFilter,
  type GroupFilters,
  type SizeFilter,
  type StyleFilter,
} from "@/network/groups";
import {
  INTEREST_VISIBLE_NOTICE,
  SHARED_GROUPS_NOT_LIVE,
  SHARED_GROUPS_UNREACHABLE,
  addMountainInterest,
  joinMountainGroup,
  loadInterestedPeople,
  removeMountainInterest,
  useSharedGroups,
  type InterestFailure,
  type InterestedPerson,
  type MountainGroup,
  type SharedGroups,
} from "@/network/interest";
import { useApp, usePrimaryGoal } from "@/state/AppState";

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
/* Facet options                                                               */
/* -------------------------------------------------------------------------- */

const DATE_OPTIONS: DateFilter[] = ["any", "open-now", "next-90", "this-year", "passed"];
const SIZE_OPTIONS: SizeFilter[] = ["any", "pair", "small", "large"];
const STYLE_OPTIONS: StyleFilter[] = ["any", "guided", "independent", "not-recorded"];
const EXPERIENCE_OPTIONS: ExperienceLevel[] = ["beginner", "intermediate", "advanced", "expert"];

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
type GroupPrivacy =
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
function useGroupPrivacy(): { privacy: GroupPrivacy; reload: () => void } {
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

/**
 * GROUPS.
 *
 * The mockup: two pills, Discover and My Groups, then cards that are a wide
 * cover photo with the group's name across the bottom, a line of counts, and a
 * Join button on the right.
 *
 * ── WHAT THE MOCKUP DRAWS THAT THE ROW CANNOT ANSWER ────────────────────────
 * The drawing reads "1.2K members · 156 posts", and one of those two is real.
 *
 *   MEMBERS  `MountainGroup.memberCount` is the computed `member_count` on the
 *            row, and it is NULLABLE on purpose — a count that did not arrive
 *            is unknown. Where it is null the card says so rather than
 *            printing 0, which would tell somebody a group is empty when
 *            ICEFALL simply has not been told.
 *   POSTS    there is no post count on a group anywhere in this app, and no
 *            table to derive one from. It is not rendered. A second figure
 *            beside a real one borrows its credibility.
 *
 * The padlock the mockup puts on two cards is now REAL and no longer decorative:
 * `groups.visibility` arrived with 20260902220000, so a lock is drawn where the
 * server said private and nowhere else. Where that column cannot be read the
 * lock is left off and the card offers no join control at all, because a padlock
 * is a claim about who may get in — see `GroupPrivacy` and `GroupCoverCard`.
 *
 * ── THE COVER PHOTO IS THE MOUNTAIN'S OWN ───────────────────────────────────
 * `destinationId` is the peak's slug, so a group for Mont Blanc shows the Mont
 * Blanc photograph this app already holds. Nothing is matched by name or
 * guessed from the group's title — a group called "Denali Push 2026" gets
 * Denali because its row says Denali.
 */
export default function Groups() {
  const [scope, setScope] = useState<"discover" | "mine">("discover");
  const [creating, setCreating] = useState(false);

  /*
   * THE OTHER HALF OF THE HEADER CONTRACT, which the guard block above
   * describes and which nobody had written. `ExploreLayout`'s + navigates to
   * `?tab=groups&create=1`; this reads it, opens the flow, and CLEARS the param
   * immediately — with `replace`, so a back-navigation returns to wherever they
   * were rather than reopening the form they just closed.
   *
   * Through the URL rather than shared state, exactly as the contract says: the
   * two components stay ignorant of each other and the flow is linkable for
   * free.
   */
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get("create") !== "1") return;
    setCreating(true);
    const next = new URLSearchParams(params);
    next.delete("create");
    setParams(next, { replace: true });
  }, [params, setParams]);
  const { state, reload } = useSharedGroups();
  const { privacy, reload: reloadPrivacy } = useGroupPrivacy();

  /*
   * BOTH READS, TOGETHER. A join changes `joined_by_me` on the group row and a
   * request changes this reader's own ask — one write can move either, and a
   * card whose two halves disagree is a card that shows "Request to join"
   * beside "You are in this group".
   */
  const refresh = useCallback(() => {
    reload();
    reloadPrivacy();
  }, [reload, reloadPrivacy]);

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-24 pt-1">
        {/* ---- Discover / My Groups -------------------------------------- */}
        <Rise className="flex gap-2.5">
          {(["discover", "mine"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              className={cn(
                "h-11 flex-1 rounded-pill border text-[14px] transition-colors",
                scope === s
                  ? "border-azure/70 text-azure"
                  : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
              )}
            >
              {s === "discover" ? "Discover" : "My Groups"}
            </button>
          ))}
        </Rise>

        {/*
         * CALLED, NOT MOUNTED — and it has to be.
         *
         * `Stagger` animates its children through framer-motion variants, and
         * that only reaches elements that are its OWN children. Rendered as
         * `<GroupsBody />` the cards became children of GroupsBody instead, the
         * animate state never arrived, and every card sat at opacity 0: present
         * in the DOM, invisible on screen — the same failure the People tab hit
         * with a plain wrapper div. Calling it inlines the returned `Rise`
         * elements directly into `Stagger`. It holds no hooks, so this is safe.
         */}

        {/* MOUNTED, not called — unlike `GroupsBody` this one holds hooks (its
            own draft, its own `useGroupActions`). It is safe because the
            element inside `Rise` is not what `Stagger` animates: `Rise` is, and
            `Rise` is still a direct child. The rule is about what sits BETWEEN
            Stagger and Rise, and nothing does. */}
        {creating && (
          <Rise className="pt-4">
            <CreateGroupCard
              privacy={privacy}
              onClose={() => setCreating(false)}
              onCreated={() => {
                // The new group is one this person is in, so "My Groups" is
                // where it now is. Switching is the only way this screen can
                // show them the thing they just made.
                setScope("mine");
                refresh();
              }}
            />
          </Rise>
        )}

        {GroupsBody({ scope, state, privacy, onChanged: refresh })}
      </Stagger>

    </Screen>
  );
}

/**
 * The list, and every state it can honestly be in.
 *
 * Split out so each branch is visible at a glance: a group list that silently
 * renders empty is indistinguishable from one that failed to load, and this
 * screen must never be that.
 */
function GroupsBody({
  scope,
  state,
  privacy,
  onChanged,
}: {
  scope: "discover" | "mine";
  state: SharedGroups;
  privacy: GroupPrivacy;
  onChanged: () => void;
}) {
  /*
   * DISCOVER DOES NOT NEED AN ACCOUNT. Browsing signed-out used to show only
   * "Sign in to see who wants your mountains" — an empty screen that reads as
   * "groups aren't built". Discovering what exists is public; JOINING is what
   * needs to know who you are, and that is where the sign-in wall belongs.
   */
  if (scope === "discover") {
    const real = state.status === "ready" ? state.groups : [];

    if (DEMO_GROUPS.length === 0 && real.length === 0) {
      return (
        <Rise className="pt-4">
          <Card>
            <p className="text-[13px] leading-relaxed text-mist">
              No groups yet. A group appears here the moment somebody adds a mountain they want to
              climb.
            </p>
          </Card>
        </Rise>
      );
    }

    return (
      <>
        {DEMO_GROUPS.length > 0 && (
          <Rise className="pt-4">
            <Disclaimer>{GROUPS_DEMO_NOTICE}</Disclaimer>
          </Rise>
        )}
        {DEMO_GROUPS.map((g) => (
          <Rise key={g.id} className="pt-3">
            <DemoGroupCard group={g} />
          </Rise>
        ))}
        {real.map((g) => (
          <Rise key={g.id} className="pt-3">
            <GroupCoverCard group={g} privacy={privacy} onChanged={onChanged} />
          </Rise>
        ))}
      </>
    );
  }

  if (state.status === "loading") {
    return (
      <Rise className="pt-4">
        <Card>
          <p className="text-[13px] text-mist-dim">Loading groups…</p>
        </Card>
      </Rise>
    );
  }

  if (state.status !== "ready") {
    /* Every non-ready state, in one place. `SharedUnavailable` already spells
       out signed-out, no-backend, not-provisioned and unreachable separately —
       re-deriving that copy here is how two screens end up disagreeing about
       what went wrong. */
    return (
      <Rise className="pt-4">
        <SharedUnavailable
          state={state}
          /* The live screen has no "Your groups" list on it, so this says what
             is true here: Discover still draws, and a group made on this device
             is a different record that never went to a server. */
          footnote="Nothing you have done is lost. Discover still shows what this build can show, and the expeditions you plan on this device are a separate record that has never needed a server."
        />
      </Rise>
    );
  }

  const shown = state.groups.filter((g) => g.joinedByMe);

  if (shown.length === 0) {
    return (
      <Rise className="pt-4">
        <Card>
          <p className="text-[13px] leading-relaxed text-mist">
            You have not joined a group yet. Discover shows the mountains other people are
            gathering around.
          </p>
        </Card>
      </Rise>
    );
  }

  return shown.map((g) => (
    <Rise key={g.id} className="pt-3">
      <GroupCoverCard group={g} privacy={privacy} onChanged={onChanged} />
    </Rise>
  ));
}

/**
 * A placeholder group, drawn exactly as the mockup draws one — cover, lock,
 * member and post counts, Join.
 *
 * THE JOIN BUTTON IS DISABLED, and that is the honest rendering. There is no
 * groups backend, so a button that flipped to "Joined" would be recording a
 * membership nowhere and telling somebody they are in a party they are not in.
 * `GROUPS_DEMO_NOTICE` above the list says why, so the disabled state has its
 * reason on screen rather than looking broken.
 */
function DemoGroupCard({ group }: { group: DemoGroup }) {
  /*
   * "Request to join", not "Join", on the locked cards — the one place this
   * build knowingly diverges from the drawing. See §5 in the file header: a
   * private group cannot be joined, `group_members_insert` admits a self-insert
   * into a public group only, and a Join button there could do nothing but
   * raise. The padlock is the owner's own mark and stays exactly as drawn.
   */
  const label = group.private ? "Request to join" : "Join";

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-graphite">
      <div className="relative h-[132px] w-full bg-slate">
        <img
          src={group.cover}
          alt=""
          aria-hidden
          loading="lazy"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 scrim-bottom" />
        <p className="absolute bottom-3 left-4 right-4 flex items-center gap-1.5 text-[17px] text-snow">
          <span className="truncate">{group.name}</span>
          {group.private && <Lock size={13} strokeWidth={1.9} className="shrink-0 text-mist" />}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <p className="tnum min-w-0 truncate text-[12.5px] text-mist">
          {/* The mockup's own abbreviation — "1.2K members · 156 posts". */}
          {abbreviate(group.members)} members · {group.posts} posts
        </p>
        <button
          type="button"
          disabled
          aria-label={`${label} ${group.name} — this is a placeholder group and nobody can join it`}
          className="shrink-0 rounded-card border border-azure/40 px-5 py-2 text-[13.5px] text-azure/60"
        >
          {label}
        </button>
      </div>

      {/*
       * THE REASON AT THE CONTROL, not only in the notice above the list.
       *
       * `GROUPS_DEMO_NOTICE` sits above all four cards and scrolls off the top;
       * by the fourth card a reader sees a greyed-out button and nothing saying
       * why, which is the exact thing a disabled control must never be. Same
       * bordered line the real `GroupCoverCard` puts under its own row, so the
       * two kinds of card explain themselves the same way.
       */}
      <p className="border-t border-hairline px-4 py-3 text-[11.5px] leading-relaxed text-mist">
        A placeholder, shown to review this layout. There is no such group, so there is nothing to
        {group.private ? " ask to join" : " join"}.
      </p>
    </div>
  );
}

/**
 * "1,240" as "1.2K", which is how the owner's drawing writes it.
 *
 * Only ever applied to the demo cards. A real `member_count` is a measured
 * figure and is printed whole: rounding somebody's group of 1,204 people to
 * "1.2K" on a screen where the exact number is knowable is a small invention
 * for no reason, and the counts that need abbreviating are the invented ones.
 */
function abbreviate(n: number): string {
  if (n < 1000) return n.toLocaleString("en-GB");
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}K`;
}

/**
 * One real group, drawn as the mockup draws it — and with the ONE control the
 * database will actually accept.
 *
 * THE BUTTON IS DECIDED BY THE ROW, NEVER BY A DEFAULT. `group_members_insert`
 * takes a self-insert into a public group outright and into a private one only
 * behind an accepted request, so:
 *
 *   public                 Join
 *   private, never asked   Request to join, with `PRIVATE_MEANS_ASK` beside it
 *   private, asked         nothing to press — the founder has it
 *   private, accepted      Join, with `ACCEPTED_NOT_SEATED` saying why there is
 *                          still a tap: only this device can seat this person
 *   private, declined      nothing to press, and it says so rather than
 *                          offering an ask the primary key would collide with
 *   privacy unreadable     NO join control at all, with the reason at the
 *                          control — see the note on `GroupPrivacy`
 */
function GroupCoverCard({
  group,
  privacy,
  onChanged,
}: {
  group: MountainGroup;
  privacy: GroupPrivacy;
  onChanged: () => void;
}) {
  const actions = useGroupActions();
  const navigate = useNavigate();
  /*
   * WITNESSED OUTCOMES, not optimism. Each of these is set only after a write
   * the server acknowledged — `join` returns true on a real insert or on the
   * duplicate that means you were already in, `requestJoin` only on a row that
   * landed. Nothing here is a local mirror of a membership: the list is re-read
   * through `onChanged` and these two flags only carry the card until it
   * arrives.
   */
  const [justJoined, setJustJoined] = useState(false);
  const [justAsked, setJustAsked] = useState(false);

  // The peak's own photograph, by slug — never matched on the group's title.
  const mountain = MOUNTAINS.find((m) => m.id === group.destinationId);

  const joined = group.joinedByMe || justJoined;
  const visibility = privacy.status === "ready" ? (privacy.visibility.get(group.id) ?? null) : null;
  const ask = privacy.status === "ready" ? (privacy.asks.get(group.id) ?? null) : null;
  // Deployed-and-public, or a server with no privacy at all: both mean this
  // group can be joined outright, and the second is a fact rather than a guess.
  const openToAnyone = privacy.status === "not-deployed" || visibility === "public";
  const isPrivate = visibility === "private";
  const pending = isPrivate && (justAsked || ask === "pending");

  /*
   * WHETHER THIS CARD KNOWS WHICH DOOR THE GROUP HAS.
   *
   * `ready` WITH NO ENTRY FOR THIS GROUP COUNTS AS NOT KNOWING, and that is not
   * a theoretical case: the group list and this privacy list are two requests a
   * moment apart, so a group created between them is on one and not the other.
   * Without this the card would fall through every branch below and render an
   * empty space where the button goes, with nothing anywhere saying why.
   */
  const privacyKnown =
    privacy.status === "not-deployed" || (privacy.status === "ready" && visibility !== null);
  const unreadable = privacy.status !== "loading" && !privacyKnown;

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-graphite">
      <div className="relative h-[132px] w-full bg-slate">
        {mountain?.photo ? (
          <img
            src={mountain.photo}
            alt=""
            aria-hidden
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 scrim-bottom" />
        <p className="absolute bottom-3 left-4 right-4 flex items-center gap-1.5 text-[17px] text-snow">
          <span className="truncate">{group.name}</span>
          {/* The owner's own mark for private, and drawn ONLY where the server
              actually said private. An unread privacy setting gets no lock:
              a padlock is a claim about who may get in. */}
          {isPrivate && (
            <Lock size={13} strokeWidth={1.9} className="shrink-0 text-mist" aria-label="Private" />
          )}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <p className="tnum min-w-0 truncate text-[12.5px] text-mist">
          {/* Null is unknown, and says so. It is never rendered as zero. */}
          {group.memberCount === null
            ? "Member count not available"
            : `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}`}
          {group.intendedOn && ` · ${fmtDate(group.intendedOn)}`}
        </p>

        {joined ? (
          <span className="shrink-0 rounded-card border border-hairline px-5 py-2 text-[13.5px] text-mist-dim">
            Joined
          </span>
        ) : privacy.status === "loading" ? (
          /* No button until the answer is in. Drawing "Join" and swapping it
             for "Request to join" a moment later is how somebody taps the
             wrong one — and on a private group that tap can only raise. */
          <span className="flex shrink-0 items-center gap-2 px-2 py-2 text-[12.5px] text-mist-dim">
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            Checking
          </span>
        ) : unreadable ? (
          /* NO CONTROL AT ALL, and the sentence below the row says why. Neither
             button can be drawn honestly: one of the two would be refused by
             the database and this card cannot tell which. */
          null
        ) : pending ? (
          /* Not a disabled button. There is nothing for this person to press —
             the decision is somebody else's — and a greyed-out control would
             read as a feature that is not finished. */
          <span className="shrink-0 rounded-card border border-hairline px-5 py-2 text-[13.5px] text-mist-dim">
            Asked
          </span>
        ) : ask === "declined" ? (
          <span className="shrink-0 rounded-card border border-hairline px-5 py-2 text-[13.5px] text-mist-dim">
            Not accepted
          </span>
        ) : openToAnyone || ask === "accepted" ? (
          <button
            type="button"
            disabled={actions.busy}
            onClick={async () => {
              const ok = await actions.join(group.id);
              // NAVIGATED ONLY ON A WITNESSED JOIN. `join` returns true on an
              // insert the server took, or on the duplicate key that means the
              // membership was already there — both of which really do put this
              // person inside. A refusal leaves them here with the sentence.
              if (!ok) return;
              setJustJoined(true);
              /* §6: joining a public group opens it. The join was the decision
                 and a second tap is friction, and the group opens on its
                 details and its members rather than the conversation — who and
                 when matter more than the talk to somebody who has just walked
                 in. `GroupWorkspace` sends a uuid-shaped id to the server
                 group's space; see §7C before removing this. */
              navigate(`/explore/groups/${group.id}`);
            }}
            className="shrink-0 rounded-card bg-azure px-5 py-2 text-[13.5px] text-obsidian transition-colors hover:bg-azure-bright disabled:opacity-60"
          >
            {actions.busy ? "Joining…" : "Join"}
          </button>
        ) : isPrivate ? (
          <button
            type="button"
            disabled={actions.busy}
            onClick={async () => {
              const ok = await actions.requestJoin(group.id);
              if (ok) setJustAsked(true);
              // Refreshed either way: a refused ask is usually one that already
              // exists, and the re-read is what turns the card into "Asked" or
              // "Not accepted" instead of leaving the same button there.
              onChanged();
            }}
            className="shrink-0 rounded-card border border-azure/50 px-4 py-2 text-[13.5px] text-azure transition-colors hover:border-azure disabled:opacity-60"
          >
            {actions.busy ? "Asking…" : "Request to join"}
          </button>
        ) : null}
      </div>

      {/* One line under the row, and only where there is something true to put
          in it. The reason sits AT the control rather than in a header. */}
      {(actions.error ||
        unreadable ||
        (!joined && (pending || ask === "declined" || ask === "accepted" || isPrivate))) && (
        <p className="border-t border-hairline px-4 py-3 text-[11.5px] leading-relaxed text-mist">
          {actions.error
            ? actions.error
            : unreadable
              ? // No button was drawn at all, and this says why.
                //
                // NOT `GROUP_SPACE_UNREACHABLE` or `GROUP_SPACE_REFUSED`: both
                // of those are about a group that could not be OPENED, and this
                // group is open on the screen right now — its name, its
                // mountain and its member count all arrived. The one thing
                // missing is which door it has.
                privacy.status === "unknown" && privacy.reason === "unreachable"
                ? "ICEFALL could not reach the server, so it does not know whether this group is open to anyone or approved by whoever started it. It will not offer a button that might only fail — try again when you have signal."
                : "ICEFALL could not read whether this group is open to anyone or approved by whoever started it, so it is not offering a button that might only fail. Everything else on this card is real."
              : pending
                ? "You have asked to join. Whoever started this group decides, and ICEFALL cannot hurry them."
                : ask === "declined"
                  ? "Your request to join was not accepted, so this group's members and messages stay closed to you."
                  : ask === "accepted"
                    ? ACCEPTED_NOT_SEATED
                    : PRIVATE_MEANS_ASK}
        </p>
      )}
    </div>
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
 * START A GROUP: a mountain, a name, and who may get in.
 *
 * ── WHY THIS IS INLINE AND NOT A ROUTE ──────────────────────────────────────
 * `/explore/groups/new` already exists and makes an `Expedition` — the plan
 * held on this device, with its window, its party size and its checklist. This
 * makes a row in `public.groups`, which is on the server and which strangers
 * can find. Two records that share the word "group", and sending both through
 * one route is how somebody comes to believe their private plan was published.
 *
 * ── THE THREE THINGS THE DATABASE INSISTS ON ────────────────────────────────
 *   A MOUNTAIN. `destination_id` is NOT NULL and a trigger refuses a trek, so
 *   the peak is chosen first and from the catalogue ICEFALL can actually place.
 *   The picker is the one this file already has — a second one would drift.
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
function CreateGroupCard({
  privacy,
  onClose,
  onCreated,
}: {
  privacy: GroupPrivacy;
  onClose: () => void;
  onCreated: () => void;
}) {
  const actions = useGroupActions();
  const navigate = useNavigate();
  const goal = usePrimaryGoal();

  // The mountain comes first, so the picker is what opens.
  const [picking, setPicking] = useState(true);
  const [peakName, setPeakName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<GroupVisibility>("public");
  const [day, setDay] = useState("");
  const [made, setMade] = useState<{
    id: string;
    name: string;
    visibility: GroupVisibility;
  } | null>(null);

  /*
   * The single mapping from a peak's NAME to the slug the database takes,
   * imported rather than reimplemented — `network/interest.ts` carries the same
   * note. A second copy of that rule drifts and starts filing groups against
   * the wrong mountain.
   */
  const destinationId = peakName === null ? null : destinationIdForPeak(peakName);
  const mountain = useMemo(
    () => (destinationId === null ? null : (MOUNTAINS.find((m) => m.id === destinationId) ?? null)),
    [destinationId],
  );

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
      <Card>
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
            : "You are its first member. People can ask to join and you decide — its name and mountain are visible to everyone, its members and its messages are not."}
        </p>
        {/* The founder is seated by `groups_creator_joins`, an AFTER INSERT
            trigger, so they are genuinely in the group and this really does
            open. Same destination as a join — see §7C. */}
        <Button className="mt-4 w-full" onClick={() => navigate(`/explore/groups/${made.id}`)}>
          Open the group
        </Button>
        <Button variant="secondary" className="mt-2.5 w-full" onClick={onClose}>
          Not now
        </Button>
      </Card>
    );
  }

  /* ---- Which mountain --------------------------------------------------- */

  if (picking) {
    return (
      <MountainPicker
        title="Which mountain is this group for?"
        intro="A group in ICEFALL is about one mountain. These are the peaks it can file a group against — the server refuses a group that is not attached to a real one, so nothing outside this list is offered."
        footer={null}
        busyPeak={null}
        suggested={goal?.name ?? null}
        takenIds={NOTHING_TAKEN}
        onPick={(picked) => {
          setPeakName(picked);
          // Offered as a starting point in an editable field, never submitted
          // on somebody's behalf: the peak's name is what the next person
          // scanning the list has to recognise, and most groups are called it.
          setName((current) => (current.trim().length === 0 ? picked : current));
          setPicking(false);
        }}
        onClose={() => {
          // Backing out of the picker with nothing chosen closes the whole
          // flow — a create form with no mountain has nothing to show.
          if (peakName === null) onClose();
          else setPicking(false);
        }}
      />
    );
  }

  /* ---- The form --------------------------------------------------------- */

  const trimmed = name.trim();
  const ready = destinationId !== null && trimmed.length > 0 && trimmed.length <= MAX_GROUP_NAME;

  return (
    <Card inset={false}>
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
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

      <div className="space-y-5 px-4 py-4">
        {/* ---- Mountain ---------------------------------------------------- */}
        <div>
          <p className="section-label">Mountain</p>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="mt-2 flex w-full items-center gap-3 rounded-tile border border-hairline px-3 py-2.5 text-left transition-colors hover:border-hairline-strong"
          >
            {mountain && (
              <MountainThumb
                peak={{
                  name: mountain.name,
                  elevationM: mountain.elevationM,
                  lat: mountain.coords.lat,
                  lon: mountain.coords.lon,
                }}
                size={36}
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-snow">
                {mountain?.name ?? peakName ?? "Choose a mountain"}
              </span>
              {mountain && (
                <span className="tnum mt-0.5 block truncate text-[11px] text-mist-dim">
                  {fmtElevation(mountain.elevationM)} m · {mountain.range}
                </span>
              )}
            </span>
            <span className="section-label shrink-0 text-mist-dim">Change</span>
          </button>

          {/* Only reachable if the catalogue and the slug rule ever disagree.
              Said rather than swallowed: the create call would be refused for
              a reason nobody could see. */}
          {peakName !== null && destinationId === null && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-mist">
              ICEFALL could not place {peakName} against a real mountain record, so it will not file
              a group against a peak it had to guess. Choose another.
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
              className="mt-2 w-full rounded-tile border border-hairline bg-white/[0.02] px-3 py-2.5 text-[13px] text-snow placeholder:text-mist-dim focus:border-azure/50 focus:outline-none"
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
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
            Public is the starting point because it is the safer mistake: a group more open than you
            meant is something you can see and change, where one that is quietly closed just looks
            broken to everyone trying to join it.
          </p>
        </div>

        {/* ---- When ------------------------------------------------------- */}
        <div>
          <p className="section-label">When you mean to go</p>
          <DateField
            className="mt-2"
            label="The date this group means to be on the mountain"
            value={day}
            onChange={setDay}
            min={todayKey()}
            placeholder="Not decided"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
            Optional. Leave it out if the party has not fixed one — undecided is a normal state for
            a group on the day it is made, and ICEFALL will not put a guess in its place.
          </p>
        </div>
      </div>

      {/* ---- Create ------------------------------------------------------- */}
      <div className="border-t border-hairline px-4 py-4">
        <Button
          className="w-full"
          disabled={!ready || blocked !== null || actions.busy}
          onClick={async () => {
            if (destinationId === null) return;
            const id = await actions.create(
              trimmed,
              destinationId,
              visibility,
              day.length > 0 ? day : undefined,
            );
            // `create` returns the id the server sent back, not the absence of
            // an error. Nothing is reported as made without it.
            if (id === null) return;
            setMade({ id, name: trimmed, visibility });
            onCreated();
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
            {destinationId === null
              ? "Pick the mountain this group is for."
              : "Give the group a name."}
          </p>
        )}
        {actions.error && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-mist">{actions.error}</p>
        )}
      </div>
    </Card>
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

        <YourGroupsSection />

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
            takenIds={new Set(mine.map((g) => g.destinationId))}
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
      <div className="mt-3 rounded-tile border border-hairline bg-white/[0.015] p-3">
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
    <div className="mt-3 rounded-tile border border-hairline bg-white/[0.015] p-3">
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

      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
        Wanting the same mountain is all this says about anybody. ICEFALL has not checked anyone's
        experience, identity or safety — read the reminder at the end of this page before you
        arrange to meet.
      </p>
    </div>
  );
}

/**
 * The picker.
 *
 * ONLY MOUNTAINS ICEFALL CAN PLACE. `destinations` is what a list is filed
 * against, and this app can resolve exactly the catalogue in `@/data/mock/
 * mountains` to a real row there. Offering a free-text peak would produce a
 * list nobody else could ever find, so the honest limit is stated instead of
 * hidden behind a search box that quietly fails.
 *
 * It is only ever offered when the shared list is actually live. A picker that
 * opens when nothing can be written would be a control that exists to look
 * available; where the list is unavailable the section says so instead, and
 * points at the group you CAN create on this device.
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
}: {
  busyPeak: string | null;
  /** The athlete's own objective, floated to the top. Never an invented pick. */
  suggested: string | null;
  takenIds: ReadonlySet<string>;
  onPick: (peakName: string) => void;
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
}) {
  const [query, setQuery] = useState("");

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
          <span className="sr-only">Search mountains</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the catalogue"
            className="w-full rounded-tile border border-hairline bg-white/[0.02] px-3 py-2.5 text-[13px] text-snow placeholder:text-mist-dim focus:border-azure/50 focus:outline-none"
          />
        </label>
      </div>

      <div className="max-h-[19rem] overflow-y-auto border-t border-hairline">
        {options.length === 0 ? (
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
                    onClick={() => onPick(mountain.name)}
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

      {footer === undefined ? (
        <div className="border-t border-hairline px-4 py-3">
          <p className="text-[11px] leading-relaxed text-mist-dim">
            Climbing something outside this catalogue?{" "}
            <Link to="/explore/groups/new" className="text-azure">
              Create a group for it
            </Link>{" "}
            — that takes any peak the map can find, and stays on this device.
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
/* 2 — Your groups                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The parties this athlete is planning, on this device.
 *
 * A GROUP IS AN `Expedition` — the record, the creation flow and the membership
 * are the ones that already existed, and the workspace at /explore/groups/:id
 * is where one is actually planned. That rule is unchanged by the merge and by
 * the shared lists above: those are about a mountain, this is about a trip.
 *
 * There is no "Discover groups · 0" heading here any more. It used to state a
 * true zero, but on this page it would sit under a live list of mountains other
 * people want and read as a contradiction. Discovery moved to where discovery
 * actually happens; what is left is what is genuinely yours and genuinely
 * local, and the disclaimer at the end says so.
 */
function YourGroupsSection() {
  const { expeditions, groupStyle, objectives } = useApp();
  const goal = usePrimaryGoal();

  const [filters, setFilters] = useState<GroupFilters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The mountain facet is built from the groups that exist, so every option in
  // it returns something. A list of peaks nobody has a group for would be a
  // menu of dead ends dressed as a search.
  const peakNames = useMemo(
    () =>
      [...new Set(expeditions.map((e) => e.peakName))].sort((a, b) => a.localeCompare(b, "en-GB")),
    [expeditions],
  );

  const visible = useMemo(
    () => expeditions.filter((e) => matchesFilters(e, groupStyle[e.id], filters)),
    [expeditions, groupStyle, filters],
  );

  // Offered in the empty state as a starting point — the athlete's OWN
  // objective, never a mountain invented to make the screen look busy.
  const suggestedPeak = goal?.name ?? objectives.find((o) => !o.summitedAt)?.name ?? null;
  const createHref = suggestedPeak
    ? `/explore/groups/new?peak=${encodeURIComponent(suggestedPeak)}`
    : "/explore/groups/new";

  const filtering = anyFilterActive(filters);

  return (
    <>
      <Rise className="pt-8">
        <SectionLabel
          action={
            expeditions.length > 0 ? (
              <Button asChild variant="ghost" size="sm" className="-mr-2">
                <Link to="/explore/groups/new">
                  <Plus size={14} strokeWidth={1.8} aria-hidden="true" />
                  New
                </Link>
              </Button>
            ) : undefined
          }
        >
          {/* The count is what is on this device, and nothing else. */}
          Your groups · {expeditions.length}
        </SectionLabel>
      </Rise>

      <Rise className="pt-3">
        <p className="text-[13px] leading-relaxed text-mist">
          A group is a party forming around one mountain and one date window — the window, the size,
          the training you do together. This is where you build yours and plan it properly.
        </p>
      </Rise>

      {expeditions.length > 0 && (
        <Rise className="pt-3">
          <Filters
            filters={filters}
            peakNames={peakNames}
            open={filtersOpen}
            onOpen={() => setFiltersOpen((v) => !v)}
            onChange={setFilters}
          />
        </Rise>
      )}

      {expeditions.length === 0 ? (
        <Rise className="pt-3">
          <Card>
            <p className="text-[14px] text-snow">You have not created a group yet</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
              Creating one records the mountain, the window and the party you want on this device,
              and opens a workspace to plan it in. It is not published: a plan is yours, and the
              mountains above are the public part of this page.
            </p>
            <Button asChild variant="secondary" className="mt-4 w-full">
              <Link to={createHref}>
                <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
                Create a group
              </Link>
            </Button>
          </Card>
        </Rise>
      ) : visible.length === 0 ? (
        <Rise className="pt-3">
          {/* A real search over real data came back empty. Said in exactly
              those terms, because it is the one empty state on this page that a
              filter genuinely caused. */}
          <Card>
            <p className="text-[14px] text-snow">
              None of your {expeditions.length} {expeditions.length === 1 ? "group" : "groups"} match
              these filters
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
              This one really is a filtered list of what you have — nothing has been hidden from
              you.
            </p>
            <Button variant="secondary" className="mt-4 w-full" onClick={() => setFilters(NO_FILTERS)}>
              Clear filters
            </Button>
          </Card>
        </Rise>
      ) : (
        <>
          {filtering && (
            <Rise className="pt-3">
              <p className="tnum text-[11px] text-mist-dim">
                Showing {visible.length} of {expeditions.length}.
              </p>
            </Rise>
          )}
          {visible.map((group) => (
            <Rise key={group.id} className="pt-3">
              <GroupCard group={group} style={groupStyle[group.id]} to={`/explore/groups/${group.id}`} />
            </Rise>
          ))}
        </>
      )}

      {/* NO `NETWORK_NOT_CONNECTED_NOTICE` HERE. Both halves used to end with
          it, and on one page the two copies landed within a centimetre of each
          other — the second one taught the reader to skip the first. The
          people half keeps it, on the card where somebody is about to press a
          button that reads like "send"; this section says the same thing in
          the terms that actually apply to it, on the card above. */}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The facets, over the athlete's own groups.
 *
 * Collapsed by default: with a handful of real groups the list is short, and a
 * wall of pills above two cards would be a search interface pretending to have
 * a corpus behind it. Everything here narrows a real list of real records.
 */
function Filters({
  filters,
  peakNames,
  open,
  onOpen,
  onChange,
}: {
  filters: GroupFilters;
  peakNames: readonly string[];
  open: boolean;
  onOpen: () => void;
  onChange: (f: GroupFilters) => void;
}) {
  const count = activeFilterCount(filters);

  return (
    <Card inset={false}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2.5 text-left"
        >
          <SlidersHorizontal size={15} strokeWidth={1.6} className="shrink-0 text-mist-dim" />
          <span className="text-[13px] text-snow">Filters</span>
          {count > 0 && (
            <span className="tnum rounded-full border border-azure/40 bg-azure/[0.08] px-2 py-[2px] text-[10px] text-azure">
              {count}
            </span>
          )}
        </button>
        {count > 0 && (
          <button
            type="button"
            onClick={() => onChange(NO_FILTERS)}
            className="section-label shrink-0 text-mist-dim transition-colors hover:text-snow"
          >
            Clear
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-4 border-t border-hairline px-4 py-4">
          <Facet label="Mountain">
            <Pill
              label="Any mountain"
              selected={filters.peakName === null}
              onSelect={() => onChange({ ...filters, peakName: null })}
            />
            {peakNames.map((name) => (
              <Pill
                key={name}
                label={name}
                selected={filters.peakName === name}
                onSelect={() => onChange({ ...filters, peakName: name })}
              />
            ))}
          </Facet>

          <Facet label="Dates">
            {DATE_OPTIONS.map((id) => (
              <Pill
                key={id}
                label={DATE_FILTER_LABELS[id]}
                selected={filters.date === id}
                onSelect={() => onChange({ ...filters, date: id })}
              />
            ))}
          </Facet>

          <Facet label="Experience" note="Self-declared. ICEFALL checks nobody's ability.">
            <Pill
              label="Any experience"
              selected={filters.experience === null}
              onSelect={() => onChange({ ...filters, experience: null })}
            />
            {EXPERIENCE_OPTIONS.map((id) => (
              <Pill
                key={id}
                label={EXPERIENCE_LABELS[id]}
                selected={filters.experience === id}
                onSelect={() => onChange({ ...filters, experience: id })}
              />
            ))}
          </Facet>

          <Facet label="Party size">
            {SIZE_OPTIONS.map((id) => (
              <Pill
                key={id}
                label={SIZE_FILTER_LABELS[id]}
                selected={filters.size === id}
                onSelect={() => onChange({ ...filters, size: id })}
              />
            ))}
          </Facet>

          <Facet
            label="Guided or independent"
            note="Recorded in a group's workspace. Groups where nobody has said are “not recorded”, never assumed independent."
          >
            {STYLE_OPTIONS.map((id) => (
              <Pill
                key={id}
                label={STYLE_FILTER_LABELS[id]}
                selected={filters.style === id}
                onSelect={() => onChange({ ...filters, style: id })}
              />
            ))}
          </Facet>

          <Facet label="Training together" note="Groups whose stated intent includes training.">
            <Pill
              label="Training together"
              selected={filters.trainingTogether}
              onSelect={() => onChange({ ...filters, trainingTogether: !filters.trainingTogether })}
            />
          </Facet>
        </div>
      )}
    </Card>
  );
}

function Facet({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="section-label">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
      {note && <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">{note}</p>}
    </div>
  );
}

function Pill({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-[12px] transition-colors",
        selected
          ? "border-azure/55 bg-azure/[0.12] text-azure"
          : "border-hairline text-mist-dim hover:border-hairline-strong hover:text-mist",
      )}
    >
      {label}
    </button>
  );
}
