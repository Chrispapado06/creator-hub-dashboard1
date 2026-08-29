import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BarChart3, Bookmark, Calendar, Check, ChevronLeft, ChevronRight, Clock,
  Gauge, MapPin, Mountain as MountainIcon, Star, Users,
} from "lucide-react";
import { EXPEDITIONS, IS_DEMO, monogram, type Expedition } from "@/data/demo";
import { companyById, companySlug } from "@/data/companies";
import { objectiveIsOn, PEAKS, type Peak } from "@/data/peaks";
import { formatCoords, peakFacts } from "@/data/peakFacts";
import { peakCredit } from "@/data/peakPhotoCredits";
import { peakGallery, type GalleryPhoto } from "@/data/peakGallery";
import { operatorsForTrek, treksForMountain } from "@/data/treks";
import { TrekCard } from "./TrekCard";
import { peakFallback, peakImage } from "./peakPlate";
import { formatEur } from "@/money/model";
import { cn } from "@/lib/utils";

/**
 * A mountain, not a trip.
 *
 * This is the INFORMATION page — what the peak is, where it is, who climbed it
 * first, what it asks of you. The expedition listings that happen to go there
 * are one section near the bottom, not the point of the page.
 *
 * WHAT IS REAL HERE AND WHAT IS DERIVED. Elevation, range and country come from
 * the catalogue; coordinates, prominence, the first-ascent line and the
 * description come from Wikidata and Wikipedia and are attributed. Difficulty,
 * technical grade, season and typical duration are DERIVED FROM ALTITUDE and
 * say so, because they are rules of thumb rather than facts about this peak.
 *
 * Two things the reference design shows that are not here: a star rating with a
 * review count, and a summit success rate. A mountain does not have reviews —
 * that is a commerce pattern borrowed onto a geography page — and a success
 * rate is a real, checkable, safety-relevant number that exists for perhaps
 * three of these fifty-one peaks. Inventing it for the rest would be the worst
 * single line on the site.
 */

/*
 * TREKS SITS BESIDE EXPEDITIONS, not inside it.
 *
 * They are different products bought by different people: an expedition climbs
 * the summit, a trek walks to or around it. Folding treks into the expedition
 * list would have put a fortnight's walking at 5,364 m next to a two-month
 * climb at 8,849 m under one heading, which is the decision a reader comes to
 * this page to make.
 */
const TABS = ["Overview", "Treks", "Expeditions", "Gallery", "Conditions", "Routes", "Preparation"] as const;
type TabId = (typeof TABS)[number];

/** Seasons by region — the broad window, not a forecast. */
function seasonFor(p: Peak): string {
  switch (p.region) {
    case "Himalaya & Asia":
      // Japan sits in this bucket but not on the monsoon calendar. Fuji is
      // open roughly July to early September and its trails are shut the rest
      // of the year, so the Nepali post-monsoon window would print the two
      // months when you are not allowed to walk up it.
      if (p.country === "Japan") return "July – early September";
      return p.elevationM >= 8000 ? "April – May" : "October – November";
    case "Americas":
      return p.country.includes("United States") || p.country.includes("Canada")
        ? "May – July"
        : "December – February";
    case "Europe":
      return "June – September";
    case "Africa":
      return "January – March";
    default:
      return "November – February";
  }
}

function gradeFor(m: number): { difficulty: string; technical: string; days: string } {
  if (m >= 8000) return { difficulty: "Extreme", technical: "High", days: "50 – 70 days" };
  if (m >= 7000) return { difficulty: "Very hard", technical: "High", days: "30 – 40 days" };
  if (m >= 6000) return { difficulty: "Very hard", technical: "Moderate", days: "18 – 25 days" };
  if (m >= 5000) return { difficulty: "Hard", technical: "Low", days: "10 – 16 days" };
  if (m >= 4000) return { difficulty: "Hard", technical: "Moderate", days: "4 – 8 days" };
  return { difficulty: "Hard", technical: "Low", days: "2 – 4 days" };
}

