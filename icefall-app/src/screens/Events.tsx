import { Navigate, useParams } from "react-router-dom";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { DifficultyDots, EventCard, HeroImage } from "@/components/domain/cards";
import { fmtDate, fmtPrice } from "@/lib/format";
import { sync } from "@/services/repository";

/** Screen 13 — ICEFALL events. */
export default function Events() {
  return (
    <Screen>
      <Stagger className="space-y-3 pt-5">
        {/*
          Said once, at the top, before any of it is read.

          Every listing below is invented — dates, prices, locations, the number
          of places "left" and the difficulty. They were written to show what the
          events surface will look like. Without this the page reads as a real
          programme with real scarcity, and the detail screen's certified-guide
          line reads as a real assurance.
        */}
        <Rise>
          <Disclaimer>
            Demonstration listings. None of these events exists: the dates, prices, locations,
            remaining places and difficulty ratings were invented for this build, no guide has been
            engaged for any of them, and none can be booked or attended.
          </Disclaimer>
        </Rise>
        {sync.events.map((e) => (
          <Rise key={e.id}>
            <EventCard event={e} />
          </Rise>
        ))}
      </Stagger>
    </Screen>
  );
}

export function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const event = id ? sync.eventById(id) : undefined;

  if (!event) return <Navigate to="/explore/events" replace />;

  const full = event.spotsLeft === 0;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title={event.title}
          subtitle={`${event.location}, ${event.country}`}
          back="/explore/events"
        />
      </div>

      <Stagger className="px-5">
        <Rise>
          <HeroImage src={event.photo} alt={event.title} ratio="aspect-[16/10]">
            {event.privateOnly && (
              <Badge tone="azure" className="self-start">
                ICEFALL Private
              </Badge>
            )}
          </HeroImage>
        </Rise>

        <Rise className="pt-5">
          <p className="text-[13px] leading-relaxed text-mist">{event.summary}</p>
        </Rise>

        <Rise className="pt-6">
          <Card>
            <dl className="space-y-3 text-[13px]">
              <Row label="Date" value={fmtDate(event.date)} />
              <Row label="Duration" value={event.durationLabel} />
              <Row label="Capacity" value={`${event.capacity} places`} />
              <Row
                label="Availability"
                value={full ? "Fully booked" : `${event.spotsLeft} remaining`}
              />
              <Row
                label="Price"
                value={event.priceEur === null ? "By invitation" : fmtPrice(event.priceEur)}
              />
            </dl>
            <div className="mt-4 flex items-center justify-between border-t border-hairline pt-4">
              <span className="section-label">Difficulty</span>
              <DifficultyDots level={event.difficulty} />
            </div>
          </Card>
        </Rise>

        {event.requirements.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Requirements</SectionLabel>
            <Card className="mt-3">
              <ul className="space-y-2.5">
                {event.requirements.map((r) => (
                  <li key={r} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                    {r}
                  </li>
                ))}
              </ul>
            </Card>
          </Rise>
        )}

        {/*
          THE BUTTON IS DISABLED BECAUSE THERE IS NOTHING BEHIND IT.

          It had no handler at all: pressing it recorded nothing, notified
          nobody and left no trace, while the line beneath promised the place
          would be "confirmed by email". Someone would have turned up to a
          mountain expecting a booking that never existed. Until there is a
          registration backend, the control states plainly that it does not work.
        */}
        <Rise className="pt-6">
          <Button size="lg" className="w-full" disabled>
            {full ? "Fully booked" : "Booking not available"}
          </Button>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-mist-dim">
            ICEFALL cannot take bookings yet. Nothing is reserved, no payment is taken and no email
            is sent — this page shows what an event listing will look like.
          </p>
        </Rise>

        <Rise className="pt-5">
          <Disclaimer>
            Demonstration listing. This event was invented for this build — the date, price,
            location, remaining places and difficulty are not real, no guide has been engaged for
            it, and it cannot be attended.
          </Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-mist-dim">{label}</dt>
      <dd className="text-right text-snow">{value}</dd>
    </div>
  );
}
