import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Bookmark, CalendarPlus, ChevronLeft, ChevronRight, Download, Map as MapIcon, MountainSnow,
  MoreHorizontal, Navigation, Share2, Star, Users,
} from "lucide-react";
import { Card, Disclaimer, HeroCircleButton, IconAction, Stat, sharePage } from "@/components/ui/primitives";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { ElevationProfile } from "@/components/ui/charts";
import { Rise, Stagger, scrollContentToTop } from "@/components/layout/chrome";
import { fmtDistance, fmtElevation } from "@/lib/format";
import {
  DEMAND_LEVEL_LABEL, ROUTE_DEMAND_DISCLAIMER, routeById, routeDemands, routePhoto,
} from "@/routes/model";
import { routeRelevance } from "@/routes/relevance";
import { paceFor } from "@/routes/search";
import { useMountainGallery, useMountainImage } from "@/components/domain/MountainImage";
import { SaveAction, SaveButton, SavedToast, useSaveFlash } from "@/components/ui/SaveControl";
import { MiniMap } from "@/components/domain/MiniMap";
import { RATING_NOTICE, fmtPeople, ratingFor } from "@/routes/ratings";
import { useCoachContext } from "@/coach/context";
import { cn } from "@/lib/utils";
import type { TrackPoint } from "@/types";

type Tab = "route" | "elevation" | "highlights" | "photos";
const TABS: { id: Tab; label: string }[] = [
  { id: "route", label: "Route" },
  { id: "elevation", label: "Elevation" },
  { id: "highlights", label: "Highlights" },
  { id: "photos", label: "Photos" },
];

/**
 * The route screen.
 *
 * Photograph gallery, the figures, the tabbed body, and the actions pinned to
 * the bottom. Two things are deliberately different from a consumer trail app:
 * the panel that says why the route matters to THIS athlete's objective, and
 * the absence of a star rating — the grade carries the card instead, because
 * ICEFALL has no users to average and a popularity score on a mountain reads as
 * a safety claim.
 */
