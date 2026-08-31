import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Award, Check, ChevronRight, Clock, Download, FileText, Gauge, MapPin,
  MessageSquare, Mountain as MountainIcon, Play, Share2, ShieldCheck, Star, Users, X,
} from "lucide-react";
import { Badge, VerifiedTick } from "@/components/ui";
import { IS_DEMO } from "@/data/demo";
import { OFFLINE } from "@/offline/offline";
import { companyById, companySlug } from "@/data/companies";
import { tripById, type Camp, type TripDetail } from "@/data/tripDetail";
import { formatEur, STANDARD_POLICY } from "@/money/model";
import { cn } from "@/lib/utils";
import { demoNoticeFor, RealBusinessBanner } from "@/components/RealBusiness";
import { CompanyMark } from "@/components/CompanyMark";
import { peakFallback, peakImage } from "./peakPlate";

/**
 * One expedition, full width — the page a company's trip card opens onto.
 *
 * Those cards were `<article>` elements with no link on them: the company page
 * listed four trips and clicking any of them did nothing at all. This is where
 * they go.
 *
 * ON THE ACCENT — the reference design for this page is champagne gold, and it
 * is rendered here in azure. That is not a liberty: the same substitution was
 * asked for by name on the operator profile ("just make the yellow to Blue"),
 * and the app has one accent. A second one introduced on a single page would
 * read as a different product.
 */

const TABS = ["Overview", "Itinerary", "What's included", "Equipment", "Reviews", "FAQ"] as const;
type TabId = (typeof TABS)[number];

/** The notice window that actually refunds in full, read off the policy. */
const FREE_CANCEL_DAYS = STANDARD_POLICY.tiers.find((t) => t.refundPct === 100)?.daysBefore ?? 0;

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  const trip = id !== undefined ? tripById(id) : undefined;
  const [tab, setTab] = useState<TabId>("Overview");
  const [picked, setPicked] = useState(0);
  /*
   * WHICH TRIP THE READER PRESSED PLAY ON — not merely whether they did.
   *
   * A boolean here survived navigation: every trip page matches `/app/trip/:id`,
   * so React keeps this component mounted and only swaps the param. Press play
   * on one expedition, open another, and its film started on its own — a
   * request to Google that nobody made, which is exactly what click-to-play
   * exists to prevent. Storing the id makes the flag false again the moment the
   * trip changes, with no effect to keep in sync.
   */
  const [playRequestedFor, setPlayRequestedFor] = useState<string | null>(null);

  const askedForVideo = playRequestedFor === id;

  if (trip === undefined) {
    return (
      <div className="mx-auto w-full max-w-[720px] py-16">
        <h1 className="text-[22px] font-light text-snow">No such expedition</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-mist">
          {IS_DEMO
            ? "This listing is not in the demo set."
            : "ICEFALL lists no real expeditions yet, so there is nothing at this address."}
        </p>
        <Link to="/app/explore" className="mt-5 inline-block text-[12.5px] text-azure hover:text-azure-bright">
          Back to Explore
        </Link>
      </div>
    );
  }

  const company = companyById(companySlug(trip.company));
  const departure = trip.departures[picked] ?? trip.departures[0];

  return (
    <div className="pb-16">
      <Crumbs trip={trip} />

      {/* A real operator's page says so BEFORE the price and the book button. */}
      <div className="mt-3 empty:mt-0">
        <RealBusinessBanner company={company} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_352px]">
        <div className="min-w-0">
          <Hero
            trip={trip}
            company={company}
            askedForVideo={askedForVideo}
            onVideo={() => setPlayRequestedFor(id ?? null)}
          />

          <nav className="mt-6 flex gap-7 overflow-x-auto border-b border-hairline">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "-mb-px shrink-0 border-b-2 pb-3 text-[11px] font-medium uppercase tracking-[0.13em] transition-colors",
                  tab === t
                    ? "border-azure text-azure"
                    : "border-transparent text-mist-dim hover:text-mist",
                )}
              >
                {t}
              </button>
            ))}
          </nav>

          {tab === "Overview" && <Overview trip={trip} company={company} />}
          {tab === "Itinerary" && <Itinerary trip={trip} />}
          {tab === "What's included" && <Included trip={trip} />}
          {tab === "Equipment" && <Equipment trip={trip} />}
          {tab === "Reviews" && <Reviews company={company} />}
          {tab === "FAQ" && <Faq trip={trip} />}
        </div>

        <BookingRail trip={trip} picked={picked} onPick={setPicked} departure={departure} />
      </div>

      {IS_DEMO && (
        <p className="mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-mist-dim">
          {demoNoticeFor(company)} Departure availability, prices and reviews on this page are demo
          data.
        </p>
      )}
    </div>
  );
}

