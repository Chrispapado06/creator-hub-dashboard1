import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  Compass,
  Download,
  ExternalLink,
  Maximize2,
  MessageSquare,
  Share2,
  X,
} from "lucide-react";
import { Card, Disclaimer, SectionLabel, Stat, sharePage } from "@/components/ui/primitives";
import { Rise, SegmentedTabs, Stagger, useDetailBack } from "@/components/layout/chrome";
import { LiquidGlassButton, LiquidGlassCircle } from "@/components/ui/LiquidGlassButton";
import { cn } from "@/lib/utils";
import { MOUNTAINS } from "@/data/mock/mountains";
import { useTrailLine } from "@/components/domain/TrailShape";
import { RouteWaypointMap } from "@/components/domain/RouteWaypointMap";
import { ElevationProfile } from "@/components/domain/TrailProfile";
import { useRouteFacts } from "@/services/routeFacts";
import { TRAIL_ATTRIBUTION } from "@/services/trails";
import { savedMapStyle } from "@/components/map/icefallStyle";
import { downloadGpx, gpxBlocked } from "@/lib/gpx";
import { FOLLOW_ONE_LINE, followBlocked, followHref } from "@/tracking/follow";
import { OFFLINE } from "@/offline/offline";
import { trekRoute, type TrekRoute } from "@/treks/route";
import {
  TREKS,
  peaksForTrek,
  trekAltitude,
  trekById,
  trekDuration,
  trekRegion,
  treksInRegion,
  type Trek,
} from "@/treks";
import { trekImage, trekImageCaption, trekImageSubject, trekPhotoCredit } from "@/treks/images";
import { TrekCard } from "@/screens/treks/Treks";
import {
  DEMO_NOTICE,
  OPERATOR_DISCLAIMER,
  operatorsFor,
  type Operator,
} from "@/services/operators";
import { OperatorCard } from "@/components/domain/OperatorCard";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "route", label: "The route" },
  { value: "prepare", label: "Preparation" },
  { value: "companies", label: "Companies" },
  { value: "nearby", label: "Nearby" },
] as const;

type Tab = (typeof TABS)[number]["value"];

/**
 * One trek.
 *
 * WHAT THIS PAGE DOES NOT HAVE, and why each absence is deliberate:
 *
 *   no price          nobody has quoted one — see the note in `model.ts`
 *   no star rating    nobody has rated this route through ICEFALL
 *   no success rate   a walk does not have a summit success rate, and the
 *                     figure would be invented even if it did
 *   no operator LINK  no operator has listed a trek with us — `operatorIds` is
 *                     empty on all 252 routes. The Companies tab therefore
 *                     shows a MATCH on country and high point, and says so in
 *                     as many words; it never claims a company runs this walk
 *   no day-by-day     itineraries vary by operator and we hold none of them.
 *                     A plausible invented one is the worst thing this page
 *                     could carry, because it is the part a walker plans from.
 *
 * Every fact shown is published and sourced. Anything unknown prints an em dash
 * in the figures row — with a line under it saying that is what a dash means —
 * and "Not specified" in prose, rather than a guess.
 *
 * WHAT IT DOES HAVE, SINCE 2026-09-09: a map, a GPX file and an elevation
 * profile — on the treks that were matched to an OpenStreetMap route relation,
 * and only on those. The mapping lives in `treks/osmRoutes.ts`, the reason for
 * every match and every refusal in `scripts/trek-osm-audit.json`, and the whole
 * of it is behind `trekRoute(id)` returning nothing. When it returns nothing,
 * this page is exactly what it was: no map, no file, no profile, and nothing
 * empty drawn where they would be.
 *
 * REBUILT 2026-09-08 to Charlie's reference, the same one the trail page
 * follows: "this is how i want it to look like when you click on a trek". The
 * bordered cards at the top are gone with the boxes; what replaced them is a
 * full-bleed photograph, glass controls floating on it, and a content sheet.
 * The tabbed body below is unchanged and still carries `Card`s — that is the
 * next pass, not this one.
 */
