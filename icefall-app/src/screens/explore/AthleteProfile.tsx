import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Ban, Flag, MapPin, UserRoundPlus } from "lucide-react";
import { Avatar, Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { QualifierBadge, ScoreValue, UnavailableState } from "@/components/coach/DataState";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { ConnectSheet } from "@/components/network/ConnectSheet";
import { cn } from "@/lib/utils";
import { fmtDate, fmtElevation } from "@/lib/format";
import { unavailable, type Score } from "@/coach/types";
import { assessObjectiveReadiness } from "@/coach/mountainReadiness";
import type { DimensionResult, ObjectiveReadiness } from "@/coach/mountainReadiness";
import { haversine } from "@/tracking/filters";
import { useRecordedActivities } from "@/tracking/feed";
import { useApp } from "@/state/AppState";
import { COARSEN_GRID_KM, LOCATION_NOTICE, approxDistanceLabel, coarsen } from "@/network/privacy";
import { EXPERIENCE_LABELS, LOOKING_FOR_LABELS } from "@/network/types";
// Aliased: the screen component below is also called `AthleteProfile`, and the
// model and the screen sharing one name in one file is a genuine footgun.
import type { AthleteProfile as AthleteProfileModel } from "@/network/types";

/**
 * One athlete, in full.
 *
 * WHO THIS SCREEN CAN ACTUALLY SHOW, AND WHY THAT IS THE POINT
 *
 * ICEFALL has no server, no user database and no other users. The only athlete
 * record that exists anywhere on this device is `myProfile` — the person
 * holding the phone. So this route resolves to exactly one profile or to
 * nobody, and "nobody" is not an error: it is the honest rendering of a network
 * at zero members. It is rendered as a calm, designed state rather than a crash
 * or a redirect, because a redirect would leave the athlete wondering what they
 * just tapped past.
 *
 * NOTHING ON THIS SCREEN MAY BE INVENTED. Not a sample athlete, not a seeded
 * profile, not a plausible-looking distance, not a readiness figure with no
 * source. Somebody could plan an alpine objective around what they read here,
 * and this feature's own safety copy is about meeting strangers in remote
 * places — a fabricated climbing partner is a hazard, not a placeholder.
 *
 * THREE RULES THE LAYOUT ENFORCES RATHER THAN DESCRIBES
 *
 *  1. NO VERIFICATION MARK. `AthleteProfile.verified` is typed as the literal
 *     `false` and there is no branch in this file that reads it. A tick would
 *     say ICEFALL checked somebody, and ICEFALL has checked nobody — not
 *     identity, not qualifications, not experience, not ability.
 *  2. NO EXACT POSITION. No coordinate, address, phone number or email address
 *     is rendered by any code path here. Location appears only as a wide
 *     distance band from `approxDistanceLabel`, computed from positions that
 *     are re-coarsened first — see `distanceBand`.
 *  3. EVERY FIGURE CARRIES ITS PROVENANCE. Readiness is self-reported or
 *     derived and says so wherever it appears; a dimension with no value
 *     renders its reason rather than a zero.
 *
 * Deliberately absent: follower counts, likes, popularity, response rates,
 * anything ranking one person against another. Compatibility here is a
 * statement about two plans, never about a person.
 */

/* -------------------------------------------------------------------------- */
/* Resolution                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Turns a route id into an athlete, or into nothing.
 *
 * There is no directory to search. With no backend the local profile is the
 * entire population, so any id that is not the local athlete's resolves to
 * nobody — and it must resolve to nobody rather than to a stub with the id as a
 * name, which is how an empty network grows fake people.
 */
function resolveAthlete(
  id: string | undefined,
  myProfile: AthleteProfileModel | null,
): AthleteProfileModel | null {
  if (id === undefined || myProfile === null) return null;
  // Router params arrive percent-encoded; `LOCAL_ATHLETE_ID` contains a colon.
  const wanted = safeDecode(id);
  return wanted === myProfile.id ? myProfile : null;
}

/** A malformed escape sequence must not throw the screen away. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/* -------------------------------------------------------------------------- */
/* Distance                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The only distance this screen is permitted to render.
 *
 * Both positions are coarsened AGAIN before they are compared, even though
 * `AppState` coarsens on write. This screen must not depend on every future
 * caller having done the right thing: a precise coordinate compared here would
 * become a precise distance, and a precise distance read a few times as the
 * reader moves is a position fix on the other person. The result then goes
 * through `approxDistanceLabel`, which is banded for the same reason — a band
 * that barely changes as you move carries almost no information about where
 * somebody lives.
 *
 * Returns null when either side is not sharing an area. Null is rendered as an
 * absence, never as "nearby": a fabricated distance would put a stranger on
 * somebody's doorstep.
 */
function distanceBand(me: AthleteProfileModel | null, them: AthleteProfileModel): string | null {
  const mine = me?.approxLocation;
  const theirs = them.approxLocation;
  if (mine === undefined || theirs === undefined) return null;

  const a = coarsen(mine.lat, mine.lon);
  const b = coarsen(theirs.lat, theirs.lon);
  const km = haversine(a, b) / 1000;
  if (!Number.isFinite(km)) return null;

  return approxDistanceLabel(km);
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function AthleteProfile() {
  const { id } = useParams<{ id: string }>();
  const { myProfile, blockedIds, unblockAthlete } = useApp();

  const athlete = useMemo(() => resolveAthlete(id, myProfile), [id, myProfile]);

  if (athlete === null) return <NoSuchAthlete hasProfile={myProfile !== null} />;

  const isYou = myProfile !== null && athlete.id === myProfile.id;
  const blocked = blockedIds.includes(athlete.id);

  if (blocked) {
    return <BlockedAthlete athlete={athlete} onUnblock={() => unblockAthlete(athlete.id)} />;
  }

  const name = athlete.displayName.trim();
  const band = distanceBand(myProfile, athlete);

  return (
    <Screen>
      <ScreenHeader title={name.length > 0 ? name : "Athlete"} back />

      <Stagger className="space-y-4">
        {/* ---- Identity ------------------------------------------------- */}
        <Rise>
          <Card>
            <div className="flex items-start gap-3.5">
              <Avatar name={name.length > 0 ? name : "?"} size={46} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-light text-snow">
                  {name.length > 0 ? name : "Unnamed athlete"}
                </p>
                {/* No verification mark of any kind sits here or anywhere else
                    on this screen. See the file header. */}
                {athlete.experience !== undefined ? (
                  <p className="mt-1 text-[12px] text-mist">
                    {EXPERIENCE_LABELS[athlete.experience]}
                    <span className="text-mist-dim"> · self-declared</span>
                  </p>
                ) : (
                  <p className="mt-1 text-[12px] text-mist-dim">
                    Has not said where they are in their climbing.
                  </p>
                )}
              </div>
            </div>

            {isYou && (
              <p className="mt-4 border-t border-hairline pt-3.5 text-[11px] leading-relaxed text-mist-dim">
                This is your own profile, as it would read to somebody else. Nobody else can see it:
                the Expedition Network is not connected, and there is nowhere for it to be published
                to.
              </p>
            )}
          </Card>
        </Rise>

        {/* ---- Where ---------------------------------------------------- */}
        <Rise>
          <AreaCard athlete={athlete} isYou={isYou} band={band} />
        </Rise>

        {/* ---- Objective ------------------------------------------------ */}
        <Rise>
          <ObjectiveCard athlete={athlete} />
        </Rise>

        {/* ---- Readiness and dimensions --------------------------------- */}
        <Rise>
          <PerformanceCard athlete={athlete} isYou={isYou} />
        </Rise>

        {/* ---- Previous objectives -------------------------------------- */}
        <Rise>
          <PreviousObjectivesCard athlete={athlete} isYou={isYou} />
        </Rise>

        {/* ---- Looking for ---------------------------------------------- */}
        <Rise>
          <LookingForCard athlete={athlete} isYou={isYou} />
        </Rise>

        {/* ---- Bio ------------------------------------------------------ */}
        <Rise>
          <BioCard athlete={athlete} isYou={isYou} />
        </Rise>

        {/* ---- Actions --------------------------------------------------- */}
        {/* Connect, Report and Block are about somebody else. Offering them
            against your own profile would be nonsense the app then has to
            pretend to honour. */}
        {!isYou && (
          <Rise>
            <Actions athlete={athlete} />
          </Rise>
        )}
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Area                                                                        */
/* -------------------------------------------------------------------------- */

function AreaCard({
  athlete,
  isYou,
  band,
}: {
  athlete: AthleteProfileModel;
  isYou: boolean;
  band: string | null;
}) {
  const area = athlete.approxLocation;

  return (
    <Card>
      <SectionLabel>Where</SectionLabel>

      {area === undefined ? (
        <p className="mt-3 text-[13px] leading-relaxed text-mist">
          {isYou ? "You are" : "They are"} not sharing an approximate area, so there is no distance
          to show.
        </p>
      ) : (
        <div className="mt-3 flex items-start gap-3">
          <MapPin size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
          <div className="min-w-0">
            {/* The athlete's own words for their area, and nothing finer. The
                stored coordinates behind it are never rendered. */}
            <p className="text-[14px] text-snow">{area.label}</p>
            {isYou ? (
              <p className="mt-1 text-[12px] text-mist">Your area, as you described it.</p>
            ) : band !== null ? (
              <p className="mt-1 text-[12px] text-mist">{band}</p>
            ) : (
              <p className="mt-1 text-[12px] text-mist-dim">
                You are not sharing an area, so ICEFALL cannot work out a distance.
              </p>
            )}
          </div>
        </div>
      )}

      <Disclaimer className="mt-4">
        {isYou
          ? LOCATION_NOTICE
          : `Positions are rounded to roughly a ${COARSEN_GRID_KM} km grid before they are stored, and distance is only ever shown as a wide band. ICEFALL never shows anyone's exact location, address, phone number or email address.`}
      </Disclaimer>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Objective                                                                   */
/* -------------------------------------------------------------------------- */

function ObjectiveCard({ athlete }: { athlete: AthleteProfileModel }) {
  const objective = athlete.objective;

  return (
    <Card>
      <SectionLabel>Current objective</SectionLabel>

      {objective === undefined ? (
        <p className="mt-3 text-[13px] leading-relaxed text-mist">
          No objective named. The mountain is what this network is organised around, so there is
          nothing here to match against yet.
        </p>
      ) : (
        <>
          <p className="mt-3 text-[19px] font-light text-snow">{objective.peakName}</p>
          <p className="tnum mt-1 text-[12px] text-mist">
            {fmtElevation(objective.elevationM)} m
            {objective.targetDate ? ` · target ${fmtDate(objective.targetDate)}` : ""}
          </p>
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Readiness and the performance profile                                       */
/* -------------------------------------------------------------------------- */

/**
 * Readiness, and the four dimensions behind it where ICEFALL can honestly
 * produce them.
 *
 * WHERE THE NUMBERS CAN COME FROM, WHICH IS NOT EVERYWHERE
 *
 * `assessObjectiveReadiness` derives its dimensions from recorded sessions,
 * logged summits and the athlete's own self-reports. All three live on the
 * device that produced them. So a live assessment is possible for the athlete
 * holding this phone and for nobody else — there is no other device to read,
 * and there never will be until a backend exists.
 *
 * For anyone else the screen shows only the readiness figure their profile
 * carries, labelled as what it is, and states outright that ICEFALL cannot
 * assess anybody else's dimensions. Four empty bars would imply four slots
 * ICEFALL might one day fill from their training, which is not true and would
 * read as a partial assessment of a person nobody has assessed.
 */
function PerformanceCard({ athlete, isYou }: { athlete: AthleteProfileModel; isYou: boolean }) {
  const { objectives, coachProfile } = useApp();
  const activities = useRecordedActivities();

  /**
   * Summits the athlete has MARKED as climbed, and nothing else. The seeded
   * objective list ships with none marked and the mock athlete fixture is not
   * read here — crediting somebody with a fixture's summits would feed a
   * fabrication straight into the experience and altitude dimensions.
   */
  const summitsLogged = useMemo(
    () =>
      objectives.flatMap((o) =>
        o.summitedAt !== undefined
          ? [{ name: o.name, elevationM: o.elevationM, date: o.summitedAt }]
          : [],
      ),
    [objectives],
  );

  const objective = athlete.objective;

  const assessed = useMemo<ObjectiveReadiness | null>(() => {
    // See the doc comment: only ever the local athlete, and only against a
    // named objective. The engine drops simulated recordings itself.
    if (!isYou || objective === undefined) return null;
    return assessObjectiveReadiness({
      peak: {
        name: objective.peakName,
        elevationM: objective.elevationM,
        lat: objective.lat,
        lon: objective.lon,
      },
      activities,
      summitsLogged,
      selfReported: {
        technicalSkills:
          coachProfile.technicalSkills.length > 0 ? coachProfile.technicalSkills : undefined,
        maxAltitudeM: coachProfile.maxAltitudeM,
        disciplineExperience:
          Object.keys(coachProfile.disciplineExperience).length > 0
            ? coachProfile.disciplineExperience
            : undefined,
      },
    });
  }, [isYou, objective, activities, summitsLogged, coachProfile]);

  /**
   * Provenance of the composite, decided the same way the readiness screen
   * decides it: an athlete who has recorded nothing is reading their own
   * answers back, and any dimension the engine flagged as self-reported taints
   * the whole figure. Presenting either as something ICEFALL measured would be
   * the most consequential lie this product could tell.
   */
  const recordedSessions = activities.filter((a) => a.simulated !== true).length;
  const assessedIsSelfReported =
    assessed !== null &&
    (recordedSessions === 0 || assessed.dimensions.some((d) => d.provenance === "self-reported"));

  const stated: Score = athlete.readiness ?? unavailable("not-reported");
  const score: Score = assessed !== null ? assessed.overall : stated;

  const limiting = assessed?.biggestGap?.id ?? null;

  return (
    <Card>
      <SectionLabel>Readiness for this objective</SectionLabel>

      <div className="mt-3.5 flex items-start justify-between gap-4">
        <ScoreValue score={score} unit={score.value === null ? undefined : "%"} size="lg" />
        {assessed !== null && (
          <span className="mt-1.5 shrink-0">
            <QualifierBadge kind={assessedIsSelfReported ? "self-reported" : "estimated"} />
          </span>
        )}
      </div>

      {/* The qualifier in words, always — the badge alone is a caveat someone
          can read past, and "never measured" is the part that matters. */}
      <p className="mt-3.5 text-[11px] leading-relaxed text-mist-dim">
        {assessed !== null
          ? "Derived by ICEFALL from what you have recorded and what you have told it. It is not a measurement of you, and it is not a finding that you are ready to climb anything."
          : isYou
            ? "Self-reported, or derived from your own training. ICEFALL has not measured it."
            : "Self-reported by them, or derived from their own training. ICEFALL has not measured it, does not check it, and cannot confirm any of it."}
      </p>

      {/* ---- Dimensions ------------------------------------------------- */}
      {assessed !== null ? (
        <>
          <p className="section-label mt-5">Performance profile</p>
          <div className="mt-3">
            {assessed.dimensions.map((d) => (
              <DimensionRow key={d.id} dimension={d} limiting={d.id === limiting} />
            ))}
          </div>

          {assessed.professionalAdvice !== null && (
            <Disclaimer className="mt-4">{assessed.professionalAdvice}</Disclaimer>
          )}
          <Disclaimer className="mt-3">{assessed.disclaimer}</Disclaimer>
        </>
      ) : (
        <div className="mt-4 rounded-tile border border-hairline bg-elevated/30 p-4">
          <p className="section-label">Performance profile</p>
          <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
            {isYou
              ? "ICEFALL assesses fitness, technical competence, altitude and experience against a named objective. You have not named one, so there is nothing to assess against."
              : "ICEFALL works out fitness, technical competence, altitude and experience from the sessions recorded on a device. It has none of that for anyone but you, so it cannot assess these dimensions for anybody else — and it does not check what they have written about themselves either."}
          </p>
        </div>
      )}
    </Card>
  );
}

/**
 * One dimension: a label, a value or the reason there isn't one, and the
 * engine's own summary.
 *
 * The bar is a hairline track with a flat fill. Azure goes to the limiting
 * dimension alone — the one row worth acting on — rather than being spread
 * across four. A dimension with no value and a REASON gets the designed absence
 * state; a dimension with no value and no reason does not apply to this class
 * of objective at all, which is a finding rather than a gap, so it gets a line
 * instead of a prompt to go and fill something in.
 */
function DimensionRow({ dimension, limiting }: { dimension: DimensionResult; limiting: boolean }) {
  const value = dimension.score.value;

  return (
    <div className="border-t border-hairline py-3.5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-snow">{dimension.label}</span>
        {value !== null ? (
          <span className="tnum text-[15px] font-light tracking-[-0.01em] text-snow">
            {value}
            <span className="ml-0.5 text-[11px] text-mist">%</span>
          </span>
        ) : (
          <span className="section-label">
            {dimension.score.reason !== undefined ? "No score" : "Not assessed"}
          </span>
        )}
      </div>

      {value !== null && (
        <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={cn("h-full rounded-full", limiting ? "bg-azure" : "bg-snow/45")}
            style={{ width: `${value}%` }}
          />
        </div>
      )}

      {dimension.provenance === "self-reported" && (
        <span className="mt-2.5 inline-block">
          <QualifierBadge kind="self-reported" />
        </span>
      )}

      {value === null && dimension.score.reason !== undefined && (
        <div className="mt-3 rounded-tile border border-hairline bg-elevated/30 px-4 py-4">
          <UnavailableState reason={dimension.score.reason} size="sm" />
        </div>
      )}

      <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{dimension.summary}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Previous objectives                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Free text, rendered verbatim.
 *
 * Never parsed into a count, a grade, a band or anything else a number could be
 * built from. "A few seasons in the Alps" is not a quantity, and turning it into
 * one would manufacture precision that nobody supplied — on the one part of the
 * profile a partner is most likely to weigh.
 */
function PreviousObjectivesCard({
  athlete,
  isYou,
}: {
  athlete: AthleteProfileModel;
  isYou: boolean;
}) {
  const entries = athlete.previousObjectives.filter((o) => o.trim().length > 0);

  return (
    <Card>
      <SectionLabel>Previously climbed</SectionLabel>

      {entries.length === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-mist">
          {isYou ? "You have" : "They have"} not listed anything.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {entries.map((entry, i) => (
            <li key={`${entry}-${i}`} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-mist-dim"
              />
              <span className="text-[13px] leading-relaxed text-snow">{entry}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-mist-dim">
        Written by {isYou ? "you" : "them"}, in {isYou ? "your" : "their"} own words. Nothing here
        has been checked by ICEFALL — ask directly about what somebody has climbed and who they
        climbed it with.
      </p>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Looking for                                                                 */
/* -------------------------------------------------------------------------- */

function LookingForCard({ athlete, isYou }: { athlete: AthleteProfileModel; isYou: boolean }) {
  const wants = athlete.lookingFor;
  const availability = (athlete.availability ?? []).filter((a) => a.trim().length > 0);

  return (
    <Card>
      <SectionLabel>Looking for</SectionLabel>

      {wants.length === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-mist">
          {isYou ? "You have" : "They have"} not said what {isYou ? "you are" : "they are"} looking
          for.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {wants.map((w) => (
            <Badge key={w}>{LOOKING_FOR_LABELS[w]}</Badge>
          ))}
        </div>
      )}

      <p className="section-label mt-5">Availability</p>
      {availability.length === 0 ? (
        <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
          {isYou ? "You have" : "They have"} not said when {isYou ? "you" : "they"} can get out.
        </p>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {/* Free text, so NOT the uppercase `Badge` the fixed labels above use:
              this is what the athlete typed, and "June to August" rendered as
              "JUNE TO AUGUST" is the app rewriting their words. */}
          {availability.map((a, i) => (
            <span
              key={`${a}-${i}`}
              className="rounded-full border border-hairline-strong bg-white/[0.03] px-2.5 py-1 text-[11px] text-mist"
            >
              {a}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Bio                                                                         */
/* -------------------------------------------------------------------------- */

function BioCard({ athlete, isYou }: { athlete: AthleteProfileModel; isYou: boolean }) {
  const bio = athlete.bio?.trim() ?? "";

  return (
    <Card>
      <SectionLabel>About</SectionLabel>
      {bio.length === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-mist">
          {isYou ? "You have" : "They have"} not written anything here.
        </p>
      ) : (
        <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-snow">{bio}</p>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Connect, Report and Block — one of which actually works.
 *
 * Connect writes a message to localStorage and says so. Block is real and
 * local, and it is reversible because an irreversible one-tap block is a trap.
 * Report has nowhere to go at all, and the honest thing is to say that rather
 * than show a confirmation for a report nobody will ever read.
 */
function Actions({ athlete }: { athlete: AthleteProfileModel }) {
  const { blockAthlete } = useApp();
  const [connecting, setConnecting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);

  const name = athlete.displayName.trim() || "this athlete";

  return (
    <>
      <Card>
        <SectionLabel>Actions</SectionLabel>

        <Button className="mt-3.5 w-full" onClick={() => setConnecting(true)}>
          <UserRoundPlus size={15} strokeWidth={1.8} />
          Connect
        </Button>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <Button
            variant="secondary"
            onClick={() => {
              setReporting((r) => !r);
              setConfirmingBlock(false);
            }}
            aria-expanded={reporting}
          >
            <Flag size={14} strokeWidth={1.7} />
            Report
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmingBlock((c) => !c);
              setReporting(false);
            }}
            aria-expanded={confirmingBlock}
          >
            <Ban size={14} strokeWidth={1.7} />
            Block
          </Button>
        </div>

        {reporting && <ReportPanel name={name} />}

        {confirmingBlock && (
          <div className="mt-4 rounded-tile border border-hairline bg-obsidian p-4">
            <p className="text-[14px] text-snow">Block {name}?</p>
            <p className="mt-2 text-[11px] leading-relaxed text-mist">
              Nothing can be written to them from this device afterwards, and any message you have
              already written to them is discarded rather than left sitting in a channel you have
              closed. Blocking happens here, on this device, and nobody is notified — there is
              nobody to notify. You can undo it.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Button variant="secondary" size="sm" onClick={() => setConfirmingBlock(false)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={() => blockAthlete(athlete.id)}>
                Block
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ConnectSheet athlete={athlete} open={connecting} onClose={() => setConnecting(false)} />
    </>
  );
}

/**
 * Reporting, which does not work, said plainly.
 *
 * NOTE ON WHAT IS NOT PRINTED HERE: no support email address and no contact
 * form. This build has neither, and printing an address that reaches nobody
 * would be a worse fabrication than admitting the gap — somebody with a real
 * safety concern would write to it and wait. The routes named below are the
 * ones that genuinely exist today.
 */
function ReportPanel({ name }: { name: string }) {
  return (
    <div className="mt-4 rounded-tile border border-hairline bg-obsidian p-4">
      <p className="text-[14px] text-snow">Reporting is not connected</p>
      <p className="mt-2 text-[11px] leading-relaxed text-mist">
        ICEFALL has no server, so a report about {name} has nowhere to go: nothing would be
        transmitted and nobody would read it. Rather than take one and let it look filed, ICEFALL
        does not take it at all. There is no support address in this build to send you to either,
        and printing one that reaches nobody would be worse than saying so.
      </p>

      <p className="section-label mt-4">What works today</p>
      <ul className="mt-2.5 space-y-2.5">
        <li className="text-[11px] leading-relaxed text-mist">
          <span className="text-snow">Block them.</span> That is real. It happens on this device
          immediately, it stops anything being written to them, and you can undo it.
        </li>
        <li className="text-[11px] leading-relaxed text-mist">
          <span className="text-snow">Go outside ICEFALL.</span> If somebody has threatened, harmed
          or defrauded you, that belongs with the police in the country it happened in, or your
          local emergency number. ICEFALL is not a substitute for either and cannot pass anything
          on.
        </li>
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-mist-dim">
        When the Expedition Network is connected, reports will reach the ICEFALL team. Until then
        this app cannot forward anything to anybody.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Blocked                                                                     */
/* -------------------------------------------------------------------------- */

function BlockedAthlete({
  athlete,
  onUnblock,
}: {
  athlete: AthleteProfileModel;
  onUnblock: () => void;
}) {
  const name = athlete.displayName.trim() || "This athlete";

  return (
    <Screen>
      <ScreenHeader title="Blocked" back />
      <Card>
        <p className="text-[15px] text-snow">You have blocked {name}</p>
        <p className="mt-2.5 text-[12px] leading-relaxed text-mist">
          Their profile is not shown and nothing can be written to them from this device. Any
          message you had written to them was discarded when you blocked them. Nobody was notified:
          the Expedition Network is not connected, so there is nobody who could be.
        </p>
        <Button variant="secondary" className="mt-4 w-full" onClick={onUnblock}>
          Unblock {name}
        </Button>
      </Card>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Nobody                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The state this route reaches almost every time it is opened.
 *
 * Designed, not caught. At zero members an empty network is the correct answer
 * rather than a failure, so this reads as a deliberate piece of the product —
 * calm, explaining exactly why there is nobody here — instead of a 404 that
 * suggests a profile was removed or a person left.
 */
function NoSuchAthlete({ hasProfile }: { hasProfile: boolean }) {
  return (
    <Screen>
      <ScreenHeader title="Athlete" back />
      <Card>
        <p className="text-[15px] text-snow">No profile here</p>
        <p className="mt-2.5 text-[12px] leading-relaxed text-mist">
          The Expedition Network is not connected. ICEFALL has no server and no members other than
          you, so there is no athlete behind this link. Nothing has been removed and nobody has left
          — there has never been anyone here to find.
        </p>
        {!hasProfile && (
          <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
            You have not set up a network profile of your own yet either.
          </p>
        )}
        <Link to="/explore" className="mt-4 block">
          <Button variant="secondary" className="w-full">
            Back to Explore
          </Button>
        </Link>
      </Card>
    </Screen>
  );
}
