import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown, Clock, Compass, Loader2, MapPin, Mountain as MountainIcon,
  MoveHorizontal, Navigation, Plus, Route as RouteIcon, RotateCw, Search,
  SlidersHorizontal, Star, TrendingUp, Users, X,
} from "lucide-react";
import { Rise, Stagger } from "@/components/layout/chrome";
import { useMountainImage } from "@/components/domain/MountainImage";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { MapBackdrop, MiniMap } from "@/components/domain/MiniMap";
import { fmtPeople, ratingFor } from "@/routes/ratings";
import { fmtDistance, fmtElevation } from "@/lib/format";
import { TRAINING_BANDS, routeRelevance, routesInBand } from "@/routes/relevance";
import { routePhoto } from "@/routes/model";
import {
  ACTIVITY_BANDS, ACTIVITY_OPTIONS, MAX_RADIUS_KM, RADIUS_OPTIONS, activityOption,
  paceFor, searchRoutes, type ActivityKind, type RouteHit,
} from "@/routes/search";
import {
  SUGGESTED_PLACES, areaIdFor, isWidePlace, lastPlace, locateMe, recentPlaces,
  rememberPlace, saveLastPlace, searchPlaces, type LocateError, type Place,
} from "@/routes/places";
import {
  mergePeaks, nearbyFromCatalogue, nearbyLive, rememberPeaks, type Peak,
} from "@/services/peaks";
import { enrichPeaks } from "@/services/peakWikidata";
import {
  NETWORK_LABEL, SAC_LABEL, cachedLengthKm, measureLength, nearbyTrails, type Trail,
} from "@/services/trails";
import { TrailImage } from "@/components/domain/TrailImage";
/**
 * What the card says when it is showing its plate.
 *
 * It does not apologise and it does not pretend. The old line — "representative
 * image of this kind of terrain" — was written to excuse a photograph of
 * somewhere else, and it was still a photograph of somewhere else. There is
 * nothing to excuse about a chart.
 */
const TRAIL_PLATE_CAPTION = "Contours — no verified photograph of this trail";
import { mapsDirectionsUrl, openMaps } from "@/lib/maps";
import { assessPeak } from "@/services/peakAssessment";
import { useCoachContext } from "@/coach/context";
import { cn } from "@/lib/utils";

/**
 * EXPLORE → ROUTES.
 *
 * You do not open an outdoor app knowing the name of the line you want — you
 * know roughly where you are and whether you are going for a run, a walk or a
 * mountain. So the search is WHERE + WHAT, with a radius, and everything else
 * filters on top.
 *
 * "Where" is anywhere on earth. ICEFALL's own documented routes cover ten
 * mountains, so most searches will find none — and rather than an empty screen,
 * those searches fall through to the real summits around that point, from
 * OpenStreetMap, each with its own photograph. What the app cannot do is
 * pretend to hold a route it does not have.
 */
