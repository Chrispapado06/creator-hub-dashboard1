import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  CalendarRange,
  Footprints,
  Globe,
  Hourglass,
  ImageOff,
  ImagePlus,
  Lock,
  MapPin,
  MessageSquare,
  Mountain as MountainIcon,
  RotateCw,
  SearchX,
  Send,
  Share2,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { Avatar, Badge, Button, Card, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Sheet } from "@/components/ui/Sheet";
import {
  AbsenceMark,
  AvatarStack,
  GroupAction,
  GroupActionRow,
  GroupCover,
  MetaRow,
  SpaceAbsence,
  type MetaItem,
  type StackPerson,
} from "./groupChrome";
import { GroupFeedSection } from "./GroupFeedSection";
import { EXAMPLE_GROUP_NOTE, isExampleGroupId } from "@/groups/demo/exampleSource";
import { MountainThumb } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtDate, fmtElevation, fmtRelative } from "@/lib/format";
import { linkify } from "@/lib/linkify";
import { useApp } from "@/state/AppState";
/* A phone group that has moved, and the read-only screen for one that has not. */
import { hasMoved } from "@/groups/local/phoneGroups";
import { DeviceGroupSummary } from "@/screens/groups/local/DeviceGroupSummary";
import { SAFETY_REMINDER } from "@/network/privacy";
import {
  ACCEPTED_NOT_SEATED,
  ACCEPT_MEANS_VISIBLE,
  GROUP_SPACE_REFUSED,
  MAX_MESSAGE_BODY,
  PRIVATE_MEANS_ASK,
  nobodyRunsGroup,
  useGroup,
  useGroupActions,
  useGroupMessages,
  useGroupRoster,
  type GroupJoinRequest,
  type GroupMember,
  type GroupMembership,
  type GroupMessage,
  type GroupPerson,
  type GroupSpace,
  type GroupSpaceStatus,
} from "@/social/groupSpace";

/**
 * `/social/groups/:id` — the group behind one link, whichever kind it is.
 *
 * THIS FILE IS NOW TWO THINGS: a small dispatcher, and the group page on
 * ICEFALL's server. The third thing it used to be — a 1,500-line planning
 * workspace for a group saved on one phone — was deleted in slice S7, and the
 * note where it stood says where each of its sections went.
 *
 * THE RULES THE SERVER PAGE ENFORCES RATHER THAN MENTIONS
 *
 *   1. NO INVENTED MEMBER AND NO INVENTED COUNT. A roster that did not come
 *      back is a sentence, never an empty list; a count that did not come back
 *      is drawn as nothing, never as zero.
 *   2. READINESS IS NEVER A LEAGUE TABLE. No mean is drawn for a party — in a
 *      group of two that is the other person's figure with one step of
 *      arithmetic over it. Readiness is per member, as a band, with that
 *      member's own consent, and members are listed in the order they joined.
 *   3. EVERY FIGURE CARRIES ITS PROVENANCE. Derived or self-reported, said
 *      every time it is drawn. Never a measurement, never a clearance to climb.
 *   4. THE ROSTER AND THE CONVERSATION BELONG TO THE PEOPLE IN THE GROUP. A
 *      stranger is told so in a sentence, which is the promise itself, not a
 *      failure state.
 */

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * ONE ROUTE, TWO KINDS OF GROUP, AND THEY ARE NOT THE SAME THING.
 *
 * `/social/groups/:id` (`/explore/groups/:id` before the move, still redirected)
 * has always resolved first against `expeditions` — the groups this athlete
 * saved on this device, whose ids are `expedition-<timestamp>`. Those open
 * read-only in `DeviceGroupSummary`, because nobody else can be in one.
 *
 * A GROUP ON ICEFALL'S SERVER is a different record with a different id — a
 * uuid — and a different promise: other people are in it, the roster is theirs,
 * and there is a conversation. That is the rest of this file, and it starts at
 * "The group as a place".
 *
 * The two are told apart by the SHAPE OF THE ID rather than by asking the
 * server, because `.eq("id", "expedition-3")` is a type error in Postgres and
 * would come back as "the server refused that" — a sentence about the server,
 * for a link that was never a server link.
 *
 * A labelled example id (demo builds only, `groups/demo/exampleSource.ts`)
 * opens the same server-group screen; its hooks answer from the examples and
 * never ask the server.
 *
 * AND A PHONE GROUP THAT HAS MOVED IS A SERVER GROUP (structure plan §1.4, S6).
 * Once its owner has tapped Move, the record here carries the id it was given,
 * and this link — which people have sent to themselves, bookmarked and put in
 * their own notes — goes to the real group rather than to a copy of it that
 * cannot be joined. The redirect REPLACES, so Back does not bounce between the
 * two. What has not moved opens read-only: `DeviceGroupSummary` shows
 * everything that was written and takes nothing new (§2.3).
 */
export default function GroupWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { expeditions } = useApp();

  const group = expeditions.find((e) => e.id === id);

  if (group && hasMoved(group)) {
    return <Navigate to={`/social/groups/${group.movedTo}`} replace />;
  }

  // Keyed by id so switching groups rebuilds the local state of every section.
  if (group) return <DeviceGroupSummary key={group.id} expedition={group} />;

  if (id && (SERVER_GROUP_ID.test(id) || isExampleGroupId(id))) {
    return <GroupSpaceScreen key={id} groupId={id} />;
  }
  return <NoGroupUnderThatLink />;
}

/* -------------------------------------------------------------------------- */
/* A link that resolves to nothing, on this device or on the server            */
/* -------------------------------------------------------------------------- */

/**
 * Reached by an old link, or after a local group was deleted.
 *
 * IT NO LONGER SAYS "ICEFALL HAS NO SERVER TO FETCH ONE FROM". That sentence
 * was true when every group was local; it is now false, and a false reassurance
 * is worse than none. What it says instead is exactly what happened: nothing on
 * this device matches, the link is not the shape of a server group's either, so
 * nothing was asked of anybody.
 */
