import { useEffect, useId } from "react";
import { REFERENCE_NO_READINESS_SHORT, TIER_EYEBROW } from "@/services/peakTier";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { QualifierBadge, UnavailableState, UNAVAILABLE_COPY } from "@/components/coach/DataState";
import { useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDistance, fmtDurationCompact, fmtElevation } from "@/lib/format";
import {
  SUMMIT_STAMP_LABEL,
  UPCOMING_NOTICE,
  VERIFICATION_NOTICE,
  type Passport,
  type PassportBand,
  type PassportObjective,
  type PassportSummit,
} from "@/passport/model";
import type { PassportSpread } from "./PassportBook";
import { TECHNICAL_FAMILY } from "./PassportCover";

/**
 * THE MOUNTAIN PASSPORT — the interior spreads.
 *
 * `PassportBook` owns the object: the cover, the opening, the paper, the page
 * chrome, the identity page and the conditions page at the back. This file owns
 * everything in between — what the booklet actually says about the athlete's
 * mountain life — plus the Mountain CV, which is the same record laid out for
 * someone else to read.
 *
 * Pages are handed over as `PassportSpread`s (see `passportSpreads`) and are
 * dropped into `PassportPage`, so nothing here re-implements the sheet. They
 * inherit the paper's ink because that component re-points the `--ice-*` tokens:
 * `UnavailableState`, `QualifierBadge` and `.section-label` all re-ink to paper
 * on their own, which is why this feature uses the app's one absence layer
 * rather than a paper-only copy of it that could drift from it.
 *
 * ── WHAT THESE PAGES MAY NOT DO ──────────────────────────────────────────────
 *
 * ICEFALL verifies nothing. There is no checked summit, no guide attestation
 * and no identity check, so:
 *
 *   · No page renders a tick, a seal, or the word "verified" in the affirmative.
 *     The summit stamp reads USER ADDED, and the model has no reachable state
 *     that would let it read anything else.
 *   · Every figure carries its provenance, worded to match the legend on the
 *     conditions page: USER ADDED, SELF-REPORTED, OBSERVED, or the dashed circle
 *     of an absence. A figure ICEFALL does not hold renders the reason it does
 *     not hold it — never a zero, never a dash.
 *   · Completed summits and future objectives are on different pages, with the
 *     objectives page saying in its first line that nothing on it was climbed.
 *
 * The reasoning behind each figure lives in `@/passport/model`.
 */

/* -------------------------------------------------------------------------- */
/* Paper parts                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Provenance, worded exactly as the conditions page at the back defines it.
 *
 * KEEP IN STEP WITH the legend in `PassportBook.tsx`: that page is what a guide
 * reads to interpret these marks, so a chip here saying "Recorded" while the
 * legend explains "Observed" would leave them decoding two vocabularies for one
 * thing. `self-reported` defers to the shared `QualifierBadge` so the passport
 * and the coach say it identically.
 *
 * There is no verified chip. That is not an oversight and it is not styling.
 */
function ProvenanceChip({ kind }: { kind: "user-added" | "observed" | "self-reported" }) {
  if (kind === "self-reported") return <QualifierBadge kind="self-reported" />;

  const label = kind === "observed" ? "Observed" : "User added";
  const detail =
    kind === "observed"
      ? "Measured by a device during a recording. Simulated recordings are excluded."
      : "Entered by the bearer. ICEFALL has not checked it.";

  return (
    <span
      title={detail}
      className="inline-flex shrink-0 items-center rounded-full border border-hairline-strong px-1.5 py-[2px] text-[8px] font-medium uppercase leading-none tracking-[0.12em] text-mist-dim"
    >
      {label}
      <span className="sr-only">. {detail}</span>
    </span>
  );
}

/** A ruled entry, in the register the identity page already uses. */
function Entry({
  label,
  children,
  note,
  className,
}: {
  label: string;
  children: React.ReactNode;
  note?: string;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-hairline py-2.5 first:pt-0 last:border-b-0", className)}>
      <p className="section-label text-[8px]">{label}</p>
      <div className="mt-1.5">{children}</div>
      {note && <p className="mt-1.5 text-[9.5px] leading-relaxed text-mist-dim">{note}</p>}
    </div>
  );
}

