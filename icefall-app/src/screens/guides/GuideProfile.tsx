import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CloudSnow,
  Flag,
  Footprints,
  Grab,
  Heart,
  Layers,
  LifeBuoy,
  Mountain as MountainIcon,
  MountainSnow,
  Pickaxe,
  Send,
  Share,
  ShieldQuestion,
  Snowflake,
  Star,
  Undo2,
  Users,
  Wind,
} from "lucide-react";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { MountainBackdrop } from "@/components/domain/MountainImage";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { EXPERIENCE_LABELS, experienceFromAppLevel } from "@/network/types";
import { ACCESS_DISCLAIMER } from "@/services/expeditionAccess";
import { guideMatch } from "@/guides/matching";
import {
  AVAILABILITY_LABELS,
  NO_GUIDES_NOTICE,
  SHOW_DEMO_GUIDES,
  SPECIALITY_LABELS,
  credentialStatus,
  guideById,
  type Availability,
  type Guide,
  type Speciality,
} from "@/guides/types";
import { REVIEWS_NEED_BOOKINGS_NOTICE } from "@/guides/engagement";
import {
  formatDateRange,
  mondayFirstIndex,
  monthDays,
  monthLabel,
  nightsToDays,
  shiftMonth,
  todayKey,
} from "@/guides/dates";
import { useGuideStore } from "@/guides/store";
import {
  AscentsByMountain,
  AvailabilityLine,
  Credentials,
  DemoGuidesNotice,
  GuideBadges,
  GuideCompatibility,
  GuidePortrait,
  GuideVsCompany,
  LanguagesLine,
  RateLine,
  WhyThisGuideMatches,
  SPECIALITY_ICONS,
} from "./shared";
import {
  ascentsOf,
  criteriaFrom,
  defaultGuideFilters,
  mountainsOf,
  worksMountain,
} from "./filters";
import {
  BLOCK_NOTE,
  REPORT_NOT_SENT_NOTICE,
  REPORT_REASON_IDS,
  REPORT_REASON_LABELS,
  SUPPORT_NOTE,
  useGuideModeration,
  type GuideReportReason,
} from "./guideModeration";
import { useSearchObjective } from "./useSearchObjective";

/**
 * One guide's page.
 *
 * WHAT LEADS, AND WHY
 *
 * Guided ascents, mountain by mountain. "Mont Blanc — 96 guided ascents" is the
 * most useful sentence this directory can offer somebody choosing a person to
 * tie into a rope with, so the EXPERIENCE tab opens with it and it outranks the
 * rating tab in every way that matters. There is deliberately no follower count,
 * no booking volume, no response time and no profile-completeness meter: none of
 * that says anything about a mountain, and a figure that rises with activity
 * turns a professional register into a leaderboard.
 *
 * WHAT THIS PAGE REFUSES TO DO
 *
 *   · No verification. Every credential renders as CLAIMED, because ICEFALL has
 *     no link to the IFMGA or any national association and has checked nothing.
 *     The verified state exists in the model and is unreachable.
 *   · No photograph of a person. The hero is the MOUNTAIN and says so; the
 *     portrait is initials. A stock face against an invented name would attach a
 *     real person to a fictional licence.
 *   · No private contact details. There is no phone number, email address or
 *     home address in the model at all, so none can appear here. Contact runs
 *     through the request flow.
 *   · No reviews that pretend to be real. A review needs a completed ICEFALL
 *     booking and none exists; a demo rating is labelled as the invention it is,
 *     and the star distribution is left EMPTY rather than derived from an
 *     average — see `RatingDistribution`.
 *   · No diary. The availability calendar derives every day from one standing
 *     status and states, on the tab, that nothing was ever confirmed with
 *     anybody — see `AvailabilityCalendar`.
 *   · No safety claim. The compatibility number is captioned as a comparison of
 *     a request against a listing, never as a judgement that this guide is
 *     right, competent or safe.
 *
 * WHAT IS BUILT LOCALLY AND WHY
 *
 * `GuideStatBand`, `GuideStars`, `RatingDistribution`, `SpecialityGrid` and
 * `GuideRateBadge` were specified as imports from `./shared`, which does not
 * export them. They live here rather than being added to that file because the
 * directory screen owns it and two agents editing one module loses work. If they
 * land in `./shared` later, delete the local copies and import instead — but
 * keep `RatingDistribution`'s empty rows, which are the honest rendering.
 */

/**
 * Two different pictures sit at the top of this screen and a reader has to be
 * told which is which: the hero is the objective, and on a demo guide the
 * portrait is a generated face. Saying "a photograph of them" of either one
 * would be false.
 */
const HERO_IS_THE_MOUNTAIN =
  "The large photograph is the mountain, not the guide. ICEFALL holds no picture of any real guide.";

/** Shown only on a demo record, beside the generated portrait. */
const PORTRAIT_IS_GENERATED =
  "The portrait is a computer-generated face of a person who does not exist, used so this demo profile can be judged with a face in it.";

const CONTACT_NOTE =
  "Guides are contacted through ICEFALL. No personal phone number, private email address or home address is held or shown here — and an arrangement moved off ICEFALL leaves you with no record of what was agreed.";

