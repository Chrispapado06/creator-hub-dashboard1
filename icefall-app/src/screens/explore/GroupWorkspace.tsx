import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { REFERENCE_NO_KIT_LIST, REFERENCE_NO_READINESS } from "@/services/peakTier";
import { DateField } from "@/components/ui/DateField";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CalendarPlus,
  CalendarRange,
  ChevronRight,
  CloudOff,
  Globe,
  Hourglass,
  ImageOff,
  ImagePlus,
  KeyRound,
  Link2Off,
  Lock,
  MessageSquare,
  Mountain as MountainIcon,
  NotebookPen,
  RotateCw,
  SearchX,
  Send,
  Share2,
  ShieldAlert,
  Trash2,
  Unplug,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { Avatar, Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { FactorBar, ScoreRing } from "@/components/coach/CoachUI";
import { QualifierBadge, UnavailableState, type DataQualifier } from "@/components/coach/DataState";
import { OperatorCard } from "@/components/domain/OperatorCard";
import { MountainThumb, useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtDate, fmtElevation, fmtRelative } from "@/lib/format";
import { isKnown, known, unavailable, type Score } from "@/coach/types";
import {
  OBJECTIVE_READINESS_DISCLAIMER,
  assessObjectiveReadiness,
} from "@/coach/mountainReadiness";
import {
  CHECKLIST_DISCLAIMER,
  STATUS_LABEL,
  completion,
  generateChecklist,
  type ChecklistItem,
  type ItemStatus,
} from "@/services/checklist";
import { DEMO_NOTICE, OPERATOR_DISCLAIMER, operatorsFor } from "@/services/operators";
import { operatorSearchUrl } from "@/services/expeditionAccess";
import { useRecordedActivities } from "@/tracking/feed";
import { useApp } from "@/state/AppState";
import { SAFETY_REMINDER } from "@/network/privacy";
import {
  EXPERIENCE_LABELS,
  LOCAL_ATHLETE_ID,
  LOOKING_FOR_LABELS,
  NETWORK_NOT_CONNECTED_NOTICE,
  experienceFromAppLevel,
  type Expedition,
} from "@/network/types";
import {
  CHECKLIST_SHARING_NOTICE,
  GROUP_CHAT_NOTICE,
  GROUP_READINESS_NOTE,
  GROUP_STYLE_LABELS,
  RSVP_LABELS,
  SHARE_LINK_UNAVAILABLE,
  formatDay,
  formatWindow,
  groupSummary,
  meanReadiness,
  parseDay,
  todayKey,
  windowCountdown,
  type GroupStyle,
  type GroupTrainingSession,
  type RsvpStatus,
} from "@/network/groups";
import {
  ACCEPTED_NOT_SEATED,
  ACCEPT_MEANS_VISIBLE,
  GROUP_SPACE_REFUSED,
  MAX_IMAGE_BYTES,
  MAX_MESSAGE_BODY,
  PRIVATE_MEANS_ASK,
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
 * The group workspace — the private planning surface behind one party.
 *
 * THIS IS WHY THE FEATURE IS WORTH HAVING AT ONE MEMBER. Everything here works
 * for a party of one and stays useful: the countdown, the kit list, the sessions
 * and the notes are all planning for a mountain, and none of them need anybody
 * else to exist. What needs other people — a message arriving, a member joining,
 * a shared checklist actually reaching somebody — is exactly what this screen
 * refuses to imply.
 *
 * THE RULES IT ENFORCES RATHER THAN MENTIONS
 *
 *   1. NO INVENTED MEMBER. The member list draws the athlete on this device and
 *      nothing else. Open places are stated as places, never filled.
 *   2. GROUP READINESS IS NOT A LEAGUE TABLE. It is the mean of the members
 *      ICEFALL has a figure for, drawn once for the party. Members are listed in
 *      the order they joined, never sorted by readiness, and no member is ever
 *      compared with another.
 *   3. EVERY FIGURE CARRIES ITS PROVENANCE. Readiness is derived or
 *      self-reported and says which, every time it is drawn. It is never a
 *      measurement and never a clearance to climb.
 *   4. NOTHING IS DELIVERED. Messages, RSVPs and checklist sharing are held on
 *      this device. Each surface says so BEFORE the athlete writes, not after.
 *   5. NO LINK. There is no ICEFALL page for a group, so the share surface
 *      offers text and explains the absence of a URL rather than producing one
 *      that would 404 for whoever received it.
 */

/* -------------------------------------------------------------------------- */
/* The mountain behind the group                                               */
/* -------------------------------------------------------------------------- */

interface GroupPeak {
  name: string;
  /** Only ever the figure recorded on the group itself. Never borrowed. */
  elevationM?: number;
  lat?: number;
  lon?: number;
  country?: string;
  photo?: string;
  wikipedia?: string;
  /** The athlete's goal for this mountain, when they have one. */
  goalId?: string;
  /**
   * The curated record's id, when the group's mountain is one ICEFALL has
   * surveyed. Readiness and the shared kit list are derived from an elevation
   * band, and for a reference entry that band is the only "assessment" there
   * is — so both are withheld without it, the same as on the goal's own pages.
   */
  curatedId?: string;
}

/**
 * What ICEFALL knows about the group's mountain.
 *
 * The elevation is ONLY ever the one stored on the group when it was created —
 * it came from OpenStreetMap through the create form, and every assessment
 * downstream is derived from it. The coordinates, photograph and country are
 * borrowed from the athlete's own goal or saved objective of the same name, and
 * ONLY when that record's elevation agrees with the group's to within 50 m.
 * Without that check a name collision — two peaks called Pico Norte — would
 * quietly hand this screen the wrong latitude, and latitude decides the permit
 * region on the kit list and the season on the assessment.
 */
function useGroupPeak(group: Expedition): GroupPeak {
  const { goals, objectives } = useApp();

  return useMemo(() => {
    const name = group.peakName;
    const needle = name.trim().toLowerCase();
    const elevationM = group.elevationM;

    const agrees = (candidate: number | undefined) =>
      typeof elevationM === "number" &&
      typeof candidate === "number" &&
      Math.abs(candidate - elevationM) <= 50;

    const goal = goals.find((g) => g.name.trim().toLowerCase() === needle && agrees(g.elevationM));
    const objective = objectives.find(
      (o) => o.name.trim().toLowerCase() === needle && agrees(o.elevationM),
    );

    return {
      name,
      elevationM,
      lat: goal?.lat ?? objective?.lat,
      lon: goal?.lon ?? objective?.lon,
      country: goal?.country,
      photo: goal?.photo ?? objective?.photo,
      wikipedia: goal?.wikipedia ?? objective?.wikipedia,
      goalId: goal?.id,
      curatedId: goal?.mountainId ?? objective?.curatedId,
    };
  }, [group.peakName, group.elevationM, goals, objectives]);
}

/* -------------------------------------------------------------------------- */
/* Readiness for the athlete on this device                                    */
/* -------------------------------------------------------------------------- */

interface DerivedReadiness {
  /** A value or the reason there isn't one. Never a zero standing in for either. */
  score: Score;
  qualifier: DataQualifier;
  note: string;
}

/**
 * The local athlete's readiness for this group's mountain.
 *
 * DERIVED from the sessions they recorded and from what they told ICEFALL, and
 * never measured — which is why every row that draws it carries a qualifier
 * badge and this note. It is not a clearance either: the engine withholds a
 * composite whenever a dimension the objective turns on is unknown, and this
 * hook passes that absence straight through rather than substituting a figure.
 */
function useMemberReadiness(peak: GroupPeak): DerivedReadiness {
  const { objectives, coachProfile } = useApp();
  const activities = useRecordedActivities();
  const { name, elevationM, lat, lon, curatedId } = peak;

  return useMemo<DerivedReadiness>(() => {
    if (typeof elevationM !== "number" || !Number.isFinite(elevationM)) {
      return {
        score: unavailable("no-data"),
        qualifier: "estimated",
        note: `No elevation is recorded for ${name}, and ICEFALL reads the class of an objective from its elevation. There is nothing to assess against rather than a guess at one.`,
      };
    }
    if (!curatedId) {
      return {
        score: unavailable("no-data"),
        qualifier: "estimated",
        note: `${name} is a reference entry. ${REFERENCE_NO_READINESS}`,
      };
    }

    // Simulated recordings are excluded, as everywhere else that answers "has
    // this person been on that kind of ground". A labelled simulation is not
    // evidence that they have.
    const recorded = activities.filter((a) => !a.simulated);
    const summits = objectives
      .filter((o): o is typeof o & { summitedAt: string } => typeof o.summitedAt === "string")
      .map((o) => ({ name: o.name, elevationM: o.elevationM, date: o.summitedAt }));

    const readiness = assessObjectiveReadiness({
      peak: { name, elevationM, lat, lon },
      activities: recorded,
      summitsLogged: summits,
      selfReported: {
        technicalSkills: coachProfile.technicalSkills,
        maxAltitudeM: coachProfile.maxAltitudeM,
        disciplineExperience: coachProfile.disciplineExperience,
      },
    });

    // Disclosed conservatively: if anything the athlete told us could have
    // reached the figure, it is labelled self-reported. Over-disclosing costs
    // nothing; under-disclosing puts an unearned number next to a name.
    const selfReported =
      readiness.dimensions.some((d) => d.provenance === "self-reported") ||
      coachProfile.technicalSkills.length > 0 ||
      typeof coachProfile.maxAltitudeM === "number" ||
      Object.keys(coachProfile.disciplineExperience).length > 0 ||
      summits.length > 0;

    const note = isKnown(readiness.overall)
      ? `Derived from the sessions you have recorded${selfReported ? " and what you have told ICEFALL" : ""}, against ICEFALL's training benchmarks for this class of objective. Never measured, and not a statement that you are ready to climb ${name}.`
      : `No single figure: ${
          readiness.biggestGap
            ? `${readiness.biggestGap.label.toLowerCase()} is unknown`
            : "a dimension this objective turns on is unknown"
        }, and a number built from the parts that happen to be known would read as a verdict on the whole mountain.`;

    return {
      score: readiness.overall,
      qualifier: selfReported ? "self-reported" : "estimated",
      note,
    };
  }, [curatedId, name, elevationM, lat, lon, activities, objectives, coachProfile]);
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * ONE ROUTE, TWO KINDS OF GROUP, AND THEY ARE NOT THE SAME THING.
 *
 * `/social/groups/:id` (`/explore/groups/:id` before the move, still redirected)
 * has always resolved against `expeditions` — the parties
 * this athlete plans on this device, whose ids are `expedition-<timestamp>`.
 * That workspace is below and is unchanged: it is planning, it works at one
 * member, and it has never needed a server.
 *
 * A GROUP ON ICEFALL'S SERVER is a different record with a different id — a
 * uuid — and a different promise: other people are in it, the roster is theirs,
 * and there is a conversation. That is the second half of this file, and it
 * starts at "The group as a place".
 *
 * The two are told apart by the SHAPE OF THE ID rather than by asking the
 * server, because `.eq("id", "expedition-3")` is a type error in Postgres and
 * would come back as "the server refused that" — a sentence about the server,
 * for a link that was never a server link.
 */
export default function GroupWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { expeditions } = useApp();

  const group = expeditions.find((e) => e.id === id);

  // Keyed by id so switching groups rebuilds the local state of every section
  // rather than carrying one group's draft message into another's.
  if (group) return <Workspace key={group.id} group={group} />;

  if (id && SERVER_GROUP_ID.test(id)) return <GroupSpaceScreen key={id} groupId={id} />;
  return <NoGroupUnderThatLink />;
}

function Workspace({ group }: { group: Expedition }) {
  const { groupStyle, setGroupStyle } = useApp();
  const peak = useGroupPeak(group);
  const countdown = windowCountdown(group.window);
  const style = groupStyle[group.id];

  return (
    <Screen>
      {/* `back` IS NOT DECORATION HERE. This screen used to be routed under
          `/explore`, and `ExploreLayout`'s chevron was the only way off it —
          this header had none of its own. At `/social/groups/:id` there is no
          layout above it, so without this the workspace had no back control at
          all: reachable, but only leaveable through the bottom tab bar.
          HISTORY, not a fixed path, because this is opened from the Groups
          list, from the create flow's "Open the workspace", from a join and
          from search, and each of those deserves to be returned to. The
          server-group space further down this file already does exactly this. */}
      <ScreenHeader title={group.peakName} subtitle="Group workspace" back />

      <Stagger>
        <Rise>
          <Hero group={group} peak={peak} />
        </Rise>

        <Rise className="pt-4">
          <Card>
            <div className="flex items-start gap-2.5">
              <CalendarRange size={15} strokeWidth={1.5} className="mt-[3px] shrink-0 text-azure" />
              <div className="min-w-0">
                <p className="tnum text-[14px] text-snow">{formatWindow(group.window)}</p>
                {/* Both ends of the countdown are local midnights, so this is
                    days on the athlete's own calendar. */}
                <p className="tnum mt-1 text-[12px] text-mist">{countdown.label}</p>
                {countdown.note && (
                  <p className="tnum mt-0.5 text-[11px] text-mist-dim">{countdown.note}</p>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-hairline pt-4">
              <Badge tone="neutral">{EXPERIENCE_LABELS[group.experience]} · self-declared</Badge>
              <Badge tone="neutral">
                Party of {group.sizeMin}–{group.sizeMax}
              </Badge>
              <Badge tone="neutral">{group.privacy === "public" ? "Public" : "Invite-only"}</Badge>
              {group.lookingFor.map((l) => (
                <Badge key={l} tone="neutral">
                  {LOOKING_FOR_LABELS[l]}
                </Badge>
              ))}
            </div>

            {group.description?.trim() && (
              <p className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-mist">
                {group.description.trim()}
              </p>
            )}
          </Card>
        </Rise>

        <Rise className="pt-5">
          <StyleChooser
            style={style}
            onChange={(next) => setGroupStyle(group.id, next)}
            peakName={group.peakName}
          />
        </Rise>

        <Rise className="pt-8">
          <SectionLabel>Members · {group.memberIds.length}</SectionLabel>
        </Rise>
        <Members group={group} peak={peak} />

        <Rise className="pt-8">
          <SectionLabel>Shared checklist</SectionLabel>
        </Rise>
        <SharedChecklist group={group} peak={peak} />

        <Rise className="pt-8">
          <SectionLabel>Training together</SectionLabel>
        </Rise>
        <Sessions group={group} />

        <Rise className="pt-8">
          <SectionLabel>Group notes</SectionLabel>
        </Rise>
        <Notes group={group} />

        <Rise className="pt-8">
          <SectionLabel>Group messages</SectionLabel>
        </Rise>
        <Chat group={group} />

        <Rise className="pt-8">
          <SectionLabel>Find an expedition</SectionLabel>
        </Rise>
        <Operators peak={peak} />

        <Rise className="pt-8">
          <SectionLabel>Share this group</SectionLabel>
        </Rise>
        <Share group={group} style={style} peak={peak} />

        <Rise className="pt-8">
          <SectionLabel>Before you meet anyone</SectionLabel>
          <Card className="mt-3">
            <p className="text-[12px] leading-relaxed text-mist">{SAFETY_REMINDER}</p>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <LeaveGroup group={group} />
        </Rise>

        <Rise className="pt-6">
          <Disclaimer>{NETWORK_NOT_CONNECTED_NOTICE}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
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
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

function Hero({ group, peak }: { group: Expedition; peak: GroupPeak }) {
  const image = useMountainImage({
    name: peak.name,
    elevationM: peak.elevationM,
    lat: peak.lat,
    lon: peak.lon,
    photo: peak.photo,
    wikipedia: peak.wikipedia,
  });

  return (
    <Card inset={false} className="overflow-hidden">
      <div className="grain relative aspect-[16/10] w-full overflow-hidden bg-slate">
        <img
          src={image.src}
          alt={image.real ? peak.name : ""}
          aria-hidden={image.real ? undefined : true}
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            image.real ? "opacity-100" : "opacity-45",
          )}
        />
        <div className="absolute inset-0 scrim-bottom" />

        {/* Band artwork is never allowed to pass as a photograph of the summit. */}
        {!image.real && (
          <span
            title={image.caption}
            className="absolute right-3 top-3 rounded-full border border-hairline-strong bg-obsidian/70 px-2 py-[3px] text-[9px] font-medium uppercase tracking-[0.1em] text-mist backdrop-blur"
          >
            Representative terrain
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 p-4">
          <h2 className="display truncate text-[30px] leading-tight text-snow">{peak.name}</h2>
          <p className="tnum mt-1 text-[12px] text-mist">
            {typeof peak.elevationM === "number"
              ? `${fmtElevation(peak.elevationM)} m`
              : "Elevation not recorded"}
            {" · "}
            {group.memberIds.length} of {group.sizeMax} members
          </p>
        </div>
      </div>
      {image.credit && <p className="px-4 py-2 text-[10px] text-mist-dim">{image.credit}</p>}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Guided or independent                                                       */
/* -------------------------------------------------------------------------- */

const STYLE_OPTIONS: GroupStyle[] = ["guided", "independent"];

/**
 * How the party intends to climb.
 *
 * Unset by default and clearable back to unset, because "not recorded" is a
 * real answer and the alternative — defaulting to independent — would have
 * ICEFALL asserting that a party is going without a guide. The note underneath
 * is the point of the control: recording it changes nothing about what the
 * mountain demands.
 */
function StyleChooser({
  style,
  onChange,
  peakName,
}: {
  style: GroupStyle | undefined;
  onChange: (style: GroupStyle | null) => void;
  peakName: string;
}) {
  return (
    <Card>
      <p className="text-[14px] text-snow">How is the party climbing?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {STYLE_OPTIONS.map((id) => {
          const selected = style === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              // Tapping the active choice clears it back to not recorded, so a
              // mis-tap is one tap to undo rather than a standing claim.
              onClick={() => onChange(selected ? null : id)}
              className={cn(
                "rounded-full border px-3.5 py-2 text-[12px] transition-colors",
                selected
                  ? "border-azure/50 bg-azure/[0.08] text-snow"
                  : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
              )}
            >
              {GROUP_STYLE_LABELS[id]}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
        {style === undefined
          ? "Not recorded. It is only ever what you intend — ICEFALL will not assume a party is climbing without a guide."
          : `Recorded as your intention for ${peakName}. It changes nothing about what the mountain demands: ICEFALL defers to an IFMGA/UIAGM-certified guide for anything glaciated, technical or at altitude.`}
      </p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Members                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The real membership, and only the real membership.
 *
 * One athlete exists on this device, so one row is drawn. Nothing fills the
 * remaining places — an empty seat is the truth, and a plausible name in it
 * would be a person somebody might plan a mountain around. The order is the
 * membership order and never the readiness order: this is a party, not a
 * leaderboard.
 */
function Members({ group, peak }: { group: Expedition; peak: GroupPeak }) {
  const { myProfile } = useApp();
  const readiness = useMemberReadiness(peak);

  const meId = myProfile?.id ?? LOCAL_ATHLETE_ID;
  const isMe = (memberId: string) => memberId === meId || memberId === LOCAL_ATHLETE_ID;

  // Unresolved members contribute an unknown, which the mean drops from both
  // sides rather than scoring as zero.
  const scores = group.memberIds.map((memberId) =>
    isMe(memberId) ? readiness.score : unavailable("no-data"),
  );
  const groupReadiness = meanReadiness(scores);
  const openPlaces = Math.max(0, group.sizeMax - group.memberIds.length);

  return (
    <>
      <Rise className="pt-3">
        <Card>
          <div className="flex flex-col items-center">
            <ScoreRing score={groupReadiness.score} unit="/100" size={116} />
            <p className="section-label mt-3">Group readiness</p>
            {isKnown(groupReadiness.score) && (
              <p className="tnum mt-2 text-center text-[12px] text-mist">
                The mean of {groupReadiness.contributing}{" "}
                {groupReadiness.contributing === 1 ? "member" : "members"} of{" "}
                {groupReadiness.members}.
              </p>
            )}
          </div>
          <p className="mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
            {GROUP_READINESS_NOTE}
          </p>
        </Card>
      </Rise>

      <Rise className="pt-3">
        <ul className="space-y-3">
          {group.memberIds.map((memberId) => (
            <li key={memberId}>
              {isMe(memberId) ? (
                <YouRow group={group} peak={peak} readiness={readiness} />
              ) : (
                <UnresolvedMemberRow />
              )}
            </li>
          ))}
        </ul>

        {openPlaces > 0 && (
          <p className="tnum mt-3 text-[11px] leading-relaxed text-mist-dim">
            {openPlaces} {openPlaces === 1 ? "place is" : "places are"} open and nobody is in{" "}
            {openPlaces === 1 ? "it" : "them"}. ICEFALL has no other members, so there is nobody to
            fill {openPlaces === 1 ? "it" : "them"} from.
          </p>
        )}
      </Rise>

      <Rise className="pt-4">
        <Disclaimer>{OBJECTIVE_READINESS_DISCLAIMER}</Disclaimer>
      </Rise>
    </>
  );
}

/** The athlete using this device. The only person ICEFALL knows anything about. */
function YouRow({
  group,
  peak,
  readiness,
}: {
  group: Expedition;
  peak: GroupPeak;
  readiness: DerivedReadiness;
}) {
  const { user, account, myProfile } = useApp();

  const name = myProfile?.displayName?.trim() || account?.name || user.name;
  // Their own onboarding answer, relabelled onto the network's scale. Nothing
  // is inferred from recorded training — no session says what anyone can lead.
  const experience = myProfile?.experience ?? experienceFromAppLevel(user.experience);
  const createdThis = group.createdBy === (myProfile?.id ?? LOCAL_ATHLETE_ID);

  return (
    <div className="rounded-tile border border-hairline p-3">
      <div className="flex items-start gap-3">
        <Avatar name={name} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-snow">{name}</p>
          <p className="mt-0.5 text-[11px] text-mist-dim">
            You{createdThis ? " · created this group" : ""} ·{" "}
            {EXPERIENCE_LABELS[experience].toLowerCase()}, self-declared
          </p>
        </div>

        <div className="shrink-0 text-right">
          {isKnown(readiness.score) ? (
            <>
              <p className="tnum text-[17px] font-extralight leading-none text-snow">
                {readiness.score.value}
                <span className="ml-0.5 text-[10px] font-normal text-mist">/100</span>
              </p>
              <span className="mt-1.5 inline-block">
                <QualifierBadge kind={readiness.qualifier} />
              </span>
            </>
          ) : (
            <UnavailableState reason={readiness.score.reason ?? "no-data"} size="sm" />
          )}
        </div>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
        Readiness for {peak.name}. {readiness.note}
      </p>
    </div>
  );
}

/**
 * A member id this device holds no profile for.
 *
 * Unreachable today — memberIds only ever contains the local athlete — but if a
 * record ever arrives from elsewhere, the row says what it does not know rather
 * than rendering a name, a photograph or a readiness figure it invented.
 */
function UnresolvedMemberRow() {
  return (
    <div className="flex items-start gap-3 rounded-tile border border-dashed border-hairline p-3">
      <span
        aria-hidden="true"
        className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-dashed border-hairline-strong text-mist-dim"
      >
        <Users size={14} strokeWidth={1.4} />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] text-snow">Member not on this device</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-mist-dim">
          ICEFALL holds no profile for this member and will not invent one, so they are left out of
          the group readiness average rather than counted as a zero.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared checklist                                                            */
/* -------------------------------------------------------------------------- */

const STATUSES: ItemStatus[] = ["have", "need", "replace", "borrow", "rent", "n/a"];

/**
 * The kit list for the objective, and the athlete's own statuses against it.
 *
 * "Shared" is the intention, not the mechanism. What somebody has and has not
 * sorted is theirs: sharing is off until they turn it on, turning it on
 * transmits nothing, and with one member there is nobody it could reach anyway.
 * The switch is here because the decision is real and worth recording before a
 * backend exists — not because anything happens when it moves.
 *
 * The statuses shown are the athlete's own. Where they already have a goal for
 * this mountain, this IS that goal's equipment list rather than a second copy
 * of it, so ticking a row here and on the Equipment screen cannot disagree.
 */
function SharedChecklist({ group, peak }: { group: Expedition; peak: GroupPeak }) {
  const {
    checklistStatuses,
    setChecklistStatus,
    clearChecklistStatus,
    groupChecklistShared,
    setGroupChecklistShared,
  } = useApp();
  const [open, setOpen] = useState(false);

  const elevationM = peak.elevationM;

  // Surveyed mountains only: the generator reads an elevation band, and on a
  // reference entry that would put crampons on a volcano with no glacier
  // (`REFERENCE_NO_KIT_LIST` records the case).
  const generated = useMemo(
    () =>
      typeof elevationM === "number" && peak.curatedId
        ? generateChecklist({ name: peak.name, elevationM, lat: peak.lat, lon: peak.lon })
        : null,
    [peak.name, elevationM, peak.lat, peak.lon, peak.curatedId],
  );

  // Keyed to the athlete's goal when one exists for this mountain, so the group
  // and the Equipment screen are the same list. Otherwise keyed to the group,
  // which keeps a group's kit list from silently overwriting a goal's.
  const key = peak.goalId ?? `group:${group.id}`;
  const statuses = useMemo(() => checklistStatuses[key] ?? {}, [checklistStatuses, key]);
  const progress = useMemo(
    () => (generated ? completion(generated.items, statuses) : null),
    [generated, statuses],
  );
  const shared = groupChecklistShared[group.id] === true;

  if (!generated || !progress) {
    return (
      <Rise className="pt-3">
        <Card className="py-8">
          {/* No elevation means no band, and the whole list is derived from the
              band. Guessing one would produce a confident kit list for a
              mountain ICEFALL knows nothing about. */}
          <UnavailableState reason="no-data" size="lg" />
          <p className="mt-4 text-center text-[13px] leading-relaxed text-mist">
            {typeof elevationM === "number" && !peak.curatedId
              ? `${peak.name} is a reference entry. ${REFERENCE_NO_KIT_LIST}`
              : `This group has no elevation recorded for ${peak.name}, so ICEFALL cannot work out what class of mountain it is — and the kit list follows entirely from that.`}
          </p>
        </Card>
      </Rise>
    );
  }

  return (
    <>
      <Rise className="pt-3">
        <Card>
          <div className="flex flex-col items-center">
            <ScoreRing
              // Never a zero standing in for "nothing to count". When every item
              // is struck out as not applicable the ring is dashed instead.
              score={progress.applicable === 0 ? unavailable("no-data") : known(progress.overall)}
              unit="%"
              size={116}
            />
            {progress.applicable > 0 && (
              <>
                <p className="tnum mt-3 text-[13px] text-snow">
                  {progress.resolved} of {progress.applicable} sorted
                </p>
                <p className="mt-1.5 max-w-[36ch] text-center text-[11px] leading-relaxed text-mist-dim">
                  Have, borrowing and renting count towards this. Anything marked N/A is left out
                  entirely, and anything you have not reviewed counts as outstanding.
                </p>
              </>
            )}
          </div>

          <p className="mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
            {peak.goalId
              ? "These are your own statuses, and this is the same list as the Equipment screen for this objective — not a second copy of it."
              : "These are your own statuses, recorded here for this group. Add this mountain as an objective to plan the kit alongside your training."}
          </p>

          {peak.goalId && (
            <Button asChild variant="secondary" className="mt-3 w-full">
              <Link to={`/mountain/${peak.goalId}/checklist`}>
                Open the full equipment screen
                <ChevronRight size={15} strokeWidth={1.8} aria-hidden="true" />
              </Link>
            </Button>
          )}
        </Card>
      </Rise>

      <Rise className="pt-3">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] text-snow">Share my statuses with the group</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                {CHECKLIST_SHARING_NOTICE}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={shared}
              aria-label="Share my checklist statuses with the group"
              onClick={() => setGroupChecklistShared(group.id, !shared)}
              className={cn(
                "mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors",
                shared ? "border-azure/50 bg-azure/[0.18]" : "border-hairline bg-white/[0.04]",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "block h-4 w-4 rounded-full bg-snow/80 transition-transform",
                  shared ? "translate-x-[26px]" : "translate-x-[3px]",
                )}
              />
            </button>
          </div>
          {shared && (
            <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
              Recorded. Nothing has been shared and nobody has been shown anything — there is no
              server to share through, and no other member to share with.
            </p>
          )}
        </Card>
      </Rise>

      <Rise className="pt-3">
        <Card inset={false}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
          >
            <span className="flex-1 text-[13px] text-snow">
              {open ? "Hide the kit list" : "Show the kit list"}
            </span>
            <span className="tnum text-[11px] text-mist-dim">{generated.items.length} items</span>
          </button>

          {open && (
            <div className="border-t border-hairline">
              {generated.categories.map((category) => (
                <div key={category.id} className="border-b border-hairline last:border-b-0">
                  <p className="section-label px-4 pb-1.5 pt-3.5">{category.label}</p>
                  {category.items.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      status={statuses[item.id]}
                      onSet={(status) => setChecklistStatus(key, item.id, status)}
                      onClear={() => clearChecklistStatus(key, item.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      </Rise>

      <Rise className="pt-3">
        <Card>
          <p className="section-label">By category</p>
          <div className="mt-2">
            {generated.categories.map((category) => {
              const applicable = progress.applicableByCategory[category.id];
              return (
                <FactorBar
                  key={category.id}
                  label={category.label}
                  // A category struck out entirely is unknown, not zero per cent.
                  score={
                    applicable === 0
                      ? unavailable("no-data")
                      : known(progress.byCategory[category.id])
                  }
                  note={`${progress.resolvedByCategory[category.id]} of ${applicable} sorted`}
                />
              );
            })}
          </div>
        </Card>
      </Rise>

      <Rise className="pt-4">
        <Disclaimer>{CHECKLIST_DISCLAIMER}</Disclaimer>
      </Rise>
    </>
  );
}

function ChecklistRow({
  item,
  status,
  onSet,
  onClear,
}: {
  item: ChecklistItem;
  status: ItemStatus | undefined;
  onSet: (status: ItemStatus) => void;
  onClear: () => void;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-snow">{item.label}</p>
        {item.essential && <Badge tone="neutral">Essential</Badge>}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {STATUSES.map((s) => {
          const active = status === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              // Tapping the active status clears it rather than re-asserting it,
              // so a mis-tap is one tap to undo instead of a permanent claim.
              onClick={() => (active ? onClear() : onSet(s))}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] transition-colors",
                active
                  ? "border-azure/50 bg-azure/10 text-azure"
                  : "border-hairline-strong text-mist-dim hover:border-azure/30 hover:text-mist",
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Training sessions                                                           */
/* -------------------------------------------------------------------------- */

const RSVP_OPTIONS: RsvpStatus[] = ["going", "maybe", "not-going"];

const INPUT_CLASS =
  "h-11 w-full rounded-tile border border-hairline bg-elevated/40 px-3.5 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50";

/**
 * Sessions the group plans to do together, and who has said they are coming.
 *
 * Local, in both senses. The dates are local day keys rather than instants, so
 * a Saturday session stays on Saturday; and the whole surface is local to this
 * device, so an RSVP tells nobody. Nothing is pre-answered on the athlete's
 * behalf — a session starts with no reply from anyone, including them.
 */
function Sessions({ group }: { group: Expedition }) {
  const { groupSessions, addGroupSession, removeGroupSession, setSessionRsvp, myProfile } =
    useApp();
  const meId = myProfile?.id ?? LOCAL_ATHLETE_ID;

  const sessions = useMemo(
    () =>
      groupSessions
        .filter((s) => s.groupId === group.id)
        // Chronological, so the next thing the party is doing is at the top.
        .sort(
          (a, b) => a.dayKey.localeCompare(b.dayKey) || (a.time ?? "").localeCompare(b.time ?? ""),
        ),
    [groupSessions, group.id],
  );

  return (
    <>
      {sessions.length === 0 ? (
        <Rise className="pt-3">
          <Card>
            <p className="text-[14px] text-snow">Nothing planned yet</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
              Plan the sessions the party will do together before the trip — the long day, the
              glacier refresher, the loaded carry. They are held on this device, so nobody is
              invited and no reminder goes anywhere.
            </p>
          </Card>
        </Rise>
      ) : (
        sessions.map((session) => (
          <Rise key={session.id} className="pt-3">
            <SessionRow
              session={session}
              mine={session.rsvps[meId]}
              onRsvp={(status) => setSessionRsvp(session.id, status)}
              onRemove={() => removeGroupSession(session.id)}
            />
          </Rise>
        ))
      )}

      <Rise className="pt-3">
        <AddSession onAdd={(session) => addGroupSession(group.id, session)} />
      </Rise>
    </>
  );
}

function SessionRow({
  session,
  mine,
  onRsvp,
  onRemove,
}: {
  session: GroupTrainingSession;
  mine: RsvpStatus | undefined;
  onRsvp: (status: RsvpStatus | null) => void;
  onRemove: () => void;
}) {
  const day = parseDay(session.dayKey);
  const today = parseDay(todayKey());
  const past = day !== null && today !== null && day.getTime() < today.getTime();

  // Only the local athlete can ever have replied, so the tally is the honest
  // count of real replies rather than a summary of an invented party.
  const replies = Object.keys(session.rsvps).length;

  return (
    <Card className={cn(past && "opacity-70")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] text-snow">{session.title}</p>
          <p className="tnum mt-1 text-[12px] text-mist">
            {formatDay(session.dayKey)}
            {session.time ? ` · ${session.time}` : ""}
          </p>
          {session.place && <p className="mt-0.5 text-[12px] text-mist-dim">{session.place}</p>}
          {past && <p className="mt-1 text-[11px] text-mist-dim">This date has passed.</p>}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${session.title}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-mist-dim transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <Trash2 size={14} strokeWidth={1.6} />
        </button>
      </div>

      {session.note && (
        <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-mist">
          {session.note}
        </p>
      )}

      <div className="mt-3.5 border-t border-hairline pt-3">
        <p className="section-label">Your reply</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {RSVP_OPTIONS.map((status) => {
            const active = mine === status;
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                // Tapping the active reply clears it back to no reply, which is
                // a different fact from "not going" and must stay reachable.
                onClick={() => onRsvp(active ? null : status)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[11px] transition-colors",
                  active
                    ? "border-azure/50 bg-azure/10 text-azure"
                    : "border-hairline-strong text-mist-dim hover:border-azure/30 hover:text-mist",
                )}
              >
                {RSVP_LABELS[status]}
              </button>
            );
          })}
        </div>
        <p className="tnum mt-2.5 text-[11px] leading-relaxed text-mist-dim">
          {replies === 0
            ? "No replies. Yours is the only one there could be — an RSVP is saved on this device and nobody is told."
            : `${replies} reply, yours. It is saved on this device and nobody is told.`}
        </p>
      </div>
    </Card>
  );
}

function AddSession({
  onAdd,
}: {
  onAdd: (session: {
    title: string;
    dayKey: string;
    time?: string;
    place?: string;
    note?: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [dayKey, setDayKey] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");

  const canAdd = title.trim().length > 0 && dayKey.length > 0;

  const submit = () => {
    if (!canAdd) return;
    onAdd({
      title: title.trim(),
      dayKey,
      time: time.trim() || undefined,
      place: place.trim() || undefined,
      note: note.trim() || undefined,
    });
    setTitle("");
    setDayKey("");
    setTime("");
    setPlace("");
    setNote("");
  };

  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <CalendarPlus size={15} strokeWidth={1.5} className="shrink-0 text-azure/70" />
        <p className="section-label">Plan a session</p>
      </div>

      <div className="mt-3 space-y-2.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Long day with packs, crevasse rescue practice…"
          aria-label="What is the session?"
          className={INPUT_CLASS}
        />
        <div className="flex gap-2.5">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Date</span>
            <DateField label="Date" value={dayKey} onChange={setDayKey} />
          </label>
          <label className="w-[120px] shrink-0">
            <span className="sr-only">Time, optional</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={{ colorScheme: "dark" }}
              className={cn(INPUT_CLASS, "tnum")}
            />
          </label>
        </div>
        <input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Where — a town or a meeting point, not an address"
          aria-label="Where, optional"
          className={INPUT_CLASS}
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What the session is for, what to bring…"
          aria-label="Notes, optional"
          className="w-full resize-none rounded-tile border border-hairline bg-elevated/40 p-3.5 text-[13px] leading-relaxed text-snow outline-none placeholder:text-mist-dim focus:border-azure/50"
        />
        <Button variant="secondary" className="w-full" onClick={submit} disabled={!canAdd}>
          <CalendarPlus size={15} strokeWidth={1.8} aria-hidden="true" />
          Add to this device
        </Button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
        The date is read as a day on your own calendar rather than a moment in time, so a Saturday
        session stays on Saturday wherever you are. Nothing is sent and nobody is invited.
      </p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                       */
/* -------------------------------------------------------------------------- */

/** Free planning text. Saved as it is typed, on this device and nowhere else. */
function Notes({ group }: { group: Expedition }) {
  const { groupNotes, setGroupNote } = useApp();
  const value = groupNotes[group.id] ?? "";

  return (
    <Rise className="pt-3">
      <Card>
        <div className="flex items-center gap-2.5">
          <NotebookPen size={15} strokeWidth={1.5} className="shrink-0 text-azure/70" />
          <p className="section-label">Planning notes</p>
        </div>
        <textarea
          value={value}
          onChange={(e) => setGroupNote(group.id, e.target.value)}
          rows={6}
          placeholder="The route, the huts, who is driving, the turnaround time you have agreed…"
          aria-label="Group planning notes"
          className="mt-3 w-full resize-none rounded-tile border border-hairline bg-elevated/40 p-3.5 text-[13px] leading-relaxed text-snow outline-none placeholder:text-mist-dim focus:border-azure/50"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
          Saved on this device as you type, and held nowhere else. Keep phone numbers, addresses and
          anything you would not want read off an unlocked screen out of it.
        </p>
      </Card>
    </Rise>
  );
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The group's message log.
 *
 * The notice is above the composer rather than under it, and the control does
 * not say "Send". This is the most dangerous control in the feature to get
 * wrong: someone who believes they told the party a plan changed, and did not,
 * can end up on a mountain with people expecting something else.
 */
function Chat({ group }: { group: Expedition }) {
  const { groupMessages, postGroupMessage, removeGroupMessage, myProfile, user, account } =
    useApp();
  const [draft, setDraft] = useState("");
  const noticeId = useId();

  const messages = useMemo(
    () =>
      groupMessages.filter((m) => m.groupId === group.id).sort((a, b) => a.at.localeCompare(b.at)),
    [groupMessages, group.id],
  );

  const name = myProfile?.displayName?.trim() || account?.name || user.name;

  const post = () => {
    const body = draft.trim();
    if (body.length === 0) return;
    postGroupMessage(group.id, body);
    setDraft("");
  };

  return (
    <>
      <Rise className="pt-3">
        <Card>
          <div className="flex items-start gap-3">
            <MessageSquare size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
            <div className="min-w-0">
              <p className="text-[13px] text-snow">This is a log, not a conversation</p>
              <p id={noticeId} className="mt-1.5 text-[12px] leading-relaxed text-mist">
                {GROUP_CHAT_NOTICE}
              </p>
            </div>
          </div>
        </Card>
      </Rise>

      {messages.length > 0 && (
        <Rise className="pt-3">
          <ul className="space-y-2.5">
            {messages.map((message) => (
              <li key={message.id}>
                <Card>
                  <div className="flex items-start gap-3">
                    <Avatar name={name} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-mist">
                        {name} <span className="text-mist-dim">· {fmtRelative(message.at)}</span>
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-snow">
                        {message.body}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeGroupMessage(message.id)}
                      aria-label="Delete this message"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-mist-dim transition-colors hover:bg-white/[0.05] hover:text-snow"
                    >
                      <Trash2 size={14} strokeWidth={1.6} />
                    </button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </Rise>
      )}

      <Rise className="pt-3">
        <Card>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label="Write a message to this group"
            aria-describedby={noticeId}
            placeholder="Write something for the group…"
            className="w-full resize-none rounded-tile border border-hairline bg-elevated/40 p-3.5 text-[13px] leading-relaxed text-snow outline-none placeholder:text-mist-dim focus:border-azure/50"
          />
          {/* Never "Send". Nothing is sent, and the word would be the app
              claiming otherwise. */}
          <Button
            variant="secondary"
            className="mt-2.5 w-full"
            onClick={post}
            disabled={draft.trim().length === 0}
          >
            Write to this device
          </Button>
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
            {messages.length === 0
              ? "Nothing written yet. Whatever you write stays here, and the party has to be told another way."
              : `${messages.length} ${messages.length === 1 ? "message" : "messages"}, all yours and all still on this device.`}
          </p>
        </Card>
      </Rise>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Find an expedition                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The operator directory, filtered to this group's objective.
 *
 * Filtered by `operatorsFor`, which is the same function the mountain page
 * uses, so the listings shown are the ones that plausibly work on this ground
 * rather than the whole directory with a heading over it. Every listing carries
 * what it is — a sample, or in a development build a demo with invented figures
 * — and `OPERATOR_DISCLAIMER` states that ICEFALL has no operator partnerships
 * and vets nobody. Where the group's elevation is unknown there is no class of
 * objective to filter by, and the section says that instead of listing
 * everything.
 */
function Operators({ peak }: { peak: GroupPeak }) {
  const elevationM = peak.elevationM;

  const listings = useMemo(
    () =>
      typeof elevationM === "number"
        ? operatorsFor({ country: peak.country, elevationM }).slice(0, 3)
        : [],
    [elevationM, peak.country],
  );

  if (typeof elevationM !== "number") {
    return (
      <Rise className="pt-3">
        <Card>
          <p className="text-[14px] text-snow">Nothing to filter by</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
            This group has no elevation recorded for {peak.name}, and the directory is filtered by
            the class of objective. Listing everything under this heading would be pretending it was
            filtered.
          </p>
          <Button asChild variant="secondary" className="mt-4 w-full">
            <Link to="/explore/expeditions">Open the operator directory</Link>
          </Button>
        </Card>
      </Rise>
    );
  }

  return (
    <>
      <Rise className="pt-3">
        <Card>
          <div className="flex items-start gap-3">
            <MountainIcon size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
            <p className="min-w-0 text-[12px] leading-relaxed text-mist">
              Going with an operator is the other way to climb {peak.name}, and on serious ground it
              is the one ICEFALL defers to. These listings are filtered to this objective.
            </p>
          </div>
        </Card>
      </Rise>

      {listings.length === 0 ? (
        <Rise className="pt-3">
          <Card>
            <p className="text-[14px] text-snow">No listing covers this objective</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
              ICEFALL's directory holds a small set of illustrative listings and none of them work
              on this ground. That is the directory being thin, not a finding about the mountain —
              the local guides office and the national IFMGA association are the real answer.
            </p>
            <Button asChild variant="secondary" className="mt-4 w-full">
              <a href={operatorSearchUrl(peak.name)} target="_blank" rel="noreferrer noopener">
                Search for IFMGA operators
              </a>
            </Button>
          </Card>
        </Rise>
      ) : (
        <>
          {listings.map((operator, i) => (
            <Rise key={operator.id} className="pt-3">
              <OperatorCard
                operator={operator}
                peak={{
                  name: peak.name,
                  elevationM,
                  lat: peak.lat,
                  lon: peak.lon,
                  goalId: peak.goalId,
                }}
                rank={i + 1}
              />
            </Rise>
          ))}
          <Rise className="pt-3">
            <Button asChild variant="secondary" className="w-full">
              <Link to="/explore/expeditions">See the whole directory</Link>
            </Button>
          </Rise>
        </>
      )}

      <Rise className="pt-4">
        <Disclaimer>{OPERATOR_DISCLAIMER}</Disclaimer>
      </Rise>

      {listings.some((o) => o.demo) && (
        <Rise className="pt-3">
          <Disclaimer>{DEMO_NOTICE}</Disclaimer>
        </Rise>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Sharing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A card, and the honest absence of a link.
 *
 * The card is text, because text is the only thing that can actually travel:
 * ICEFALL has no server, so a group has no address, and a URL printed here
 * would fail to open for whoever received it. The link control is present
 * because people look for it, and it is disabled and says why rather than
 * quietly not existing.
 */
function Share({
  group,
  style,
  peak,
}: {
  group: Expedition;
  style: GroupStyle | undefined;
  peak: GroupPeak;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const reasonId = useId();

  const elevationLabel =
    typeof peak.elevationM === "number" ? `${fmtElevation(peak.elevationM)} m` : "";
  const text = useMemo(
    () => groupSummary(group, style, elevationLabel),
    [group, style, elevationLabel],
  );

  const share = useCallback(async () => {
    const title = `ICEFALL group — ${group.peakName}`;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text });
        setNote("Handed to the share sheet. ICEFALL sent nothing itself.");
        return;
      } catch (err) {
        // A dismissed sheet is not a failure and must not fall through to a
        // clipboard write the athlete did not ask for.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setNote("Card copied. Nothing was sent from ICEFALL.");
        return;
      } catch {
        /* clipboard refused — fall through to showing the text */
      }
    }

    // Never a dead end: if the browser will neither share nor copy, the card is
    // put on screen so it can be copied by hand.
    setManualCopy(text);
    setNote("This browser would not share or copy. The card is below — copy it by hand.");
  }, [group.peakName, text]);

  return (
    <>
      <Rise className="pt-3">
        <Card inset={false}>
          {/* The card as the recipient reads it — the same text the button
              exports, rather than a prettier version of it. */}
          <div className="border-b border-hairline px-4 py-3">
            <p className="section-label">The card</p>
          </div>
          <pre className="whitespace-pre-wrap px-4 py-4 font-sans text-[12px] leading-relaxed text-mist">
            {text}
          </pre>
        </Card>
      </Rise>

      <Rise className="pt-3">
        <Button variant="secondary" className="w-full" onClick={share}>
          <Share2 size={15} strokeWidth={1.7} aria-hidden="true" />
          Share the card
        </Button>
      </Rise>

      <Rise className="pt-3">
        <Button variant="secondary" className="w-full" disabled aria-describedby={reasonId}>
          <Link2Off size={15} strokeWidth={1.7} aria-hidden="true" />
          Copy link — not available
        </Button>
        {/* A disabled control must say why. Never a button that quietly does
            nothing, and never a URL that 404s at the other end. */}
        <p id={reasonId} className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
          {SHARE_LINK_UNAVAILABLE}
        </p>
      </Rise>

      {note && (
        <Rise className="pt-2">
          <p className="text-[11px] text-mist-dim" role="status">
            {note}
          </p>
        </Rise>
      )}

      {manualCopy && (
        <Rise className="pt-2">
          <textarea
            readOnly
            value={manualCopy}
            rows={10}
            aria-label="Group card to copy"
            className="w-full resize-none rounded-tile border border-hairline bg-obsidian/60 p-3 text-[11px] leading-relaxed text-mist outline-none"
          />
        </Rise>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Leaving                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Leaving, which at one member is deleting.
 *
 * It says what goes with it. Sessions, notes and messages are keyed to this
 * group and are removed with it, and there is no server holding a copy — so
 * the confirmation has to be honest about the fact that nothing can be
 * recovered afterwards.
 */
function LeaveGroup({ group }: { group: Expedition }) {
  const { leaveExpedition, groupSessions, groupMessages, groupNotes } = useApp();
  const [confirming, setConfirming] = useState(false);
  const navigate = useNavigate();

  const sessions = groupSessions.filter((s) => s.groupId === group.id).length;
  const messages = groupMessages.filter((m) => m.groupId === group.id).length;
  const hasNote = (groupNotes[group.id] ?? "").trim().length > 0;

  const carried = [
    sessions > 0 ? `${sessions} planned ${sessions === 1 ? "session" : "sessions"}` : null,
    messages > 0 ? `${messages} ${messages === 1 ? "message" : "messages"}` : null,
    hasNote ? "your planning notes" : null,
  ].filter((x): x is string => x !== null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="section-label text-mist-dim transition-colors hover:text-snow"
      >
        Leave this group
      </button>
    );
  }

  return (
    <div className="rounded-tile border border-danger/30 p-3">
      <p className="text-[12px] leading-relaxed text-mist">
        You are the only member, so leaving deletes this group from this device
        {carried.length > 0 ? `, along with ${carried.join(", ")}` : ""}. Nothing else holds a copy
        — there is no server — and it cannot be recovered.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          variant="danger"
          size="sm"
          className="flex-1"
          onClick={() => {
            leaveExpedition(group.id);
            // Replaced rather than pushed: the workspace of a group that no
            // longer exists is not somewhere Back should return to.
            navigate("/social?tab=groups", { replace: true });
          }}
        >
          Delete it
        </Button>
        <Button variant="ghost" size="sm" className="flex-1" onClick={() => setConfirming(false)}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

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
 * AND THE STATE THIS BUILD IS ACTUALLY IN: the migration behind all of it
 * (`20260902220000_group_privacy_and_chat.sql`) is written and NOT PUSHED. So
 * on a review build this screen is its own not-connected state, and that state
 * has to carry it: it says the group space needs a server, that none is
 * connected here, and that nothing has been hidden — nothing was asked for.
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

type Absence = Exclude<GroupSpaceStatus, "ready" | "loading">;

/**
 * A heading per absence, and every one of them names what actually happened.
 *
 * `members-only` is in this table but it is NOT a failure — the server did its
 * job and the answer is that this is not the reader's to read. It is drawn with
 * a padlock rather than a broken plug for exactly that reason.
 */
const ABSENCE_TITLE: Record<Absence, string> = {
  "no-backend": "No server in this build",
  "signed-out": "Your session ended",
  "not-provisioned": "Groups are not live on the server yet",
  unreachable: "ICEFALL could not reach the server",
  refused: "The server refused that",
  "not-found": "No group under that link",
  "members-only": "Members only",
};

const ABSENCE_ICON: Record<Absence, LucideIcon> = {
  "no-backend": Unplug,
  "signed-out": KeyRound,
  "not-provisioned": CloudOff,
  unreachable: CloudOff,
  refused: ShieldAlert,
  "not-found": SearchX,
  "members-only": Lock,
};

/** The house shorthand for an empty slot: a dashed ring, never a warning. */
function AbsenceMark({ icon: Icon, size = 48 }: { icon: LucideIcon; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full border border-dashed border-hairline-strong text-mist-dim"
    >
      <Icon size={Math.round(size * 0.42)} strokeWidth={1.4} />
    </span>
  );
}

/**
 * Everything ICEFALL cannot show, drawn the same way every time.
 *
 * The sentence is the one the data layer wrote — never a second copy composed
 * here, because two screens with two copies of the same explanation is how they
 * end up disagreeing about what went wrong.
 *
 * TRYING AGAIN IS OFFERED ONLY WHERE IT COULD CHANGE THE ANSWER. A build with
 * no server, and a server that has not had the migration pushed to it, will
 * answer identically for ever; a Retry there is a control that exists to look
 * reassuring. The same judgement `AthleteProfile` already makes.
 */
function SpaceAbsence({
  status,
  message,
  detail,
  onRetry,
}: {
  status: Absence;
  message: string | undefined;
  detail?: React.ReactNode;
  onRetry?: () => void;
}) {
  const Icon = ABSENCE_ICON[status];
  const retryable = status === "unreachable" || status === "refused";

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Icon size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
        <div className="min-w-0">
          <p className="text-[13px] text-snow">{ABSENCE_TITLE[status]}</p>
          {message && <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{message}</p>}
          {detail}
        </div>
      </div>

      {retryable && onRetry && (
        <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={onRetry}>
          <RotateCw size={14} strokeWidth={1.8} aria-hidden="true" />
          Try again
        </Button>
      )}

      {status === "signed-out" && (
        <Button asChild variant="secondary" size="sm" className="mt-4 w-full">
          <Link to="/auth/signin">Sign in again</Link>
        </Button>
      )}
    </Card>
  );
}

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

/** An initials avatar where there is a name, and an empty slot where there is not. */
function PersonAvatar({ person, size = 34 }: { person: GroupPerson; size?: number }) {
  const name = displayName(person);
  // The leading @ is stripped for the monogram only — "@rob" would otherwise
  // initial as punctuation.
  if (name) return <Avatar name={name.replace(/^@/, "")} size={size} />;
  return <AbsenceMark icon={Users} size={size} />;
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

function GroupSpaceScreen({ groupId }: { groupId: string }) {
  const { group, membership, state, message, reload } = useGroup(groupId);

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
                <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
                  All of it lives on the server — what the group is, who is in it, and anything
                  anybody has said in it. None of that is kept on this phone, so none of it can be
                  drawn from here, and nothing has been filled in to cover the gap. The expeditions
                  you plan on this device are a different, separate record and are unaffected.
                </p>
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

  return (
    <Screen>
      <ScreenHeader
        title={group.name}
        subtitle={group.mountain ? group.mountain.name : undefined}
        back
      />

      <Stagger>
        <Rise>
          <GroupDetails group={group} />
        </Rise>

        <Rise className="pt-4">
          <Standing group={group} membership={membership} />
        </Rise>

        <Rise className="pt-8">
          <SectionLabel>Who is in</SectionLabel>
        </Rise>
        <Roster groupId={groupId} />

        <Rise className="pt-8">
          <SectionLabel>Conversation</SectionLabel>
        </Rise>
        <Conversation groupId={groupId} foundedByMe={group.foundedByMe} />

        <Rise className="pt-8">
          <SectionLabel>Before you meet anyone</SectionLabel>
          <Card className="mt-3">
            <p className="text-[12px] leading-relaxed text-mist">{SAFETY_REMINDER}</p>
          </Card>
        </Rise>
      </Stagger>
    </Screen>
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
 *   - No mountain record: the peak is left unnamed. The catalogue id is not a
 *     name — "ama-dablam" title-cased is ICEFALL writing a mountain's name for
 *     it — so it is shown as the id it is, if at all.
 *   - No date: undecided, which is where most groups start. Never a placeholder
 *     season and never "TBC".
 *   - No member count: nothing. Never a zero.
 */
function GroupDetails({ group }: { group: GroupSpace }) {
  const mountain = group.mountain;

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
          ) : (
            <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
              The mountain's record did not come back with this group, so it is left unnamed. The
              group is filed against “{group.destinationId}” in ICEFALL's catalogue, and that is an
              id rather than a name — tidying it into one would be ICEFALL naming a peak for itself.
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
                <p className="mt-0.5 text-[11px] leading-relaxed text-mist-dim">
                  When the party intends to go, as whoever started the group recorded it. It is a
                  day on the calendar rather than a booking, and nothing has been reserved.
                </p>
              </>
            ) : (
              <>
                <p className="text-[13px] text-snow">No date fixed yet</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-mist-dim">
                  Undecided, which is where most groups start. ICEFALL leaves it empty rather than
                  putting a placeholder season in its place.
                </p>
              </>
            )}
          </div>
        </div>

        {group.memberCount === null && (
          <div className="flex items-start gap-2.5">
            <Users size={15} strokeWidth={1.5} className="mt-[3px] shrink-0 text-mist-dim" />
            <p className="text-[11px] leading-relaxed text-mist-dim">
              The number of people in this group did not come back, so none is shown. A group always
              has at least the person who started it, so a zero here would be a wrong answer rather
              than an empty one.
            </p>
          </div>
        )}

        {group.createdBy === null && (
          <div className="flex items-start gap-2.5">
            <Users size={15} strokeWidth={1.5} className="mt-[3px] shrink-0 text-mist-dim" />
            <p className="text-[11px] leading-relaxed text-mist-dim">
              Whoever started this group has since deleted their ICEFALL account. The group carries
              on without them — it belongs to the people who joined it
              {group.visibility === "private"
                ? ", but nobody is left who can answer a request to join it"
                : ""}
              .
            </p>
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
 * between a founder saying yes and that person next opening the group they are
 * neither pending (the decision was made) nor a member (the row is not there).
 * Reporting either would be untrue about a decision somebody really took.
 */
function Standing({ group, membership }: { group: GroupSpace; membership: GroupMembership }) {
  const { join, requestJoin, leave, error, busy } = useGroupActions();
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const unownedId = useId();

  /* Every failure sentence sits under the control that produced it. */
  const failure = error ? (
    <p className="mt-3 text-[12px] leading-relaxed text-danger">{error}</p>
  ) : null;

  if (membership === "member") {
    return (
      <Card>
        <p className="text-[14px] text-snow">You are in this group</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
          Which is why you can see who else is in it and everything that has been said. Everyone in
          it can see you the same way — that is the trade the group makes in both directions.
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
              Leaving takes you off the roster and closes the conversation to you. It does not
              delete the group
              {group.foundedByMe
                ? " — even though you started it. The people who joined keep it, and you go on"
                  + " answering requests to join, because deleting a group is a different act"
                : ""}
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
                  // Only closed on success. A refused leave that closed the
                  // panel would read as "done" for something that did not
                  // happen — the failure sentence is below and needs to stay
                  // next to the button that caused it.
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
            {failure}
          </div>
        )}
      </Card>
    );
  }

  if (membership === "accepted") {
    return (
      <Card>
        <p className="text-[14px] text-snow">You have been accepted</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{ACCEPTED_NOT_SEATED}</p>
        <Button className="mt-4 w-full" disabled={busy} onClick={() => void join(group.id)}>
          {busy ? "Joining…" : "Join"}
        </Button>
        {failure}
      </Card>
    );
  }

  if (membership === "pending") {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <Hourglass size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
          <div className="min-w-0">
            <p className="text-[13px] text-snow">Your request is with whoever started this group</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
              Until they answer you cannot see who is in it or what has been said. ICEFALL does not
              tell you when they have looked, and asking again would not reach them any sooner —
              there is deliberately no way to ask twice.
            </p>
            {group.createdBy === null && (
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
                And it will not be answered: the person who started this group has deleted their
                ICEFALL account, so nobody holds the decision. That is worth knowing rather than
                waiting on.
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (membership === "declined") {
    return (
      <Card>
        <p className="text-[14px] text-snow">Your request was declined</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
          Whoever started this group answered no. ICEFALL does not offer to ask again — the answer
          is kept precisely so the decision does not have to be taken twice, and pressing somebody
          to reconsider is not something an app should automate.
        </p>
      </Card>
    );
  }

  /* Not in, never asked. Public and private diverge completely from here. */
  if (group.visibility === "public") {
    return (
      <Card>
        <p className="text-[14px] text-snow">Anyone signed in can join</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
          Joining puts you on the roster the other members read, and opens the conversation from its
          beginning — including everything said before today.
        </p>
        <Button className="mt-4 w-full" disabled={busy} onClick={() => void join(group.id)}>
          <UserPlus size={15} strokeWidth={1.8} aria-hidden="true" />
          {busy ? "Joining…" : "Join this group"}
        </Button>
        {failure}
      </Card>
    );
  }

  /* Private. The button says ASK, because the database will only accept an ask. */
  const unowned = group.createdBy === null;
  return (
    <Card>
      <div className="flex items-start gap-3">
        <Lock size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
        <div className="min-w-0">
          <p className="text-[13px] text-snow">This group is private</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{PRIVATE_MEANS_ASK}</p>
        </div>
      </div>

      <Button
        variant="secondary"
        className="mt-4 w-full"
        disabled={busy || unowned}
        aria-describedby={unowned ? unownedId : undefined}
        onClick={() => void requestJoin(group.id)}
      >
        <UserPlus size={15} strokeWidth={1.8} aria-hidden="true" />
        {busy ? "Asking…" : "Request to join"}
      </Button>

      {/* A disabled control says why, at the control. This one is disabled
          because the ask would have no reader at all — not because it is
          unfinished. */}
      {unowned && (
        <p id={unownedId} className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
          There is nobody to ask. The person who started this group has deleted their ICEFALL
          account, and only they could accept — so a request would sit unanswered for ever. ICEFALL
          would rather say that than take the ask.
        </p>
      )}

      {failure}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* 2 — The roster, and the founder's decisions                                */
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
 * a founder is looking when they act on one.
 */
function Roster({ groupId }: { groupId: string }) {
  const { members, requests, isFounder, requestsUnavailable, state, message, reload } =
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
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
                Nothing has been hidden from you in particular and this is not an empty group.
                ICEFALL simply does not read a group's members to anybody outside it — which is the
                same protection working for you, in every group you are in.
              </p>
            ) : (
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
                No roster is drawn rather than a short one. Nobody has been left out of a list on
                purpose — there is no list.
              </p>
            )
          }
        />
      </Rise>
    );
  }

  return (
    <>
      {isFounder && requests.length > 0 && <Requests groupId={groupId} requests={requests} />}

      {/*
        * "NOBODY IS ASKING" AND "ICEFALL COULD NOT CHECK" LOOK IDENTICAL, because
        * both of them draw no request cards at all — so the second one has to say
        * so out loud. Founder-only, because nobody else is shown the list in the
        * first place and so nobody else is missing anything.
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
          <ul className="space-y-2.5">
            {members.map((member) => (
              <li key={member.profileId}>
                <MemberRow member={member} />
              </li>
            ))}
          </ul>
        )}
      </Rise>

      <Rise className="pt-3">
        <p className="text-[11px] leading-relaxed text-mist-dim">
          Everybody in the group can read this list, and everybody in it can read you. Nothing about
          where anyone is comes from their phone — a place here is one they typed on their profile,
          and ICEFALL stores no position for anybody.
        </p>
      </Rise>
    </>
  );
}

function MemberRow({ member }: { member: GroupMember }) {
  const name = displayName(member);

  return (
    <div className="rounded-tile border border-hairline p-3">
      <div className="flex items-start gap-3">
        <PersonAvatar person={member} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-snow">{name ?? "Profile not available"}</p>
          <p className="tnum mt-0.5 truncate text-[11px] text-mist-dim">
            {member.joinedAt ? `Joined ${fmtRelative(member.joinedAt)}` : "In this group"}
            {member.location ? ` · ${member.location}` : ""}
          </p>
          {!name && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
              ICEFALL could not read this person's profile and will not put a name to them. They are
              in the group — that much is the group's own record.
            </p>
          )}
        </div>
        {member.isFounder && <Badge tone="neutral">Started it</Badge>}
      </div>
    </div>
  );
}

/**
 * Asks to join, and the two answers. FOUNDER ONLY, twice over: the policy lets
 * nobody else write the decision, and the data layer hands nobody else the list.
 *
 * WHY THE ACCEPTED PERSON DOES NOT APPEAR ON THE ROSTER AFTERWARDS, which is
 * the thing a founder would otherwise think is broken: nothing can seat them
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
        <Card>
          <div className="flex items-start gap-3">
            <UserPlus size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
            <div className="min-w-0">
              <p className="text-[13px] text-snow">
                {requests.length} {requests.length === 1 ? "person is" : "people are"} asking to join
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{ACCEPT_MEANS_VISIBLE}</p>
            </div>
          </div>
        </Card>
      </Rise>

      {requests.map((request) => {
        const name = displayName(request);
        return (
          <Rise key={request.profileId} className="pt-2.5">
            <Card>
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
            </Card>
          </Rise>
        );
      })}

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
function Conversation({ groupId, foundedByMe }: { groupId: string; foundedByMe: boolean }) {
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
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
                A member sees the whole conversation from its beginning, including everything said
                before they joined. That is why it is closed until you are one.
              </p>
            ) : (
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
                No messages are drawn rather than a few. Nothing has been lost — nothing came back
                to draw.
              </p>
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
              <MessageSquare size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
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
          <ul className="space-y-2.5">
            {messages.map((entry) => (
              <li key={entry.id}>
                <MessageRow message={entry} canDelete={entry.mine || foundedByMe} />
              </li>
            ))}
          </ul>

          {/* The reason for the disabled bins, immediately under them. */}
          <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
            Deleting is not wired up yet, so the bins above do nothing and say so. Whoever wrote a
            message — and whoever started the group — will be able to delete one. There is no
            editing at all, and there never will be: a message is stood behind or deleted, never
            quietly rewritten under the replies to it.
          </p>
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
        <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
          The conversation does not update on its own in this build, and nothing notifies you. This
          asks the server again.
        </p>
      </Rise>
    </>
  );
}

function MessageRow({ message, canDelete }: { message: GroupMessage; canDelete: boolean }) {
  const name = displayName(message.author);

  return (
    <Card>
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
              {message.body}
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
              <p className="text-[11px] leading-relaxed text-mist-dim">
                A picture was sent with this message and ICEFALL could not get a link to it, so
                nothing is drawn in its place. The words are exactly as they were sent.
              </p>
            </div>
          )}
        </div>

        {canDelete && (
          <button
            type="button"
            disabled
            /* Disabled, with the reason on the control itself and again under
               the list. The database allows this delete — the author's own, and
               any of them for the founder — and ICEFALL's group data layer has
               no call for it yet. Whoever adds one wires it here. */
            title="Deleting a message is not wired up yet"
            aria-label="Delete this message — not wired up yet"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-mist-dim opacity-40"
          >
            <Trash2 size={14} strokeWidth={1.6} />
          </button>
        )}
      </div>
    </Card>
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
  const megabytes = Math.round(MAX_IMAGE_BYTES / 1_048_576);

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

        <Button className="ml-auto shrink-0" size="sm" disabled={!canSend} onClick={() => void submit()}>
          <Send size={15} strokeWidth={1.8} aria-hidden="true" />
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>

      {error && <p className="mt-2.5 text-[12px] leading-relaxed text-danger">{error}</p>}

      <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
        Pictures only, up to {megabytes}MB — ICEFALL does not play video, so a clip would upload
        and then show as a broken frame. A message can be a picture on its own.
      </p>
    </Card>
  );
}
