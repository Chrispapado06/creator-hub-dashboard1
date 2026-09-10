import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REFERENCE_NO_READINESS } from "@/services/peakTier";
import { Link } from "react-router-dom";
import { Download, Loader2, Share2 } from "lucide-react";

import { Button, Card, Disclaimer } from "@/components/ui/primitives";
import { Screen, ScreenHeader } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import { fmtDate, fmtElevation } from "@/lib/format";
import { sync } from "@/services/repository";
import { useApp, usePrimaryGoal } from "@/state/AppState";
import { useRecordedActivities } from "@/tracking/feed";
import {
  assessObjectiveReadiness,
  OBJECTIVE_READINESS_DISCLAIMER,
} from "@/coach/mountainReadiness";
import type { ObjectiveReadiness } from "@/coach/mountainReadiness";
import {
  CARD_FORMATS,
  CARD_STYLES,
  canvasToBlob,
  renderReadinessCard,
  type CardFormat,
  type CardStyle,
  type ReadinessCardData,
  type ReadinessProvenance,
} from "@/share/renderCard";
import type { RecordedActivity } from "@/tracking/types";

/**
 * Share — Mountain Readiness.
 *
 * The one screen in ICEFALL whose output is read by people who have never seen
 * the app. Everything else can lean on the surrounding context to keep a number
 * honest; an exported PNG carries nothing but itself into a group chat, so the
 * provenance has to travel with the image. That is drawn by
 * `renderReadinessCard`, not by this file, so no style can drop it.
 *
 * What this screen owns is which figures are true enough to put on the card:
 *
 *   READINESS   comes from `assessObjectiveReadiness`, never from
 *               `goal.preparation` — that is a training-completion percentage
 *               against a generated plan, and captioning it "readiness" on a
 *               shareable image would be a different claim entirely.
 *   ASCENT      and SESSIONS come from activities actually recorded in ICEFALL
 *               this calendar month. Not the seeded history, which is fixture
 *               data and would be a fabricated achievement the moment it left
 *               the app. Not simulated recordings either — the same exclusion
 *               `src/coach/hooks.ts` makes, for the same reason.
 *   DAYS        comes from the objective's target date.
 *
 * When the engine withholds a figure — which it does whenever a dimension the
 * objective genuinely turns on is unknown — the card shows a dash and the reason,
 * and is still shareable. A card that says "not assessed, technical unknown" is
 * a more useful thing to put in front of a climbing partner than one that says
 * nothing at all, and infinitely better than one that invents a number.
 */

/* -------------------------------------------------------------------------- */
/* Figures                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The word beside the figure.
 *
 * Never "Ready", and never anything that sounds like permission. The engine caps
 * guided objectives at 75 and anything above 5,500 m at 60 precisely because the
 * last part of that judgement belongs to a guide standing on the ground on the
 * day — so the vocabulary here describes how far a build has come, and stops
 * there. Thresholds are spaced so that a capped 75 does not read as a finished
 * preparation.
 */
function preparationWord(pct: number | null): string {
  if (pct === null) return "Not assessed";
  if (pct >= 75) return "Advanced";
  if (pct >= 60) return "Progressing";
  if (pct >= 40) return "Building";
  if (pct >= 20) return "Early";
  return "Beginning";
}

/**
 * Where the number on the card came from, decided from what was FED IN rather
 * than inferred from the result.
 *
 * `ObjectiveReadiness` only carries `provenance` on the fitness dimension, and
 * reading provenance back out of the other three would mean parsing prose. This
 * screen knows exactly which self-reported inputs it passed to the engine, so it
 * answers the question from that side, and it answers conservatively: if
 * anything the athlete told us could have reached the composite, the card says
 * so. Over-disclosing costs nothing. Under-disclosing puts an unearned number in
 * front of strangers.
 */
function provenanceFor(
  readiness: ObjectiveReadiness,
  selfReportedInputs: boolean,
): ReadinessProvenance {
  // The engine flags a fitness score built purely from the athlete's own
  // estimates. That is the strongest disclosure and it wins outright.
  if (readiness.dimensions.some((d) => d.provenance === "self-reported")) return "self-reported";
  return selfReportedInputs ? "mixed" : "recorded";
}

