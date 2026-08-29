import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  BedDouble, Check, ChevronDown, ChevronLeft, Lock, MessageCircle, Plane, PlaneTakeoff,
  ShieldCheck, Users,
} from "lucide-react";
import { Container } from "@/components/Shell";
import { Button, Card, GuidePhoto, Label, VerifiedTick } from "@/components/ui";
import { AppleMark, GoogleMark } from "@/components/PayMarks";
import { DateRangeField, formatRange, inclusiveDays, type DateRange } from "@/components/DatePicker";
import {
  FLIGHTS_NOTICE, ORIGINS, PACKAGE_NOTICE, durationLabel, gatewayFor, originByCode,
  stopsLabel, type Airport, type Itinerary,
} from "@/lib/flights";
import {
  LODGES_NOTICE, modeIncludesFlights, modeIncludesStay, nightsOf,
  objectiveById, objectiveForGuide, parseDay, searchFromParams, tripCost, type Lodge,
} from "@/lib/trip";
import { useFlights, useStays } from "@/lib/live";
import { guideById } from "@/data/demo";
import { useAuth } from "@/lib/auth";
import { formatEur, instalmentsFor, FLEXIBLE_POLICY } from "@/money/model";

/**
 * This screen books a GUIDE, so it prints `FLEXIBLE_POLICY` — not the tiered
 * `STANDARD_POLICY` that governs an expedition. See the fuller note on the same
 * constant in `GuideDetail.tsx`. Read off the policy rather than typed in.
 */
const FREE_CANCEL_DAYS = FLEXIBLE_POLICY.tiers.find((t) => t.refundPct === 100)?.daysBefore ?? 0;
import { cn } from "@/lib/utils";

/**
 * Confirm and pay — where a searched trip is turned into a booking.
 *
 * You arrive here from the results page with a trip already chosen: dates, a
 * flight, a stay. This screen shows that trip, lets you adjust any leg, and
 * charges it — honestly gated, since no processor or airline API is connected.
 * The guiding is a booking ICEFALL stands behind; flights and stays are passed
 * through at fare. The total here is computed by the SAME `tripCost` the results
 * card used, so the number never changes between seeing it and confirming it.
 */

