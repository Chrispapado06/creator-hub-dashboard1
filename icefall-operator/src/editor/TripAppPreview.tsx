/**
 * TripAppPreview — one trip as the PHONE APP draws it.
 *
 * The centre pane of the product editor, "App" surface. Its sibling is
 * `CompanyPreview.tsx`; the section-frame mechanism, the two-way selection and
 * the phone bezel are that file's, deliberately unchanged, because two previews
 * that select differently are two products.
 *
 * ── WHY THIS PANE IS DARK ───────────────────────────────────────────────────
 *
 * The portal is light. The athlete app is not: `icefall-app` paints obsidian
 * (#05070B) with snow text and an azure accent, and this pane is a DEPICTION of
 * that app, not a piece of portal chrome. So the dark values below are CONTENT.
 * They are the app's own tokens, copied from `icefall-app/src/index.css`, and
 * nothing outside the phone frame is allowed to touch them — the frame's
 * selection outline and its section badge stay on the portal's azure, because
 * those belong to the editor and not to the page being edited.
 *
 * The same argument, and the same shape of exception, already sits at the top
 * of `CompanyPreview.tsx` for its gilt accent.
 *
 * ── WHAT IT IS FAITHFUL TO ──────────────────────────────────────────────────
 *
 * `icefall-app/src/screens/explore/TripDetail.tsx`: a short hero over a
 * gradient, the name light and large with the height beneath it rather than
 * bracketed inside it, a stat strip, a price band, a tab strip
 * (Overview / Itinerary / Inclusions / Reviews / FAQ), then cards.
 *
 * ONE DELIBERATE DEPARTURE, AND ITS REASON. The app hides most of that behind
 * tabs. A preview that hides sections behind tabs hides exactly the thing the
 * operator opened it to see — the gap they are about to publish — so every
 * section is stacked and visible at once, and the tab strip is drawn inert as
 * the piece of app furniture it is. Sections appear in rail order.
 *
 * The stat strip sits one block below the hero rather than inside it, so that
 * clicking a duration selects the section that actually edits duration.
 *
 * ── HONESTY ─────────────────────────────────────────────────────────────────
 *
 * Nothing here is invented and nothing is skipped. An empty field renders the
 * sentence a climber would really meet — `icefall-web/src/app/TripDetail.tsx`
 * has a `NotPublished` component for precisely this, and `NotPublished` below
 * carries its wording rather than a second, softer version of it. A section
 * with nothing in it is still drawn, still selectable, still labelled: an
 * omitted section is a gap the operator ships without ever having seen.
 *
 * This pane writes nothing. The contact-details guard and the publication
 * boundary live on the write path, where a refusal can be shown.
 */

import { useState, type JSX, type ReactNode } from "react";
import {
  BarChart3, CalendarDays, Check, ChevronRight, Clock, FileText, Heart, Lock,
  MapPin, MessageSquare, Mountain as MountainIcon, Share2, X,
} from "lucide-react";
import { formatMoney, formatPriceRange } from "@/components/ui";
import { Monogram } from "@/components/Shell";
import type { Cents } from "@/domain/honesty";
import { PRODUCT_SECTIONS } from "@/editor/productSections";
import type { FaqEntry, ItineraryDay } from "@/domain/types";

/* -------------------------------------------------------------------------- */
/* The depicted app's palette — content, not chrome. See the header.          */
/* -------------------------------------------------------------------------- */

const APP = {
  obsidian: "oklch(0.1277 0.0108 259.6)", // app canvas
  graphite: "oklch(0.1814 0.0158 261.5)", // cards
  elevated: "oklch(0.2627 0.0231 259.3)", // chips / inputs
  snow: "oklch(0.9481 0.0103 261.8)", // primary text
  mist: "oklch(0.6653 0.0287 264.4)", // secondary text
  mistDim: "oklch(0.4986 0.0309 264.2)", // tertiary text
  azure: "oklch(0.6868 0.1674 255.4)", // the app's accent
  azureSoft: "oklch(0.6868 0.1674 255.4 / 15%)",
  azureLine: "oklch(0.6868 0.1674 255.4 / 45%)",
  hairline: "oklch(1 0 0 / 7%)",
} as const;