function Crumbs({ trip }: { trip: TripDetail }) {
  const crumb = "text-[10.5px] uppercase tracking-[0.13em]";
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5">
      <Link to="/app/explore" className={cn(crumb, "text-mist-dim hover:text-mist")}>Explore</Link>
      <ChevronRight size={11} className="text-mist-dim" />
      <Link to="/app/explore" className={cn(crumb, "text-mist-dim hover:text-mist")}>Expeditions</Link>
      <ChevronRight size={11} className="text-mist-dim" />
      <Link to={`/app/company/${companySlug(trip.company)}`} className={cn(crumb, "text-azure hover:text-azure-bright")}>
        {trip.company}
      </Link>
      <ChevronRight size={11} className="text-mist-dim" />
      <span className={cn(crumb, "text-snow")}>{trip.peak}</span>
    </nav>
  );
}

function Hero({
  trip, company, askedForVideo, onVideo,
}: {
  trip: TripDetail;
  company: ReturnType<typeof companyById>;
  askedForVideo: boolean;
  onVideo: () => void;
}) {
  const gallery = company?.gallery ?? [];
  // One flag, two meanings: pressed play. Whether that starts a film or
  // explains that there isn't one depends on the listing.
  /*
   * OFFLINE DEMO: the player never mounts. The film is served by
   * youtube-nocookie.com, so offline the iframe would replace the hero
   * photograph with a browser network-error frame inside the card — the one
   * failure state this page has no branch for. The click still gets an answer;
   * see the note under the play control.
   */
  const playing = !OFFLINE && askedForVideo && trip.videoId !== null;
  return (
    <section className="overflow-hidden rounded-card border border-hairline bg-graphite">
      <div className="relative aspect-[16/8]">
        {playing && trip.videoId !== null ? (
          /*
           * youtube-nocookie.com, and mounted ONLY after a click.
           *
           * Rendering the iframe up front would contact Google — and set its
           * cookies — for every reader who opens the page, including everyone
           * who never watches. The privacy-enhanced host and the click gate
           * together mean a third party enters this page when the reader asks
           * it to and not before.
           */
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${trip.videoId}?autoplay=1&rel=0&modestbranding=1`}
            title={`${trip.peak} expedition film`}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0 bg-obsidian"
          />
        ) : (
        <>
        <img
          src={peakImage(trip.heroPeak)}
          alt=""
          aria-hidden
          onError={(ev) => {
            const el = ev.currentTarget;
            if (!el.dataset.fellBack) {
              el.dataset.fellBack = "1";
              el.src = peakFallback(trip.heroPeak);
            }
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 scrim-hero" />

        {/*
          A "PREMIUM EXPEDITION" ribbon used to sit here, hardcoded, on every
          trip page in the catalogue — so it distinguished nothing while
          asserting a tier ICEFALL does not sell. It went the same way as
          "Most popular" and "Best value" on the company page: a superlative
          with nothing behind it. See the note above `BADGES` in `Company.tsx`
          for the rule these were judged against, and note that "Featured"
          survived it because placement is a real commercial arrangement.
        */}

        {/*
          The hero is not always a photograph of the mountain in the title.
          `e-ama` is an Ama Dablam expedition carrying `heroPeak: "everest"`,
          because there is no Ama Dablam photograph in `public/img` — so this
          page would otherwise illustrate one 6,812 m peak with a picture of a
          different 8,848 m one and say nothing. Naming what the photograph
          actually shows costs a line and keeps the page from lying quietly.
        */}
        {!trip.heroIsThisPeak && (
          <span className="absolute right-6 top-6 rounded-pill bg-obsidian/75 px-3 py-1 text-[10px] text-mist backdrop-blur">
            Photograph: {peakLabel(trip.heroPeak)}, not {trip.peak}
          </span>
        )}

        <div className="absolute bottom-6 left-6 right-6">
          <div className="flex items-center gap-2.5">
            {/*
              The operator's own mark, not a generic mountain.

              This was a `MountainIcon` — the same glyph beside every company on
              every trip page, which told a reader nothing and made four
              operators look like one. `Company.tsx` and `Explore.tsx` already
              showed the company here; this page had simply never been brought
              across. A real business shows initials rather than a logo, and that
              is the finished rendering — see `CompanyMark`.
            */}
            <CompanyMark
              name={trip.company}
              logo={companyById(companySlug(trip.company))?.logo}
              size={26}
              variant="card"
              decorative
            />
            <Link
              to={`/app/company/${companySlug(trip.company)}`}
              className="text-[12px] font-medium uppercase tracking-[0.12em] text-snow hover:text-azure-bright"
            >
              {trip.company}
            </Link>
            <VerifiedTick verifiedOn={trip.verifiedOn} size={14} />
          </div>

          <h1 className="mt-2 text-[34px] font-light leading-none tracking-tight text-snow">
            {trip.peak}
            {trip.route && <span className="text-mist"> — {trip.route}</span>}
          </h1>

          {/*
            The altitude sits on the same line as the place and the duration
            rather than on a line of its own beneath the title, which is what
            the phone app was told to change: "add the meters under the name it
            looks ugly like that".
          */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-mist">
            <span className="tnum text-snow">{trip.summitM.toLocaleString()} m</span>
            <span className="flex items-center gap-1.5">
              <MapPin size={12} strokeWidth={1.9} />
              {trip.country}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={12} strokeWidth={1.9} />
              {trip.durationDays} days
            </span>
            <span className="flex items-center gap-1.5">
              <Gauge size={12} strokeWidth={1.9} />
              {trip.difficulty}
            </span>
            {/*
              A RATING ONLY WHERE REVIEWS BACK IT.
              This printed "0.0 (0 reviews)" for Elite Exped — a REAL company
              whose invented figures were deliberately zeroed. Zero reads as
              "rated zero", which is worse than no rating and worse than the
              invented one it replaced. The company page already guarded this;
              this page did not, and nothing linked the two.
            */}
            {company && company.reviewCount > 0 && (
              <span className="flex items-center gap-1.5">
                <Star size={12} className="fill-azure text-azure" strokeWidth={1.9} />
                <span className="tnum text-snow">{company.rating.toFixed(1)}</span>
                <span className="text-mist-dim">({company.reviewCount} reviews)</span>
              </span>
            )}
          </div>
        </div>

        {/*
          The play control.

          Two behaviours, because there are two truths. Where the operator has
          published a film, pressing play swaps the hero for the player. Where
          it has not — which is most of them — it says so rather than swallowing
          the click, because a control that does nothing is worse than one that
          explains itself.
        */}
        <button
          type="button"
          onClick={onVideo}
          aria-label={trip.videoId ? `Play the ${trip.peak} expedition film` : "Expedition video"}
          className="group absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-pill border border-snow/25 bg-obsidian/45 backdrop-blur transition-colors hover:border-azure/60"
        >
          <Play size={20} className="ml-0.5 text-snow/80 group-hover:text-snow" strokeWidth={1.6} />
        </button>
        {askedForVideo && (OFFLINE || trip.videoId === null) && (
          <p className="absolute left-1/2 top-[calc(50%+52px)] -translate-x-1/2 whitespace-nowrap rounded-pill bg-obsidian/85 px-3 py-1.5 text-[11px] text-mist backdrop-blur">
            {/*
              Two absences, and they are not the same absence — one is "the
              operator published no film", the other is "there is no connection
              to fetch one over". Offline, saying the first would be inventing a
              fact about the listing.
            */}
            {OFFLINE
              ? "The expedition film needs a connection."
              : "No video has been published for this expedition."}
          </p>
        )}
        </>
        )}
      </div>

      {gallery.length > 0 && (
        <div className="flex items-center gap-3 px-6 py-4">
          <div className="flex gap-2.5">
            {gallery.slice(0, 4).map((src) => (
              <img
                key={src}
                src={src}
                alt=""
                aria-hidden
                loading="lazy"
                className="h-14 w-20 rounded-tile border border-hairline object-cover"
              />
            ))}
          </div>
          {/*
            Named for what it is. These are the OPERATOR's photographs of the
            mountains they work on — the Matterhorn and Denali among them — not
            four more views of the peak in the title. Passing them off as this
            expedition is the same wrong-mountain problem the phone app removed
            its stand-in photographs to end.
          */}
          <p className="text-[11px] leading-snug text-mist-dim">
            From {trip.company}&rsquo;s gallery —<br />not all of this expedition
          </p>
        </div>
      )}
    </section>
  );
}

function Overview({ trip, company }: { trip: TripDetail; company: ReturnType<typeof companyById> }) {
  const NP = "Not published";
  const stats = company
    ? [
        // Zero means "not published", never "zero" — see the note on the hero.
        { icon: MountainIcon, value: company.expeditionCount > 0 ? `${company.expeditionCount}+` : NP, label: "Expeditions run" },
        { icon: Award, value: company.summiteerCount > 0 ? company.summiteerCount.toLocaleString() : NP, label: "Summiteers" },
        { icon: Clock, value: company.yearsExperience > 0 ? `${company.yearsExperience}+ years` : NP, label: "Operating" },
        { icon: ShieldCheck, value: "24/7", label: "Expedition support" },
      ]
    : [];

  return (
    <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <p className="section-label">About this expedition</p>
        <p className="mt-3 max-w-[62ch] text-[13.5px] leading-relaxed text-mist">{trip.about}</p>

        {stats.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex items-start gap-2.5">
                <s.icon size={17} className="mt-0.5 shrink-0 text-azure" strokeWidth={1.6} />
                <span>
                  <span className={cn("tnum block leading-tight", s.value === NP ? "text-[11.5px] text-mist-dim" : "text-[15px] text-snow")}>{s.value}</span>
                  <span className="mt-0.5 block text-[10.5px] leading-snug text-mist-dim">{s.label}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {trip.highlights.length > 0 && (
          <p className="section-label mt-8">Expedition highlights</p>
        )}
        <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {trip.highlights.map((h) => (
            <li key={h} className="flex items-start gap-2 text-[12.5px] leading-snug text-mist">
              <Check size={13} className="mt-0.5 shrink-0 text-azure" strokeWidth={2.2} />
              {h}
            </li>
          ))}
        </ul>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <WhyCard trip={trip} />
          <Documents />
        </div>
      </div>

      <div className="space-y-4">
        <ElevationCard trip={trip} />
        <div className="rounded-card border border-hairline bg-graphite p-5">
          <p className="section-label">Who this is for</p>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{trip.requires}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The elevation profile.
 *
 * A CHART OF REAL NUMBERS. Each point is a published camp altitude on the
 * standard route, so the shape of the line is the shape of the ascent. The
 * horizontal axis is camp order and is deliberately unlabelled — no distance
 * between camps is claimed, because none is known here.
 */
function ElevationCard({ trip }: { trip: TripDetail }) {
  const camps = trip.camps;
  const path = useMemo(() => profilePath(camps), [camps]);

  if (!camps.length || !path) return null;

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-graphite">
      <div className="px-5 pt-5">
        <p className="section-label">Ascent profile</p>
      </div>

      <svg viewBox="0 0 340 168" className="mt-2 w-full" role="img" aria-label={`Camp altitudes on ${trip.peak}`}>
        <defs>
          <linearGradient id={`fill-${trip.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ice-azure)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--ice-azure)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={path.area} fill={`url(#fill-${trip.id})`} />
        <path d={path.line} fill="none" stroke="var(--ice-azure)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {path.points.map((p, i) => (
          <g key={camps[i].name}>
            <circle cx={p[0]} cy={p[1]} r={i === camps.length - 1 ? 4 : 2.8}
              fill={i === camps.length - 1 ? "var(--ice-snow)" : "var(--ice-obsidian)"}
              stroke="var(--ice-azure)" strokeWidth="1.6" />
          </g>
        ))}
      </svg>

      <ul className="border-t border-hairline">
        {camps.map((c) => (
          <li key={c.name} className="flex items-baseline justify-between px-5 py-1.5 text-[11.5px]">
            <span className="text-mist">{c.name}</span>
            <span className="tnum text-snow">{c.altitudeM.toLocaleString()} m</span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-3 border-t border-hairline">
        {[
          ["Max altitude", `${trip.summitM.toLocaleString()} m`],
          ["Duration", `${trip.durationDays} days`],
          ["Difficulty", trip.difficulty],
        ].map(([k, v], i) => (
          <div key={k} className={cn("px-4 py-3", i > 0 && "border-l border-hairline")}>
            <span className="section-label block">{k}</span>
            <span className="tnum mt-1 block text-[12.5px] text-snow">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function profilePath(camps: Camp[]) {
  if (camps.length < 2) return null;
  const W = 340, H = 168, padX = 22, padTop = 16, padBottom = 14;
  const alts = camps.map((c) => c.altitudeM);
  const lo = Math.min(...alts), hi = Math.max(...alts);
  const span = hi - lo || 1;
  const points: [number, number][] = camps.map((c, i) => [
    padX + (i / (camps.length - 1)) * (W - padX * 2),
    padTop + (1 - (c.altitudeM - lo) / span) * (H - padTop - padBottom),
  ]);
  const line = "M" + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L");
  const area = `${line}L${points[points.length - 1][0].toFixed(1)},${H}L${points[0][0].toFixed(1)},${H}Z`;
  return { line, area, points };
}

function WhyCard({ trip }: { trip: TripDetail }) {
  return (
    <div className="flex flex-col justify-between rounded-card border border-hairline bg-graphite p-5">
      <div>
        <p className="text-[14px] leading-snug text-snow">Why climb with {trip.company}?</p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
          Read what the operator publishes about its guides, its safety record and how it runs an
          expedition.
        </p>
      </div>
      <Link
        to={`/app/company/${companySlug(trip.company)}`}
        className="mt-4 inline-flex w-fit items-center gap-2 rounded-pill border border-azure/45 px-4 py-2 text-[12px] text-azure transition-colors hover:border-azure hover:text-azure-bright"
      >
        <Users size={13} strokeWidth={1.9} />
        See the operator
      </Link>
    </div>
  );
}

/**
 * Documents.
 *
 * The reference lists four downloadable PDFs. None exist, and a download link
 * that resolves to nothing is a broken promise rather than a placeholder, so
 * the rows render as the documents an operator is expected to supply and say
 * plainly that they are not published yet.
 */
function Documents() {
  const docs = ["Expedition brief", "Detailed itinerary", "Gear list", "Training guide"];
  return (
    <div className="rounded-card border border-hairline bg-graphite p-5">
      <p className="section-label">Documents &amp; resources</p>
      <ul className="mt-3 space-y-2">
        {docs.map((d) => (
          <li key={d} className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="flex items-center gap-2 text-mist-dim">
              <FileText size={13} strokeWidth={1.7} />
              {d}
            </span>
            <Download size={13} className="shrink-0 text-mist-dim/45" strokeWidth={1.7} />
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-hairline pt-2.5 text-[11px] text-mist-dim">
        Not published for this listing yet.
      </p>
    </div>
  );
}

/** What a tab says when the operator has published nothing for it. */
function NotPublished({ what }: { what: string }) {
  return (
    <p className="mt-7 max-w-[60ch] text-[13px] leading-relaxed text-mist">
      This operator has not published {what} for this expedition. Contact them directly and ask for
      it in writing before you pay a deposit.
    </p>
  );
}

function Itinerary({ trip }: { trip: TripDetail }) {
  if (!trip.itinerary.length) return <NotPublished what="a day-by-day itinerary" />;
  return (
    <ol className="mt-7 space-y-0">
      {trip.itinerary.map((d, i) => (
        <li key={d.span} className="relative flex gap-5 pb-6 last:pb-0">
          <div className="relative flex flex-col items-center">
            <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-pill border border-azure/40 bg-obsidian text-[10.5px] text-azure">
              {i + 1}
            </span>
            {i < trip.itinerary.length - 1 && <span className="mt-1 w-px flex-1 bg-hairline" />}
          </div>
          <div className="min-w-0 pt-1.5">
            <span className="section-label">{d.span}</span>
            <p className="mt-1 text-[14px] leading-snug text-snow">{d.title}</p>
            <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-mist">{d.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Included({ trip }: { trip: TripDetail }) {
  if (!trip.includes.length && !trip.excludes.length) {
    return <NotPublished what="a breakdown of what the price covers" />;
  }
  return (
    <div className="mt-7 grid gap-6 md:grid-cols-2">
      <div className="rounded-card border border-hairline bg-graphite p-5">
        <p className="section-label">Price includes</p>
        <ul className="mt-3 space-y-2">
          {trip.includes.map((x) => (
            <li key={x} className="flex items-start gap-2.5 text-[12.5px] leading-snug text-mist">
              <Check size={13} className="mt-0.5 shrink-0 text-summit" strokeWidth={2.2} />
              {x}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-card border border-hairline bg-graphite p-5">
        <p className="section-label">Price does not include</p>
        <ul className="mt-3 space-y-2">
          {trip.excludes.map((x) => (
            <li key={x} className="flex items-start gap-2.5 text-[12.5px] leading-snug text-mist">
              <X size={13} className="mt-0.5 shrink-0 text-mist-dim" strokeWidth={2.2} />
              {x}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Equipment({ trip }: { trip: TripDetail }) {
  if (!trip.equipment.length) return <NotPublished what="an equipment list" />;
  return (
    <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {trip.equipment.map((g) => (
        <div key={g.group} className="rounded-card border border-hairline bg-graphite p-5">
          <p className="section-label">{g.group}</p>
          <ul className="mt-2.5 space-y-1.5">
            {g.items.map((i) => (
              <li key={i} className="text-[12.5px] leading-snug text-mist">{i}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Reviews({ company }: { company: ReturnType<typeof companyById> }) {
  if (!company || company.reviews.length === 0) {
    return <p className="mt-7 text-[13px] text-mist">No reviews have been published for this listing.</p>;
  }
  return (
    <>
      {/*
        The reviews belong to the OPERATOR, not to this one expedition, and the
        heading says so. Counting a Mont Blanc review toward an Everest listing
        without saying where it came from would inflate the only number on the
        page a buyer is likely to lean on.
      */}
      <p className="mt-7 text-[11.5px] text-mist-dim">
        Reviews of {company.name} across all its expeditions.
      </p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {company.reviews.map((r) => (
          <article key={r.id} className="rounded-card border border-hairline bg-graphite p-5">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-snow">{r.author}</p>
              <span className="flex items-center gap-1">
                <Star size={12} className="fill-azure text-azure" strokeWidth={1.9} />
                <span className="tnum text-[12px] text-snow">{r.stars.toFixed(1)}</span>
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-mist-dim">{r.when}</p>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{r.body}</p>
          </article>
        ))}
      </div>
    </>
  );
}

function Faq({ trip }: { trip: TripDetail }) {
  if (!trip.faq.length) return <NotPublished what="answers to common questions" />;
  return (
    <dl className="mt-7 max-w-[70ch] divide-y divide-hairline border-y border-hairline">
      {trip.faq.map((f) => (
        <div key={f.q} className="py-4">
          <dt className="text-[13.5px] text-snow">{f.q}</dt>
          <dd className="mt-1.5 text-[12.5px] leading-relaxed text-mist">{f.a}</dd>
        </div>
      ))}
    </dl>
  );
}

function BookingRail({
  trip, picked, onPick, departure,
}: {
  trip: TripDetail;
  picked: number;
  onPick: (i: number) => void;
  departure: TripDetail["departures"][number] | undefined;
}) {
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    });

  return (
    <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
      <div className="rounded-card border border-hairline bg-graphite p-5">
        <p className="section-label">Choose your date</p>
        <p className="mt-1 text-[11.5px] text-mist-dim">Available departures</p>

        <div className="mt-3 space-y-2">
          {trip.departures.map((d, i) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onPick(i)}
              aria-pressed={picked === i}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-tile border px-3.5 py-3 text-left transition-colors",
                picked === i
                  ? "border-azure bg-azure/10"
                  : "border-hairline hover:border-hairline-strong",
              )}
            >
              <span>
                <span className="tnum block text-[12.5px] text-snow">
                  {fmt(d.startISO)} – {fmt(d.endISO)}
                </span>
                <span className="tnum mt-0.5 block text-[10.5px] text-mist-dim">{d.days} days</span>
              </span>
            </button>
          ))}
        </div>

        {/*
          There is no "4 left" here any more, and there is not going to be one.
          The field is gone from `Departure` itself — see the note in its place
          in `data/tripDetail.ts`. This line still earns its keep: the DATES are
          invented too, and a reader choosing between them should know that.
        */}
        {IS_DEMO && (
          <p className="mt-2 text-[10.5px] text-mist-dim">Demo availability — no live booking system.</p>
        )}

        <div className="mt-5 border-t border-hairline pt-4">
          <p className="section-label">Price per person</p>
          <p className="tnum mt-1.5 text-[26px] font-light leading-none text-snow">
            {formatEur(trip.fromEur)}
          </p>
          <p className="tnum mt-1.5 text-[11.5px] text-mist-dim">
            Deposit {formatEur(trip.depositEur)}
          </p>
        </div>

        <button
          type="button"
          className="mt-4 w-full rounded-pill bg-azure-cta py-3 text-[13px] font-medium text-obsidian transition-opacity hover:opacity-90"
        >
          Request to book
        </button>
        <Link
          to="/app/messages"
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-pill border border-hairline-strong py-3 text-[12.5px] text-snow transition-colors hover:border-azure/50"
        >
          <MessageSquare size={13} strokeWidth={1.9} />
          Contact company
        </Link>

        {/*
          Both halves are read off STANDARD_POLICY rather than typed in. The
          reference reads "Free cancellation up to 60 days"; the policy's
          full-refund tier happens to be 60 days, and if that tier ever moves
          this line moves with it instead of quietly becoming false.
        */}
        <p className="mt-3 text-center text-[10.5px] leading-relaxed text-mist-dim">
          Full refund up to {FREE_CANCEL_DAYS} days before departure
          {STANDARD_POLICY.conditionsRefundPct === 100 && ", and always if conditions stop the attempt"}
        </p>
      </div>

      <RailList title="Price includes" items={trip.includes} tone="in" />
      <RailList title="Price does not include" items={trip.excludes} tone="out" />

      {departure && (
        <div className="rounded-card border border-hairline bg-graphite p-5">
          <p className="section-label">Selected departure</p>
          <p className="tnum mt-2 text-[13px] text-snow">
            {fmt(departure.startISO)} – {fmt(departure.endISO)}
          </p>
          <p className="mt-1 text-[11.5px] text-mist-dim">
            {trip.months} season · {trip.durationDays} days on the mountain
          </p>
          <div className="mt-3.5 flex items-center gap-2 border-t border-hairline pt-3.5">
            <Badge tone="azure">{trip.difficulty}</Badge>
            <button
              type="button"
              className="ml-auto flex items-center gap-1.5 text-[11.5px] text-mist hover:text-snow"
            >
              <Share2 size={12} strokeWidth={1.9} />
              Share
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

/**
 * The two price lists, in the rail.
 *
 * They are also under the "What's included" tab, and that repetition is the
 * point: the reference keeps them beside the price because what a quote covers
 * is the question a buyer has while looking at the number, not one they should
 * have to change tab to answer.
 */
function RailList({
  title, items, tone,
}: {
  title: string;
  items: string[];
  tone: "in" | "out";
}) {
  if (!items.length) return null;
  const Icon = tone === "in" ? Check : X;
  return (
    <div className="rounded-card border border-hairline bg-graphite p-5">
      <p className="section-label">{title}</p>
      <ul className="mt-3 space-y-1.5">
        {items.map((x) => (
          <li key={x} className="flex items-start gap-2 text-[11.5px] leading-snug text-mist">
            <Icon
              size={12}
              strokeWidth={2.2}
              className={cn("mt-0.5 shrink-0", tone === "in" ? "text-summit" : "text-mist-dim")}
            />
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "mont-blanc" -> "Mont Blanc" */
function peakLabel(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