export default function BookingConfirm() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, signedIn, requireAuth } = useAuth();

  const guide = guideById(id ?? "");
  const search = useMemo(() => searchFromParams(params), [params]);

  // The mountain this trip is against — from the search, but only if this guide
  // actually guides it. A crafted /book/:id?obj=… must not put a guide on a peak
  // they don't climb (and route the flights to the wrong airport).
  const objective = useMemo(() => {
    const fromParam = objectiveById(params.get("obj") ?? "");
    if (fromParam && guide?.mountains.includes(fromParam.mountain)) return fromParam;
    return guide ? objectiveForGuide(guide) : undefined;
  }, [params, guide]);
  const gateway: Airport = objective?.gateway ?? gatewayFor(guide?.basedIn ?? "");

  const [range, setRange] = useState<DateRange>(() => {
    const from = parseDay(search.startIso) ?? new Date();
    const to = parseDay(search.endIso) ?? from;
    return { from, to };
  });
  const [party, setParty] = useState(search.pax);
  const [method, setMethod] = useState<"card" | "apple" | "google">("card");
  const [addFlights, setAddFlights] = useState(modeIncludesFlights(search.mode));
  const [addStay, setAddStay] = useState(modeIncludesStay(search.mode) && Boolean(objective));
  const [originCode, setOriginCode] = useState(search.originCode);
  const [flightId, setFlightId] = useState<string | null>(params.get("flight"));
  const [lodgeId, setLodgeId] = useState<string | null>(params.get("lodge"));
  const [confirmed, setConfirmed] = useState(false);

  const days = inclusiveDays(range);
  const nights = nightsOf(days);
  const departureIso = range.from.toISOString();
  const origin = originByCode(originCode);

  // Live (Duffel / LiteAPI) when a key is set, else labelled demo data. The
  // browser never sees a key — these hooks only ever call our /api server.
  const { items: flights, source: flightSource, loading: flightsLoading } = useFlights(
    addFlights ? { origin, destination: gateway, outIso: range.from.toISOString(), backIso: range.to.toISOString(), pax: party } : null,
  );
  const { items: lodges, source: staySource, loading: staysLoading } = useStays(
    addStay && objective
      ? {
          objectiveId: objective.id,
          cityName: objective.region.split(",")[0].trim(),
          country: objective.country,
          lat: gateway.lat,
          lon: gateway.lon,
          checkinIso: range.from.toISOString(),
          checkoutIso: range.to.toISOString(),
          adults: party,
        }
      : null,
  );

  const activeFlightId = flightId ?? flights[0]?.id ?? null;
  const selectedFlight: Itinerary | null =
    addFlights ? flights.find((f) => f.id === activeFlightId) ?? flights[0] ?? null : null;

  // Scope to THIS objective's lodges — a stale/foreign lodge id in the URL must
  // fall back to a valid room here, never price in a hotel from another country.
  const activeLodge: Lodge | null =
    addStay ? lodges.find((l) => l.id === lodgeId) ?? lodges[0] ?? null : null;

  const cost = useMemo(
    () => (guide ? tripCost({ guide, days, pax: party, flight: selectedFlight, lodge: activeLodge }) : null),
    [guide, days, party, selectedFlight, activeLodge],
  );
  const instalments = useMemo(
    () => (cost ? instalmentsFor(cost.total, departureIso) : []),
    [cost, departureIso],
  );

  // Land here signed out (e.g. a shared/deep link) → open sign-in once, but STAY
  // on this URL so the selection survives. Signing in flips `signedIn` and the
  // booking renders below with every query param intact.
  useEffect(() => {
    if (guide && !signedIn) requireAuth();
    // Run once on mount; requireAuth only opens the modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!guide) return <Navigate to="/guides" replace />;
  // Never render the pay page signed out — but don't throw the trip away either.
  if (!signedIn) {
    return (
      <Container className="py-24">
        <div className="mx-auto max-w-[440px] text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-hairline text-mist">
            <Lock size={20} strokeWidth={1.7} />
          </span>
          <h1 className="mt-5 text-[22px] font-light text-snow">Sign in to confirm your trip</h1>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-mist">
            Your selection is saved. Sign in or create an account and you'll come straight
            back to it — nothing is charged.
          </p>
          <Button className="mt-6" onClick={() => requireAuth()}>
            Sign in or create an account
          </Button>
        </div>
      </Container>
    );
  }

  const bundled = !!selectedFlight || !!activeLodge;
  const dueToday = instalments[0];
  const balance = instalments[1];

  if (confirmed) {
    return (
      <Container className="py-16">
        <div className="mx-auto max-w-[560px] text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-summit/40 text-summit">
            <Check size={24} strokeWidth={2} />
          </span>
          <h1 className="mt-5 text-[24px] font-light text-snow">Trip confirmed</h1>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-mist">
            You're booked with {guide.name} for {days} {days === 1 ? "day" : "days"}, {formatRange(range)}.
            Your channel with them is now open — plan the trip, and remember your deposit is refundable
            up to {FREE_CANCEL_DAYS} days before you start.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {selectedFlight && (
              <span className="inline-flex items-center gap-2 rounded-tile border border-hairline bg-obsidian/40 px-3.5 py-2 text-[12.5px] text-mist">
                <PlaneTakeoff size={14} strokeWidth={1.7} className="text-azure" />
                {origin.city} → {gateway.city} · {selectedFlight.airline}
              </span>
            )}
            {activeLodge && (
              <span className="inline-flex items-center gap-2 rounded-tile border border-hairline bg-obsidian/40 px-3.5 py-2 text-[12.5px] text-mist">
                <BedDouble size={14} strokeWidth={1.7} className="text-azure" />
                {activeLodge.name} · {nights} {nights === 1 ? "night" : "nights"}
              </span>
            )}
          </div>
          <p className="mt-4 rounded-tile border border-hairline bg-obsidian/40 px-4 py-3 text-[11.5px] leading-relaxed text-mist-dim">
            This is a demonstration — no card was charged, no flight or room was booked and no
            reservation was made. It shows the flow end to end.
          </p>
          <div className="mt-6 flex justify-center gap-2.5">
            <Button onClick={() => navigate("/messages")}>
              <MessageCircle size={15} strokeWidth={1.8} />
              Message {guide.name.split(" ")[0]}
            </Button>
            <Button variant="secondary" onClick={() => navigate("/guides")}>
              Back to guides
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-10">
      <button
        onClick={() => navigate(-1)}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-mist transition-colors hover:text-snow"
      >
        <ChevronLeft size={16} strokeWidth={1.7} />
        Back
      </button>

      <h1 className="text-[26px] font-light text-snow">Confirm and pay</h1>
      {objective && (
        <p className="mt-1.5 text-[13px] text-mist">
          {objective.mountain} · {objective.region}
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px]">
        {/* ---- Left: the reservation ------------------------------------- */}
        <div className="order-2 lg:order-1">
          <section>
            <Label>Your trip</Label>
            <Card className="mt-3 p-4">
              {/* Changing dates re-runs the flight search; drop the prior pick so
                  the highlighted flight can't silently become a different one. */}
              <DateRangeField value={range} onChange={(r) => { setRange(r); setFlightId(null); }} />
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3">
                <span className="flex items-center gap-2.5 text-[13px] text-mist">
                  <Users size={15} strokeWidth={1.7} className="text-mist-dim" />
                  Climbers
                </span>
                <Stepper value={party} onChange={setParty} />
              </div>
            </Card>
          </section>

          {/* ---- Getting there — flights --------------------------------- */}
          <section className="mt-7">
            <Label>Getting there</Label>
            <Card className="mt-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="flex gap-2.5">
                  <Plane size={16} strokeWidth={1.7} className="mt-px shrink-0 text-azure" />
                  <span>
                    <span className="block text-[13.5px] text-snow">Flights to your guide</span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-mist-dim">
                      Fly into {gateway.city} ({gateway.code}) — the gateway for {objective?.mountain ?? guide.basedIn}.
                    </span>
                  </span>
                </span>
                <Toggle on={addFlights} onChange={setAddFlights} label="Include flights" />
              </div>

              {addFlights && (
                <div className="mt-4 border-t border-hairline pt-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[12px] text-mist-dim">Flying from</span>
                    <OriginSelect value={originCode} onChange={(c) => { setOriginCode(c); setFlightId(null); }} />
                  </div>

                  {flightsLoading && flights.length === 0 ? (
                    <p className="mt-4 text-[12.5px] text-mist-dim">Searching flights…</p>
                  ) : flights.length === 0 ? (
                    <p className="mt-4 text-[12.5px] text-mist-dim">No flights found for these dates.</p>
                  ) : (
                    <div className="mt-3 space-y-2.5">
                      {flights.map((f) => (
                        <FlightOption key={f.id} flight={f} party={party} active={activeFlightId === f.id} onClick={() => setFlightId(f.id)} />
                      ))}
                    </div>
                  )}

                  <p className="mt-3.5 flex gap-2 rounded-tile border border-hairline bg-obsidian/40 px-3 py-2.5 text-[11px] leading-relaxed text-mist-dim">
                    <PlaneTakeoff size={13} strokeWidth={1.7} className="mt-px shrink-0 text-mist-dim" />
                    <span>{flightSource === "live" ? "Live fares from our flight partner (Duffel)." : FLIGHTS_NOTICE} {PACKAGE_NOTICE}</span>
                  </p>
                </div>
              )}
            </Card>
          </section>

          {/* ---- Where you'll stay --------------------------------------- */}
          {objective && (
            <section className="mt-7">
              <Label>Where you'll stay</Label>
              <Card className="mt-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex gap-2.5">
                    <BedDouble size={16} strokeWidth={1.7} className="mt-px shrink-0 text-azure" />
                    <span>
                      <span className="block text-[13.5px] text-snow">A place to stay</span>
                      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-mist-dim">
                        {nights} {nights === 1 ? "night" : "nights"} near {objective?.region ?? guide.basedIn}, per person.
                      </span>
                    </span>
                  </span>
                  <Toggle on={addStay} onChange={setAddStay} label="Include a stay" />
                </div>

                {addStay && (
                  <div className="mt-4 space-y-2.5 border-t border-hairline pt-4">
                    {staysLoading && lodges.length === 0 ? (
                      <p className="text-[12.5px] text-mist-dim">Finding places to stay…</p>
                    ) : lodges.length === 0 ? (
                      <p className="text-[12.5px] text-mist-dim">No stays found for these dates.</p>
                    ) : (
                      lodges.map((l) => (
                        <LodgeOption
                          key={l.id}
                          lodge={l}
                          nights={nights}
                          party={party}
                          active={(activeLodge?.id ?? null) === l.id}
                          onClick={() => setLodgeId(l.id)}
                        />
                      ))
                    )}
                    <p className="flex gap-2 rounded-tile border border-hairline bg-obsidian/40 px-3 py-2.5 text-[11px] leading-relaxed text-mist-dim">
                      <BedDouble size={13} strokeWidth={1.7} className="mt-px shrink-0 text-mist-dim" />
                      <span>{staySource === "live" ? "Live room rates from our hotel partner (LiteAPI)." : LODGES_NOTICE}</span>
                    </p>
                  </div>
                )}
              </Card>
            </section>
          )}

          <section className="mt-7">
            <Label>Pay with</Label>
            <div className="mt-3 space-y-2.5">
              <Method active={method === "card"} onClick={() => setMethod("card")} label="Credit or debit card" sub="Visa, Mastercard, Amex" />
              <Method active={method === "apple"} onClick={() => setMethod("apple")} label="Apple Pay" icon={<AppleMark className="h-4 w-auto text-snow" />} />
              <Method active={method === "google"} onClick={() => setMethod("google")} label="Google Pay" icon={<GoogleMark className="h-4 w-auto" />} />
            </div>
          </section>

          <section className="mt-7">
            <Label>If it doesn't happen</Label>
            <Card className="mt-3 p-4">
              <div className="flex gap-2.5">
                <ShieldCheck size={16} strokeWidth={1.6} className="mt-px shrink-0 text-summit" />
                <p className="text-[12.5px] leading-relaxed text-mist">
                  {FLEXIBLE_POLICY.note} Flights and stays follow their own providers&rsquo; rules,
                  not this one.
                </p>
              </div>
            </Card>
          </section>
        </div>

        {/* ---- Right: the summary + pay ---------------------------------- */}
        <aside className="order-1 lg:order-2">
          <div className="sticky top-24">
            <Card className="p-5">
              <div className="flex items-center gap-3 border-b border-hairline pb-4">
                <GuidePhoto name={guide.name} src={guide.photo} size={44} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[14px] text-snow">
                    <span className="truncate">{guide.name}</span>
                    <VerifiedTick verifiedOn={guide.verifiedOn} size={13} />
                  </p>
                  <p className="truncate text-[11.5px] text-mist-dim">{formatRange(range)} · {party} climbers</p>
                </div>
              </div>

              <dl className="mt-4 space-y-2 text-[13px]">
                {/*
                  There is no "ICEFALL service fee" row here any more, and it
                  was deleted rather than renamed. ICEFALL's 10% comes OUT of
                  the guiding figure on the line above; nothing is added to this
                  climber's bill. A row in a column that sums to a total is read
                  as an addition whatever it is called, so renaming it would
                  have kept the false statement and only changed its wording.
                */}
                <Line label={`Guiding — ${days} ${days === 1 ? "day" : "days"}`} value={formatEur(cost!.guidingCents)} />
                {selectedFlight && (
                  <Line label={`Flights · ${party}× ${origin.code}–${gateway.code}`} value={formatEur(cost!.flightCents)} />
                )}
                {activeLodge && (
                  <Line label={`Stay · ${party}× ${nights}n`} value={formatEur(cost!.lodgeCents)} />
                )}
                <div className="flex items-baseline justify-between border-t border-hairline pt-2.5">
                  <dt className="text-snow">{bundled ? "Package total" : "Total"}</dt>
                  <dd className="tnum text-[15px] text-snow">{formatEur(cost!.total)}</dd>
                </div>
              </dl>

              {dueToday && (
                <div className="mt-4 rounded-tile border border-hairline bg-obsidian/40 p-3.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12.5px] text-snow">{dueToday.label}</span>
                    <span className="tnum text-[15px] text-azure">{formatEur(dueToday.amount)}</span>
                  </div>
                  {balance && (
                    <div className="mt-2 flex items-baseline justify-between border-t border-hairline pt-2 text-[12px] text-mist">
                      <span>
                        Balance ·{" "}
                        {new Date(balance.dueIso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <span className="tnum">{formatEur(balance.amount)}</span>
                    </div>
                  )}
                </div>
              )}

              <Button size="lg" className="mt-4 w-full" onClick={() => setConfirmed(true)} disabled={!dueToday}>
                <Lock size={15} strokeWidth={1.8} />
                Confirm — {dueToday ? formatEur(dueToday.amount) : formatEur(cost!.total)} today
              </Button>

              <p className="mt-3 text-center text-[11px] leading-relaxed text-mist-dim">
                Payments are not connected — nothing is charged. Signed in as {session!.email}.
              </p>
            </Card>
          </div>
        </aside>
      </div>
    </Container>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function FlightOption({ flight, party, active, onClick }: { flight: Itinerary; party: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="block w-full text-left">
      <Card hover className={cn("p-3.5", active && "border-azure/55")}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <Radio active={active} />
            <span className="text-[13.5px] text-snow">{flight.airline}</span>
            <span className="rounded-pill border border-hairline-strong px-2 py-0.5 text-[10.5px] text-mist-dim">{stopsLabel(flight.outbound.stops)}</span>
          </span>
          <span className="text-right">
            <span className="tnum block text-[14px] text-snow">{formatEur(flight.perPersonCents)}</span>
            <span className="block text-[10.5px] text-mist-dim">per person{party > 1 ? ` · ${party}×` : ""}</span>
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-3 border-t border-hairline pt-2.5 text-[11.5px] text-mist">
          <LegLine label="Out" leg={flight.outbound} code={`${flight.origin.code}→${flight.destination.code}`} />
          <LegLine label="Return" leg={flight.inbound} code={`${flight.destination.code}→${flight.origin.code}`} />
        </div>
      </Card>
    </button>
  );
}

function LegLine({ label, leg, code }: { label: string; leg: Itinerary["outbound"]; code: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.08em] text-mist-dim">{label} · {code}</span>
      <span className="tnum text-snow">
        {leg.depTime} – {leg.arrTime}
        {leg.arrDayOffset > 0 && <sup className="text-azure"> +{leg.arrDayOffset}</sup>}
      </span>
      <span className="tnum text-mist-dim">{durationLabel(leg.durationMin)}</span>
    </span>
  );
}

function LodgeOption({ lodge, nights, party, active, onClick }: { lodge: Lodge; nights: number; party: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="block w-full text-left">
      <Card hover className={cn("flex items-center gap-3 p-3.5", active && "border-azure/55")}>
        <Radio active={active} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] text-snow">{lodge.name}</span>
          <span className="block text-[11px] text-mist-dim">{lodge.kind} · {lodge.board}</span>
        </span>
        <span className="text-right">
          <span className="tnum block text-[13.5px] text-snow">{formatEur(lodge.nightlyCents * party * nights)}</span>
          <span className="block text-[10.5px] text-mist-dim">{formatEur(lodge.nightlyCents)}/pp·night</span>
        </span>
      </Card>
    </button>
  );
}

function Radio({ active }: { active: boolean }) {
  return (
    <span className={cn("grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border", active ? "border-azure" : "border-hairline-strong")}>
      {active && <span className="h-2 w-2 rounded-full bg-azure" />}
    </span>
  );
}

function OriginSelect({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-tile border border-hairline bg-obsidian/60 py-2 pl-3.5 pr-9 text-[13px] text-snow outline-none transition-colors hover:border-hairline-strong focus:border-azure/55"
      >
        {ORIGINS.map((o) => (
          <option key={o.code} value={o.code} className="bg-graphite text-snow">
            {o.city} ({o.code})
          </option>
        ))}
      </select>
      <ChevronDown size={15} strokeWidth={1.8} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mist-dim" />
    </span>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full border transition-colors", on ? "border-azure/60 bg-azure/25" : "border-hairline-strong bg-obsidian/60")}
    >
      <span className={cn("absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all", on ? "left-[22px] bg-azure" : "left-1 bg-mist")} />
    </button>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <span className="flex items-center gap-3">
      <StepBtn onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1}>−</StepBtn>
      <span className="tnum w-4 text-center text-[14px] text-snow">{value}</span>
      <StepBtn onClick={() => onChange(Math.min(8, value + 1))} disabled={value >= 8}>+</StepBtn>
    </span>
  );
}

function StepBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-full border border-hairline text-[16px] text-mist transition-colors hover:border-hairline-strong hover:text-snow disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Method({ active, onClick, label, sub, icon }: { active: boolean; onClick: () => void; label: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <button onClick={onClick} className="block w-full text-left">
      <Card hover className={cn("flex items-center gap-3 p-3.5", active && "border-azure/55")}>
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] text-snow">{label}</span>
          {sub && <span className="block text-[11.5px] text-mist-dim">{sub}</span>}
        </span>
        <Radio active={active} />
      </Card>
    </button>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={muted ? "text-mist-dim" : "text-mist"}>{label}</dt>
      <dd className={`tnum ${muted ? "text-mist-dim" : "text-mist"}`}>{value}</dd>
    </div>
  );
}