/** A figure and its provenance on one line. Never rendered without the chip. */
function FigureLine({
  value,
  unit,
  chip,
}: {
  value: string;
  unit?: string;
  chip: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
      <p className="tnum text-[19px] font-light leading-none tracking-[-0.02em] text-snow">
        {value}
        {unit && <span className="ml-1 text-[10px] font-normal text-mist">{unit}</span>}
      </p>
      {chip}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page — mountain experience                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The facing page to identity: what the bearer's mountain life adds up to.
 *
 * Four figures, each with the provenance it actually has. Highest altitude is
 * the one with two possible sources — a session that measured it, or the
 * athlete's own statement — and the page names which, keeps the other in view
 * rather than dropping it, and reconciles a logged summit that stands higher
 * than either. Three numbers that quietly disagree is how a document loses the
 * reader's trust.
 */
function ExperiencePage({ passport }: { passport: Passport }) {
  const { highestAltitude: alt, summits, expeditions, technicalLevel, identity } = passport;

  return (
    <div>
      <Entry label="Highest altitude" note={alt.note}>
        {alt.metres === null ? (
          <UnavailableState
            reason={alt.reason ?? "no-data"}
            size="sm"
            className="items-start text-left"
          />
        ) : (
          <FigureLine
            value={fmtElevation(alt.metres)}
            unit="m"
            chip={
              <ProvenanceChip kind={alt.source === "recorded" ? "observed" : "self-reported"} />
            }
          />
        )}
        {alt.alsoReportedM !== undefined && (
          <p className="tnum mt-1.5 text-[9.5px] leading-relaxed text-mist">
            You have also reported {fmtElevation(alt.alsoReportedM)} m. The observed figure is shown
            because something measured it.
          </p>
        )}
        {alt.higherLoggedSummit && (
          <p className="tnum mt-1.5 text-[9.5px] leading-relaxed text-mist">
            A logged summit stands higher — {alt.higherLoggedSummit.name},{" "}
            {fmtElevation(alt.higherLoggedSummit.elevationM)} m. Logged summits are the
            bearer&rsquo;s own entries; nothing measured them.
          </p>
        )}
      </Entry>

      <Entry
        label="Summits logged"
        note="Each has its own page. Every one was entered by the bearer."
      >
        {summits.length === 0 ? (
          <UnavailableState reason="not-reported" size="sm" className="items-start text-left" />
        ) : (
          <FigureLine value={String(summits.length)} chip={<ProvenanceChip kind="user-added" />} />
        )}
      </Entry>

      <Entry label="Expeditions created" note={expeditions.note}>
        {expeditions.count === 0 ? (
          <p className="text-[12px] text-mist">None created.</p>
        ) : (
          <FigureLine
            value={String(expeditions.count)}
            chip={<ProvenanceChip kind="user-added" />}
          />
        )}
      </Entry>

      <Entry label="Technical level" note={technicalLevel.note}>
        {technicalLevel.label === null ? (
          <UnavailableState
            reason={technicalLevel.reason ?? "not-reported"}
            size="sm"
            className="items-start text-left"
          />
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
            <p className="text-[16px] font-light leading-none text-snow">{technicalLevel.label}</p>
            <ProvenanceChip kind="self-reported" />
          </div>
        )}
      </Entry>

      <Entry
        label="Current objective"
        note="An objective, not an ascent. It is listed at the back with the others."
      >
        {identity.currentObjective ? (
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 flex-1 text-[12.5px] text-snow">
              {identity.currentObjective.name}
            </p>
            <p className="tnum shrink-0 text-[10px] text-mist">
              {fmtDate(identity.currentObjective.targetDate, { day: undefined })}
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-mist">No objective set.</p>
        )}
      </Entry>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page — altitude bands                                                       */
/* -------------------------------------------------------------------------- */

/** Up to five notches, then the count. Not a progress bar, and not a score. */
function BandNotches({ entries }: { entries: number }) {
  const filled = Math.min(entries, 5);
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cn("block h-[8px] w-[2px]", i < filled ? "bg-azure" : "bg-hairline-strong")}
        />
      ))}
    </span>
  );
}

