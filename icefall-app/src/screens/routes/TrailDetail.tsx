import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Images,
  Layers,
  Loader2,
  Map as MapGlyph,
  MapPin,
  Maximize2,
  MoreHorizontal,
  Navigation,
  Share2,
  X,
} from "lucide-react";
import { Disclaimer, HeroCircleButton, Stat, sharePage } from "@/components/ui/primitives";
import { CompanyMark } from "@/components/domain/CompanyMark";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { Rise, Stagger, TABBAR_STICKY_BOTTOM } from "@/components/layout/chrome";
import { TrailShape, useTrailLine } from "@/components/domain/TrailShape";
import {
  NETWORK_LABEL,
  SAC_LABEL,
  TRAIL_ATTRIBUTION,
  VISIBILITY_LABEL,
  lengthOf,
  trailById,
  type LatLon,
  type Trail,
} from "@/services/trails";
import { ofCaption, photosOfNamed, type PlacePhoto } from "@/services/placePhotos";
import { operatorsFor } from "@/services/operators";
import { TrailImage } from "@/components/domain/TrailImage";
import type { TrailPhoto } from "@/services/trailImagery";
import { trailWaypoints, orderedWaypoints, type TrailWaypoint } from "@/services/trailWaypoints";
import { RouteWaypointMap, KIND_ICON } from "@/components/domain/RouteWaypointMap";
import {
  MAP_STYLE_LABEL,
  saveMapStyle,
  savedMapStyle,
  type MapStyleId,
} from "@/components/map/icefallStyle";
import { mapsDirectionsUrl, mapsPinUrl, openMaps } from "@/lib/maps";
import { SAVED_NOTICE, isTrailSaved, saveTrail, unsaveTrail } from "@/services/savedTrails";
import { SaveCircle, SavedToast, useSaveFlash } from "@/components/ui/SaveControl";
import { BreakdownBar, ElevationProfile } from "@/components/domain/TrailProfile";
import {
  elevationOf,
  formatHours,
  hardestGrade,
  lineSegments,
  surfaceBreakdown,
  toGpx,
  trailLengthKm,
  trailWays,
  walkingHours,
  type Elevation,
  type TrailWay,
  waytypeBreakdown,
} from "@/services/trailProfile";
import { accessChips, routeShape } from "./trailShape";
import { cn } from "@/lib/utils";

/** The hero caption before `TrailImage` reports which layer it settled on. */
const TRAIL_PLATE_CAPTION = "Contours — imagery loading";

/**
 * The sentence under the stats row whenever the moving time is MODELLED.
 *
 * This app already keeps exactly this contract for calories ("estimated for
 * 72 kg"): a computed figure is printed, and the thing it was computed from is
 * printed with it. A time with no such line reads as something somebody walked
 * and recorded, which nobody did.
 */
const DIN_NOTE =
  "Moving time is estimated from the measured length and climb by DIN 33466 — 4 km/h on the flat, 300 m up and 500 m down per hour. It is a fit walker's moving time and counts no stops.";

/* -------------------------------------------------------------------------- */
/* Data                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Everything the relation does not tell us, worked out from its own geometry.
 *
 * One Overpass call for the member ways (tags AND geometry, ~48 KB) and one
 * free Open-Meteo call for the heights. Both are cached for the session, so
 * coming back to a trail costs nothing.
 */
function useTrailFacts(osmId: number | undefined) {
  const [ways, setWays] = useState<TrailWay[] | null>(null);
  const [elevation, setElevation] = useState<Elevation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (osmId == null) return;
    let live = true;
    const ctrl = new AbortController();
    setLoading(true);
    setWays(null);
    setElevation(null);

    trailWays(osmId)
      .then(async (w) => {
        if (!live || w.length === 0) return;
        setWays(w);
        const e = await elevationOf(osmId, w, ctrl.signal);
        if (live) setElevation(e);
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
      ctrl.abort();
    };
  }, [osmId]);

  return { ways, elevation, loading };
}

/**
 * Real tagged stops along the route.
 *
 * `enabled` is how this stays cheap now that the page is one scroll. See the
 * comment on its call site: the tab strip used to do this gating for free.
 */
