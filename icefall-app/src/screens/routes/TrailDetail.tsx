import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Bookmark, ChevronLeft, ChevronRight, ExternalLink, Loader2, MapPin, MoreHorizontal,
  Navigation, Route as RouteIcon, Share2, Star, Users, X,
  Download,
} from "lucide-react";
import { Card, Disclaimer, HeroCircleButton, IconAction, Stat, sharePage } from "@/components/ui/primitives";
import { CompanyMark } from "@/components/domain/CompanyMark";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { Rise, Stagger, scrollContentToTop } from "@/components/layout/chrome";
import { MapBackdrop, MiniMap } from "@/components/domain/MiniMap";
import { TrailShape, useTrailLine } from "@/components/domain/TrailShape";
import {
  NETWORK_LABEL, SAC_LABEL, TRAIL_ATTRIBUTION, VISIBILITY_LABEL, lengthOf, trailById,
  type LatLon, type Trail,
} from "@/services/trails";
import {
  ofCaption, photosOfNamed, type PlacePhoto,
} from "@/services/placePhotos";
import { RATING_NOTICE, fmtPeople, ratingFor } from "@/routes/ratings";
import { operatorsFor } from "@/services/operators";
import { TrailImage } from "@/components/domain/TrailImage";
import type { TrailPhoto } from "@/services/trailImagery";
import { trailWaypoints, orderedWaypoints, type TrailWaypoint } from "@/services/trailWaypoints";
import { RouteWaypointMap, KIND_ICON } from "@/components/domain/RouteWaypointMap";

/** The hero caption before `TrailImage` reports which layer it settled on. */
const TRAIL_PLATE_CAPTION = "Contours — imagery loading";
import { mapsDirectionsUrl, mapsPinUrl, openMaps } from "@/lib/maps";
import { SAVED_NOTICE, isTrailSaved, saveTrail, unsaveTrail } from "@/services/savedTrails";
import { SaveAction, SaveButton, SavedToast, useSaveFlash } from "@/components/ui/SaveControl";
import { BreakdownBar, ElevationProfile } from "@/components/domain/TrailProfile";
import {
  elevationOf, formatHours, hardestGrade, lineSegments, surfaceBreakdown, toGpx,
  trailLengthKm, trailWays, walkingHours, type Elevation, type TrailWay, waytypeBreakdown,
} from "@/services/trailProfile";
import { cn } from "@/lib/utils";

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
      .finally(() => { if (live) setLoading(false); });

    return () => { live = false; ctrl.abort(); };
  }, [osmId]);

  return { ways, elevation, loading };
}