function BandRow({ band }: { band: PassportBand }) {
  const entered = band.entries !== null && band.entries > 0;

  return (
    <div className="flex items-start gap-2.5 border-b border-hairline py-2 last:border-b-0">
      <span
        className="tnum mt-[2px] w-3 shrink-0 text-[9px]"
        style={{ fontFamily: TECHNICAL_FAMILY }}
        aria-hidden="true"
      >
        {band.band}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[11.5px] leading-tight", entered ? "text-snow" : "text-mist")}>
          {band.label}
        </p>
        <p className="tnum mt-[3px] text-[9px] text-mist-dim">
          {band.ceilingM === null
            ? `${fmtElevation(band.floorM)} m and above`
            : band.floorM === 0
              ? `Below ${fmtElevation(band.ceilingM)} m`
              : `From ${fmtElevation(band.floorM)} m`}
        </p>
        {band.highest && (
          <p className="tnum mt-1 text-[9.5px] leading-snug text-mist">
            {band.highest.name} · {fmtElevation(band.highest.elevationM)} m ·{" "}
            {fmtDate(band.highest.date, { day: undefined })}
          </p>
        )}
      </div>
      <div className="shrink-0 pt-[1px] text-right">
        {band.entries === null ? (
          // The reason, in the same words the absence layer uses everywhere else.
          <span className="section-label text-[8px]">
            {UNAVAILABLE_COPY[band.reason ?? "no-data"].title}
          </span>
        ) : band.entries === 0 ? (
          <span className="section-label text-[8px]">No entry</span>
        ) : (
          <span className="flex flex-col items-end gap-1">
            <BandNotches entries={band.entries} />
            <span className="tnum text-[9px] text-mist">
              {band.entries} {band.entries === 1 ? "entry" : "entries"}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function BandsPage({ passport }: { passport: Passport }) {
  const empty = passport.summits.length === 0;

  return (
    <div>
      <p className="text-[10px] leading-relaxed text-mist">
        ICEFALL sorts mountains into seven bands by elevation. This page marks the bands the
        bearer&rsquo;s own logged summits fall into. It is a record of what they entered, not an
        assessment of what they can climb.
      </p>

      {empty && (
        <div className="mt-3 border border-dashed border-hairline-strong px-3 py-3">
          <UnavailableState reason="not-reported" size="sm" />
          <p className="mt-2 text-center text-[9.5px] leading-relaxed text-mist-dim">
            No summits are logged, so no band can be marked.
          </p>
        </div>
      )}

      <div className="mt-2.5">
        {passport.bands.map((b) => (
          <BandRow key={b.band} band={b} />
        ))}
      </div>

      <p className="mt-3 border-t border-hairline pt-2 text-[9.5px] leading-relaxed text-mist-dim">
        An unmarked band means nothing has been logged in it. It is not a statement that the bearer
        has never been there — ICEFALL knows only what it is told, and infers no band from training.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page — technical skills                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Competences, grouped by the class of ground that asks for them.
 *
 * Two rules do all the work here. A claimed skill is SELF-REPORTED, never a
 * measurement — nothing in a training feed says whether someone can arrest on
 * hard snow. And a skill that has not been claimed reads "Not reported", never
 * "Beginner": silence about a competence is not evidence of its absence, and a
 * grade nobody awarded is exactly the fabrication this document must not make.
 */
function SkillsPage({ passport }: { passport: Passport }) {
  return (
    <div>
      <p className="text-[10px] leading-relaxed text-mist">
        Every competence below is one ICEFALL&rsquo;s own assessment asks for at that class of
        ground. What the bearer holds is what they have told us. Nothing is inferred from training,
        and nothing has been tested.
      </p>

      <div className="mt-2.5 flex items-center justify-between gap-3 border-y border-hairline py-1.5">
        <span className="section-label text-[8px]">Reported</span>
        <span className="tnum text-[11px] text-snow" style={{ fontFamily: TECHNICAL_FAMILY }}>
          {passport.skillsReported} / {passport.skillsRoster}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {passport.skillGroups.map((group) => (
          <div key={group.band}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="section-label text-[8px]">{group.label}</span>
              <span className="tnum text-[8.5px] text-mist-dim">
                {group.floorM === 0 ? "Below 1,000 m" : `From ${fmtElevation(group.floorM)} m`}
              </span>
            </div>
            <div className="mt-1">
              {group.skills.map((skill) => (
                <div
                  key={skill.label}
                  className="flex items-center gap-2.5 border-b border-hairline py-[6px] last:border-b-0"
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-[11px] leading-tight",
                      skill.reported ? "text-snow" : "text-mist-dim",
                    )}
                  >
                    {skill.label}
                  </span>
                  {skill.reported ? (
                    <QualifierBadge kind="self-reported" />
                  ) : (
                    <span className="section-label shrink-0 text-[8px]">Not reported</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {passport.extraSkills.length > 0 && (
          <div>
            <span className="section-label text-[8px]">Also reported</span>
            <div className="mt-1">
              {passport.extraSkills.map((skill) => (
                <div
                  key={skill}
                  className="flex items-center gap-2.5 border-b border-hairline py-[6px] last:border-b-0"
                >
                  <span className="min-w-0 flex-1 text-[11px] leading-tight text-snow">
                    {skill}
                  </span>
                  <QualifierBadge kind="self-reported" />
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-mist-dim">
              Claims outside ICEFALL&rsquo;s list, shown as written and matched against no
              objective.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The summit stamp                                                            */
/* -------------------------------------------------------------------------- */

/** The ink the stamp is pressed in — the house azure, deepened to hold on cream. */
const STAMP_INK = "oklch(0.47 0.075 76)";

/**
 * A bespoke ICEFALL summit stamp.
 *
 * Two rings, the ICEFALL mark, the peak, its height and the date. No crest, no
 * eagle, no scalloped border, no country and no authority: it must not read as a
 * national or government stamp, because it is not a border control and it
 * certifies nothing. The band across the foot says USER ADDED — it cannot say
 * SUMMIT VERIFIED, and on the day it can, something real will have to set it.
 *
 * The press runs once, when the page comes into view: faint, down with a slight
 * overshoot, settle. Under `prefers-reduced-motion` it is skipped outright
 * rather than shortened — a stamp thumping onto the page is precisely the motion
 * that setting exists to switch off.
 */
function SummitStamp({
  name,
  elevationM,
  date,
  size = 92,
}: {
  name: string;
  elevationM: number;
  date: string;
  size?: number;
}) {
  const reduce = useReducedMotion();
  const id = useId();
  const topArc = `${id}-top`;
  const footArc = `${id}-foot`;

  return (
    <motion.div
      className="relative shrink-0"
      style={{ width: size, height: size, color: STAMP_INK, mixBlendMode: "multiply" }}
      initial={reduce ? false : { opacity: 0, scale: 1.5, rotate: -15 }}
      whileInView={
        reduce
          ? undefined
          : { opacity: [0, 0.28, 1, 0.93], scale: [1.5, 1.06, 0.98, 1], rotate: -6 }
      }
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.72, times: [0, 0.5, 0.78, 1], ease: [0.22, 1, 0.36, 1] }}
      role="img"
      aria-label={`${name}, ${fmtElevation(elevationM)} metres, ${fmtDate(date)}. User added, not verified.`}
    >
      <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
        <defs>
          {/* Sweep 1 arcs over the crown, sweep 0 under the foot, so both lines
              read upright to somebody holding the document. */}
          <path id={topArc} d="M 25 60 A 35 35 0 0 1 95 60" fill="none" />
          <path id={footArc} d="M 25 62 A 35 35 0 0 0 95 62" fill="none" />
        </defs>

        <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle
          cx="60"
          cy="60"
          r="47"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.7"
          opacity="0.7"
        />

        <text fill="currentColor" fontSize="7" fontWeight="500" letterSpacing="1.5">
          <textPath href={`#${topArc}`} startOffset="50%" textAnchor="middle">
            {name.toUpperCase()}
          </textPath>
        </text>

        <text fill="currentColor" fontSize="6.2" fontWeight="500" letterSpacing="1.8">
          <textPath href={`#${footArc}`} startOffset="50%" textAnchor="middle">
            {SUMMIT_STAMP_LABEL.toUpperCase()}
          </textPath>
        </text>

        <line
          x1="27"
          y1="48"
          x2="93"
          y2="48"
          stroke="currentColor"
          strokeWidth="0.6"
          opacity="0.45"
        />
        <line
          x1="30"
          y1="87"
          x2="90"
          y2="87"
          stroke="currentColor"
          strokeWidth="0.6"
          opacity="0.45"
        />

        <text
          x="60"
          y="73"
          textAnchor="middle"
          fill="currentColor"
          fontSize="10.5"
          fontWeight="300"
          className="tnum"
        >
          {fmtElevation(elevationM)} m
        </text>
        <text
          x="60"
          y="83"
          textAnchor="middle"
          fill="currentColor"
          fontSize="6"
          letterSpacing="0.7"
          className="tnum"
        >
          {fmtDate(date).toUpperCase()}
        </text>
      </svg>

      <IcefallMark
        className="absolute left-1/2 w-auto -translate-x-1/2"
        style={{ top: size * 0.35, height: size * 0.13 }}
      />
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page — one summit                                                           */
/* -------------------------------------------------------------------------- */

function SessionFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="tnum text-[11.5px] font-light leading-none text-snow">{value}</p>
      <p className="section-label mt-1 text-[7.5px]">{label}</p>
    </div>
  );
}

function SummitPage({ summit }: { summit: PassportSummit }) {
  const image = useMountainImage(summit.peak);

  return (
    <div>
      {/* Bleeds to the sheet's edge; the page well's own padding is cancelled. */}
      <figure className="-mx-5 -mt-4">
        <img
          src={image.src}
          alt={image.real ? summit.name : ""}
          loading="lazy"
          className={cn(
            "h-[118px] w-full object-cover",
            !image.real && "opacity-75 grayscale-[30%]",
          )}
        />
        <figcaption className="px-5 pt-1 text-[8.5px] leading-tight text-mist-dim">
          {/* Terrain of the right altitude band must never pass as a photograph
              of this summit. `useMountainImage` hands over the caption to say so. */}
          {image.caption ?? image.credit ?? `${summit.name} — photograph`}
        </figcaption>
      </figure>

      <div className="mt-2.5 flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="display text-[21px] leading-[1.05] text-snow">{summit.name}</h3>
          <p className="tnum mt-1.5 text-[11.5px] text-mist">
            {fmtElevation(summit.elevationM)} m · {fmtDate(summit.date)}
          </p>
          <p className="mt-0.5 text-[9.5px] leading-snug text-mist-dim">{summit.bandLabel}</p>
          <span className="mt-2 inline-flex">
            <ProvenanceChip kind="user-added" />
          </span>
        </div>
        <SummitStamp name={summit.name} elevationM={summit.elevationM} date={summit.date} />
      </div>

      <div className="mt-3 border-t border-hairline pt-2.5">
        <p className="section-label text-[8px]">Recorded that day</p>
        {summit.session ? (
          <>
            <p className="mt-1.5 text-[11px] text-snow">{summit.session.title}</p>
            <p className="text-[9.5px] text-mist-dim">{summit.session.typeLabel}</p>
            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
              {summit.session.distanceM !== null && (
                <SessionFigure
                  label="Distance"
                  value={`${fmtDistance(summit.session.distanceM / 1000)} km`}
                />
              )}
              {summit.session.elevationGainM !== null && (
                <SessionFigure
                  label="Vertical"
                  value={`${fmtElevation(summit.session.elevationGainM)} m`}
                />
              )}
              {summit.session.movingSec !== null && (
                <SessionFigure
                  label="Moving"
                  value={fmtDurationCompact(summit.session.movingSec)}
                />
              )}
              {summit.session.maxAltitudeM !== null && (
                <SessionFigure
                  label="Max altitude"
                  value={`${fmtElevation(summit.session.maxAltitudeM)} m`}
                />
              )}
            </div>
            <p className="mt-2.5 text-[9.5px] leading-relaxed text-mist-dim">
              Matched to this entry by date alone. No recording is tagged to a summit, so ICEFALL
              does not claim this session is the ascent.
            </p>
          </>
        ) : (
          <div className="mt-1.5">
            <UnavailableState
              reason={summit.sessionReason}
              size="sm"
              className="items-start text-left"
            />
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-mist-dim">
              Nothing was recorded on this date, so there is no route, distance or time to show. The
              entry above is the bearer&rsquo;s own.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page — objectives ahead                                                     */
/* -------------------------------------------------------------------------- */

function ObjectiveRow({ objective }: { objective: PassportObjective }) {
  return (
    <div className="border-b border-hairline py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 flex-1 text-[12.5px] text-snow">{objective.name}</p>
        <p className="tnum shrink-0 text-[10px] text-mist">
          {fmtDate(objective.targetDate, { day: undefined })}
        </p>
      </div>
      <p className="tnum mt-[3px] text-[9.5px] text-mist-dim">
        {objective.elevationM !== undefined && `${fmtElevation(objective.elevationM)} m`}
        {objective.elevationM !== undefined && (objective.classLabel || objective.unsurveyed)
          ? " · "
          : ""}
        {objective.unsurveyed ? TIER_EYEBROW.reference : objective.classLabel}
      </p>

      <div className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-2">
        <div>
          <p className="section-label text-[7.5px]">Training plan</p>
          {objective.preparation === null ? (
            <p className="mt-1 text-[10px] text-mist-dim">{UNAVAILABLE_COPY["no-data"].title}</p>
          ) : (
            <div className="mt-1 flex items-baseline gap-1.5">
              <p className="tnum text-[13px] font-light leading-none text-snow">
                {objective.preparation}
                <span className="ml-0.5 text-[9px] text-mist">%</span>
              </p>
              <QualifierBadge kind="estimated" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="section-label text-[7.5px]">Readiness</p>
          {objective.unsurveyed ? (
            // Not withheld for want of data — there is nothing to measure
            // against. The reason is the tier, and it is named.
            <p className="mt-1 text-[10px] leading-snug text-mist">{REFERENCE_NO_READINESS_SHORT}</p>
          ) : objective.readiness.value === null ? (
            // Withheld, with the reason. mountainReadiness refuses a composite
            // whenever a dimension the objective turns on is unknown, and the
            // page must not quietly present that as a low score.
            <p className="mt-1 text-[10px] leading-snug text-mist">
              Withheld —{" "}
              {UNAVAILABLE_COPY[objective.readiness.reason ?? "no-data"].title.toLowerCase()}
              {objective.limiting ? ` (${objective.limiting.toLowerCase()})` : ""}
            </p>
          ) : (
            <p className="tnum mt-1 text-[13px] font-light leading-none text-snow">
              {objective.readiness.value}
              <span className="ml-0.5 text-[9px] text-mist">/ 100</span>
            </p>
          )}
        </div>
      </div>

      {objective.requiresGuide && (
        <p className="mt-1.5 text-[9.5px] leading-relaxed text-mist-dim">
          This class of ground calls for an IFMGA/UIAGM-certified guide, whose in-person judgement
          outranks everything in this booklet.
        </p>
      )}
    </div>
  );
}

function UpcomingPage({ passport }: { passport: Passport }) {
  return (
    <div>
      <div className="border-l-2 border-azure/60 pl-2.5">
        <p className="text-[10.5px] leading-relaxed text-mist">{UPCOMING_NOTICE}</p>
      </div>

      {passport.upcoming.length === 0 ? (
        <div className="mt-4">
          <UnavailableState reason={passport.upcomingReason ?? "not-reported"} size="sm" />
          <p className="mt-2 text-center text-[9.5px] leading-relaxed text-mist-dim">
            No active objective is set in ICEFALL.
          </p>
        </div>
      ) : (
        <div className="mt-2">
          {passport.upcoming.map((o) => (
            <ObjectiveRow key={o.id} objective={o} />
          ))}
        </div>
      )}

      <p className="mt-3 border-t border-hairline pt-2 text-[9.5px] leading-relaxed text-mist-dim">
        Readiness is a planning aid and clears nobody to attempt anything. The training figure is
        the completion of the plan ICEFALL generated for the objective, not a judgement about the
        mountain.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The spreads                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The data pages, in order, for `PassportBook`.
 *
 * The book puts identity first and the conditions last on its own; these sit
 * between them. Summits come one to a page — a summit is the thing the document
 * exists to hold, and a list would make it an inventory — and the objectives
 * page is always last of these, so nothing unclimbed can ever be mistaken for a
 * stamp while turning through.
 */
export function passportSpreads(passport: Passport): PassportSpread[] {
  return [
    {
      id: "experience",
      label: "Mountain experience",
      content: <ExperiencePage passport={passport} />,
    },
    { id: "bands", label: "Altitude bands", content: <BandsPage passport={passport} /> },
    { id: "skills", label: "Technical skills", content: <SkillsPage passport={passport} /> },
    ...passport.summits.map((summit) => ({
      id: `summit-${summit.id}`,
      label: summit.name,
      content: <SummitPage summit={summit} />,
    })),
    { id: "upcoming", label: "Objectives ahead", content: <UpcomingPage passport={passport} /> },
  ];
}

/* -------------------------------------------------------------------------- */
/* Mountain CV                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The CV's paper.
 *
 * The same stock as the booklet — `PassportBook` owns those values and these are
 * kept in step with them — except that the faintest ink is taken a shade deeper.
 * The booklet is read on a lit screen at arm's length; the CV is meant to be
 * printed and handed over, and grey-on-cream that survives a phone does not
 * always survive an office printer.
 */
const CV_PAPER = {
  "--ice-snow": "oklch(0.305 0.013 60)",
  "--ice-mist": "oklch(0.455 0.013 62)",
  "--ice-mist-dim": "oklch(0.545 0.014 64)",
  "--ice-azure": "oklch(0.5 0.072 79)",
  "--ice-azure-bright": "oklch(0.44 0.072 79)",
  "--ice-azure-deep": "oklch(0.42 0.062 79)",
  "--ice-hairline": "oklch(0.305 0.013 60 / 15%)",
  "--ice-hairline-strong": "oklch(0.305 0.013 60 / 28%)",
  background: "oklch(0.958 0.011 86)",
  color: "oklch(0.305 0.013 60)",
} as React.CSSProperties;

/**
 * Print rules.
 *
 * The CV is the artefact somebody would actually show a guide, so it has to be
 * able to leave the phone. Everything else is hidden and the shell's clipping is
 * released, or the document would be guillotined at the height of the device
 * frame.
 */
const PRINT_CSS = `
@media print {
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  [data-phone-shell] { height: auto !important; max-height: none !important; width: 100% !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
  body * { visibility: hidden !important; }
  #icefall-mountain-cv, #icefall-mountain-cv * { visibility: visible !important; }
  #icefall-mountain-cv { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; border-radius: 0 !important; box-shadow: none !important; }
  [data-print-hide] { display: none !important; }
}
`;

function CvSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 border-t border-hairline pt-2.5">
      <p className="section-label text-[8px]">{title}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function CvFigure({
  label,
  value,
  unit,
  caption,
}: {
  label: string;
  value: string;
  unit?: string;
  caption: string;
}) {
  return (
    <div className="min-w-0">
      <p className="section-label text-[8px]">{label}</p>
      <p className="tnum mt-1.5 text-[17px] font-light leading-none text-snow">
        {value}
        {unit && <span className="ml-1 text-[10px] text-mist">{unit}</span>}
      </p>
      <p className="mt-1.5 text-[9px] leading-tight text-mist-dim">{caption}</p>
    </div>
  );
}

/**
 * The Mountain CV — the record laid out for somebody else to read.
 *
 * This is the page that would actually be handed to a guide or an operator, so
 * the verification notice is at the top of it rather than in a footnote, and
 * every section repeats whose statement it is. It carries NO private data: no
 * email address, no home location, no health or body information. What a guide
 * needs is what the athlete has done and what they claim; the rest is theirs.
 */
export function MountainCv({ passport }: { passport: Passport }) {
  const { identity, highestAltitude: alt, summits, technicalLevel, bands, skillGroups } = passport;

  const rosterSkills = skillGroups.flatMap((g) => g.skills);
  const reported = rosterSkills
    .filter((s) => s.reported)
    .map((s) => s.label)
    .concat(passport.extraSkills);
  const unreported = rosterSkills.length - rosterSkills.filter((s) => s.reported).length;

  return (
    <>
      <style>{PRINT_CSS}</style>
      <article
        id="icefall-mountain-cv"
        style={CV_PAPER}
        className="grain relative overflow-hidden rounded-card px-5 pb-6 pt-5"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="section-label text-[8px]">Mountain CV</p>
            <h2 className="display mt-1.5 text-[26px] leading-none text-snow">{identity.name}</h2>
            <p
              className="tnum mt-2 text-[9.5px] text-mist-dim"
              style={{ fontFamily: TECHNICAL_FAMILY }}
            >
              {identity.expeditionId} · Record opened{" "}
              {fmtDate(identity.memberSince, { day: undefined })}
            </p>
          </div>
          <IcefallMark className="mt-1 h-5 w-auto shrink-0 text-azure" />
        </header>

        <div className="mt-3.5 border border-hairline-strong px-3 py-2.5">
          <p className="section-label text-[8px] text-azure">Not verified</p>
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-mist">{VERIFICATION_NOTICE}</p>
        </div>

        <CvSection title="Summary">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {summits.length === 0 ? (
              <div>
                <p className="section-label text-[8px]">Summits logged</p>
                <div className="mt-1.5">
                  <UnavailableState
                    reason="not-reported"
                    size="sm"
                    className="items-start text-left"
                  />
                </div>
              </div>
            ) : (
              <CvFigure
                label="Summits logged"
                value={String(summits.length)}
                caption="Entered by the athlete"
              />
            )}

            {alt.metres === null ? (
              <div>
                <p className="section-label text-[8px]">Highest altitude</p>
                <div className="mt-1.5">
                  <UnavailableState
                    reason={alt.reason ?? "no-data"}
                    size="sm"
                    className="items-start text-left"
                  />
                </div>
              </div>
            ) : (
              <CvFigure
                label="Highest altitude"
                value={fmtElevation(alt.metres)}
                unit="m"
                caption={
                  alt.source === "recorded"
                    ? "Observed during a recorded session"
                    : "Self-reported by the athlete"
                }
              />
            )}

            <div className="min-w-0">
              <p className="section-label text-[8px]">Technical level</p>
              {technicalLevel.label === null ? (
                <div className="mt-1.5">
                  <UnavailableState
                    reason={technicalLevel.reason ?? "not-reported"}
                    size="sm"
                    className="items-start text-left"
                  />
                </div>
              ) : (
                <>
                  <p className="mt-1.5 text-[14px] font-light leading-none text-snow">
                    {technicalLevel.label}
                  </p>
                  <p className="mt-1.5 text-[9px] leading-tight text-mist-dim">
                    Self-reported, not assessed
                  </p>
                </>
              )}
            </div>

            <CvFigure
              label="Skills reported"
              value={String(passport.skillsReported)}
              unit={`of ${passport.skillsRoster}`}
              caption="Claims, not assessments"
            />
          </div>
        </CvSection>

        <CvSection title="Summits — all user added">
          {summits.length === 0 ? (
            <p className="text-[10.5px] text-mist">No summits have been logged.</p>
          ) : (
            <>
              {summits.map((s) => (
                <div
                  key={s.id}
                  className="flex items-baseline gap-3 border-b border-hairline py-1.5 last:border-b-0"
                >
                  <span className="tnum w-[72px] shrink-0 text-[9.5px] text-mist-dim">
                    {fmtDate(s.date)}
                  </span>
                  <span className="min-w-0 flex-1 text-[11px] text-snow">{s.name}</span>
                  <span className="min-w-0 shrink text-right text-[9px] text-mist-dim">
                    {s.bandLabel}
                  </span>
                  <span className="tnum w-[54px] shrink-0 text-right text-[11px] text-mist">
                    {fmtElevation(s.elevationM)} m
                  </span>
                </div>
              ))}
              <p className="mt-1.5 text-[9px] leading-relaxed text-mist-dim">
                Every entry above was added by the athlete. None has been verified by ICEFALL or by
                anyone else.
              </p>
            </>
          )}
        </CvSection>

        <CvSection title="Experience by altitude band">
          {bands.map((b) => (
            <div
              key={b.band}
              className="flex items-baseline gap-3 border-b border-hairline py-1 last:border-b-0"
            >
              <span
                className="tnum w-3 shrink-0 text-[9px] text-mist-dim"
                style={{ fontFamily: TECHNICAL_FAMILY }}
              >
                {b.band}
              </span>
              <span className="min-w-0 flex-1 text-[10.5px] text-snow">{b.label}</span>
              <span className="tnum shrink-0 text-[10px] text-mist">
                {b.entries === null
                  ? UNAVAILABLE_COPY[b.reason ?? "no-data"].title
                  : b.entries === 0
                    ? "No entry"
                    : `${b.entries} ${b.entries === 1 ? "entry" : "entries"}`}
              </span>
            </div>
          ))}
        </CvSection>

        <CvSection title="Technical skills — self-reported">
          {reported.length === 0 ? (
            <p className="text-[10.5px] leading-relaxed text-mist">
              No technical competences have been reported. That is not a statement that the athlete
              holds none.
            </p>
          ) : (
            <>
              <ul className="space-y-[3px]">
                {reported.map((s) => (
                  <li key={s} className="text-[10.5px] leading-snug text-snow">
                    {s}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[9px] leading-relaxed text-mist-dim">
                Claimed by the athlete and assessed by nobody. {unreported} further competences on
                ICEFALL&rsquo;s list have not been reported, which is not evidence that they are
                absent.
              </p>
            </>
          )}
        </CvSection>

        <CvSection title="Expedition history">
          <p className="text-[10.5px] leading-relaxed text-mist">{passport.expeditions.note}</p>
          <p className="tnum mt-1.5 text-[11px] text-snow">
            {passport.expeditions.count === 0
              ? "None created"
              : `${passport.expeditions.count} created`}
          </p>
          {passport.upcoming.length > 0 && (
            <div className="mt-2.5">
              <p className="section-label text-[7.5px]">Objectives ahead — not ascents</p>
              <div className="mt-1">
                {passport.upcoming.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-baseline gap-3 border-b border-hairline py-1 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 text-[10.5px] text-snow">{o.name}</span>
                    <span className="tnum shrink-0 text-[9.5px] text-mist-dim">
                      {fmtDate(o.targetDate, { day: undefined })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CvSection>

        <footer className="mt-4 border-t border-hairline pt-2.5">
          <p className="text-[9px] leading-relaxed text-mist-dim">
            Produced by ICEFALL on {fmtDate(new Date().toISOString())} from the athlete&rsquo;s own
            records. It contains no contact details, no location and no health information. It is
            not a qualification and confers nothing.
          </p>
        </footer>
      </article>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Mountain CV sheet                                                           */
/* -------------------------------------------------------------------------- */

/** Mounted into the phone shell, as `ConnectSheet` does, so it is framed right. */
function sheetRoot(): Element | null {
  if (typeof document === "undefined") return null;
  return document.querySelector("[data-phone-shell]") ?? document.body;
}

function CvSheetBody({ passport, onClose }: { passport: Passport; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      role="dialog"
      aria-modal="true"
      aria-label="Mountain CV"
      className="absolute inset-0 z-50 flex flex-col bg-obsidian"
    >
      <header
        className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 pb-3"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
        data-print-hide
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close mountain CV"
          className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <X size={18} strokeWidth={1.5} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="section-label">Mountain CV</p>
          <p className="mt-1 truncate text-[12px] text-snow">{passport.identity.name}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer size={13} strokeWidth={1.6} />
          Print
        </Button>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-4">
        <MountainCv passport={passport} />
        <p className="px-1 pb-2 pt-3 text-center text-[10px] leading-relaxed text-mist-dim">
          Nothing private is shown: no email address, no location, no health data.
        </p>
      </div>
    </motion.div>
  );
}

export function MountainCvSheet({
  passport,
  open,
  onClose,
}: {
  passport: Passport;
  open: boolean;
  onClose: () => void;
}) {
  const root = sheetRoot();
  if (root === null) return null;

  return createPortal(
    <AnimatePresence>
      {open && <CvSheetBody key="mountain-cv" passport={passport} onClose={onClose} />}
    </AnimatePresence>,
    root,
  );
}