function NoGroupUnderThatLink() {
  return (
    <Screen>
      <ScreenHeader title="Group" back />
      <Stagger>
        <Rise>
          <Card className="py-8">
            <div className="flex flex-col items-center text-center">
              <AbsenceMark icon={SearchX} />
              <p className="mt-4 text-[14px] text-snow">No group under that link</p>
              <p className="mt-2 max-w-[42ch] text-[12px] leading-relaxed text-mist">
                This device holds no group saved under it, and it is not the shape of a link to a
                group on ICEFALL's server either — so there was nothing to ask the server for. It
                was most likely deleted, or the link was cut short on its way here.
              </p>
            </div>
            <Button asChild variant="secondary" className="mt-5 w-full">
              <Link to="/social?tab=groups">Back to your groups</Link>
            </Button>
          </Card>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* The local workspace: RETIRED IN SLICE S7, 16 September 2026                 */
/* -------------------------------------------------------------------------- */

/*
 * A 1,500-LINE SCREEN WAS DELETED HERE, AND IT WAS NOT DEAD CODE BY ACCIDENT.
 *
 * `Workspace` and its twelve sections — Hero, StyleChooser, Members, YouRow,
 * UnresolvedMemberRow, SharedChecklist, ChecklistRow, Sessions, SessionRow,
 * AddSession, Notes, Chat, Share and LeaveGroup — planned an `Expedition`: a
 * party held on one phone, whose member list could only ever hold the person
 * holding it. Structure plan D1 makes a group ONE thing, a row in
 * `public.groups` with real members, requests, chat and a feed, and §2.5
 * retires this screen with the model behind it.
 *
 * NOTHING A USER WROTE WENT WITH IT. A group saved on this phone still opens,
 * read-only, at `DeviceGroupSummary` — its cover, its window, what was written
 * about it, its notes, its planned sessions and its log — with one tap that
 * moves it to the ICEFALL account and one that deletes it from this phone.
 * That screen has been what `/social/groups/expedition-…` opens since S6, so
 * this code had already stopped rendering before it was removed.
 *
 * TWO PIECES WERE MOVED OUT FIRST, because the redesign uses both:
 *   `useMemberReadiness`  ->  `@/groups/readiness`
 *   `Operators`           ->  `@/components/groups/Operators`
 *
 * AND `@/network/groups` LOST THE CONSTANTS ONLY THIS SCREEN READ:
 * GROUP_CHAT_NOTICE, CHECKLIST_SHARING_NOTICE, GROUP_READINESS_NOTE,
 * SHARE_FOOTER, SHARE_LINK_UNAVAILABLE, meanReadiness and groupSummary — the
 * last two because a group's MEAN readiness cannot be drawn any more: in a
 * party of two it is the other person's score with one step of arithmetic over
 * it. Readiness is per member, as a band, with that member's consent.
 */

/* ========================================================================== */
/* THE GROUP AS A PLACE — one group on ICEFALL's server, opened               */
/* ========================================================================== */

/**
 * The owner, 2026-09-02:
 *   "in a group once they join they can see details people in etc chat send
 *    images and stuff. If you create a group you have option to be public or
 *    private accept"
 *
 * THREE THINGS, AND THE DIFFERENCE BETWEEN THEM IS THE WHOLE FEATURE:
 *
 *   1. DETAILS — the name, the mountain, when the party intends to go, how many
 *      people are in it. Readable by ANYONE signed in, private groups included,
 *      because a private group nobody can see is a private group nobody can ask
 *      to join. Private closes the membership, not the existence.
 *
 *   2. THE ROSTER — members only. A stranger gets a written sentence saying the
 *      member list belongs to the people in it, NOT an empty list and NOT an
 *      error. That refusal is the feature: it is the promise the group makes to
 *      everybody already inside it.
 *
 *   3. THE CONVERSATION — members only, with pictures. Oldest first.
 *
 * WHAT THIS SCREEN MAY NOT DO, all of it enforced in the database and none of
 * it a decision this file gets to revisit:
 *
 *   - NO JOIN BUTTON ON A PRIVATE GROUP. `group_members_insert` admits a
 *     self-insert into a public group outright and into a private one only with
 *     an already-accepted request. A "Join" on a private group could only fail,
 *     so the control reads "Request to join" and says why before it is pressed.
 *   - NO EDITING A MESSAGE, ever. `group_messages` has no update policy and no
 *     update grant, the same posture as posts and channel messages: what was
 *     said to a party planning a mountain is stood behind or deleted, never
 *     quietly rewritten under the replies to it. There is no edit affordance
 *     below and there must never be one.
 *   - NO INVENTED COUNT. A member count that did not arrive is drawn as nothing
 *     at all. Zero would say a group nobody could count is a group nobody is
 *     in, and every group has at least the person who started it.
 *
 * WHERE THERE IS NO SERVER TO READ: all of it needs
 * `20260902220000_group_privacy_and_chat.sql` on the server. A build without a
 * client, or a server without that migration, shows this screen's not-connected
 * or not-live state, saying that nothing has been hidden. Demo builds also open
 * the labelled examples here, each marked on the page as an example.
 */

/**
 * A uuid, which is what a group on the server has for an id.
 *
 * Tested before anything is sent. See the note on the default export: a local
 * `expedition-…` id handed to Postgres is a type error, and reporting that as a
 * refusal would be a sentence about the server for a link the server never saw.
 */
const SERVER_GROUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------- */
/* The honest absences                                                        */
/* -------------------------------------------------------------------------- */

/*
 * THE ABSENCES NOW LIVE IN `groupChrome.tsx`.
 *
 * `AbsenceMark`, `SpaceAbsence` and the ABSENCE_TITLE / ABSENCE_ICON tables
 * moved there when the group page was rebuilt to the owner's mockup, because
 * the new feed section needs the same treatment and a second copy of an
 * explanation is how two screens end up disagreeing about what went wrong.
 * Nothing about them changed except that the heading and icon can now be
 * overridden, which is how the feed says "the posts are the group's" where the
 * shared table would have said "Members only".
 */

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What to call somebody, or nothing at all.
 *
 * `null` means THE PROFILE ROW DID NOT COME BACK, and nothing fills it in.
 * "Someone", "A member" or an initial would be ICEFALL writing a name for a
 * real person, which is the same class of invention as a made-up number.
 */
function displayName(person: GroupPerson): string | null {
  const name = person.name?.trim();
  if (name) return name;
  const username = person.username?.trim();
  return username ? `@${username}` : null;
}

/**
 * Their photograph where they have uploaded one, their initials where they have
 * not, and an empty slot where the profile row did not come back at all.
 *
 * `avatarUrl` WAS BEING DROPPED HERE. `GroupPerson` carries it, `Avatar` takes
 * a `src`, and nine other surfaces pass it — so every face on a group's roster
 * was initials even for people with a picture. Fixed while the group page was
 * rebuilt, because the mockup's avatar stack is drawn as photographs and would
 * have been a row of monograms.
 */
function PersonAvatar({ person, size = 34 }: { person: GroupPerson; size?: number }) {
  const name = displayName(person);
  // The leading @ is stripped for the monogram only — "@rob" would otherwise
  // initial as punctuation.
  if (name) {
    return <Avatar name={name.replace(/^@/, "")} src={person.avatarUrl ?? undefined} size={size} />;
  }
  return <AbsenceMark icon={Users} size={size} />;
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

type SpaceSheet = "members" | "share" | "about";

/**
 * THE FEED/CHAT SWITCH the page was missing.
 *
 * Two segments, not a heading over a section: what a group has posted and
 * what has been said in it are equally real and equally reachable, and a
 * reader should be able to move between them without a sheet opening over
 * the page. Selecting a segment changes nothing about who can read what —
 * `GroupFeedSection` and `Conversation` each still answer `members-only` for
 * a stranger exactly as they did before this control existed; this is only
 * ever which of those two answers is on screen right now.
 */
function FeedChatToggle({
  view,
  onChange,
}: {
  view: "feed" | "chat";
  onChange: (view: "feed" | "chat") => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-hairline">
      {(["feed", "chat"] as const).map((option) => {
        const active = view === option;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option)}
            className={cn(
              "-mb-px flex-1 border-b-2 py-2.5 text-center text-[13px] transition-colors",
              active
                ? "border-azure text-snow"
                : "border-transparent text-mist-dim hover:text-mist",
            )}
          >
            {option === "feed" ? "Feed" : "Chat"}
          </button>
        );
      })}
    </div>
  );
}

