import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  CalendarDays, Clock, Compass, Footprints, MapPin, Mountain as MountainIcon, TrendingUp,
} from "lucide-react";
import { Badge, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { MOUNTAINS } from "@/data/mock/mountains";
import {
  TREKS, peaksForTrek, trekAltitude, trekById, trekDuration, trekRegion, treksInRegion,
  type Trek,
} from "@/treks";
import { trekImage, trekImageCaption, trekImageSubject, trekPhotoCredit } from "@/treks/images";
import { TrekCard } from "@/screens/treks/Treks";
import { DEMO_NOTICE, OPERATOR_DISCLAIMER, operatorsFor, type Operator } from "@/services/operators";
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
 * Every fact shown is published and sourced. Anything unknown prints "Not
 * specified" rather than a guess.
 */
export default function TrekDetail() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const trek = trekById(id);

  const region = trek ? trekRegion(trek.regionId) : undefined;
  const peaks = useMemo(
    () => (trek ? peaksForTrek(trek).map((p) => MOUNTAINS.find((m) => m.id === p)!).filter(Boolean) : []),
    [trek],
  );
  const alsoHere = useMemo(
    () => (trek ? treksInRegion(trek.regionId).filter((t) => t.id !== trek.id).slice(0, 4) : []),
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
    <Screen>
      {/* NO ScreenHeader HERE — ExploreLayout owns the header and the back
          chevron for every screen under /explore, and rendering a second one
          gave this page two titles and two chevrons stacked on a phone. */}
      <Rise>
        <header className="pb-3 pt-2">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-mist">
            {trek.name}
          </h1>
          <p className="mt-1 text-sm text-mist/55">{trek.country}</p>
        </header>
      </Rise>

      <Rise>
        <Card className="overflow-hidden p-0">
          <div className="relative h-48 w-full overflow-hidden bg-slate">
            <img src={trekImage(trek)} alt="" className="h-full w-full object-cover" />
            <Badge tone="azure" className="absolute left-3 top-3 bg-obsidian/70 backdrop-blur">
              <Footprints className="mr-1 h-3 w-3" />
              Trek
            </Badge>
          </div>
          {/* Attribution, or the honest description of what is being shown. */}
          <p className="px-4 py-2 text-[10px] text-mist/45">
            {credit ? (
              <>
                {credit.credit ? `Photograph: ${credit.credit}` : "Photograph"} ·{" "}
                <a
                  href={credit.pageUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-azure/80 underline underline-offset-2"
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
            <p className="px-4 pb-3 text-[11px] text-mist/55">
              This is {subject}, a mountain the route visits — not a photograph of the route.
            </p>
          )}
        </Card>
      </Rise>

      <Rise>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Fact icon={Clock} label="Duration" value={trekDuration(trek)} />
          <Fact icon={TrendingUp} label="Difficulty" value={trek.difficulty ?? "Not specified"} />
          <Fact icon={MountainIcon} label="High point" value={trekAltitude(trek)} />
          <Fact icon={CalendarDays} label="Season" value={trek.season ?? "Not specified"} />
        </div>
      </Rise>

      <Rise>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-hairline-strong bg-white/[0.02] px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-mist/40">Cost</p>
            <p className="text-sm text-mist">Price on enquiry</p>
          </div>
          <Link
            to="/messages/new"
            className="rounded-full border border-azure/40 bg-azure/10 px-4 py-2 text-xs text-azure"
          >
            Enquire
          </Link>
        </div>
      </Rise>

      <div className="mt-4">
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
    </Screen>
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
            ICEFALL's directory, not a statement about who guides this route — plenty of
            companies will.
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
    else if (maxAltitudeM >= 3500) out.push("Nights above 3,500 m — altitude is the main difficulty");
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

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-hairline-strong bg-white/[0.02] p-3">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-mist/40">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 text-sm tabular-nums text-mist/90">{value}</p>
    </div>
  );
}