export default function Routes() {
  const ctx = useCoachContext();
  const [place, setPlace] = useState<Place>(() => lastPlace());
  const [activity, setActivity] = useState<ActivityKind>("hiking");
  const [radiusKm, setRadiusKm] = useState(100);
  const [band, setBand] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "where" | "what" | "radius" | "filters">(null);

  const activityInfo = activityOption(activity);
  const radiusLabel = RADIUS_OPTIONS.find((r) => r.value === radiusKm)?.label ?? `within ${radiusKm} km`;
  // You are near a town; you are in a country. Getting this wrong is small and
  // it is the kind of small that makes a screen read as machine-generated.
  const placeIn = isWidePlace(place) ? "in" : "near";

  const hits = useMemo(() => {
    let list = searchRoutes({ base: place, activity, radiusKm });
    const b = TRAINING_BANDS.find((x) => x.id === band);
    if (b) list = routesInBand(list, b) as RouteHit[];
    return list;
  }, [place, activity, radiusKm, band]);

  // Named, waymarked trails from OpenStreetMap. Only for the activities they
  // actually answer — a hiking relation is not a mountaineering objective.
  const trails = useNearbyTrails(place, radiusKm, activity !== "mountaineering");
  const peaks = useNearbyPeaks(place, activity, radiusKm, hits.length === 0 && trails.list.length === 0);
  // Either half of the search going down means the screen knows nothing, and
  // must not report nothing as a finding.
  const searchFailed = trails.failed || peaks.failed;
  // Resolved for the whole list at once, so no two cards can show the same frame.

  function choose(next: Place) {
    setPlace(next);
    saveLastPlace(next);
    rememberPlace(next);
    setSheet(null);
  }

  return (
    <div className="no-scrollbar relative h-full overflow-y-auto">
      {/* ---- Search head ------------------------------------------------- */}
      <div className="relative">
        <div className="absolute inset-0 h-[210px] overflow-hidden">
          {/* The map you are searching from — the reference's orientation cue,
              and a real one: these are the actual tiles for this place. */}
          <MapBackdrop lat={place.lat} lon={place.lon} />
          <div className="absolute inset-0 bg-gradient-to-b from-obsidian/55 via-obsidian/55 to-obsidian" />
        </div>

        <div className="relative px-5 pb-3 pt-5">
          <button
            type="button"
            onClick={() => setSheet("where")}
            className="flex w-full items-center gap-2.5 rounded-tile border border-hairline bg-graphite/90 px-3.5 py-2.5 text-left backdrop-blur transition-colors hover:border-hairline-strong"
          >
            <MapPin size={16} strokeWidth={1.7} className="shrink-0 text-azure" />
            <span className="min-w-0 flex-1">
              <span className="section-label block text-[8px]">Where you are</span>
              <span className="block truncate text-[13.5px] text-snow">
                {place.name}
                {(place.kind || place.region) && (
                  <span className="text-mist-dim">
                    {" · "}
                    {[place.kind, place.region].filter(Boolean)[0]}
                  </span>
                )}
              </span>
            </span>
            <Search size={14} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
          </button>

          {/* What / radius / filters */}
          <div className="no-scrollbar mt-2.5 -mx-5 overflow-x-auto px-5">
            <div className="flex w-max items-center gap-2">
              <Pill onClick={() => setSheet("what")} icon={MountainIcon} caret active>
                {activityInfo.label}
              </Pill>
              <Pill onClick={() => setSheet("radius")} icon={MoveHorizontal} caret active={radiusKm !== null}>
                {radiusLabel}
              </Pill>
              <Pill onClick={() => setSheet("filters")} icon={SlidersHorizontal} active={Boolean(band)}>
                {band ? TRAINING_BANDS.find((b) => b.id === band)?.label : "Filters"}
              </Pill>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Count -------------------------------------------------------
          Silent when the search failed. "0 hiking routes near
          Chamonix-Mont-Blanc" is a claim about the Alps; what had actually
          happened was that Overpass did not answer. */}
      {!(searchFailed && hits.length + trails.total === 0) && (
        <div className="px-5 pb-1 text-center">
          <p className="tnum text-[12.5px] text-mist">
            {hits.length + trails.total} {activityInfo.label.toLowerCase()}
            {hits.length + trails.total === 1 ? " route" : " routes"} {placeIn} {place.name}
          </p>
        </div>
      )}

      {/* ---- Results ----------------------------------------------------- */}
      <Stagger className="px-5 pb-8">
        {hits.map((r) => (
          <Rise key={r.id} className="pt-3">
            <RouteResultCard hit={r} reason={routeRelevance(r, ctx).reason} />
          </Rise>
        ))}

        {/* Real trails, from OpenStreetMap. These are the answer to "where can I
            walk near here" almost everywhere on earth — ICEFALL's own catalogue
            documents twelve alpine lines and nothing else. */}
        {trails.list.length > 0 && (
          <>
            {hits.length > 0 && (
              <Rise className="pb-1 pt-7">
                <p className="section-label text-mist">Trails {placeIn} {place.name}</p>
              </Rise>
            )}
            {trails.list.map((t, i) => (
              <Rise key={t.id} className="pt-3">
                <TrailCard trail={t} />
              </Rise>
            ))}
            {trails.hasMore && (
              <Rise className="pt-3">
                <LoadMore
                  onClick={trails.loadMore}
                  shown={trails.list.length}
                  total={trails.total}
                  noun="trails"
                />
              </Rise>
            )}
            <Rise className="pt-3">
              <p className="text-[10.5px] leading-relaxed text-mist-dim">
                Named, waymarked trails from OpenStreetMap — the line, the length and the
                waymark are as mapped by the people who walk them. ICEFALL has not surveyed
                them and does not know today's conditions.
              </p>
            </Rise>
          </>
        )}

        {/* While the summits are still coming in, the loader IS the empty state —
            stacking "no routes here" on top of a spinner reads as a dead end
            when the screen is in fact still filling. */}
        {hits.length === 0 && (trails.loading || peaks.loading) && trails.list.length === 0 && (
          <SearchingSummits
            place={`${placeIn} ${place.name}`}
            stage={trails.loading ? "trails" : peaks.stage}
          />
        )}

        {/* `NoRoutes` asserts an absence, so it may only be shown when the
            search actually SUCCEEDED and came back empty. `trails.failed` was
            computed and never read: an Overpass outage rendered as "No hiking
            routes within 100 km of Chamonix-Mont-Blanc" — a statement about the
            world, made from a network error. */}
        {hits.length === 0 && trails.list.length === 0 && !trails.loading && !peaks.loading &&
          !trails.failed && !peaks.failed && (
          <NoRoutes place={place} activity={activity} radiusLabel={radiusLabel} />
        )}

        {hits.length === 0 && trails.list.length === 0 && !trails.loading && trails.failed && (
          <Rise className="pt-4">
            <div className="rounded-card border border-hairline bg-graphite p-4">
              <p className="text-[13px] text-snow">Couldn't reach the trail database.</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
                The walks around {place.name} come from OpenStreetMap, and it did not answer.
                This is a connection problem, not an empty map — it says nothing about what is
                actually near you.
              </p>
              <button
                type="button"
                onClick={trails.retry}
                className="mt-3 flex items-center gap-2 rounded-pill border border-azure/45 bg-azure/[0.08] px-3.5 py-2 text-[12.5px] text-azure transition-colors hover:bg-azure/[0.14]"
              >
                <RotateCw size={13} strokeWidth={1.9} />
                Try again
              </button>
            </div>
          </Rise>
        )}

        {hits.length === 0 && trails.list.length === 0 && !trails.failed &&
          !peaks.loading && peaks.failed && peaks.list.length === 0 && (
          <Rise className="pt-4">
            <div className="rounded-card border border-hairline bg-graphite p-4">
              <p className="text-[13px] text-snow">Couldn't reach the summit database.</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
                The peaks around {place.name} come from OpenStreetMap, and it did not answer.
                This is a connection problem, not an empty map — it says nothing about what is
                actually near you.
              </p>
              <button
                type="button"
                onClick={peaks.retry}
                className="mt-3 flex items-center gap-2 rounded-pill border border-azure/45 bg-azure/[0.08] px-3.5 py-2 text-[12.5px] text-azure transition-colors hover:bg-azure/[0.14]"
              >
                <RotateCw size={13} strokeWidth={1.9} />
                Try again
              </button>
            </div>
          </Rise>
        )}

        {/* Anywhere on earth: the summits actually around this point, even where
            ICEFALL holds no documented line. */}
        {hits.length === 0 && trails.list.length === 0 && peaks.list.length > 0 && (
          <>
            <Rise className="pb-1 pt-7">
              <p className="section-label text-mist">Mountains {placeIn} {place.name}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">
                Real summits from OpenStreetMap, with their own photographs. No route is
                documented on these yet — elevation and position are facts, the way up is not.
              </p>
            </Rise>
            {peaks.list.map((p, i) => (
              <Rise key={p.id} className="pt-3">
                <PeakCard peak={p} variant={i} />
              </Rise>
            ))}
            {peaks.hasMore && (
              <Rise className="pt-3">
                <LoadMore
                  onClick={peaks.loadMore}
                  shown={peaks.list.length}
                  total={peaks.total}
                  noun="summits"
                />
              </Rise>
            )}
            {/* Said out loud, because a list that quietly stops at an arbitrary
                radius looks like a list of everything there is. */}
            {peaks.narrowedToKm != null && (
              <Rise className="pt-3">
                <p className="text-[11px] leading-relaxed text-mist-dim">
                  There are more named summits around {place.name} than one search can carry, so
                  this covers the nearest {peaks.narrowedToKm} km rather than the full radius.
                  Move the pin or narrow the radius to search further out.
                </p>
              </Rise>
            )}
          </>
        )}

      </Stagger>

      {/* ---- Sheets ------------------------------------------------------ */}
      {sheet === "where" && <WhereSheet current={place} onPick={choose} onClose={() => setSheet(null)} />}

      {sheet && sheet !== "where" && (
        <Sheet
          title={
            sheet === "what" ? "What are you doing?"
              : sheet === "radius" ? "How far will you travel?"
              : "Filters"
          }
          onClose={() => setSheet(null)}
        >
          {sheet === "what" &&
            ACTIVITY_OPTIONS.map((a) => (
              <SheetRow key={a.id} active={a.id === activity} onClick={() => { setActivity(a.id); setSheet(null); }}
                   title={a.label} detail={a.detail} />
            ))}

          {sheet === "radius" &&
            RADIUS_OPTIONS.map((r) => (
              <SheetRow key={r.label} active={r.value === radiusKm} onClick={() => { setRadiusKm(r.value); setSheet(null); }}
                   title={r.label} detail={r.value === null ? "Every route ICEFALL holds" : `Straight-line from ${place.name}`} />
            ))}

          {sheet === "filters" && (
            <>
              <SheetRow active={band === null} onClick={() => { setBand(null); setSheet(null); }}
                   title="Any vertical" detail="No training filter" />
              {TRAINING_BANDS.map((b) => (
                <SheetRow key={b.id} active={band === b.id} onClick={() => { setBand(b.id); setSheet(null); }}
                     title={b.label} detail={b.detail} />
              ))}
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Where — anywhere on earth                                                  */
/* -------------------------------------------------------------------------- */

function WhereSheet({
  current, onPick, onClose,
}: {
  current: Place; onPick: (p: Place) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<LocateError | null>(null);
  const recents = useMemo(() => recentPlaces(), []);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced type-ahead. The abort matters: without it a slow "cha" can land
  // after "chamonix" and replace the right answer with a stale one.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(q, ctrl.signal)
        .then((r) => { if (!ctrl.signal.aborted) { setResults(r); setSearching(false); } })
        .catch(() => setSearching(false));
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  async function useHere() {
    setLocating(true);
    setLocateError(null);
    try {
      onPick(await locateMe());
    } catch (e) {
      setLocateError((e as LocateError) ?? "unavailable");
    } finally {
      setLocating(false);
    }
  }

  const showing = query.trim().length >= 2 ? results : recents.length ? recents : SUGGESTED_PLACES;

  return (
    <Sheet title="Where are you?" onClose={onClose}>
      <div className="py-3">
        <div className="flex items-center gap-2.5 rounded-tile border border-hairline bg-slate/60 px-3 py-2.5">
          <Search size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Any town or city, anywhere"
            aria-label="Search for a place"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-snow outline-none placeholder:text-mist-dim"
          />
          {searching && <Loader2 size={14} className="shrink-0 animate-spin text-mist-dim" />}
          {!searching && query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear">
              <X size={14} strokeWidth={1.8} className="text-mist-dim" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={useHere}
          disabled={locating}
          className="mt-2.5 flex w-full items-center gap-2.5 rounded-tile border border-azure/40 bg-azure/[0.07] px-3 py-2.5 text-left text-[13px] text-azure transition-colors hover:bg-azure/[0.12] disabled:opacity-60"
        >
          {locating ? <Loader2 size={15} className="animate-spin" /> : <Compass size={15} strokeWidth={1.8} />}
          {locating ? "Finding you…" : "Use my location"}
        </button>

        {locateError && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-mist-dim">
            {locateError === "denied"
              ? "Location is turned off for ICEFALL. Search for your town instead, or allow location in your browser settings."
              : locateError === "insecure"
                ? "Your device only shares location over a secure connection. Search for your town instead."
                : "Couldn't get a fix. Search for your town instead."}
          </p>
        )}
      </div>

      {query.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="py-4 text-[12.5px] text-mist-dim">
          Nothing found for “{query.trim()}”. This searches towns and cities — where you are,
          not where you are going. Search for a mountain by name under MOUNTAINS.
        </p>
      )}

      {showing.length > 0 && (
        <>
          {query.trim().length < 2 && (
            <p className="section-label pt-3 text-mist-dim">
              {recents.length ? "Recent" : "Suggestions"}
            </p>
          )}
          {showing.map((p) => (
            <SheetRow
              key={p.id}
              active={p.lat === current.lat && p.lon === current.lon}
              onClick={() => onPick(p)}
              title={p.name}
              detail={
                [p.kind, p.region].filter(Boolean).join(" · ") ||
                `${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`
              }
            />
          ))}
        </>
      )}
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Load more                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Reveals the next page, and says how many there are.
 *
 * The count matters: a bare "Load more" leaves you guessing whether there are
 * three more or three hundred, which is exactly the complaint a five-result
 * list attracts in a country full of mountains.
 */
function LoadMore({
  onClick,
  shown,
  total,
  noun,
}: {
  onClick: () => void;
  shown: number;
  total: number;
  noun: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-card border border-hairline-strong bg-graphite py-3.5 text-[12.5px] text-snow transition-colors hover:border-azure/50"
    >
      <Plus size={14} strokeWidth={1.9} className="text-azure" />
      Load more
      <span className="tnum text-mist-dim">
        {shown} of {total} {noun}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Trails near you                                                            */
/* -------------------------------------------------------------------------- */

/** How many results a page reveals. A country has more than five walks in it. */
const PAGE = 10;

function useNearbyTrails(place: Place, radiusKm: number | null, enabled: boolean) {
  const [all, setAll] = useState<Trail[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setAll([]);
      // Switching to mountaineering mid-search left this true forever: the
      // in-flight promise's `finally` is guarded by its own `live`, which the
      // cleanup had already cleared. The loader then never lifted and the
      // summits behind it never appeared.
      setLoading(false);
      setFailed(false);
      return;
    }
    let live = true;
    const ctrl = new AbortController();
    /*
     * The radius the athlete PICKED, not a third of it.
     *
     * This used to clamp to 30 km whatever the pill said, so "within 100 km"
     * around the Low Tatras returned 66 trails out of the 1,178 that are
     * actually mapped there — which is what "there's more than five hikes in a
     * country" was pointing at.
     */
    const radiusM = Math.min(radiusKm ?? MAX_RADIUS_KM, MAX_RADIUS_KM) * 1000;

    setLoading(true);
    setFailed(false);
    setAll([]);
    setShown(PAGE);

    /*
     * No cap worth the name.
     *
     * The Overpass reply is already the WHOLE circle — `out tags center` has no
     * row limit — so trimming it afterwards saved nothing and made the count
     * under the pill read back the cap instead of the ground: "300 hiking
     * routes in Slovakia" when 1,178 relations came down the wire. Only the
     * page that is on screen is ever rendered.
     */
    nearbyTrails(
      place.lat,
      place.lon,
      // A country wants its named long-distance ways searched across its whole
      // territory; a town wants what is close to it.
      {
        radiusM,
        limit: 20_000,
        areaId: areaIdFor(place),
        rank: isWidePlace(place) ? "significant" : "near",
      },
      ctrl.signal,
    )
      .then((t) => {
        if (live) setAll(t);
      })
      .catch((err: unknown) => {
        /*
         * A cancellation is not an outage.
         *
         * `failed` drives a card that tells the athlete OpenStreetMap did not
         * answer. An AbortError means WE stopped asking — the effect was
         * cleaned up, the place changed, the tab closed — and reporting that as
         * a database failure is the same class of lie as reporting a network
         * error as an empty map, which the comment above the NoRoutes block
         * already warns about.
         */
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (live) setFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
      ctrl.abort();
    };
  }, [enabled, place.lat, place.lon, radiusKm, attempt]);

  const list = useMemo(() => all.slice(0, shown), [all, shown]);
  return {
    list,
    loading,
    failed,
    total: all.length,
    hasMore: all.length > list.length,
    loadMore: () => setShown((n) => n + PAGE),
    retry: () => setAttempt((a) => a + 1),
  };
}

/**
 * One photograph per trail, and never the same one twice.
 *
 * Resolved for the WHOLE LIST rather than per card, because uniqueness cannot be
 * decided by a card that does not know what its neighbours chose. Two trails
 * 5.5 km apart share most of their geosearch candidates, and independently each
 * picked the nearest — the same photograph of the village of Lazanias, shown
 * under two different trail names.
 *
 * Two sources, in order, and the order matters far more than it looks.
 * Searching Commons for the trail's NAME finds photographs of the trail itself
 * ("Kyparissia Nature Trail 03.jpg"); searching by COORDINATES finds whatever
 * happened to be photographed nearby, which around Limassol meant climate maps,
 * a village church and two photographs of the Earth taken from the ISS.
 */
/** How many trails are resolved before the screen is updated. */

/*
 * `useTrailPhotos` lived here and is gone.
 *
 * It ran a Commons name-search per trail to find a photograph OF that trail.
 * Two things killed it. Coverage: the search demanded every distinctive word of
 * a name appear in the file's own name, so "European Walking Route E4, Cyprus,
 * Main Route" matched nothing on earth, which is the common shape for official
 * trail names. Cost: it was a network round trip per card, against an endpoint
 * that rate-limits, for an answer that was almost always empty.
 *
 * `TrailImage` replaces it. The exact Wikidata join it uses needs no search and
 * no per-card request — one 100 KB index for the whole session — and satellite
 * imagery covers every trail the join misses.
 */

const NETWORK_COLOUR: Record<string, string> = {
  lwn: "text-mist",
  rwn: "text-snow",
  nwn: "text-azure",
  iwn: "text-azure",
};

/**
 * The trail's length, measured if OSM did not record one.
 *
 * Most relations carry no `distance` tag, so "Length not mapped" was the answer
 * on nearly every card. This measures the line instead — once per trail, ever,
 * queued one at a time so ten cards do not fire ten megabyte fetches at once.
 */
function useTrailLength(trail: Trail): { km: number | null; measuring: boolean } {
  const [km, setKm] = useState<number | null>(
    () => trail.lengthKm ?? cachedLengthKm(trail.osmId) ?? null,
  );
  const [measuring, setMeasuring] = useState(false);

  useEffect(() => {
    if (trail.lengthKm != null || cachedLengthKm(trail.osmId) != null) return;
    let live = true;
    const ctrl = new AbortController();
    setMeasuring(true);
    measureLength(trail.osmId, ctrl.signal)
      .then((m) => {
        if (live && m != null) setKm(m);
      })
      .finally(() => {
        if (live) setMeasuring(false);
      });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [trail.osmId, trail.lengthKm]);

  return { km, measuring };
}

function TrailCard({ trail }: { trail: Trail }) {
  // Set by `TrailImage`, because only it knows which layer actually won.
  const [caption, setCaption] = useState(TRAIL_PLATE_CAPTION);
  const length = useTrailLength(trail);

  return (
    <Link to={`/explore/trail/${trail.osmId}`} className="block">
      <div className="overflow-hidden rounded-card border border-hairline bg-graphite transition-colors hover:border-hairline-strong">
        <div className="relative h-[170px] bg-slate">
          {/*
            The plate is ALWAYS painted, and painted first — it needs no network,
            so there is no state in which this card is blank or grey. A verified
            photograph fades in over the top of it if and when one arrives; if
            none does, the plate is what the card keeps, and it is not pretending
            to be a photograph of anywhere.
          */}
          <TrailImage
            osmId={trail.osmId}
            lat={trail.lat}
            lon={trail.lon}
            name={trail.name}
            onCaption={setCaption}
            className="absolute inset-0 h-full w-full"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-graphite/95 via-transparent to-obsidian/40" />

          {trail.network && (
            <span
              className={cn(
                "absolute left-3 top-3 rounded-pill border border-hairline-strong bg-obsidian/75 px-2.5 py-1 text-[10.5px] backdrop-blur",
                NETWORK_COLOUR[trail.network] ?? "text-snow",
              )}
            >
              {NETWORK_LABEL[trail.network]}
            </span>
          )}
          {trail.distanceM !== undefined && (
            <span className="tnum absolute left-3 top-11 flex items-center gap-1 rounded-pill bg-obsidian/70 px-2 py-1 text-[10.5px] text-snow backdrop-blur">
              <MapPin size={11} strokeWidth={1.9} className="text-azure" />
              {trail.distanceM < 1000
                ? "here"
                : `${(trail.distanceM / 1000).toFixed(trail.distanceM < 10_000 ? 1 : 0)} km away`}
            </span>
          )}
          {trail.ref && (
            <span className="absolute right-3 top-3 rounded-pill border border-azure/45 bg-obsidian/75 px-2.5 py-1 text-[10.5px] text-azure backdrop-blur">
              {trail.ref}
            </span>
          )}

          <span className="absolute bottom-3 left-3 right-20 truncate text-[10px] text-mist">
            {caption}
          </span>

          {/* Straight to the phone's maps app, pinned at the trail. */}
          <button
            type="button"
            aria-label={`Directions to ${trail.name}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openMaps(mapsDirectionsUrl({ lat: trail.lat, lon: trail.lon }));
            }}
            className="absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-full border border-azure/45 bg-obsidian/80 text-azure backdrop-blur transition-colors hover:bg-azure/20"
          >
            <Navigation size={16} strokeWidth={1.8} />
          </button>
        </div>

        <div className="p-4">
          <h3 className="text-[15.5px] leading-snug text-snow">{trail.name}</h3>
          {(trail.localName || trail.description) && (
            <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-mist-dim">
              {trail.description ?? trail.localName}
            </p>
          )}
          <div className="tnum mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-mist">
            {trail.durationH && (
              <span className="flex items-center gap-1.5">
                <Clock size={12} strokeWidth={1.7} className="text-mist-dim" />
                {trail.durationH % 1 === 0
                  ? `${trail.durationH} h`
                  : `${Math.floor(trail.durationH)}h ${Math.round((trail.durationH % 1) * 60)}m`}
              </span>
            )}
            <span className="tnum flex items-center gap-1.5">
              <RouteIcon size={12} strokeWidth={1.7} className="text-mist-dim" />
              {length.km != null
                ? `${length.km.toFixed(1)} km`
                : length.measuring
                  ? "Measuring…"
                  : "Length unavailable"}
            </span>
            {trail.ascentM && (
              <span className="flex items-center gap-1.5">
                <TrendingUp size={12} strokeWidth={1.7} className="text-mist-dim" />
                {fmtElevation(trail.ascentM)} m
              </span>
            )}
            {trail.sacScale && SAC_LABEL[trail.sacScale] && (
              <span className="flex items-center gap-1.5">
                <MountainIcon size={12} strokeWidth={1.7} className="text-mist-dim" />
                {SAC_LABEL[trail.sacScale].split(" · ")[0]}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Peaks near you — the worldwide half of the search                          */
/* -------------------------------------------------------------------------- */

/**
 * Summits around a point, catalogue first and network second.
 *
 * The bundled catalogue is Alps-only, so it answers instantly in Chamonix and
 * not at all in Colorado; Overpass covers the rest of the planet but needs a
 * network. Running both, in that order, means the Alps never wait and everywhere
 * else still works.
 */
export type SearchStage = "catalogue" | "osm" | "photos" | "trails";

function useNearbyPeaks(place: Place, activity: ActivityKind, radiusKm: number | null, enabled: boolean) {
  const [list, setList] = useState<Peak[]>([]);
  // Everything found, so "Load more" is instant rather than another round trip.
  const [all, setAll] = useState<Peak[]>([]);
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState(false);
  // Which half of the search is running. Surfaced to the loader so the status
  // line under it is the truth rather than decorative filler text.
  const [stage, setStage] = useState<SearchStage>("catalogue");
  // Overpass mirrors go down, and hut wifi accepts a connection then never
  // answers. Either way the athlete gets told, rather than being left with a
  // blank page that looks like "there are no mountains here".
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Set when the ground was too dense to search the whole radius — see the note
  // rendered under the list. Null means the radius asked for was the radius searched.
  const [narrowedToKm, setNarrowedToKm] = useState<number | null>(null);

  useEffect(() => {
    // Same trap as the trail hook: a search still in flight cannot clear this
    // itself once the effect has been torn down.
    if (!enabled) { setList([]); setLoading(false); setFailed(false); return; }
    let live = true;
    const ctrl = new AbortController();
    const radiusM = Math.min(radiusKm ?? MAX_RADIUS_KM, MAX_RADIUS_KM) * 1000;
    const band = ACTIVITY_BANDS[activity];
    // Classify by the app's own terrain assessment rather than by a bare
    // elevation floor: "hiking" must not return a glaciated 3,000 m ridge just
    // because it clears 800 m.
    const inBand = (p: Peak) => {
      const b = assessPeak(p.elevationM, p.lat, p.lon).band;
      return b >= band.min && b <= band.max;
    };
    // The floor that matches the activity's lowest band, pushed into BOTH the
    // catalogue lookup and the Overpass query so the row limit is spent on
    // peaks that can actually qualify.
    const BAND_FLOOR_M = [0, 0, 1000, 2000, 2900, 3600, 4500, 6000];
    const minElevationM = BAND_FLOOR_M[band.min] ?? 0;

    /*
     * How the summits are ranked, and it depends on what was searched.
     *
     * A town is a real point, so the nearest summit to it is the answer. A
     * COUNTRY is a pin on its centroid, and ranking by distance to that pin is
     * why "Slovakia" opened on a row of anonymous 2,000 m bumps while
     * Gerlachovský štít — the highest mountain in the Carpathians, and 45 km
     * from that same pin — sat a hundred rows down. Ask about an area and you
     * are asking about its mountains.
     */
    const wide = isWidePlace(place);
    const order = (a: Peak, b: Peak) =>
      wide
        ? b.elevationM - a.elevationM
        : (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity);

    setLoading(true);
    setStage("catalogue");
    setFailed(false);
    setList([]);
    setAll([]);
    setShown(PAGE);
    setNarrowedToKm(null);

    nearbyFromCatalogue(place.lat, place.lon, { radiusM, limit: 40, minElevationM })
      .then((instant) => {
        const kept = instant.filter(inBand).sort(order);
        if (live && kept.length) {
          setAll(kept);
          setList(kept.slice(0, PAGE));
        }
        if (live) setStage("osm");
        return nearbyLive(
          place.lat,
          place.lon,
          { radiusM, limit: 500, minElevationM, areaId: areaIdFor(place) },
          ctrl.signal,
        );
      })
      .then(async (found) => {
        if (!live) return;
        if (found.radiusM < radiusM - 500) setNarrowedToKm(Math.round(found.radiusM / 1000));
        const merged = mergePeaks([], found.peaks).filter(inBand).sort(order);
        // Show the summits immediately; their photographs and English names are
        // a second round trip and must not hold the list back.
        rememberPeaks(merged);
        if (merged.length) setAll(merged);
        setList((prev) => (merged.length ? merged.slice(0, PAGE) : prev));
        if (merged.length === 0) return;

        setStage("photos");
        // Only the visible page is enriched — resolving photos and English names
        // for two hundred summits nobody has scrolled to is wasted requests.
        const enriched = await enrichPeaks(merged.slice(0, PAGE), ctrl.signal);
        rememberPeaks(enriched);
        if (live) setList(enriched);
      })
      .catch(() => {
        if (live) setFailed(true);
      })
      .finally(() => { if (live) setLoading(false); });

    return () => { live = false; ctrl.abort(); };
  }, [enabled, place.lat, place.lon, place.osmId, place.kind, activity, radiusKm, attempt]);

  /** Reveal the next page, enriching only what is about to be seen. */
  const loadMore = useCallback(() => {
    const next = shown + PAGE;
    setShown(next);
    const page = all.slice(0, next);
    setList(page);
    void enrichPeaks(page).then((enriched) => {
      rememberPeaks(enriched);
      setList(enriched);
    });
  }, [all, shown]);

  return {
    list,
    loading,
    stage,
    failed,
    total: all.length,
    hasMore: all.length > list.length,
    loadMore,
    narrowedToKm,
    retry: () => setAttempt((a) => a + 1),
  };
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What the screen shows while summits are being found.
 *
 * A 13px spinner on an otherwise empty page reads as "nothing here" — the
 * search can take ten seconds against Overpass, and for most of that the old
 * loader was indistinguishable from a dead end. So: a radar scanning outward
 * from where the athlete said they are, the real stage of the search written
 * underneath it, and placeholder rows in the exact shape of the results that
 * are about to land. The page looks like it is filling, because it is.
 *
 * Built from CSS keyframes, so `prefers-reduced-motion` flattens all of it via
 * the global rule in index.css.
 */
function SearchingSummits({ place, stage }: { place: string; stage: SearchStage }) {
  return (
    <Rise className="pt-6">
      <div className="flex flex-col items-center">
        <div className="relative grid h-[132px] w-[132px] shrink-0 place-items-center">
          {/* Rings pushing outward — the search radiating from your position. */}
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              className="icefall-radar-ring absolute h-[132px] w-[132px] rounded-full border border-azure/45"
              style={{ animationDelay: `${i * 0.86}s` }}
            />
          ))}

          {/* The sweep hand. */}
          <span
            aria-hidden
            className="icefall-radar-sweep absolute h-[132px] w-[132px] rounded-full"
            style={{
              // Stops built FROM the token — restating --ice-azure's raw oklch
              // here desyncs silently the day the palette is tuned.
              background:
                "conic-gradient(from 0deg, transparent 0deg, transparent 300deg, color-mix(in oklch, var(--ice-azure) 22%, transparent) 352deg, color-mix(in oklch, var(--ice-azure) 45%, transparent) 360deg)",
              maskImage: "radial-gradient(circle, transparent 22%, black 24%)",
              WebkitMaskImage: "radial-gradient(circle, transparent 22%, black 24%)",
            }}
          />

          {/* Fixed hairline graticule, so the sweep has something to sweep over. */}
          <span aria-hidden className="absolute h-[88px] w-[88px] rounded-full border border-hairline" />
          <span aria-hidden className="absolute h-[46px] w-[46px] rounded-full border border-hairline" />

          <IcefallMark className="icefall-breathe relative h-5 text-azure" />
        </div>

        <p className="mt-4 text-[14px] text-snow">
          {stage === "trails" ? "Searching trails" : "Searching summits"} {place}
        </p>
        <p className="mt-1 text-[11.5px] text-mist-dim">
          {stage === "trails"
            ? "Reading OpenStreetMap for waymarked trails…"
            : stage === "catalogue"
              ? "Checking the peaks stored on your device…"
              : stage === "osm"
                ? "Reading OpenStreetMap — this can take a few seconds…"
                : "Finding a photograph…"}
        </p>
      </div>

      {/* Placeholders in the shape of the rows that are coming. */}
      <div className="mt-6 space-y-2.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="icefall-shimmer relative flex items-center gap-3 overflow-hidden rounded-card border border-hairline bg-graphite p-3"
            style={{ opacity: 1 - i * 0.18 }}
          >
            <span className="h-[52px] w-[52px] shrink-0 rounded-[10px] bg-slate" />
            <span className="min-w-0 flex-1">
              <span className="block h-3 rounded-full bg-slate" style={{ width: `${58 - i * 8}%` }} />
              <span className="mt-2 block h-2.5 w-[38%] rounded-full bg-slate/70" />
            </span>
          </div>
        ))}
      </div>
    </Rise>
  );
}

/**
 * A discovered summit, at the same weight as a documented route.
 *
 * These were 52px thumbnails in a list row, which made the half of the search
 * that actually covers the world look like a footnote to the half that covers
 * ten mountains. Same card, same photograph size — the only difference is what
 * the card can honestly claim, and it says so on its face.
 */
/**
 * Curated mountains have their own page; everything else is a discovered peak.
 *
 * Sending a discovered peak to `/explore/mountain/<id>` looked right and was
 * not: that screen resolves ids against the curated ten only, so every summit
 * in the worldwide half of the search bounced straight back to the index.
 */
const peakHref = (peak: Peak) =>
  peak.curatedId
    ? `/explore/mountain/${peak.curatedId}`
    : `/explore/peak/${encodeURIComponent(peak.id)}`;

function PeakCard({ peak, variant = 0 }: { peak: Peak; variant?: number }) {
  const image = useMountainImage({
    name: peak.name,
    elevationM: peak.elevationM,
    lat: peak.lat,
    lon: peak.lon,
    curatedId: peak.curatedId,
    wikipedia: peak.wikipedia,
    variant,
    // Wikidata's own "image of this item", when it has one. It outranks a
    // name search, because it is asserted on the peak rather than guessed
    // from its title.
    photo: peak.photo,
  });
  const credit = peak.photo ? peak.photoCredit : image.credit;
  const rating = ratingFor(peak.id);

  return (
    <Link to={peakHref(peak)} className="block">
      <div className="overflow-hidden rounded-card border border-hairline bg-graphite transition-colors hover:border-hairline-strong">
        <div className="relative h-[170px]">
          <img
            src={image.src}
            alt=""
            aria-hidden
            loading="lazy"
            // No dimming any more. The 55% wash existed to hold back a
            // photograph of the wrong mountain; a plate has nothing to hold back.
            className="h-full w-full object-cover transition-opacity duration-500" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-graphite/95 via-transparent to-obsidian/40" />

          <span className="tnum absolute left-3 top-3 rounded-pill border border-hairline-strong bg-obsidian/75 px-2.5 py-1 text-[10.5px] text-snow backdrop-blur">
            {fmtElevation(peak.elevationM)} m
          </span>
          {peak.distanceM !== undefined && (
            <span className="tnum absolute left-3 top-11 flex items-center gap-1 rounded-pill bg-obsidian/70 px-2 py-1 text-[10.5px] text-snow backdrop-blur">
              <MapPin size={11} strokeWidth={1.9} className="text-azure" />
              {peak.distanceM < 1000
                ? "here"
                : `${Math.round(peak.distanceM / 1000).toLocaleString()} km away`}
            </span>
          )}

          {/* The picture is either of this summit or it is not, and the card is
              never allowed to leave that ambiguous. */}
          <span className="absolute bottom-3 left-3 right-20 truncate text-[10px] text-mist">
            {image.real
              ? credit
              : "Terrain of this altitude — not a photograph of this summit"}
          </span>

          <MiniMap lat={peak.lat} lon={peak.lon} className="absolute bottom-3 right-3 h-14 w-14" />
        </div>

        <div className="p-4">
          {rating && (
            <div className="mb-1.5 flex items-center gap-3.5 text-[12px]">
              <span className="flex items-center gap-1.5 text-snow">
                <Star size={12} strokeWidth={0} fill="currentColor" className="text-azure" />
                <span className="tnum">{rating.stars.toFixed(1)}</span>
              </span>
              <span className="flex items-center gap-1.5 text-mist">
                <Users size={12} strokeWidth={1.7} className="text-mist-dim" />
                <span className="tnum">{fmtPeople(rating.people)}</span>
              </span>
            </div>
          )}
          <h3 className="text-[15.5px] leading-snug text-snow">{peak.name}</h3>
          <p className="mt-1 text-[11.5px] text-mist-dim">
            {peak.localName ? `${peak.localName} · ` : ""}
            {peak.volcano ? "Volcano" : "Summit"}
            {peak.country ? ` · ${peak.country}` : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}

function NoRoutes({ place, activity, radiusLabel }: { place: Place; activity: ActivityKind; radiusLabel: string }) {
  return (
    <Rise className="pt-4">
      <div className="rounded-card border border-hairline bg-graphite p-4">
        <p className="text-[13px] text-snow">
          No {activityOption(activity).label.toLowerCase()} routes {radiusLabel.replace("within ", "within ")} of {place.name}.
        </p>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
          ICEFALL documents lines on its curated mountains only. Route-by-route coverage of the
          whole world needs a routing service — until it is wired in, the catalogue will not be
          padded with guesses.
        </p>
      </div>
    </Rise>
  );
}

/* -------------------------------------------------------------------------- */

const DIFFICULTY_WORD = ["", "Accessible", "Moderate", "Demanding", "Serious", "Extreme"];

export function RouteResultCard({ hit, reason }: { hit: RouteHit; reason?: string | null }) {
  // The photograph of this exact mountain — bundled where ICEFALL shot it,
  // Wikimedia's verified lead image otherwise.
  const image = useMountainImage({
    name: hit.mountainName,
    elevationM: hit.mountainElevationM,
    curatedId: hit.mountainId,
    photo: routePhoto(hit),
  });
  const pace = paceFor(hit);
  const rating = ratingFor(hit.id);

  return (
    <Link to={`/explore/route/${hit.id}`} className="block">
      <div className="overflow-hidden rounded-card border border-hairline bg-graphite transition-colors hover:border-hairline-strong">
        <div className="relative h-[190px]">
          <img src={image.src} alt="" aria-hidden loading="lazy" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-graphite/95 via-transparent to-obsidian/40" />

          {/* difficulty word, top-left — where a consumer app puts a level */}
          <span className="absolute left-3 top-3 rounded-pill border border-hairline-strong bg-obsidian/75 px-2.5 py-1 text-[10.5px] text-snow backdrop-blur">
            {DIFFICULTY_WORD[hit.difficulty] ?? "—"}
          </span>
          {/* distance from where you said you are */}
          <span className="tnum absolute left-3 top-11 flex items-center gap-1 rounded-pill bg-obsidian/70 px-2 py-1 text-[10.5px] text-snow backdrop-blur">
            <MapPin size={11} strokeWidth={1.9} className="text-azure" />
            {hit.distanceFromBaseKm < 1
              ? "here"
              : `${hit.distanceFromBaseKm < 10 ? hit.distanceFromBaseKm.toFixed(1) : Math.round(hit.distanceFromBaseKm).toLocaleString()} km away`}
          </span>

          <span className="absolute right-3 top-3 rounded-pill border border-azure/45 bg-obsidian/75 px-2.5 py-1 text-[10.5px] text-azure backdrop-blur">
            {hit.gradeLabel}
          </span>

          {/* The reference's map thumbnail. Real tiles at the real summit — no
              traced line, because ICEFALL holds no GPX for these routes. */}
          <MiniMap
            lat={hit.mountainLat}
            lon={hit.mountainLon}
            className="absolute bottom-3 right-3 h-14 w-14"
          />
        </div>

        <div className="p-4">
          {rating && (
            <div className="mb-1.5 flex items-center gap-3.5 text-[12px]">
              <span className="flex items-center gap-1.5 text-snow">
                <Star size={12} strokeWidth={0} fill="currentColor" className="text-azure" />
                <span className="tnum">{rating.stars.toFixed(1)}</span>
              </span>
              <span className="flex items-center gap-1.5 text-mist">
                <Users size={12} strokeWidth={1.7} className="text-mist-dim" />
                <span className="tnum">{fmtPeople(rating.people)}</span>
              </span>
            </div>
          )}
          <p className="text-[11.5px] text-mist-dim">
            {hit.mountainName} · {hit.country}
          </p>
          <h3 className="mt-1 text-[15.5px] leading-snug text-snow">{hit.name}</h3>
          <div className="tnum mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-mist">
            <span className="flex items-center gap-1.5">
              <Clock size={12} strokeWidth={1.7} className="text-mist-dim" />
              {hit.durationLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <MoveHorizontal size={12} strokeWidth={1.7} className="text-mist-dim" />
              {fmtDistance(hit.distanceKm)} km
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingUp size={12} strokeWidth={1.7} className="text-mist-dim" />
              {fmtElevation(hit.elevationGainM)} m
            </span>
            {pace.value !== "—" && (
              <span className="flex items-center gap-1.5">
                <Compass size={12} strokeWidth={1.7} className="text-mist-dim" />
                {pace.value} {pace.unit.replace(" ascent", "")}
              </span>
            )}
          </div>
        </div>

        {reason && (
          <p className="border-t border-hairline bg-azure/[0.05] px-4 py-2.5 text-[11px] leading-relaxed text-azure/85">
            {reason}
          </p>
        )}
      </div>
    </Link>
  );
}

function Pill({
  children, active, onClick, icon: Icon, caret,
}: {
  children: React.ReactNode; active?: boolean; onClick: () => void;
  icon: typeof MapPin; caret?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-pill border px-3 py-2 text-[12px] backdrop-blur transition-colors",
        active ? "border-azure/50 bg-azure/[0.10] text-azure" : "border-hairline-strong bg-graphite/85 text-mist hover:text-snow",
      )}
    >
      <Icon size={13} strokeWidth={1.7} />
      {children}
      {caret && <ChevronDown size={12} strokeWidth={1.8} className="opacity-70" />}
    </button>
  );
}