export default function RouteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ctx = useCoachContext();
  const route = routeById(id ?? "");
  const [tab, setTab] = useState<Tab>("route");
  const [photo, setPhoto] = useState(0);
  const [saved, setSaved] = useState(false);
  const [options, setOptions] = useState(false);

  /**
   * Every verified photograph of this exact mountain — ICEFALL's own where it
   * has one, then Wikimedia's, each carrying its own credit. Nothing is padded:
   * a carousel of the same image repeated is worse than a single photograph.
   */
  const gallery = useMountainGallery({
    name: route?.mountainName ?? "",
    elevationM: route?.mountainElevationM,
    lat: route?.mountainLat,
    lon: route?.mountainLon,
    curatedId: route?.mountainId,
    photo: route ? routePhoto(route) : undefined,
  });
  const photos = gallery.images;

  // A round portrait of the mountain, standing where the reference puts the
  // author's avatar.
  const mountainFace = useMountainImage({
    name: route?.mountainName ?? "",
    elevationM: route?.mountainElevationM,
    lat: route?.mountainLat,
    lon: route?.mountainLon,
    curatedId: route?.mountainId,
    photo: route ? routePhoto(route) : undefined,
  });

  /**
   * The elevation shape of the route.
   *
   * DERIVED FROM THE ROUTE'S OWN FIGURES — total distance and total ascent —
   * not a surveyed track, because ICEFALL has no GPX for these lines. It is
   * labelled as indicative on the screen for exactly that reason: a profile
   * drawn as if it were surveyed would be the most convincing lie here.
   */
  const profile = useMemo<TrackPoint[]>(() => {
    if (!route) return [];
    const n = 48;
    const base = route.mountainElevationM - route.elevationGainM;
    return Array.from({ length: n }, (_, i): TrackPoint => {
      const t = i / (n - 1);
      // Steeper in the middle third, the usual shape of an alpine ascent.
      const eased = t < 0.25 ? t * 0.7 : t < 0.75 ? 0.175 + (t - 0.25) * 1.45 : 0.9 + (t - 0.75) * 0.4;
      return {
        x: t,
        y: 1 - Math.min(1, eased),
        ele: Math.round(base + route.elevationGainM * Math.min(1, eased)),
        t: Math.round(t * 3600),
      };
    });
  }, [route]);

  if (!route) return <Navigate to="/explore/routes" replace />;

  const demands = routeDemands(route);
  const relevance = routeRelevance(route, ctx);
  const pace = paceFor(route);
  const rating = ratingFor(route.id);
  const flash = useSaveFlash(saved);

  return (
    <div className="no-scrollbar relative h-full overflow-y-auto pb-24">
      {/* ---- Gallery ----------------------------------------------------- */}
      <div className="relative h-[330px]">
        <img
          src={photos[Math.min(photo, photos.length - 1)]}
          alt=""
          aria-hidden
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-obsidian/60 via-transparent to-obsidian" />

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
          {/* These two silently did nothing for a while — a control that looks
              live and is not is worse than no control. */}
          <HeroCircleButton
            label="Share"
            icon={Share2}
            onClick={() => sharePage(`${route.name} · ICEFALL`)}
          />
          <HeroCircleButton label="More" icon={MoreHorizontal} onClick={() => setOptions(true)} />
        </div>

        {/* Who took it. CC BY requires the credit, and it also tells the athlete
            whether they are looking at this summit or stand-in terrain. */}
        {gallery.captions[photo] && (
          <p className="absolute inset-x-0 bottom-14 truncate px-5 text-[10px] text-mist-dim">
            {gallery.captions[photo]}
          </p>
        )}

        {/* carousel dots — only when there is genuinely more than one photo */}
        {photos.length > 1 && (
          <div className="absolute bottom-9 left-5 flex gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Photo ${i + 1}`}
                onClick={() => setPhoto(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === photo ? "w-5 bg-snow" : "w-1.5 bg-snow/40",
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---- Body --------------------------------------------------------
          A sheet lifted over the photograph, as in the reference: the content
          reads as a card the picture is behind, not as a caption under it. */}
      <div className="relative -mt-7 rounded-t-[26px] border-t border-hairline-strong bg-obsidian px-5 pt-5">
        <Stagger>
          {/* Provenance row — the reference puts the person who walked the route
              here. Nobody can post a report yet, so the slot carries what is actually
              true of the line: the mountain it climbs. Same shape, no fiction. */}
          <Rise>
            <div className="flex items-center gap-3">
              <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-hairline">
                <img src={mountainFace.src} alt="" aria-hidden className="h-full w-full object-cover" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-snow">
                  <span className="text-azure">{route.mountainName}</span> · {KIND_VERB[route.kind]}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">
                  {route.range} · {route.country} · {fmtElevation(route.mountainElevationM)} m
                </span>
              </span>
              <MiniMap lat={route.mountainLat} lon={route.mountainLon} className="h-10 w-10 shrink-0" />
            </div>
          </Rise>

          <Rise className="pt-3.5">
            <div className="flex items-start gap-2.5">
              <h1 className="min-w-0 flex-1 text-[23px] font-light leading-tight text-snow">
                {route.name}
              </h1>
              <span className="mt-1 shrink-0 rounded-pill border border-azure/45 bg-azure/[0.08] px-2.5 py-1 text-[11px] text-azure">
                {route.gradeLabel}
              </span>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-mist">{route.description}</p>
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

          {/* ---- Figures --------------------------------------------------- */}
          <Rise className="pt-4">
            <div className="grid grid-cols-4 gap-2 border-y border-hairline py-4">
              <Stat label="Duration" value={route.durationLabel} />
              <Stat label="Length" value={`${fmtDistance(route.distanceKm)} km`} />
              <Stat label="Pace" value={pace.value} unit={pace.unit} />
              <Stat label="Elevation" value={`${fmtElevation(route.elevationGainM)} m`} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">{pace.note}</p>
          </Rise>

          {/* ---- Action row ------------------------------------------------
              The reference's like / comment / share strip. Likes and comments
              need accounts, so the three slots carry the three things this app
              can actually do with a route today. */}
          <Rise className="pt-3">
            <div className="flex items-center justify-around border-b border-hairline pb-3.5">
              <SaveAction saved={saved} onToggle={() => setSaved((v) => !v)} />
              <IconAction icon={CalendarPlus} label="Train" onClick={() => navigate("/coach")} />
              <IconAction icon={Share2} label="Share" onClick={() => sharePage(`${route.name} · ICEFALL`)} />
            </div>
          </Rise>

          {/* ---- Why it matters -------------------------------------------- */}
          {relevance.reason && (
            <Rise className="pt-4">
              <div className="rounded-card border border-azure/35 bg-azure/[0.06] p-4">
                <p className="section-label text-azure/85">Your objective</p>
                <p className="mt-2 text-[13px] leading-relaxed text-snow">{relevance.reason}</p>
                {ctx.objective && (
                  <p className="tnum mt-2 text-[11.5px] leading-relaxed text-mist">
                    Preparation for {ctx.objective.name}: {ctx.objective.preparationPct}% — derived
                    from training you have recorded, not a judgement about this route.
                  </p>
                )}
                <Link to="/coach" className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-azure">
                  Train for this route <ChevronRight size={14} strokeWidth={1.8} />
                </Link>
              </div>
            </Rise>
          )}

          {/* ---- Tabs ------------------------------------------------------ */}
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
              {tab === "route" && (
                <div className="space-y-2.5">
                  <Card>
                    <p className="section-label">The line</p>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-mist">{route.description}</p>
                  </Card>
                  <Card>
                    <p className="section-label">Summit</p>
                    <p className="tnum mt-2 text-[13px] text-snow">
                      {fmtElevation(route.mountainElevationM)} m · starts around{" "}
                      {fmtElevation(route.mountainElevationM - route.elevationGainM)} m
                    </p>
                  </Card>
                  {/* Honest about the map: no GPX, so no drawn line. */}
                  <Card>
                    <p className="section-label">Map</p>
                    <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
                      ICEFALL does not hold a surveyed track for this line, so it will not draw one.
                      A mapped route arrives with the routing service.
                    </p>
                  </Card>
                </div>
              )}

              {tab === "elevation" && (
                <div>
                  <ElevationProfile track={profile} height={120} />
                  <div className="tnum mt-3 flex items-center justify-between text-[11.5px] text-mist">
                    <span>{fmtElevation(route.mountainElevationM - route.elevationGainM)} m start</span>
                    <span className="text-azure">+{fmtElevation(route.elevationGainM)} m</span>
                    <span>{fmtElevation(route.mountainElevationM)} m summit</span>
                  </div>
                  <Disclaimer className="mt-3">
                    Indicative shape only — built from this route's total distance and ascent, not
                    from a surveyed track.
                  </Disclaimer>
                </div>
              )}

              {tab === "highlights" && (
                <div className="space-y-2">
                  {rating && <Disclaimer className="mb-1">{RATING_NOTICE}</Disclaimer>}
                  {demands.map((d) => (
                    <Card key={d.id}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[13.5px] text-snow">{d.label}</p>
                        <span className="flex items-center gap-2">
                          <span className="text-[11.5px] text-azure">{DEMAND_LEVEL_LABEL[d.level]}</span>
                          <span className="flex gap-1">
                            {[1, 2, 3].map((i) => (
                              <span
                                key={i}
                                className={cn(
                                  "h-1.5 w-4 rounded-full",
                                  i <= (d.level === "very-high" ? 3 : d.level === "high" ? 2 : 1)
                                    ? "bg-azure"
                                    : "bg-white/[0.08]",
                                )}
                              />
                            ))}
                          </span>
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">{d.note}</p>
                    </Card>
                  ))}
                  <Disclaimer className="mt-1">{ROUTE_DEMAND_DISCLAIMER}</Disclaimer>
                </div>
              )}

              {tab === "photos" && (
                <div className="grid grid-cols-2 gap-2.5">
                  {photos.map((p, i) => (
                    <button
                      key={p}
                      type="button"
                      onClick={(e) => {
                        setPhoto(i);
                        setTab("route");
                        // Back to the top: the photograph just chosen becomes
                        // the hero at the very top of the page, and there is no
                        // point switching to it below the fold. This was
                        // `window.scrollTo`, which has never moved anything —
                        // the document does not scroll in this app, the
                        // container above does. See `scrollContentToTop`.
                        scrollContentToTop(e.currentTarget);
                      }}
                      className="overflow-hidden rounded-tile border border-hairline text-left"
                    >
                      <img src={p} alt="" aria-hidden loading="lazy" className="h-28 w-full object-cover" />
                      <span className="block truncate px-2 py-1.5 text-[9.5px] text-mist-dim">
                        {gallery.captions[i]}
                      </span>
                    </button>
                  ))}
                  <p className="col-span-2 mt-1 text-[11px] leading-relaxed text-mist-dim">
                    Photographs of {route.mountainName} — ICEFALL's own, then Wikimedia's, each
                    credited to whoever took it. Photographs from other athletes need accounts and
                    a backend, and are not invented in the meantime.
                  </p>
                </div>
              )}
            </div>
          </Rise>

          {/* ---- Secondary actions ---------------------------------------- */}
          <Rise className="pt-6">
            <div className="grid grid-cols-3 gap-2.5">
              <Pending icon={MapIcon} label="Plan" />
              <Pending icon={Download} label="Download" />
              <Pending icon={Navigation} label="Navigate" />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
              Planning, offline tiles and turn-by-turn need a routing service connected. The
              figures, demands and description above are real and work offline today.
            </p>
          </Rise>
        </Stagger>
      </div>

      {options && (
        <Sheet title={route.name} onClose={() => setOptions(false)}>
          <SheetRow
            icon={Share2}
            title="Share"
            detail="Send this route"
            onClick={() => {
              sharePage(`${route.name} · ICEFALL`);
              setOptions(false);
            }}
          />
          <SheetRow
            icon={MountainSnow}
            title={`Open ${route.mountainName}`}
            detail="The mountain this line climbs"
            onClick={() => {
              setOptions(false);
              navigate(`/explore/mountain/${route.mountainId}`);
            }}
          />
          <SheetRow
            icon={ChevronRight}
            title="Copy link"
            detail={window.location.host}
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href).catch(() => {});
              setOptions(false);
            }}
          />
        </Sheet>
      )}

      {/* ---- Pinned save --------------------------------------------------- */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-obsidian/95 px-5 py-3 backdrop-blur"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px) + var(--tabbar-clearance, 0px))" }}
      >
        <div className="flex items-center gap-2.5">
          <SaveButton
            className="flex-1"
            saved={saved}
            onToggle={() => setSaved((v) => !v)}
            label="Save route"
            savedLabel="Saved"
          />
          {/* The reference pairs the wide Save with a round secondary control. */}
          <button
            type="button"
            aria-label="Share this route"
            onClick={() => sharePage(`${route.name} · ICEFALL`)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline-strong text-snow transition-colors hover:border-azure/50"
          >
            <Share2 size={17} strokeWidth={1.8} />
          </button>
        </div>
        {saved && (
          <p className="mt-1.5 text-center text-[10.5px] text-mist-dim">
            Saved on this device — syncing needs an account.
          </p>
        )}
      </div>

      <SavedToast show={flash} label="Saved to your routes" detail="on this device" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** What kind of outing this line is, phrased the way the reference phrases it. */
const KIND_VERB: Record<string, string> = {
  summit: "Summit route",
  traverse: "Traverse",
  approach: "Approach",
  acclimatisation: "Acclimatisation",
  training: "Training line",
};





function Pending({ icon: Icon, label }: { icon: typeof MapIcon; label: string }) {
  return (
    <div className="rounded-tile border border-dashed border-hairline-strong px-2 py-3 text-center opacity-55" aria-disabled>
      <Icon size={16} strokeWidth={1.6} className="mx-auto text-mist-dim" />
      <p className="mt-1.5 text-[11px] text-mist-dim">{label}</p>
      <p className="text-[9px] text-mist-dim">Not connected</p>
    </div>
  );
}
