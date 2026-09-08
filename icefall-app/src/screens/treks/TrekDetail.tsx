import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChevronLeft, Compass, MessageSquare, Share2 } from "lucide-react";
import { Card, Disclaimer, SectionLabel, Stat, sharePage } from "@/components/ui/primitives";
import { Rise, SegmentedTabs, Stagger, useDetailBack } from "@/components/layout/chrome";
import { LiquidGlassButton, LiquidGlassCircle } from "@/components/ui/LiquidGlassButton";
import { cn } from "@/lib/utils";
import { MOUNTAINS } from "@/data/mock/mountains";
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
 * REBUILT 2026-09-08 to Charlie's reference, the same one the trail page
 * follows: "this is how i want it to look like when you click on a trek". The
 * bordered cards at the top are gone with the boxes; what replaced them is a
 * full-bleed photograph, glass controls floating on it, and a content sheet.
 * The tabbed body below is unchanged and still carries `Card`s — that is the
 * next pass, not this one.
 */
export default function TrekDetail() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const trek = trekById(id);

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
            share, save and an overflow. Back and share are real here. There is
            no saved-treks store anywhere in this app — `savedTrails` is keyed
            on an OSM relation id and no trek has one — so a heart would be a
            control that forgets, and there is no options sheet for a trek to
            put behind a "…". Two discs that work beat four that look right.

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
            RATHER THAN A PREFERENCE. A trek publishes no measured length and no
            elevation gain, so two of the reference's four columns have no
            source at all. What is left that is genuinely FIGURE-SHAPED is the
            duration, the grade and the high point.

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
          <Stagger className="mt-4 space-y-3">
            <Card className="p-4">
              <SectionLabel>What the route is</SectionLabel>
              <p className="mt-2 text-sm leading-relaxed text-mist/80">{trek.summary}</p>
            </Card>
            {/*
             * NO DAY-BY-DAY ITINERARY.
             *
             * Every operator sells its own, they differ by days and by village,
             * and ICEFALL holds none of them. An invented schedule is the single
             * most damaging thing this page could print, because it is the part a
             * walker plans flights and leave around.
             */}
            <Disclaimer>
              ICEFALL does not publish a day-by-day itinerary for this route. Stages differ between
              operators and we hold none of theirs — what is above is the route, not a schedule.
            </Disclaimer>
          </Stagger>
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
          save". The reference's other two are Download and Map; a trek has no
          GPX to write and no mapped line to show, so the second pill is the
          companies list, which is real and is the question most people open a
          trek page with. Nothing is drawn for the slots that would be empty.

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