type ProfileTab = "about" | "experience" | "reviews" | "availability";

const TABS: readonly { value: ProfileTab; label: string }[] = [
  { value: "about", label: "About" },
  { value: "experience", label: "Experience" },
  { value: "reviews", label: "Reviews" },
  { value: "availability", label: "Availability" },
];

/* -------------------------------------------------------------------------- */
/* Speciality iconography                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One icon per speciality, and the label always travels with it.
 *
 * An icon alone is a guess — a pickaxe reads as "ice climbing" to somebody who
 * already knows the vocabulary and as nothing at all to somebody who does not,
 * and this is a page where a client decides what ground a person will take them
 * onto. The tile is icon ABOVE label, never icon instead of label.
 */
/*
 * The icon map lives in ./shared and ONLY there. This file had a second copy
 * that disagreed — glacier drew a snowflake here and waves on the directory's
 * filter sheet — so the same speciality meant two different pictures depending
 * on which screen you were on. shared.tsx's own comment forbids exactly that.
 */

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function GuideProfile() {
  const { id } = useParams<{ id: string }>();
  const { user } = useApp();
  const objective = useSearchObjective();
  const { isBlocked, block, unblock, reportsFor } = useGuideModeration();
  const { isShortlisted, toggleShortlist } = useGuideStore();

  const [tab, setTab] = useState<ProfileTab>("about");

  const guide = id ? guideById(id) : undefined;
  const athleteExperience = experienceFromAppLevel(user.experience);

  // The same criteria the directory built, minus the filters — this screen has
  // no filter bar, so the comparison runs on the objective and the athlete's own
  // declared standing.
  const criteria = useMemo(
    () => criteriaFrom(objective, defaultGuideFilters(), athleteExperience),
    [objective, athleteExperience],
  );

  const match = useMemo(() => (guide ? guideMatch(criteria, guide) : null), [criteria, guide]);

  /**
   * The mountain in the hero.
   *
   * The athlete's objective wins only if this guide actually works it —
   * otherwise the page would put somebody's Denali behind a guide who has never
   * left the Atlas. Failing that, the mountain they record most ascents of.
   */
  const heroPeak = useMemo(() => {
    if (!guide) return "";
    const wanted = (objective?.peakName ?? "").trim();
    if (wanted !== "" && worksMountain(guide, wanted)) return wanted;
    // Most recorded ascents, which is the mountain this guide is most of.
    return (
      [...mountainsOf(guide)].sort((a, b) => ascentsOf(guide, b) - ascentsOf(guide, a))[0] ?? wanted
    );
  }, [guide, objective?.peakName]);

  if (!guide || !match) return <GuideMissing />;

  const blocked = isBlocked(guide.id);
  const reports = reportsFor(guide.id);
  const shortlisted = isShortlisted(guide.id);
  const heroIsObjective = heroPeak !== "" && heroPeak === objective?.peakName;

  const q = new URLSearchParams();
  if (objective?.peakName) q.set("peak", objective.peakName);
  if (objective?.elevationM !== undefined) {
    q.set("elevation", String(Math.round(objective.elevationM)));
  }
  if (objective?.goalId) q.set("goal", objective.goalId);
  const requestHref = `/explore/guides/${encodeURIComponent(guide.id)}/request${q.toString() ? `?${q}` : ""}`;

  // navigator.share exists only on mobile Safari and Chrome; the clipboard is
  // the honest fallback rather than a control that silently does nothing. The
  // text carries the demo warning, because a link to an invented professional
  // arriving in somebody else's inbox has lost every label on this page.
  const share = () => {
    const url = window.location.href;
    const text = guide.demo
      ? `${guide.name} — a DEMONSTRATION guide listing in ICEFALL. This person does not exist and cannot be hired.`
      : guide.name;
    if (navigator.share) void navigator.share({ title: guide.name, text, url }).catch(() => {});
    else void navigator.clipboard?.writeText(`${text} ${url}`).catch(() => {});
  };

  return (
    <Screen>
      {/* ---- Hero: the mountain, never the person ------------------------- */}
      <div className="-mx-5">
        <div className="relative h-[320px] w-full overflow-hidden bg-slate">
          <MountainBackdrop
            peak={{
              name: heroPeak,
              elevationM: heroIsObjective ? objective?.elevationM : undefined,
              lat: heroIsObjective ? objective?.lat : undefined,
              lon: heroIsObjective ? objective?.lon : undefined,
            }}
            scrim="vertical"
          />

          <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-4">
            <Link
              to="/explore/guides"
              aria-label="Back to guides"
              className="grid h-11 w-11 place-items-center rounded-full border border-hairline bg-obsidian/60 text-snow backdrop-blur transition-colors hover:border-azure/50"
            >
              <ChevronLeft size={18} strokeWidth={1.7} />
            </Link>
            <span className="flex-1" />
            <button
              type="button"
              aria-pressed={shortlisted}
              aria-label={shortlisted ? "Remove from shortlist" : "Add to shortlist"}
              onClick={() => toggleShortlist(guide.id)}
              className={cn(
                "grid h-11 w-11 place-items-center rounded-full border bg-obsidian/60 backdrop-blur transition-colors",
                shortlisted
                  ? "border-azure/50 text-azure"
                  : "border-hairline text-snow hover:border-azure/50",
              )}
            >
              <Heart size={17} strokeWidth={1.7} fill={shortlisted ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              aria-label="Share this profile"
              onClick={share}
              className="grid h-11 w-11 place-items-center rounded-full border border-hairline bg-obsidian/60 text-snow backdrop-blur transition-colors hover:border-azure/50"
            >
              <Share size={17} strokeWidth={1.7} />
            </button>
          </div>

          {/* Bottom-left: the disclosure badges, and the name of the mountain
              in the frame — an uncaptioned photograph behind a person's name
              reads as somewhere they own. */}
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-5 pb-8">
            <div className="flex flex-wrap items-center gap-2">
              <GuideBadges guide={guide} />
            </div>
            {heroPeak !== "" && (
              <p className="ml-auto flex min-w-0 items-center gap-2 text-[11px] text-mist">
                <MountainIcon size={12} strokeWidth={1.6} className="shrink-0 text-mist-dim" />
                <span className="truncate">{heroPeak}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ---- Identity ------------------------------------------------------ */}
      <div className="relative -mt-9 flex items-end gap-3.5">
        <span className="rounded-[13px] bg-obsidian p-[3px]">
          <GuidePortrait name={guide.name} src={guide.portrait} size={68} />
        </span>
        <div className="min-w-0 flex-1 pb-1.5">
          <h1 className="truncate text-[24px] font-light tracking-[-0.02em] text-snow">
            {guide.name}
          </h1>
          <p className="mt-1 truncate text-[12px] text-mist">{guide.basedIn}</p>
        </div>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
        {HERO_IS_THE_MOUNTAIN}
        {guide.portrait && ` ${PORTRAIT_IS_GENERATED}`}
      </p>

      <Stagger>
        <Rise className="pt-4">
          <CredentialLine guide={guide} />
          <p className="mt-3 text-[13px] leading-relaxed text-mist">{guide.headline}</p>
        </Rise>

        {/* ---- The three-column band --------------------------------------- */}
        <Rise className="pt-5">
          <GuideStatBand guide={guide} />
        </Rise>

        {blocked && (
          <Rise className="pt-5">
            <Card className="border-danger/35">
              <p className="section-label text-danger">Blocked</p>
              <p className="mt-2 text-[12px] leading-relaxed text-mist">
                This guide is hidden from your directory. They have not been told, and blocking
                reported nothing to anybody.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => unblock(guide.id)}
              >
                <Undo2 size={14} strokeWidth={1.7} />
                Unblock
              </Button>
            </Card>
          </Rise>
        )}

        {SHOW_DEMO_GUIDES && guide.demo && (
          <Rise className="pt-5">
            <DemoGuidesNotice />
          </Rise>
        )}

        {/* ---- Compatibility -----------------------------------------------
            Above the tabs on purpose. It is the one number on this page that an
            athlete could mistake for a safety judgement, so it is never a tab
            somebody might not open — and it travels with its caption. */}
        <Rise className="pt-5">
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="section-label">Against your objective</p>
                <p className="mt-1.5 text-[14px] text-snow">
                  {objective?.peakName ?? "No objective set"}
                </p>
                {objective?.targetDate && (
                  <p className="tnum mt-0.5 text-[11px] text-mist-dim">
                    {fmtDate(objective.targetDate)}
                  </p>
                )}
              </div>
              <GuideCompatibility match={match} className="shrink-0" />
            </div>
            <WhyThisGuideMatches match={match} className="mt-4 border-t border-hairline pt-4" />
          </Card>
        </Rise>

        {/* ---- Tabs --------------------------------------------------------- */}
        <Rise className="pt-6">
          <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
        </Rise>

        <Rise className="pt-5">
          {tab === "about" && <AboutTab guide={guide} />}
          {tab === "experience" && (
            <ExperienceTab
              guide={guide}
              objectivePeak={objective?.peakName}
              athleteStanding={EXPERIENCE_LABELS[athleteExperience].toLowerCase()}
            />
          )}
          {tab === "reviews" && <ReviewsTab guide={guide} />}
          {tab === "availability" && <AvailabilityTab guide={guide} />}
        </Rise>

        {/* ---- Contact, guide-or-company, moderation ------------------------ */}
        <Rise className="pt-6">
          <Card>
            <SectionLabel>Reaching this guide</SectionLabel>
            <p className="mt-2.5 text-[12px] leading-relaxed text-mist">{CONTACT_NOTE}</p>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <GuideVsCompany />
        </Rise>

        <Rise className="pt-6">
          <SafetyActions
            guide={guide}
            blocked={blocked}
            onBlock={() => block(guide.id)}
            onUnblock={() => unblock(guide.id)}
            reportCount={reports.length}
          />
        </Rise>

        <Rise className="pt-5">
          <Disclaimer>{ACCESS_DISCLAIMER}</Disclaimer>
        </Rise>
      </Stagger>

      {/* ---- Sticky footer: rate left, the one azure action right ------------ */}
      <div className="sticky bottom-0 -mx-5 mt-8 flex items-center gap-4 border-t border-hairline bg-obsidian/95 px-5 pb-4 pt-3 backdrop-blur">
        <div className="min-w-0">
          <GuideRateBadge guide={guide} />
          <p className="mt-1 text-[10px] leading-tight text-mist-dim">
            Their figure. Permits, huts and travel on top
            {guide.demo ? ", and invented on a demo guide" : ""}.
          </p>
        </div>
        <Button asChild className="ml-auto shrink-0">
          <Link to={requestHref}>
            <Send size={15} strokeWidth={1.8} />
            Request
          </Link>
        </Button>
      </div>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* No such guide                                                               */
/* -------------------------------------------------------------------------- */

/**
 * In a production build the catalogue is empty, so an id that resolves to
 * nothing is the NORMAL path rather than an error — every demo id resolves to
 * nothing once the demo data is dropped. It says why, instead of bouncing the
 * athlete somewhere with no explanation.
 */
function GuideMissing() {
  return (
    <Screen>
      <ScreenHeader title="Guide" />
      <Stagger>
        <Rise className="pt-4">
          <Card>
            <p className="text-[13px] leading-relaxed text-mist">{NO_GUIDES_NOTICE}</p>
          </Card>
        </Rise>
        <Rise className="pt-4">
          <Button asChild variant="secondary" className="w-full">
            <Link to="/explore/guides">Back to guides</Link>
          </Button>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Identity parts                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The headline qualification, and the word CLAIMED beside it.
 *
 * The mockup's "credential line" is the single most persuasive string on this
 * page — "IFMGA / UIAGM mountain guide" under somebody's name is what a client
 * reads instead of asking to see a carnet. It is therefore never drawn bare:
 * the status word from `credentialStatus` is part of the same line, and the full
 * list with `CREDENTIAL_CLAIM_NOTICE` sits in the ABOUT tab.
 */
function CredentialLine({ guide }: { guide: Guide }) {
  const first = guide.credentials[0];
  if (!first) {
    return (
      <p className="flex items-start gap-2 text-[12px] leading-relaxed text-mist">
        <ShieldQuestion size={13} strokeWidth={1.6} className="mt-[2px] shrink-0 text-mist-dim" />
        No qualification listed. That is not the same as none held — it means nothing was entered.
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-snow">
      <ShieldQuestion size={14} strokeWidth={1.5} className="shrink-0 text-mist-dim" />
      {first.label}
      <Badge tone="neutral">{credentialStatus(first)}</Badge>
    </p>
  );
}

/**
 * YEARS EXP · EXPEDITIONS · HIGHEST GUIDED, divided by hairlines.
 *
 * Local because `./shared` does not export it and the directory screen owns
 * that file. The caption underneath is not decoration: all three figures are
 * self-reported, and on a demo guide they were invented outright.
 */
function GuideStatBand({ guide }: { guide: Guide }) {
  const cells: { label: string; value: string }[] = [
    { label: "Years exp", value: guide.yearsGuiding.toLocaleString("en-GB") },
    { label: "Expeditions", value: guide.expeditionsLed.toLocaleString("en-GB") },
    { label: "Highest guided", value: `${guide.highestGuidedM.toLocaleString("en-GB")} m` },
  ];

  return (
    <div>
      <div className="grid grid-cols-3 rounded-card border border-hairline bg-graphite">
        {cells.map((c, i) => (
          <div
            key={c.label}
            className={cn("px-2 py-4 text-center", i > 0 && "border-l border-hairline")}
          >
            <p className="tnum text-[19px] font-light leading-none text-snow">{c.value}</p>
            <p className="section-label mt-2.5">{c.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
        Self-reported. ICEFALL has checked none of it
        {guide.demo ? ", and on a demo guide all three were invented" : ""}.
      </p>
    </div>
  );
}

/** The day rate as the mockup's pill. Always a figure in this model. */
function GuideRateBadge({ guide }: { guide: Guide }) {
  return (
    <span className="tnum inline-flex items-baseline gap-1 rounded-full border border-hairline-strong bg-white/[0.03] px-3 py-1.5 text-[14px] font-light text-snow">
      €{guide.dailyRateEur.toLocaleString("en-GB")}
      <span className="text-[11px] text-mist">/day</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* ABOUT                                                                       */
/* -------------------------------------------------------------------------- */

function AboutTab({ guide }: { guide: Guide }) {
  return (
    <div className="space-y-6">
      <p className="text-[13px] leading-relaxed text-mist">{guide.bio}</p>

      <div>
        <SectionLabel>Specialities</SectionLabel>
        <SpecialityGrid specialities={guide.specialities} className="mt-3" />
        <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
          The ground this guide says they work. It is a description of their practice, not a limit
          somebody checks at the trailhead.
        </p>
      </div>

      <div>
        <SectionLabel>Mountains</SectionLabel>
        <MountainChips guide={guide} className="mt-3" />
      </div>

      <div>
        <SectionLabel>Languages</SectionLabel>
        <LanguagesChips guide={guide} className="mt-3" />
      </div>

      <div>
        <SectionLabel>Qualifications</SectionLabel>
        <Card className="mt-3">
          <Credentials guide={guide} />
        </Card>
      </div>
    </div>
  );
}

/** The 4-column icon grid. Icon above label, never icon alone. */
function SpecialityGrid({
  specialities,
  className,
}: {
  specialities: Speciality[];
  className?: string;
}) {
  if (specialities.length === 0) {
    return (
      <p className={cn("text-[12px] leading-relaxed text-mist-dim", className)}>
        No specialities listed.
      </p>
    );
  }
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)}>
      {specialities.map((s) => {
        const Icon = SPECIALITY_ICONS[s];
        return (
          <div
            key={s}
            className="flex min-h-[72px] flex-col items-center justify-center gap-2 rounded-tile border border-hairline bg-white/[0.015] px-1.5 py-3 text-center"
          >
            <Icon size={17} strokeWidth={1.4} className="shrink-0 text-mist" />
            <span className="text-[10px] leading-tight text-mist">{SPECIALITY_LABELS[s]}</span>
          </div>
        );
      })}
    </div>
  );
}

const MOUNTAIN_CHIP_LIMIT = 6;

/**
 * Mountains as chips, with a "+N more" that actually opens.
 *
 * A "+2 more" that does nothing hides two mountains from somebody deciding
 * whether this guide has been on theirs, so the control expands rather than
 * decorating. Counts live in the EXPERIENCE tab — a chip is a claim to work the
 * mountain, not a claim to have summited it.
 */
function MountainChips({ guide, className }: { guide: Guide; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const all = mountainsOf(guide);
  const shown = expanded ? all : all.slice(0, MOUNTAIN_CHIP_LIMIT);
  const hidden = all.length - shown.length;

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((m) => (
          <span
            key={m}
            className="rounded-full border border-hairline px-3 py-1.5 text-[11.5px] text-mist"
          >
            {m}
          </span>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="tnum rounded-full border border-hairline-strong px-3 py-1.5 text-[11.5px] text-snow transition-colors hover:border-azure/50"
          >
            +{hidden} more
          </button>
        )}
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
        Mountains the guide lists as ground they work. Listing one is not a claim to have summited
        it — the recorded ascents are under EXPERIENCE.
      </p>
    </div>
  );
}

/** Languages as chips. `LanguagesLine` stays the compact form used elsewhere. */
function LanguagesChips({ guide, className }: { guide: Guide; className?: string }) {
  if (guide.languages.length === 0) {
    return <LanguagesLine guide={guide} className={className} />;
  }
  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5">
        {guide.languages.map((l) => (
          <span
            key={l}
            className="rounded-full border border-hairline px-3 py-1.5 text-[11.5px] text-mist"
          >
            {l}
          </span>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
        Languages the guide says they work in. Nothing here says how fluently, and on the mountain
        the language a briefing is given in is the one that matters.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* EXPERIENCE                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The tab that matters.
 *
 * `AscentsByMountain` leads it and everything else is subordinate: "Mont Blanc ·
 * 47 guided ascents" tells a client more about a day on that mountain than any
 * rating on this page, and the rating tab is invented while this is at least the
 * guide's own record of their own work.
 */
function ExperienceTab({
  guide,
  objectivePeak,
  athleteStanding,
}: {
  guide: Guide;
  objectivePeak?: string;
  athleteStanding: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Guided ascents</SectionLabel>
        <Card className="mt-3">
          <AscentsByMountain guide={guide} highlight={objectivePeak} />
        </Card>
      </div>

      <div>
        <SectionLabel>What the guide reports</SectionLabel>
        <Card className="mt-3 space-y-3">
          <Row label="Years guiding" value={guide.yearsGuiding.toLocaleString("en-GB")} numeric />
          <Row
            label="Expeditions led"
            value={guide.expeditionsLed.toLocaleString("en-GB")}
            numeric
          />
          <Row
            label="Highest guided"
            value={`${guide.highestGuidedM.toLocaleString("en-GB")} m`}
            numeric
          />
          <Row label="Mountains listed" value={guide.mountains.join(" · ")} />
          <p className="text-[11px] leading-relaxed text-mist-dim">
            Everything in this block is what the guide says about themselves — years, expeditions
            and altitude are self-reported and none of it has been checked. Your own standing,{" "}
            {athleteStanding}, is what you told ICEFALL at onboarding. The comparison above the tabs
            uses both, and neither side has been verified.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  numeric,
}: {
  label: string;
  value: string;
  /** Tabular figures for real numbers. A sentence is not a number. */
  numeric?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="section-label shrink-0">{label}</span>
      <span className={cn("text-right text-[12px] text-snow", numeric && "tnum")}>{value}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* REVIEWS                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Reviews, and the reason there are none.
 *
 * A review here would have to come from a completed ICEFALL booking, and not one
 * booking has ever completed — so a guide with no rating is not a new or a poor
 * guide, there is simply nothing to average. A demo guide's rating is drawn with
 * the word INVENTED beside it, because a star rating is the most persuasive
 * thing on this page and there is nothing behind it.
 */
function ReviewsTab({ guide }: { guide: Guide }) {
  if (guide.rating === undefined || guide.reviewCount === undefined) {
    return (
      <Card>
        <p className="text-[13px] leading-relaxed text-mist">
          No rating. Nothing has been booked through ICEFALL with this guide.
        </p>
        <Disclaimer className="mt-3">{REVIEWS_NEED_BOOKINGS_NOTICE}</Disclaimer>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start gap-5">
        <div className="shrink-0 text-center">
          <p className="tnum text-[40px] font-extralight leading-none text-snow">
            {guide.rating.toFixed(1)}
          </p>
          <GuideStars rating={guide.rating} className="mt-2.5 justify-center" />
          <p className="tnum mt-2 text-[11px] text-mist-dim">
            {guide.reviewCount.toLocaleString("en-GB")} reviews
          </p>
        </div>
        <RatingDistribution className="min-w-0 flex-1" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
        <Badge tone="azure">Invented</Badge>
        <p className="text-[12px] text-mist">Written by nobody.</p>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-mist">
        This average and this count were made up alongside the rest of this demo guide. There are no
        reviews to read behind them, and no reviewer to ask.
      </p>
      <Disclaimer className="mt-3">{REVIEWS_NEED_BOOKINGS_NOTICE}</Disclaimer>
    </Card>
  );
}

/** Five stars, filled to the nearest whole. The figure beside them is exact. */
function GuideStars({
  rating,
  size = 13,
  className,
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  const filled = Math.round(Math.max(0, Math.min(5, rating)));
  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={1.6}
          className={i < filled ? "text-azure" : "text-mist-dim"}
          fill={i < filled ? "currentColor" : "none"}
        />
      ))}
    </div>
  );
}

/**
 * The 5→1 distribution, drawn EMPTY.
 *
 * The mockup asks for hairline bars per star band and the model holds no such
 * thing: a demo guide carries one average and one count, nothing more. A
 * distribution inferred from an average would be a second invention stacked on
 * the first, and it is the kind that looks like evidence — "31 five-star, 4
 * four-star" reads as thirty-five people who went climbing. So the rows render
 * at zero with an em dash where each count would be, and say why.
 */
function RatingDistribution({ className }: { className?: string }) {
  return (
    <div className={className}>
      <ul className="space-y-2">
        {[5, 4, 3, 2, 1].map((band) => (
          <li key={band} className="flex items-center gap-2.5">
            <span className="tnum w-2 shrink-0 text-[11px] text-mist-dim">{band}</span>
            <Star size={10} strokeWidth={1.6} className="shrink-0 text-mist-dim" />
            <span
              className="h-px flex-1 bg-hairline-strong"
              role="img"
              aria-label={`${band} stars: no breakdown recorded`}
            />
            <span className="tnum w-4 shrink-0 text-right text-[11px] text-mist-dim">—</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
        No breakdown exists. The record holds one average and one count, so every bar is empty —
        splitting an invented average into invented bands would look like evidence.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* AVAILABILITY                                                                */
/* -------------------------------------------------------------------------- */

/**
 * THE HONESTY PROBLEM THIS CALENDAR SOLVES.
 *
 * ICEFALL has no diary for any guide. `Guide` carries ONE standing
 * `availability` value and there is no per-day data anywhere in the model, so a
 * calendar is the single most dangerous component on this page: a grid of
 * coloured squares is read as a diary by everybody who has ever used one, and an
 * athlete who reads a green square as "free on the 14th" books flights.
 *
 * The rules, all enforced below:
 *
 *   · EVERY day derives from the one standing status. Nothing is generated,
 *     hashed, seeded or randomised per day, so the grid is deliberately uniform
 *     — that uniformity is the truthful shape of one status, and a calendar with
 *     varied days would be a lie drawn convincingly.
 *   · No day is ever rendered as CONFIRMED available. The legend and the
 *     per-day label say "the guide's standing status", never "free".
 *   · The notice sits ABOVE the grid, on the tab, before anything is read.
 *   · The azure range is the athlete's own QUESTION, not an agreement. Selecting
 *     it holds nothing and tells nobody, and the line under the grid says so.
 *   · Local date components throughout, via `@/guides/dates` — a UTC month grid
 *     is off by one for everybody west of Greenwich after mid-afternoon.
 */

const STANDING_DOT: Record<Availability, string> = {
  available: "bg-summit",
  limited: "bg-alert",
  unavailable: "bg-danger",
};

/** Legend wording. The standing-status phrasing, never a per-day phrasing. */
const STANDING_LEGEND: Record<Availability, string> = {
  available: "Taking work generally",
  limited: "Limited dates, by their account",
  unavailable: "Not taking work",
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

function AvailabilityTab({ guide }: { guide: Guide }) {
  return (
    <div className="space-y-6">
      <AvailabilityCalendar guide={guide} />

      <Card>
        <AvailabilityLine guide={guide} />
        <div className="mt-4 border-t border-hairline pt-4">
          <RateLine guide={guide} />
        </div>
      </Card>
    </div>
  );
}

/**
 * The window being asked about.
 *
 * ONE piece of state, and `pick` only ever reads it through the functional
 * updater. The first shape of this held the anchor separately and read it from
 * the closure, which loses the range whenever two taps land inside a single
 * React batch — the second tap saw a null anchor and started over. Dates are the
 * part of a request somebody books flights around; the picker does not get to be
 * subtly lossy.
 */
interface AskedWindow {
  from: string;
  to: string;
  /** False while only the first end has been tapped. */
  complete: boolean;
}

function AvailabilityCalendar({ guide }: { guide: Guide }) {
  const today = todayKey();
  const [cursor, setCursor] = useState(today);
  const [asked, setAsked] = useState<AskedWindow | null>(null);

  const days = useMemo(() => monthDays(cursor), [cursor]);
  const offset = days.length > 0 ? mondayFirstIndex(days[0]) : 0;

  const status = guide.availability;

  const pick = (day: string) => {
    setAsked((current) => {
      if (current === null || current.complete) return { from: day, to: day, complete: false };
      // Keys are `YYYY-MM-DD`, so a string compare is a date compare — and it
      // lets somebody pick the end of the window before the start.
      return day < current.from
        ? { from: day, to: current.from, complete: true }
        : { from: current.from, to: day, complete: true };
    });
  };

  return (
    <div>
      {/* Before the grid, not after it. */}
      <Card className="border-azure/25">
        <p className="section-label text-azure/85">No diary</p>
        <p className="mt-2 text-[12px] leading-relaxed text-mist">
          ICEFALL holds no calendar for this guide or for anyone else. There is one standing status
          on this profile — <span className="text-snow">{AVAILABILITY_LABELS[status]}</span> — and
          every day below simply repeats it. No date here has been checked with{" "}
          {guide.name.split(" ")[0]}, nothing has been confirmed with anybody, and a green dot means
          the guide says they are generally taking work — never that this particular day is free.
        </p>
      </Card>

      <Card className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setCursor((c) => shiftMonth(c, -1))}
            className="grid h-11 w-11 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
          >
            <ChevronLeft size={17} strokeWidth={1.6} />
          </button>
          <p className="text-[14px] text-snow">{monthLabel(cursor)}</p>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setCursor((c) => shiftMonth(c, 1))}
            className="grid h-11 w-11 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
          >
            <ChevronRight size={17} strokeWidth={1.6} />
          </button>
        </div>

        {/* No column gap, so a selected range reads as one continuous band
            across a week rather than a row of separate azure squares. */}
        <div className="mt-4 grid grid-cols-7 gap-y-1">
          {WEEKDAYS.map((label, i) => (
            <span key={`${label}-${i}`} className="section-label pb-2 text-center">
              {label}
            </span>
          ))}

          {Array.from({ length: offset }, (_, i) => (
            <span key={`pad-${i}`} aria-hidden="true" />
          ))}

          {days.map((day) => {
            const past = day < today;
            const inRange = asked !== null && day >= asked.from && day <= asked.to;
            const isStart = asked !== null && day === asked.from;
            const isEnd = asked !== null && day === asked.to;

            return (
              <button
                key={day}
                type="button"
                disabled={past}
                aria-pressed={inRange}
                aria-label={
                  past
                    ? `${day} — past`
                    : `${day} — the guide's standing status is ${AVAILABILITY_LABELS[status]}. No diary was checked and this day is not confirmed.`
                }
                onClick={() => pick(day)}
                className={cn(
                  "relative grid h-11 place-items-center text-[12.5px] transition-colors",
                  past && "cursor-default text-mist-dim/50",
                  !past && !inRange && "text-snow hover:bg-white/[0.04]",
                  inRange && "bg-azure/15 text-snow",
                  isStart && "rounded-l-full",
                  isEnd && "rounded-r-full",
                  (isStart || isEnd) && "bg-azure text-obsidian",
                )}
              >
                <span className="tnum leading-none">{Number(day.slice(-2))}</span>
                {/* One dot, the same on every day, because there is one status. */}
                {!past && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-[7px] h-[3px] w-[3px] rounded-full",
                      isStart || isEnd ? "bg-obsidian/60" : STANDING_DOT[status],
                    )}
                  />
                )}
                {day === today && !inRange && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 top-[5px] h-px bg-azure/50"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend ---------------------------------------------------------- */}
        <ul className="mt-4 space-y-2 border-t border-hairline pt-3.5">
          {(["available", "limited", "unavailable"] as const).map((s) => (
            <li key={s} className="flex items-center gap-2.5 text-[11px] leading-relaxed">
              <span className={cn("h-[5px] w-[5px] shrink-0 rounded-full", STANDING_DOT[s])} />
              <span className={s === status ? "text-mist" : "text-mist-dim"}>
                {STANDING_LEGEND[s]}
              </span>
              {s === status && <Badge tone="neutral">This guide</Badge>}
            </li>
          ))}
          <li className="flex items-center gap-2.5 text-[11px] text-mist-dim">
            <span className="h-[5px] w-6 shrink-0 rounded-full bg-azure" />
            The window you are asking about
          </li>
        </ul>

        {/* The selected window --------------------------------------------- */}
        <div className="mt-3.5 border-t border-hairline pt-3.5">
          {asked === null ? (
            <p className="text-[12px] leading-relaxed text-mist">
              Pick a start and an end to mark the window you want to ask about. Choosing dates here
              holds nothing and tells nobody.
            </p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="section-label">
                    {asked.complete ? "You would be asking about" : "Now pick the last day"}
                  </p>
                  <p className="tnum mt-1.5 text-[13px] text-snow">
                    {formatDateRange(asked.from, asked.to)}
                  </p>
                  <p className="tnum mt-0.5 text-[11px] text-mist-dim">
                    {nightsToDays(asked.from, asked.to).toLocaleString("en-GB")} day
                    {nightsToDays(asked.from, asked.to) === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setAsked(null)}
                >
                  Clear
                </Button>
              </div>
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist">
                Nothing is held and nobody has been told. These dates were never checked against a
                calendar, because there is none — take them into a request and ask.
              </p>
            </>
          )}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
          Days before today are shown without a dot and cannot be picked
          {guide.demo
            ? ". On a demo guide the standing status was invented like everything else"
            : ""}
          .
        </p>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Report, block, support                                                      */
/* -------------------------------------------------------------------------- */

function SafetyActions({
  guide,
  blocked,
  onBlock,
  onUnblock,
  reportCount,
}: {
  guide: Guide;
  blocked: boolean;
  onBlock: () => void;
  onUnblock: () => void;
  reportCount: number;
}) {
  const [open, setOpen] = useState<"report" | "support" | null>(null);

  return (
    <Card>
      <SectionLabel>Something wrong here</SectionLabel>

      <div className="mt-3 flex flex-wrap gap-2.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen((v) => (v === "report" ? null : "report"))}
        >
          <Flag size={14} strokeWidth={1.7} />
          Report
        </Button>
        {blocked ? (
          <Button variant="secondary" size="sm" onClick={onUnblock}>
            <Undo2 size={14} strokeWidth={1.7} />
            Unblock
          </Button>
        ) : (
          <Button variant="danger" size="sm" onClick={onBlock}>
            <Ban size={14} strokeWidth={1.7} />
            Block
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => (v === "support" ? null : "support"))}
        >
          <LifeBuoy size={14} strokeWidth={1.7} />
          Support
        </Button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">{BLOCK_NOTE}</p>

      {reportCount > 0 && (
        <p className="tnum mt-2 text-[11px] text-mist-dim">
          {reportCount} report{reportCount === 1 ? "" : "s"} saved on this device about this guide.
          Nobody has read them.
        </p>
      )}

      {open === "report" && <ReportForm guide={guide} onDone={() => setOpen(null)} />}

      {open === "support" && (
        <div className="mt-4 rounded-tile border border-hairline bg-white/[0.015] p-3.5">
          <p className="section-label">ICEFALL support</p>
          <p className="mt-2 text-[12px] leading-relaxed text-mist">{SUPPORT_NOTE}</p>
          <p className="mt-2.5 flex items-start gap-2 text-[11px] leading-relaxed text-mist-dim">
            <Users size={12} strokeWidth={1.6} className="mt-[2px] shrink-0" />
            For anything about a qualification, the association that issued it is the body that can
            confirm or withdraw it. That is the right first call, not this app.
          </p>
        </div>
      )}
    </Card>
  );
}

function ReportForm({ guide, onDone }: { guide: Guide; onDone: () => void }) {
  const { report } = useGuideModeration();
  const [reason, setReason] = useState<GuideReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [saved, setSaved] = useState(false);

  if (saved) {
    return (
      <div className="mt-4 rounded-tile border border-hairline bg-white/[0.015] p-3.5">
        <p className="section-label">Saved on this device</p>
        <p className="mt-2 text-[12px] leading-relaxed text-mist">
          Your report is written to this device. It has been sent to nobody and nobody will act on
          it. If this is serious, take it to the association named on the guide's qualifications, or
          to the police where a crime may have been committed.
        </p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={onDone}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-tile border border-hairline bg-white/[0.015] p-3.5">
      <p className="section-label">Report {guide.name}</p>

      {/* Said BEFORE the athlete writes, not after they submit. */}
      <Disclaimer className="mt-2.5">{REPORT_NOT_SENT_NOTICE}</Disclaimer>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {REPORT_REASON_IDS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={reason === r}
            onClick={() => setReason(reason === r ? null : r)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[11.5px] transition-colors",
              reason === r
                ? "border-azure/55 bg-azure/[0.12] text-azure"
                : "border-hairline text-mist hover:text-snow",
            )}
          >
            {REPORT_REASON_LABELS[r]}
          </button>
        ))}
      </div>

      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        rows={4}
        placeholder="What happened, in your own words."
        className="mt-3 w-full resize-none rounded-tile border border-hairline bg-graphite p-3 text-[12.5px] leading-relaxed text-snow outline-none placeholder:text-mist-dim focus:border-azure/50"
      />

      <div className="mt-3 flex gap-2.5">
        <Button
          size="sm"
          disabled={reason === null}
          onClick={() => {
            if (reason === null) return;
            report({ guideId: guide.id, guideName: guide.name, reason, detail });
            setSaved(true);
          }}
        >
          Save report
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
