import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Camera, Loader2, Mountain as MountainIcon, Search, X } from "lucide-react";
import { AzureNotice, Button, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { DateField } from "@/components/ui/DateField";
import { isBackendConfigured } from "@/backend/client";
import { useSessionState } from "@/auth/session";
import { destinationIdForPeak } from "@/enquiries/send";
import { PEAK_ATTRIBUTION, rememberPeaks, searchPeaks, type Peak } from "@/services/peaks";
import { houseRulesBlockPublish, HOUSE_RULES_BLOCKING_POST } from "./Composer";
import { HouseRulesBlock } from "./HouseRules";
import { houseRulesAccountKey, useHouseRulesAcknowledgement } from "@/social/houseRules";
import {
  NO_EDIT_AFTER_PUBLISH,
  PUBLISH_ELEVATION_RANGE,
  publishSummit,
  SUMMITS_NO_BACKEND,
  SUMMITS_SELF_REPORTED,
} from "@/social/summits";
import { fmtElevation } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * PUBLISHING A SUMMIT — the composer behind `SummitLogCard`.
 *
 * One press writes two rows: a `posts` row (the words, which is what makes it
 * readable and repliable and reportable like anything else on the feed) and a
 * `summit_logs` row (the claim, with the shape a claim needs). `publishSummit`
 * owns that pair, including the rollback when the second insert fails; this
 * screen owns the questions and nothing else.
 *
 * ── WHY SO LITTLE IS REQUIRED ────────────────────────────────────────────────
 *
 * Three fields are mandatory and nothing else is: the peak, the day, and the
 * words. That is the migration's own list — `peak_name not null`, `summited_on
 * date not null`, `posts.body not null` — and the omissions are deliberate.
 *
 * ELEVATION IS OPTIONAL AND MUST LOOK OPTIONAL. The column note says why in one
 * line: "not every summit has a height the climber knows, and a required field
 * would produce guessed numbers — which is the failure this whole app is
 * arranged against." A person who cannot leave a box empty fills it with
 * something, and the something is a number other climbers then read as a fact.
 * So every optional field here is MARKED optional in words, not merely left
 * without an asterisk.
 *
 * ── WHERE A HEIGHT MAY HONESTLY COME FROM ────────────────────────────────────
 *
 * Picking a peak from the search prefills its elevation, because that figure is
 * MEASURED — it is OpenStreetMap's `ele` tag for that summit, the same figure
 * every other screen in the app derives its assessments from — and the field
 * says where it came from so it can be corrected or cleared rather than assumed
 * to be the climber's own reading. Nothing is prefilled for a peak typed by
 * hand: the app has never heard of that mountain, so it has no height to offer
 * and does not invent one.
 *
 * A MOUNTAIN THE CATALOGUE HAS NOT HEARD OF IS STILL A MOUNTAIN. The peak
 * search is the app's existing one (`searchPeaks` — bundled catalogue first,
 * then OpenStreetMap), and it can fail to find a real summit; the migration
 * anticipated exactly that ("a summit you cannot record because the app has not
 * heard of your mountain is a worse product than a typed name"), which is why
 * `peak_name` is always stored and `destination_id` is nullable.
 *
 * ── NO EDIT, AND THE COMPOSER SAYS SO BEFORE THE PRESS ───────────────────────
 *
 * `summit_logs` has no UPDATE policy, matching `posts`. A published claim about
 * a mountain is stood behind or deleted — quietly editing "3,542 m" into
 * "4,542 m" under the replies, after people have read it and perhaps planned
 * around it, is the thing that rule exists to prevent. That is worth knowing
 * BEFORE publishing, so `NO_EDIT_AFTER_PUBLISH` is written under the button and
 * not discovered afterwards as a missing control. There is deliberately no edit
 * affordance anywhere in this file.
 *
 * NOTHING HERE DRAWS A TICK OR THE WORD "VERIFIED", for the reason set out at
 * length in `SummitLogCard`: no summit log can be verified today, so no summit
 * log may be decorated as though it might be.
 *
 * ── A SUMMIT LOG IS A POST, SO THE HOUSE RULES GATE IT ───────────────────────
 *
 * This is the second of the two surfaces in the app that genuinely publishes,
 * and it is not a lesser one: it writes a `posts` row like the composer does,
 * carrying a photograph and a caption to the same feed with a mountain and a
 * date attached. Every one of the six rules can be broken by a summit photo —
 * rule 3 (say what happened in the caption) and rule 4 (do not photograph the
 * dead) are broken here more often than anywhere else in mountaineering, because
 * the summit day is the day it goes wrong.
 *
 * So it takes the SAME card and the SAME acknowledgement as `Composer.tsx`:
 * `HouseRules.tsx`'s `<HouseRulesBlock />`, resolving the same account against
 * the same store. Somebody who acknowledged in the composer is not asked again
 * here — one tap covers posting, not one tap per screen — and one shared
 * component is why the two cannot drift apart. The argument for blocking at all
 * is written out in `Composer.tsx`, once, and imported from there as
 * `houseRulesBlockPublish` so the two surfaces cannot answer it differently.
 *
 * ── EVERY FAILURE SENTENCE COMES FROM THE DATA LAYER ─────────────────────────
 *
 * `summits.ts` holds one copy of each — empty words, a future date, a peak too
 * long, a stranded post — and this screen prints what it is handed rather than
 * writing its own. Two files phrasing the same refusal differently is how a
 * climber ends up being told two things about one event.
 */

/* -------------------------------------------------------------------------- */
/* What the database will accept — matched to the migration, not guessed        */
/* -------------------------------------------------------------------------- */

/** `check (length(trim(peak_name)) between 1 and 120)`. */
const MAX_PEAK_NAME = 120;
/** `check (route is null or length(trim(route)) <= 200)`. */
const MAX_ROUTE = 200;
/** `check (conditions is null or length(trim(conditions)) <= 1000)`. */
const MAX_CONDITIONS = 1000;
/** `posts_body_check` — `length(trim(body)) between 1 and 4000`. */
const MAX_BODY = 4000;
/** `check (elevation_m is null or elevation_m between 0 and 9000)`. */
const MIN_ELEVATION = 0;
const MAX_ELEVATION = 9000;

/**
 * Today, LOCAL — the ceiling the date picker offers.
 *
 * Built from the local calendar rather than `toISOString().slice(0, 10)`, which
 * is the UTC day and therefore hands somebody in Auckland a maximum of
 * yesterday for most of their day. The column's own guard is
 * `summited_on <= (now() at time zone 'utc')::date`, so the two can disagree by
 * a few hours at the eastern edge of the world; the picker is the friendlier of
 * the pair and `PUBLISH_DATE_AHEAD_OF_SERVER` is the sentence the climber gets
 * in that narrow window. Neither is a reason to let a future date through here.
 */
function latestSummitDate(now = new Date()): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/* -------------------------------------------------------------------------- */
/* The peak                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Which mountain, and how confidently the app knows it.
 *
 * `catalogue` carries a real `Peak` — a name, a measured elevation, coordinates
 * and possibly a curated ICEFALL id. `typed` carries a name and nothing else,
 * and is the honest state for a summit the catalogue cannot place: no elevation
 * offered, no destination filed, no nearby mountain substituted.
 */
type Chosen = { kind: "catalogue"; peak: Peak } | { kind: "typed"; name: string };

const chosenName = (c: Chosen): string => (c.kind === "catalogue" ? c.peak.name : c.name);

/**
 * The `destinations` slug for the chosen peak, or null.
 *
 * A picked peak uses its own `curatedId`, which `services/peaks.ts` sets only
 * after matching the name EXACTLY, within 50 m of elevation and 2 km of the
 * curated coordinates — the check that stops "Mont Blanc du Tacul" inheriting
 * Mont Blanc's page. A typed name has no coordinates to check against, so it
 * goes through `destinationIdForPeak`, the app's single name→slug mapping,
 * imported rather than reimplemented so a second copy cannot drift and start
 * filing climbs against the wrong mountain. Null is a supported answer:
 * `destination_id` is nullable precisely so an unplaceable peak is recorded
 * under its name rather than refused or guessed at.
 */
function destinationFor(c: Chosen): string | null {
  if (c.kind === "catalogue") return c.peak.curatedId ?? destinationIdForPeak(c.peak.name);
  return destinationIdForPeak(c.name);
}

function PeakSearch({
  query,
  onQuery,
  onPick,
  onUseNameOnly,
}: {
  query: string;
  onQuery: (q: string) => void;
  onPick: (peak: Peak) => void;
  onUseNameOnly: (name: string) => void;
}) {
  const [results, setResults] = useState<Peak[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    // Debounced at 550ms, the figure every other peak search in the app uses:
    // the geocoder behind `searchPeaks` allows roughly one request a second,
    // and typing "matterhorn" would otherwise fire ten.
    const timer = setTimeout(() => {
      searchPeaks(q, ctrl.signal)
        .then((r) => {
          // So a peak page opened from this log can resolve the id later.
          rememberPeaks(r);
          setResults(r.slice(0, 8));
          setSearched(true);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 550);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
      setSearching(false);
    };
  }, [query]);

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Search for the mountain you summited</span>
        <Search
          size={16}
          strokeWidth={1.6}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
        />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Which summit?"
          spellCheck={false}
          maxLength={MAX_PEAK_NAME}
          className="h-12 w-full rounded-tile border border-hairline bg-elevated/40 pl-10 pr-10 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
        />
        {searching && (
          <Loader2
            size={16}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-mist-dim"
            aria-hidden="true"
          />
        )}
        {!searching && query.length > 0 && (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-mist-dim transition-colors hover:text-snow"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </label>

      {results.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="w-full rounded-tile border border-hairline p-3 text-left transition-colors hover:border-azure/50"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-hairline bg-white/[0.02] text-mist">
                    <MountainIcon size={15} strokeWidth={1.4} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-snow">{p.name}</p>
                    <p className="tnum mt-0.5 text-[11px] text-mist-dim">
                      {fmtElevation(p.elevationM)} m{p.country ? ` · ${p.country}` : ""}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* A summit the search cannot place is still recorded — under its name
          alone, with no elevation and no mountain page behind it. That is what
          `peak_name not null` and a nullable `destination_id` are for. */}
      {searched && !searching && results.length === 0 && (
        <div className="mt-3">
          <p className="text-[11px] leading-relaxed text-mist-dim">
            Nothing found. The search runs against OpenStreetMap and needs a connection, and peaks
            with no recorded elevation are left out of it.
          </p>
          <button
            type="button"
            onClick={() => onUseNameOnly(query.trim())}
            className="mt-2.5 text-[12px] text-azure transition-colors hover:text-azure-bright"
          >
            Log “{query.trim()}” under its name
          </button>
        </div>
      )}

      {/* Required by ODbL wherever OSM data is shown. */}
      <p className="mt-3 text-[10px] text-mist-dim">{PEAK_ATTRIBUTION}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field furniture                                                             */
/* -------------------------------------------------------------------------- */

const inputClass =
  "mt-1.5 w-full rounded-tile border border-hairline bg-elevated/40 px-3.5 py-3 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50";

/**
 * A labelled field, with "Optional" said in words.
 *
 * The marker is the whole point of the component: an unmarked box reads as
 * expected, and an elevation somebody feels expected to supply is an elevation
 * somebody estimates. Required fields carry no marker at all rather than an
 * asterisk — there are only three of them and the button says what is missing.
 *
 * A `div` and not a `label`, deliberately. One of these wraps `DateField`,
 * which is a BUTTON that opens a popover, and a button inside a label can be
 * activated twice by one click — which would open the calendar and immediately
 * close it. Every control below therefore carries its own `aria-label`
 * (`DateField` takes one as a prop for exactly this reason) and the visible
 * line here is the sighted reader's copy of it.
 */
function Field({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.1em] text-mist-dim">{label}</span>
        {optional && <span className="text-[10.5px] text-mist-dim">Optional</span>}
      </p>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The composer                                                                */
/* -------------------------------------------------------------------------- */

export function PublishSummit({
  onDone,
  onCancel,
}: {
  /**
   * Called with the post id the SERVER returned — the only evidence the two
   * rows exist. `null` is reserved for a finish that published nothing; this
   * component never passes it, because a failed publish keeps the composer open
   * with everything the climber typed still in it.
   */
  onDone(postId: string | null): void;
  onCancel(): void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Chosen | null>(null);
  /** Kept as the typed string, so "" is genuinely empty and not a 0. */
  const [elevation, setElevation] = useState("");
  /** Which peak a prefilled elevation came from, so the field can say so. */
  const [elevationFrom, setElevationFrom] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [route, setRoute] = useState("");
  const [conditions, setConditions] = useState("");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);

  /**
   * The publish's own three pieces of state.
   *
   * `busy` disables the BUTTON and not the form: a climber re-reading their
   * conditions report while the request is in flight should not find the text
   * frozen. `failure` is whatever sentence `summits.ts` handed back, printed
   * verbatim. `stranded` is the one case that leaves something behind on the
   * server for the person to deal with — see `PUBLISH_STRANDED_POST`.
   */
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [stranded, setStranded] = useState<string | null>(null);

  const connected = isBackendConfigured();
  const maxDate = latestSummitDate();

  /**
   * The house rules, for the account this will publish as.
   *
   * `useSessionState` answers in three states and the third is doing work here:
   * `undefined` is "not resolved yet", and it is passed through as `undefined`
   * rather than being flattened with `?.` — `session?.user.id` yields
   * `undefined` for BOTH "not known" and "signed out", which would file a
   * signed-out person's acknowledgement under the unknown key and lose it.
   *
   * While the session is unresolved `HouseRulesBlock` draws the reminder card
   * with no acknowledgement control on it, and this does NOT block — which is
   * the one deliberate hole: for the moment before the session lands, Publish is
   * not gated. It is a moment; this form needs a peak, a date and a paragraph
   * before Publish can fire at all; and the alternative is a button disabled
   * beside a card offering no way to enable it. See `houseRulesBlockPublish`.
   */
  const session = useSessionState();
  const houseRules = useHouseRulesAcknowledgement(
    houseRulesAccountKey(session === undefined ? undefined : (session?.user.id ?? null)),
  );
  const rulesBlock = houseRulesBlockPublish(houseRules);

  // An object URL outlives the component that made it, so the preview is
  // released when it is replaced and when the composer goes away.
  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);

  /* ---- What may be sent ------------------------------------------------- */

  const trimmedBody = body.trim();
  const bodyOverLimit = trimmedBody.length > MAX_BODY;

  /**
   * The elevation, as three answers rather than two.
   *
   * Empty is a climber who did not record a height, and it is a perfectly good
   * summit log — it sends `null`. A number outside 0–9,000 is one the column
   * would refuse (a typo, or a figure in feet), and it stops the publish with
   * `PUBLISH_ELEVATION_RANGE` rather than a constraint violation — and is never
   * clamped to fit, because a clamped figure is a number nobody typed on a card
   * other climbers read as a fact. Only a valid figure travels.
   */
  const elevationInput = elevation.trim();
  const elevationValue = elevationInput === "" ? null : Number(elevationInput);
  const elevationOk =
    elevationValue === null ||
    (Number.isInteger(elevationValue) &&
      elevationValue >= MIN_ELEVATION &&
      elevationValue <= MAX_ELEVATION);

  const dateOk = date.length === 10 && date <= maxDate;

  const ready =
    connected &&
    chosen !== null &&
    dateOk &&
    trimmedBody.length > 0 &&
    !bodyOverLimit &&
    elevationOk &&
    !busy &&
    !rulesBlock;

  async function submit() {
    if (!chosen || !ready) return;
    /* `ready` already carries this. Repeated at the write for the reason the
       composer gives: a gate that exists only in a `disabled` prop is one
       refactor away from not existing. */
    if (rulesBlock) return;
    setBusy(true);
    setFailure(null);
    setStranded(null);

    const result = await publishSummit({
      body: trimmedBody,
      peakName: chosenName(chosen),
      destinationId: destinationFor(chosen),
      elevationM: elevationValue,
      summitedOn: date,
      // Empty optional text is sent as null rather than "": the columns are
      // nullable precisely so "they did not say" is an absence and not a
      // present-but-blank field on somebody else's card.
      route: route.trim() || null,
      conditions: conditions.trim() || null,
      file: photo?.file ?? null,
    });

    setBusy(false);

    // Nothing is cleared and nothing is announced on a failure — the sentence
    // says what happened and everything typed is still here for a second
    // attempt. Only a post id the SERVER returned ends this screen; there is no
    // optimistic finish, because the id is the only evidence the rows exist.
    if (!result.ok) {
      setFailure(result.message);
      setStranded(result.strandedPostId ?? null);
      return;
    }
    onDone(result.postId);
  }

  /* ---- No server -------------------------------------------------------- */

  /*
   * A summit log is published TO other people; with no client there is nobody
   * to publish to, and no local copy is written as a consolation. `summitLog.ts`
   * is the device-local diary and it is a different feature making a different
   * promise — silently diverting a publish into it would tell a climber their
   * claim was shared when it never left the phone.
   */
  if (!connected) {
    return (
      <div className="space-y-3.5">
        <AzureNotice title="No server in this build">
          <p>{SUMMITS_NO_BACKEND}</p>
          <p>
            A summit log is something other climbers read, so there is nothing useful this screen
            can do without one. Nothing has been saved.
          </p>
        </AzureNotice>
        <Button variant="secondary" className="w-full" onClick={onCancel}>
          Close
        </Button>
      </div>
    );
  }

  /* ---- The form --------------------------------------------------------- */

  return (
    <div className="space-y-5">
      <SectionLabel>Publish a summit</SectionLabel>

      {/* Before the first question, not after the last one. The same card the
          composer shows, resolving the same account from the same store — a
          direct child of the `space-y-5` column, so it spaces itself. */}
      <HouseRulesBlock />

      {/* ---- Which mountain --------------------------------------------- */}
      {chosen === null ? (
        <PeakSearch
          query={query}
          onQuery={setQuery}
          onPick={(peak) => {
            setChosen({ kind: "catalogue", peak });
            // MEASURED, and labelled as measured. OpenStreetMap's `ele` for
            // this summit is the same figure the rest of the app assesses peaks
            // from; offering it is not a guess, and the hint below says where
            // it came from so it can be corrected or cleared.
            setElevation(String(Math.round(peak.elevationM)));
            setElevationFrom(peak.name);
          }}
          onUseNameOnly={(name) => {
            setChosen({ kind: "typed", name });
            // Nothing is prefilled: the app has never heard of this mountain,
            // so it has no height to offer and must not invent one.
            setElevation("");
            setElevationFrom(null);
          }}
        />
      ) : (
        <div className="flex items-center gap-3 rounded-tile border border-azure/40 bg-azure/[0.05] p-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-hairline bg-white/[0.02] text-azure">
            <MountainIcon size={15} strokeWidth={1.4} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] text-snow">{chosenName(chosen)}</p>
            <p className="mt-0.5 text-[11px] text-mist-dim">
              {chosen.kind === "catalogue"
                ? chosen.peak.country
                  ? `${fmtElevation(chosen.peak.elevationM)} m · ${chosen.peak.country}`
                  : `${fmtElevation(chosen.peak.elevationM)} m`
                : "Not in ICEFALL's catalogue — recorded under this name"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setChosen(null);
              setElevation("");
              setElevationFrom(null);
            }}
            aria-label="Choose a different mountain"
            className="shrink-0 rounded-full p-1.5 text-mist-dim transition-colors hover:text-snow"
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>
      )}

      {/* ---- The day ----------------------------------------------------- */}
      <Field
        label="The day you summited"
        hint="The day you stood on top, not the day you are writing. A summit in the future is a plan rather than an ascent, and the server refuses one."
      >
        {/* Deliberately EMPTY until it is chosen. The device-local log defaults
            to today, which is right for a diary written on the walk down; this
            one is a public claim about a date, so it is picked on purpose
            rather than accepted by not looking. */}
        <DateField
          label="The day you summited"
          value={date}
          onChange={setDate}
          max={maxDate}
          placeholder="Choose the day"
          className="mt-1.5"
        />
      </Field>

      {/* ---- Elevation --------------------------------------------------- */}
      <Field
        label="Height"
        optional
        hint={
          elevationFrom
            ? `Metres. OpenStreetMap records ${elevationFrom} at this height — change it if your own reading differs, or clear it to leave the height out.`
            : "Metres, if you know it. Leaving it empty is better than an estimate: other climbers read this as a fact."
        }
      >
        <input
          value={elevation}
          onChange={(e) => {
            // Digits only. A minus sign, a decimal point or a stray letter
            // would all be refused by the column, and refusing them at the
            // keystroke is kinder than refusing them at the press.
            setElevation(e.target.value.replace(/[^\d]/g, "").slice(0, 4));
            // The figure is no longer OpenStreetMap's once it has been typed
            // over, so the hint stops saying that it is.
            setElevationFrom(null);
          }}
          inputMode="numeric"
          placeholder="—"
          aria-label="Height in metres, optional"
          className={cn(inputClass, "tnum")}
        />
      </Field>
      {!elevationOk && <p className="-mt-3 text-[11.5px] text-danger">{PUBLISH_ELEVATION_RANGE}</p>}

      {/* ---- Route ------------------------------------------------------- */}
      <Field label="Route" optional hint="The way you went up, in your words.">
        <input
          value={route}
          onChange={(e) => setRoute(e.target.value)}
          maxLength={MAX_ROUTE}
          aria-label="Route, optional"
          placeholder="NE ridge · normal route from the hut"
          className={inputClass}
        />
      </Field>

      {/* ---- Conditions --------------------------------------------------
          The field other climbers actually use, and the reason a summit log is
          worth reading rather than merely worth posting. */}
      <Field
        label="Conditions"
        optional
        hint="What the mountain was like. Perishable and first-hand — the part somebody planning the same day reads first."
      >
        <textarea
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          maxLength={MAX_CONDITIONS}
          rows={3}
          aria-label="Conditions you found, optional"
          placeholder="Snow from 1,900 m, ice on the summit ridge, crampons from the col…"
          className={cn(inputClass, "resize-none leading-relaxed")}
        />
      </Field>

      {/* ---- The words ---------------------------------------------------
          Required, because `posts.body` is NOT NULL and 1–4,000 characters: a
          summit log is published AS a post, and a post is always words. The
          alternative would be ICEFALL composing a sentence and signing the
          climber's name to it. */}
      <Field
        label="What happened up there"
        hint="A summit log is a post, and a post is always words. The peak, the day, the route and the conditions are recorded separately — this is everything else."
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          aria-label="What happened up there"
          placeholder="How the day went…"
          className={cn(inputClass, "resize-none leading-relaxed")}
        />
      </Field>
      {/* The count appears only where it starts to matter — a counter running
          from the first keystroke turns a paragraph into a form field. */}
      {trimmedBody.length > MAX_BODY - 400 && (
        <p className={cn("tnum -mt-3 text-[11px]", bodyOverLimit ? "text-danger" : "text-mist-dim")}>
          {trimmedBody.length.toLocaleString("en-GB")} / {MAX_BODY.toLocaleString("en-GB")}
          {bodyOverLimit && " — the server will refuse this length"}
        </p>
      )}

      {/* ---- The photograph from the day ---------------------------------
          A PHOTOGRAPH, NOT A VIDEO, and the picker says so rather than letting
          the storage policy say it. `post-media` (20260902160000) allows video
          only for accounts whose identity ICEFALL has checked
          (20260902200000), which this screen does not read — so `accept` is
          images only and `publishSummit` refuses anything else with
          `PUBLISH_PHOTO_ONLY`. Video is posted from the feed composer, by the
          accounts that may have it.

          The whole publish fails if the upload does. A summit that quietly
          dropped the photograph would be a post the climber believes carries
          the picture they chose. */}
      <Field label="Photo from the day" optional>
        {photo ? (
          <div className="relative mt-1.5 overflow-hidden rounded-tile border border-hairline">
            <img src={photo.url} alt="" aria-hidden className="h-[150px] w-full object-cover" />
            <button
              type="button"
              onClick={() => setPhoto(null)}
              aria-label="Remove photo"
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-obsidian/75 text-snow"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-tile border border-hairline-strong py-3 text-[12.5px] text-mist transition-colors hover:border-azure/45 hover:text-snow"
          >
            <Camera size={15} strokeWidth={1.7} aria-hidden />
            Add a photo from the summit
          </button>
        )}
        <input
          ref={picker}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so choosing the same file twice still fires a change.
            e.target.value = "";
            if (!file) return;
            setPhoto({ file, url: URL.createObjectURL(file) });
          }}
        />
      </Field>

      {/* ---- What went wrong, in the data layer's words ------------------- */}
      {failure && (
        <div className="rounded-tile border border-danger/35 bg-danger/[0.06] px-3.5 py-3">
          <p className="text-[12px] leading-relaxed text-snow">{failure}</p>
          {/* The one failure the climber has to act on: the post is live and
              the claim is not, and the rollback failed too. The message already
              says to delete it; this is the way there. */}
          {stranded && (
            <Link
              to={`/social/post/${stranded}`}
              className="mt-2.5 inline-block text-[11.5px] text-azure underline-offset-2 hover:underline"
            >
              Open that post →
            </Link>
          )}
        </div>
      )}

      <div className="flex gap-2.5">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button className="flex-1" disabled={!ready} onClick={() => void submit()}>
          {busy ? "Publishing…" : "Publish"}
        </Button>
      </div>

      {/* This form is long enough that the rules card is well off screen by the
          time the button is reached, and a refusal with no sentence is the one
          thing this screen has spent 200 lines avoiding. */}
      {rulesBlock && (
        <p className="-mt-2 text-[11px] leading-relaxed text-mist-dim">
          {HOUSE_RULES_BLOCKING_POST}
        </p>
      )}

      <Disclaimer>
        {NO_EDIT_AFTER_PUBLISH} It is self-reported: {SUMMITS_SELF_REPORTED} Another climber may
        plan their day on what you write here.
      </Disclaimer>
    </div>
  );
}
