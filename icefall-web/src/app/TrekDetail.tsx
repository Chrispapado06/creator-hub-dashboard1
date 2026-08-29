import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CalendarDays, Check, ChevronRight, Clock, Gauge, Info, MapPin,
  MessageSquare, MountainSnow, ShieldCheck, Users,
} from "lucide-react";
import { GuidePhoto } from "@/components/ui";
import { DEMO_NOTICE, GUIDES, IS_DEMO, monogram } from "@/data/demo";
import { PEAKS } from "@/data/peaks";
import { trekAltitude, trekDuration, trekRegion } from "@/data/trekTypes";
import { operatorsForTrek, trekById, treksInRegion } from "@/data/treks";
import { trekImage, trekImageSubject, trekPlate } from "./trekImages";
import { peakFallback, peakImage } from "./peakPlate";
import { TrekCard } from "./TrekCard";
import { cn } from "@/lib/utils";

/**
 * One trek.
 *
 * Sibling to the mountain page rather than to the trip page: a trek is a
 * ROUTE, and the page is about the route rather than about one operator's
 * departure of it. Operators who run it are a section, not the frame.
 *
 * ── WHAT IS KNOWN AND WHAT IS NOT ───────────────────────────────────────────
 * Duration, high point, season and difficulty are sourced facts about the
 * route. Everything an OPERATOR owns — the day-by-day itinerary, what a price
 * covers, the kit list they hand out, their departure dates — is not ours to
 * state, and this page says so instead of generating a plausible version. The
 * phone app shipped eleven listings whose tabs were empty because the tabs
 * existed and the data did not; the fix is not to invent the data, it is to
 * say what is missing and who has it.
 */

const TABS = ["Overview", "The route", "Preparation", "Operators", "FAQ"] as const;
type TabId = (typeof TABS)[number];

