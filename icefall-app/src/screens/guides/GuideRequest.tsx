import { useMemo, useState } from "react";
import { ChevronDown, Lock, Minus, Plus, Star } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Card, Disclaimer } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { MountainThumb } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { sync } from "@/services/repository";
import { useApp } from "@/state/AppState";
import type { MountainRoute } from "@/types";
// `CREDENTIAL_CLAIM_NOTICE` is not imported here on purpose: `Credentials` from
// `./shared` renders it above its own list, and a second copy on this screen is
// how two surfaces start wording the same warning differently.
import { GUIDE_DEMO_NOTICE, NO_GUIDES_NOTICE, credentialStatus, guideById } from "@/guides/types";
import { GUIDE_REQUEST_NOT_SENT, useGuideStore } from "@/guides/store";
import {
  EXPERIENCE_BANDS,
  EXPERIENCE_BAND_COPY,
  REVIEWS_NEED_BOOKINGS_NOTICE,
  useEngagementStore,
  type ExperienceBand,
} from "@/guides/engagement";
import { dateKey, formatDateRange, nightsToDays, todayKey } from "@/guides/dates";
import {
  AvailabilityLine,
  Credentials,
  GuideBadges,
  GuidePortrait,
  RateLine,
  Specialities,
} from "./shared";
import { Caution, TextArea, TextInput } from "./bookingParts";

/**
 * Asking a guide for their time.
 *
 * The screen is a form, but the thing being arranged is a person's working day
 * on terrain that kills people, so two decisions run through all of it:
 *
 *   THE ATHLETE IS TOLD BEFORE THEY WRITE, NOT AFTER THEY SUBMIT, that this
 *   request is held on their device and reaches nobody. A "sent" confirmation
 *   on a screen with no network behind it is the failure mode that ends with
 *   somebody flying to Chamonix to meet a guide who has never heard of them.
 *
 *   NOTHING IS FILLED IN ON THE ATHLETE'S BEHALF THAT A GUIDE WOULD READ AS A
 *   STATEMENT. Mountain and dates are prefilled from their own ICEFALL goal and
 *   labelled as such, on the row itself rather than in a hint nobody opens.
 *   Experience is not prefilled at all — an experience level this app inferred
 *   from recorded hill walks is not the sentence a guide needs before agreeing
 *   to rope up with a stranger.
 *
 * PRESENTATION. The form is a stack of labelled rows that open onto their own
 * picker, so the whole request reads as five short answers rather than a page of
 * inputs. The guide it is going to stays pinned at the top: a request composed
 * against the wrong name is worth catching before the submit, not after it.
 */

/** How many climbers the party field will accept. */
const MAX_GROUP = 12;

/**
 * Above this, a guide is no longer making individual decisions about individual
 * climbers on technical ground. Taken from the ratio guidance ICEFALL already
 * gives in `@/services/expeditionAccess`, so the two surfaces cannot disagree.
 */
const RATIO_CAUTION_AT = 2;

/** The message box's ceiling, and the number the counter reads against. */
const MESSAGE_LIMIT = 500;

/** Which row is open. One at a time, so the form stays five lines long. */
type FieldId = "mountain" | "route" | "dates" | "group" | "experience";

