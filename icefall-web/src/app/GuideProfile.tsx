import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Award, Calendar, ChevronLeft, ChevronRight, Clock, Globe, MapPin,
  MessageSquare, Mountain as MountainIcon, ShieldCheck, Star, TrendingUp, Users,
} from "lucide-react";
import { GuidePhoto, VerifiedTick } from "@/components/ui";
import { DEMO_NOTICE, EXPEDITIONS, GUIDES, IS_DEMO, type Guide } from "@/data/demo";
import { objectiveIsOn, PEAKS, type Peak } from "@/data/peaks";
import { peakFallback, peakImage } from "./peakPlate";
import { formatEur } from "@/money/model";
import { cn } from "@/lib/utils";

/**
 * One guide.
 *
 * Reached from the guides list, which previously had "View profile" buttons
 * pointing at /app/messages — a fourth dead-end in an app that has had three
 * already.
 *
 * ON THE NUMBERS. This guide does not exist and neither does the summit count,
 * the success rate or the testimonials; `GUIDES` is `IS_DEMO`-gated at its
 * definition and the page carries the notice. What is NOT invented is the
 * booking: there is no calendar, no availability and no payment, so the panel
 * that would take a booking says what it needs instead of collecting dates it
 * cannot honour.
 */

const TABS = ["About", "Expeditions", "Reviews", "Certifications"] as const;
type TabId = (typeof TABS)[number];