/** What the altitude asks of you. Rules of thumb, labelled as such. */
function needsFor(m: number): string[] {
  const base = ["Good general hill fitness", "Comfortable in crampons on steep snow"];
  if (m >= 8000)
    return [
      "A previous 7,000 m summit",
      "Fluent with fixed lines and jumars while exhausted",
      "Supplementary oxygen, and training with it",
      "Two months away, and the money for it",
      "Evacuation insurance that covers the altitude",
    ];
  if (m >= 7000)
    return [
      "A previous 6,000 m summit",
      "Weeks of acclimatisation rotations",
      "Solid glacier travel and crevasse rescue",
      "Evacuation insurance that covers the altitude",
    ];
  if (m >= 6000)
    return [...base, "Prior nights above 5,000 m", "Multi-day self-sufficiency", "Evacuation insurance"];
  if (m >= 5000)
    return [...base, "Prior time above 3,000 m", "Tolerance for a slow, deliberate ascent"];
  return [...base, "A head for exposure"];
}

export default function MountainDetail() {
  const { id } = useParams<{ id: string }>();
  const peak = PEAKS.find((p) => p.id === id);
  const [tab, setTab] = useState<TabId>("Overview");
  const [saved, setSaved] = useState(false);

  const trips = useMemo(
    () => (peak && IS_DEMO ? EXPEDITIONS.filter((e) => objectiveIsOn(e.objective, peak)) : []),
    [peak],
  );

  if (peak === undefined) {
    return (
      <div className="mx-auto w-full max-w-[720px] py-16">
        <h1 className="text-[22px] font-light text-snow">No such mountain</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-mist">
          ICEFALL&rsquo;s catalogue holds {PEAKS.length} peaks. This is not one of them.
        </p>
        <Link to="/app/mountains" className="mt-5 inline-block text-[12.5px] text-azure hover:text-azure-bright">
          Back to mountains
        </Link>
      </div>
    );
  }

  const facts = peakFacts(peak.id);
  const credit = peakCredit(peak.id);
  const gallery = peakGallery(peak.id);
  const treks = treksForMountain(peak.id);
  const grade = gradeFor(peak.elevationM);
  const season = seasonFor(peak);

  return (
    <div className="mx-auto w-full max-w-[1320px] pb-16">
      <Link
        to="/app/mountains"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-mist transition-colors hover:text-snow"
      >
        <ChevronLeft size={15} strokeWidth={2} />
        Back to mountains
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_352px]">
        <div className="min-w-0">
          {/* ---- Hero ------------------------------------------------- */}
          <section className="relative overflow-hidden rounded-card border border-hairline">
            <div className="relative aspect-[16/9]">
              <img
                src={peakImage(peak.id)}
                alt=""
                aria-hidden
                onError={(ev) => {
                  const el = ev.currentTarget;
                  if (!el.dataset.fellBack) {
                    el.dataset.fellBack = "1";
                    el.src = peakFallback(peak.id);
                  }
                }}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 scrim-hero" />

              <div className="absolute inset-x-0 bottom-0 p-7">
                <p className="flex items-center gap-1.5 text-[12px] text-mist">
                  <MapPin size={12.5} strokeWidth={1.9} className="text-azure" />
                  {peak.country}
                </p>
                <h1 className="mt-1.5 text-[34px] font-light leading-none tracking-[-0.02em] text-snow">
                  {peak.name}
                </h1>
                <p className="tnum mt-2 text-[13.5px] text-mist">
                  <span className="text-snow">{peak.elevationM.toLocaleString("en-GB")} m</span>
                  <span className="mx-2 text-mist-dim">&middot;</span>
                  {peak.range}
                </p>

                <button
                  type="button"
                  onClick={() => setSaved((v) => !v)}
                  aria-pressed={saved}
                  className={cn(
                    "mt-4 inline-flex items-center gap-2 rounded-pill border px-4 py-2 text-[12.5px] backdrop-blur transition-colors",
                    saved
                      ? "border-azure bg-azure/10 text-azure"
                      : "border-hairline-strong bg-obsidian/50 text-snow hover:border-azure/50",
                  )}
                >
                  <Bookmark size={14} strokeWidth={1.9} className={cn(saved && "fill-azure")} />
                  {saved ? "Saved" : "Add to saved"}
                </button>
              </div>
            </div>

            {/* Photograph credit, as the licence requires. */}
            {credit && (
              <p className="border-t border-hairline px-7 py-2.5 text-[10.5px] text-mist-dim">
                Photograph: {credit.credit ?? "Unknown photographer"} &middot;{" "}
                <a href={credit.pageUrl} target="_blank" rel="noreferrer" className="text-azure/80 hover:text-azure">
                  {credit.license}
                </a>{" "}
                &middot; Wikimedia Commons
              </p>
            )}
          </section>

          {/* ---- Derived grades --------------------------------------- */}
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-4">
            {[
              { icon: MountainIcon, value: `${peak.elevationM.toLocaleString("en-GB")} m`, label: "Elevation" },
              { icon: Gauge, value: grade.difficulty, label: "Difficulty" },
              { icon: Clock, value: grade.days, label: "Typical expedition" },
              { icon: Calendar, value: season, label: "Best season" },
            ].map((s) => (
              <div key={s.label} className="bg-graphite px-4 py-3.5">
                <s.icon size={15} strokeWidth={1.7} className="text-azure" />
                <p className="tnum mt-2 text-[14px] leading-tight text-snow">{s.value}</p>
                <p className="mt-0.5 text-[10.5px] text-mist-dim">{s.label}</p>
              </div>
            ))}
          </div>
          {/*
            One line, once. Difficulty, duration and season are altitude rules
            of thumb — not measurements of this mountain — and a reader deciding
            whether they can climb something deserves to know which is which.
          */}
          <p className="mt-2 text-[10.5px] text-mist-dim">
            Difficulty, duration and season are guides based on altitude and region, not figures for
            a particular route.
          </p>

          <nav className="mt-6 flex gap-7 overflow-x-auto border-b border-hairline">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "-mb-px shrink-0 border-b-2 pb-3 text-[11px] font-medium uppercase tracking-[0.13em] transition-colors",
                  tab === t ? "border-azure text-azure" : "border-transparent text-mist-dim hover:text-mist",
                )}
              >
                {t}
              </button>
            ))}
          </nav>

          {tab === "Overview" && (
            <section className="mt-6">
              <p className="section-label">About {peak.name}</p>
              {facts && facts.about.length > 0 ? (
                <>
                  {facts.about.map((para) => (
                    <p key={para.slice(0, 40)} className="mt-3 max-w-[68ch] text-[13.5px] leading-relaxed text-mist">
                      {para}
                    </p>
                  ))}
                  {/* CC BY-SA 4.0 requires the source named and linked. */}
                  <p className="mt-3 text-[10.5px] text-mist-dim">
                    Description from{" "}
                    <a href={facts.wikipedia} target="_blank" rel="noreferrer" className="text-azure/80 hover:text-azure">
                      Wikipedia
                    </a>
                    , CC BY-SA 4.0.
                  </p>
                </>
              ) : (
                <p className="mt-3 text-[13px] text-mist">No description available for this peak.</p>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Fact label="First ascent" value={facts?.firstAscent ?? null} />
                <Fact label="Range" value={peak.range} />
                <Fact
                  label="Prominence"
                  value={facts?.prominenceM ? `${facts.prominenceM.toLocaleString("en-GB")} m` : null}
                />
                <Fact
                  label="Coordinates"
                  value={facts?.lat != null && facts.lon != null ? formatCoords(facts.lat, facts.lon) : null}
                />
              </div>
            </section>
          )}

          {tab === "Treks" && (
            <section className="mt-6">
              {treks.length === 0 ? (
                <>
                  <p className="text-[13px] text-mist">
                    No trekking route in the catalogue goes to {peak.name}.
                  </p>
                  <Link to="/app/treks" className="mt-2 inline-block text-[12.5px] text-azure hover:text-azure-bright">
                    Browse all treks
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-[12px] text-mist-dim">
                    Walking routes to and around {peak.name}. None of these climbs it.
                  </p>
                  <div className="mt-3 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {treks.map((t) => (
                      <TrekCard key={t.id} trek={t} operators={operatorsForTrek(t.id).length} />
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {tab === "Gallery" && (
            <section className="mt-6">
              {gallery.length === 0 ? (
                <p className="text-[13px] text-mist">No photographs published for this peak.</p>
              ) : (
                <>
                  <Gallery photos={gallery} name={peak.name} />
                  {/*
                    Fewer than five means Commons has fewer than five usable
                    photographs of this mountain — not that the page is broken.
                    Saying so beats padding the grid with the range next door.
                  */}
                  {gallery.length < 5 && (
                    <p className="mt-3 text-[11px] text-mist-dim">
                      Wikimedia Commons holds {gallery.length}{" "}
                      {gallery.length === 1 ? "usable photograph" : "usable photographs"} of{" "}
                      {peak.name}. Rather than fill the grid with other mountains, this shows what
                      exists.
                    </p>
                  )}
                </>
              )}
            </section>
          )}

          {tab === "Conditions" && (
            <section className="mt-6 max-w-[68ch]">
              <p className="section-label">Season and conditions</p>
              <p className="mt-3 text-[13.5px] leading-relaxed text-mist">
                The usual window on {peak.name} is <span className="text-snow">{season}</span>. That
                is the season operators work, not a forecast — conditions on any given week decide
                whether anyone moves.
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-mist-dim">
                ICEFALL does not publish weather for this peak. Before committing to dates, get a
                forecast from a service that specialises in the range, and ask your operator which
                one they actually use.
              </p>
            </section>
          )}

          {tab === "Routes" && (
            <section className="mt-6 max-w-[68ch]">
              <p className="section-label">Routes</p>
              <p className="mt-3 text-[13.5px] leading-relaxed text-mist">
                ICEFALL has not published route descriptions for {peak.name}.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-mist-dim">
                A route description is a safety document. Rather than paraphrase one, the listings
                below name the line each operator takes, and the operator will send you theirs.
              </p>
            </section>
          )}

          {tab === "Preparation" && (
            <section className="mt-6">
              <p className="section-label">What this asks of you</p>
              <ul className="mt-3 grid max-w-[68ch] gap-x-6 gap-y-2 sm:grid-cols-2">
                {needsFor(peak.elevationM).map((n) => (
                  <li key={n} className="flex items-start gap-2 text-[12.5px] leading-snug text-mist">
                    <Check size={13} className="mt-0.5 shrink-0 text-azure" strokeWidth={2.2} />
                    {n}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[10.5px] text-mist-dim">
                Derived from altitude. Your operator sets the actual entry requirements.
              </p>
            </section>
          )}

          {tab === "Expeditions" && (
            <section className="mt-6">
              {trips.length === 0 ? (
                <p className="text-[13px] text-mist">
                  No operator in this directory publishes an expedition on {peak.name}.
                </p>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {trips.map((t, i) => (
                      <TripRow key={t.id} t={t} peak={peak} featured={i === 0 && trips.length > 1} />
                    ))}
                  </div>
                  {/* Same rule as the expeditions page: say what the order means,
                      because the default assumption about a "featured" badge is
                      that somebody paid for it. */}
                  <p className="mt-4 text-[10.5px] leading-relaxed text-mist-dim">
                    Ordered on how specifically a listing covers {peak.name}. No position here is
                    for sale, and ICEFALL takes no part in a booking.
                  </p>
                </>
              )}
            </section>
          )}
        </div>

        {/* ---- Rail ---------------------------------------------------- */}
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-card border border-hairline bg-graphite p-5">
            <p className="section-label">Essential information</p>
            <dl className="mt-3.5 space-y-2.5">
              <Row icon={MapPin} k="Location" v={peak.country} />
              <Row icon={MountainIcon} k="Elevation" v={`${peak.elevationM.toLocaleString("en-GB")} m`} />
              <Row icon={BarChart3} k="Technical level" v={grade.technical} />
              <Row icon={Calendar} k="Best season" v={season} />
              <Row icon={Clock} k="Typical expedition" v={grade.days} />
              {facts?.prominenceM != null && (
                <Row icon={Gauge} k="Prominence" v={`${facts.prominenceM.toLocaleString("en-GB")} m`} />
              )}
            </dl>
            {/*
              The reference has a "Success Rate" row here. It is not in this
              app, and its absence is deliberate: a summit success rate is a
              checkable, safety-relevant number that is genuinely published for
              a handful of the world's peaks and unknown for the rest. A plausible
              guess is the most dangerous thing this page could carry.
            */}
          </section>

          <section className="rounded-card border border-hairline bg-graphite p-5">
            <p className="section-label">What it asks of you</p>
            <ul className="mt-3.5 space-y-2.5">
              {needsFor(peak.elevationM).map((n) => (
                <li key={n} className="flex items-start gap-2.5 text-[12px] leading-snug text-mist">
                  <Users size={13} strokeWidth={1.7} className="mt-0.5 shrink-0 text-azure" />
                  {n}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-card border border-hairline bg-graphite p-5">
            <p className="section-label">Treks here</p>
            {treks.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-mist">No trekking routes on this peak.</p>
            ) : (
              <>
                <p className="tnum mt-3 text-[13px] text-snow">
                  {treks.length} {treks.length === 1 ? "route" : "routes"} — walking, not climbing
                </p>
                <button
                  type="button"
                  onClick={() => setTab("Treks")}
                  className="mt-3.5 flex h-10 w-full items-center justify-center gap-2 rounded-tile border border-summit/45 text-[12.5px] text-summit transition-colors hover:border-summit"
                >
                  See the treks
                  <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </>
            )}
          </section>

          <section className="rounded-card border border-hairline bg-graphite p-5">
            <p className="section-label">Expeditions here</p>
            {trips.length === 0 ? (
              <p className="mt-3 text-[12.5px] text-mist">No listings on this peak.</p>
            ) : (
              <>
                <p className="tnum mt-3 text-[13px] text-snow">
                  {trips.length} {trips.length === 1 ? "listing" : "listings"} from{" "}
                  {new Set(trips.map((t) => t.company)).size}{" "}
                  {new Set(trips.map((t) => t.company)).size === 1 ? "operator" : "operators"}
                </p>
                <button
                  type="button"
                  onClick={() => setTab("Expeditions")}
                  className="mt-3.5 flex h-10 w-full items-center justify-center gap-2 rounded-tile bg-azure-cta text-[12.5px] font-medium text-obsidian transition-opacity hover:opacity-90"
                >
                  See who climbs it
                  <ChevronRight size={14} strokeWidth={2.2} />
                </button>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

/**
 * The photograph grid, with a lightbox.
 *
 * Every tile carries its photographer and licence — these are other people's
 * pictures under CC BY and CC BY-SA, and both require attribution wherever the
 * work appears, not only on the page that happens to have room for it.
 */
function Gallery({ photos, name }: { photos: GalleryPhoto[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = open !== null ? photos[open] : null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {photos.map((ph, i) => (
          <figure key={ph.src} className="overflow-hidden rounded-card border border-hairline bg-graphite">
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group block w-full"
              aria-label={`View photograph ${i + 1} of ${name}`}
            >
              <img
                src={ph.src}
                alt=""
                aria-hidden
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            </button>
            <figcaption className="px-3 py-2 text-[10.5px] leading-snug text-mist-dim">
              {ph.credit ?? "Unknown photographer"} &middot;{" "}
              <a
                href={ph.pageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-azure/80 hover:text-azure"
              >
                {ph.license}
              </a>
            </figcaption>
          </figure>
        ))}
      </div>

      {shown && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photograph of ${name}`}
          className="fixed inset-0 z-50 grid place-items-center bg-obsidian/92 p-6 backdrop-blur"
          onClick={() => setOpen(null)}
        >
          <div className="max-h-full w-full max-w-[1100px]" onClick={(ev) => ev.stopPropagation()}>
            <img src={shown.src} alt="" className="max-h-[78vh] w-full rounded-card object-contain" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11.5px] text-mist">
                {shown.credit ?? "Unknown photographer"} &middot;{" "}
                <a href={shown.pageUrl} target="_blank" rel="noreferrer" className="text-azure hover:text-azure-bright">
                  {shown.license}
                </a>{" "}
                &middot; Wikimedia Commons
              </p>
              <button
                type="button"
                onClick={() => setOpen(null)}
                className="rounded-pill border border-hairline-strong px-4 py-1.5 text-[12px] text-snow hover:border-azure/50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * One operator's listing for this peak.
 *
 * The first gets the gilt treatment, the same single non-azure surface the
 * expeditions page uses for its best match — and only when there is more than
 * one listing, because "featured" among a field of one is not a recommendation.
 */
function TripRow({ t, peak, featured }: { t: Expedition; peak: Peak; featured: boolean }) {
  const c = companyById(companySlug(t.company));
  const rated = c !== undefined && c.reviewCount > 0;
  return (
    <Link
      to={`/app/trip/${t.id}`}
      className={cn(
        "group flex flex-col rounded-card border p-4 transition-colors",
        featured
          ? "gilt-sheen border-gilt/45 hover:border-gilt"
          : "border-hairline bg-graphite hover:border-azure/45",
      )}
    >
      {featured && (
        <span className="mb-3 flex w-fit items-center gap-1.5 rounded-pill border border-gilt/45 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.11em] text-gilt">
          <Star size={9} className="fill-gilt" strokeWidth={0} />
          Best match for {peak.name}
        </span>
      )}
      <div className="flex items-start gap-3.5">
        {/* An invented company's mark, or its monogram. A real business's logo
            is not bundled — see the `logo` note in data/companies.ts. */}
        {c?.logo ? (
          <img
            src={c.logo}
            alt=""
            aria-hidden
            className="h-[46px] w-[46px] shrink-0 rounded-tile border border-hairline object-contain"
          />
        ) : (
          <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-tile border border-hairline bg-slate/60 text-[12px] tracking-[0.06em] text-mist">
            {monogram(t.company)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] text-snow">{t.company}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">{t.objective}</span>
          <span className="mt-1 flex items-center gap-1.5 text-[11.5px]">
            {rated ? (
              <>
                <Star size={11} className="fill-azure text-azure" strokeWidth={1.8} />
                <span className="tnum text-snow">{c.rating.toFixed(1)}</span>
                <span className="text-mist-dim">({c.reviewCount})</span>
              </>
            ) : (
              <span className="text-mist-dim">No ratings published</span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="section-label block">From</span>
          <span className="tnum mt-1 block text-[13px] text-snow">{formatEur(t.fromEur)}</span>
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-hairline pt-3 text-[11.5px] text-mist-dim">
        <span className="tnum">{t.durationDays} days</span>
        <span>&middot;</span>
        <span>{t.months}</span>
        <ChevronRight
          size={15}
          strokeWidth={1.9}
          className="ml-auto transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  );
}

/** A fact card that says "not recorded" rather than showing a blank. */
function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-card border border-hairline bg-graphite px-4 py-3.5">
      <p className="section-label">{label}</p>
      <p
        className={cn(
          "mt-1.5 leading-snug",
          value ? "text-[13px] text-snow" : "text-[11.5px] text-mist-dim",
        )}
      >
        {value ?? "Not recorded"}
      </p>
    </div>
  );
}

function Row({ icon: Icon, k, v }: { icon: typeof MapPin; k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex items-center gap-2 text-[11.5px] text-mist-dim">
        <Icon size={12.5} strokeWidth={1.7} />
        {k}
      </dt>
      <dd className="tnum text-right text-[12px] text-snow">{v}</dd>
    </div>
  );
}