export default function TrekDetail() {
  const { id = "" } = useParams();
  const trek = trekById(id);
  /**
   * The OSM route relation this trek was matched to, or nothing.
   *
   * Nothing is a normal answer and roughly two routes in three get it — see
   * `treks/route.ts` and the audit beside the script that built the mapping.
   */
  const route = trek ? trekRoute(trek.id) : undefined;
  /* A trek with a mapped line opens on it. The summary above the tabs is the
     whole of what the overview tab adds, so opening there would have hidden
     the one thing this page now has that it did not have before. */
  const [tab, setTab] = useState<Tab>(route ? "route" : "overview");

  /**
   * THE WAY OUT, AND UNTIL THIS EXISTED THERE WAS NONE.
   *
   * This route is in `FULL_SCREEN_ROUTES`, so it carries no bottom navigation,
   * no app top bar and — since Charlie's reference — no Explore header either.
   * The header's chevron was the only exit this screen had ever had; it drew
   * none of its own, and a check on 8 Sep 2026 found the page with zero back
   * controls and zero navigation on it. A reader who opened a trek could not
   * leave without the browser's own back gesture, which a phone build does not
   * give them.
   *
   * The treks list, not the Explore hub, is the fallback: it is where treks are
   * opened from.
   */
  const goBack = useDetailBack("/explore/treks");

  /** Where the bar's Companies pill sends you: the tab strip it switches. */
  const companiesAnchor = useRef<HTMLDivElement | null>(null);

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
    () =>
      trek
        ? treksInRegion(trek.regionId)
            .filter((t) => t.id !== trek.id)
            .slice(0, 4)
        : [],
    [trek],
  );

  /**
   * Companies, matched the same way the mountain page matches them.
   *
   * `operatorsFor` filters the directory on the country (it splits compound
   * strings like "France / Italy / Switzerland" itself) and on the working
   * altitude, so a Karakoram outfit whose floor is 5,000 m does not surface
   * under the West Highland Way.
   *
   * THE HIGH POINT IS THE ALTITUDE, and where it is unpublished this returns
   * nothing rather than defaulting to zero. A zero would pass the
   * `>= minElevationM` test for every operator in the directory and hand the
   * reader a full list of companies selected by nothing at all — the failure
   * mode is a confident wrong answer, not an empty one, so the guard is on
   * the null and the tab explains itself instead.
   */
  const operators = useMemo(() => {
    if (!trek || trek.maxAltitudeM === null) return [];
    return operatorsFor({ country: trek.country, elevationM: trek.maxAltitudeM });
  }, [trek]);

  // Every hook is above this line: an early return before them would skip the
  // ones below it and React would render fewer hooks than it expected.
  if (!trek) return <Navigate to="/explore/treks" replace />;

  // The shared accessor, not the generated map — a hand-picked photograph is
  // still CC BY-SA and must name its photographer on this page too.
  const credit = trekPhotoCredit(trek.id);
  const subject = trekImageSubject(trek);

  return (
    /*
     * THE SAME SHAPE AS THE TRAIL PAGE, BECAUSE CHARLIE ASKED ABOUT THIS ONE.
     * "this is how i want it to look like when you click on a trek" — the
     * reference is an AllTrails trail page, and both routes are in
     * `FULL_SCREEN_ROUTES`, so the two had to end up speaking the same
     * language: photograph first and full-bleed, glass controls floating on it,
     * the content on a sheet lifted over its lower edge, and the actions on the
     * bottom edge where the navigation used to be.
     *
     * The scroller is this component's own rather than `Screen`'s: `Screen`
     * pads for the notch and for the tab bar, and this page wants neither — the
     * photograph is supposed to run under the status bar and there is no tab
     * bar to clear. The bar at the foot reserves its own room by being in flow;
     * see the same note on `TrailDetail`, which is where the arithmetic that
     * used to be wrong is written down.
     */
    <div className="no-scrollbar relative flex h-full flex-col overflow-y-auto">
      {/* ---- Hero ---------------------------------------------------------
          `on-dark` because the ground is a photograph in both themes, and the
          hero is taller than it looks by exactly the lap the sheet takes back
          off it below — one number, so the overlap costs no picture. */}
      <div
        className="on-dark relative shrink-0 bg-slate"
        style={{
          height: `calc(46vh + ${SHEET_LAP_PX}px)`,
          maxHeight: `${440 + SHEET_LAP_PX}px`,
          minHeight: `${310 + SHEET_LAP_PX}px`,
        }}
      >
        <img
          src={trekImage(trek)}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 h-2/3" />

        {/* TWO DISCS, NOT FOUR, AND THAT IS THE POINT. The reference has back,
            share, save and an overflow. Back and share are real here, and there
            is no options sheet for a trek to put behind a "…".

            SAVE STAYS OFF EVEN NOW THAT SOME TREKS HAVE A RELATION ID. It used
            to be off because `savedTrails` is keyed on an OSM relation id and
            no trek had one; that is no longer the reason. The reason now is
            that only some treks have one, so the heart would appear on a third
            of these pages and be missing from the rest with no visible logic —
            and what it saved would surface in Saved trails under the OSM
            relation's name, which is frequently not the trek's ("Tour du
            Cervin" for the Tour du Matterhorn). A save that files a walk under
            a name the athlete did not use is worse than no save.

            They pay the notch themselves: nothing above this page clears it. */}
        <div
          className="pointer-events-none absolute inset-x-4 flex items-start justify-between"
          style={{ top: "calc(0.875rem + env(safe-area-inset-top, 0px))" }}
        >
          <LiquidGlassCircle
            icon={ChevronLeft}
            label="Back"
            onClick={goBack}
            className="pointer-events-auto"
          />
          <LiquidGlassCircle
            icon={Share2}
            label="Share"
            onClick={() => sharePage(`${trek.name} · ICEFALL`)}
            className="pointer-events-auto"
          />
        </div>

        {/* NO CAROUSEL DOTS. ICEFALL holds exactly one photograph per trek —
            `trekImage` resolves a single file — so dots would be one dot, and a
            carousel of one is a control that cannot do anything. The trail page
            draws them only when `photos.length` genuinely exceeds one, for the
            same reason.

            THE CREDIT IS A LICENCE OBLIGATION, and the sentence under it is a
            different obligation again: where the picture is of a mountain the
            route visits rather than of the route, it has to say so. That line
            was already here and is the one thing on this page that must not be
            lost to a redesign. */}
        <div
          className="absolute inset-x-0 px-5 text-[10px] leading-relaxed text-mist-dim"
          style={{ bottom: `${SHEET_LAP_PX + 8}px` }}
        >
          <p className="truncate">
            {credit ? (
              <>
                {credit.credit ? `Photograph: ${credit.credit}` : "Photograph"} ·{" "}
                <a
                  href={credit.pageUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-azure underline underline-offset-2"
                >
                  {credit.license}
                </a>{" "}
                · Wikimedia Commons
              </>
            ) : (
              trekImageCaption(trek)
            )}
          </p>
          {subject && (
            <p className="mt-0.5 truncate text-[10.5px] text-mist">
              This is {subject}, a mountain the route visits — not a photograph of the route.
            </p>
          )}
        </div>
      </div>

      {/* ---- The content sheet -------------------------------------------- */}
      <div
        className="relative z-[1] rounded-t-[26px] bg-obsidian px-5"
        style={{ marginTop: `-${SHEET_LAP_PX}px`, paddingTop: `${SHEET_LAP_PX - 4}px` }}
      >
        <Rise>
          <h1 className="text-[27px] font-light leading-[1.15] text-snow">{trek.name}</h1>
          {/* THE PLACE, WHICH THIS PAGE ACTUALLY HAS. The reference's meta row
              is a rating, a difficulty and a place; the rating does not exist
              here and never will be drawn — nobody has rated a trek through
              ICEFALL and there is nothing to average. The difficulty moved into
              the figures below, where it is one of the four a walker compares
              routes on, so this line is the place: country, then the region,
              then what kind of walk it is. All three are published fields on
              the route. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-mist">
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
        </Rise>

        {/* ---- The figures ------------------------------------------------
            THREE COLUMNS, NOT THE REFERENCE'S FOUR, AND THAT IS A MEASUREMENT
            RATHER THAN A PREFERENCE. A trek RECORD publishes no length and no
            elevation gain, so two of the reference's four columns have no
            source in this catalogue. What is left that is genuinely
            FIGURE-SHAPED is the duration, the grade and the high point.

            Where a trek has been matched to an OpenStreetMap relation there IS
            now a measured length and a measured climb, but they are the
            relation's rather than the route record's — so they are printed in
            the route tab beside the line they were measured off, and not in
            this row, where they would silently become four columns on some
            treks and three on the rest.

            THE SEASON IS THE FOURTH FACT AND IT IS NOT A FIGURE. "Mid-June –
            mid-September" is twenty-four characters; in a quarter of a 375px
            phone it breaks into four ragged lines and drags the other three
            columns' labels out of alignment with it. It gets its own line under
            the row, which is where a sentence belongs. Padding the row to four
            by shortening the window would have meant inventing a date.

            AN EM DASH IS A FIGURE NOBODY PUBLISHED, and the line beneath says
            so in as many words. Read from the FIELDS, not from
            `trekDuration`'s "Not specified" string — matching on a helper's
            prose is a test that passes until somebody rewords it. */}
        <Rise className="pt-5">
          <div className="grid grid-cols-3 gap-x-3 border-y border-hairline py-4">
            <Stat
              stacked
              size="sm"
              label="Duration"
              value={trek.durationDays ? trekDuration(trek) : "—"}
            />
            <Stat stacked size="sm" label="Difficulty" value={trek.difficulty ?? "—"} />
            <Stat
              stacked
              size="sm"
              label="High point"
              value={trek.maxAltitudeM !== null ? trekAltitude(trek) : "—"}
            />
          </div>
          <div className="mt-3 flex items-baseline gap-2 text-[12.5px]">
            <span className="text-[10px] uppercase tracking-[0.08em] text-mist-dim">Season</span>
            <span className="text-snow">{trek.season ?? "—"}</span>
          </div>
          {(trek.durationDays === null ||
            trek.difficulty === null ||
            trek.maxAltitudeM === null ||
            trek.season === null) && (
            <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
              An em dash is a figure nobody has published for this route — not a zero, and not
              something ICEFALL could work out.
            </p>
          )}
        </Rise>

        <Rise className="pt-6">
          <TrekSummary text={trek.summary} />
        </Rise>

        <div ref={companiesAnchor} className="mt-4 scroll-mt-3">
          <SegmentedTabs tabs={[...TABS]} value={tab} onChange={setTab} variant="section" />
        </div>

        {tab === "overview" && (
          <Stagger className="mt-4 space-y-3">
            <Card className="p-4">
              <p className="text-sm leading-relaxed text-mist/80">{trek.summary}</p>
            </Card>

            <Card className="p-4">
              <SectionLabel>At a glance</SectionLabel>
              <dl className="mt-2 space-y-2 text-sm">
                <Row k="Style" v={trek.style} />
                <Row k="Country" v={trek.country} />
                <Row k="Region" v={region?.name ?? "Not specified"} />
                <Row k="Highest point on the route" v={trekAltitude(trek)} />
              </dl>
            </Card>

            {peaks.length > 0 && (
              <Card className="p-4">
                <SectionLabel>Mountains on this route</SectionLabel>
                <div className="mt-2 space-y-2">
                  {peaks.map((m) => (
                    <Link
                      key={m.id}
                      to={`/explore/mountain/${m.id}`}
                      className="flex items-center gap-3 rounded-xl bg-obsidian/40 p-2"
                    >
                      <img src={m.photo} alt="" className="h-10 w-14 rounded-lg object-cover" />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-mist">{m.name}</p>
                        <p className="text-xs tabular-nums text-mist/50">
                          {m.elevationM.toLocaleString("en-GB")} m
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-mist/45">
                  The route goes to or around these. It does not climb them.
                </p>
              </Card>
            )}
          </Stagger>
        )}

        {tab === "route" && (
          <>
            <Stagger className="mt-4 space-y-3">
              <Card className="p-4">
                <SectionLabel>What the route is</SectionLabel>
                <p className="mt-2 text-sm leading-relaxed text-mist/80">{trek.summary}</p>
              </Card>
            </Stagger>

            {/* THE MAPPED LINE, WHERE THERE IS ONE, AND OUTSIDE `Stagger`.
                Mounted only on this tab, so the Overpass queries behind it are
                asked of the reader who opened the route rather than of
                everybody who opened the page. Where there is no line, nothing
                is drawn — not an empty map, not a disabled Download, not a
                placeholder — and the tab is exactly what it always was.

                OUTSIDE `Stagger` for the reason `TrailDetail` records at its
                own map: `Stagger` is a framer-motion div and carries a
                transform, and a transformed ancestor makes the full-screen
                map's `position: fixed` resolve against that div instead of
                the viewport. */}
            {route && (
              <div className="mt-5">
                <TrekRouteMap trek={trek} route={route} />
              </div>
            )}

            {/*
             * NO DAY-BY-DAY ITINERARY.
             *
             * Every operator sells its own, they differ by days and by village,
             * and ICEFALL holds none of them. An invented schedule is the single
             * most damaging thing this page could print, because it is the part a
             * walker plans flights and leave around.
             */}
            <Stagger className="mt-3 space-y-3">
              <Disclaimer>
                ICEFALL does not publish a day-by-day itinerary for this route. Stages differ
                between operators and we hold none of theirs — what is above is the route, not a
                schedule.
              </Disclaimer>
            </Stagger>
          </>
        )}

        {tab === "prepare" && (
          <Stagger className="mt-4 space-y-3">
            <Card className="p-4">
              <SectionLabel>What it asks of you</SectionLabel>
              <ul className="mt-2 space-y-2 text-sm text-mist/80">
                {prepFor(trek.difficulty, trek.maxAltitudeM).map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-azure" />
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
            <Disclaimer>
              These follow from the route's grade and its highest point, not from a particular
              operator's requirements. Anyone selling this walk will have their own.
            </Disclaimer>
          </Stagger>
        )}

        {/*
         * COMPANIES — the same directory the mountain page shows, on the same
         * terms. A walker choosing an operator for the Annapurna Circuit is
         * making the decision a climber makes on a peak page, so it would be
         * strange to answer it in one place and not the other.
         *
         * WHAT THE HEADING MAY AND MAY NOT CLAIM. No trek in the catalogue
         * carries an operator link — `operatorIds` is empty on all 252 — so this
         * app CANNOT say "these companies run this trek". What it can say is
         * what it actually did: matched the directory on the route's country and
         * its high point. The sub-line states that, and the wording is the load-
         * bearing part of this section, not decoration. A future dataset with
         * real operator links should replace the match, and then the heading can
         * make the stronger claim honestly.
         */}
        {tab === "companies" && <TrekCompanies trek={trek} operators={operators} />}

        {tab === "nearby" && (
          <div className="mt-4">
            {alsoHere.length === 0 ? (
              <Card className="p-6 text-center text-sm text-mist/60">
                No other route in {region?.name ?? "this region"} yet.
              </Card>
            ) : (
              <>
                <p className="mb-3 flex items-center gap-1.5 text-xs text-mist/50">
                  <Compass className="h-3.5 w-3.5" />
                  Also in {region?.name}
                </p>
                <Stagger className="space-y-3">
                  {alsoHere.map((t) => (
                    <TrekCard key={t.id} trek={t} />
                  ))}
                </Stagger>
              </>
            )}
          </div>
        )}
      </div>

      {/* One line of leading before the bar's hairline; `mt-auto` holds the bar
          at the foot of a tab whose content is too short to scroll. */}
      <div className="mt-auto h-4 shrink-0" />

      {/* ---- The action bar -----------------------------------------------
          IN THE ROOM THE NAVIGATION USED TO HAVE, sticky and in flow, exactly
          as on the trail page — the note there explains why both halves are
          needed and what the two earlier versions cost.

          TWO CONTROLS, AND BOTH DO SOMETHING. Enquire opens the compose screen
          this app already has and is the one committing action on the page, so
          it is the solid one — Charlie, 2026-09-08: "glass the button except
          save". The reference's other two are Download and Map. Both of those
          now exist for a trek that has been matched to an OSM relation — but
          only for those, and this bar is on every trek page, so a pill that
          worked on a third of them would be a dead control on the rest. The map
          and the file live in the route tab instead, which is where the line
          is and which a matched trek opens on. The second pill stays the
          companies list, which is real on every page and is the question most
          people open a trek with.

          NO PRICE ON IT. `priceFromEur` is null on all 252 routes — no operator
          has quoted one — so "Price on enquiry" is what the enquiry is for and
          not a figure to put on a button. */}
      <div
        className="sticky bottom-0 z-20 shrink-0 border-t border-hairline bg-obsidian/70 px-5 pt-3 backdrop-blur-xl"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-stretch gap-2.5">
          <Link
            to="/messages/new"
            className="flex h-11 grow basis-0 items-center justify-center gap-2 rounded-pill bg-azure text-[13.5px] text-obsidian transition-colors hover:bg-azure-bright"
          >
            <MessageSquare size={16} strokeWidth={1.8} />
            Enquire
          </Link>
          {/* THE TAB SWITCH IS THE EFFECT; THE SCROLL IS THE COURTESY, and they
              are written in that order deliberately. The switch is a state
              change and happens whatever the renderer is doing — verified on
              screen. `scrollIntoView` with `behavior: "smooth"` is animated by
              the compositor, so it is a no-op in a pane that is not painting
              frames (the same fact that leaves this app's reveals at opacity 0
              there); the instant form of the identical call was measured moving
              the scroller 702px to exactly this anchor, so the target and the
              ancestor chain are right. Nothing about the control being useful
              rests on the glide. */}
          <LiquidGlassButton
            onClick={() => {
              setTab("companies");
              companiesAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
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

/**
 * How far the content sheet laps back over the bottom of the photograph.
 *
 * The same number as the trail page's, and for the same reason: the hero is
 * given this much extra height and the sheet takes it straight back, so the
 * overlap the reference draws costs the picture nothing.
 */
const SHEET_LAP_PX = 28;

/* -------------------------------------------------------------------------- */
/* The mapped line                                                            */
/* -------------------------------------------------------------------------- */

/**
 * THE LINE, THE PROFILE AND THE FILE — the three things a trek page could not
 * have until a trek had an OSM relation behind it.
 *
 * Every one of them comes through the SAME services the trail page uses, off
 * the same relation id: `trailGeometry` for the line, `trailWays` and
 * `elevationOf` for the profile, `toGpx` for the file. There is no second
 * geometry pipeline, nothing stored in this app, and nothing drawn that OSM did
 * not send. A trek with no matched relation does not render this at all — see
 * the call site.
 *
 * WHAT THIS SECTION SAYS OUT LOUD, and why each sentence is not optional:
 *
 *   WHOSE LINE IT IS. The relation id and the relation's own name, which is
 *   often not the trek's — the Tour du Matterhorn's line is filed under "Tour
 *   du Cervin". A walker following a line is entitled to know which line, and
 *   the name it is filed under is how they check it themselves.
 *
 *   HOW IT WAS MATCHED. The evidence, in the words the matching script
 *   recorded. This app has already deleted a whole imagery system for matching
 *   on proximity and getting it wrong; a route is a far worse thing to get
 *   wrong than a photograph, so the reasoning is on the page rather than in a
 *   commit message.
 *
 *   THAT IT IS A MAP, NOT A GUARANTEE. OSM is surveyed by volunteers. The line
 *   can be out of date, incomplete or simply wrong, and it says nothing about
 *   whether the route is open, in condition, or safe on the day.
 */
/**
 * How far apart the elevation readings are, in kilometres.
 *
 * The denominator is the number of GAPS, not the number of readings — 100
 * samples across 166 km are 99 gaps of 1.7 km, and dividing by 100 would
 * understate the spacing the reader is being warned about.
 */
const sampleSpacing = (lengthKm: number, samples: number) =>
  samples > 1 ? lengthKm / (samples - 1) : lengthKm;

function TrekRouteMap({ trek, route }: { trek: Trek; route: TrekRoute }) {
  const navigate = useNavigate();
  const facts = useRouteFacts(route.osmId);
  /* The ways go first and the line follows them — two Overpass queries in
     sequence, never at once. The note on `trailProfile.ts` records what three
     concurrent queries from one client cost: the geometry came back empty. */
  /* BOTH SHAPES, AND EACH GOES WHERE IT BELONGS. `line` is every point end to
     end and answers "is there a line yet" and "where does it start"; `paths`
     is the continuous pieces the relation truly makes, and is what gets DRAWN
     and WRITTEN. Handing the flattened array to either of those puts a
     straight edge through every gap OSM left. */
  const {
    line,
    paths,
    loading: lineLoading,
    failed: lineFailed,
  } = useTrailLine(route.osmId, !facts.loading);
  const [full, setFull] = useState(false);
  const [why, setWhy] = useState(false);
  /* The basemap the athlete last chose, read once. This page offers no picker
     of its own — the trail page and the tracker own that preference, and a
     second control setting the same value is a second place for it to drift. */
  const [style] = useState(savedMapStyle);

  const waiting = lineLoading || facts.loading;
  const blocked = gpxBlocked(line.length, waiting);
  /** Why Start Route cannot run, or `null` when it can. Same gate, own words. */
  const followStopped = followBlocked(line.length, waiting);
  const haveLine = line.length > 1;

  // Escape leaves the full-screen map — the only way out on a desktop build,
  // which has no back gesture.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  /**
   * Ground this app defers on, read off the route's own record.
   *
   * Two separate reasons, kept separate, because the sentence has to say the
   * true one: the summary describing glacier, rope or technical ground, or a
   * published high point at altitude. ICEFALL's standing rule is that on any of
   * that the judgement belongs to a certified guide, made in person — the same
   * deferral the readiness test, the groups and the passport all carry.
   */
  const glaciated = /glacier|glaciated|crevasse|crampon|rope|technical/i.test(trek.summary);
  const high = trek.maxAltitudeM !== null && trek.maxAltitudeM >= 3500;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="section-label text-mist">The mapped line</p>
        {route.lengthKm !== null && (
          <p className="tnum text-[11.5px] text-mist">{route.lengthKm.toLocaleString("en-GB")} km</p>
        )}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
        OpenStreetMap holds this route as relation {route.osmId}, filed under{" "}
        <span className="text-mist">“{route.osmName}”</span>. ICEFALL matched the two; it did not
        draw this line, and the distance beside the heading is that line measured, not a figure
        this route was sold with.
      </p>

      {/* ---- The map ----------------------------------------------------- */}
      <div
        className={cn(
          "relative bg-graphite",
          /* THE MARGIN BELONGS TO THE INLINE STATE ONLY. Left on in both, the
             `mt-3` still applied once the holder went `fixed inset-0` and
             pushed the full-screen map 12px down the viewport — a strip of the
             page showing above it and the same 12px of map cut off the bottom.
             Measured on the Tour du Mont Blanc, 2026-09-09: canvas 385×694 at
             top 12 in a 385×706 viewport. */
          full ? "fixed inset-0 z-50" : "mt-3 h-[300px] overflow-hidden rounded-card border border-hairline",
        )}
      >
        <RouteWaypointMap
          line={line}
          paths={paths}
          start={line[0] ?? { lat: route.lat, lon: route.lon }}
          center={{ lat: route.lat, lon: route.lon }}
          /* NO WAYPOINTS. `trailWaypoints` is a third Overpass query and this
             page has no list of stops to number against it. The line is the
             claim being made here. */
          waypoints={[]}
          styleId={style}
          className="absolute inset-0 h-full w-full"
        />

        {/* THE MAP HAS TO SAY WHEN IT IS NOT SHOWING THE ROUTE. Until the
            geometry lands there is a basemap on screen with no route on it,
            which reads as "this walk goes nowhere" unless it is labelled. */}
        {!haveLine && !OFFLINE && (
          /* TOP-LEFT, CLEAR OF BOTH THE EXPAND DISC AND THE MAP'S OWN
             ATTRIBUTION. It sat at the foot of the map for one build and
             covered MapLibre's attribution line, which is a licence notice
             and not a thing a banner of ours may hide. */
          <div className="pointer-events-none absolute left-3 right-14 top-3 rounded-xl bg-obsidian/85 px-3 py-2 backdrop-blur">
            <p className="text-[11.5px] leading-relaxed text-mist">
              {waiting
                ? "Fetching the line from OpenStreetMap…"
                : lineFailed
                  ? "OpenStreetMap didn't send the line. This is a connection problem, not an empty route."
                  : "OpenStreetMap sent no line for this relation."}
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

      {/* ---- The vertical story ------------------------------------------
          Drawn only when Open-Meteo actually answered. `elevationOf` returns
          null rather than a flat line when it cannot, because a profile that
          is secretly zeros is worse than no profile. */}
      {facts.elevation && route.lengthKm !== null && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <p className="section-label text-mist">Elevation</p>
            {/* "AT LEAST", AND THE WORD IS MEASURED RATHER THAN MODEST.
                Open-Meteo caps a request at 100 points, so a long route is
                sampled every kilometre or more, and climb between two samples
                is climb this profile cannot see. Coarse sampling of a
                continuous line can only MISS ascent, never invent it, so the
                figure is a floor — which is why it is printed as one.

                Measured on the Tour du Mont Blanc, 2026-09-09: 165.9 km at
                100 samples gave ↑ 422 m and ↓ 1,058 m on a circuit, where the
                two must in truth be equal and both run to five figures. Printed
                bare, as they were for one build, they read as the climb of the
                walk. They are not that number and never were. */}
            <p className="tnum text-[11.5px] text-mist">
              ↑ at least {facts.elevation.ascentM.toLocaleString()} m · ↓ at least{" "}
              {facts.elevation.descentM.toLocaleString()} m
            </p>
          </div>
          <ElevationProfile className="mt-2.5" elevation={facts.elevation} lengthKm={route.lengthKm} />
          {/* THE HIGH POINT ON THE ROUTE IS A PUBLISHED FACT ON THIS RECORD;
              this profile is sampled from a global elevation model along OSM's
              line. They are two different measurements of the same mountain
              and they will not agree exactly, so neither is presented as a
              correction of the other. */}
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
            Sampled from a global elevation model along the mapped line, not surveyed — one reading
            about every{" "}
            {sampleSpacing(route.lengthKm, facts.elevation.points.length).toLocaleString("en-GB", {
              maximumFractionDigits: 1,
            })}{" "}
            km, so the shape is right and anything that rises and falls between two readings is not
            counted in the totals. This route's published high point is {trekAltitude(trek)}.
          </p>
        </div>
      )}

      {/* ---- The file -----------------------------------------------------
          OFFLINE THERE IS NO FILE AND NO PRETENDING THERE IS. `trailGeometry`
          returns an empty line in the offline build by design — a relation's
          geometry lives only in Overpass — so the control would sit permanently
          disabled under "this is a connection problem", which in a build that
          knows it has no connection is a worse answer than not offering the
          file at all. The map area says the same thing in its own words. */}
      {OFFLINE ? (
        <p className="mt-5 text-[11.5px] leading-relaxed text-mist-dim">
          The GPX file and the route-following screen are both written from the relation's own
          geometry, which is fetched rather than stored. This build has no connection, so there is
          no line yet — for either.
        </p>
      ) : (
        <>
          {/* ---- Walking it ----------------------------------------------
              THE PRIMARY ACTION ON THIS SECTION, and it is the only control
              here that does anything on the ground: it starts a recorded
              activity bound to this line and follows it. The file below is for
              a watch; this is for the walk.

              IT CANNOT RENDER WHERE THERE IS NO LINE TO FOLLOW. Gated on the
              same question the GPX button asks, in `followBlocked`'s own
              words — a Start control that cannot start is the worst outcome
              this section could ship. */}
          <button
            type="button"
            disabled={followStopped !== null}
            onClick={() =>
              navigate(
                followHref("trekking", { osmId: route.osmId, name: trek.name }),
              )
            }
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-pill bg-azure text-[13.5px] text-obsidian transition-colors hover:bg-azure-bright disabled:pointer-events-none disabled:opacity-45"
          >
            <Compass size={16} strokeWidth={1.8} />
            Start Route
          </button>
          {/* ONE SENTENCE BEFORE THE WALK. The full four are on the tracker,
              open on a first walk and folded away after — see FOLLOW_LIMITS.
              The guide deferral this route may need is in the disclaimer at
              the foot of this section, which is the same block of text and is
              read in the same breath. */}
          <p className="mt-1.5 text-center text-[11px] leading-relaxed text-mist-dim">
            {followStopped ?? FOLLOW_ONE_LINE}
          </p>

          <button
            type="button"
            disabled={blocked !== null}
            onClick={() => downloadGpx(trek.name, paths)}
            className="mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-pill border border-hairline-strong text-[13.5px] text-snow transition-colors hover:border-azure/50 disabled:pointer-events-none disabled:opacity-45"
          >
            <Download size={16} strokeWidth={1.8} />
            Download GPX
          </button>
          {/* A DISABLED BUTTON HAS TO SAY WHY, AND THE REASON HAS TO BE TRUE.
              Both sentences come from `lib/gpx.ts`, which is the only place
              this app words them — the trail page offers the same file in
              three places and all three used to word it differently. */}
          <p className="mt-1.5 text-center text-[11px] leading-relaxed text-mist-dim">
            {blocked ?? `${line.length.toLocaleString()} points · for a watch or handheld`}
          </p>
        </>
      )}

      {/* ---- Where this came from ------------------------------------------
          A control that reveals the evidence, not a paragraph nobody reads.
          The sentences are the matching script's own, carried through the
          generated file — the page does not re-word them, so what a walker
          reads is what was actually tested. */}
      <div className="mt-5 border-t border-hairline pt-4">
        <button
          type="button"
          onClick={() => setWhy((v) => !v)}
          className="text-[12.5px] text-azure underline underline-offset-2"
        >
          {why ? "Hide how this line was matched" : "How this line was matched"}
        </button>
        {why && (
          <div className="mt-2.5 space-y-1.5">
            {route.evidence.map((e) => (
              <p key={e} className="text-[11.5px] leading-relaxed text-mist-dim">
                {e}
              </p>
            ))}
            <p className="text-[11.5px] leading-relaxed text-mist-dim">
              {route.confidence === "strong"
                ? "Matched on the relation calling itself what this trek calls it."
                : "Matched on a partial name agreement corroborated by the measured length. This is the weaker of the two grades ICEFALL will accept, and routes it could not be confident about were left with no line at all."}
            </p>
            <a
              href={`https://www.openstreetmap.org/relation/${route.osmId}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-[11.5px] text-azure underline underline-offset-2"
            >
              Check it on OpenStreetMap
              <ExternalLink size={12} strokeWidth={1.8} />
            </a>
          </div>
        )}
      </div>

      <Disclaimer className="mt-4">
        This line is OpenStreetMap data, surveyed by volunteers. It can be out of date, incomplete
        or wrong, and it says nothing about whether the route is open, in condition or passable
        today. Carry a map and compass and know how to use them.
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

/**
 * The route's own description, clamped, with the reference's "Show more".
 *
 * The link appears ONLY when the text genuinely overflows, measured against the
 * clamped element. A "Show more" that expands nothing is a dead control, and it
 * is invisible in a mock-up because a mock-up's copy is always long enough.
 * `TrailDetail` carries the same component for OSM's `description`; the two are
 * not shared because they clamp different things and neither file owns the
 * other — if a third page needs one, that is the moment to lift it.
 */
function TrekSummary({ text }: { text: string }) {
  const body = useRef<HTMLParagraphElement | null>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
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
 * The companies tab.
 *
 * A separate component so `maxAltitudeM` can be narrowed ONCE, at the top,
 * and stay narrowed inside the map below — TypeScript drops the narrowing of a
 * property access as soon as it crosses into a closure, and the workaround
 * people reach for there is `?? 0`, which is precisely the zero this section
 * exists to refuse.
 */
function TrekCompanies({ trek, operators }: { trek: Trek; operators: Operator[] }) {
  const highPoint = trek.maxAltitudeM;

  if (highPoint === null) {
    return (
      <Stagger className="mt-4 space-y-3">
        <Card className="p-4">
          <p className="text-sm leading-relaxed text-mist/80">
            No high point is published for this route, and companies are matched partly on the
            altitude they work at. Rather than list every operator in the directory and let the
            order imply a match nobody made, this shows none.
          </p>
        </Card>
      </Stagger>
    );
  }

  return (
    <Stagger className="mt-4 space-y-3">
      <div>
        <SectionLabel>Companies working this route</SectionLabel>
        {/* THE CLAIM IS THE MATCH, NOT THE BOOKING. No trek carries an operator
            link, so "companies that run this trek" would be an assertion the
            data cannot support. This says what was actually done. */}
        <p className="mt-2 text-xs leading-relaxed text-mist/55">
          Matched to {trek.country} and to the {trekAltitude(trek)} high point of this walk — not
          booked, endorsed or paid for. Ordered by that match, then alphabetically.
        </p>
      </div>

      {operators.some((o) => o.demo) && <Disclaimer>{DEMO_NOTICE}</Disclaimer>}

      {operators.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm leading-relaxed text-mist/80">
            No listing in the directory covers {trek.country} at this altitude. That is a gap in
            ICEFALL's directory, not a statement about who guides this route — plenty of companies
            will.
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {operators.map((o, i) => (
            <OperatorCard
              key={o.id}
              operator={o}
              lead={i === 0}
              rank={i === 0 ? undefined : i + 1}
              peak={{ name: trek.name, elevationM: highPoint }}
            />
          ))}
        </div>
      )}

      <Disclaimer>{OPERATOR_DISCLAIMER}</Disclaimer>
    </Stagger>
  );
}

/**
 * What the route asks of a walker.
 *
 * DERIVED FROM THE GRADE AND THE ALTITUDE, and labelled as such on screen.
 * These are not an operator's entry requirements and must never be presented as
 * one — the same mistake that once graded a base camp trek off the summit
 * height of the mountain above it.
 */
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
      out.push(
        "Long days with sustained ascent and descent",
        "Confidence on rough or unmade ground",
      );
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
    if (maxAltitudeM >= 5000)
      out.push("Acclimatisation above 5,000 m, and days built in to get it");
    else if (maxAltitudeM >= 3500)
      out.push("Nights above 3,500 m — altitude is the main difficulty");
    else if (maxAltitudeM >= 2000) out.push("Some time above 2,000 m");
  }
  return out;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-mist/50">{k}</dt>
      <dd className="text-right text-mist/90">{v}</dd>
    </div>
  );
}

/* `Fact` used to live here — a bordered 2×2 grid of icon-and-figure boxes above
   the tabs. It is gone with the boxes: the four figures are now one stacked
   `Stat` row across the sheet, which is the app's shared way of printing a
   metric and the reference's own layout. */