const CARD = {
  background: APP.graphite,
  border: `1px solid ${APP.hairline}`,
} as const;

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

export interface TripPreviewData {
  name: string;
  kind: "expedition" | "trek";
  /**
   * WHOSE TRIP THIS IS — the line above the name, as the web hero draws it.
   *
   * Blank while the company record has not loaded. The identity line is then
   * omitted rather than filled with "Your company": a hero that names a company
   * the app has not read is a hero that can name the wrong one.
   */
  companyName: string;
  /**
   * A RESOLVED, LOADABLE URL for the company's own logo, or null.
   *
   * Null is the ordinary case and it renders a monogram, not a substitute mark.
   * `Company.logoMediaId` is an id into a PRIVATE bucket and there is no
   * resolver on `OperatorBackend` yet (see the note at the call site in
   * `ProductEditor`), so nothing here may build a URL from that id: a guessed
   * path is either a broken image or, worse, somebody else's file.
   *
   * NEVER a mark of ICEFALL's making. Among the companies in this catalogue at
   * least one is a REAL business, and a real business's logo is its trademark:
   * it does not ship here and must not be approximated. An operator uploading
   * their OWN logo into their OWN account is the legitimate source, and it is
   * the only one.
   */
  companyLogoUrl: string | null;
  mountainName: string | null;
  description: string | null;
  durationDays: number | null;
  difficulty: string | null;
  maxAltitudeM: number | null;
  seasonality: string | null;
  /** Integer minor units. `Cents` is an alias of `number` — never a float. */
  priceFromCents: Cents | null;
  priceToCents: Cents | null;
  currency: string;
  itinerary: ItineraryDay[];
  equipment: string[];
  inclusions: string[];
  exclusions: string[];
  faq: FaqEntry[];
}

/**
 * Section keys.
 *
 * `src/editor/productSections.ts` is being written by another agent this phase
 * and does not exist on disk yet, so these are the keys the brief specifies,
 * declared here as one list rather than sprinkled as string literals. When that
 * file lands, this constant should be deleted and its keys imported — one
 * source, or the rail and the preview drift apart and clicking does nothing.
 */
/**
 * THE SECTION MODEL'S KEYS, NOT A SECOND SET.
 *
 * This file previously declared its own — written before productSections.ts
 * existed — and they drifted on exactly one entry: the rail called it `about`,
 * this called it `overview`. Both compiled, because both are strings, and the
 * only symptom was a click in the preview selecting a section the rail did not
 * have. The editor briefly carried a translator between the two vocabularies;
 * this removes the need for one. A section's KEY is its identity and comes from
 * the contract; its LABEL is free to read "Overview" where the app says that.
 */
const SECTION = Object.fromEntries(
  PRODUCT_SECTIONS.map((s) => [s.key, s.key]),
) as Record<string, string>;

const KIND_LABEL: Record<TripPreviewData["kind"], string> = {
  expedition: "Expedition",
  trek: "Trek",
};

/* -------------------------------------------------------------------------- */
/* The frame around each section — CompanyPreview's, unchanged in behaviour    */
/* -------------------------------------------------------------------------- */

