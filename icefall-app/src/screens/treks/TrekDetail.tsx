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
} from "@/treks";
import { trekImage, trekImageCaption, trekImageSubject } from "@/treks/images";
import { TREK_PHOTO_CREDITS } from "@/treks/credits";
import { TrekCard } from "@/screens/treks/Treks";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "route", label: "The route" },
  { value: "prepare", label: "Preparation" },
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
 *   no operator list  no operator has listed a trek with us yet; the enquiry
 *                     route is the message screen, which is honest about that
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

  // Every hook is above this line: an early return before them would skip the
  // ones below it and React would render fewer hooks than it expected.
  if (!trek) return <Navigate to="/explore/treks" replace />;

  const credit = TREK_PHOTO_CREDITS[trek.id];
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
