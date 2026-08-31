import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarCheck,
  ChevronDown,
  Info,
  Lock,
  MapPin,
  MessageCircle,
  Minus,
  Mountain,
  Plus,
  Route as RouteIcon,
  Star,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { AvailabilityCalendar } from "./AvailabilityCalendar";
import { DateField } from "@/components/ui/DateField";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { DEMO } from "@/offline/offline";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { MountainBackdrop, MountainThumb } from "@/components/domain/MountainImage";
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
 * `YYYY-MM-DD` ⇄ `Date`, both LOCAL.
 *
 * `new Date("2026-07-15")` is UTC midnight, which is the previous day for
 * anybody west of Greenwich — the bug this project has fixed several times.
 * Splitting the parts and using the local constructor keeps the calendar on the
 * day the athlete actually picked.
 */
/**
 * Whether this build may fill the screen with invented figures.
 *
 * Owner ruling, 2026-08-31: *"EVEN IF IT TAKES ADDING FAKE DETAILS JUST COPY
 * THE DAMN MOCKUPS."* A demo build behind a flag, under a SAMPLE DATA banner,
 * shown to the person who commissioned the design, has nobody to mislead — the
 * honesty doctrine protects users in production, and was never meant to stop
 * the owner seeing their own screen work.
 *
 * Everything gated on this is invented and says so on screen.
 */
const DEMO_FILL = SHOW_DEMO_DATA || DEMO;

/** From the owner's mockup. Invented; ICEFALL holds no hut tariff. */
const DEMO_HUT_PER_NIGHT = 80;
/** From the owner's mockup. Invented; ICEFALL holds no permit schedule. */
const DEMO_PERMIT_PER_HEAD = 60;

function addDays(key: string, n: number): string {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return toDayKey(d);
}

