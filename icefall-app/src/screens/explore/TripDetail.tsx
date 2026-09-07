import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  Bed,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock,
  Heart,
  MapPin,
  MessageSquare,
  Mountain as MountainIcon,
  Salad,
  Share2,
  Shield,
  Star,
  TriangleAlert,
  Users,
  Wind,
} from "lucide-react";
import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { CompanyMark } from "@/components/domain/CompanyMark";
import { Rise, Screen, Stagger, TABBAR_STICKY_BOTTOM } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import { fmtElevation, fmtPrice } from "@/lib/format";
import {
  DEMO_NOTICE,
  SHOW_DEMO_OPERATORS,
  operatorById,
  type Operator,
  type Trip,
} from "@/services/operators";

/**
 * One expedition a company runs — reached from its profile.
 *
 * ── EVERYTHING ON THIS PAGE IS INVENTED ─────────────────────────────────────
 *
 * The price, the guide ratio, the itinerary, what the price includes, the
 * reviews and the departure dates are all written by ICEFALL, and the company
 * whose name sits above them is a real business. This is the single most
 * dangerous page in the app to get wrong: it is a product page for a commercial
 * expedition, and someone reading it is deciding where to send tens of
 * thousands of pounds and eight weeks of their life.
 *
 * So the whole screen is behind `SHOW_DEMO_OPERATORS`, which an ordinary
 * production build resolves to false — a shipped build cannot reach this route
 * with content, and says so instead.
 *
 * ── THE DEPARTURES, SPECIFICALLY ────────────────────────────────────────────
 *
 * "5 spots left" is two problems at once: a number nobody counted, and a
 * scarcity cue whose entire purpose is to hurry a decision. Hurrying this
 * particular decision is how people end up on 8,000 m mountains with operators
 * they did not check. It renders behind the gate, it carries the notice, and a
 * real one must come from the operator's own booking system or not exist.
 *
 * ── DELIBERATELY ABSENT ─────────────────────────────────────────────────────
 *
 * The design has two video cards — a "Watch Trailer" chip in the hero and an
 * "Expedition Trailer" panel below. There is no footage. A play button that
 * plays nothing is a promise the page cannot keep, so neither is drawn.
 *
 * "Check Availability" is not a booking. ICEFALL takes no payment and holds no
 * dates; it opens the same enquiry draft as everywhere else, and the button
 * beneath it says so rather than implying a reservation was made.
 */

const TABS = ["Overview", "Itinerary", "Inclusions", "Reviews", "FAQ"] as const;
type TabId = (typeof TABS)[number];

/** "Everest Expedition (8,848 m)" -> "Everest Expedition". */
function stripHeight(name: string): string {
  return name.replace(/\s*\(\s*[\d,\.]+\s*m\s*\)\s*$/i, "").trim();
}

/** Fixed icon cycle — the model carries labels, not icons. */
const INCLUSION_ICONS = [ClipboardList, Users, Bed, Salad, Wind, Shield];

export default function TripDetail() {
  const { id, tripId } = useParams<{ id: string; tripId: string }>();
  const [params] = useSearchParams();

  const operator = id !== undefined ? operatorById(id) : undefined;
  const trip = operator?.trips?.find((t) => t.id === tripId);

  if (operator === undefined || trip === undefined || !SHOW_DEMO_OPERATORS) {
    return <NoTrip />;
  }
  return <Detail operator={operator} trip={trip} country={params.get("country") ?? undefined} />;
}