export function GuideRequest() {
  const { id: guideId = "" } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { goals } = useApp();
  const { requestGuide } = useGuideStore();
  const { recordDetail } = useEngagementStore();

  const guide = guideById(guideId);

  /**
   * The goal this request is about: the one named in the link, otherwise the
   * soonest active objective. Prefill is a convenience and it is labelled — the
   * athlete may be asking about something entirely different.
   */
  const goal = useMemo(() => {
    const named = params.get("goal");
    if (named) {
      const match = goals.find((g) => g.id === named);
      if (match) return match;
    }
    return goals
      .filter((g) => g.status === "active")
      .sort((a, b) => +new Date(a.targetDate) - +new Date(b.targetDate))[0];
  }, [goals, params]);

  const prefilledMountain = params.get("peak") ?? goal?.name ?? "";
  const prefilledElevation = Number(params.get("elevation")) || goal?.elevationM;

  const [mountain, setMountain] = useState(prefilledMountain);
  const [route, setRoute] = useState("");
  const [from, setFrom] = useState(() => {
    // The goal's target date, clamped to today: a request for dates that have
    // already passed is a form nobody proofread, not a plan.
    const target = goal?.targetDate ? dateKey(new Date(goal.targetDate)) : todayKey();
    return target < todayKey() ? todayKey() : target;
  });
  const [to, setTo] = useState(from);
  const [groupSize, setGroupSize] = useState(1);
  const [experience, setExperience] = useState<ExperienceBand | null>(null);
  const [message, setMessage] = useState("");
  const [openField, setOpenField] = useState<FieldId | null>(null);

  /**
   * The routes ICEFALL actually holds for the mountain named above.
   *
   * The curated objectives carry a real route list; a typed name or a custom
   * objective carries none. Where there is none the picker says so and the field
   * stays free text — offering a line this app made up would put a route nobody
   * chose in front of a guide, and route choice is where the risk lives.
   */
  const knownRoutes = useMemo<MountainRoute[]>(() => {
    const wanted = mountain.trim().toLowerCase();
    if (!wanted) return [];
    return sync.mountains.find((m) => m.name.toLowerCase() === wanted)?.routes ?? [];
  }, [mountain]);

  /* ---- Guide missing ---------------------------------------------------- */

  /**
   * In a production build the catalogue is empty, so this is the normal path
   * rather than an error. It says why there is nobody here instead of showing a
   * broken form.
   */
  if (!guide) {
    return (
      <Screen>
        <ScreenHeader title="Request a guide" back />
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

  const days = nightsToDays(from, to);
  const datesValid = to >= from;
  const canSubmit = mountain.trim().length > 0 && datesValid && experience !== null;
  const prefilledFromGoal = Boolean(goal && prefilledMountain);
  const toggle = (id: FieldId) => setOpenField((current) => (current === id ? null : id));

  function submit() {
    if (!guide || !canSubmit || experience === null) return;

    // The marketplace record — see `@/guides/store`. Returns the request id.
    const requestId = requestGuide({
      guide,
      peakName: mountain.trim(),
      elevationM: prefilledElevation,
      fromIso: from,
      toIso: to,
      groupSize,
      message: message.trim(),
    });

    // The detail a guide actually needs that the marketplace record does not
    // carry. Keyed to the same request id — see `@/guides/engagement`.
    recordDetail(requestId, {
      route: route.trim(),
      experience,
      goalId: goal?.id,
    });

    navigate(`/explore/guides/thread/${requestId}`, { replace: true });
  }

  return (
    <Screen>
      <ScreenHeader title="Request a guide" back />

      {/* Pinned, and deliberately outside the entrance animation: a transform on
          an ancestor would break `position: sticky`. Who this is going to stays
          on screen for the whole form. */}
      <div className="sticky top-0 z-20 -mx-5 border-b border-hairline bg-obsidian/95 px-5 pb-3.5 backdrop-blur">
        <GuideHeaderCard guideId={guide.id} />
      </div>

      <Stagger>
        {/* Said before a word is typed, not after the submit. */}
        <Rise className="pt-5">
          <Caution>{GUIDE_REQUEST_NOT_SENT}</Caution>
        </Rise>

        {/* Everything the header card compresses, said in full. The rate, the
            standing availability and the qualifications all come from
            `./shared`, so this screen cannot describe a guide more warmly than
            the directory does. */}
        <Rise className="pt-4">
          <Card>
            <Specialities guide={guide} />

            <div className="mt-4 grid gap-4 border-t border-hairline pt-4 sm:grid-cols-2">
              <RateLine guide={guide} />
              <AvailabilityLine guide={guide} />
            </div>

            <Credentials guide={guide} className="mt-4 border-t border-hairline pt-4" />

            {/* Ratings are invented on a demo guide and there is no other kind:
                a review needs a completed ICEFALL booking, and none exists. */}
            <Disclaimer className="mt-4">{REVIEWS_NEED_BOOKINGS_NOTICE}</Disclaimer>

            {guide.demo === true && <Disclaimer className="mt-3">{GUIDE_DEMO_NOTICE}</Disclaimer>}

            {guide.featured === true && (
              // Labelled, and labelled as what it is. A paid slot buys the label
              // and nothing else — never a claim about qualification.
              <Disclaimer className="mt-3">
                Featured is a promoted slot. It says nothing about this guide's qualifications or
                record.
              </Disclaimer>
            )}
          </Card>
        </Rise>

        {/* ---- The request ------------------------------------------------ */}

        <Rise className="pt-7">
          <p className="section-label">Your request</p>
          <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
            Five answers. A guide decides on the dates, the party and what you have done before — in
            that order.
          </p>
        </Rise>

        <Rise className="pt-3.5">
          <Card inset={false} className="overflow-hidden">
            {/* ---- Mountain ---------------------------------------------- */}

            <FieldRow
              label="Mountain"
              open={openField === "mountain"}
              onToggle={() => toggle("mountain")}
              note={
                // The value beside it is already the objective's name, so the
                // note only has to say where it came from.
                prefilledFromGoal && mountain.trim() === prefilledMountain.trim()
                  ? "From your ICEFALL objective"
                  : undefined
              }
              value={
                mountain.trim() ? (
                  <>
                    {/* Only while the row is closed: the thumbnail resolves the
                        peak over the network, and doing that on every keystroke
                        of a half-typed name is a request per letter. */}
                    {openField !== "mountain" && (
                      <MountainThumb
                        peak={{
                          name: mountain.trim(),
                          elevationM: prefilledElevation,
                          lat: goal?.lat,
                          lon: goal?.lon,
                          photo: goal?.photo,
                          wikipedia: goal?.wikipedia,
                        }}
                        size={26}
                      />
                    )}
                    <span className="truncate">{mountain}</span>
                  </>
                ) : (
                  <Unset>Choose a mountain</Unset>
                )
              }
            >
              <p className="mb-2.5 text-[11px] leading-relaxed text-mist-dim">
                {prefilledFromGoal
                  ? `Prefilled from your ICEFALL objective, ${goal?.name}. Change it freely — you may be asking about something else.`
                  : "Which mountain this is about."}
              </p>
              <TextInput
                value={mountain}
                onChange={(e) => setMountain(e.target.value)}
                placeholder="Which mountain?"
                aria-label="Mountain"
              />
              {guide.mountains.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {guide.mountains.map((m) => (
                    <Chip
                      key={m}
                      active={mountain.trim().toLowerCase() === m.toLowerCase()}
                      onClick={() => setMountain(m)}
                    >
                      {m}
                    </Chip>
                  ))}
                </div>
              )}
            </FieldRow>

            {/* ---- Route -------------------------------------------------- */}

            <FieldRow
              label="Route"
              open={openField === "route"}
              onToggle={() => toggle("route")}
              note={route.trim() ? undefined : "To agree with the guide"}
              value={
                route.trim() ? (
                  <span className="truncate">{route}</span>
                ) : (
                  // Never a route ICEFALL chose. "Not decided" is the athlete's
                  // actual position and a guide needs to read it as one.
                  <Unset>Not decided</Unset>
                )
              }
            >
              {knownRoutes.length > 0 ? (
                <>
                  <p className="mb-2.5 text-[11px] leading-relaxed text-mist-dim">
                    Optional. These are the routes ICEFALL holds for {mountain.trim()} — its own
                    records of the mountain, not this guide's. Nothing here says they guide any of
                    them, and leaving it blank is a real answer.
                  </p>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {knownRoutes.map((r) => (
                      <Chip
                        key={r.name}
                        active={route.trim().toLowerCase() === r.name.toLowerCase()}
                        onClick={() => setRoute(route.trim() === r.name ? "" : r.name)}
                      >
                        {r.name}
                        <span className="ml-1.5 text-[10px] text-mist-dim">{r.gradeLabel}</span>
                      </Chip>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mb-2.5 text-[11px] leading-relaxed text-mist-dim">
                  Optional. ICEFALL holds no route list for
                  {mountain.trim() ? ` ${mountain.trim()}` : " this objective"}, and none for any
                  guide, so this is free text rather than a picker — leave it blank if the line is
                  still open and agree it with them.
                </p>
              )}
              <TextInput
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="Route, or leave blank to decide together"
                aria-label="Route"
              />
            </FieldRow>

            {/* ---- Dates -------------------------------------------------- */}

            <FieldRow
              label="Dates"
              open={openField === "dates"}
              onToggle={() => toggle("dates")}
              note={
                goal?.targetDate && from === clampedTargetKey(goal.targetDate)
                  ? "From your objective's target date"
                  : undefined
              }
              value={
                datesValid ? (
                  <>
                    <span className="tnum truncate">{formatDateRange(from, to)}</span>
                    <span className="tnum shrink-0 text-mist-dim">
                      {days} {days === 1 ? "day" : "days"}
                    </span>
                  </>
                ) : (
                  <Unset>The last day is before the first</Unset>
                )
              }
            >
              <p className="mb-2.5 text-[11px] leading-relaxed text-mist-dim">
                The window you want on the hill. A guide's answer usually depends more on the dates
                than on the route.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1.5 text-[11px] text-mist-dim">From</p>
                  <TextInput
                    type="date"
                    value={from}
                    aria-label="First day"
                    onChange={(e) => {
                      const next = e.target.value;
                      setFrom(next);
                      // Keep the window coherent rather than rejecting it later:
                      // an end before a start is a mis-tap, not an intention.
                      if (next > to) setTo(next);
                    }}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] text-mist-dim">To</p>
                  <TextInput
                    type="date"
                    value={to}
                    min={from}
                    aria-label="Last day"
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
              </div>
              {/* A standing status is not a diary. ICEFALL holds no calendar for
                  any guide, so nothing on this screen says these particular days
                  are free. */}
              <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
                {datesValid
                  ? `${days} ${days === 1 ? "day" : "days"} on the hill. `
                  : "The last day is before the first. "}
                ICEFALL does not know whether these particular dates are free — the guide would
                answer that.
              </p>
            </FieldRow>

            {/* ---- Group -------------------------------------------------- */}

            <FieldRow
              label="Group size"
              open={openField === "group"}
              onToggle={() => toggle("group")}
              value={
                <span className="truncate">
                  <span className="tnum">{groupSize}</span>{" "}
                  {groupSize === 1 ? "climber" : "climbers"}
                </span>
              }
            >
              <p className="mb-3 text-[11px] leading-relaxed text-mist-dim">
                Everyone who would be roped up, including you.
              </p>
              <div className="flex items-center gap-4">
                <Stepper
                  label="Fewer climbers"
                  icon={<Minus size={15} strokeWidth={1.8} />}
                  disabled={groupSize <= 1}
                  onClick={() => setGroupSize((n) => Math.max(1, n - 1))}
                />
                <span className="tnum min-w-[2ch] text-center text-[24px] font-light text-snow">
                  {groupSize}
                </span>
                <Stepper
                  label="More climbers"
                  icon={<Plus size={15} strokeWidth={1.8} />}
                  disabled={groupSize >= MAX_GROUP}
                  onClick={() => setGroupSize((n) => Math.min(MAX_GROUP, n + 1))}
                />
              </div>
              {groupSize > RATIO_CAUTION_AT && (
                <Caution className="mt-3.5">
                  On technical or glaciated ground the guide-to-client ratio should be 1:1 or 1:2. A
                  party of {groupSize} with one guide means asking them to accept a wider ratio —
                  ask what they will actually take, in writing, before you agree a price.
                </Caution>
              )}
            </FieldRow>

            {/* ---- Experience --------------------------------------------- */}

            <FieldRow
              label="Experience"
              open={openField === "experience"}
              onToggle={() => toggle("experience")}
              note={experience === null ? "Needed before you can submit" : undefined}
              value={
                experience === null ? (
                  <Unset>Not stated</Unset>
                ) : (
                  <span className="truncate">{EXPERIENCE_BAND_COPY[experience]}</span>
                )
              }
            >
              <p className="mb-3 text-[11px] leading-relaxed text-mist-dim">
                Your own words about your own climbing. ICEFALL does not fill this in from your
                training — what a guide needs is what you say about yourself, not a number this app
                derived.
              </p>
              <div className="space-y-2">
                {EXPERIENCE_BANDS.map((band) => {
                  const active = experience === band;
                  return (
                    <button
                      key={band}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setExperience(band)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-tile border p-3.5 text-left transition-colors",
                        active
                          ? "border-azure/50 bg-azure/[0.06]"
                          : "border-hairline hover:border-hairline-strong",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                          active ? "border-azure" : "border-hairline-strong",
                        )}
                      >
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-azure" />}
                      </span>
                      <span className="text-[13px] leading-snug text-mist">
                        {EXPERIENCE_BAND_COPY[band]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </FieldRow>
          </Card>
        </Rise>

        {/* ---- Message ------------------------------------------------ */}

        <Rise className="pt-6">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="section-label">Message</span>
            <span
              className={cn(
                "tnum text-[11px]",
                message.length >= MESSAGE_LIMIT ? "text-alert" : "text-mist-dim",
              )}
            >
              {message.length}/{MESSAGE_LIMIT}
            </span>
          </div>
          <p className="mb-2 text-[11px] leading-relaxed text-mist-dim">
            Optional. Anything a guide should know before they answer — a fixed return flight, an
            injury, someone in the party who has never worn crampons.
          </p>
          <TextArea
            rows={5}
            value={message}
            maxLength={MESSAGE_LIMIT}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Anything else worth saying…"
            aria-label="Message to the guide"
          />
        </Rise>

        {/* ---- Submit ------------------------------------------------- */}

        <Rise className="pt-6">
          {/* Repeated immediately above the button. Someone who scrolled
              straight to the bottom must still hit this sentence. */}
          <Disclaimer>{GUIDE_REQUEST_NOT_SENT}</Disclaimer>

          <Button size="lg" className="mt-4 w-full" onClick={submit} disabled={!canSubmit}>
            Submit request
          </Button>

          {!canSubmit && (
            <p className="mt-2.5 text-center text-[11px] text-mist-dim">
              {mountain.trim().length === 0
                ? "Name the mountain to continue."
                : !datesValid
                  ? "Check the dates to continue."
                  : "Choose the line that describes your experience."}
            </p>
          )}

          {/* The privacy statement, beneath the control it qualifies. */}
          <p className="mt-4 flex items-start gap-2.5 text-[11px] leading-relaxed text-mist-dim">
            <Lock size={12} strokeWidth={1.7} aria-hidden="true" className="mt-[3px] shrink-0" />
            Held on this device. There is no server behind this form: what you write stays in this
            browser, nobody else can read it, and deleting the request removes it.
          </p>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* The guide this is going to                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Who the request is addressed to, in the four things worth checking before
 * writing a word: the name, what they claim, what anybody has said about them,
 * and whether any of it is real data at all.
 *
 * On a demo guide the portrait is a GENERATED face of a person who does not
 * exist; anyone else falls back to initials. ICEFALL holds no photograph of a
 * real guide — a real face against an invented name and an invented licence
 * would present that person as a working guide they are not.
 */
function GuideHeaderCard({ guideId }: { guideId: string }) {
  const guide = guideById(guideId);
  if (!guide) return null;

  const credential = guide.credentials[0];

  return (
    <div className="flex items-center gap-3 rounded-card border border-hairline bg-graphite p-3.5">
      <GuidePortrait name={guide.name} src={guide.portrait} size={46} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[14.5px] text-snow">{guide.name}</p>
          <GuideBadges guide={guide} />
        </div>

        {/* Never a tick. `credentialStatus` returns "Claimed" for everything in
            this build, and the day a registry check exists it is that function —
            not this card — that starts saying otherwise. */}
        <p className="mt-1 truncate text-[11.5px] text-mist">
          {credential ? (
            <>
              {credential.label}
              <span className="text-mist-dim"> · {credentialStatus(credential)}</span>
            </>
          ) : (
            "No qualification listed"
          )}
        </p>

        <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px]">
          {guide.rating === undefined ? (
            // Never a zero and never a blank star row: "nobody has reviewed
            // this guide" and "this guide scores nothing" read as opposites.
            <span className="text-mist-dim">No rating — no ICEFALL booking has completed</span>
          ) : (
            <>
              <Star size={11} strokeWidth={1.8} aria-hidden="true" className="text-azure" />
              <span className="tnum text-snow">{guide.rating.toFixed(1)}</span>
              <span className="tnum text-mist-dim">
                ({guide.reviewCount ?? 0}) · invented for this demonstration
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form furniture                                                              */
/* -------------------------------------------------------------------------- */

/**
 * One answer: its label, what it currently says, and the picker it opens onto.
 *
 * The closed row is the whole point — a request the athlete can read back in
 * five lines before submitting it. Every row can render an unanswered state, and
 * none of them renders a value ICEFALL invented on the athlete's behalf.
 */
function FieldRow({
  label,
  value,
  note,
  open,
  onToggle,
  children,
}: {
  label: string;
  value: React.ReactNode;
  /** Where a prefilled value came from. Said on the row, not hidden in a hint. */
  note?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-hairline first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className="section-label w-[86px] shrink-0">{label}</span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2.5 text-[13px] text-snow">{value}</span>
          {note && <span className="mt-1 block truncate text-[10px] text-mist-dim">{note}</span>}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.6}
          aria-hidden="true"
          className={cn("shrink-0 text-mist-dim transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

/** An answer the athlete has not given. Dimmed, and always a sentence. */
function Unset({ children }: { children: React.ReactNode }) {
  return <span className="truncate text-mist-dim">{children}</span>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[12px] transition-colors",
        active
          ? "border-azure/50 bg-azure/10 text-azure"
          : "border-hairline-strong text-mist hover:border-azure/40 hover:text-snow",
      )}
    >
      {children}
    </button>
  );
}

function Stepper({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-11 w-11 place-items-center rounded-full border border-hairline-strong text-mist transition-colors hover:border-azure/50 hover:text-snow disabled:pointer-events-none disabled:opacity-30"
    >
      {icon}
    </button>
  );
}

/**
 * The goal's target date as the date field would hold it — clamped to today,
 * exactly as the initial state clamps it. Used only to decide whether the row
 * may still claim the dates came from the objective.
 */
function clampedTargetKey(targetDate: string): string {
  const target = dateKey(new Date(targetDate));
  return target < todayKey() ? todayKey() : target;
}

export default GuideRequest;
