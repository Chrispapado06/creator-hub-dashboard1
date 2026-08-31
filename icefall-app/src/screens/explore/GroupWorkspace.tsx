import { useCallback, useId, useMemo, useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CalendarPlus,
  CalendarRange,
  ChevronRight,
  Link2Off,
  MessageSquare,
  Mountain as MountainIcon,
  NotebookPen,
  Share2,
  Trash2,
  Users,
} from "lucide-react";

import { Avatar, Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { FactorBar, ScoreRing } from "@/components/coach/CoachUI";
import { QualifierBadge, UnavailableState, type DataQualifier } from "@/components/coach/DataState";
import { OperatorCard } from "@/components/domain/OperatorCard";
import { useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtElevation, fmtRelative } from "@/lib/format";
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
  const { name, elevationM, lat, lon } = peak;

  return useMemo<DerivedReadiness>(() => {
    if (typeof elevationM !== "number" || !Number.isFinite(elevationM)) {
      return {
        score: unavailable("no-data"),
        qualifier: "estimated",
        note: `No elevation is recorded for ${name}, and ICEFALL reads the class of an objective from its elevation. There is nothing to assess against rather than a guess at one.`,
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
  }, [name, elevationM, lat, lon, activities, objectives, coachProfile]);
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function GroupWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { expeditions } = useApp();

  const group = expeditions.find((e) => e.id === id);
  if (!group) return <NotOnThisDevice />;

  // Keyed by id so switching groups rebuilds the local state of every section
  // rather than carrying one group's draft message into another's.
  return <Workspace key={group.id} group={group} />;
}

function Workspace({ group }: { group: Expedition }) {
  const { groupStyle, setGroupStyle } = useApp();
  const peak = useGroupPeak(group);
  const countdown = windowCountdown(group.window);
  const style = groupStyle[group.id];

  return (
    <Screen>
      <ScreenHeader title={group.peakName} subtitle="Group workspace" />

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
/* A group id this device holds nothing for                                    */
/* -------------------------------------------------------------------------- */

/**
 * Reached by an old link, or after the group was deleted.
 *
 * It says what is true — this device holds no such group — rather than
 * "not found", which in an app with a server would mean somebody else's group
 * exists and is closed to you. Nobody else's group exists.
 */
function NotOnThisDevice() {
  return (
    <Screen>
      <ScreenHeader title="Group" />
      <Stagger>
        <Rise>
          <Card className="py-8">
            <UnavailableState reason="no-data" size="lg" />
            <p className="mt-4 text-center text-[13px] leading-relaxed text-mist">
              This device holds no group with that id. Groups live only on the device that created
              them — ICEFALL has no server to fetch one from — so a group deleted here is gone, and
              a link from another device was never going to resolve.
            </p>
            <Button asChild variant="secondary" className="mt-5 w-full">
              <Link to="/explore/groups">Back to your groups</Link>
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

  const generated = useMemo(
    () =>
      typeof elevationM === "number"
        ? generateChecklist({ name: peak.name, elevationM, lat: peak.lat, lon: peak.lon })
        : null,
    [peak.name, elevationM, peak.lat, peak.lon],
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
            This group has no elevation recorded for {peak.name}, so ICEFALL cannot work out what
            class of mountain it is — and the kit list follows entirely from that.
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
            navigate("/explore/groups", { replace: true });
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