function SectionFrame({
  id,
  label,
  selected,
  onSelect,
  children,
}: {
  id: string;
  label: string;
  /** The whole selection, not a boolean: nothing selected must not dim the page. */
  selected: string | null;
  onSelect: (key: string) => void;
  children: ReactNode;
}) {
  const isSelected = selected === id;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={isSelected}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
        }
      }}
      className={`relative cursor-pointer rounded-card transition-all ${
        isSelected || selected === null ? "" : "opacity-50 hover:opacity-80"
      }`}
      style={
        isSelected
          ? { outline: "2px solid var(--op-azure)", boxShadow: "0 0 0 4px var(--op-azure-soft)" }
          : undefined
      }
    >
      {isSelected && (
        <span
          className="absolute -top-px left-3.5 z-10 -translate-y-1/2 rounded-pill bg-azure px-2.5 py-0.5 text-[9.5px] font-semibold tracking-[0.1em] text-canvas uppercase"
          aria-hidden
        >
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

/** The app's small-caps card heading, in the app's own grey. */
function Label({ children }: { children: ReactNode }) {
  return (
    <span className="lbl block" style={{ fontSize: 8, color: APP.mistDim }}>
      {children}
    </span>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card p-3.5" style={CARD}>
      {children}
    </div>
  );
}

/**
 * What a climber actually meets where the operator published nothing.
 *
 * Wording from `icefall-web/src/app/TripDetail.tsx`. It is not softened for the
 * operator's benefit: this sentence, in this place, is the cost of the gap.
 */
function NotPublished({ what, kind }: { what: string; kind: TripPreviewData["kind"] }) {
  return (
    <p className="text-[11px] leading-relaxed" style={{ color: APP.mist }}>
      This operator has not published {what} for this {kind}. Contact them directly and ask for it
      in writing before you pay a deposit.
    </p>
  );
}

/**
 * A statement about the preview itself, not about the trip.
 *
 * Padlocked and visually apart from the drawn page, so it can never be mistaken
 * for something a climber reads. Used only where a section exists in the rail
 * but its content is not carried by this draft.
 */
function PreviewNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-card px-3 py-2.5"
      style={{ border: `1px dashed ${APP.hairline}` }}
    >
      <Lock size={11} className="mt-0.5 shrink-0" style={{ color: APP.mistDim }} aria-hidden />
      <span className="text-[10px] leading-relaxed" style={{ color: APP.mistDim }}>
        {children}
      </span>
    </div>
  );
}

/**
 * One hero figure.
 *
 * A missing figure is a dash, never a filled-in guess — the same refusal
 * `CompanyPreview` makes for summit rate. The dash carries its reason for a
 * screen reader so it is not a silent blank.
 */
function Stat({
  icon: Icon,
  value,
  label,
  last = false,
}: {
  icon: typeof Clock;
  value: string | null;
  label: string;
  /** The divider is an inline style, so it cannot be turned off by a class. */
  last?: boolean;
}) {
  return (
    <div
      className="min-w-0 flex-1 px-1.5"
      style={last ? undefined : { borderRight: `1px solid ${APP.hairline}` }}
    >
      <Icon size={13} strokeWidth={1.6} style={{ color: APP.azure }} aria-hidden />
      <p
        className="tnum mt-1.5 truncate text-[11.5px] leading-none"
        style={{ color: value === null ? APP.mistDim : APP.snow }}
        title={value === null ? "Not published yet" : undefined}
      >
        {value ?? "—"}
        {value === null && <span className="sr-only"> not published yet</span>}
      </p>
      <p className="mt-1.5 truncate text-[8.5px] leading-tight" style={{ color: APP.mistDim }}>
        {label}
      </p>
    </div>
  );
}

/** The drawn ridge. There is no trip photograph in this draft, so none is faked. */
function HeroPlate() {
  return (
    <svg
      viewBox="0 0 300 190"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id="tap-ridge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.30 0.05 250)" />
          <stop offset="1" stopColor="oklch(0.15 0.02 260)" />
        </linearGradient>
      </defs>
      <rect width="300" height="190" fill="url(#tap-ridge)" />
      <g fill="none" stroke="oklch(1 0 0)" strokeWidth="1" opacity="0.1">
        <path d="M-10 160 C 50 132, 90 76, 140 80 C 195 84, 220 150, 275 138 C 298 133, 305 120, 312 118" />
        <path d="M-10 140 C 46 110, 84 54, 136 58 C 190 62, 214 128, 270 116 C 294 111, 302 98, 312 96" />
        <path d="M-10 120 C 42 88, 78 32, 132 36 C 186 40, 208 106, 264 94 C 290 89, 300 76, 312 74" />
      </g>
      <rect width="300" height="190" fill={APP.obsidian} opacity="0.4" />
    </svg>
  );
}