function PriceLine({
  label,
  sub,
  amount,
  className,
}: {
  label: string;
  sub: string;
  amount: number;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className ?? ""}`}>
      <div className="min-w-0">
        <p className="text-[13px] text-snow">{label}</p>
        <p className="tnum mt-0.5 text-[11.5px] text-mist-dim">{sub}</p>
      </div>
      <p className="tnum shrink-0 text-[15px] text-snow">€{amount.toLocaleString("en-GB")}</p>
    </div>
  );
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

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

/**
 * The message field, addressable from the foot.
 *
 * `phone-3.png` draws MESSAGE GUIDE beside BOOK GUIDE as if messaging were a
 * second destination. There is no thread until a request exists, so the control
 * takes you to the message on this screen rather than opening a conversation
 * that does not exist yet.
 */
const MESSAGE_FIELD_ID = "guide-request-message";

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
  /**
   * DEMO ONLY — a six-day window and a party of two, matching the owner's
   * mockup.
   *
   * Production still opens on a single day at the objective's target date,
   * because that is the athlete's own information and guessing a longer trip
   * for them would be putting words in the form. But a price breakdown reading
   * "€620 × 1 day" demonstrates nothing: the owner is judging whether the
   * arithmetic reads clearly, and it cannot read clearly with nothing to
   * multiply.
   */
  const [to, setTo] = useState(() => (DEMO_FILL ? addDays(from, 5) : from));
  const [groupSize, setGroupSize] = useState(DEMO_FILL ? 2 : 1);
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

  const credential = guide.credentials[0];

  return (
    <Screen>
      <ScreenHeader title="Request Guide" back />

      {/* The hero `phone-3.png` draws: the guide's face at size, their name, the
          qualification they claim and where they work — over the mountain being
          requested.

          The backdrop is that mountain and no other. `MountainBackdrop` dims
          derived artwork to 45% and shows a genuine photograph at full strength,
          so the picture never claims to be a photograph of a peak nobody
          photographed for us. With no mountain chosen there is no picture. */}
      <div className="relative -mx-5 -mt-2 overflow-hidden">
        {mountain.trim().length > 0 && (
          <>
            <MountainBackdrop peak={{ name: mountain.trim() }} scrim="none" />
            {/* The component's own scrims fade from one EDGE. This hero puts
                white text over the middle of a snow face, which is the
                brightest thing in the picture — so the wash is uniform first
                and directional second. Checked against the summit snow of Mont
                Blanc, the worst case in the set. */}
            <div className="absolute inset-0 bg-obsidian/72" />
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/35 to-transparent" />
          </>
        )}

        <div className="relative flex items-center gap-4 px-5 pb-6 pt-7">
          <GuidePortrait
            name={guide.name}
            src={guide.portrait}
            size={104}
            circle
            className="shrink-0 ring-2 ring-white/60"
          />

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[25px] font-light leading-tight tracking-tight text-snow">
              {guide.name}
            </h2>

            {/* The qualification as CLAIMED, in the drawing's position. The
                status word beside it is `credentialStatus` and nothing else:
                the day a registry check exists it is that function that starts
                saying "Verified", not this hero. */}
            {credential ? (
              // Wraps, and does not truncate. The first draft of this hero
              // clipped the line at the guide's width and the ellipsis ate
              // "· Claimed" — leaving "IFMGA / UIAGM mountain guide" reading as
              // a fact ICEFALL had established. The qualifier is the honest
              // half of the sentence; it is the half that must never be the
              // one that falls off the end.
              <p className="mt-1 text-[13.5px] leading-snug text-mist">
                {credential.label}
                <span className="text-mist-dim"> · {credentialStatus(credential)}</span>
              </p>
            ) : (
              <p className="mt-1 text-[14px] text-mist-dim">No qualification listed</p>
            )}

            <p className="mt-2 flex items-center gap-1.5 text-[13.5px] text-mist">
              <MapPin size={13} strokeWidth={1.7} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{guide.basedIn}</span>
            </p>
          </div>
        </div>
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
          {/* The drawing carries no explanatory paragraph here, and it is right
              not to: five labelled rows explain themselves. */}
          <p className="section-label">What you're requesting</p>
        </Rise>

        <Rise className="pt-3.5">
          <Card inset={false} className="overflow-hidden">
            {/* ---- Mountain ---------------------------------------------- */}

            <FieldRow
              icon={Mountain}
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
              icon={RouteIcon}
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
              icon={CalendarDays}
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

              {/* The owner's mockup date strip. Tapping a day sets the start and
                  drags the end with it, so one tap is always a valid range. */}
              <AvailabilityCalendar
                className="mb-3"
                seed={guide.id}
                from={parseDayKey(from)}
                to={parseDayKey(to)}
                onPick={(d) => {
                  const key = toDayKey(d);
                  if (key < from || key > to) {
                    setFrom(key);
                    if (key > to) setTo(key);
                  } else {
                    setTo(key);
                  }
                }}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1.5 text-[11px] text-mist-dim">From</p>
                  <DateField
                    label="First day"
                    value={from}
                    onChange={(next) => {
                      setFrom(next);
                      // Keep the window coherent rather than rejecting it later:
                      // an end before a start is a mis-tap, not an intention.
                      if (next > to) setTo(next);
                    }}
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] text-mist-dim">To</p>
                  <DateField label="Last day" value={to} min={from} onChange={setTo} />
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
              icon={Users}
              label="Party size"
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
              icon={Star}
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
            id={MESSAGE_FIELD_ID}
          />
        </Rise>

        {/* ---- What this would cost --------------------------------------
            The owner's "Request Guide" mockup, 2026-08-31. Its structure is
            copied: the guiding line with its arithmetic shown, then the
            pass-through costs, then a total.

            TWO OF THE MOCKUP'S THREE LINES ARE NUMBERS ICEFALL DOES NOT HAVE.
            It itemises "Hut fees €80 × 6 days × 2 climbers" and "Permits €60 ×
            2 climbers", and totals them as **TOTAL (ALL IN) €4,980** under the
            words *"The price you see is the price you pay."*

            ICEFALL holds no hut tariff and no permit schedule for any route.
            Those figures would be invented, and inventing them is worse here
            than anywhere else in the app: a climber budgets against this
            screen, arrives, and finds the hut charges something else. Worse,
            "ALL IN" converts an estimate into a promise — the one line that
            makes the other two unrecoverable.

            So: the guiding fee, which IS known, with its arithmetic exactly as
            drawn. Then the pass-through costs named but not priced, and the
            total labelled for what it covers. The mockup's sentence survives
            where it is true — the guide's rate is what the client pays,
            because ICEFALL's commission is deducted from the guide rather than
            added to the client. */}
        {guide.dailyRateEur > 0 && datesValid && (
          <Rise className="pt-7">
            <SectionLabel>Price breakdown</SectionLabel>

            {/* ONE card, as `phone-3.png` draws it. An earlier pass split the
                guiding fee and the pass-through costs into two cards to keep
                the known figure away from the invented ones. The drawing puts
                them in one list under one total, and the sentence beneath the
                total already says which figures are invented — a card border
                was never what carried that. */}
            <Card className="mt-3">
              <PriceLine
                label="Guide day rate"
                sub={`€${guide.dailyRateEur} × ${days} ${days === 1 ? "day" : "days"}`}
                amount={guide.dailyRateEur * days}
              />

              {DEMO_FILL && (
                <>
                  <PriceLine
                    className="mt-3.5"
                    label="Hut fees"
                    sub={`€${DEMO_HUT_PER_NIGHT} × ${days} ${days === 1 ? "day" : "days"} × ${groupSize} ${groupSize === 1 ? "climber" : "climbers"}`}
                    amount={DEMO_HUT_PER_NIGHT * days * groupSize}
                  />
                  <PriceLine
                    className="mt-3.5"
                    label="Permits"
                    sub={`€${DEMO_PERMIT_PER_HEAD} × ${groupSize} ${groupSize === 1 ? "climber" : "climbers"}`}
                    amount={DEMO_PERMIT_PER_HEAD * groupSize}
                  />
                </>
              )}

              <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-hairline-strong pt-4">
                <p className="text-[14px] text-snow">
                  Total{" "}
                  {/* "ALL IN" only where it is true. In production the hut and
                      permit figures are absent, so the total covers the guide
                      and says so — the drawing's promise cannot outlive the
                      numbers that justified it. */}
                  <span className="text-[11px] uppercase tracking-[0.1em] text-azure">
                    {DEMO_FILL ? "all in" : "guiding only"}
                  </span>
                </p>
                <p className="tnum text-[22px] font-light text-azure">
                  €
                  {(
                    guide.dailyRateEur * days +
                    (DEMO_FILL
                      ? DEMO_HUT_PER_NIGHT * days * groupSize + DEMO_PERMIT_PER_HEAD * groupSize
                      : 0)
                  ).toLocaleString("en-GB")}
                </p>
              </div>

              <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
                {DEMO_FILL
                  ? "The price you see is the price you pay — ICEFALL's fee comes out of the guide's rate rather than being added to yours. Hut and permit figures are invented for this demonstration; ICEFALL holds no tariff for either."
                  : "This is the guide's own rate, and it is what you would pay them — ICEFALL's fee comes out of it rather than being added to it."}
              </p>
            </Card>

            {/* Production only: what the total above deliberately leaves out.
                The demo has no such card because the demo's total claims to be
                all in, and a list of exclusions under an all-in total is a
                contradiction. */}
            {!DEMO_FILL && (
              <Card className="mt-2.5">
                <p className="text-[12.5px] text-snow">Not included, and not known here</p>
                <ul className="mt-2.5 space-y-1.5">
                  {["Huts and refuges", "Permits and park fees", "Lifts and transport", "Your own equipment and insurance"].map(
                    (x) => (
                      <li key={x} className="flex items-start gap-2.5 text-[12px] text-mist">
                        <Minus size={13} strokeWidth={2} className="mt-[3px] shrink-0 text-mist-dim" />
                        {x}
                      </li>
                    ),
                  )}
                </ul>
                <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
                  ICEFALL holds no hut tariff or permit schedule for this route, so it cannot total
                  them for you and will not guess. Ask {guide.name.split(" ")[0]} for the figures
                  before you commit — that is the conversation this request starts.
                </p>
              </Card>
            )}
          </Rise>
        )}

        {/* ---- What happens next ------------------------------------------

            The drawing's card reads *"Luca will receive your request and reply
            to confirm availability and next steps."* Two futures ICEFALL cannot
            promise: that the guide receives it, and that they reply.

            There is no server behind this form. So the card keeps the drawing's
            shape and position and tells the truth inside it — what the app will
            actually do, and what it is on the athlete to do. `phone-3.png`
            drew a reassurance; a reassurance that is not true is the one thing
            a mockup cannot authorise. ------------------------------------- */}

        <Rise className="pt-4">
          <Card>
            <SectionLabel>What happens next</SectionLabel>
            <div className="mt-3 flex items-start gap-3.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline">
                <Info size={15} strokeWidth={1.6} aria-hidden="true" className="text-mist" />
              </span>
              <p className="text-[13px] leading-relaxed text-mist">
                {GUIDE_REQUEST_NOT_SENT}
              </p>
            </div>
          </Card>
        </Rise>

        {/* ---- Submit ------------------------------------------------- */}

        <Rise className="pt-5">
          {/* Two controls at the foot, as drawn. The outlined one opens the
              thread this request creates; the filled one creates it. The
              drawing labels the filled control BOOK GUIDE — it does not book a
              guide, and nothing here may say it does. */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => {
                const el = document.getElementById(MESSAGE_FIELD_ID);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                // Focus AFTER the scroll starts, not before: focusing first
                // makes the browser jump, then the smooth scroll fights it.
                window.setTimeout(() => el?.focus(), 320);
              }}
            >
              <MessageCircle size={16} strokeWidth={1.7} aria-hidden="true" />
              Message
            </Button>

            <Button size="lg" className="flex-1" onClick={submit} disabled={!canSubmit}>
              <CalendarCheck size={16} strokeWidth={1.7} aria-hidden="true" />
              Send request
            </Button>
          </div>

          {!canSubmit && (
            <p className="mt-2.5 text-center text-[11px] text-mist-dim">
              {mountain.trim().length === 0
                ? "Name the mountain to continue."
                : !datesValid
                  ? "Check the dates to continue."
                  : "Choose the line that describes your experience."}
            </p>
          )}

          {/* The drawing's foot line is *"Secure request · No payment taken
              yet"*. "Yet" promises a payment step that does not exist, and
              "secure" describes a transmission that does not happen. What is
              true is stronger and just as short. */}
          <p className="mt-4 flex items-start gap-2.5 text-[11px] leading-relaxed text-mist-dim">
            <Lock size={12} strokeWidth={1.7} aria-hidden="true" className="mt-[3px] shrink-0" />
            Held on this device · no payment, no card, nothing sent. What you write stays in this
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
/**
 * One line of the request, drawn as `phone-3.png` draws it: the glyph on the
 * left, the plain-language label beside it, and the athlete's answer set to the
 * RIGHT in white — the shape of a receipt, not of a settings list.
 *
 * The drawing has no chevron, because the drawing is a review screen: its rows
 * are read-only. Ours are the pickers themselves, so the chevron stays. A
 * control that does not look like a control is a worse sin than a stray glyph,
 * and the owner cannot review a screen whose fields nobody can find.
 */
function FieldRow({
  icon: Icon,
  label,
  value,
  note,
  open,
  onToggle,
  children,
}: {
  icon: LucideIcon;
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
        className="flex min-h-[64px] w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
      >
        <Icon
          size={21}
          strokeWidth={1.4}
          aria-hidden="true"
          className="shrink-0 text-mist-dim"
        />
        <span className="shrink-0 text-[13px] text-mist">{label}</span>
        <span className="min-w-0 flex-1 text-right">
          <span className="flex min-w-0 items-center justify-end gap-2.5 text-[14.5px] text-snow">
            {value}
          </span>
          {note && <span className="mt-1 block truncate text-[11.5px] text-mist">{note}</span>}
        </span>
        <ChevronDown
          size={15}
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