/**
 * Real tagged stops along the route. Fetched only once the Map tab is
 * actually opened — an Overpass query nobody looks at is a query nobody
 * needed to make.
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
      .then((p) => { if (live) setPoints(p); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; ctrl.abort(); };
  }, [osmId, enabled, points]);

  return { points, loading };
}

type Tab = "trail" | "map" | "photos";
const TABS: { id: Tab; label: string }[] = [
  { id: "trail", label: "Trail" },
  { id: "map", label: "Map" },
  { id: "photos", label: "Photos" },
];

/**
 * A trail's page.
 *
 * Everything here is OpenStreetMap's, and it is the first screen in ICEFALL that
 * can draw a real line: a hiking route relation carries geometry, so the shape,
 * the length and the ends are measured rather than derived. What it still cannot
 * do is tell you the ground is safe today, and it says so.
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
  const [tab, setTab] = useState<Tab>("trail");
  const [saved, setSaved] = useState(false);
  // Re-read once the trail resolves, so the button reflects what is stored
  // rather than always starting at "not saved".
  useEffect(() => {
    if (Number.isFinite(osmId)) setSaved(isTrailSaved(osmId));
  }, [osmId]);
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);
  const [frame, setFrame] = useState(0);
  const [options, setOptions] = useState(false);
  // Owned by `TrailImage` — satellite and a photograph make different claims.
  const [heroCaption, setHeroCaption] = useState(TRAIL_PLATE_CAPTION);
  const [heroPhoto, setHeroPhoto] = useState<TrailPhoto | null>(null);

  const { line, loading: lineLoading, failed: lineFailed } = useTrailLine(
    Number.isFinite(osmId) ? osmId : undefined,
  );
  /*
   * Gated on the line being ready, not just on the tab being open.
   *
   * Measured: opening the Map tab used to fire this alongside `trailWays` and
   * `trailGeometry` — three concurrent Overpass queries from one client, one
   * of them (the E4's ~1.3 MB `out geom`) already the heaviest single request
   * this app makes. Instrumenting `fetch` caught 17 Overpass calls inside
   * three seconds, and `trailGeometry`, which succeeds in well under this
   * function's own timeout when called alone, came back empty under that
   * load. Waiting for the line costs nothing here — `orderedWaypoints` needs
   * it anyway — and it turns three competing requests back into two, then one.
   */
  const { points: waypointPoints, loading: waypointsLoading } = useTrailWaypoints(
    Number.isFinite(osmId) ? osmId : undefined,
    tab === "map" && line.length > 1,
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

  useEffect(() => {
    if (!trail) return;
    let live = true;
    const ctrl = new AbortController();

    // By name first — those are photographs OF the trail. Only if Commons holds
    // none does it fall back to what was photographed nearby.
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
      .catch(() => {});

    return () => {
      live = false;
      ctrl.abort();
    };
  }, [trail]);

  /** Measured off the line, and only once the whole line is here. */
  const measuredKm = useMemo(() => (line.length > 1 ? lengthOf(line) : null), [line]);
  const facts = useTrailFacts(trail?.osmId);
  /*
   * The member ways ALREADY carry the geometry, so the map draws from them and
   * the separate `trailGeometry` request is only a fallback. Two heavy queries
   * for overlapping data meant the Map tab could fail on its own while the page
   * held the line in memory — which is exactly what "Couldn't load the line"
   * was reporting.
   */
  const segments = useMemo(() => (facts.ways ? lineSegments(facts.ways) : []), [facts.ways]);
  const haveLine = segments.length > 0 || line.length > 1;
  // Every hook must run on every render. This one used to sit below the early
  // returns for "not found" and "still loading", so the first render after the
  // trail arrived called one more hook than the render before it.
  const flash = useSaveFlash(saved);

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
  const movingH =
    km && facts.elevation
      ? walkingHours(km, facts.elevation.ascentM, facts.elevation.descentM)
      : null;

  const rating = ratingFor(trail.id);
  const photo = photos[Math.min(frame, Math.max(0, photos.length - 1))];
  const spot = { lat: trail.lat, lon: trail.lon, name: trail.name };

  const toggleSave = () => {
    if (saved) unsaveTrail(trail.osmId);
    else saveTrail(trail);
    setSaved(!saved);
  };

  return (
    <div className="no-scrollbar relative h-full overflow-y-auto">
      {/* ---- Hero -------------------------------------------------------- */}
      <div className="relative h-[330px] bg-slate">
        {/* Plate instantly, satellite imagery of the real ground, then a
            Wikidata-verified photograph where one exists. */}
        <TrailImage
          osmId={trail.osmId}
          lat={trail.lat}
          lon={trail.lon}
          name={trail.name}
          onCaption={setHeroCaption}
          onPhoto={setHeroPhoto}
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-obsidian/60 via-transparent to-obsidian" />

        {/* The real line, over the photograph. */}
        {haveLine && (
          <div className="pointer-events-none absolute bottom-16 right-4 opacity-90">
            <TrailShape line={line} segments={segments} width={92} height={92} showEnds />
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          // ExploreLayout's header has already cleared the notch (see the
          // --screen-safe-top contract in chrome.tsx); adding env() here counted
          // it twice and dropped these controls ~47px on a notched phone.
          className="absolute left-4 top-3.5 grid h-9 w-9 place-items-center rounded-full border border-hairline-strong bg-obsidian/70 text-snow backdrop-blur"
        >
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>
        <div className="absolute right-4 top-3.5 flex gap-2">
          {/* On the hero, visible the instant the page opens — the other three
              Directions controls further down the page (the actions row, the
              footer, and the options sheet) all need a scroll to reach. */}
          <HeroCircleButton
            label="Directions"
            icon={Navigation}
            onClick={() => openMaps(mapsDirectionsUrl(spot))}
          />
          <HeroCircleButton label="Share" icon={Share2} onClick={() => sharePage(`${trail.name} · ICEFALL`)} />
          <HeroCircleButton label="More" icon={MoreHorizontal} onClick={() => setOptions(true)} />
        </div>

        {/*
          Geograph's terms require the photographer credited BY NAME with a
          LINK to the photo page and to the licence — the plain-text caption
          alone doesn't clear that. Wikidata/Commons photos need no separate
          line: `photoCaption` already names the source.
        */}
        {heroPhoto?.source === "geograph" ? (
          <p className="absolute inset-x-0 bottom-14 truncate px-5 text-[10px] text-mist-dim">
            {heroCaption.split(" · ")[0]} ·{" "}
            <a
              href={heroPhoto.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-azure underline"
            >
              {heroPhoto.credit ?? "photographer"}
            </a>{" "}
            ·{" "}
            <a
              href="https://creativecommons.org/licenses/by-sa/2.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-azure underline"
            >
              CC BY-SA 2.0
            </a>
          </p>
        ) : (
          <p className="absolute inset-x-0 bottom-14 truncate px-5 text-[10px] text-mist-dim">
            {heroCaption}
          </p>
        )}
        {photos.length > 1 && (
          <div className="absolute bottom-9 left-5 flex gap-1.5">
            {photos.map((p, i) => (
              <button
                key={p.src}
                type="button"
                aria-label={`Photo ${i + 1}`}
                onClick={() => setFrame(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === frame ? "w-5 bg-snow" : "w-1.5 bg-snow/40",
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---- Body -------------------------------------------------------- */}
      <div className="relative -mt-7 rounded-t-[26px] border-t border-hairline-strong bg-obsidian px-5 pt-5">
        <Stagger>
          <Rise>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-hairline bg-slate">
                <RouteIcon size={17} strokeWidth={1.6} className="text-azure" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-snow">
                  <span className="text-azure">
                    {trail.network ? NETWORK_LABEL[trail.network] : "Hiking trail"}
                  </span>
                  {trail.ref ? ` · ${trail.ref}` : ""}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">
                  {trail.operator ?? "OpenStreetMap"}
                </span>
              </span>
              <MiniMap lat={trail.lat} lon={trail.lon} className="h-10 w-10 shrink-0" />
            </div>
          </Rise>

          <Rise className="pt-3.5">
            <h1 className="text-[23px] font-light leading-tight text-snow">{trail.name}</h1>
            {trail.localName && (
              <p className="mt-1 text-[13px] text-mist-dim">{trail.localName}</p>
            )}
            {rating && (
              <div className="mt-2.5 flex items-center gap-3.5 text-[12.5px]">
                <span className="flex items-center gap-1.5 text-snow">
                  <Star size={13} strokeWidth={0} fill="currentColor" className="text-azure" />
                  <span className="tnum">{rating.stars.toFixed(1)}</span>
                </span>
                <span className="flex items-center gap-1.5 text-mist">
                  <Users size={13} strokeWidth={1.7} className="text-mist-dim" />
                  <span className="tnum">{fmtPeople(rating.people)}</span>
                </span>
              </div>
            )}
          </Rise>

          {/* ---- Actions ---------------------------------------------------
              Above the figures, not below them. Save / Directions / Share are
              the things a person actually came to do; they were sitting under
              a full screen of statistics and the OSM provenance note, which
              meant scrolling past everything to reach them. */}
          <Rise className="pt-4">
            <div className="flex items-center justify-around border-y border-hairline py-3.5">
              <SaveAction saved={saved} onToggle={toggleSave} />
              <IconAction
                icon={Navigation}
                label="Directions"
                onClick={() => openMaps(mapsDirectionsUrl(spot))}
              />
              <IconAction icon={Share2} label="Share" onClick={() => sharePage(`${trail.name} · ICEFALL`)} />
            </div>
          </Rise>

          {/* ---- Tabs ----------------------------------------------------- */}
          <Rise className="pt-5">
            <div className="flex gap-5 border-b border-hairline">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "relative pb-2.5 text-[13px] transition-colors",
                    tab === t.id ? "text-snow" : "text-mist-dim hover:text-mist",
                  )}
                >
                  {t.label}
                  {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-px bg-azure" />}
                </button>
              ))}
            </div>

            <div className="pt-4">
              {tab === "trail" && (
                <div className="space-y-2.5">
                {/* The figures belong to the TRAIL tab, not to the page.
          They used to sit between the actions and the tab strip, which put
          a screen of statistics between "Save / Directions / Share" and the
          three things those actions are about — and left the numbers on
          screen while you were looking at the map or the photographs, where
          they answer nothing. */}
                <Rise className="pt-4">
                  {/* Two columns on a phone, four when there is room.
                      Four cells across 390 px leaves ~82 px each, and `Stat`
                      sets its value and unit on one baseline — so "85.8 km"
                      plus "measured" wrapped onto three ragged lines and the
                      labels stopped lining up. Pre-existing; visible now that
                      the figures sit inside the tab. */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-b border-hairline py-4 sm:grid-cols-4 sm:gap-2">
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
                      unit={trail.durationH ? "as mapped" : movingH ? "DIN 33466" : "not known"}
                    />
                    <Stat
                      label="Length"
                      value={km ? `${km.toFixed(1)} km` : facts.loading ? "…" : "—"}
                      unit={
                        trail.lengthKm ? "as mapped" : computedKm ? "measured" : km ? "measured" : undefined
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
                      label="Grade"
                      value={grade ? (SAC_LABEL[grade]?.split(" · ")[0] ?? "—") : "—"}
                      unit={
                        grade
                          ? trail.sacScale
                            ? SAC_LABEL[grade]?.split(" · ")[1]
                            : "hardest section"
                          : "not graded"
                      }
                    />
                  </div>

                  {/* ---- The vertical story ------------------------------------ */}
                  {facts.elevation && km && (
                    <div className="mt-5">
                      <div className="flex items-baseline justify-between">
                        <p className="section-label text-mist">Elevation</p>
                        <p className="tnum text-[11.5px] text-mist">
                          ↑ {facts.elevation.ascentM.toLocaleString()} m · ↓{" "}
                          {facts.elevation.descentM.toLocaleString()} m
                        </p>
                      </div>
                      <ElevationProfile
                        className="mt-2.5"
                        elevation={facts.elevation}
                        lengthKm={km}
                      />
                    </div>
                  )}

                  {/* ---- What it is made of ------------------------------------ */}
                  {facts.ways && (
                    <>
                      <BreakdownBar
                        className="mt-5"
                        title="Underfoot"
                        segments={surfaceBreakdown(facts.ways)}
                      />
                      <BreakdownBar
                        className="mt-5"
                        title="Way type"
                        segments={waytypeBreakdown(facts.ways)}
                      />
                    </>
                  )}

                  {/* Shorter than it was. The point — these are OSM's numbers, not
                      ICEFALL's — survives; the paragraph explaining it twice does not. */}
                  <p className="mt-3 text-[11px] text-mist-dim">
                    Figures as mapped in OpenStreetMap. Blank where nobody recorded it.
                  </p>
                </Rise>
                  {trail.description && (
                    <Card>
                      <p className="section-label">Description</p>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
                        {trail.description}
                      </p>
                    </Card>
                  )}
                  {(trail.from || trail.to || trail.roundtrip) && (
                    <Card>
                      <p className="section-label">The line</p>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
                        {trail.roundtrip
                          ? `A loop${trail.from ? ` from ${trail.from}` : ""}`
                          : `${trail.from ?? "?"} → ${trail.to ?? "?"}`}
                        {trail.via ? ` · via ${trail.via}` : ""}
                      </p>
                    </Card>
                  )}
                  {trail.visibility && VISIBILITY_LABEL[trail.visibility] && (
                    <Card>
                      <p className="section-label">Path on the ground</p>
                      <p className="mt-2 text-[13px] text-snow">
                        {VISIBILITY_LABEL[trail.visibility]}
                      </p>
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
                        How easy the path was to follow when it was last surveyed — not today,
                        and not under snow.
                      </p>
                    </Card>
                  )}
                  <Card>
                    <p className="section-label">Waymarking</p>
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
                  </Card>
                  {/* ---- Look it up elsewhere -------------------------------
                      ICEFALL holds OSM's line and little else — no photographs
                      for most trails, no trip reports, no conditions. Rather
                      than imply that absence is all there is, this points at
                      the places that do have it. The query carries the trail's
                      name and its country so a generic name ("Blue trail")
                      lands somewhere useful. */}
                  <Card>
                    <p className="section-label">Look it up</p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <a
                        href={googleSearchUrl(trail.name, trail.operator)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-3 py-1.5 text-[12px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
                      >
                        View on Google
                        <ExternalLink size={11} strokeWidth={1.8} />
                      </a>
                      <a
                        href={googleImagesUrl(trail.name, trail.operator)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-3 py-1.5 text-[12px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
                      >
                        Photos on Google
                        <ExternalLink size={11} strokeWidth={1.8} />
                      </a>
                      <a
                        href={osmRelationUrl(trail.osmId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-3 py-1.5 text-[12px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
                      >
                        On OpenStreetMap
                        <ExternalLink size={11} strokeWidth={1.8} />
                      </a>
                    </div>
                  </Card>
                  {trail.website && (
                    <Card>
                      <p className="section-label">Operator</p>
                      <a
                        href={trail.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-azure"
                      >
                        {trail.operator ?? trail.website.replace(/^https?:\/\//, "").split("/")[0]}
                        <ExternalLink size={12} strokeWidth={1.8} />
                      </a>
                    </Card>
                  )}
                  <Disclaimer>
                    {TRAIL_ATTRIBUTION}. ICEFALL has not walked or surveyed this trail, and
                    knows nothing about its condition today — snow, washouts and closures are
                    not in this data.
                  </Disclaimer>
                </div>
              )}

              {tab === "map" && (
                <div>
                  {/*
                    No loading gate. The map mounts on the trail's coordinates
                    straight away and the route draws itself in when Overpass
                    answers — which can be 8s for a small trail and much longer
                    for a big one. Blocking the whole tab on that was the
                    "Loading the line…" wait.
                  */}
                  {true && (
                    <>
                      {/*
                        The real, interactive planning map — every stop traced
                        to an OSM tag, never invented. Replaced the abstract
                        traced-shape icon this tab used to show: that view
                        could not place a real point of interest on the ground,
                        which is what "click on maps" actually asks for.
                      */}
                      <div className="relative h-[300px] overflow-hidden rounded-card border border-hairline bg-graphite">
                        <RouteWaypointMap
                          line={line}
                          start={line[0] ?? { lat: trail.lat, lon: trail.lon }}
                          center={{ lat: trail.lat, lon: trail.lon }}
                          waypoints={orderedStops}
                          className="absolute inset-0 h-full w-full"
                        />
                      </div>

                      {waypointsLoading && (
                        <p className="mt-3 flex items-center justify-center gap-2 text-[11.5px] text-mist-dim">
                          <Loader2 size={12} className="animate-spin" />
                          Checking OpenStreetMap for waypoints…
                        </p>
                      )}

                      {!waypointsLoading && orderedStops.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {orderedStops.map((w, i) => {
                            const Icon = KIND_ICON[w.kind];
                            return (
                              <div
                                key={`${w.lat},${w.lon}`}
                                className="flex items-center gap-3 rounded-tile border border-hairline bg-graphite px-3 py-2.5"
                              >
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-elevated text-[10.5px] font-medium tabular-nums text-snow">
                                  {i + 1}
                                </span>
                                <Icon size={14} strokeWidth={1.8} className="shrink-0 text-azure" />
                                {/* A real OSM name, or nothing — never a
                                    generic label standing in for one. */}
                                <span className="truncate text-[12.5px] text-snow">
                                  {w.label ?? `Stop ${i + 1}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {haveLine ? (
                        <div className="tnum mt-3 flex items-center justify-between text-[11.5px] text-mist">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-azure" /> Start
                          </span>
                          <span>{line.length.toLocaleString()} points</span>
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
                      <Disclaimer className="mt-3">
                        The real line as mapped in OpenStreetMap, simplified for drawing. Start
                        and end are the ends of the relation, not necessarily a trailhead.
                        {orderedStops.length > 0
                          ? " Numbered stops are real points OpenStreetMap has tagged along the way — not every trail has any, and this one may not have all of them."
                          : ""}
                      </Disclaimer>
                    </>
                  )}
                  {!haveLine && !lineLoading && !facts.loading && (lineFailed || facts.ways?.length === 0) && (
                    <p className="py-8 text-center text-[12.5px] text-mist-dim">
                      Couldn't load the line. This is a connection problem, not an empty map.
                    </p>
                  )}
                </div>
              )}

              {tab === "photos" && (
                <div className="grid grid-cols-2 gap-2.5">
                  {photos.map((p, i) => (
                    <button
                      key={p.src}
                      type="button"
                      onClick={(e) => {
                        setFrame(i);
                        setTab("trail");
                        // Back to the top: the frame just chosen becomes the
                        // hero at the very top of the page. This was
                        // `window.scrollTo`, which has never moved anything —
                        // the document does not scroll in this app, the
                        // container above does. See `scrollContentToTop`.
                        scrollContentToTop(e.currentTarget);
                      }}
                      className="overflow-hidden rounded-tile border border-hairline text-left"
                    >
                      <img src={p.src} alt="" aria-hidden loading="lazy" className="h-28 w-full object-cover" />
                      <span className="block truncate px-2 py-1.5 text-[9.5px] text-mist-dim">
                        {p.credit}
                      </span>
                    </button>
                  ))}
                  <p className="col-span-2 mt-1 text-[11px] leading-relaxed text-mist-dim">
                    {photos.length === 0
                      ? "Wikimedia Commons holds no photographs filed under this trail's name."
                      : "Photographs of this trail on Wikimedia Commons, found by its name and credited to whoever took them."}
                  </p>
                </div>
              )}
            </div>
          </Rise>

          {rating && (
            <Rise className="pt-5">
              <Disclaimer>{RATING_NOTICE}</Disclaimer>
            </Rise>
          )}

          {guided !== null && (
            <GuidedBy
              peakName={guided.peakName}
              elevationM={guided.elevationM}
              country={guided.country}
            />
          )}
        </Stagger>
      </div>

      {/* ---- Save, at the foot of the page --------------------------------
          IN FLOW, not fixed. The pinned version padded itself by the tab bar's
          height on the theory that the bar overlays the viewport — but the tab
          bar is in normal flow, so the panel covered it and left a dead black
          band below the button. In flow, the button sits at the bottom of the
          page like everything else, and the saved notice appearing BELOW it
          cannot move it. */}
      <div className="border-t border-hairline bg-obsidian/95 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <SaveButton
            className="flex-1"
            saved={saved}
            onToggle={toggleSave}
            label="Save trail"
            savedLabel="Saved"
          />
          {/* The reference pairs Save with a round navigate control. Here it
              hands the trailhead to the phone's maps app — ICEFALL does not need
              to become a navigation app to get someone to the start. */}
          <button
            type="button"
            aria-label="Directions in Google Maps"
            onClick={() => openMaps(mapsDirectionsUrl(spot))}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline-strong text-snow transition-colors hover:border-azure/50"
          >
            <Navigation size={17} strokeWidth={1.8} />
          </button>
        </div>
        {saved && (
          <p className="mt-1.5 text-center text-[10.5px] text-mist-dim">{SAVED_NOTICE}</p>
        )}
      </div>

      <SavedToast show={flash} label="Saved to your trails" detail="on this device" />

      {options && <OptionsSheet trail={trail} line={line} onClose={() => setOptions(false)} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */


function OptionsSheet({
  trail,
  line,
  onClose,
}: {
  trail: Trail;
  line: LatLon[];
  onClose: () => void;
}) {
  const osm = `https://www.openstreetmap.org/relation/${trail.osmId}`;
  return (
    <Sheet title={trail.name} onClose={onClose}>
      <SheetRow
        icon={Download}
        title="Download GPX"
        detail={
          line.length > 1
            ? `${line.length.toLocaleString()} points · for a watch or handheld`
            : "The line is still loading"
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
        detail="From where you are now"
        onClick={() => openMaps(mapsDirectionsUrl({ lat: trail.lat, lon: trail.lon }))}
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
  const blob = new Blob([toGpx(name, line)], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "trail"}.gpx`;
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
function GuidedBy({ peakName, elevationM, country }: {
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
      <div className="mt-3 space-y-2.5">
        {listings.map((o) => (
          <Link
            key={o.id}
            to={`/operator/${o.id}?${new URLSearchParams({
              peak: peakName,
              elevation: String(elevationM),
              ...(country !== undefined ? { country } : {}),
            }).toString()}`}
            className="flex items-center gap-3.5 rounded-card border border-hairline bg-graphite p-3.5 transition-colors hover:border-hairline-strong"
          >
            {/* Was a fourth monogram algorithm, written inline in the JSX — so
                a company reached from a trail showed different initials than
                the same company reached from the directory. */}
            <CompanyMark name={o.name} logoPath={o.logo} size={44} />
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