/**
 * THE COMPANY'S OWN MARK, OR ITS INITIALS. There is no third option.
 *
 * A logo only renders when the caller hands over a URL that already resolves —
 * the operator's own file, uploaded to their own account. Everything else is a
 * monogram: `Shell`'s monogram, the one the rest of the portal already uses, so
 * a company cannot look like two different things in two panes.
 *
 * A URL THAT FAILS TO LOAD FALLS BACK TOO. `ListingPhoto` in `components/ui`
 * degrades on `onError` for exactly this reason, and a hero showing a broken
 * image icon where a company's identity belongs is worse than showing initials.
 * The failure is remembered per URL, so changing the logo re-tries the new one.
 *
 * WHY NO GENERATED GLYPH. At least one company in this catalogue is a real
 * business whose logo is its trademark and is not ours to ship, generate or
 * stand in for. Initials set in type are a label, not a mark; a drawn emblem
 * would be ICEFALL inventing a company's identity for it.
 */
function CompanyMark({ name, logoUrl, size }: { name: string; logoUrl: string | null; size: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (logoUrl === null || failedUrl === logoUrl) {
    // No logo AND no name is "nothing known about the company yet", which is an
    // empty tile. A monogram of no initials would be a blank circle pretending
    // to be a mark.
    if (name.trim() === "") {
      return (
        <span
          className="shrink-0 rounded-pill"
          style={{ width: size, height: size, background: APP.elevated, border: `1px solid ${APP.hairline}` }}
          aria-hidden
        />
      );
    }
    return <Monogram name={name} size={size} />;
  }

  return (
    <img
      src={logoUrl}
      alt=""
      onError={() => setFailedUrl(logoUrl)}
      className="shrink-0 rounded-pill object-cover"
      style={{ width: size, height: size, background: APP.elevated }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* The preview                                                                */
/* -------------------------------------------------------------------------- */

export function TripAppPreview({
  d,
  selected,
  onSelect,
}: {
  d: TripPreviewData;
  selected: string | null;
  onSelect: (key: string) => void;
}): JSX.Element {
  const kindLabel = KIND_LABEL[d.kind];

  /*
   * MONEY. Integer minor units through the shared formatters, never a float and
   * never a `toFixed` here. A range and a single bound are different claims, so
   * the label changes with the figure rather than always reading "From".
   */
  const bounded = d.priceFromCents !== null && d.priceToCents !== null;
  const priceLabel = bounded ? "Price range" : "From";
  const priceText = bounded
    ? formatPriceRange(d.priceFromCents, d.priceToCents, d.currency)
    : d.priceFromCents !== null || d.priceToCents !== null
      ? formatMoney((d.priceFromCents ?? d.priceToCents)!, d.currency)
      : null;

  const altitude =
    d.maxAltitudeM !== null ? `${d.maxAltitudeM.toLocaleString("en-GB")} m` : null;
  const duration = d.durationDays !== null ? `${d.durationDays} days` : null;

  /*
   * An empty string is not content. A field the operator cleared arrives here
   * as "" rather than null, and rendering it as filled-in would hide the gap
   * this pane exists to show — so blank and absent collapse to one state.
   */
  const text = (v: string | null): string | null => (v !== null && v.trim() !== "" ? v.trim() : null);

  const description = text(d.description);
  const difficulty = text(d.difficulty);
  const mountainName = text(d.mountainName);
  const seasonality = text(d.seasonality);
  const hasIncluded = d.inclusions.length > 0 || d.exclusions.length > 0;

  return (
    <div className="flex justify-center pt-4">
      <div
        className="relative w-[300px] overflow-hidden"
        style={{
          background: APP.obsidian,
          color: APP.snow,
          borderRadius: "30px 30px 0 0",
          border: "7px solid oklch(0.2213 0.0192 262.1)",
          borderBottom: 0,
          // The bezel's shadow falls on the PORTAL's canvas, which is light —
          // so it is a light-canvas shadow, not the app's own dark one.
          boxShadow: "0 -8px 40px oklch(0 0 0 / 14%)",
        }}
      >
        {/* ---- Hero ---------------------------------------------------- */}
        <SectionFrame id={SECTION.hero} label="Hero" selected={selected} onSelect={onSelect}>
          <div className="relative h-[190px] overflow-hidden">
            <HeroPlate />
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(180deg, transparent 38%, ${APP.obsidian} 100%)` }}
            />

            {/* App furniture, inert — as it is in the app itself. */}
            <div className="absolute top-3 right-3 left-3 flex items-center">
              <ChevronRight size={16} className="rotate-180" style={{ color: APP.snow }} aria-hidden />
              <span className="ml-auto flex items-center gap-2">
                <Heart size={14} strokeWidth={1.6} style={{ color: APP.mistDim }} aria-hidden />
                <Share2 size={14} strokeWidth={1.6} style={{ color: APP.mistDim }} aria-hidden />
              </span>
            </div>

            <div className="absolute right-4 bottom-3 left-4 flex flex-col gap-1.5">
              <span
                className="self-start rounded-pill px-2 py-0.5 text-[8.5px] font-medium tracking-[0.14em] uppercase"
                style={{
                  color: APP.azure,
                  background: APP.azureSoft,
                  border: `1px solid ${APP.azureLine}`,
                }}
              >
                {kindLabel}
              </span>

              {/*
                WHOSE TRIP THIS IS, ABOVE THE NAME OF IT.

                The web hero draws this line as icon + company name in wide
                uppercase; the icon there is a GENERIC mountain glyph, which is
                the thing being fixed — every operator's trip carried the same
                mark, so the mark identified nobody. Here it is the company's
                own logo when they have uploaded one and their monogram when
                they have not.

                NO VERIFICATION TICK, and its absence is deliberate. The web
                hero ends this line with one, driven by a `verifiedOn` date its
                demo data invents. This app has no verification fact to render:
                `Company` carries `documentsCheckedAt` — when ICEFALL last
                looked at a company's papers — and Session 03 renamed it away
                from "verified" precisely so it could not be read as an
                endorsement. It is the company page's badge, not a tick on a
                trip. Drawing one here would be ICEFALL vouching for an operator
                it has not vouched for.

                Omitted entirely while the company name is unknown — see
                `companyName` above.
              */}
              {d.companyName.trim() !== "" && (
                <span className="flex items-center gap-1.5">
                  <CompanyMark name={d.companyName.trim()} logoUrl={d.companyLogoUrl} size={16} />
                  <span
                    className="truncate text-[9.5px] font-medium tracking-[0.12em] uppercase"
                    style={{ color: APP.snow }}
                  >
                    {d.companyName.trim()}
                  </span>
                </span>
              )}

              {/* The name is a NAME: the family's serif, as on the company preview. */}
              <span className="ser text-[22px] leading-[1.1]" style={{ color: APP.snow }}>
                {d.name.trim() || "Untitled trip"}
              </span>

              <span className="flex items-center gap-1.5 text-[11px]">
                <MapPin size={11} strokeWidth={1.8} style={{ color: APP.azure }} aria-hidden />
                {mountainName !== null ? (
                  <span style={{ color: APP.mist }}>{mountainName}</span>
                ) : (
                  <span style={{ color: APP.mistDim }}>No mountain linked yet</span>
                )}
              </span>
            </div>
          </div>
        </SectionFrame>

        {/* ---- Overview: the stat strip, then the description ------------ */}
        <div className="px-4 pt-3">
          <SectionFrame
            id={SECTION.about}
            label="Overview"
            selected={selected}
            onSelect={onSelect}
          >
            <div className="flex flex-col gap-3 py-1">
              <div className="flex items-stretch">
                <Stat icon={Clock} value={duration} label="Duration" />
                <Stat icon={MountainIcon} value={altitude} label="Max altitude" />
                <Stat icon={BarChart3} value={difficulty} label="Difficulty" last />
              </div>

              <Card>
                <Label>About this {d.kind}</Label>
                <div className="mt-2">
                  {description !== null ? (
                    <p className="text-[11px] leading-relaxed" style={{ color: APP.mist }}>
                      {description}
                    </p>
                  ) : (
                    <NotPublished what={`a description of this ${d.kind}`} kind={d.kind} />
                  )}
                </div>
              </Card>
            </div>
          </SectionFrame>
        </div>

        {/* ---- Price band ----------------------------------------------- */}
        <div className="px-4 pt-3">
          <SectionFrame id={SECTION.price} label="Price" selected={selected} onSelect={onSelect}>
            <Card>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px]" style={{ color: APP.mistDim }}>
                    {priceLabel}
                  </span>
                  {priceText !== null ? (
                    <>
                      <p
                        className="ser tnum mt-1 text-[19px] leading-none"
                        style={{ color: APP.snow }}
                      >
                        {priceText}
                      </p>
                      <p className="mt-1 text-[10px]" style={{ color: APP.mistDim }}>
                        Per person
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-[11px] leading-snug" style={{ color: APP.mistDim }}>
                      Not published yet
                    </p>
                  )}
                </div>
                <div
                  className="min-w-0 flex-1 pl-3"
                  style={{ borderLeft: `1px solid ${APP.hairline}` }}
                >
                  <span className="text-[10px]" style={{ color: APP.mistDim }}>
                    Best season
                  </span>
                  <p
                    className="mt-1.5 text-[11px] leading-snug"
                    style={{ color: seasonality !== null ? APP.snow : APP.mistDim }}
                  >
                    {seasonality ?? "Not published yet"}
                  </p>
                </div>
              </div>
              <div
                className="mt-3 rounded-pill py-2 text-center text-[11px] font-medium"
                style={{ background: APP.azure, color: APP.obsidian }}
              >
                Check availability
              </div>
              <p className="mt-2 text-[9.5px] leading-relaxed" style={{ color: APP.mistDim }}>
                Opens an enquiry draft. ICEFALL takes no payment, holds no dates and reserves
                nothing — availability comes from the operator.
              </p>
            </Card>
          </SectionFrame>
        </div>

        {/* ---- The tab strip, inert. See the header on why nothing hides. */}
        <div
          className="mt-4 flex gap-4 overflow-hidden px-4 pb-2 text-[8.5px] tracking-[0.11em] uppercase"
          style={{ borderBottom: `1px solid ${APP.hairline}`, color: APP.mistDim }}
          aria-hidden
        >
          <span style={{ color: APP.azure }}>Overview</span>
          <span>Itinerary</span>
          <span>Inclusions</span>
          <span>Reviews</span>
          <span>FAQ</span>
        </div>

        <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
          {/* ---- Departures --------------------------------------------- */}
          <SectionFrame
            id={SECTION.departures}
            label="Departures"
            selected={selected}
            onSelect={onSelect}
          >
            <Card>
              <Label>Next available departures</Label>
              <div className="mt-2.5">
                <PreviewNote>
                  Departure dates, prices and seats are not drawn here — they come from this trip's
                  departure schedule, not from the text on this page. Open Departures to see and
                  change them.
                </PreviewNote>
              </div>
            </Card>
          </SectionFrame>

          {/* ---- Itinerary ---------------------------------------------- */}
          <SectionFrame
            id={SECTION.itinerary}
            label="Itinerary"
            selected={selected}
            onSelect={onSelect}
          >
            <Card>
              <Label>Itinerary</Label>
              <div className="mt-3">
                {d.itinerary.length === 0 ? (
                  <NotPublished what="a day-by-day itinerary" kind={d.kind} />
                ) : (
                  <ol className="space-y-0">
                    {d.itinerary.map((day, i) => (
                      <li key={`${day.day}-${day.title}`} className="flex gap-3">
                        <span className="flex flex-col items-center">
                          <span
                            className="mt-1 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-pill"
                            style={{ border: `1px solid ${APP.azureLine}` }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-pill"
                              style={{ background: APP.azure }}
                            />
                          </span>
                          {i < d.itinerary.length - 1 && (
                            <span className="w-px flex-1" style={{ background: APP.azureSoft }} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 pb-3.5">
                          <span className="tnum block text-[9px] tracking-[0.12em] uppercase" style={{ color: APP.mistDim }}>
                            Day {day.day}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] leading-snug" style={{ color: APP.snow }}>
                            {day.title}
                          </span>
                          {day.detail.trim() !== "" && (
                            <span className="mt-0.5 block text-[10.5px] leading-relaxed" style={{ color: APP.mist }}>
                              {day.detail}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </Card>
          </SectionFrame>

          {/* ---- What the price includes -------------------------------- */}
          <SectionFrame
            id={SECTION.included}
            label="What's included"
            selected={selected}
            onSelect={onSelect}
          >
            <Card>
              <Label>What the price includes</Label>
              <div className="mt-2.5 flex flex-col gap-3">
                {!hasIncluded ? (
                  <NotPublished what="a breakdown of what the price covers" kind={d.kind} />
                ) : (
                  <>
                    {d.inclusions.length > 0 ? (
                      <ul className="flex flex-col gap-1.5">
                        {d.inclusions.map((x) => (
                          <li key={x} className="flex items-start gap-2 text-[11px] leading-snug" style={{ color: APP.mist }}>
                            <Check size={11} strokeWidth={2.2} className="mt-0.5 shrink-0" style={{ color: APP.azure }} aria-hidden />
                            {x}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[10.5px]" style={{ color: APP.mistDim }}>
                        Nothing listed as included yet.
                      </p>
                    )}

                    <div style={{ borderTop: `1px solid ${APP.hairline}` }} className="pt-2.5">
                      <Label>Not included</Label>
                      {d.exclusions.length > 0 ? (
                        <ul className="mt-2 flex flex-col gap-1.5">
                          {d.exclusions.map((x) => (
                            <li key={x} className="flex items-start gap-2 text-[11px] leading-snug" style={{ color: APP.mist }}>
                              <X size={11} strokeWidth={2.2} className="mt-0.5 shrink-0" style={{ color: APP.mistDim }} aria-hidden />
                              {x}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-[10.5px]" style={{ color: APP.mistDim }}>
                          Nothing listed as excluded yet.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
              {/*
                The app carries this line under the inclusions and it is the
                whole reason the section matters commercially. It is app copy,
                not the operator's, and it renders whether the list is full or
                empty.
              */}
              <p
                className="mt-3 pt-2.5 text-[9.5px] leading-relaxed"
                style={{ borderTop: `1px solid ${APP.hairline}`, color: APP.mistDim }}
              >
                What a quote covers is where operators differ most. Get this list back from them in
                writing before any money moves.
              </p>
            </Card>
          </SectionFrame>

          {/* ---- Equipment ---------------------------------------------- */}
          <SectionFrame
            id={SECTION.equipment}
            label="Equipment"
            selected={selected}
            onSelect={onSelect}
          >
            <Card>
              <Label>Equipment</Label>
              <div className="mt-2.5">
                {d.equipment.length === 0 ? (
                  <NotPublished what="an equipment list" kind={d.kind} />
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {d.equipment.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[11px] leading-snug" style={{ color: APP.mist }}>
                        <span
                          className="mt-[6px] h-1 w-1 shrink-0 rounded-pill"
                          style={{ background: APP.azure }}
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </SectionFrame>

          {/* ---- FAQ ----------------------------------------------------- */}
          <SectionFrame id={SECTION.faq} label="FAQ" selected={selected} onSelect={onSelect}>
            <Card>
              <Label>Common questions</Label>
              <div className="mt-2.5">
                {d.faq.length === 0 ? (
                  <NotPublished what="answers to common questions" kind={d.kind} />
                ) : (
                  <dl className="flex flex-col gap-2.5">
                    {d.faq.map((f) => (
                      <div key={f.q}>
                        <dt className="text-[11.5px] leading-snug" style={{ color: APP.snow }}>
                          {f.q}
                        </dt>
                        <dd className="mt-0.5 text-[10.5px] leading-relaxed" style={{ color: APP.mist }}>
                          {f.a}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </Card>
          </SectionFrame>

          {/* ---- Reviews ------------------------------------------------- */}
          <SectionFrame
            id={SECTION.reviews}
            label="Reviews"
            selected={selected}
            onSelect={onSelect}
          >
            <Card>
              <Label>Reviews</Label>
              {/*
                The app's own answer, verbatim in substance: reviews are the
                company's, not this trip's, and ICEFALL has none of its own
                because it runs no bookings. Not the operator's to write, so the
                preview does not offer a gap to fill.
              */}
              <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: APP.mist }}>
                Reviews for this {d.kind} live on your company profile. ICEFALL collects none of its
                own — it runs no bookings, so it has no customers to hear from.
              </p>
              <div className="mt-2.5">
                <PreviewNote>Not yours to set, and not part of this draft.</PreviewNote>
              </div>
            </Card>
          </SectionFrame>

          {/* ---- Documents ----------------------------------------------- */}
          <SectionFrame
            id={SECTION.documents}
            label="Documents"
            selected={selected}
            onSelect={onSelect}
          >
            <Card>
              <Label>Documents &amp; resources</Label>
              <p
                className="mt-2.5 flex items-center gap-2 text-[11px]"
                style={{ color: APP.mistDim }}
              >
                <FileText size={12} strokeWidth={1.7} aria-hidden />
                Not published for this listing yet.
              </p>
            </Card>
          </SectionFrame>

          {/* ---- Run by --------------------------------------------------- */}
          {/*
            The same mark as the hero, from the same component. This card used
            to draw the generic mountain glyph too — two placeholders on one
            page, both standing in for an identity neither of them had.
          */}
          <div
            className="mt-1 flex items-center gap-3 rounded-card p-3"
            style={CARD}
            aria-hidden
          >
            <CompanyMark name={d.companyName.trim()} logoUrl={d.companyLogoUrl} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block text-[9px] tracking-[0.12em] uppercase" style={{ color: APP.mistDim }}>
                Run by
              </span>
              <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: APP.snow }}>
                {d.companyName.trim() || "Your company profile"}
              </span>
            </span>
            <ChevronRight size={13} strokeWidth={1.8} style={{ color: APP.mistDim }} />
          </div>
        </div>

        {/* ---- The two pinned actions. App chrome, not the operator's. ---- */}
        <div
          className="flex gap-2 px-4 pt-2.5 pb-5"
          style={{ borderTop: `1px solid ${APP.hairline}`, background: APP.obsidian }}
          aria-hidden
        >
          <span
            className="flex flex-1 items-center justify-center gap-1.5 rounded-pill py-2.5 text-[11px]"
            style={{ border: `1px solid ${APP.hairline}`, color: APP.snow }}
          >
            <MessageSquare size={12} strokeWidth={1.8} />
            Contact
          </span>
          <span
            className="flex flex-1 items-center justify-center gap-1.5 rounded-pill py-2.5 text-[11px] font-medium"
            style={{ background: APP.azure, color: APP.obsidian }}
          >
            <CalendarDays size={12} strokeWidth={1.8} />
            Availability
          </span>
        </div>
      </div>
    </div>
  );
}