interface MonthFigures {
  /** Null — never 0 — when nothing was recorded in the window. */
  sessions: number | null;
  verticalM: number | null;
  /** Why `verticalM` is null. Two different absences, two different sentences. */
  verticalMissing: "nothing-recorded" | "no-altitude-source" | null;
  /** Simulated recordings left out, so the screen can say so. */
  simulatedExcluded: number;
  /** Recorded sessions whose device gave no usable altitude. */
  withoutAltitude: number;
}

/**
 * Ascent and sessions for the current calendar month.
 *
 * Built from LOCAL date components. `toISOString()` here would roll the month
 * over early for anyone west of Greenwich and silently drop or add a day's
 * training to the card — the same bug this codebase has already fixed twice.
 *
 * A recording made without a usable altitude source carries `elevationGainM: 0`
 * and `maxAltitudeM: null` — the recorder had nothing to accumulate. Summing
 * that zero into a shareable total would publish "no ascent this month" when
 * what actually happened is that nothing could measure it, so those sessions are
 * left out of the ascent and counted separately. The SESSION count still
 * includes them: how many recordings ICEFALL holds is something it does know.
 */
function monthFigures(activities: RecordedActivity[], now: Date): MonthFigures {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const inMonth = activities.filter((a) => {
    const t = new Date(a.startedAt).getTime();
    return Number.isFinite(t) && t >= start;
  });

  const simulatedExcluded = inMonth.filter((a) => a.simulated).length;
  const real = inMonth.filter((a) => !a.simulated);

  // No recordings is an absence, not a measurement of zero. "0 m this month"
  // would claim ICEFALL watched a month of no ascent; it did not, it simply has
  // nothing to report.
  if (real.length === 0) {
    return {
      sessions: null,
      verticalM: null,
      verticalMissing: "nothing-recorded",
      simulatedExcluded,
      withoutAltitude: 0,
    };
  }

  const withAltitude = real.filter((a) => a.maxAltitudeM !== null);
  const withoutAltitude = real.length - withAltitude.length;

  if (withAltitude.length === 0) {
    return {
      sessions: real.length,
      verticalM: null,
      verticalMissing: "no-altitude-source",
      simulatedExcluded,
      withoutAltitude,
    };
  }

  return {
    sessions: real.length,
    verticalM: Math.round(
      withAltitude.reduce(
        (sum, a) => sum + (Number.isFinite(a.elevationGainM) ? a.elevationGainM : 0),
        0,
      ),
    ),
    verticalMissing: null,
    simulatedExcluded,
    withoutAltitude,
  };
}