export default function GuideProfile() {
  const { id } = useParams<{ id: string }>();
  const guide = IS_DEMO ? GUIDES.find((g) => g.id === id) : undefined;
  const [tab, setTab] = useState<TabId>("About");

  /** The peaks this guide lists, resolved to the catalogue. */
  const peaks = useMemo(() => {
    if (!guide) return [];
    return guide.mountains
      .map((m) => PEAKS.find((p) => p.name === m || p.name.replace(/^Mount\s+/, "") === m))
      .filter((p): p is Peak => p !== undefined);
  }, [guide]);

  /** Listings on the mountains they work — never "every trip in the app". */
  const trips = useMemo(() => {
    if (!guide || !IS_DEMO) return [];
    return EXPEDITIONS.filter((e) => peaks.some((p) => objectiveIsOn(e.objective, p))).slice(0, 6);
  }, [guide, peaks]);

  if (guide === undefined) {
    return (
      <div className="mx-auto w-full max-w-[720px] py-16">
        <h1 className="text-[22px] font-light text-snow">No such guide</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-mist">
          {IS_DEMO
            ? "This guide is not in the demo directory."
            : "ICEFALL has no guides listed yet."}
        </p>
        <Link to="/app/guides" className="mt-5 inline-block text-[12.5px] text-azure hover:text-azure-bright">
          Back to guides
        </Link>
      </div>
    );
  }

  const hero = peaks[0]?.id ?? guide.heroPeak;

  return (
    <div className="mx-auto w-full max-w-[1320px] pb-16">
      <Link
        to="/app/guides"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-mist transition-colors hover:text-snow"
      >
        <ChevronLeft size={15} strokeWidth={2} />
        Back to guides
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_352px]">
        <div className="min-w-0">
          {/* ---- Hero -------------------------------------------------- */}
          <section className="overflow-hidden rounded-card border border-hairline bg-graphite">
            <div className="relative h-[210px]">
              {/*
                The mountain they work, behind them — never a stock photograph
                of an anonymous climber, which is the thing every guiding site
                does and none of them can source honestly.
              */}
              <img
                src={peakImage(hero)}
                alt=""
                aria-hidden
                onError={(ev) => {
                  const el = ev.currentTarget;
                  if (!el.dataset.fellBack) {
                    el.dataset.fellBack = "1";
                    el.src = peakFallback(hero);
                  }
                }}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 scrim-full" />
            </div>

            <div className="relative px-7 pb-6">
              <div className="-mt-12 flex flex-wrap items-end gap-5">
                <span className="rounded-full border-4 border-graphite">
                  <GuidePhoto name={guide.name} src={guide.photo} size={104} />
                </span>
                <div className="min-w-0 flex-1 pb-1">
                  <h1 className="text-[28px] font-light leading-none tracking-[-0.02em] text-snow">
                    {guide.name}
                  </h1>
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-mist">
                    <span>{guide.credential}</span>
                    <VerifiedTick verifiedOn={guide.verifiedOn} size={13} />
                    <span className="text-mist-dim">&middot;</span>
                    <span className="tnum">{guide.yearsGuiding}+ years</span>
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-mist-dim">
                    <span className="flex items-center gap-1.5">
                      <MapPin size={12} strokeWidth={1.9} />
                      {guide.basedIn}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Globe size={12} strokeWidth={1.9} />
                      Speaks {guide.languages.join(", ")}
                    </span>
                  </p>
                </div>

                <Link
                  to="/app/messages"
                  className="mb-1 flex h-11 items-center gap-2 rounded-tile border border-hairline-strong px-5 text-[13px] text-snow transition-colors hover:border-azure/50"
                >
                  <MessageSquare size={14} strokeWidth={1.9} />
                  Message
                </Link>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-hairline pt-5 sm:grid-cols-5">
                {[
                  { icon: Star, value: guide.rating.toFixed(1), label: `${guide.reviews} reviews` },
                  { icon: MountainIcon, value: `${guide.summits}+`, label: "Summits" },
                  { icon: Award, value: `${guide.expeditionsLed}`, label: "Expeditions led" },
                  { icon: TrendingUp, value: `${guide.successRatePct}%`, label: "Success rate" },
                  { icon: Clock, value: `${guide.yearsGuiding}+`, label: "Years guiding" },
                ].map((s) => (
                  <div key={s.label} className="flex items-start gap-2.5">
                    <s.icon size={16} strokeWidth={1.6} className="mt-0.5 shrink-0 text-azure" />
                    <span>
                      <span className="tnum block text-[16px] leading-tight text-snow">{s.value}</span>
                      <span className="mt-0.5 block text-[10.5px] leading-snug text-mist-dim">{s.label}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

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

          {tab === "About" && (
            <>
              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                <section className="rounded-card border border-hairline bg-graphite p-6">
                  <p className="section-label">About {guide.name.split(" ")[0]}</p>
                  {guide.bio.map((para) => (
                    <p key={para.slice(0, 30)} className="mt-3 text-[13.5px] leading-relaxed text-mist">
                      {para}
                    </p>
                  ))}
                </section>
                <aside className="rounded-card border border-hairline bg-graphite p-6">
                  <dl className="space-y-3">
                    {[
                      ["Nationality", guide.nationality],
                      ["Languages", guide.languages.join(", ")],
                      ["Based in", guide.basedIn],
                      ["Member since", guide.memberSince],
                      ["Day rate", `${formatEur(guide.dayRate)} / day`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-baseline justify-between gap-3">
                        <dt className="text-[11.5px] text-mist-dim">{k}</dt>
                        <dd className="text-right text-[12px] text-snow">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </aside>
              </div>

              <p className="section-label mt-8">Specialities</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {guide.specialties.map((sp) => (
                  <div key={sp} className="flex items-center gap-2.5 rounded-card border border-hairline bg-graphite px-4 py-3.5">
                    <MountainIcon size={15} strokeWidth={1.7} className="shrink-0 text-azure" />
                    <span className="text-[12.5px] leading-snug text-snow">{sp}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex items-baseline justify-between">
                <p className="section-label">Mountains {guide.name.split(" ")[0]} works</p>
                <Link to="/app/mountains" className="text-[11.5px] text-azure hover:text-azure-bright">
                  All mountains
                </Link>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {peaks.map((p) => (
                  <Link
                    key={p.id}
                    to={`/app/mountains/${p.id}`}
                    className="group relative block h-[148px] overflow-hidden rounded-card border border-hairline transition-colors hover:border-azure/45"
                  >
                    <img
                      src={peakImage(p.id)}
                      alt=""
                      aria-hidden
                      loading="lazy"
                      onError={(ev) => {
                        const el = ev.currentTarget;
                        if (!el.dataset.fellBack) {
                          el.dataset.fellBack = "1";
                          el.src = peakFallback(p.id);
                        }
                      }}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                    <div className="absolute inset-0 scrim-bottom" />
                    <span className="absolute inset-x-0 bottom-0 p-4">
                      <span className="block text-[14px] text-snow">{p.name}</span>
                      <span className="tnum mt-0.5 block text-[11.5px] text-mist">
                        {p.elevationM.toLocaleString("en-GB")} m &middot; {p.country}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {tab === "Expeditions" && (
            <section className="mt-6">
              {trips.length === 0 ? (
                <p className="text-[13px] text-mist">
                  No listings in this directory go to the mountains {guide.name.split(" ")[0]} works.
                </p>
              ) : (
                <>
                  {/*
                    Said plainly: these are trips to HIS mountains, run by
                    operators in the directory. He is not on the staff list of
                    any of them, and implying otherwise would be inventing an
                    employment relationship.
                  */}
                  <p className="text-[11.5px] text-mist-dim">
                    Expeditions to the mountains {guide.name.split(" ")[0]} works. ICEFALL does not
                    know which operators he guides for.
                  </p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {trips.map((t) => (
                      <Link
                        key={t.id}
                        to={`/app/trip/${t.id}`}
                        className="group flex items-center gap-3 rounded-card border border-hairline bg-graphite p-4 transition-colors hover:border-azure/45"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] text-snow">{t.objective}</span>
                          <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">
                            {t.company}
                          </span>
                          <span className="tnum mt-1 block text-[11.5px] text-mist">
                            {t.durationDays} days &middot; {t.months}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="section-label block">From</span>
                          <span className="tnum mt-1 block text-[13px] text-snow">
                            {formatEur(t.fromEur)}
                          </span>
                        </span>
                        <ChevronRight
                          size={15}
                          strokeWidth={1.9}
                          className="shrink-0 text-mist-dim transition-transform group-hover:translate-x-0.5"
                        />
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {tab === "Reviews" && (
            <section className="mt-6">
              <div className="flex items-center gap-3">
                <span className="tnum text-[30px] font-light leading-none text-snow">
                  {guide.rating.toFixed(1)}
                </span>
                <Stars value={guide.rating} />
                <span className="text-[11.5px] text-mist-dim">({guide.reviews} reviews)</span>
              </div>
              {/* Showing N of M, because showing two of 127 without saying so
                  reads as "this guide has two reviews". */}
              <p className="mt-2 text-[11px] text-mist-dim">
                Showing {guide.testimonials.length} of {guide.reviews}.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {guide.testimonials.map((t) => (
                  <article key={t.author} className="rounded-card border border-hairline bg-graphite p-5">
                    <div className="flex items-start gap-3">
                      <GuidePhoto name={t.author} size={38} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-snow">{t.author}</p>
                        <p className="mt-0.5 truncate text-[11px] text-mist-dim">
                          {t.trip} &middot; {t.when}
                        </p>
                      </div>
                      <Stars value={t.stars} />
                    </div>
                    <p className="mt-3 text-[12.5px] leading-relaxed text-mist">{t.body}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {tab === "Certifications" && (
            <section className="mt-6 max-w-[62ch]">
              <ul className="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-graphite">
                {guide.certifications.map((c) => (
                  <li key={c} className="flex items-center gap-3 px-5 py-3.5">
                    <ShieldCheck size={16} strokeWidth={1.7} className="shrink-0 text-azure" />
                    <span className="text-[13px] text-snow">{c}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
                ICEFALL checked these documents on {guide.verifiedOn}. We have not contacted the
                issuing associations.
              </p>
            </section>
          )}
        </div>

        {/* ---- Rail ---------------------------------------------------- */}
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Availability guide={guide} peaks={peaks} />

          <section className="rounded-card border border-hairline bg-graphite p-5">
            <p className="section-label">Guide highlights</p>
            <ul className="mt-3.5 space-y-2.5">
              {[
                guide.credential,
                ...guide.certifications.slice(1, 3),
                `Speaks ${guide.languages.length} languages`,
                `${guide.yearsGuiding} seasons guiding`,
              ].map((h) => (
                <li key={h} className="flex items-start gap-2.5 text-[12px] leading-snug text-mist">
                  <ShieldCheck size={13} strokeWidth={1.7} className="mt-0.5 shrink-0 text-azure" />
                  {h}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-card border border-hairline bg-graphite p-5">
            <div className="flex items-baseline justify-between">
              <p className="section-label">What clients say</p>
              <button
                type="button"
                onClick={() => setTab("Reviews")}
                className="text-[11.5px] text-azure hover:text-azure-bright"
              >
                View all
              </button>
            </div>
            {guide.testimonials[0] && (
              <>
                <Stars value={guide.testimonials[0].stars} size={13} />
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">
                  {guide.testimonials[0].body}
                </p>
                <div className="mt-3.5 flex items-center gap-2.5 border-t border-hairline pt-3">
                  <GuidePhoto name={guide.testimonials[0].author} size={30} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] text-snow">
                      {guide.testimonials[0].author}
                    </span>
                    <span className="block truncate text-[10.5px] text-mist-dim">
                      {guide.testimonials[0].trip} &middot; {guide.testimonials[0].when}
                    </span>
                  </span>
                </div>
              </>
            )}
          </section>
        </aside>
      </div>

      {IS_DEMO && (
        <p className="mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-mist-dim">
          {DEMO_NOTICE} This guide, the figures on this page and the reviews are invented to show
          the layout.
        </p>
      )}
    </div>
  );
}

/**
 * The booking panel.
 *
 * The reference collects a mountain, dates and a group size behind a "Check
 * availability" button. There is no calendar and no availability to check, so
 * this collects the enquiry and says where it goes rather than pretending to
 * query something. A form that looks like it books and does not is worse than
 * one that admits what it is.
 */
function Availability({ guide, peaks }: { guide: Guide; peaks: Peak[] }) {
  const [peakId, setPeakId] = useState(peaks[0]?.id ?? "");
  const [group, setGroup] = useState("2 climbers");

  return (
    <section className="rounded-card border border-hairline bg-graphite p-5">
      <p className="section-label">Enquire</p>
      <p className="mt-1.5 text-[12px] text-mist">
        Ask {guide.name.split(" ")[0]} about a date.
      </p>

      <label className="mt-4 block">
        <span className="section-label block">Mountain</span>
        <span className="mt-1.5 flex items-center gap-2 rounded-tile border border-hairline bg-obsidian/50 px-3 py-2.5">
          <MountainIcon size={14} strokeWidth={1.8} className="shrink-0 text-azure" />
          <select
            value={peakId}
            onChange={(e) => setPeakId(e.target.value)}
            className="w-full bg-transparent text-[13px] text-snow outline-none"
          >
            {peaks.map((p) => (
              <option key={p.id} value={p.id} className="bg-graphite">
                {p.name}
              </option>
            ))}
          </select>
        </span>
      </label>

      <label className="mt-3 block">
        <span className="section-label block">Group size</span>
        <span className="mt-1.5 flex items-center gap-2 rounded-tile border border-hairline bg-obsidian/50 px-3 py-2.5">
          <Users size={14} strokeWidth={1.8} className="shrink-0 text-azure" />
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="w-full bg-transparent text-[13px] text-snow outline-none"
          >
            {["1 climber", "2 climbers", "3 climbers", "4+ climbers"].map((g) => (
              <option key={g} value={g} className="bg-graphite">
                {g}
              </option>
            ))}
          </select>
        </span>
      </label>

      <div className="mt-3 flex items-center gap-2 rounded-tile border border-hairline bg-obsidian/50 px-3 py-2.5">
        <Calendar size={14} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
        <span className="text-[12.5px] text-mist-dim">
          Dates are agreed with the guide — there is no calendar here
        </span>
      </div>

      <Link
        to="/app/messages"
        className="mt-4 flex h-11 items-center justify-center gap-2 rounded-tile bg-azure-cta text-[13px] font-medium text-obsidian transition-opacity hover:opacity-90"
      >
        <MessageSquare size={14} strokeWidth={1.9} />
        Send an enquiry
      </Link>
      <p className="tnum mt-3 text-center text-[11.5px] text-mist-dim">
        {formatEur(guide.dayRate)} / day &middot; you book with the guide directly
      </p>
    </section>
  );
}

function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          strokeWidth={1.6}
          className={n <= Math.round(value) ? "fill-azure text-azure" : "text-mist-dim/45"}
        />
      ))}
    </span>
  );
}