function useTrailWaypoints(osmId: number | undefined, enabled: boolean) {
  const [points, setPoints] = useState<TrailWaypoint[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (osmId == null || !enabled || points !== null) return;
    let live = true;
    const ctrl = new AbortController();
    setLoading(true);
    trailWaypoints(osmId)
      .then((p) => {
        if (live) setPoints(p);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [osmId, enabled, points]);

  return { points, loading };
}

/**
 * Has this element been on screen yet?
 *
 * Latches true and stays there — the point is to start work once, not to stop
 * it again when the athlete scrolls past.
 */
function useSeen<T extends HTMLElement>(margin = "400px") {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);

  return { ref, seen };
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A trail's page — one scroll, no tabs.
 *
 * Rebuilt 2026-09-08 to the owner's AllTrails reference ("1:1 mockups on how
 * pages should look when you click on a hike on explore page"): full-bleed
 * hero, title, a four-column stats row, the description, the route map, the
 * things along it, and a bar pinned above the tab bar. The LAYOUT is the
 * reference's, faithfully.
 *
 * WHAT IS NOT THE REFERENCE'S IS THE DATA. Every element the reference shows
 * that ICEFALL cannot honestly answer is absent rather than filled:
 *
 *  · NO STAR RATING. `routes/ratings.ts` opens "⚠️ THESE NUMBERS ARE INVENTED"
 *    and hashes the route id — a 4.6 and "312 people" beside a Cypriot trail
 *    nobody has rated is a fabricated claim about how many people walked it.
 *    Removed here along with the disclaimer that existed only to apologise for
 *    it, and NOT replaced with a substitute badge or a save count.
 *  · NO "Customise route" and no "On-trail directions". There is no routing
 *    engine anywhere in this app; neither control could do anything.
 *  · NO aerial fly-through and no photo tour. No trail footage exists.
 *  · NO "Download". There is no per-trail offline pack — `src/offline/` holds
 *    a build-time flag and seeded fixtures, and `trailImagery.ts` forbids
 *    caching the satellite tiles. The GPX file is real, so that ships instead.
 *  · NO place under the title. `toTrails()` carries no country and no region.
 *
 * What the reference has no equivalent for and this screen keeps anyway: the
 * elevation profile, the surface and way-type breakdowns, path visibility,
 * waymarking, and the OSM licence line.
 */
export default function TrailDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const osmId = Number(id);

  /**
   * The expedition this approach was opened from, when there was one.
   *
   * Set by the Expeditions hikes tab. Absent when the same trail is opened from
   * Find, and the guided section stays hidden in that case — see `GuidedBy`.
   */
  const guided = useMemo(() => {
    const peakName = (params.get("peak") ?? "").trim();
    if (peakName === "") return null;
    const elevationM = Number(params.get("elevation"));
    return {
      peakName,
      elevationM: Number.isFinite(elevationM) && elevationM > 0 ? elevationM : 0,
      country: params.get("country") ?? undefined,
    };
  }, [params]);

  const [trail, setTrail] = useState<Trail | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  // Re-read once the trail resolves, so the button reflects what is stored
  // rather than always starting at "not saved".
  useEffect(() => {
    if (Number.isFinite(osmId)) setSaved(isTrailSaved(osmId));
  }, [osmId]);
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);
  /** False until Commons has actually answered — see the effect below. */
  const [photosSearched, setPhotosSearched] = useState(false);
  const [frame, setFrame] = useState(0);
  const [options, setOptions] = useState(false);
  const [gallery, setGallery] = useState(false);
  // Owned by `TrailImage` — satellite and a photograph make different claims.
  const [heroCaption, setHeroCaption] = useState(TRAIL_PLATE_CAPTION);
  const [heroPhoto, setHeroPhoto] = useState<TrailPhoto | null>(null);

  const scroller = useRef<HTMLDivElement | null>(null);
  const mapSection = useSeen<HTMLDivElement>();

  const facts = useTrailFacts(trail?.osmId);
  /*
   * THE LINE WAITS FOR THE WAYS. Two Overpass queries, one after the other.
   *
   * Measured before the tabs were removed: opening the Map tab fired
   * `trailWaypoints` alongside `trailWays` and `trailGeometry` — three
   * concurrent Overpass queries from one client, one of them (the E4's ~1.3 MB
   * `out geom`) the heaviest single request this app makes. Instrumenting
   * `fetch` caught 17 Overpass calls inside three seconds, and `trailGeometry`,
   * which succeeds well inside its own timeout when called alone, came back
   * empty under that load.
   *
   * A single scrolling page would have fired all three on open, so the gating
   * the tab strip used to do for free is now explicit: the ways go first (they
   * carry the tags, the length and enough geometry to draw the hero's shape),
   * the line follows them, and the waypoints wait for the map to scroll into
   * view AND for the line they are ordered along.
   */
  const {
    line,
    loading: lineLoading,
    failed: lineFailed,
  } = useTrailLine(Number.isFinite(osmId) ? osmId : undefined, !facts.loading);
  const { points: waypointPoints, loading: waypointsLoading } = useTrailWaypoints(
    Number.isFinite(osmId) ? osmId : undefined,
    mapSection.seen && line.length > 1,
  );
  const orderedStops = useMemo(
    () => (waypointPoints ? orderedWaypoints(line, waypointPoints) : []),
    [line, waypointPoints],
  );

  /** One relation, by id — see `trailById` for why this is not a nearby search. */
  useEffect(() => {
    if (!Number.isFinite(osmId)) {
      setTrail(null);
      return;
    }
    let live = true;
    const ctrl = new AbortController();
    setTrail(undefined);

    trailById(osmId, ctrl.signal)
      .then((t) => {
        if (live) setTrail(t);
      })
      .catch(() => {
        if (live) setTrail(null);
      });

    return () => {
      live = false;
      ctrl.abort();
    };
  }, [osmId]);

  /*
   * The photographs are NOT gated on scroll, deliberately.
   *
   * They are the hero's own carousel frames, so they are needed at the top of
   * the page — and they come from Wikimedia Commons, not Overpass, so they do
   * not contend with the two queries the sequencing above exists to protect.
   */
  useEffect(() => {
    if (!trail) return;
    let live = true;
    const ctrl = new AbortController();
    // A different trail's photographs must not survive into this one's hero,
    // nor its frame index — `photos[frame - 1]` would be a picture of
    // somewhere else under this trail's name.
    setPhotos([]);
    setPhotosSearched(false);
    setFrame(0);

    // By name only — those are photographs OF the trail.
    photosOfNamed([trail.name, trail.officialName ?? "", trail.altName ?? ""], {
      near: { lat: trail.lat, lon: trail.lon },
      signal: ctrl.signal,
    })
      .then((named) => {
        /*
         * Verified photographs only.
         *
         * The fallback here used to be a Commons geosearch — "photographed
         * near" — and it was removed for the same reason it was removed from
         * the cards: it cannot tell terrain from a stranger's selfie, a village
         * street or a war memorial, because all it ever sees is a filename. A
         * hero image is the most confident surface in the app and it is the
         * last place that should be guessing.
         */
        if (live && named.length) setPhotos(named);
      })
      .catch(() => {})
      /*
       * WHETHER THE LOOKUP FINISHED IS ITSELF A FACT THE PAGE NEEDS.
       *
       * Without it the screen cannot tell "Commons has none of this trail"
       * from "Commons has not answered yet", and the old page's honest
       * sentence — the one that said which — had nowhere to live once the
       * Photos tab went. Silence is not an answer; it just looks like one.
       */
      .finally(() => {
        if (live) setPhotosSearched(true);
      });

    return () => {
      live = false;
      ctrl.abort();
    };
  }, [trail]);

  /** Measured off the line, and only once the whole line is here. */
  const measuredKm = useMemo(() => (line.length > 1 ? lengthOf(line) : null), [line]);
  /*
   * The member ways ALREADY carry the geometry, so the hero's shape draws from
   * them and the separate `trailGeometry` request is only a fallback.
   */
  const segments = useMemo(() => (facts.ways ? lineSegments(facts.ways) : []), [facts.ways]);
  const haveLine = segments.length > 0 || line.length > 1;
  const chips = useMemo(() => (facts.ways ? accessChips(facts.ways) : []), [facts.ways]);
  // Every hook must run on every render — this one used to sit below the early
  // returns, so the first render after the trail arrived called one more hook
  // than the render before it.
  const flash = useSaveFlash(saved);

  const goToMap = useCallback(() => {
    mapSection.ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mapSection.ref]);

  /*
   * The page's own scroller, moved directly.
   *
   * NOT `scrollContentToTop`: that helper walks UP from the element it is
   * given looking for the nearest scrolling ancestor, which is right for a
   * button that does not know where it lives and wrong here, where this
   * component owns the container.
   */
  const goToTop = useCallback(() => {
    scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (trail === null) return <Navigate to="/explore/routes" replace />;

  if (trail === undefined) {
    return (
      <div className="grid h-full place-items-center">
        <p className="flex items-center gap-2 text-[12.5px] text-mist-dim">
          <Loader2 size={14} className="animate-spin" />
          Finding this trail…
        </p>
      </div>
    );
  }

  // Derived AFTER the guards, where `trail` is known. The member ways sum to the
  // walked distance with no invented gaps between them, so they beat both the
  // usually-absent `distance` tag and the concatenated line.
  const computedKm = facts.ways ? trailLengthKm(facts.ways) : null;
  const km = trail.lengthKm ?? computedKm ?? measuredKm;
  const grade = trail.sacScale ?? (facts.ways ? hardestGrade(facts.ways) : undefined);
  const gradeDerived = !trail.sacScale && grade !== undefined;
  const movingH =
    km && facts.elevation
      ? walkingHours(km, facts.elevation.ascentM, facts.elevation.descentM)
      : null;
  const shape = routeShape(line, facts.ways, trail.roundtrip, km);
  const viewpoints = orderedStops.filter((w) => w.kind === "viewpoint").length;
  /* Kept as pairs so a row can print the number ITS PIN carries on the map.
     The list is the named stops only, but the pins are numbered across all of
     them, so a bare list would have counted 1, 2, 3 beside pins 2, 5 and 9. */
  const namedStops = orderedStops
    .map((w, i) => ({ w, n: i + 1 }))
    .filter((s) => s.w.label !== null);

  const spot = { lat: trail.lat, lon: trail.lon, name: trail.name };
  /** The first point of the mapped line — a place on the ground, unlike `spot`. */
  const startSpot = line.length > 1 ? { lat: line[0].lat, lon: line[0].lon } : null;
  /** Still worth waiting for, as opposed to not coming. */
  const lineWaiting = lineLoading || facts.loading;
  /* Frame 0 is whatever `TrailImage` settled on — a verified photograph, the
     satellite ground, or the contour plate. The rest are the Commons
     photographs, each carrying its own credit. Dots appear only when there is
     genuinely more than one, and every dot changes the picture: the previous
     version drew up to five dots that moved a counter nothing read. */
  const frameCount = 1 + photos.length;
  const activeFrame = Math.min(frame, frameCount - 1);
  const framePhoto = activeFrame > 0 ? photos[activeFrame - 1] : null;

  const toggleSave = () => {
    if (saved) unsaveTrail(trail.osmId);
    else saveTrail(trail);
    setSaved(!saved);
  };

  return (
    <div
      ref={scroller}
      className="no-scrollbar relative flex h-full flex-col overflow-y-auto"
      /*
       * `TABBAR_STICKY_BOTTOM`, not `TABBAR_CLEAR`.
       *
       * The clearance constant is for a scroller whose last row is CONTENT.
       * Here the last row is the pinned bar itself, and the bar's resting place
       * in normal flow has to coincide exactly with where `position: sticky`
       * holds it — otherwise it visibly hops up 12px as you reach the end.
       */
      style={{ paddingBottom: TABBAR_STICKY_BOTTOM }}
    >
      {/* ---- Hero — edge to edge -----------------------------------------
          No inset, no radius, and no sheet lapping over the bottom of it. The
          rounded panel that used to sit here (`-mt-7 rounded-t-[26px]`) cut
          the photograph off 28px early; on the reference the photograph runs
          to the edge on all three sides and the type starts below it.

          `on-dark` because the ground here is a photograph in both themes —
          see index.css. Without it the controls take the light palette on a
          light build and vanish into the picture. */}
      <div className="on-dark relative h-[46vh] max-h-[420px] min-h-[290px] shrink-0 bg-slate">
        <TrailImage
          osmId={trail.osmId}
          lat={trail.lat}
          lon={trail.lon}
          name={trail.name}
          onCaption={setHeroCaption}
          onPhoto={setHeroPhoto}
          className="absolute inset-0 h-full w-full"
        />
        {/* NOT `aria-hidden`, unlike `TrailImage`'s own layers. Those are a
            plate and a satellite mosaic under a caption that describes them;
            this is a photograph the athlete CHOSE with the dots below, and a
            reader who cannot see it still needs to be told the picture
            changed. The photographer is in the credit line beneath, which is a
            link, so the alt text does not repeat it. */}
        {framePhoto && (
          <img
            src={framePhoto.src}
            alt={`Photograph ${activeFrame} of ${trail.name}`}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 h-2/3" />

        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          // ExploreLayout's header has already cleared the notch (see the
          // --screen-safe-top contract in chrome.tsx); adding env() here counted
          // it twice and dropped these controls ~47px on a notched phone.
          className="absolute left-4 top-3.5 grid h-9 w-9 place-items-center rounded-full border border-hairline-strong bg-obsidian/70 text-snow backdrop-blur transition-colors hover:border-azure/50"
        >
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>

        {/* Share, save, more — the reference's order exactly. Directions used
            to hold the save slot up here; it has moved down to the two
            full-width buttons, where the reference puts it. */}
        <div className="absolute right-4 top-3.5 flex gap-2">
          <HeroCircleButton
            label="Share"
            icon={Share2}
            onClick={() => sharePage(`${trail.name} · ICEFALL`)}
          />
          <SaveCircle saved={saved} onToggle={toggleSave} />
          <HeroCircleButton label="More" icon={MoreHorizontal} onClick={() => setOptions(true)} />
        </div>

        {/* THE DOT IS 6px; THE BUTTON IS NOT. Each one is a 24x44 target with
            the dot drawn in the middle of it, so the carousel can be worked
            with a thumb and with a keyboard — the dots themselves are the
            reference's, the hit area is this app's 44px rule. */}
        {frameCount > 1 && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center">
            {Array.from({ length: frameCount }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={i === 0 ? "Cover" : `Photograph ${i}`}
                aria-current={i === activeFrame ? "true" : undefined}
                onClick={() => setFrame(i)}
                className="grid h-11 w-6 place-items-center"
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === activeFrame ? "w-5 bg-snow" : "w-1.5 bg-snow/40",
                  )}
                />
              </button>
            ))}
          </div>
        )}

        {/*
          THE CREDIT IS A LICENCE OBLIGATION, NOT A CAPTION.

          Every CC licence in this data asks for the photographer BY NAME, the
          licence NAMED, and — where it is practicable, and on a web page it
          always is — a LINK to the licence and to the work. So the same
          treatment goes on every frame rather than on Geograph's alone:

            · Commons carousel frames link the whole caption to the file page,
              which is where that photograph's own licence lives.
            · The hero frame is rebuilt from `TrailPhoto`'s OWN FIELDS — the
              photographer linked to the photo page, the licence linked to its
              deed. It used to print "CC BY-SA 2.0" as a constant, which was
              true only because every Geograph entry happens to carry it today,
              and it left the ~12,000 Commons entries with no link at all. A
              hard-coded licence is one harvest away from naming the wrong one,
              and `trailImagery.ts` already fixed that exact bug inside
              `photoCaption`.
        */}
        <div className="absolute inset-x-0 bottom-2.5 pl-5 pr-24 text-[10px] text-mist-dim">
          {framePhoto ? (
            <a
              href={framePhoto.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate underline decoration-mist-dim/40 underline-offset-2"
            >
              {ofCaption(trail.name, framePhoto)}
            </a>
          ) : heroPhoto ? (
            <p className="truncate">
              {/* The subject, exactly as `photoCaption` phrased it — "Ridge
                  near Akamas Trail" or the trail's own name. Rebuilt from here
                  on out of the entry's fields, so the credit cannot drift from
                  the picture. */}
              {heroCaption.split(" · ")[0]} ·{" "}
              <a
                href={heroPhoto.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-azure underline"
              >
                {heroPhoto.credit ?? "Unknown photographer"}
              </a>{" "}
              · <LicenceName licence={heroPhoto.license} />
              {" · "}
              {heroPhoto.source === "geograph" ? "Geograph" : "Wikimedia Commons"}
            </p>
          ) : (
            <p className="truncate">{heroCaption}</p>
          )}
        </div>

        {/* The route's own shape, overlapping the corner of the photograph as
            the reference draws it — and a control, not decoration: it takes you
            to the interactive map further down. */}
        {haveLine && (
          <button
            type="button"
            onClick={goToMap}
            aria-label="Show the route map"
            className="absolute -bottom-7 right-4 z-10 grid h-[84px] w-[84px] place-items-center overflow-hidden rounded-tile border border-hairline-strong bg-graphite shadow-[var(--ice-shadow-pop)] transition-colors hover:border-azure/50"
          >
            <TrailShape line={line} segments={segments} width={72} height={72} showEnds />
          </button>
        )}
      </div>

      {/* ---- Body ---------------------------------------------------------- */}
      <div className={cn("px-5", haveLine ? "pt-10" : "pt-5")}>
        <Stagger>
          {/* ---- Title ---------------------------------------------------- */}
          <Rise>
            <h1 className="text-[27px] font-light leading-[1.15] text-snow">{trail.name}</h1>
            {trail.localName && <p className="mt-1 text-[13px] text-mist-dim">{trail.localName}</p>}

            {/* The reference's metadata line is a star rating, a coloured
                difficulty square and a place. Two of those three have no
                source here — see the ratings note at the top of this file, and
                `toTrails()`, which carries no country — so the line is the
                grade, the network and the waymark reference, all of them tags
                on this relation. */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-mist">
              {grade && SAC_LABEL[grade] && (
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn("h-2.5 w-2.5 rounded-[3px]", gradeColour(grade))}
                  />
                  <span className="text-snow">{SAC_LABEL[grade]}</span>
                  {/* A route that is T1 for nine kilometres and T4 for one is a
                      T4 day. Where the grade came from the ways rather than the
                      relation, the line says which one it is. */}
                  {gradeDerived && <span className="text-mist-dim">· hardest graded section</span>}
                </span>
              )}
              {trail.network && (
                <>
                  {grade && SAC_LABEL[grade] && <span className="text-mist-dim">·</span>}
                  <span>{NETWORK_LABEL[trail.network]}</span>
                </>
              )}
              {trail.ref && (
                <>
                  <span className="text-mist-dim">·</span>
                  <span className="tnum">{trail.ref}</span>
                </>
              )}
            </div>

            {/* The named ends and what it passes — OSM's `from`, `to`, `via`.
                The shape of the walk is in the stats row; the places are not. */}
            {(trail.from || trail.to || trail.via) && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist-dim">
                {trail.from || trail.to ? `${trail.from ?? "?"} → ${trail.to ?? "?"}` : ""}
                {trail.via ? `${trail.from || trail.to ? " · " : ""}via ${trail.via}` : ""}
              </p>
            )}
          </Rise>

          {/* ---- The four figures ----------------------------------------
              Two columns on a phone, four when there is room. Four cells across
              390px leaves ~82px each and `Stat` sets its value and unit on one
              baseline — so "85.8 km" plus "measured" wrapped onto three ragged
              lines and the labels stopped lining up. */}
          <Rise className="pt-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-y border-hairline py-4 sm:grid-cols-4 sm:gap-2">
              <Stat
                label="Length"
                value={km ? `${km.toFixed(1)} km` : facts.loading ? "…" : "—"}
                unit={
                  km
                    ? trail.lengthKm
                      ? "as mapped"
                      : "measured"
                    : facts.loading
                      ? ""
                      : "not known"
                }
              />
              <Stat
                label="Ascent"
                value={
                  trail.ascentM
                    ? `${trail.ascentM.toLocaleString()} m`
                    : facts.elevation
                      ? `${facts.elevation.ascentM.toLocaleString()} m`
                      : facts.loading
                        ? "…"
                        : "—"
                }
                unit={trail.ascentM ? "as mapped" : facts.elevation ? "computed" : "not known"}
              />
              <Stat
                label="Moving time"
                value={
                  trail.durationH
                    ? formatHours(trail.durationH)
                    : movingH
                      ? formatHours(movingH)
                      : facts.loading
                        ? "…"
                        : "—"
                }
                unit={
                  trail.durationH
                    ? "as mapped"
                    : movingH
                      ? "estimated · DIN 33466"
                      : facts.loading
                        ? ""
                        : "not known"
                }
              />
              {/* The reference's fourth column is the bare word "Circular".
                  Here it is measured — see `routeShape` — and it says which of
                  the two answers it gave: the mapper's tag, or the distance
                  between the two ends of the line. */}
              <Stat
                label="Shape"
                value={shape ? shape.word : lineLoading || facts.loading ? "…" : "—"}
                unit={shape ? shape.detail : lineLoading || facts.loading ? "" : "not known"}
              />
            </div>

            {!trail.durationH && movingH && (
              <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{DIN_NOTE}</p>
            )}
          </Rise>

          {/* ---- The vertical story ---------------------------------------
              The reference has no equivalent and dropping it to match would be
              the worst trade in this rebuild: `elevationOf` samples PER MEMBER
              WAY (Stórurð measured 38.7 km and 1,775 m instead of 14.6 km and
              590 m when the ways were joined first), shares 100 Open-Meteo
              samples out by length, and filters DEM jitter with a 10 m
              hysteresis. It sits directly under the ascent column that names it. */}
          {facts.elevation && km && (
            <Rise className="pt-5">
              <div className="flex items-baseline justify-between">
                <p className="section-label text-mist">Elevation</p>
                <p className="tnum text-[11.5px] text-mist">
                  ↑ {facts.elevation.ascentM.toLocaleString()} m · ↓{" "}
                  {facts.elevation.descentM.toLocaleString()} m
                </p>
              </div>
              <ElevationProfile className="mt-2.5" elevation={facts.elevation} lengthKm={km} />
            </Rise>
          )}

          {/* ---- Description ---------------------------------------------- */}
          {trail.description && (
            <Rise className="pt-6">
              <Description text={trail.description} />
            </Rise>
          )}
        </Stagger>

        {/* ---- The map ----------------------------------------------------
            OUTSIDE `Stagger` and `Rise`, deliberately. Both are framer-motion
            divs and `rise` animates `y`, so both can carry a `transform` — and
            a transformed ancestor makes `position: fixed` resolve against that
            ancestor instead of the viewport, which would leave the expanded map
            pinned inside a 300px box. */}
        <div className="pt-6">
          <RouteMapPanel
            ref={mapSection.ref}
            trail={trail}
            line={line}
            stops={orderedStops}
            haveLine={haveLine}
            lineLoading={lineLoading}
            lineFailed={lineFailed}
            factsLoading={facts.loading}
            waysEmpty={facts.ways?.length === 0}
            waypointsLoading={waypointsLoading}
            onGoToTop={goToTop}
          />
        </div>

        <Stagger>
          {/* ---- Photographs ----------------------------------------------
              The reference puts two media tiles here, both with play buttons:
              an aerial fly-through and a photo tour. NEITHER HAS A SOURCE —
              nothing in this app holds or fetches trail footage, and no
              fly-through was ever filmed. A still with a play triangle over it
              promises footage that does not exist, so the left tile is not
              built; the row is one tile wide, and that tile opens photographs
              that really are of this trail. */}
          {photos.length > 0 ? (
            <Rise className="pt-6">
              {/* A ROW, NOT A TILE. The reference's media tiles are boxes with a
                  play triangle on them; there is no film to play, and this app
                  is mid-way through taking bordered cards OFF its rows. So it
                  is the same flat row as "Along the way" below — a hairline
                  under it, nothing around it. */}
              <button
                type="button"
                onClick={() => setGallery((open) => !open)}
                aria-expanded={gallery}
                className="flex w-full items-center gap-3.5 border-b border-hairline py-3 text-left transition-colors hover:text-snow"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-hairline text-azure">
                  <Images size={17} strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-snow">Photographs</span>
                  <span className="mt-0.5 block text-[11.5px] text-mist-dim">
                    {photos.length} on Wikimedia Commons
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  strokeWidth={1.8}
                  className={cn(
                    "shrink-0 text-mist-dim transition-transform",
                    gallery && "rotate-90",
                  )}
                />
              </button>

              {gallery && (
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  {photos.map((p, i) => (
                    /* The credit is a LINK, and it cannot be inside the button
                       — an anchor nested in a button is neither. So the cell is
                       the picture (which sets the hero) with the credit under
                       it (which opens the file page on Commons, where the
                       licence and the photographer's own terms live). */
                    <div key={p.src} className="overflow-hidden rounded-tile">
                      <button
                        type="button"
                        aria-label={`Show this photograph by ${p.credit} at the top of the page`}
                        onClick={() => {
                          // The chosen frame becomes the hero at the top of the
                          // page. Never `window.scrollTo` — the document does not
                          // scroll in this app, the container above does.
                          setFrame(i + 1);
                          goToTop();
                        }}
                        className="block w-full"
                      >
                        <img
                          src={p.src}
                          alt=""
                          aria-hidden
                          loading="lazy"
                          className="h-28 w-full rounded-tile object-cover"
                        />
                      </button>
                      <a
                        href={p.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate py-1.5 text-[9.5px] text-mist-dim underline decoration-mist-dim/40 underline-offset-2"
                      >
                        {p.credit} · {p.license}
                      </a>
                    </div>
                  ))}
                  <p className="col-span-2 text-[11px] leading-relaxed text-mist-dim">
                    Photographs of this trail on Wikimedia Commons, found by its name and credited
                    to whoever took them.
                  </p>
                </div>
              )}
            </Rise>
          ) : (
            /* ABSENCE CARRIES ITS REASON. The Photos tab used to say this and
               the sentence was lost with the tab: an empty page cannot tell
               you that the archive was searched and holds nothing, and about
               four trails in five are in exactly that position. Printed only
               once Commons has actually answered — before that it would be a
               claim nobody had checked. */
            photosSearched && (
              <Rise className="pt-6">
                <p className="text-[12px] leading-relaxed text-mist-dim">
                  Wikimedia Commons holds no photographs filed under this trail's name.
                </p>
              </Rise>
            )
          )}

          {/* ---- The two full-width buttons -------------------------------
              The reference stacks "Customise route" over "Get directions".
              There is no routing engine in this app, so nothing could re-solve
              a line between dragged points and "Customise route" is not built.
              The GPX file is real and takes the slot. */}
          <Rise className="pt-6">
            <button
              type="button"
              disabled={line.length < 2}
              onClick={() => downloadGpx(trail.name, line)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-pill border border-hairline-strong text-[13.5px] text-snow transition-colors hover:border-azure/50 disabled:pointer-events-none disabled:opacity-45"
            >
              <Download size={16} strokeWidth={1.8} />
              Download GPX
            </button>
            {/* A DISABLED BUTTON HAS TO SAY WHY, AND THE REASON HAS TO BE
                TRUE. This line read "The line is still loading" for both of
                the states that disable the button, so a trail whose geometry
                had actually failed sat under a permanent, false "loading". */}
            <p className="mt-1.5 text-center text-[11px] leading-relaxed text-mist-dim">
              {line.length > 1
                ? `${line.length.toLocaleString()} points · for a watch or handheld`
                : lineWaiting
                  ? "The line is still loading"
                  : "OpenStreetMap didn't send the line, so there is no file to write. This is a connection problem."}
            </p>

            <button
              type="button"
              onClick={() => openMaps(mapsDirectionsUrl(startSpot ?? spot))}
              className="mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-azure text-[13.5px] text-obsidian transition-colors hover:bg-azure-bright"
            >
              <Navigation size={16} strokeWidth={1.8} />
              Get directions
            </button>
            {/* WHERE IT ACTUALLY SENDS YOU, not where it would be nice to be
                sent. `trail.lat/lon` is the centre of the relation's BOUNDING
                BOX — on a horseshoe or an L-shaped route that point can be off
                the trail entirely, and this line used to call it "the middle of
                the route". With the line in hand the destination is its first
                point instead, which is a place on the ground the map above
                marks "Start", and the copy says exactly that much and no more. */}
            <p className="mt-1.5 text-center text-[11px] leading-relaxed text-mist-dim">
              {startSpot
                ? "Opens your maps app at the start of the mapped line — not necessarily a trailhead, and OpenStreetMap does not record where you park."
                : "Opens your maps app at the centre of the area this trail covers — that point may not be on the path, and OpenStreetMap does not record where you park."}
            </p>
          </Rise>

          {/* ---- Along the way --------------------------------------------
              The reference calls this "Top sights". Nobody has voted these the
              top of anything and ICEFALL has no votes to count, so it is named
              for what it is. Only NAMED nodes get a row: an unnamed one stays a
              numbered pin on the map above rather than a "Stop 4" pretending to
              be a sight. The circle holds the kind's glyph — never a photograph
              borrowed from elsewhere on the page, which would be a picture of
              something else. */}
          {namedStops.length > 0 && (
            <Rise className="pt-7">
              <p className="section-label text-mist">Along the way</p>
              <div className="mt-1.5">
                {namedStops.map(({ w, n }) => {
                  const Icon = KIND_ICON[w.kind];
                  return (
                    <button
                      key={`${w.lat},${w.lon}`}
                      type="button"
                      onClick={() => openMaps(mapsPinUrl({ lat: w.lat, lon: w.lon }))}
                      className="flex w-full items-center gap-3.5 border-b border-hairline py-3 text-left transition-colors last:border-b-0 hover:text-snow"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-hairline text-azure">
                        <Icon size={16} strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-snow">
                          {/* The pin's own number, so the row and the map are
                              obviously the same thing. */}
                          <span className="tnum mr-2 text-mist-dim">{n}</span>
                          {w.label}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] text-mist-dim">
                          {KIND_LABEL[w.kind]}
                        </span>
                      </span>
                      <ChevronRight
                        size={15}
                        strokeWidth={1.8}
                        className="shrink-0 text-mist-dim"
                      />
                    </button>
                  );
                })}
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
                Points OpenStreetMap has tagged along this route. Not every trail has any, and this
                one may not have them all. Tapping one opens it in your maps app.
              </p>
            </Rise>
          )}

          {/* ---- Access ---------------------------------------------------
              The reference's chip row is Dog-friendly, Child-friendly, Bike
              touring, Trail running, Walking, Views. Four of those six are a
              competitor's editorial categories with no OSM tag behind them and
              are not printed. The ones that are printed carry the metres that
              back them — see `accessChips`. */}
          {facts.ways && (
            <Rise className="pt-7">
              <p className="section-label text-mist">Access, as tagged</p>
              {/* THE EMPTY STATE TURNS ON THE ACCESS TAGS ALONE. A viewpoint is
                  not an access rule, and it was standing in for one: a route
                  with a viewpoint and no `dog`/`bicycle`/`horse`/`foot` tag
                  suppressed the "nobody has recorded" line, leaving a heading
                  called "Access, as tagged" whose only content was a count of
                  viewpoints. The chip still earns its place — it is the one
                  honest survivor of the reference's "Views" — it just no longer
                  answers a question about access. */}
              {chips.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <span
                      key={c.key}
                      className="rounded-pill border border-hairline-strong px-3 py-1.5 text-[12px] text-snow"
                    >
                      {c.label}
                      <span className="text-mist-dim"> · {c.detail}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
                  Nobody has recorded access rules for this route in OpenStreetMap.
                </p>
              )}
              {viewpoints > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <span className="rounded-pill border border-hairline-strong px-3 py-1.5 text-[12px] text-snow">
                    {viewpoints === 1 ? "1 viewpoint tagged" : `${viewpoints} viewpoints tagged`}
                  </span>
                </div>
              )}
            </Rise>
          )}

          {/* ---- What it is made of ---------------------------------------
              Every metre of this is measured off the ways' own geometry, and
              "Unrecorded" stays a visible class rather than being folded into a
              guess. The reference offers nothing like it and a walker choosing
              boots needs it. */}
          {facts.ways && (
            <Rise className="pt-7">
              <BreakdownBar title="Underfoot" segments={surfaceBreakdown(facts.ways)} />
              <BreakdownBar
                className="mt-5"
                title="Way type"
                segments={waytypeBreakdown(facts.ways)}
              />
            </Rise>
          )}

          {/* ---- Path on the ground ---------------------------------------
              The closest thing this screen has to a safety signal, and real
              survey data rather than a derived score. */}
          {trail.visibility && VISIBILITY_LABEL[trail.visibility] && (
            <Rise className="pt-7">
              <p className="section-label text-mist">Path on the ground</p>
              <p className="mt-2 text-[13.5px] text-snow">{VISIBILITY_LABEL[trail.visibility]}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">
                How easy the path was to follow when it was last surveyed — not today, and not under
                snow.
              </p>
            </Rise>
          )}

          {/* ---- Waymarking ------------------------------------------------
              How you know you are on the right path. Nothing in the reference
              replaces it. */}
          <Rise className="pt-7">
            <p className="section-label text-mist">Waymarking</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
              {trail.symbol ??
                (trail.colour
                  ? `Marked ${trail.colour.replace(/_/g, " ")}${trail.ref ? ` as ${trail.ref}` : ""}.`
                  : "No waymark recorded.")}
              {trail.network
                ? ` ${NETWORK_LABEL[trail.network]} — ${
                    trail.network === "lwn"
                      ? "a local path network."
                      : trail.network === "rwn"
                        ? "a regional route."
                        : trail.network === "nwn"
                          ? "part of a national trail."
                          : "part of an international long-distance route."
                  }`
                : ""}
            </p>
          </Rise>

          {/* ---- Look it up elsewhere --------------------------------------
              ICEFALL holds OSM's line and little else — no trip reports, no
              conditions, and no reviews, which is the reference's whole lower
              half. Rather than imply that absence is all there is, this points
              at the places that do have it. */}
          <Rise className="pt-7">
            <p className="section-label text-mist">Look it up</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <ExternalChip href={googleSearchUrl(trail.name, trail.operator)}>
                View on Google
              </ExternalChip>
              <ExternalChip href={googleImagesUrl(trail.name, trail.operator)}>
                Photos on Google
              </ExternalChip>
              <ExternalChip href={osmRelationUrl(trail.osmId)}>On OpenStreetMap</ExternalChip>
              {trail.website && (
                <ExternalChip href={trail.website}>
                  {trail.operator ?? trail.website.replace(/^https?:\/\//, "").split("/")[0]}
                </ExternalChip>
              )}
            </div>
          </Rise>

          <Rise className="pt-7">
            <Disclaimer>
              {TRAIL_ATTRIBUTION}. ICEFALL has not walked or surveyed this trail, and knows nothing
              about its condition today — snow, washouts and closures are not in this data.
            </Disclaimer>
          </Rise>

          {guided !== null && (
            <GuidedBy
              peakName={guided.peakName}
              elevationM={guided.elevationM}
              country={guided.country}
            />
          )}
        </Stagger>

        {saved && <p className="mt-6 text-center text-[10.5px] text-mist-dim">{SAVED_NOTICE}</p>}
      </div>

      {/* Room for the bar to rest over, so the last row of content is never
          under it. `mt-auto` pushes the bar to the foot on a short page. */}
      <div className="mt-auto h-6 shrink-0" />

      {/* ---- The pinned bar -----------------------------------------------
          STICKY, not fixed, and it rests on `TABBAR_STICKY_BOTTOM`.

          The last pinned version of this bar padded itself by the tab bar's
          height on the theory that the bar overlays the viewport. The tab bar
          is an overlay, but the padding was applied the wrong way round: the
          panel covered it and left a dead black band underneath. That constant
          exists for exactly this and is the only correct way to say "just
          above the pill, never under it". */}
      <div
        className="sticky z-20 shrink-0 border-t border-hairline bg-obsidian/95 px-5 py-3 backdrop-blur"
        style={{ bottom: TABBAR_STICKY_BOTTOM }}
      >
        <div className="flex items-stretch gap-2.5">
          <button
            type="button"
            onClick={toggleSave}
            aria-pressed={saved}
            className={cn(
              "flex h-11 flex-1 items-center justify-center gap-2 rounded-pill text-[13.5px] transition-colors",
              saved
                ? "border border-azure/50 bg-azure/[0.12] text-azure"
                : "bg-azure text-obsidian hover:bg-azure-bright",
            )}
          >
            <HeartGlyph filled={saved} />
            {saved ? "Saved" : "Save"}
          </button>
          {/* "GPX", not "Download". Download promises the trail works without a
              signal, and it does not: there is no per-trail offline pack in
              this app, and the satellite tiles may not be cached at all. */}
          <button
            type="button"
            disabled={line.length < 2}
            onClick={() => downloadGpx(trail.name, line)}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-pill border border-hairline-strong text-[13.5px] text-snow transition-colors hover:border-azure/50 disabled:pointer-events-none disabled:opacity-45"
          >
            <Download size={16} strokeWidth={1.8} />
            GPX
          </button>
          <button
            type="button"
            onClick={goToMap}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-pill border border-hairline-strong text-[13.5px] text-snow transition-colors hover:border-azure/50"
          >
            <MapGlyph size={16} strokeWidth={1.8} />
            Map
          </button>
        </div>
      </div>

      <SavedToast show={flash} label="Saved to your trails" detail="on this device" />

      {options && (
        <OptionsSheet
          trail={trail}
          line={line}
          waiting={lineWaiting}
          onClose={() => setOptions(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The SAC grade as the reference's coloured square.
 *
 * A rendering of a real tag, not a score: green for the two walking grades,
 * amber where hands come out, red for the alpine ones.
 */
function gradeColour(grade: string): string {
  if (grade === "hiking" || grade === "mountain_hiking") return "bg-summit";
  if (grade === "demanding_mountain_hiking" || grade === "alpine_hiking") return "bg-alert";
  return "bg-danger";
}

/** The waypoint kinds, in a walker's words. */
const KIND_LABEL: Record<TrailWaypoint["kind"], string> = {
  viewpoint: "Viewpoint",
  peak: "Peak",
  water: "Drinking water",
  parking: "Parking",
  information: "Information board",
  picnic: "Picnic site",
  landmark: "Attraction",
};

/** The heart on the pinned bar — filled once the trail is saved. */
function HeartGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

/**
 * The licence, linked to its own deed where there is one to link to.
 *
 * NOT a lookup table of the licences that happen to be in `photos.json` today:
 * that file is rebuilt by a harvest script and gained CC0, CC BY 4.0 and the
 * ported CC BY-SA 3.0 de/at/pl variants after it was first written. So the
 * string is PARSED — "CC BY-SA 3.0 de" becomes .../licenses/by-sa/3.0/de/ —
 * and anything the pattern does not recognise (a public-domain mark, a licence
 * added later) is printed as plain text rather than linked to a guess. A wrong
 * licence URL is a false statement about somebody's rights in their own photo.
 */
function LicenceName({ licence }: { licence: string }) {
  const href = licenceUrl(licence);
  if (!href) return <span>{licence}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-azure underline">
      {licence}
    </a>
  );
}

function licenceUrl(licence: string): string | null {
  if (/^CC0/i.test(licence)) return "https://creativecommons.org/publicdomain/zero/1.0/";
  const m = /^CC (BY(?:-SA)?) (\d(?:\.\d)?)(?: ([a-z]{2}))?$/i.exec(licence.trim());
  if (!m) return null;
  const port = m[3] ? `${m[3].toLowerCase()}/` : "";
  return `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/${port}`;
}

function ExternalChip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-3 py-1.5 text-[12px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
    >
      {children}
      <ExternalLink size={11} strokeWidth={1.8} />
    </a>
  );
}

/**
 * OSM's `description` tag, clamped, with the reference's "Show more".
 *
 * The link appears ONLY when the text genuinely overflows three lines. A
 * "Show more" that expands nothing is the same cardinal sin as a button that
 * does nothing, and it is invisible in a mock-up because the mock-up's copy is
 * always long enough.
 */
function Description({ text }: { text: string }) {
  const body = useRef<HTMLParagraphElement | null>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    // Measured against the clamped element, so this is the real question:
    // is there more text than three lines can hold?
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);

  return (
    <div>
      <p
        ref={body}
        className={cn(
          "text-[13px] leading-relaxed text-mist",
          !open && "line-clamp-3 overflow-hidden",
        )}
      >
        {text}
      </p>
      {(overflows || open) && (
        <div className="mt-1 text-right">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[12.5px] text-azure underline underline-offset-2"
          >
            {open ? "Show less" : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The route map, inset with a radius as the reference draws it.
 *
 * Two of the reference's three controls survive. The bottom-left pill is
 * "On-trail directions" there; here it is the map-style switch, because there
 * is no routing service anywhere in this app and ICEFALL cannot turn you left.
 * The bottom-right expand control is real and throws the same map instance
 * full-screen — a second map would be a second MapLibre context and a second
 * set of tile requests for the same ground.
 */
function RouteMapPanel({
  ref,
  trail,
  line,
  stops,
  haveLine,
  lineLoading,
  lineFailed,
  factsLoading,
  waysEmpty,
  waypointsLoading,
  onGoToTop,
}: {
  ref: React.Ref<HTMLDivElement>;
  trail: Trail;
  line: LatLon[];
  stops: TrailWaypoint[];
  haveLine: boolean;
  lineLoading: boolean;
  lineFailed: boolean;
  factsLoading: boolean;
  waysEmpty: boolean;
  waypointsLoading: boolean;
  onGoToTop: () => void;
}) {
  const [style, setStyle] = useState<MapStyleId>(() => savedMapStyle());
  const [picker, setPicker] = useState(false);
  const [full, setFull] = useState(false);

  // Escape closes the full-screen map — the only way out on a desktop build,
  // where there is no back gesture.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const dead = !haveLine && !lineLoading && !factsLoading && (lineFailed || waysEmpty);

  return (
    <div ref={ref} className="scroll-mt-4">
      <div
        className={cn(
          "relative bg-graphite",
          full
            ? "fixed inset-0 z-50"
            : "h-[300px] overflow-hidden rounded-card border border-hairline",
        )}
      >
        <RouteWaypointMap
          line={line}
          start={line[0] ?? { lat: trail.lat, lon: trail.lon }}
          center={{ lat: trail.lat, lon: trail.lon }}
          waypoints={stops}
          styleId={style}
          className="absolute inset-0 h-full w-full"
        />

        {/* Bottom-left: the three styles this app already offers everywhere
            else, under their own labels. One preference, not a second one —
            choosing Satellite here is the choice the tracker will use on the
            next recording. */}
        <div className="absolute bottom-3 left-3 flex flex-col items-start gap-1.5">
          {picker &&
            (Object.keys(MAP_STYLE_LABEL) as MapStyleId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setStyle(id);
                  saveMapStyle(id);
                  setPicker(false);
                }}
                aria-pressed={style === id}
                className={cn(
                  "rounded-pill border px-3 py-1.5 text-[11px] backdrop-blur transition-colors",
                  style === id
                    ? "border-azure/55 bg-azure/[0.12] text-azure"
                    : "border-hairline-strong bg-obsidian/85 text-mist hover:text-snow",
                )}
              >
                {MAP_STYLE_LABEL[id]}
              </button>
            ))}
          <button
            type="button"
            onClick={() => setPicker((v) => !v)}
            aria-expanded={picker}
            className={cn(
              "flex items-center gap-1.5 rounded-pill border bg-obsidian/85 px-3.5 py-2 text-[12px] backdrop-blur transition-colors",
              picker
                ? "border-azure/55 text-azure"
                : "border-hairline-strong text-snow hover:border-azure/50",
            )}
          >
            <Layers size={14} strokeWidth={1.8} aria-hidden />
            {MAP_STYLE_LABEL[style]}
          </button>
        </div>

        {/* Bottom-right on the reference; top-right once the map is full-screen,
            where the bottom of the frame belongs to the phone's own gestures. */}
        <button
          type="button"
          onClick={() => setFull((v) => !v)}
          aria-label={full ? "Close the full map" : "Expand the map"}
          className={cn(
            "absolute grid h-10 w-10 place-items-center rounded-full border border-hairline-strong bg-obsidian/85 text-snow backdrop-blur transition-colors hover:border-azure/50",
            full ? "right-4 top-4" : "bottom-3 right-3",
          )}
        >
          {full ? <X size={17} strokeWidth={1.8} /> : <Maximize2 size={16} strokeWidth={1.8} />}
        </button>
      </div>

      {waypointsLoading && (
        <p className="mt-3 flex items-center justify-center gap-2 text-[11.5px] text-mist-dim">
          <Loader2 size={12} className="animate-spin" />
          Checking OpenStreetMap for waypoints…
        </p>
      )}

      {haveLine ? (
        <div className="tnum mt-3 flex items-center justify-between text-[11.5px] text-mist">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-azure" /> Start
          </span>
          <span>{line.length > 1 ? `${line.length.toLocaleString()} points` : ""}</span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-snow" /> End
          </span>
        </div>
      ) : (
        lineLoading && (
          <p className="mt-3 flex items-center justify-center gap-2 text-[11.5px] text-mist-dim">
            <Loader2 size={12} className="animate-spin" />
            Drawing the route…
          </p>
        )
      )}

      {dead && (
        <p className="mt-3 text-center text-[12.5px] text-mist-dim">
          Couldn't load the line. This is a connection problem, not an empty map.
        </p>
      )}

      <Disclaimer className="mt-3">
        The real line as mapped in OpenStreetMap, simplified for drawing. Start and end are the ends
        of the relation, not necessarily a trailhead.
        {stops.length > 0
          ? " Numbered stops are real points OpenStreetMap has tagged along the way — not every trail has any, and this one may not have all of them."
          : ""}
      </Disclaimer>

      {/* The hero's thumbnail brought you here; this goes back. */}
      <button
        type="button"
        onClick={onGoToTop}
        className="mt-3 text-[12px] text-mist-dim underline underline-offset-2 transition-colors hover:text-snow"
      >
        Back to the top
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function OptionsSheet({
  trail,
  line,
  waiting,
  onClose,
}: {
  trail: Trail;
  line: LatLon[];
  /** True while the line may still arrive — see the GPX row. */
  waiting: boolean;
  onClose: () => void;
}) {
  /* The same destination the page's own "Get directions" uses: a point ON the
     route where there is one, and the centre of its map area where there is
     not. These two used to disagree — the sheet always sent you to the centre. */
  const destination = line.length > 1 ? { lat: line[0].lat, lon: line[0].lon } : trail;
  const osm = `https://www.openstreetmap.org/relation/${trail.osmId}`;
  return (
    <Sheet title={trail.name} onClose={onClose}>
      <SheetRow
        icon={Download}
        title="Download GPX"
        detail={
          line.length > 1
            ? `${line.length.toLocaleString()} points · for a watch or handheld`
            : waiting
              ? "The line is still loading"
              : "OpenStreetMap didn't send the line — nothing to write"
        }
        onClick={() => line.length > 1 && downloadGpx(trail.name, line)}
      />
      <SheetRow
        icon={ExternalLink}
        title="View on OpenStreetMap"
        detail={`Relation ${trail.osmId}`}
        onClick={() => window.open(osm, "_blank", "noopener,noreferrer")}
      />
      <SheetRow
        icon={Navigation}
        title="Directions in Google Maps"
        detail={
          line.length > 1 ? "To the start of the mapped line" : "To the centre of its map area"
        }
        onClick={() => openMaps(mapsDirectionsUrl(destination))}
      />
      <SheetRow
        icon={MapPin}
        title="Show the pin"
        detail={`${trail.lat.toFixed(4)}, ${trail.lon.toFixed(4)}`}
        onClick={() => openMaps(mapsPinUrl({ lat: trail.lat, lon: trail.lon }))}
      />
      {trail.website && (
        <SheetRow
          icon={ExternalLink}
          title="Operator's page"
          detail={trail.website.replace(/^https?:\/\//, "").split("/")[0]}
          onClick={() => window.open(trail.website!, "_blank", "noopener,noreferrer")}
        />
      )}
    </Sheet>
  );
}

/**
 * Saves the route as GPX.
 *
 * The line comes from the relation's own geometry, so the file carries OSM's
 * ODbL notice in its metadata — required, and the sort of thing that is easy to
 * leave out and hard to add back once the file is on somebody's watch.
 */
function downloadGpx(name: string, line: LatLon[]) {
  if (line.length < 2) return;
  const blob = new Blob([toGpx(name, line)], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${
    name
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "trail"
  }.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------------- */
/* Guided by                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Companies that work the mountain this approach leads to.
 *
 * A walk-in is where an expedition starts, so someone reading about the
 * approach is often the same person deciding who to climb with.
 *
 * Matched on the PEAK the athlete arrived from — carried in the query string by
 * the Expeditions hikes tab — not on the trail. A `Trail` records no country
 * and no summit altitude, so matching on the path alone would either list
 * nothing or list companies with no connection to where it is. Open the same
 * trail from Find and this section does not appear, which is correct: there is
 * no expedition in that context to guide.
 *
 * No operator has said anything about this trail, and none guides it as a
 * product. The copy says so, because a list of companies under a route reads as
 * an endorsement unless it is told not to.
 */
function GuidedBy({
  peakName,
  elevationM,
  country,
}: {
  peakName: string;
  elevationM: number;
  country?: string;
}) {
  const listings = useMemo(
    () =>
      operatorsFor({ country, elevationM })
        .slice(0, 3)
        .sort((a, b) => a.name.localeCompare(b.name, "en-GB")),
    [country, elevationM],
  );

  if (listings.length === 0) return null;

  return (
    <Rise className="pt-8">
      <p className="section-label">Guided expeditions on {peakName}</p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
        Companies listed for this mountain's country and altitude. None of them guides this trail,
        and none has said anything about it — a starting point for research, not a recommendation.
      </p>
      <div className="mt-3">
        {listings.map((o) => (
          <Link
            key={o.id}
            to={`/operator/${o.id}?${new URLSearchParams({
              peak: peakName,
              elevation: String(elevationM),
              ...(country !== undefined ? { country } : {}),
            }).toString()}`}
            className="flex items-center gap-3.5 border-b border-hairline py-3 last:border-b-0"
          >
            {/* Was a fourth monogram algorithm, written inline in the JSX — so
                a company reached from a trail showed different initials than
                the same company reached from the directory. */}
            <CompanyMark name={o.name} logoPath={o.logo} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-snow">{o.name}</span>
              <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">
                {o.certification}
              </span>
            </span>
            <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
          </Link>
        ))}
      </div>
    </Rise>
  );
}

/**
 * The trail, on Google.
 *
 * `Trail` carries no country, so the operator's name is the disambiguator when
 * there is one — "Blue trail" alone finds nothing useful, "Blue trail
 * thestoopwalk.webs.com" finds the route. Deliberately not guessing a country
 * from the coordinates: a wrong one in the query is worse than none.
 */
function googleSearchUrl(name: string, hint?: string): string {
  const q = [name, hint, "hiking trail"].filter(Boolean).join(" ");
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** The same query, on Google Images. */
function googleImagesUrl(name: string, hint?: string): string {
  const q = [name, hint, "hiking trail"].filter(Boolean).join(" ");
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;
}

/** The relation itself, for anyone who wants to check or fix the data. */
function osmRelationUrl(osmId: number): string {
  return `https://www.openstreetmap.org/relation/${osmId}`;
}