/** Whole days to the target date. Negative and unusable dates resolve to null. */
function daysUntil(iso: string | undefined, now: Date): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  const days = Math.ceil((target - now.getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

/**
 * Whether this browser can hand a PNG to the system share sheet.
 *
 * Probed with a real (empty) File rather than assumed from `navigator.share`
 * alone: several browsers expose `share` for links and refuse files, and a Share
 * button that opens nothing is worse than one that is plainly disabled.
 */
function detectFileShare(): boolean {
  if (typeof navigator === "undefined" || typeof File === "undefined") return false;
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [new File([], "icefall.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function ShareReadiness() {
  const { objectives, coachProfile } = useApp();
  const goal = usePrimaryGoal();
  const activities = useRecordedActivities();

  const [style, setStyle] = useState<CardStyle>("classic");
  const [format, setFormat] = useState<CardFormat>("9:16");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Capability, not state: it cannot change while the screen is mounted.
  const [canShareFiles] = useState(detectFileShare);

  /* ---- The objective ----------------------------------------------------- */

  const curated = goal?.mountainId ? sync.mountainById(goal.mountainId) : undefined;
  const peak = useMemo(() => {
    if (!goal) return null;
    const elevationM = goal.elevationM ?? curated?.elevationM;
    if (typeof elevationM !== "number" || !Number.isFinite(elevationM)) return null;
    return {
      name: goal.name,
      elevationM,
      lat: goal.lat ?? curated?.coords.lat,
      lon: goal.lon ?? curated?.coords.lon,
    };
  }, [goal, curated]);

  /* ---- Inputs to the engine ---------------------------------------------- */

  // Simulated recordings are excluded here as well as inside the engine. They
  // exist so the tracker can be reviewed indoors and must never become training
  // the athlete did not do — least of all on an image that leaves the app.
  const realActivities = useMemo(() => activities.filter((a) => !a.simulated), [activities]);

  const summits = useMemo(
    () =>
      objectives
        .filter((o): o is typeof o & { summitedAt: string } => typeof o.summitedAt === "string")
        .map((o) => ({ name: o.name, elevationM: o.elevationM, date: o.summitedAt })),
    [objectives],
  );

  /**
   * True when anything the athlete TOLD us could have reached the composite:
   * declared skills, a reported maximum altitude, declared discipline
   * experience, or a logged summit (which is a self-entry, not an observation).
   */
  const selfReportedInputs =
    coachProfile.technicalSkills.length > 0 ||
    typeof coachProfile.maxAltitudeM === "number" ||
    Object.keys(coachProfile.disciplineExperience).length > 0 ||
    summits.length > 0;

  const readiness = useMemo<ObjectiveReadiness | null>(() => {
    // A reference entry is not scored — the card would carry an elevation
    // band's guide verdict out of the app under the athlete's name.
    if (!peak || !curated) return null;
    return assessObjectiveReadiness({
      peak,
      activities: realActivities,
      summitsLogged: summits,
      selfReported: {
        technicalSkills: coachProfile.technicalSkills,
        maxAltitudeM: coachProfile.maxAltitudeM,
        disciplineExperience: coachProfile.disciplineExperience,
        // No `fitness` block: nothing in this build stores a self-reported
        // weekly-ascent answer, and inventing one to fill the argument would
        // hand the athlete an estimate they never gave.
      },
    });
  }, [curated, peak, realActivities, summits, coachProfile]);

  /* ---- The card ---------------------------------------------------------- */

  const month = useMemo(() => monthFigures(activities, new Date()), [activities]);
  const periodLabel = useMemo(() => new Date().toLocaleDateString("en-GB", { month: "long" }), []);

  const cardData = useMemo<ReadinessCardData | null>(() => {
    if (!goal || !peak || !readiness) return null;

    const pct = readiness.overall.value;
    const days = daysUntil(goal.targetDate, new Date());

    return {
      mountainName: goal.name,
      mountainElevationM: peak.elevationM,
      readinessPct: pct,
      readinessReason:
        pct === null
          ? readiness.biggestGap
            ? `${readiness.biggestGap.label} unknown`
            : "Not assessed"
          : undefined,
      statusWord: preparationWord(pct),
      daysToSummit: days,
      noDaysReason: goal.targetDate && days === null ? "Date passed" : "No date set",
      verticalThisMonthM: month.verticalM,
      noVerticalReason:
        month.verticalMissing === "no-altitude-source"
          ? "Ascent · no altitude source"
          : "Ascent · none recorded",
      sessionsThisMonth: month.sessions,
      periodLabel,
      provenance: provenanceFor(readiness, selfReportedInputs),
      photoSrc: goal.photo ?? curated?.photo,
    };
  }, [goal, peak, readiness, month, periodLabel, selfReportedInputs, curated]);

  useEffect(() => {
    if (!cardData) return;
    let cancelled = false;
    setBusy(true);
    renderReadinessCard(cardData, style, format)
      .then((canvas) => {
        if (cancelled) return;
        canvasRef.current = canvas;
        setPreview(canvas.toDataURL("image/png"));
      })
      .catch(() => {
        if (!cancelled) setNote("The card could not be drawn in this browser.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardData, style, format]);

  /* ---- Export ------------------------------------------------------------ */

  const withBlob = useCallback(async (fn: (b: Blob) => Promise<void> | void) => {
    if (!canvasRef.current) return;
    const blob = await canvasToBlob(canvasRef.current);
    if (blob) await fn(blob);
  }, []);

  const download = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `icefall-readiness-${style}-${format.replace(":", "x")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on the next tick: Safari has not finished reading the object URL
      // when click() returns, and revoking synchronously cancels the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNote("Image saved.");
    },
    [style, format],
  );

  const share = useCallback(async () => {
    if (!canShareFiles) return;
    await withBlob(async (blob) => {
      const file = new File([blob], "icefall-readiness.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (!nav.canShare?.({ files: [file] })) {
        setNote("This browser declined to share the image. Save it instead.");
        return;
      }
      try {
        await nav.share({ files: [file], title: "ICEFALL" });
      } catch {
        /* the athlete dismissed the sheet — not an error */
      }
    });
  }, [canShareFiles, withBlob]);

  /* ---- States before the card is possible -------------------------------- */

  if (!goal) {
    return (
      <Screen>
        <ScreenHeader title="Share readiness" back />
        <Card>
          <p className="text-[13px] leading-relaxed text-mist">
            There is no active objective to assess. Mountain readiness is always readiness for a
            specific mountain, so there is nothing to put on a card yet.
          </p>
          <Button asChild variant="secondary" className="mt-4 w-full">
            <Link to="/goals">Choose an objective</Link>
          </Button>
        </Card>
      </Screen>
    );
  }

  if (!peak || !readiness || !cardData) {
    return (
      <Screen>
        <ScreenHeader title="Share readiness" back />
        <Card>
          <p className="text-[13px] leading-relaxed text-mist">
            {peak && !curated
              ? `${goal.name} is a reference entry. ${REFERENCE_NO_READINESS} There is no assessment to share.`
              : `${goal.name} has no recorded elevation, and ICEFALL judges the class of an objective from its elevation and position. Without it there is no assessment to share.`}
          </p>
          <Button asChild variant="secondary" className="mt-4 w-full">
            <Link to={`/goals/${goal.id}`}>Open the objective</Link>
          </Button>
        </Card>
      </Screen>
    );
  }

  const fmt = CARD_FORMATS.find((f) => f.id === format) ?? CARD_FORMATS[0];
  const withheld = readiness.overall.value === null;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Share readiness"
          subtitle="Pick a style. The preview is the export."
          back
        />
      </div>

      {/* Preview — the real canvas, scaled. What you see is what leaves. */}
      <div className="flex justify-center px-5">
        <div
          className="relative overflow-hidden rounded-card border border-hairline bg-graphite"
          style={{ width: 232, height: (232 * fmt.h) / fmt.w }}
        >
          {preview ? (
            <img
              src={preview}
              alt={`Mountain readiness card for ${goal.name}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Loader2 size={18} className="animate-spin text-mist-dim" aria-hidden="true" />
            </div>
          )}
          {busy && preview && (
            <div className="absolute inset-0 grid place-items-center bg-obsidian/40">
              <Loader2 size={16} className="animate-spin text-azure" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>

      {/* Format */}
      <div className="mt-6 px-5">
        <p className="section-label">Format</p>
        <div className="mt-3 flex gap-2">
          {CARD_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              aria-pressed={format === f.id}
              className={cn(
                "flex-1 rounded-tile border px-3 py-2.5 text-center transition-colors",
                format === f.id
                  ? "border-azure/50 bg-azure/[0.06]"
                  : "border-hairline hover:border-hairline-strong",
              )}
            >
              <span
                className={cn("block text-[12px]", format === f.id ? "text-snow" : "text-mist")}
              >
                {f.label}
              </span>
              <span className="tnum block text-[10px] text-mist-dim">{f.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Style */}
      <div className="mt-6 px-5">
        <p className="section-label">Style</p>
        <div className="no-scrollbar mt-3 overflow-x-auto">
          <div className="flex gap-2">
            {CARD_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                aria-pressed={style === s.id}
                className={cn(
                  "w-[124px] shrink-0 rounded-tile border p-3 text-left transition-colors",
                  style === s.id
                    ? "border-azure/50 bg-azure/[0.06]"
                    : "border-hairline hover:border-hairline-strong",
                )}
              >
                <span
                  className={cn("block text-[12px]", style === s.id ? "text-snow" : "text-mist")}
                >
                  {s.label}
                </span>
                <span className="mt-1 block text-[10px] leading-tight text-mist-dim">{s.note}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-7 space-y-2.5 px-5">
        <Button
          size="lg"
          className="w-full"
          onClick={share}
          disabled={busy || !canShareFiles}
          aria-describedby={canShareFiles ? undefined : "share-unsupported"}
        >
          <Share2 size={16} strokeWidth={1.7} aria-hidden="true" />
          Share
        </Button>

        {/* A disabled control must say why. Never a button that quietly does nothing. */}
        {!canShareFiles && (
          <p
            id="share-unsupported"
            className="text-center text-[11px] leading-relaxed text-mist-dim"
          >
            This browser cannot pass an image to the system share sheet. Save the card and share it
            from your photos instead.
          </p>
        )}

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => withBlob(download)}
          disabled={busy}
        >
          <Download size={15} strokeWidth={1.7} aria-hidden="true" />
          Save image
        </Button>

        {note && (
          <p className="pt-1 text-center text-[11px] text-mist-dim" role="status">
            {note}
          </p>
        )}
      </div>

      {/* What the card actually claims */}
      <div className="space-y-3 px-5 pt-7">
        <p className="section-label">What this card says</p>

        <Card className="space-y-3">
          <Provenance
            label="Readiness"
            value={
              withheld
                ? `Withheld — ${readiness.biggestGap?.label.toLowerCase() ?? "a dimension"} unknown`
                : `${readiness.overall.value}%`
            }
            note={
              cardData.provenance === "self-reported"
                ? "Built from answers you gave, not from anything ICEFALL measured. The card says so on its face."
                : cardData.provenance === "mixed"
                  ? "Part recorded sessions, part what you have told ICEFALL — declared skills, logged summits and a reported maximum altitude are self-entered and unverified. The card says so on its face."
                  : "Computed from sessions recorded in ICEFALL, against its training benchmarks for this class of objective."
            }
          />

          <Provenance
            label={`Ascent · ${periodLabel}`}
            value={
              month.verticalM === null
                ? month.verticalMissing === "no-altitude-source"
                  ? "No altitude source"
                  : "None recorded"
                : `${fmtElevation(month.verticalM)} m`
            }
            note={
              month.verticalMissing === "no-altitude-source"
                ? "Your recordings this month carried no usable altitude, so there is no ascent to report. The zero the recorder held is not a measurement of flat ground and the card does not print it."
                : month.verticalMissing === "nothing-recorded"
                  ? "Nothing has been recorded in ICEFALL this month, so the card shows an absence rather than a zero."
                  : month.withoutAltitude > 0
                    ? `Summed from activities you recorded this calendar month. ${month.withoutAltitude} of them carried no usable altitude and ${month.withoutAltitude === 1 ? "is" : "are"} left out of this figure.`
                    : "Summed from activities you recorded in ICEFALL this calendar month."
            }
          />

          <Provenance
            label={`Sessions · ${periodLabel}`}
            value={month.sessions === null ? "None recorded" : String(month.sessions)}
            note={
              month.simulatedExcluded > 0
                ? `${month.simulatedExcluded} simulated recording${month.simulatedExcluded === 1 ? "" : "s"} left out — simulated activities never count towards anything shareable.`
                : "Counted from activities you recorded in ICEFALL this calendar month."
            }
          />

          <Provenance
            label="Days to summit"
            value={
              cardData.daysToSummit === null
                ? (cardData.noDaysReason ?? "No date set")
                : `${cardData.daysToSummit}`
            }
            note={`Counted to your target date for ${goal.name}, ${fmtDate(goal.targetDate)}.`}
          />
        </Card>

        {withheld && readiness.biggestGap && (
          <Card>
            <p className="section-label">No single figure</p>
            <p className="mt-2 text-[12px] leading-relaxed text-mist">
              {readiness.biggestGap.recommendation}
            </p>
            <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
              The card is still shareable. It shows a dash and the reason rather than a number
              assembled from the parts that happen to be known.
            </p>
          </Card>
        )}

        {readiness.professionalAdvice && (
          <Card>
            <p className="section-label">Professional support</p>
            <p className="mt-2 text-[12px] leading-relaxed text-mist">
              {readiness.professionalAdvice}
            </p>
          </Card>
        )}

        <Card>
          <p className="text-[11px] leading-relaxed text-mist-dim">
            ICEFALL exports a standard PNG rather than posting to any network on your behalf. The
            share sheet routes it wherever you choose.
          </p>
        </Card>

        <Disclaimer>{OBJECTIVE_READINESS_DISCLAIMER}</Disclaimer>
      </div>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Provenance row                                                              */
/* -------------------------------------------------------------------------- */

/**
 * One figure on the card, with where it came from.
 *
 * Every line the card prints has a row here. If a figure has no honest source it
 * does not go on the card, so this list is also the check: a row that cannot be
 * written is a figure that should not be exported.
 */
function Provenance({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-l border-hairline-strong pl-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="section-label">{label}</span>
        <span className="tnum shrink-0 text-[13px] font-light text-snow">{value}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{note}</p>
    </div>
  );
}
