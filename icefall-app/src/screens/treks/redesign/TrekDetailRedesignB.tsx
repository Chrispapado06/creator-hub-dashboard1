import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  Compass,
  Download,
  Maximize2,
  MessageSquare,
  Share2,
  X,
} from "lucide-react";
import { Disclaimer, sharePage } from "@/components/ui/primitives";
import { useDetailBack } from "@/components/layout/chrome";
import { LiquidGlassButton, LiquidGlassCircle } from "@/components/ui/LiquidGlassButton";
import { RouteWaypointMap } from "@/components/domain/RouteWaypointMap";
import { ElevationProfile } from "@/components/domain/TrailProfile";
import { TRAIL_ATTRIBUTION } from "@/services/trails";
import { downloadGpx } from "@/lib/gpx";
import { FOLLOW_ONE_LINE, followHref } from "@/tracking/follow";
import { OFFLINE } from "@/offline/offline";
import { trekRoute } from "@/treks/route";
import {
  peaksForTrek,
  trekAltitude,
  trekById,
  trekDuration,
  trekRegion,
  treksInRegion,
  type Trek,
} from "@/treks";
import { MOUNTAINS } from "@/data/mock/mountains";
import { trekImage, trekImageCaption, trekImageSubject, trekPhotoCredit } from "@/treks/images";
import { DEMO_NOTICE, OPERATOR_DISCLAIMER, operatorsFor, type Operator } from "@/services/operators";
import { OperatorCard } from "@/components/domain/OperatorCard";
import { DEFAULT_REDESIGN_TREK_ID, DraftBanner, sampleSpacing, useMappedRoute } from "./shared";

const SECTIONS = [
  { id: "route", label: "Route" },
  { id: "prepare", label: "Prepare" },
  { id: "companies", label: "Companies" },
  { id: "nearby", label: "Nearby" },
] as const;

const SHEET_LAP_PX = 20;

/**
 * DIRECTION B — "ONE SCROLL".
 *
 * The genuinely different one of the three: no tab strip, no switching
 * between five separate panes. Everything — the summary, the map, what to
 * prepare, the companies, the nearby routes — is ONE continuous page, the
 * way an AllTrails or a long-form article reads, with a row of jump chips
 * under the hero that scroll to a section instead of replacing it. A
 * reviewer scrolling this one sees the whole page in one gesture; nothing is
 * hidden behind a tab they might not tap.
 *
 * Still no boxes — hairlines and space carry every section, exactly as in
 * Direction A — and the "how this line was matched" disclosure is dropped
 * the same way: one line of provenance under the map heading, no toggle, no
 * evidence list, no confidence grade.
 */
