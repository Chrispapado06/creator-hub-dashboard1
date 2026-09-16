import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Compass, Download, MessageSquare, Share2 } from "lucide-react";
import { Disclaimer, sharePage } from "@/components/ui/primitives";
import { useDetailBack } from "@/components/layout/chrome";
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

/**
 * DIRECTION C — "BRIEF".
 *
 * The most compact of the three. Where A keeps the reference's full-bleed
 * hero and B leads with a large pull-quote, C treats a trek like a spec
 * sheet: a small banner rather than a photograph running under the status
 * bar, a flat fact table immediately below it, and the summary paragraph
 * collapsed behind "About this route" instead of printed in full — this is
 * the direction for a reader who wants the numbers first and the prose only
 * if they ask for it.
 *
 * No boxes, same as A and B. The "how this line was matched" disclosure is
 * dropped the same way — one caption line, no toggle, no evidence.
 */
export default function TrekDetailRedesignC() {
  const { id = "" } = useParams();
  const trek = trekById(id);
  const route = trek ? trekRoute(trek.id) : undefined;
  const goBack = useDetailBack("/explore/treks");
  const [aboutOpen, setAboutOpen] = useState(false);

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

  if (!trek) return <Navigate to={`/dev/treks-redesign-c/${DEFAULT_REDESIGN_TREK_ID}`} replace />;

  const credit = trekPhotoCredit(trek.id);
  const subject = trekImageSubject(trek);

  return (
    <div className="no-scrollbar relative flex h-full flex-col overflow-y-auto bg-obsidian">
      <DraftBanner current="c" />

      {/* ---- In-flow header, not a floating glass control — a brief has an
          ordinary top bar, not a photograph running under the status bar. */}
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <button type="button" onClick={goBack} aria-label="Back" className="-ml-2 grid h-9 w-9 place-items-center rounded-full text-mist hover:text-snow">
          <ChevronLeft size={20} strokeWidth={1.6} />
        </button>
        <button type="button" onClick={() => sharePage(`${trek.name} · ICEFALL`)} aria-label="Share" className="-mr-2 grid h-9 w-9 place-items-center rounded-full text-mist hover:text-snow">
          <Share2 size={17} strokeWidth={1.6} />
        </button>
      </div>

      {/* ---- Small banner, not a hero ------------------------------------ */}
      <div className="relative mx-5 h-[130px] shrink-0 overflow-hidden rounded-card bg-slate">
        <img src={trekImage(trek)} alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <p className="mx-5 mt-1.5 truncate text-[10px] leading-relaxed text-mist-dim">
        {credit ? (
          <>
            {credit.credit ? `Photograph: ${credit.credit}` : "Photograph"} ·{" "}
            <a href={credit.pageUrl} target="_blank" rel="noreferrer noopener" className="text-azure underline underline-offset-2">
              {credit.license}
            </a>
          </>
        ) : (
          trekImageCaption(trek)
        )}
      </p>
      {subject && <p className="mx-5 mt-0.5 truncate text-[10px] text-mist-dim">This is {subject} — not a photograph of the route.</p>}

      <div className="px-5">
        <h1 className="mt-4 text-[22px] font-medium leading-[1.15] text-snow">{trek.name}</h1>

        {/* ---- The fact table, immediately, before any prose --------------- */}
        <div className="mt-4 divide-y divide-hairline border-y border-hairline">
          <FactRow k="Country" v={trek.country} />
          <FactRow k="Region" v={region?.name ?? "Not specified"} />
          <FactRow k="Style" v={trek.style} />
          <FactRow k="Duration" v={trek.durationDays ? trekDuration(trek) : "—"} />
          <FactRow k="Difficulty" v={trek.difficulty ?? "—"} />
          <FactRow k="High point" v={trek.maxAltitudeM !== null ? trekAltitude(trek) : "—"} />
          <FactRow k="Season" v={trek.season ?? "—"} />
        </div>

        {/* ---- About, collapsed ------------------------------------------- */}
        <button
          type="button"
          onClick={() => setAboutOpen((v) => !v)}
          className="mt-4 flex w-full items-center justify-between py-1 text-left"
        >
          <span className="text-[13px] text-snow">About this route</span>
          <ChevronRight size={15} strokeWidth={1.8} className={`text-mist-dim transition-transform ${aboutOpen ? "rotate-90" : ""}`} />
        </button>
        {aboutOpen && <p className="mt-1 text-[13px] leading-relaxed text-mist/80">{trek.summary}</p>}

        {peaks.length > 0 && (
          <div className="mt-5 border-t border-hairline pt-4">
            <p className="text-[11px] uppercase tracking-[0.08em] text-mist-dim">Mountains on this route</p>
            <div className="mt-2.5 space-y-2.5">
              {peaks.map((m) => (
                <Link key={m.id} to={`/explore/mountain/${m.id}`} className="flex items-center justify-between">
                  <span className="text-[13px] text-mist">{m.name}</span>
                  <span className="tnum text-[12px] text-mist/50">{m.elevationM.toLocaleString("en-GB")} m</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ---- Route --------------------------------------------------- */}
        <div className="mt-5 border-t border-hairline pt-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-mist-dim">Route</p>
          {route ? (
            <div className="mt-3">
              <TrekRouteMap trek={trek} route={route} />
            </div>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-mist/70">No mapped line for this route yet — no map, profile or GPX file.</p>
          )}
          <p className="mt-3 text-[10.5px] leading-relaxed text-mist-dim">
            No day-by-day itinerary is published. Stages vary by operator.
          </p>
        </div>

        {/* ---- Prepare --------------------------------------------------- */}
        <div className="mt-5 border-t border-hairline pt-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-mist-dim">What it asks of you</p>
          <ul className="mt-2.5 space-y-2 text-[13px] text-mist/80">
            {prepFor(trek.difficulty, trek.maxAltitudeM).map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-azure" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        {/* ---- Companies --------------------------------------------------- */}
        <div className="mt-5 border-t border-hairline pt-4">
          <TrekCompanies trek={trek} operators={operators} />
        </div>

        {/* ---- Nearby, as a compact list not a card grid ------------------- */}
        {alsoHere.length > 0 && (
          <div className="mt-5 border-t border-hairline pt-4 pb-2">
            <p className="text-[11px] uppercase tracking-[0.08em] text-mist-dim">Also in {region?.name}</p>
            <div className="mt-2.5 divide-y divide-hairline">
              {alsoHere.map((t) => (
                <Link key={t.id} to={`/explore/trek/${t.id}`} className="flex items-center justify-between py-2.5">
                  <span className="min-w-0 truncate text-[13px] text-mist">{t.name}</span>
                  <span className="tnum shrink-0 pl-3 text-[11px] text-mist/50">{trekDuration(t)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-auto h-4 shrink-0" />

      <div className="sticky bottom-0 z-20 shrink-0 border-t border-hairline bg-obsidian/85 px-5 pt-3 backdrop-blur-xl" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
        <Link to="/messages/new" className="flex h-11 w-full items-center justify-center gap-2 rounded-pill bg-azure text-[13.5px] text-obsidian transition-colors hover:bg-azure-bright">
          <MessageSquare size={16} strokeWidth={1.8} />
          Enquire
        </Link>
      </div>
    </div>
  );
}

function FactRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[12.5px] text-mist-dim">{k}</dt>
      <dd className="tnum text-right text-[13px] text-snow">{v}</dd>
    </div>
  );
}

function TrekRouteMap({ trek, route }: { trek: Trek; route: NonNullable<ReturnType<typeof trekRoute>> }) {
  const navigate = useNavigate();
  const { line, paths, facts, style, waiting, haveLine, blocked, followStopped } = useMappedRoute(route);

  const glaciated = /glacier|glaciated|crevasse|crampon|rope|technical/i.test(trek.summary);
  const high = trek.maxAltitudeM !== null && trek.maxAltitudeM >= 3500;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[11px] text-mist-dim">
        <span>OSM relation {route.osmId}</span>
        {route.lengthKm !== null && <span className="tnum">{route.lengthKm.toLocaleString("en-GB")} km</span>}
      </div>

      <div className="relative mt-2 h-[220px] overflow-hidden rounded-card border border-hairline bg-graphite">
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
          <div className="pointer-events-none absolute left-2 right-2 top-2 rounded-lg bg-obsidian/85 px-2.5 py-1.5">
            <p className="text-[10.5px] leading-relaxed text-mist">
              {waiting ? "Fetching the line…" : "No line sent for this relation."}
            </p>
          </div>
        )}
      </div>

      {facts.elevation && route.lengthKm !== null && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-[11px] text-mist-dim">
            <span>Elevation</span>
            <span className="tnum">↑ ≥{facts.elevation.ascentM.toLocaleString()} m · ↓ ≥{facts.elevation.descentM.toLocaleString()} m</span>
          </div>
          <ElevationProfile className="mt-2" elevation={facts.elevation} lengthKm={route.lengthKm} />
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-mist-dim">
            Modelled, not surveyed — one reading about every{" "}
            {sampleSpacing(route.lengthKm, facts.elevation.points.length).toLocaleString("en-GB", { maximumFractionDigits: 1 })} km.
          </p>
        </div>
      )}

      {OFFLINE ? (
        <p className="mt-4 text-[11px] leading-relaxed text-mist-dim">No connection — the line, file and elevation are fetched, not stored.</p>
      ) : (
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            disabled={followStopped !== null}
            onClick={() => navigate(followHref("trekking", { osmId: route.osmId, name: trek.name }))}
            className="flex h-10 grow basis-0 items-center justify-center gap-1.5 rounded-pill bg-azure text-[12.5px] text-obsidian transition-colors hover:bg-azure-bright disabled:pointer-events-none disabled:opacity-45"
          >
            <Compass size={14} strokeWidth={1.8} />
            Start
          </button>
          <button
            type="button"
            disabled={blocked !== null}
            onClick={() => downloadGpx(trek.name, paths)}
            className="flex h-10 grow basis-0 items-center justify-center gap-1.5 rounded-pill border border-hairline-strong text-[12.5px] text-snow transition-colors hover:border-azure/50 disabled:pointer-events-none disabled:opacity-45"
          >
            <Download size={14} strokeWidth={1.8} />
            GPX
          </button>
        </div>
      )}
      {!OFFLINE && (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-mist-dim">{followStopped ?? blocked ?? FOLLOW_ONE_LINE}</p>
      )}

      <Disclaimer className="mt-4">
        OpenStreetMap data, surveyed by volunteers — can be wrong or out of date, and says nothing
        about current conditions. Carry a map and compass.
        {(glaciated || high) && (
          <>
            {" "}
            This route {glaciated ? "crosses glaciated/technical ground" : ""}
            {glaciated && high ? " and " : ""}
            {high ? `reaches ${trekAltitude(trek)}` : ""}: ICEFALL defers to an IFMGA/UIAGM guide.
          </>
        )}
      </Disclaimer>
      <p className="mt-1.5 text-[10px] text-mist-dim">{TRAIL_ATTRIBUTION}</p>
    </div>
  );
}

function TrekCompanies({ trek, operators }: { trek: Trek; operators: Operator[] }) {
  const highPoint = trek.maxAltitudeM;

  if (highPoint === null) {
    return (
      <p className="text-[13px] leading-relaxed text-mist/80">
        No high point published, so companies cannot be matched by altitude — none are shown rather
        than a list the data does not support.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-[0.08em] text-mist-dim">Companies working this route</p>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist/55">
          Matched to {trek.country} and {trekAltitude(trek)} — not booked or endorsed.
        </p>
      </div>
      {operators.some((o) => o.demo) && <Disclaimer>{DEMO_NOTICE}</Disclaimer>}
      {operators.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-mist/80">No listing covers {trek.country} at this altitude yet.</p>
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
