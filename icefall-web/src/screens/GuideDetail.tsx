import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Check, Globe, Languages, Lock, MapPin, Mountain, ShieldCheck } from "lucide-react";
import { Container } from "@/components/Shell";
import { Badge, Button, Card, GuidePhoto, Label, Rating, VerifiedTick } from "@/components/ui";
import { guideById, verificationSentence } from "@/data/demo";
import { useAuth } from "@/lib/auth";
import { formatEur, priceBooking } from "@/money/model";

/**
 * A guide's listing.
 *
 * The Airbnb detail pattern: a wide left column of substance, a sticky right
 * column that books. What differs is the honesty — the verified line says what
 * ICEFALL actually checked, the price shows the service fee added on top rather
 * than hidden, and messaging is only promised AFTER a booking, never before.
 */
export default function GuideDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { requireAuth } = useAuth();
  const guide = guideById(id ?? "");
  if (!guide) return <Navigate to="/guides" replace />;

  // Indicative: a real quote spans the trip. One day, so the fee maths is legible.
  const pricing = priceBooking(guide.dayRate);

  return (
    <Container className="py-10">
      {/* ---- Header ------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-4">
        <GuidePhoto name={guide.name} src={guide.photo} size={72} />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[26px] font-light text-snow">
            {guide.name}
            <VerifiedTick verifiedOn={guide.verifiedOn} size={18} />
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-mist">
            <span className="flex items-center gap-1.5">
              <MapPin size={13} strokeWidth={1.7} className="text-mist-dim" />
              {guide.basedIn}
            </span>
            <Rating value={guide.rating} reviews={guide.reviews} />
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
        {/* ---- Left: substance ------------------------------------------- */}
        <div>
          <img
            src={`/img/${guide.heroPeak}.jpg`}
            alt=""
            aria-hidden
            className="h-72 w-full rounded-card border border-hairline object-cover"
          />

          <h2 className="mt-8 text-[17px] font-light text-snow">{guide.headline}</h2>

          <div className="mt-5 grid grid-cols-2 gap-4 border-y border-hairline py-5 sm:grid-cols-4">
            <Fact label="Guiding since" value={String(new Date().getFullYear() - guide.yearsGuiding)} />
            <Fact label="Years" value={String(guide.yearsGuiding)} />
            <Fact label="Day rate" value={formatEur(guide.dayRate)} />
            <Fact label="Reviews" value={String(guide.reviews)} />
          </div>

          <section className="mt-7">
            <Label>Mountains</Label>
            <div className="mt-3 flex flex-wrap gap-2">
              {guide.mountains.map((m) => (
                <Badge key={m}>
                  <Mountain size={11} strokeWidth={1.7} />
                  {m}
                </Badge>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <Label>Languages</Label>
            <p className="mt-3 flex items-center gap-2 text-[13.5px] text-mist">
              <Languages size={14} strokeWidth={1.7} className="text-mist-dim" />
              {guide.languages.join(" · ")}
            </p>
          </section>

          <section className="mt-7">
            <Label>What ICEFALL checked</Label>
            <Card className="mt-3 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck size={17} strokeWidth={1.6} className="mt-px shrink-0 text-azure" />
                <p className="text-[13px] leading-relaxed text-mist">{verificationSentence(guide.verifiedOn)}</p>
              </div>
              <p className="mt-3 border-t border-hairline pt-3 text-[11.5px] leading-relaxed text-mist-dim">
                We read the licence, insurance and first-aid certificate. We did not contact the
                issuing association, and we make no judgement about whether this is the right guide
                for your objective — ask to see the carnet before you climb.
              </p>
            </Card>
          </section>
        </div>

        {/* ---- Right: the booking panel ---------------------------------- */}
        <aside>
          <div className="sticky top-24">
            <Card className="p-5">
              <div className="flex items-baseline justify-between">
                <span className="tnum text-[22px] font-light text-snow">
                  {formatEur(guide.dayRate)}
                  <span className="text-[13px] text-mist-dim"> / day</span>
                </span>
                <Rating value={guide.rating} reviews={guide.reviews} />
              </div>

              {/* Price transparency: the service fee is ADDED, shown, never buried. */}
              <dl className="mt-4 space-y-2 border-t border-hairline pt-4 text-[13px]">
                <Line label="Guiding, one day" value={formatEur(pricing.guideFee)} />
                <Line label="ICEFALL service fee" value={formatEur(pricing.serviceFee)} muted />
                <div className="flex items-baseline justify-between border-t border-hairline pt-2.5">
                  <dt className="text-snow">Total, per day</dt>
                  <dd className="tnum text-[15px] text-snow">{formatEur(pricing.total)}</dd>
                </div>
              </dl>

              <Button
                size="lg"
                className="mt-5 w-full"
                onClick={() => requireAuth(() => navigate(`/book/${guide.id}`))}
              >
                Check dates &amp; book
              </Button>

              <div className="mt-4 flex items-start gap-2.5 rounded-tile border border-hairline bg-obsidian/40 p-3">
                <Lock size={14} strokeWidth={1.7} className="mt-px shrink-0 text-mist-dim" />
                <p className="text-[11.5px] leading-relaxed text-mist-dim">
                  Your money is held until the day you meet. Free cancellation up to 14 days before
                  you start.
                </p>
              </div>

              <div className="mt-3 flex items-start gap-2.5 rounded-tile border border-hairline bg-obsidian/40 p-3">
                <Check size={14} strokeWidth={2} className="mt-px shrink-0 text-mist-dim" />
                <p className="text-[11.5px] leading-relaxed text-mist-dim">
                  You can message {guide.name.split(" ")[0]} once your booking is confirmed — it keeps
                  every arrangement on the record.
                </p>
              </div>
            </Card>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-mist-dim">
              <Globe size={11} strokeWidth={1.7} />
              Demonstration listing — nothing here is charged.
            </p>
          </div>
        </aside>
      </div>
    </Container>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <p className="tnum mt-1.5 text-[16px] font-light text-snow">{value}</p>
    </div>
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
