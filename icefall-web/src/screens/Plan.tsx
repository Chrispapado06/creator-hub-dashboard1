import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BedDouble, Compass, PlaneTakeoff, ShieldCheck } from "lucide-react";
import { Container } from "@/components/Shell";
import { Badge, Button, Card, GuidePhoto, Rating, VerifiedTick } from "@/components/ui";
import { TripSearch } from "@/components/TripSearch";
import { originByCode, stopsLabel, type Itinerary } from "@/lib/flights";
import {
  daysOf, guidesForObjective, modeIncludesFlights, modeIncludesStay, modeLabel,
  objectiveById, parseDay, searchFromParams, searchToQuery, tripCost,
  type Lodge, type TripSearch as Search,
} from "@/lib/trip";
import { useFlights, useStays } from "@/lib/live";
import { formatEur } from "@/money/model";
import { useAuth } from "@/lib/auth";
import type { Guide } from "@/data/demo";

/**
 * Results — the answer to the trip search.
 *
 * The whole point of the redesign: you asked for a guide, a guide + flights, or
 * the whole package, and this returns priced options for exactly that. Booking
 * only CONFIRMS what you pick here — the total on a card is the total at
 * checkout, because both call `tripCost`.
 */
export default function Plan() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { requireAuth } = useAuth();
  const search = useMemo(() => searchFromParams(params), [params]);

  const objective = objectiveById(search.objectiveId);
  const guides = guidesForObjective(search.objectiveId);
  const days = daysOf(search.startIso, search.endIso);
  const withFlights = modeIncludesFlights(search.mode);
  const withStay = modeIncludesStay(search.mode);

  const origin = originByCode(search.originCode);
  const startD = parseDay(search.startIso);
  const endD = parseDay(search.endIso);

  // Live (Duffel/LiteAPI) when a key is set, else labelled demo data — same for
  // every guide, since flights/stays depend on the route + dates, not the guide.
  const { items: flights, source: flightSource } = useFlights(
    withFlights && objective && startD && endD
      ? { origin, destination: objective.gateway, outIso: startD.toISOString(), backIso: endD.toISOString(), pax: search.pax }
      : null,
  );
  const { items: stays, source: staySource } = useStays(
    withStay && objective
      ? {
          objectiveId: objective.id,
          cityName: objective.region.split(",")[0].trim(),
          country: objective.country,
          lat: objective.gateway.lat,
          lon: objective.gateway.lon,
          checkinIso: search.startIso,
          checkoutIso: search.endIso,
          adults: search.pax,
        }
      : null,
  );
  const flight = flights[0] ?? null; // cheapest — both sources return sorted
  const lodge = stays.length ? stays.reduce((a, b) => (a.nightlyCents <= b.nightlyCents ? a : b)) : null;
  const anyLive = flightSource === "live" || staySource === "live";

  function runSearch(next: Search) {
    setParams(new URLSearchParams(searchToQuery(next)));
  }

  return (
    <Container className="py-10">
      {/* key on the URL-derived search so the bar re-syncs on Back/Forward,
          not just on its own submit (its state is seeded from `initial` once). */}
      <TripSearch key={searchToQuery(search)} initial={search} variant="bar" onSubmit={runSearch} />

      {objective && (
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="section-label text-azure">{modeLabel(search.mode)}</p>
            <h1 className="mt-2 text-[28px] font-light text-snow">
              {objective.mountain} · {objective.region}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-mist">
              <span>{days} {days === 1 ? "day" : "days"}</span>
              <span className="text-mist-dim">·</span>
              <span>{search.pax} {search.pax === 1 ? "climber" : "climbers"}</span>
              {withFlights && (
                <>
                  <span className="text-mist-dim">·</span>
                  <span className="flex items-center gap-1.5">
                    <PlaneTakeoff size={13} strokeWidth={1.7} className="text-mist-dim" />
                    from {origin.city} ({origin.code})
                  </span>
                </>
              )}
            </p>
          </div>
          <p className="text-[12px] text-mist-dim">{guides.length} {guides.length === 1 ? "guide" : "guides"}</p>
        </div>
      )}

      {(withFlights || withStay) && (
        <p className="mt-4 flex items-start gap-2 rounded-tile border border-hairline bg-obsidian/40 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-mist-dim">
          <ShieldCheck size={14} strokeWidth={1.7} className="mt-px shrink-0 text-azure" />
          <span>
            The guiding is booked and held by ICEFALL. Flights{withStay ? " and stays" : ""} are passed
            through at fare —{" "}
            {anyLive
              ? "live prices from our travel partners. "
              : "demonstration prices, not live quotes, and nothing here is booked. "}
            You'll choose the exact {withStay ? "flight and room" : "flight"} at the next step.
          </span>
        </p>
      )}

      <div className="mt-6 space-y-4">
        {guides.map((g) => (
          <ResultRow
            key={g.id}
            guide={g}
            days={days}
            pax={search.pax}
            withFlights={withFlights}
            withStay={withStay}
            flight={flight}
            lodge={lodge}
            origin={origin}
            gatewayCode={objective?.gateway.code ?? ""}
            onBook={() => {
              const q = new URLSearchParams(searchToQuery(search));
              if (flight) q.set("flight", flight.id);
              if (lodge) q.set("lodge", lodge.id);
              // Sign in first if needed, THEN go to booking — so a signed-out
              // click keeps the full selection instead of being bounced away.
              requireAuth(() => navigate(`/book/${g.id}?${q.toString()}`));
            }}
          />
        ))}
      </div>

      {guides.length === 0 && (
        <div className="py-16 text-center">
          <Compass size={26} strokeWidth={1.3} className="mx-auto text-mist-dim" />
          <p className="mt-3 text-[13.5px] text-mist">No guides list {objective?.mountain} yet.</p>
          <p className="mt-1 text-[12px] text-mist-dim">Try another mountain — the marketplace is small while it's in demo.</p>
        </div>
      )}
    </Container>
  );
}