function Detail({ operator, trip, country }: { operator: Operator; trip: Trip; country?: string }) {
  const [tab, setTab] = useState<TabId>("Overview");

  const enquiry = `/inbox/new?${new URLSearchParams({
    operator: operator.id,
    peak: trip.peakName ?? trip.name,
    ...(trip.elevationM !== undefined ? { elevation: String(trip.elevationM) } : {}),
  }).toString()}`;

  const profile = `/operator/${operator.id}?${new URLSearchParams({
    peak: trip.peakName ?? trip.name,
    ...(trip.elevationM !== undefined ? { elevation: String(trip.elevationM) } : {}),
    ...(country !== undefined ? { country } : {}),
  }).toString()}`;

  return (
    <Screen padded={false}>
      {/* ---- Hero -------------------------------------------------------- */}
      <div className="relative">
        <div className="absolute inset-0">
          <img
            src={trip.photo}
            alt=""
            aria-hidden
            className="h-full w-full object-cover object-[60%_35%] opacity-[0.75]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-obsidian via-obsidian/75 to-obsidian/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/40 to-transparent" />
        </div>

        <div className="relative px-5" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <div className="flex items-center pb-6 pt-4">
            <button
              type="button"
              onClick={() => window.history.back()}
              aria-label="Back"
              className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-snow transition-colors hover:bg-white/[0.06]"
            >
              <ChevronRight size={20} strokeWidth={1.8} className="rotate-180" />
            </button>
            <span className="ml-auto flex items-center gap-1">
              {/* Saving and sharing need a backend and a share sheet. Inert
                  rather than wired to nothing that reports back. */}
              <span aria-hidden className="grid h-9 w-9 place-items-center text-mist-dim/70">
                <Heart size={18} strokeWidth={1.6} />
              </span>
              <span aria-hidden className="grid h-9 w-9 place-items-center text-mist-dim/70">
                <Share2 size={18} strokeWidth={1.6} />
              </span>
            </span>
          </div>

          {trip.badge !== undefined && (
            <span className="inline-flex rounded-[7px] border border-azure/45 bg-azure/10 px-2.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.14em] text-azure-bright">
              {trip.badge === "premium"
                ? "Premium expedition"
                : trip.badge === "best-value"
                  ? "Best value"
                  : "Popular"}
            </span>
          )}

          {/*
            The height sits UNDER the name, not inside it.
            "Everest Expedition (8,848 m)" wrapped the bracketed figure onto its
            own line anyway, so the title read as two ragged lines with a stray
            "(8,848 m)" hanging off the bottom. Splitting it deliberately gives
            the name one clean line and turns the height into the subtitle it
            always was.
          */}
          <h1 className="mt-3 text-[26px] font-light leading-[1.15] tracking-[-0.02em] text-snow">
            {stripHeight(trip.name)}
          </h1>
          {trip.elevationM !== undefined && (
            <p className="tnum mt-1.5 text-[15px] font-light text-mist">
              {fmtElevation(trip.elevationM)} m
            </p>
          )}

          {trip.region !== undefined && (
            <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-mist">
              <MapPin size={12} strokeWidth={1.8} className="shrink-0 text-azure" />
              {trip.region}
            </p>
          )}

          <p className="mt-2 flex items-center gap-1.5">
            <Star size={13} strokeWidth={0} fill="currentColor" className="text-azure" />
            <span className="tnum text-[13px] text-snow">{trip.rating.toFixed(1)}</span>
            <span className="tnum text-[11.5px] text-mist-dim">({trip.reviewCount} reviews)</span>
          </p>

          <div className="mt-5 flex items-stretch gap-1 pb-5">
            <HeroStat icon={Clock} value={`${trip.days} days`} label="Duration" />
            {trip.elevationM !== undefined && (
              <HeroStat
                icon={MountainIcon}
                value={`${fmtElevation(trip.elevationM)} m`}
                label="Summit"
              />
            )}
            {trip.difficultyLabel !== undefined && (
              <HeroStat icon={BarChart3} value={trip.difficultyLabel} label="Difficulty" />
            )}
            {trip.guideRatio !== undefined && (
              <HeroStat icon={Users} value={trip.guideRatio} label="Guide ratio" />
            )}
          </div>
        </div>
      </div>

      <Stagger className="px-5 pb-28">
        {/* ---- Price band ------------------------------------------------ */}
        <Rise>
          <Card>
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-mist-dim">From</p>
                <p className="tnum mt-0.5 text-[21px] font-light leading-none text-snow">
                  {fmtPrice(trip.priceFromEur)}
                </p>
                <p className="mt-1 text-[11px] text-mist-dim">Per person</p>
              </div>
              {trip.bestSeason !== undefined && (
                <div className="min-w-0 flex-1 border-l border-hairline pl-4">
                  <p className="text-[11px] text-mist-dim">Best season</p>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-snow">{trip.bestSeason}</p>
                </div>
              )}
            </div>
            <Button asChild className="mt-4 w-full">
              <Link to={enquiry}>
                <CalendarDays size={15} strokeWidth={1.8} />
                Check availability
              </Link>
            </Button>
            <p className="mt-2.5 text-[10.5px] leading-relaxed text-mist-dim">
              Opens an enquiry draft. ICEFALL takes no payment, holds no dates and reserves nothing
              — availability comes from the operator.
            </p>
          </Card>
        </Rise>

        <Rise className="pt-4">
          <Disclaimer>{DEMO_NOTICE}</Disclaimer>
        </Rise>

        {/* ---- Tabs ------------------------------------------------------ */}
        <Rise className="no-scrollbar -mx-5 mt-5 flex gap-7 overflow-x-auto border-b border-hairline px-5">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={t === tab}
              className={cn(
                "shrink-0 border-b-2 pb-2.5 text-[12px] uppercase tracking-[0.1em] transition-colors",
                t === tab
                  ? "border-azure text-azure"
                  : "border-transparent text-mist-dim hover:text-mist",
              )}
            >
              {t}
            </button>
          ))}
        </Rise>

        {tab === "Overview" && (
          <>
            {trip.about !== undefined && (
              <Rise className="pt-6">
                <Card>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-mist-dim">
                    About this expedition
                  </p>
                  <p className="mt-3 text-[13px] leading-relaxed text-mist">{trip.about}</p>
                </Card>
              </Rise>
            )}

            {trip.inclusions !== undefined && (
              <Rise className="pt-4">
                <Card>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-mist-dim">
                    Price includes
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {trip.inclusions.map((inc, i) => {
                      const Icon = INCLUSION_ICONS[i % INCLUSION_ICONS.length]!;
                      return (
                        <div key={inc.label} className="text-center">
                          <Icon size={19} strokeWidth={1.5} className="mx-auto text-azure" />
                          <p className="mt-2 text-[12px] leading-tight text-snow">{inc.label}</p>
                          <p className="mt-1 text-[10px] leading-tight text-mist-dim">
                            {inc.detail}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-4 border-t border-hairline pt-3 text-[10.5px] leading-relaxed text-mist-dim">
                    What a quote covers is where operators differ most. Get this list back from them
                    in writing before any money moves.
                  </p>
                </Card>
              </Rise>
            )}

            {trip.highlights !== undefined && (
              <Rise className="pt-4">
                <Card>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-mist-dim">
                    Expedition highlights
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    {trip.highlights.map((h) => (
                      <li key={h} className="flex gap-3 text-[12.5px] leading-relaxed text-mist">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Rise>
            )}

            {/* What a quote leaves out is the half people get caught by, so it
                sits on the overview rather than buried under a tab. */}
            {trip.excluded !== undefined && (
              <Rise className="pt-4">
                <Card>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-mist-dim">
                    Not included
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    {trip.excluded.map((x) => (
                      <li key={x} className="flex gap-3 text-[12.5px] leading-relaxed text-mist">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-mist-dim" />
                        {x}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Rise>
            )}

            <ItineraryCard trip={trip} onFull={() => setTab("Itinerary")} compact />
            <Departures trip={trip} enquiry={enquiry} />
          </>
        )}

        {tab === "Itinerary" && <ItineraryCard trip={trip} />}

        {tab === "Inclusions" && (
          <Rise className="pt-6">
            <Card>
              <p className="text-[11px] uppercase tracking-[0.14em] text-mist-dim">
                What the price includes
              </p>
              <ul className="mt-3 divide-y divide-hairline">
                {(trip.inclusions ?? []).map((inc, i) => {
                  const Icon = INCLUSION_ICONS[i % INCLUSION_ICONS.length]!;
                  return (
                    <li key={inc.label} className="flex items-center gap-3.5 py-3">
                      <Icon size={18} strokeWidth={1.5} className="shrink-0 text-azure" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] text-snow">{inc.label}</span>
                        <span className="mt-0.5 block text-[11.5px] text-mist-dim">
                          {inc.detail}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {trip.excluded !== undefined && (
                <>
                  <p className="mt-5 border-t border-hairline pt-4 text-[11px] uppercase tracking-[0.14em] text-mist-dim">
                    Not included
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    {trip.excluded.map((x) => (
                      <li key={x} className="flex gap-3 text-[12.5px] leading-relaxed text-mist">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-mist-dim" />
                        {x}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </Rise>
        )}

        {tab === "Reviews" && (
          <Rise className="pt-6">
            <Card>
              <p className="text-[13px] leading-relaxed text-mist">
                Reviews for this expedition live on the company's profile. ICEFALL collects none of
                its own — it runs no bookings, so it has no customers to hear from.
              </p>
              <Button asChild variant="secondary" className="mt-4 w-full">
                <Link to={profile}>
                  {operator.name}
                  <ChevronRight size={15} strokeWidth={1.8} />
                </Link>
              </Button>
            </Card>
          </Rise>
        )}

        {tab === "FAQ" && (
          <div className="space-y-2.5 pt-6">
            {(trip.faq ?? []).map((f) => (
              <Rise key={f.q}>
                <Card>
                  <p className="text-[13px] text-snow">{f.q}</p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">{f.a}</p>
                </Card>
              </Rise>
            ))}
          </div>
        )}

        {/* ---- Run by ----------------------------------------------------- */}
        <Rise className="pt-8">
          <SectionLabel>Run by</SectionLabel>
          <Link
            to={profile}
            className="mt-3 flex items-center gap-3.5 rounded-card border border-hairline bg-graphite p-3.5 transition-colors hover:border-hairline-strong"
          >
            {/* THE GENERIC MOUNTAIN GLYPH CAME OUT OF HERE. Every company got
                the same picture, so the mark carried no identity — two
                operators in a list were distinguishable only by reading the
                name. Initials are not a decoration standing in for a logo; for
                a company that has not uploaded a mark they ARE the mark, and
                that is the normal case rather than a missing asset. */}
            <CompanyMark name={operator.name} logoPath={operator.logo} size={44} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-snow">{operator.name}</span>
              <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">
                {operator.certification}
              </span>
            </span>
            <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
          </Link>
        </Rise>
      </Stagger>

      {/* ---- The two actions, pinned ------------------------------------- */}
      <div
        className="sticky border-t border-hairline bg-obsidian/95 px-5 pb-3 pt-3 backdrop-blur"
        /* Rests just above the floating tab bar, not under it. */
        style={{ bottom: TABBAR_STICKY_BOTTOM }}
      >
        <div className="flex gap-2.5">
          <Button asChild variant="secondary" className="h-11 flex-1">
            <Link to={enquiry}>
              <MessageSquare size={14} strokeWidth={1.8} />
              Contact company
            </Link>
          </Button>
          <Button asChild className="h-11 flex-1">
            <Link to={enquiry}>
              <CalendarDays size={14} strokeWidth={1.8} />
              Check availability
            </Link>
          </Button>
        </div>
      </div>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function HeroStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Clock;
  value: string;
  label: string;
}) {
  return (
    <div className="min-w-0 flex-1 border-r border-hairline px-1 last:border-r-0">
      <Icon size={15} strokeWidth={1.6} className="text-azure" />
      <p className="tnum mt-1.5 truncate text-[13px] leading-none text-snow">{value}</p>
      <p className="mt-1.5 truncate text-[9.5px] leading-tight text-mist-dim">{label}</p>
    </div>
  );
}

function ItineraryCard({
  trip,
  compact = false,
  onFull,
}: {
  trip: Trip;
  compact?: boolean;
  onFull?: () => void;
}) {
  const stages = trip.itinerary ?? [];
  if (stages.length === 0) return null;

  return (
    <Rise className="pt-4">
      <Card>
        <p className="text-[11px] uppercase tracking-[0.14em] text-mist-dim">
          {compact ? "Itinerary overview" : "Itinerary"}
        </p>
        <ol className="mt-4 space-y-0">
          {stages.map((st, i) => (
            <li key={st.days} className="flex gap-3.5">
              <span className="flex flex-col items-center">
                <span className="mt-1 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border border-azure/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-azure" />
                </span>
                {i < stages.length - 1 && <span className="w-px flex-1 bg-azure/25" />}
              </span>
              <span className="min-w-0 flex-1 pb-4">
                <span className="tnum block text-[12px] text-snow">{st.days}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-mist">{st.label}</span>
              </span>
            </li>
          ))}
        </ol>
        {compact && onFull !== undefined && (
          <button
            type="button"
            onClick={onFull}
            className="mt-1 flex items-center gap-0.5 text-[11.5px] text-azure transition-colors hover:text-azure-bright"
          >
            View full itinerary
            <ChevronRight size={13} strokeWidth={1.9} />
          </button>
        )}
      </Card>
    </Rise>
  );
}

function Departures({ trip, enquiry }: { trip: Trip; enquiry: string }) {
  const departures = trip.departures ?? [];
  if (departures.length === 0) return null;

  return (
    <>
      <Rise className="pt-6">
        <p className="text-[11px] uppercase tracking-[0.14em] text-mist-dim">
          Next available departures
        </p>
      </Rise>
      <div className="no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5">
        {departures.map((d) => (
          <Rise key={d.id} className="w-[186px] shrink-0">
            <Link
              to={enquiry}
              className="block rounded-card border border-hairline bg-graphite p-3.5 transition-colors hover:border-azure/50"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] leading-tight text-snow">{d.date}</p>
                {d.badge !== undefined && (
                  <span className="shrink-0 rounded-[5px] bg-azure/15 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.1em] text-azure">
                    {d.badge}
                  </span>
                )}
              </div>
              <p className="tnum mt-1.5 text-[11px] text-mist-dim">
                {d.days} days · {d.spotsLeft} places listed
              </p>
              <p className="tnum mt-2.5 text-[12.5px] text-snow">{fmtPrice(d.priceFromEur)}</p>
            </Link>
          </Rise>
        ))}
      </div>
      <Rise className="pt-3">
        <p className="text-[10.5px] leading-relaxed text-mist-dim">
          Dates and places are placeholder figures for this layout — nobody counted them, and
          nothing here is held or reservable. A real departure comes from the operator's own booking
          system.
        </p>
      </Rise>
    </>
  );
}

/**
 * No such trip — or a production build, where this route carries nothing.
 *
 * A designed state rather than a redirect: the honest answer is that the page
 * exists but its contents were never real, and a shipped build says exactly
 * that instead of quietly bouncing somebody somewhere else.
 */
function NoTrip() {
  return (
    <Screen>
      <Stagger className="pt-10">
        <Rise>
          <TriangleAlert size={22} strokeWidth={1.6} className="text-azure" />
          <h1 className="mt-4 text-[19px] font-light text-snow">No such expedition</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-mist">
            ICEFALL has no operator partnerships and sells no trips, so it publishes no itineraries,
            prices or departure dates. Find a real IFMGA-certified operator and ask them directly.
          </p>
        </Rise>
        <Rise className="pt-6">
          <Button asChild variant="secondary" className="w-full">
            <Link to="/explore/expeditions">
              Back to expeditions
              <ChevronRight size={15} strokeWidth={1.8} />
            </Link>
          </Button>
        </Rise>
      </Stagger>
    </Screen>
  );
}