export default function TrekDetail() {
  const { id } = useParams<{ id: string }>();
  const trek = id !== undefined ? trekById(id) : undefined;
  const [tab, setTab] = useState<TabId>("Overview");

  const operators = useMemo(() => (trek ? operatorsForTrek(trek.id) : []), [trek]);

  const guides = useMemo(() => {
    if (!trek || !IS_DEMO) return [];
    const peaks = trek.mountainIds
      .map((mid) => PEAKS.find((p) => p.id === mid))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    return GUIDES.filter((g) =>
      peaks.some((p) => g.mountains.some((m) => m === p.name || m === p.name.replace(/^Mount\s+/, ""))),
    ).slice(0, 3);
  }, [trek]);

  if (trek === undefined) {
    return (
      <div className="mx-auto w-full max-w-[720px] py-16">
        <h1 className="text-[22px] font-light text-snow">No such trek</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-mist">
          Nothing in the trek catalogue has that address.
        </p>
        <Link to="/app/treks" className="mt-5 inline-block text-[12.5px] text-azure hover:text-azure-bright">
          Back to treks
        </Link>
      </div>
    );
  }

  const region = trekRegion(trek.regionId);
  const subject = trekImageSubject(trek);
  const peaks = trek.mountainIds
    .map((mid) => PEAKS.find((p) => p.id === mid))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);
  const nearby = treksInRegion(trek.regionId).filter((t) => t.id !== trek.id).slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-[1320px] pb-16">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5">
        <Link to="/app/treks" className="text-[10.5px] uppercase tracking-[0.13em] text-mist-dim hover:text-mist">
          Treks
        </Link>
        {region && (
          <>
            <ChevronRight size={11} className="text-mist-dim" />
            <Link
              to={`/app/treks?region=${region.id}`}
              className="text-[10.5px] uppercase tracking-[0.13em] text-azure hover:text-azure-bright"
            >
              {region.name}
            </Link>
          </>
        )}
        <ChevronRight size={11} className="text-mist-dim" />
        <span className="text-[10.5px] uppercase tracking-[0.13em] text-snow">{trek.name}</span>
      </nav>

      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_352px]">
        <div className="min-w-0">
          <section className="overflow-hidden rounded-card border border-hairline">
            <div className="relative aspect-[16/8]">
              <img
                src={trekImage(trek)}
                alt=""
                aria-hidden
                onError={(ev) => {
                  const el = ev.currentTarget;
                  if (!el.dataset.fellBack) {
                    el.dataset.fellBack = "1";
                    el.src = trekPlate(trek.id);
                  }
                }}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 scrim-hero" />

              <span className="absolute left-6 top-6 flex items-center gap-1.5 rounded-pill bg-summit/85 px-3 py-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-obsidian">
                <MountainSnow size={11} strokeWidth={2.2} />
                Trek
              </span>

              {/*
                When the picture is of a mountain rather than of the route, it
                says so. A photograph of Everest above "Gokyo Lakes Trek" would
                otherwise quietly claim to be the Gokyo Lakes.
              */}
              {subject && (
                <span className="absolute right-6 top-6 rounded-pill bg-obsidian/75 px-3 py-1 text-[10px] text-mist backdrop-blur">
                  Photograph: {subject}
                </span>
              )}

              <div className="absolute inset-x-0 bottom-0 p-7">
                <h1 className="text-[32px] font-light leading-none tracking-[-0.02em] text-snow">
                  {trek.name}
                </h1>
                <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-mist">
                  <span className="flex items-center gap-1.5">
                    <MapPin size={12} strokeWidth={1.9} />
                    {trek.country}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} strokeWidth={1.9} />
                    {trekDuration(trek)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Gauge size={12} strokeWidth={1.9} />
                    {trek.difficulty ?? "Not specified"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MountainSnow size={12} strokeWidth={1.9} />
                    {trekAltitude(trek)}
                  </span>
                </p>
              </div>
            </div>
          </section>

          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-4">
            <Stat icon={Clock} value={trekDuration(trek)} label="Duration" />
            <Stat icon={MountainSnow} value={trekAltitude(trek)} label="Highest point" />
            <Stat icon={Gauge} value={trek.difficulty ?? "Not specified"} label="Difficulty" />
            <Stat icon={CalendarDays} value={trek.season ?? "Not specified"} label="Season" />
          </div>

          <nav className="mt-6 flex gap-7 overflow-x-auto border-b border-hairline">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "-mb-px shrink-0 border-b-2 pb-3 text-[11px] font-medium uppercase tracking-[0.13em] transition-colors",
                  tab === t ? "border-summit text-summit" : "border-transparent text-mist-dim hover:text-mist",
                )}
              >
                {t}
              </button>
            ))}
          </nav>

          {tab === "Overview" && (
            <section className="mt-6">
              <p className="section-label">About this trek</p>
              <p className="mt-3 max-w-[66ch] text-[13.5px] leading-relaxed text-mist">{trek.summary}</p>

              {peaks.length > 0 && (
                <>
                  <p className="section-label mt-8">Mountains on this route</p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {peaks.map((p) => (
                      <Link
                        key={p.id}
                        to={`/app/mountains/${p.id}`}
                        className="group relative block h-[136px] overflow-hidden rounded-card border border-hairline transition-colors hover:border-azure/45"
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
                        <span className="absolute inset-x-0 bottom-0 p-3.5">
                          <span className="block text-[13.5px] text-snow">{p.name}</span>
                          <span className="tnum mt-0.5 block text-[11px] text-mist">
                            {p.elevationM.toLocaleString("en-GB")} m
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                  {/* The route's high point is not the summit beside it. */}
                  <p className="mt-2.5 flex items-start gap-2 text-[11px] leading-relaxed text-mist-dim">
                    <Info size={12} strokeWidth={1.8} className="mt-px shrink-0" />
                    This trek reaches {trekAltitude(trek)}. It passes these mountains — it does not
                    climb them.
                  </p>
                </>
              )}
            </section>
          )}

          {tab === "The route" && (
            <section className="mt-6 max-w-[66ch]">
              <p className="section-label">Route and itinerary</p>
              <p className="mt-3 text-[13.5px] leading-relaxed text-mist">
                {trek.name} is a {trek.style.toLowerCase()} route in {region?.name ?? trek.country},
                normally walked over {trekDuration(trek).toLowerCase()} with a high point of{" "}
                {trekAltitude(trek)}.
              </p>
              {/*
                No generated itinerary. Day-by-day plans differ between operators
                and a made-up one is a safety document nobody wrote.
              */}
              <p className="mt-4 text-[13px] leading-relaxed text-mist-dim">
                ICEFALL does not publish a day-by-day itinerary for this route. Each operator plans
                its own stages, rest days and acclimatisation, and will send you theirs. Ask for it
                in writing before you pay a deposit.
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-mist-dim">
                We also hold no mapped line for this trek, so there is no route map on this page
                rather than an approximate one.
              </p>
            </section>
          )}

          {tab === "Preparation" && (
            <section className="mt-6">
              <p className="section-label">What this route asks of you</p>
              <ul className="mt-3 grid max-w-[66ch] gap-x-6 gap-y-2 sm:grid-cols-2">
                {requirementsFor(trek.difficulty, trek.maxAltitudeM).map((r) => (
                  <li key={r} className="flex items-start gap-2 text-[12.5px] leading-snug text-mist">
                    <Check size={13} className="mt-0.5 shrink-0 text-summit" strokeWidth={2.2} />
                    {r}
                  </li>
                ))}
              </ul>
              <p className="mt-4 max-w-[66ch] text-[11px] leading-relaxed text-mist-dim">
                General guidance from the route&rsquo;s grade and altitude, not a list from an
                operator. Your operator sets the actual entry requirements and kit list.
              </p>

              {trek.maxAltitudeM !== null && trek.maxAltitudeM >= 3500 && (
                <div className="mt-6 max-w-[66ch] rounded-card border border-alert/30 bg-alert/[0.06] p-5">
                  <p className="flex items-center gap-2 text-[12.5px] font-medium text-alert">
                    <ShieldCheck size={14} strokeWidth={1.9} />
                    Altitude
                  </p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
                    This route reaches {trekAltitude(trek)}. Above roughly 3,500 m, altitude
                    sickness is the usual reason people turn back, and it does not care how fit you
                    are. Take an itinerary with rest days built in, and treat a headache that will
                    not clear as a reason to descend.
                  </p>
                </div>
              )}
            </section>
          )}

          {tab === "Operators" && (
            <section className="mt-6">
              {operators.length === 0 ? (
                <>
                  <p className="text-[13px] text-mist">
                    No operator in this directory has listed {trek.name}.
                  </p>
                  <p className="mt-1.5 text-[12px] text-mist-dim">
                    ICEFALL has no trekking partnerships yet. When operators sign, the ones that run
                    this route appear here.
                  </p>
                </>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {operators.map((c) => (
                    <Link
                      key={c.id}
                      to={`/app/company/${c.id}`}
                      className="group flex items-center gap-3.5 rounded-card border border-hairline bg-graphite p-4 transition-colors hover:border-summit/45"
                    >
                      {c.logo ? (
                        <img
                          src={c.logo}
                          alt=""
                          aria-hidden
                          className="h-[46px] w-[46px] shrink-0 rounded-tile border border-hairline object-contain"
                        />
                      ) : (
                        <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-tile border border-hairline bg-slate/60 text-[12px] text-mist">
                          {monogram(c.name)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-snow">{c.name}</span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">{c.city}</span>
                      </span>
                      <ChevronRight
                        size={15}
                        strokeWidth={1.9}
                        className="shrink-0 text-mist-dim transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                  ))}
                </div>
              )}

              {guides.length > 0 && (
                <>
                  <p className="section-label mt-8">Guides who work these mountains</p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    {guides.map((g) => (
                      <Link
                        key={g.id}
                        to={`/app/guides/${g.id}`}
                        className="flex items-center gap-3 rounded-card border border-hairline bg-graphite p-4 transition-colors hover:border-azure/45"
                      >
                        <GuidePhoto name={g.name} src={g.photo} size={40} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-snow">{g.name}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-mist-dim">{g.basedIn}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {tab === "FAQ" && (
            <dl className="mt-6 max-w-[68ch] divide-y divide-hairline border-y border-hairline">
              {faqFor(trek.name, trek.difficulty, trek.maxAltitudeM, trek.season).map((f) => (
                <div key={f.q} className="py-4">
                  <dt className="text-[13.5px] text-snow">{f.q}</dt>
                  <dd className="mt-1.5 text-[12.5px] leading-relaxed text-mist">{f.a}</dd>
                </div>
              ))}
            </dl>
          )}

          {nearby.length > 0 && (
            <section className="mt-10">
              <div className="flex items-baseline justify-between">
                <p className="section-label">More in {region?.name ?? trek.country}</p>
                <Link
                  to={`/app/treks?region=${trek.regionId}`}
                  className="text-[11.5px] text-azure hover:text-azure-bright"
                >
                  View all
                </Link>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {nearby.map((t) => (
                  <TrekCard key={t.id} trek={t} operators={operatorsForTrek(t.id).length} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-card border border-hairline bg-graphite p-5">
            <p className="section-label">Walk this route</p>
            <p className="tnum mt-2.5 text-[13px] text-snow">Price on enquiry</p>
            {/* No invented "from" figure — see the note in trekTypes.ts. */}
            <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">
              Trek prices depend on the operator, the group size and the season. No operator has
              published one to ICEFALL.
            </p>
            <Link
              to="/app/messages"
              className="mt-4 flex h-11 items-center justify-center gap-2 rounded-tile bg-azure-cta text-[13px] font-medium text-obsidian transition-opacity hover:opacity-90"
            >
              <MessageSquare size={14} strokeWidth={1.9} />
              Enquire about this trek
            </Link>
            <button
              type="button"
              onClick={() => setTab("Operators")}
              className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-tile border border-hairline-strong text-[12.5px] text-snow transition-colors hover:border-summit/50"
            >
              <Users size={13} strokeWidth={1.9} />
              {operators.length > 0
                ? `See ${operators.length} ${operators.length === 1 ? "operator" : "operators"}`
                : "Find operators"}
            </button>
          </section>

          <section className="rounded-card border border-hairline bg-graphite p-5">
            <p className="section-label">At a glance</p>
            <dl className="mt-3.5 space-y-2.5">
              <Row k="Region" v={region?.name ?? "Not specified"} />
              <Row k="Country" v={trek.country} />
              <Row k="Style" v={trek.style} />
              <Row k="Duration" v={trekDuration(trek)} />
              <Row k="Highest point" v={trekAltitude(trek)} />
              <Row k="Difficulty" v={trek.difficulty ?? "Not specified"} />
              <Row k="Season" v={trek.season ?? "Not specified"} />
            </dl>
          </section>
        </aside>
      </div>

      {IS_DEMO && (
        <p className="mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-mist-dim">
          Route facts — duration, high point, season and grade — are published figures for this
          trek. {DEMO_NOTICE}
        </p>
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Clock; value: string; label: string }) {
  const unknown = value === "Not specified";
  return (
    <div className="bg-graphite px-4 py-3.5">
      <Icon size={15} strokeWidth={1.7} className="text-summit" />
      <p className={cn("tnum mt-2 leading-tight", unknown ? "text-[11.5px] text-mist-dim" : "text-[14px] text-snow")}>
        {value}
      </p>
      <p className="mt-0.5 text-[10.5px] text-mist-dim">{label}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11.5px] text-mist-dim">{k}</dt>
      <dd className={cn("text-right text-[12px]", v === "Not specified" ? "text-mist-dim" : "text-snow")}>{v}</dd>
    </div>
  );
}

/** Requirements from the grade and the altitude. Rules of thumb, labelled. */
function requirementsFor(d: string | null, alt: number | null): string[] {
  const out: string[] = [];
  if (d === "Very strenuous") out.push("Consecutive long days on rough ground", "Previous multi-day trekking");
  else if (d === "Strenuous") out.push("Six to eight hours of walking a day", "Comfortable on uneven ground");
  else if (d === "Moderate") out.push("Four to six hours of walking a day", "Reasonable hill fitness");
  else if (d === "Easy") out.push("A few hours of walking a day", "No previous experience needed");
  else out.push("Check the grade with your operator before booking");

  if (alt !== null && alt >= 5000) out.push("Prior nights above 4,000 m", "An itinerary with rest days");
  else if (alt !== null && alt >= 3500) out.push("Time to acclimatise above 3,000 m");
  out.push("Travel and evacuation insurance", "Broken-in boots");
  return out;
}

function faqFor(name: string, d: string | null, alt: number | null, season: string | null) {
  return [
    {
      q: "Do I need climbing experience?",
      a: "No. This is a trek — a walking route. It asks for fitness, the right kit and time to acclimatise, not ropes or crampons. Any section that needs technical skill is run by the operator with the equipment for it.",
    },
    {
      q: "How high does it actually go?",
      a:
        alt === null
          ? "ICEFALL does not hold a verified high point for this route. Ask your operator for the figure before you book."
          : `The high point of the route is ${alt.toLocaleString("en-GB")} m. That is the highest you stand on the trek — not the summit of any mountain it passes.`,
    },
    {
      q: "When should I go?",
      a: season
        ? `The usual window is ${season}. That is the season operators work, not a forecast — conditions in any given week decide what happens.`
        : "ICEFALL does not hold a verified season for this route. Ask the operator which months they run it.",
    },
    {
      q: "How hard is it?",
      a: d
        ? `Graded ${d.toLowerCase()}. Grades vary between operators, so treat this as a guide and ask what a typical day looks like.`
        : "ICEFALL does not hold a verified grade for this route.",
    },
    {
      q: `Can I book ${name} through ICEFALL?`,
      a: "No. ICEFALL lists routes and the operators who run them; you book with the operator directly and ICEFALL takes no part in the transaction.",
    },
  ];
}