function ResultRow({
  guide, days, pax, withFlights, withStay, flight, lodge, origin, gatewayCode, onBook,
}: {
  guide: Guide;
  days: number;
  pax: number;
  withFlights: boolean;
  withStay: boolean;
  flight: Itinerary | null;
  lodge: Lodge | null;
  origin: ReturnType<typeof originByCode>;
  gatewayCode: string;
  onBook: () => void;
}) {
  const cost = tripCost({ guide, days, pax, flight: withFlights ? flight : null, lodge: withStay ? lodge : null });
  const bundled = withFlights || withStay;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-stretch">
        {/* The peak, then the person */}
        <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-tile border border-hairline sm:h-auto sm:w-52">
          <img src={`/img/${guide.heroPeak}.jpg`} alt="" aria-hidden className="h-full w-full object-cover opacity-85" />
          <div className="absolute inset-0 bg-gradient-to-t from-graphite/90 to-transparent" />
          <span className="absolute bottom-2.5 left-2.5">
            <GuidePhoto name={guide.name} src={guide.photo} size={46} className="ring-2 ring-graphite" />
          </span>
        </div>

        {/* Substance */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[16px] text-snow">
                <span className="truncate">{guide.name}</span>
                <VerifiedTick verifiedOn={guide.verifiedOn} size={14} />
              </p>
              <p className="mt-0.5 truncate text-[12px] text-mist-dim">{guide.credential}</p>
            </div>
            <Rating value={guide.rating} reviews={guide.reviews} />
          </div>

          <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-mist">{guide.headline}</p>

          {/* What's in the price */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="azure">
              <Compass size={11} strokeWidth={1.7} />
              Guiding · {days} {days === 1 ? "day" : "days"}
            </Badge>
            {withFlights && flight && (
              <Badge>
                <PlaneTakeoff size={11} strokeWidth={1.7} />
                {flight.airline} · {stopsLabel(flight.outbound.stops)} · {origin.code}–{gatewayCode}
              </Badge>
            )}
            {withStay && lodge && (
              <Badge>
                <BedDouble size={11} strokeWidth={1.7} />
                {lodge.name} · {cost.nights} {cost.nights === 1 ? "night" : "nights"}
              </Badge>
            )}
            {withFlights && !flight && (
              <Badge>No flight found for this route</Badge>
            )}
          </div>
        </div>

        {/* Price + act */}
        <div className="flex shrink-0 flex-col items-stretch justify-between gap-3 border-t border-hairline pt-4 sm:w-48 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <div>
            {bundled && <p className="text-[11px] text-mist-dim">from</p>}
            <p className="tnum text-[22px] font-light text-snow">{formatEur(cost.total)}</p>
            <p className="text-[11px] text-mist-dim">total · {pax} {pax === 1 ? "climber" : "climbers"}</p>
            <dl className="mt-2.5 space-y-1 border-t border-hairline pt-2.5 text-[11.5px]">
              <CostLine label="Guiding + fee" value={formatEur(cost.guide.total)} />
              {withFlights && cost.flightCents > 0 && <CostLine label={`Flights · ${pax}×`} value={formatEur(cost.flightCents)} />}
              {withStay && cost.lodgeCents > 0 && <CostLine label={`Stay · ${cost.nights}n`} value={formatEur(cost.lodgeCents)} />}
            </dl>
          </div>
          <Button className="w-full" onClick={onBook}>
            {withStay ? "Book package" : withFlights ? "Book trip" : "Book guide"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CostLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-mist-dim">{label}</dt>
      <dd className="tnum text-mist">{value}</dd>
    </div>
  );
}