function GroupSpaceScreen({ groupId }: { groupId: string }) {
  const { group, membership, state, message, reload } = useGroup(groupId);
  /*
   * LIFTED TO THE SCREEN, deliberately. The join and the ask are now the round
   * action at the top of the page, their failure sentence has to sit under that
   * row, and the leave lives in the (i) sheet — three places that must share one
   * `busy` and one `error`, or a refused join could be reported twice and a
   * second press could be taken while the first was still in flight.
   */
  const actions = useGroupActions();
  const [sheet, setSheet] = useState<SpaceSheet | null>(null);
  /*
   * FEED / CHAT, AS A VISIBLE TOGGLE ON THE PAGE ITSELF, not a fourth round
   * action that opens a sheet. The owner, 11 Sep: "when you click on a group
   * and join there should be the feed and chat" — and after this screen's
   * rebuild there was no control that switched between the two, only a
   * "Posts" heading that was always on screen and a Chat sheet one tap away.
   * This is that control: a two-way tab, right where "Posts" used to sit
   * alone, so a member can move between what has been posted and what has
   * been said without leaving the page.
   */
  const [view, setView] = useState<"feed" | "chat">("feed");
  /*
   * ONE ROSTER READ FOR THE WHOLE PAGE, and only for a member.
   *
   * The faces need the people and the chat needs to know whether the reader is
   * the organiser — the same read, so it is taken here and handed down rather
   * than taken twice. `useGroupRoster(undefined)` makes no request at all, so a
   * stranger's page still asks for nothing it may not have: the roster is
   * members-only and asking would only be refused.
   */
  const roster = useGroupRoster(membership === "member" ? groupId : undefined);
  const unownedId = useId();
  const close = () => setSheet(null);

  if (state === "loading") {
    return (
      <Screen>
        <ScreenHeader title="Group" back />
        <Stagger>
          <Rise>
            <Card>
              <p className="text-[13px] text-mist-dim">Opening this group…</p>
            </Card>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  if (state !== "ready") {
    return (
      <Screen>
        <ScreenHeader title="Group" back />
        <Stagger>
          <Rise>
            <SpaceAbsence
              status={state}
              message={message}
              onRetry={reload}
              detail={
                <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">All of it lives on the server.</p>
              }
            />
          </Rise>
          <Rise className="pt-3">
            <Button asChild variant="secondary" className="w-full">
              <Link to="/social?tab=groups">Back to your groups</Link>
            </Button>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  if (!group) {
    // Unreachable by construction — the hook sets the row and the ready state in
    // one breath. Kept because the alternative to a stated refusal here is a
    // blank screen, and a blank screen explains nothing to whoever hits it.
    return (
      <Screen>
        <ScreenHeader title="Group" back />
        <Stagger>
          <Rise>
            <SpaceAbsence status="refused" message={GROUP_SPACE_REFUSED} />
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  /*
   * THE PRIMARY ACTION, AND WHY IT IS NEVER "INVITE".
   *
   * The mockup's filled accent circle says Invite. ICEFALL has no invite — no
   * table, no call, no screen anywhere in the app. Membership is only ever
   * self-initiated, and which of the two forms it takes is decided by the
   * database rather than by this file: `group_members_insert` refuses a
   * self-insert into a private group outright, so a "Join" drawn on one could
   * do nothing but fail. Public groups are JOINED, private groups are ASKED.
   *
   * `accepted` is the subtle one and has its own branch. Nothing can seat a
   * person but their own device — the insert policy pins the row to
   * `auth.uid()` — so between an organiser saying yes and that person next opening
   * the group they are neither pending nor a member, and the control they need
   * is a second, explicit Join.
   *
   * `pending` and `declined` get NO control at all. There is deliberately no
   * way to ask twice, so a button there would be one that does nothing.
   */
  const asking = group.visibility === "private";
  const unanswerable = nobodyRunsGroup(group);
  const primary =
    membership === "accepted" || (membership === "none" && !asking)
      ? {
          icon: UserPlus,
          label: actions.busy ? "Joining…" : "Join",
          hint:
            membership === "accepted" ? "Take the place you were accepted into" : "Join this group",
          onClick: () => void actions.join(group.id),
          disabled: actions.busy,
          describedBy: undefined as string | undefined,
        }
      : membership === "none" && asking
        ? {
            icon: UserPlus,
            label: actions.busy ? "Asking…" : "Ask",
            hint: "Request to join this private group",
            onClick: () => void actions.requestJoin(group.id),
            disabled: actions.busy || unanswerable,
            describedBy: unanswerable ? unownedId : undefined,
          }
        : null;

  const mountain = group.mountain;
  /*
   * THE PLACE, WHATEVER KIND IT IS.
   *
   * `groupSpace.ts` fills `mountain` only where the catalogue row really is a
   * peak, so a trek group has a `destination` and no `mountain`. Every sentence
   * below reads this one where the question is "which place", and `mountain`
   * only where the answer needs a height or a mountain page — otherwise a group
   * for the Tour du Mont Blanc reports a failure that never happened.
   */
  const destination = group.destination;
  const place = destination
    ? [destination.range, destination.country].filter(Boolean).join(" · ")
    : "";

  /* Every item is a field that answered. Nothing is filled in. */
  const metaItems: MetaItem[] = [
    {
      icon: group.visibility === "private" ? Lock : Globe,
      label: group.visibility === "private" ? "Private" : "Public",
    },
  ];
  if (place) {
    metaItems.push({
      // The app's own marks: a peak for a peak, footprints for a trek, and a
      // plain pin where the catalogue did not say which.
      icon:
        destination?.kind === "mountain"
          ? MountainIcon
          : destination?.kind === "trek"
            ? Footprints
            : MapPin,
      label: place,
    });
  }
  if (group.intendedOn) metaItems.push({ icon: CalendarRange, label: fmtDate(group.intendedOn) });

  return (
    <Screen padded={false}>
      <Stagger className="px-5">
        <Rise>
          <GroupCover
            name={group.name}
            /* No mountain record came back means no picture. Some other peak's
               photograph under this group's name would be ICEFALL inventing
               where the party is going. */
            peak={
              mountain
                ? { name: mountain.name, elevationM: mountain.elevationM ?? undefined }
                : null
            }
            meta={
              mountain
                ? `${mountain.name}${
                    typeof mountain.elevationM === "number"
                      ? ` · ${fmtElevation(mountain.elevationM)} m`
                      : ""
                  }`
                : destination
                  ? `${destination.name}${destination.kind === "trek" ? " · Trek" : ""}`
                  : undefined
            }
            backTo="/social?tab=groups"
          />
        </Rise>

        {isExampleGroupId(group.id) && (
          <Rise className="pt-3">
            <p className="text-[12px] leading-relaxed text-mist">{EXAMPLE_GROUP_NOTE}</p>
          </Rise>
        )}

        {/*
          * THREE DIFFERENT SILENCES, and only one of them is a fault.
          *
          * A group may now be about a place that is not a mountain, or about a
          * subject in its own words, or about nothing in particular (owner
          * ruling, 16 Sep 2026). None of those is a missing record, and saying
          * "the mountain's record did not come back" about one of them would be
          * reporting a fault that has not happened — which is why the first
          * branch reads `destination` (the row, whatever kind it is) and only
          * the second, where nothing resolved at all, is the old sentence.
          */}
        {!mountain && destination !== null && (
          <Rise className="pt-3">
            <p className="text-[11px] leading-relaxed text-mist-dim">
              {destination.kind === "trek"
                ? `${destination.name} is a trek rather than a peak, so this group carries no summit photograph and no height.`
                : `ICEFALL's catalogue does not say what sort of place ${destination.name} is, so this group carries no photograph and no height.`}
            </p>
          </Rise>
        )}

        {!mountain && destination === null && group.destinationId !== null && (
          <Rise className="pt-3">
            <p className="text-[11px] leading-relaxed text-mist-dim">
              The place's record did not come back with this group, so there is no photograph and it
              is left unnamed. The group is filed against “{group.destinationId}” in ICEFALL's
              catalogue, and that is an id rather than a name — tidying it into one, or putting
              another mountain's picture above it, would both be ICEFALL writing this group's
              objective for it.
            </p>
          </Rise>
        )}

        {!mountain && group.destinationId === null && group.topic !== null && (
          <Rise className="pt-3">
            <p className="text-[11px] leading-relaxed text-mist-dim">
              This group is about {group.topic}, in its own words — ICEFALL has no record to file it
              against, so there is no photograph and no mountain page to open.
            </p>
          </Rise>
        )}

        <Rise className="pt-5">
          <GroupActionRow>
            {primary && <GroupAction {...primary} tone="primary" />}
            <GroupAction
              icon={Users}
              label="Members"
              hint="Who is in this group"
              onClick={() => setSheet("members")}
            />
            <GroupAction
              icon={Share2}
              label="Share"
              hint="Share a link to this group"
              onClick={() => setSheet("share")}
            />
          </GroupActionRow>

          {/* A disabled control says why, at the control. This one is disabled
              because the ask would have no reader at all. */}
          {primary?.describedBy && (
            <p id={unownedId} className="mt-3 text-[11px] leading-relaxed text-mist-dim">This group has nobody organising it, so a request would sit unanswered.</p>
          )}

          {actions.error && (
            <p className="mt-3 text-[12px] leading-relaxed text-danger">{actions.error}</p>
          )}
        </Rise>

        <StandingNote group={group} membership={membership} />

        <Rise className="pt-5">
          <MetaRow items={metaItems} onInfo={() => setSheet("about")} />
        </Rise>

        <Rise className="pt-5">
          {membership === "member" ? (
            <MemberStack
              members={roster.members}
              state={roster.state}
              memberCount={group.memberCount}
              onOpen={() => setSheet("members")}
            />
          ) : (
            <StrangerPeople memberCount={group.memberCount} />
          )}
        </Rise>

        <Rise className="pt-7">
          <SectionLabel>About</SectionLabel>
          <Card className="mt-3">
            <p className="text-[13px] leading-relaxed text-mist">
              {mountain
                ? `A group for ${mountain.name}${place ? `, ${place}` : ""}.`
                : destination
                  ? `A group for ${destination.name}${place ? `, ${place}` : ""}.`
                  : group.topic !== null
                    ? `A group about ${group.topic}, in its own words.`
                    : group.destinationId !== null
                      ? "A group for a place whose record did not come back with it."
                      : "A group that is not about a particular place."}
            </p>
            {/* A group has no description column, so the line above is all there
                is. The three-sentence explanation that used to sit here — that
                the field does not exist and nobody was asked for one — was
                longer than the thing it apologised for. Removed 11 Sep 2026.
                Nothing is hidden: what is shown is still only what is held. */}
          </Card>
        </Rise>

        <Rise className="pt-8">
          <FeedChatToggle view={view} onChange={setView} />
        </Rise>
        {view === "feed" ? (
          <GroupFeedSection groupId={groupId} isMember={membership === "member"} />
        ) : (
          <Conversation groupId={groupId} canModerate={roster.isOrganiser} />
        )}

        <Rise className="pt-8">
          <SectionLabel>Before you meet anyone</SectionLabel>
          <Card className="mt-3">
            <p className="text-[12px] leading-relaxed text-mist">{SAFETY_REMINDER}</p>
          </Card>
        </Rise>
      </Stagger>

      {sheet === "members" && (
        <Sheet title="Who is in" onClose={close}>
          <Stagger className="pb-4">
            <Roster groupId={groupId} />
          </Stagger>
        </Sheet>
      )}

      {sheet === "share" && (
        <Sheet title="Share this group" onClose={close}>
          <Stagger className="pb-4">
            <ShareGroupLink group={group} />
          </Stagger>
        </Sheet>
      )}

      {sheet === "about" && (
        <Sheet title="About this group" onClose={close}>
          <Stagger className="pb-4">
            <Rise className="pt-4">
              <GroupDetails group={group} />
            </Rise>
            {membership === "member" && (
              <Rise className="pt-4">
                <MemberStanding group={group} actions={actions} />
              </Rise>
            )}
          </Stagger>
        </Sheet>
      )}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* The faces, and the two places the mockup's stack would lie                  */
/* -------------------------------------------------------------------------- */

/**
 * FOR A MEMBER: the real roster, really read, with the real remainder.
 *
 * The roster is `group_members` with profiles resolved, so these are people who
 * are actually in the group. The remainder comes from the row's own
 * `member_count` where it arrived and from the number of people read where it
 * did not — both real counts, never a guess and never a zero.
 */
function MemberStack({
  members,
  state,
  memberCount,
  onOpen,
}: {
  members: GroupMember[];
  state: GroupSpaceStatus;
  memberCount: number | null;
  onOpen: () => void;
}) {
  if (state === "loading") {
    return <p className="text-[12px] text-mist-dim">Reading who is in…</p>;
  }

  if (state !== "ready" || members.length === 0) {
    /* The roster did not come back. The count on the group row may still have,
       and it is a different measurement — so it is drawn, and the missing faces
       are named as missing rather than left as a gap. */
    return (
      <div>
        {memberCount !== null && (
          <p className="tnum text-[13px] text-snow">
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </p>
        )}
        <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">ICEFALL could not read who is in this group just now, so no faces are drawn.</p>
      </div>
    );
  }

  const people: StackPerson[] = members.map((member) => ({
    key: member.profileId,
    name: displayName(member),
    avatarUrl: member.avatarUrl,
    organiser: member.isOrganiser,
  }));

  const total = memberCount ?? members.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Who is in this group"
      className="flex w-full items-center gap-3 rounded-tile py-1 text-left transition-colors hover:bg-white/[0.03]"
    >
      <AvatarStack people={people} total={memberCount} />
      <div className="min-w-0">
        <p className="tnum text-[13px] text-snow">
          {total} {total === 1 ? "member" : "members"}
        </p>
      </div>
    </button>
  );
}

/**
 * FOR EVERYBODY ELSE: no faces, and the reason where they would have been.
 *
 * `group_members_select` FILTERS rather than refuses, so a stranger's query
 * comes back as zero rows with no error — and a stack built from that would be
 * an empty row of nothing that reads as a group nobody is in. The count on the
 * group row is computed SECURITY DEFINER and is legitimately theirs to see, so
 * it is drawn where it arrived and nothing is drawn where it did not.
 */
function StrangerPeople({ memberCount }: { memberCount: number | null }) {
  return (
    <div className="flex items-start gap-3">
      <AbsenceMark icon={Users} size={38} />
      <div className="min-w-0">
        {memberCount !== null ? (
          <p className="tnum text-[13px] text-snow">
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </p>
        ) : (
          <p className="text-[13px] text-snow">Members only</p>
        )}
        <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">
          {memberCount !== null
            ? "Who they are is the group's own, and ICEFALL does not read a roster to anybody outside it. Join, and the faces are here."
            : "The number of people in this group did not come back, so none is shown — a zero would be a wrong answer rather than an empty one. Who they are is the group's own either way."}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Share — a server group really does have an address                          */
/* -------------------------------------------------------------------------- */

/**
 * THE ONE SHARE SURFACE IN THIS FILE THAT CAN OFFER A LINK.
 *
 * The local workspace's Share still says ICEFALL has no address for a group,
 * and for a group on one phone that is true. A group on the server has a real
 * one — `/social/groups/<uuid>`, the link the groups list already navigates to
 * — so repeating that sentence here would be a falsehood, and a separate
 * component is cheaper than a shared one with a lie in it.
 *
 * WHAT THE RECIPIENT ACTUALLY GETS is stated before the link is handed over,
 * because a private group's link is not a way in.
 */
function ShareGroupLink({ group }: { group: GroupSpace }) {
  const [note, setNote] = useState<string | null>(null);
  const url =
    typeof window === "undefined"
      ? `/social/groups/${group.id}`
      : `${window.location.origin}/social/groups/${group.id}`;

  const share = useCallback(async () => {
    const title = `ICEFALL group — ${group.name}`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        setNote("Handed to the share sheet. ICEFALL sent nothing itself.");
        return;
      } catch (err) {
        // A dismissed sheet is not a failure and must not fall through to a
        // clipboard write nobody asked for.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        setNote("Link copied. Nothing was sent from ICEFALL.");
        return;
      } catch {
        /* clipboard refused — the link is on screen above, to copy by hand */
      }
    }

    setNote("This browser would neither share nor copy. The link is above — copy it by hand.");
  }, [group.name, url]);

  return (
    <>
      <Rise className="pt-4">
        <Card>
          <p className="section-label">The link</p>
          <p className="mt-2 break-all text-[12px] leading-relaxed text-mist">{url}</p>
        </Card>
      </Rise>

      <Rise className="pt-3">
        <Button variant="secondary" className="w-full" onClick={share}>
          <Share2 size={15} strokeWidth={1.7} aria-hidden="true" />
          Share this link
        </Button>
      </Rise>

      <Rise className="pt-3">
        <p className="text-[11px] leading-relaxed text-mist-dim">
          Whoever opens it has to be signed in to ICEFALL, and sees the group's name, what it is
          about and whether it is public or private — and no more than that.{" "}
          {group.visibility === "private"
            ? "This group is private, so the link is not a way in: they can ask to join, and its organiser decides."
            : "This group is public, so they can join from it, and joining opens the roster and the conversation from its beginning."}
        </p>
      </Rise>

      {note && (
        <Rise className="pt-3">
          <p className="text-[11px] text-mist-dim" role="status">
            {note}
          </p>
        </Rise>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 1 — Details                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What a group is, and what a STRANGER is allowed to know about it.
 *
 * This card is drawn for everybody signed in, member or not, because the group
 * row itself is readable by everybody — enough to decide whether to join or to
 * ask, and no more. Who is in it and what has been said are separate tables
 * with their own locked doors, further down this screen.
 *
 * THREE ABSENCES ARE DRAWN AS ABSENCES, not smoothed over:
 *   - No catalogue record: the place is left unnamed. The catalogue id is not a
 *     name — "ama-dablam" title-cased is ICEFALL writing a mountain's name for
 *     it — so it is shown as the id it is, if at all. A place that DID come
 *     back and is not a peak is not this: it is named, without a height.
 *   - No date: undecided, which is where most groups start. Never a placeholder
 *     season and never "TBC".
 *   - No member count: nothing. Never a zero.
 */
function GroupDetails({ group }: { group: GroupSpace }) {
  const mountain = group.mountain;
  /* The catalogue row of either kind. A trek fills this and never `mountain`,
     so the branch below names it instead of reporting a missing record. */
  const destination = group.destination;

  return (
    <Card>
      <div className="flex items-start gap-3">
        {mountain && (
          <MountainThumb
            // The peak's own photograph where ICEFALL holds one, and terrain for
            // its altitude band where it does not — `MountainThumb` marks the
            // difference itself, so a stand-in never passes as a summit shot.
            peak={{ name: mountain.name, elevationM: mountain.elevationM ?? undefined }}
            size={52}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug text-snow">{group.name}</p>

          {mountain ? (
            <>
              <p className="tnum mt-1 text-[12px] text-mist">
                {mountain.name}
                {typeof mountain.elevationM === "number"
                  ? ` · ${fmtElevation(mountain.elevationM)} m`
                  : ""}
              </p>
              {(mountain.range || mountain.country) && (
                <p className="mt-0.5 truncate text-[11px] text-mist-dim">
                  {[mountain.range, mountain.country].filter(Boolean).join(" · ")}
                </p>
              )}
            </>
          ) : destination ? (
            /* A real place that is not a peak. It has a name and a country and
               no summit, and drawing it as a nameless failure was the bug this
               branch exists to stop. */
            <>
              <p className="mt-1 text-[12px] text-mist">{destination.name}</p>
              {(destination.range || destination.country) && (
                <p className="mt-0.5 truncate text-[11px] text-mist-dim">
                  {[destination.range, destination.country].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
                {destination.kind === "trek"
                  ? "A trek rather than a peak, so ICEFALL holds no height for it."
                  : "ICEFALL's catalogue does not say what sort of place this is, so there is no height for it."}
              </p>
            </>
          ) : group.destinationId === null ? (
            /* Not a fault: a group about a region, a community of people or a
               peak the catalogue does not hold carries its own words instead. */
            <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
              {group.topic !== null
                ? `${group.topic} — the group's own subject, which ICEFALL has no catalogue record for.`
                : "This group is not about a particular place."}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
              The place's record did not come back with this group, so it is left unnamed. The group
              is filed against “{group.destinationId}” in ICEFALL's catalogue, and that is an id
              rather than a name — tidying it into one would be ICEFALL naming a peak for itself.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-4">
        {/* The padlock is the owner's own mark for private, from their mockup. */}
        <Badge tone="neutral">
          {group.visibility === "private" ? (
            <Lock size={10} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Globe size={10} strokeWidth={2} aria-hidden="true" />
          )}
          {group.visibility === "private" ? "Private" : "Public"}
        </Badge>

        {/* Null is unknown and draws nothing. It is never rendered as zero. */}
        {group.memberCount !== null && (
          <Badge tone="neutral">
            {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
          </Badge>
        )}
      </div>

      <div className="mt-4 space-y-3.5">
        <div className="flex items-start gap-2.5">
          <CalendarRange size={15} strokeWidth={1.5} className="mt-[3px] shrink-0 text-azure" />
          <div className="min-w-0">
            {group.intendedOn ? (
              <>
                <p className="tnum text-[13px] text-snow">{fmtDate(group.intendedOn)}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-mist-dim">When the party intends to go, as whoever started the group recorded it.</p>
              </>
            ) : (
              <>
                <p className="text-[13px] text-snow">No date fixed yet</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-mist-dim">Undecided, which is where most groups start.</p>
              </>
            )}
          </div>
        </div>

        {group.memberCount === null && (
          <div className="flex items-start gap-2.5">
            <Users size={15} strokeWidth={1.5} className="mt-[3px] shrink-0 text-mist-dim" />
            <p className="text-[11px] leading-relaxed text-mist-dim">The number of people in this group did not come back, so none is shown.</p>
          </div>
        )}

        {group.createdBy === null && (
          <div className="flex items-start gap-2.5">
            <Users size={15} strokeWidth={1.5} className="mt-[3px] shrink-0 text-mist-dim" />
            <p className="text-[11px] leading-relaxed text-mist-dim">Whoever started this group has since deleted their ICEFALL account, and it carries on with the people who joined it.</p>
          </div>
        )}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* 1b — Where the reader stands: join, ask, wait, or leave                    */
/* -------------------------------------------------------------------------- */

/**
 * THE ONE CONTROL THAT CANNOT BE GOT WRONG, so the database decides it.
 *
 * Public groups are JOINED. Private groups are ASKED. `group_members_insert`
 * refuses a self-insert into a private group outright, so a "Join" button drawn
 * on one could do nothing but fail — which is why the private case reads
 * "Request to join" and carries the reason above it, before anything is
 * pressed, rather than a control that behaves differently from the one next to
 * it on the previous card.
 *
 * `accepted` IS ITS OWN STATE and is the subtle one. Nothing can seat a person
 * but their own device — the insert policy pins the row to `auth.uid()` — so
 * between an organiser saying yes and that person next opening the group they are
 * neither pending (the decision was made) nor a member (the row is not there).
 * Reporting either would be untrue about a decision somebody really took.
 */
/**
 * WHERE THE READER STANDS, IN WORDS. The control that goes with it is the round
 * action at the top of the page.
 *
 * `Standing` used to be one card holding both the sentence and the button. The
 * mockup puts the button in the action row, so the two were split — and every
 * sentence survived the split, including the three states that have no control
 * at all and are therefore ONLY this card:
 *
 *   accepted  a decision was really taken and the seat is not filled yet
 *   pending   asked, and there is deliberately no way to ask twice
 *   declined  answered no, and ICEFALL does not offer to ask again
 *
 * The member case is not here: for somebody already in, the page IS the answer —
 * the roster and the feed are open. Their "you are in this group", and the leave
 * that goes with it, are in the (i) sheet as `MemberStanding`.
 */
function StandingNote({ group, membership }: { group: GroupSpace; membership: GroupMembership }) {
  if (membership === "member") return null;

  if (membership === "accepted") {
    return (
      <Rise className="pt-4">
        <Card>
          <p className="text-[14px] text-snow">You have been accepted</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{ACCEPTED_NOT_SEATED}</p>
        </Card>
      </Rise>
    );
  }

  if (membership === "pending") {
    return (
      <Rise className="pt-4">
        <Card>
          <div className="flex items-start gap-3">
            <Hourglass size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
            <div className="min-w-0">
              <p className="text-[13px] text-snow">Your request is with this group's organiser</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                Until they answer you cannot see who is in it, what has been said, or what has been
                posted. ICEFALL does not tell you when they have looked, and asking again would not
                reach them any sooner — there is deliberately no way to ask twice.
              </p>
              {nobodyRunsGroup(group) && (
                <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">This group has nobody organising it, so nobody can answer.</p>
              )}
            </div>
          </div>
        </Card>
      </Rise>
    );
  }

  if (membership === "declined") {
    return (
      <Rise className="pt-4">
        <Card>
          <p className="text-[14px] text-snow">Your request was declined</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
            This group's organiser answered no. ICEFALL does not offer to ask again — the answer
            is kept precisely so the decision does not have to be taken twice, and pressing somebody
            to reconsider is not something an app should automate.
          </p>
        </Card>
      </Rise>
    );
  }

  /* Not in, never asked. Public and private diverge completely from here, and
     the difference is stated BEFORE anything is pressed. */
  if (group.visibility === "public") {
    return (
      <Rise className="pt-4">
        <Card>
          <p className="text-[14px] text-snow">Anyone signed in can join</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
            Joining puts you on the roster the other members read, and opens the conversation and
            the feed from their beginning — including everything said and posted before today.
          </p>
        </Card>
      </Rise>
    );
  }

  return (
    <Rise className="pt-4">
      <Card>
        <div className="flex items-start gap-3">
          <Lock size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
          <div className="min-w-0">
            <p className="text-[13px] text-snow">This group is private</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{PRIVATE_MEANS_ASK}</p>
          </div>
        </div>
      </Card>
    </Rise>
  );
}

/**
 * The member's own standing, and the one act only they can take.
 *
 * In the (i) sheet rather than on the page, because for somebody already in the
 * group the page itself says they are in — the roster is open, the feed is open
 * and the composer is there. What they occasionally want is the way out, and
 * that has never been a thing to put under a thumb on the main screen.
 *
 * `actions` is the screen's, not this component's, so a leave in flight shares
 * one `busy` with the join above it.
 */
function MemberStanding({
  group,
  actions,
}: {
  group: GroupSpace;
  actions: ReturnType<typeof useGroupActions>;
}) {
  const { leave, error, busy } = actions;
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  return (
    <Card>
      <p className="text-[14px] text-snow">You are in this group</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
        Which is why you can see who else is in it, everything that has been said and everything
        that has been posted. Everyone in it can see you the same way — that is the trade the group
        makes in both directions.
      </p>

      {!confirmingLeave ? (
        <button
          type="button"
          onClick={() => setConfirmingLeave(true)}
          className="section-label mt-4 text-mist-dim transition-colors hover:text-snow"
        >
          Leave this group
        </button>
      ) : (
        <div className="mt-4 rounded-tile border border-danger/30 p-3">
          <p className="text-[12px] leading-relaxed text-mist">
            Leaving takes you off the roster and closes the conversation and the feed to you. It
            does not delete the group
            {group.foundedByMe ? " — even though you started it, the people who joined keep it" : ""}
            .
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
            {group.visibility === "public"
              ? "It is a public group, so you can join again whenever you like."
              : group.foundedByMe
                ? "You started it, so you can take your place again whenever you like."
                : "You were accepted into it, and ICEFALL keeps that decision — you could take your place again without asking."}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={async () => {
                const gone = await leave(group.id);
                // Only closed on success. A refused leave that closed the panel
                // would read as "done" for something that did not happen — the
                // failure sentence needs to stay next to the button.
                if (gone) setConfirmingLeave(false);
              }}
            >
              {busy ? "Leaving…" : "Leave it"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={() => setConfirmingLeave(false)}
            >
              Stay
            </Button>
          </div>
          {error && <p className="mt-3 text-[12px] leading-relaxed text-danger">{error}</p>}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* 2 — The roster, and the organiser's decisions                             */
/* -------------------------------------------------------------------------- */

/**
 * Who is in, for the people who are in.
 *
 * A NON-MEMBER GETS A WRITTEN SENTENCE, NOT AN EMPTY LIST. That distinction is
 * the whole point: `group_members_select` FILTERS rather than refuses, so a
 * stranger's query comes back as zero rows with no error at all, and a screen
 * that rendered that would tell them nobody is going up the mountain — a false
 * statement about real people, produced by a security control working exactly
 * as designed. The data layer turns that into `members-only`, and this draws it
 * as the promise it is.
 *
 * REQUESTS ARE SHOWN HERE, WITH THE ROSTER, rather than under the conversation.
 * They come from the same read, they are about membership rather than about
 * anything anybody said, and accepting one changes this list — so this is where
 * an organiser is looking when they act on one.
 */
function Roster({ groupId }: { groupId: string }) {
  const { members, requests, isOrganiser, requestsUnavailable, state, message, reload } =
    useGroupRoster(groupId);

  if (state === "loading") {
    return (
      <Rise className="pt-3">
        <Card>
          <p className="text-[13px] text-mist-dim">Reading who is in…</p>
        </Card>
      </Rise>
    );
  }

  if (state !== "ready") {
    return (
      <Rise className="pt-3">
        <SpaceAbsence
          status={state}
          message={message}
          onRetry={reload}
          detail={
            state === "members-only" ? (
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">Nothing has been hidden from you in particular and this is not an empty group.</p>
            ) : (
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">No roster is drawn rather than a short one.</p>
            )
          }
        />
      </Rise>
    );
  }

  return (
    <>
      {isOrganiser && requests.length > 0 && <Requests groupId={groupId} requests={requests} />}

      {/*
       * "NOBODY IS ASKING" AND "ICEFALL COULD NOT CHECK" LOOK IDENTICAL, because
       * both of them draw no request cards at all — so the second one has to say
       * so out loud. Organiser-only, because nobody else is shown the list in
       * the first place and so nobody else is missing anything.
       */}
      {requestsUnavailable && (
        <Rise className="pt-3">
          <Card>
            <div className="flex items-start gap-3">
              <UserPlus size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
              <div className="min-w-0">
                <p className="text-[13px] text-snow">Requests to join could not be read</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                  The roster below is real, but ICEFALL could not read whether anybody is waiting on
                  you to let them in. That is not the same as nobody asking, so it is not drawn as
                  an empty list — somebody may be waiting. Opening this group again asks the server
                  a second time.
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={reload}>
              <RotateCw size={14} strokeWidth={1.8} aria-hidden="true" />
              Try again
            </Button>
          </Card>
        </Rise>
      )}

      <Rise className="pt-3">
        {members.length === 0 ? (
          <Card>
            <p className="text-[13px] leading-relaxed text-mist">
              The roster came back with nobody in it, which should not be possible for a group you
              are in — you would be in it. Nothing has been drawn rather than a guess at who is
              here.
            </p>
          </Card>
        ) : (
          <ul className="divide-y divide-hairline">
            {members.map((member) => (
              <li key={member.profileId}>
                <MemberRow member={member} />
              </li>
            ))}
          </ul>
        )}
      </Rise>

      <Rise className="pt-3">
        <p className="text-[11px] leading-relaxed text-mist-dim">Everybody in the group can read this list, and everybody in it can read you.</p>
      </Rise>
    </>
  );
}

function MemberRow({ member }: { member: GroupMember }) {
  const name = displayName(member);

  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        <PersonAvatar person={member} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-snow">{name ?? "Profile not available"}</p>
          <p className="tnum mt-0.5 truncate text-[11px] text-mist-dim">
            {member.joinedAt ? `Joined ${fmtRelative(member.joinedAt)}` : "In this group"}
            {member.location ? ` · ${member.location}` : ""}
          </p>
          {!name && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">ICEFALL could not read this person's profile and will not put a name to them.</p>
          )}
        </div>
        {member.isOrganiser && <Badge tone="neutral">Organiser</Badge>}
      </div>
    </div>
  );
}

/**
 * Asks to join, and the two answers. ORGANISER ONLY, twice over: the policy lets
 * nobody else write the decision, and the data layer hands nobody else the list.
 *
 * WHY THE ACCEPTED PERSON DOES NOT APPEAR ON THE ROSTER AFTERWARDS, which is
 * the thing an organiser would otherwise think is broken: nothing can seat them
 * but their own device, because the insert policy pins a membership row to
 * `auth.uid()`. Accepting is permission; the place is taken the next time they
 * open the group. The outcome line below says exactly that, because a request
 * vanishing with no new member in its place is a puzzle otherwise.
 */
function Requests({ groupId, requests }: { groupId: string; requests: GroupJoinRequest[] }) {
  const { decide, error, busy } = useGroupActions();
  const [outcome, setOutcome] = useState<{ label: string; accepted: boolean } | null>(null);

  return (
    <>
      <Rise className="pt-3">
        <div className="flex items-start gap-3 border-b border-hairline pb-4">
          <UserPlus size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
          <div className="min-w-0">
            <p className="text-[13px] text-snow">
              {requests.length} {requests.length === 1 ? "person is" : "people are"} asking to
              join
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{ACCEPT_MEANS_VISIBLE}</p>
          </div>
        </div>
      </Rise>

      <Rise className="pt-1">
        <ul className="divide-y divide-hairline">
          {requests.map((request) => {
            const name = displayName(request);
            return (
              <li key={request.profileId} className="py-3">
                <div className="flex items-start gap-3">
                  <PersonAvatar person={request} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-snow">
                      {name ?? "Profile not available"}
                    </p>
                    <p className="tnum mt-0.5 text-[11px] text-mist-dim">
                      {request.requestedAt ? `Asked ${fmtRelative(request.requestedAt)}` : "Asked"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled={busy}
                    onClick={async () => {
                      const done = await decide(groupId, request.profileId, true);
                      if (done) setOutcome({ label: name ?? "That person", accepted: true });
                    }}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    disabled={busy}
                    onClick={async () => {
                      const done = await decide(groupId, request.profileId, false);
                      if (done) setOutcome({ label: name ?? "That person", accepted: false });
                    }}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Rise>

      {outcome && (
        <Rise className="pt-2.5">
          <p className="text-[11px] leading-relaxed text-mist-dim" role="status">
            {outcome.accepted
              ? `${outcome.label} was accepted, and is not on the roster yet. Only their own device can take the place — ICEFALL cannot do it from here — so they appear the next time they open this group.`
              : `${outcome.label} was declined. They will see it the next time they open this group; ICEFALL sends nobody a message about it, and the answer is kept so they cannot ask again.`}
          </p>
        </Rise>
      )}

      {error && (
        <Rise className="pt-2.5">
          <p className="text-[12px] leading-relaxed text-danger">{error}</p>
        </Rise>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 3 — The conversation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * What has been said in the group, oldest first, with the pictures.
 *
 * IT DOES NOT ARRIVE BY ITSELF. There is no live feed in this build, so the
 * refresh is a thing a person does and is labelled as one — dressing it up as
 * an inbox that fills itself would have somebody sitting on a screen waiting
 * for a message that is already there, or worse, believing they would be told.
 *
 * NO EDIT CONTROL EXISTS ANYWHERE BELOW. `group_messages` has no update policy
 * and no update grant: a message is stood behind or deleted, never rewritten
 * under the replies to it.
 */
/*
 * `canModerate` IS THE ORGANISER, NOT THE PERSON WHO STARTED IT. The database
 * lets a group's organiser remove any message in it, and after the roles
 * migration those are two different people the moment a group is handed on.
 * It comes from the page's one roster read, so an organiser whose roster did
 * not come back is shown no bin rather than one that could not work.
 */
function Conversation({ groupId, canModerate }: { groupId: string; canModerate: boolean }) {
  const { messages, state, message, reload } = useGroupMessages(groupId);

  if (state === "loading") {
    return (
      <Rise className="pt-3">
        <Card>
          <p className="text-[13px] text-mist-dim">Reading the conversation…</p>
        </Card>
      </Rise>
    );
  }

  if (state !== "ready") {
    return (
      <Rise className="pt-3">
        <SpaceAbsence
          status={state}
          message={message}
          onRetry={reload}
          detail={
            state === "members-only" ? (
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">A member sees the whole conversation from its beginning, including everything said before they joined.</p>
            ) : (
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">No messages are drawn rather than a few.</p>
            )
          }
        />
      </Rise>
    );
  }

  return (
    <>
      {messages.length === 0 ? (
        <Rise className="pt-3">
          <Card>
            <div className="flex items-start gap-3">
              <MessageSquare
                size={16}
                strokeWidth={1.5}
                className="mt-0.5 shrink-0 text-mist-dim"
              />
              <div className="min-w-0">
                <p className="text-[13px] text-snow">Nothing said yet</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                  You are in this group and nobody has written anything. This is an empty
                  conversation rather than a closed one — whatever you write here reaches every
                  member.
                </p>
              </div>
            </div>
          </Card>
        </Rise>
      ) : (
        <Rise className="pt-3">
          <ul className="divide-y divide-hairline">
            {messages.map((entry) => (
              <li key={entry.id} className="py-3">
                <MessageRow message={entry} canDelete={entry.mine || canModerate} />
              </li>
            ))}
          </ul>

          {/* The reason for the disabled bins, immediately under them. */}
          <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">Deleting is not wired up yet, so the bins above do nothing and say so.</p>
        </Rise>
      )}

      <Rise className="pt-3">
        <MessageComposer groupId={groupId} />
      </Rise>

      <Rise className="pt-3">
        <Button variant="ghost" size="sm" className="w-full" onClick={reload}>
          <RotateCw size={14} strokeWidth={1.8} aria-hidden="true" />
          Check for anything new
        </Button>
        <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">The conversation does not update on its own in this build, and nothing notifies you.</p>
      </Rise>
    </>
  );
}

function MessageRow({ message, canDelete }: { message: GroupMessage; canDelete: boolean }) {
  const name = displayName(message.author);

  return (
    <div>
      <div className="flex items-start gap-3">
        <PersonAvatar person={message.author} size={28} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-mist">
            {name ?? "Profile not available"}
            <span className="tnum text-mist-dim"> · {fmtRelative(message.createdAt)}</span>
            {message.mine && <span className="text-mist-dim"> · you</span>}
          </p>

          {message.body && (
            <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-snow">
              {linkify(message.body)}
            </p>
          )}

          {message.media && (
            <img
              src={message.media.url}
              /* Provenance, not a description. ICEFALL has not looked at the
                 picture and will not narrate what is in it. */
              alt={`Picture shared in this group${name ? ` by ${name}` : ""}`}
              loading="lazy"
              className="mt-2.5 max-h-[340px] w-full rounded-tile border border-hairline object-cover"
            />
          )}

          {message.mediaUnavailable && (
            /* The message is still drawn. Dropping it would hide something
               somebody really said; an <img> at an unsigned path would draw a
               broken frame and blame the sender for it. */
            <div className="mt-2.5 flex items-start gap-2.5 rounded-tile border border-dashed border-hairline p-3">
              <ImageOff size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
              <p className="text-[11px] leading-relaxed text-mist-dim">A picture was sent and could not be loaded.</p>
            </div>
          )}
        </div>

        {canDelete && (
          <button
            type="button"
            disabled
            /* Disabled, with the reason on the control itself and again under
               the list. The database allows this delete — the author's own, and
               any of them for the organiser — and ICEFALL's group data layer has
               no call for it yet. Whoever adds one wires it here. */
            title="Deleting a message is not wired up yet"
            aria-label="Delete this message — not wired up yet"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-mist-dim opacity-40"
          >
            <Trash2 size={14} strokeWidth={1.6} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Words, a picture, or both — and NEVER neither.
 *
 * `group_message_has_content` refuses a message with no body and no picture at
 * the database, so the send control is dark until there is one or the other.
 * The button says SEND, which is a word this file has refused elsewhere: the
 * planning log further up writes to this device and says so, and this one
 * really does reach every member of the group. The difference is the whole
 * reason both exist.
 */
function MessageComposer({ groupId }: { groupId: string }) {
  const { send, error, busy } = useGroupActions();
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const noticeId = useId();

  // An object URL outlives the component that made it, so the preview is
  // released when it is replaced and when the composer goes away.
  useEffect(() => {
    if (!picked) return;
    return () => URL.revokeObjectURL(picked.url);
  }, [picked]);

  const words = draft.trim();
  const overLimit = words.length > MAX_MESSAGE_BODY;
  const canSend = (words.length > 0 || picked !== null) && !overLimit && !busy;

  async function submit() {
    if (!canSend) return;
    const sent = await send(groupId, words.length > 0 ? words : undefined, picked?.file);
    // Cleared only on a witnessed success. A composer that emptied itself on a
    // failure would take somebody's words away and leave them believing the
    // party had been told something.
    if (!sent) return;
    setDraft("");
    setPicked(null);
  }

  return (
    <Card>
      <p id={noticeId} className="text-[12px] leading-relaxed text-mist">
        Everything here goes to ICEFALL's server and every member of this group can read it —
        including anybody accepted later, who gets the conversation from its beginning.
      </p>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        aria-label="Write a message to this group"
        aria-describedby={noticeId}
        placeholder="Write something for the group…"
        className="mt-3 w-full resize-none rounded-tile border border-hairline bg-elevated/40 p-3.5 text-[13px] leading-relaxed text-snow outline-none placeholder:text-mist-dim focus:border-azure/50"
      />

      {picked && (
        <div className="relative mt-2.5 overflow-hidden rounded-tile border border-hairline">
          <img
            src={picked.url}
            alt="The picture you are about to send"
            className="max-h-[200px] w-full object-cover"
          />
          <button
            type="button"
            onClick={() => setPicked(null)}
            aria-label="Take the picture off this message"
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-obsidian/75 text-snow"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      <input
        ref={picker}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset first, so choosing the same file twice still fires.
          e.target.value = "";
          if (!file) return;
          setPicked({ file, url: URL.createObjectURL(file) });
        }}
      />

      <div className="mt-2.5 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          disabled={busy}
          onClick={() => picker.current?.click()}
        >
          <ImagePlus size={15} strokeWidth={1.7} aria-hidden="true" />
          {picked ? "Change picture" : "Add a picture"}
        </Button>

        {/* The count appears once it is worth watching, and turns only when the
            server would actually refuse. */}
        {words.length > MAX_MESSAGE_BODY - 400 && (
          <span className={cn("tnum text-[11px]", overLimit ? "text-danger" : "text-mist-dim")}>
            {words.length}/{MAX_MESSAGE_BODY}
          </span>
        )}

        <Button
          className="ml-auto shrink-0"
          size="sm"
          disabled={!canSend}
          onClick={() => void submit()}
        >
          <Send size={15} strokeWidth={1.8} aria-hidden="true" />
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>

      {error && <p className="mt-2.5 text-[12px] leading-relaxed text-danger">{error}</p>}

      <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
        Pictures only, saved again without their location or camera details before they are sent.
      </p>
    </Card>
  );
}