export default function TrekDetailRedesignB() {
  const { id = "" } = useParams();
  const trek = trekById(id);
  const route = trek ? trekRoute(trek.id) : undefined;
  const goBack = useDetailBack("/explore/treks");

  const region = trek ? trekRegion(trek.regionId) : undefined;
  const peaks = useMemo(
    () =>
      trek
        ? peaksForTrek(trek)
            .map((p) => MOUNTAINS.find((m) => m.id === p)!)
            .filter(Boolean)
        : [],
    [trek],
  );
  const alsoHere = useMemo(
    () => (trek ? treksInRegion(trek.regionId).filter((t) => t.id !== trek.id).slice(0, 4) : []),
    [trek],
  );
  const operators = useMemo(() => {
    if (!trek || trek.maxAltitudeM === null) return [];
    return operatorsFor({ country: trek.country, elevationM: trek.maxAltitudeM });
  }, [trek]);

  const refs = {
    route: useRef<HTMLDivElement | null>(null),
    prepare: useRef<HTMLDivElement | null>(null),
    companies: useRef<HTMLDivElement | null>(null),
    nearby: useRef<HTMLDivElement | null>(null),
  } as const;

  if (!trek) return <Navigate to={`/dev/treks-redesign-b/${DEFAULT_REDESIGN_TREK_ID}`} replace />;

  const credit = trekPhotoCredit(trek.id);
  const subject = trekImageSubject(trek);

  return (
    <div className="no-scrollbar relative flex h-full flex-col overflow-y-auto">
      <DraftBanner current="b" />

      <div className="on-dark relative shrink-0 bg-slate" style={{ height: `calc(34vh + ${SHEET_LAP_PX}px)`, maxHeight: `${340 + SHEET_LAP_PX}px`, minHeight: `${230 + SHEET_LAP_PX}px` }}>
        <img src={trekImage(trek)} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
        <div className="scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 h-2/3" />
        <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between">
          <LiquidGlassCircle icon={ChevronLeft} label="Back" onClick={goBack} className="pointer-events-auto" />
          <LiquidGlassCircle icon={Share2} label="Share" onClick={() => sharePage(`${trek.name} · ICEFALL`)} className="pointer-events-auto" />
        </div>
        <div className="absolute inset-x-0 px-5 text-[10px] leading-relaxed text-mist-dim" style={{ bottom: `${SHEET_LAP_PX + 8}px` }}>
          <p className="truncate">
            {credit ? (
              <>
                {credit.credit ? `Photograph: ${credit.credit}` : "Photograph"} ·{" "}
                <a href={credit.pageUrl} target="_blank" rel="noreferrer noopener" className="text-azure underline underline-offset-2">
                  {credit.license}
                </a>{" "}
                · Wikimedia Commons
              </>
            ) : (
              trekImageCaption(trek)
            )}
          </p>
          {subject && <p className="mt-0.5 truncate text-[10.5px] text-mist">This is {subject}, a mountain the route visits — not a photograph of the route.</p>}
        </div>
      </div>

      <div className="relative z-[1] rounded-t-[22px] bg-obsidian px-5" style={{ marginTop: `-${SHEET_LAP_PX}px`, paddingTop: `${SHEET_LAP_PX - 2}px` }}>
        <h1 className="text-[26px] font-light leading-[1.15] text-snow">{trek.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-mist">
          <span className="text-snow">{trek.country}</span>
          {region && (
            <>
              <span className="text-mist-dim">·</span>
              <span>{region.name}</span>
            </>
          )}
          <span className="text-mist-dim">·</span>
          <span>{trek.style}</span>
        </div>

        {/* THE PULL-QUOTE. The summary, set large and unclamped — this
            direction leads with the writing rather than folding it under a
            "Show more". */}
        <p className="mt-4 text-[15px] leading-relaxed text-mist">{trek.summary}</p>

        {/* Big figures, laid out as a single row of numbers rather than a
            bordered stat block. */}
        <div className="mt-5 flex items-end gap-7 border-y border-hairline py-4">
          <BigFigure value={trek.durationDays ? trekDuration(trek) : "—"} label="Duration" />
          <BigFigure value={trek.difficulty ?? "—"} label="Difficulty" />
          <BigFigure value={trek.maxAltitudeM !== null ? trekAltitude(trek) : "—"} label="High point" />
        </div>
        <p className="mt-3 text-[12px] text-mist-dim">Season: <span className="text-snow">{trek.season ?? "—"}</span></p>

        {/* JUMP CHIPS — the one navigation control on the page. No active
            tab, no hidden panes; they just scroll. */}
        <div className="no-scrollbar -mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => refs[s.id].current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="shrink-0 whitespace-nowrap rounded-full border border-hairline-strong px-3.5 py-1.5 text-[12px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
            >
              {s.label}
            </button>
          ))}
        </div>

        {peaks.length > 0 && (
          <div className="mt-6 border-t border-hairline pt-5">
            <p className="section-label text-mist">Mountains on this route</p>
            <div className="mt-3 space-y-3">
              {peaks.map((m) => (
                <Link key={m.id} to={`/explore/mountain/${m.id}`} className="flex items-center gap-3">
                  <img src={m.photo} alt="" className="h-10 w-14 rounded-lg object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-mist">{m.name}</p>
                    <p className="tnum text-xs text-mist/50">{m.elevationM.toLocaleString("en-GB")} m</p>
                  </div>
                </Link>
              ))}
            </div>
            <p className="mt-2.5 text-[11px] text-mist/45">The route goes to or around these. It does not climb them.</p>
          </div>
        )}

        {/* ---- Route ------------------------------------------------- */}
        <div ref={refs.route} className="mt-8 scroll-mt-14 border-t border-hairline pt-6">
          <p className="section-label text-mist">The route</p>
          {route ? (
            <div className="mt-3">
              <TrekRouteMap trek={trek} route={route} />
            </div>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-mist/70">
              This route has not been matched to a mapped line, so there is no map, elevation profile
              or GPX file for it yet.
            </p>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-mist-dim border-l border-azure/30 pl-3">
            ICEFALL does not publish a day-by-day itinerary for this route. Stages differ between
            operators and we hold none of theirs — what is above is the route, not a schedule.
          </p>
        </div>

        {/* ---- Prepare ------------------------------------------------ */}
        <div ref={refs.prepare} className="mt-8 scroll-mt-14 border-t border-hairline pt-6">
          <p className="section-label text-mist">What it asks of you</p>
          <ul className="mt-3 space-y-2.5 text-sm text-mist/80">
            {prepFor(trek.difficulty, trek.maxAltitudeM).map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-azure" />
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-mist-dim border-l border-azure/30 pl-3">
            These follow from the route's grade and its highest point, not from a particular
            operator's requirements. Anyone selling this walk will have their own.
          </p>
        </div>

        {/* ---- Companies ------------------------------------------------ */}
        <div ref={refs.companies} className="mt-8 scroll-mt-14 border-t border-hairline pt-6">
          <TrekCompanies trek={trek} operators={operators} />
        </div>

        {/* ---- Nearby ------------------------------------------------ */}
        <div ref={refs.nearby} className="mt-8 scroll-mt-14 border-t border-hairline pt-6 pb-2">
          {alsoHere.length === 0 ? (
            <p className="text-sm text-mist/60">No other route in {region?.name ?? "this region"} yet.</p>
          ) : (
            <>
              <p className="mb-1 flex items-center gap-1.5 text-xs text-mist/50">
                <Compass className="h-3.5 w-3.5" />
                Also in {region?.name}
              </p>
              {/* A plain list, not a card grid — the "no boxes" rule applies
                  here too, so this does not reach for `TrekCard`, which wraps
                  in the app's bordered `Card`. */}
              <div className="divide-y divide-hairline">
                {alsoHere.map((t) => (
                  <Link
                    key={t.id}
                    to={`/explore/trek/${t.id}`}
                    className="flex items-center justify-between py-3"
                  >
                    <span className="min-w-0 truncate text-[13.5px] text-mist">{t.name}</span>
                    <span className="tnum shrink-0 pl-3 text-[11.5px] text-mist/50">{trekDuration(t)}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-auto h-4 shrink-0" />

      <div className="sticky bottom-0 z-20 shrink-0 border-t border-hairline bg-obsidian/70 px-5 pt-3 backdrop-blur-xl" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="flex items-stretch gap-2.5">
          <Link to="/messages/new" className="flex h-11 grow basis-0 items-center justify-center gap-2 rounded-pill bg-azure text-[13.5px] text-obsidian transition-colors hover:bg-azure-bright">
            <MessageSquare size={16} strokeWidth={1.8} />
            Enquire
          </Link>
          <LiquidGlassButton
            onClick={() => refs.companies.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="h-11 grow basis-0 text-[13.5px]"
          >
            <Compass size={16} strokeWidth={1.8} />
            Companies
          </LiquidGlassButton>
        </div>
      </div>
    </div>
  );
}

function BigFigure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="tnum text-[19px] font-light leading-none text-snow">{value}</p>
      <p className="mt-1.5 text-[10px] uppercase tracking-[0.08em] text-mist-dim">{label}</p>
    </div>
  );
}

function TrekRouteMap({ trek, route }: { trek: Trek; route: NonNullable<ReturnType<typeof trekRoute>> }) {
  const navigate = useNavigate();
  const { line, paths, facts, style, waiting, haveLine, blocked, followStopped } = useMappedRoute(route);
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const glaciated = /glacier|glaciated|crevasse|crampon|rope|technical/i.test(trek.summary);
  const high = trek.maxAltitudeM !== null && trek.maxAltitudeM >= 3500;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] text-mist-dim">
          OpenStreetMap · relation {route.osmId}
        </p>
        {route.lengthKm !== null && <p className="tnum text-[11.5px] text-mist">{route.lengthKm.toLocaleString("en-GB")} km</p>}
      </div>

      <div className={`relative mt-2.5 bg-graphite ${full ? "fixed inset-0 z-50" : "h-[260px] overflow-hidden rounded-card border border-hairline"}`}>
        <RouteWaypointMap
          line={line}
          paths={paths}
          start={line[0] ?? { lat: route.lat, lon: route.lon }}
          center={{ lat: route.lat, lon: route.lon }}
          waypoints={[]}
          styleId={style}
          className="absolute inset-0 h-full w-full"
        />
        {!haveLine && !OFFLINE && (
          <div className="pointer-events-none absolute left-3 right-14 top-3 rounded-xl bg-obsidian/85 px-3 py-2 backdrop-blur">
            <p className="text-[11.5px] leading-relaxed text-mist">
              {waiting ? "Fetching the line from OpenStreetMap…" : "OpenStreetMap sent no line for this relation."}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setFull((v) => !v)}
          aria-label={full ? "Close the full-screen map" : "Show the map full screen"}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-hairline-strong bg-obsidian/85 text-mist backdrop-blur transition-colors hover:text-snow"
        >
          {full ? <X size={16} strokeWidth={1.8} /> : <Maximize2 size={16} strokeWidth={1.8} />}
        </button>
      </div>

      {facts.elevation && route.lengthKm !== null && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] text-mist-dim">Elevation</p>
            <p className="tnum text-[11.5px] text-mist">
              ↑ at least {facts.elevation.ascentM.toLocaleString()} m · ↓ at least {facts.elevation.descentM.toLocaleString()} m
            </p>
          </div>
          <ElevationProfile className="mt-2.5" elevation={facts.elevation} lengthKm={route.lengthKm} />
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
            Sampled from a global elevation model along the mapped line, not surveyed — one reading about every{" "}
            {sampleSpacing(route.lengthKm, facts.elevation.points.length).toLocaleString("en-GB", { maximumFractionDigits: 1 })} km.
            This route's published high point is {trekAltitude(trek)}.
          </p>
        </div>
      )}

      {OFFLINE ? (
        <p className="mt-5 text-[11.5px] leading-relaxed text-mist-dim">
          The GPX file and the route-following screen are both written from the relation's own geometry,
          which is fetched rather than stored. This build has no connection, so there is no line yet — for either.
        </p>
      ) : (
        <>
          <button
            type="button"
            disabled={followStopped !== null}
            onClick={() => navigate(followHref("trekking", { osmId: route.osmId, name: trek.name }))}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-azure text-[13.5px] text-obsidian transition-colors hover:bg-azure-bright disabled:pointer-events-none disabled:opacity-45"
          >
            <Compass size={16} strokeWidth={1.8} />
            Start Route
          </button>
          <p className="mt-1.5 text-center text-[11px] leading-relaxed text-mist-dim">{followStopped ?? FOLLOW_ONE_LINE}</p>

          <button
            type="button"
            disabled={blocked !== null}
            onClick={() => downloadGpx(trek.name, paths)}
            className="mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-pill border border-hairline-strong text-[13.5px] text-snow transition-colors hover:border-azure/50 disabled:pointer-events-none disabled:opacity-45"
          >
            <Download size={16} strokeWidth={1.8} />
            Download GPX
          </button>
          <p className="mt-1.5 text-center text-[11px] leading-relaxed text-mist-dim">
            {blocked ?? `${line.length.toLocaleString()} points · for a watch or handheld`}
          </p>
        </>
      )}

      <Disclaimer className="mt-5">
        This line is OpenStreetMap data, surveyed by volunteers. It can be out of date, incomplete or
        wrong, and it says nothing about whether the route is open, in condition or passable today.
        Carry a map and compass and know how to use them.
        {(glaciated || high) && (
          <>
            {" "}
            This route {glaciated ? "crosses glaciated or technical ground" : ""}
            {glaciated && high ? " and " : ""}
            {high ? `reaches ${trekAltitude(trek)}` : ""}: for that ICEFALL defers to an
            IFMGA/UIAGM-certified guide, whose judgement is made in person and not by an app.
          </>
        )}
      </Disclaimer>
      <p className="mt-2 text-[10.5px] text-mist-dim">{TRAIL_ATTRIBUTION}</p>
    </div>
  );
}

function TrekCompanies({ trek, operators }: { trek: Trek; operators: Operator[] }) {
  const highPoint = trek.maxAltitudeM;

  if (highPoint === null) {
    return (
      <p className="text-sm leading-relaxed text-mist/80">
        No high point is published for this route, and companies are matched partly on the altitude
        they work at. Rather than list every operator in the directory and let the order imply a
        match nobody made, this shows none.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="section-label text-mist">Companies working this route</p>
        <p className="mt-2 text-xs leading-relaxed text-mist/55">
          Matched to {trek.country} and to the {trekAltitude(trek)} high point of this walk — not
          booked, endorsed or paid for. Ordered by that match, then alphabetically.
        </p>
      </div>

      {operators.some((o) => o.demo) && <Disclaimer>{DEMO_NOTICE}</Disclaimer>}

      {operators.length === 0 ? (
        <p className="text-sm leading-relaxed text-mist/80">
          No listing in the directory covers {trek.country} at this altitude. That is a gap in
          ICEFALL's directory, not a statement about who guides this route — plenty of companies will.
        </p>
      ) : (
        <div className="space-y-2.5">
          {operators.map((o, i) => (
            <OperatorCard key={o.id} operator={o} lead={i === 0} rank={i === 0 ? undefined : i + 1} peak={{ name: trek.name, elevationM: highPoint }} />
          ))}
        </div>
      )}

      <Disclaimer>{OPERATOR_DISCLAIMER}</Disclaimer>
    </div>
  );
}

function prepFor(difficulty: string | null, maxAltitudeM: number | null): string[] {
  const out: string[] = [];
  switch (difficulty) {
    case "Easy":
      out.push("Comfortable walking for a few hours at a time");
      break;
    case "Moderate":
      out.push("Full days on a path, back to back", "A head for some exposure");
      break;
    case "Strenuous":
      out.push("Long days with sustained ascent and descent", "Confidence on rough or unmade ground");
      break;
    case "Very strenuous":
      out.push(
        "Consecutive long days, often unsupported",
        "Navigation where the route is unmarked",
        "Tolerance of remoteness and bad weather",
      );
      break;
    default:
      out.push("Grade not published for this route");
  }
  if (maxAltitudeM !== null) {
    if (maxAltitudeM >= 5000) out.push("Acclimatisation above 5,000 m, and days built in to get it");
    else if (maxAltitudeM >= 3500) out.push("Nights above 3,500 m — altitude is the main difficulty");
    else if (maxAltitudeM >= 2000) out.push("Some time above 2,000 m");
  }
  return out;
}
