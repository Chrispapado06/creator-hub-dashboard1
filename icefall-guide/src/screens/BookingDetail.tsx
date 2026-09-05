import { Link, useParams } from "react-router-dom";
import { ChevronLeft, MessageCircle } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Card, StatusPill } from "@/components/ui/primitives";
import { PersonAvatar, Photo } from "@/components/Photo";
import { fold } from "@/domain/honesty";
import { bookingBreakdown, stagedBookings } from "@/domain/season";
import { fmtRange } from "@/data/demo";
import { GUIDE_COMMISSION_PCT, formatEur } from "@/money/model";

/** One booking, its people, and exactly what it pays. */
export default function BookingDetail() {
  const { id } = useParams();
  const b = stagedBookings().find((x) => x.id === id);

  if (!b) {
    return (
      <Screen>
        <div className="pt-8">
          <Link to="/" className="inline-flex items-center gap-1 text-[12.5px] text-mist">
            <ChevronLeft size={16} strokeWidth={1.7} /> Home
          </Link>
          <Card className="mt-5">
            <p className="text-[12.5px] text-mist">That booking is not on this device.</p>
          </Card>
        </div>
      </Screen>
    );
  }

  /**
   * A CANCELLED BOOKING PAYS NOTHING, and this screen said otherwise.
   *
   * It printed "Booking value €390 · ICEFALL 15% −€58.50 · You receive €331.50"
   * against a booking that `earningsSplit` deliberately excludes from every
   * total — so the one screen showing a single booking contradicted every
   * screen that adds them up, and told a guide they were owed money nobody
   * owes them. Payouts had already been fixed to say this; the fix never
   * travelled here (§6e — a rule applied at one reader is not applied at the
   * others).
   */
  const cancelled = b.state === "cancelled";
  const breakdown = bookingBreakdown(b);

  return (
    <Screen padded={false}>
      <Stagger>
        <Rise className="relative">
          <Photo peak={b.peak} alt="" className="h-40 w-full" rounded="rounded-none" />
          <div className="scrim-bottom absolute inset-x-0 bottom-0 h-24" />
          <Link
            to="/"
            aria-label="Back"
            className="absolute left-4 top-6 grid h-9 w-9 place-items-center rounded-full bg-obsidian/70 text-snow backdrop-blur"
          >
            <ChevronLeft size={20} strokeWidth={1.8} />
          </Link>
        </Rise>

        <Rise className="px-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[19px] font-light text-snow">{b.title}</h1>
              <p className="tnum mt-1 text-[12.5px] text-mist">{fmtRange(b.from, b.to)}</p>
              <p className="mt-0.5 text-[12px] text-mist-dim">{b.grade}</p>
            </div>
            <StatusPill
              state={
                b.state === "pending"
                  ? "pending"
                  : b.state === "cancelled"
                    ? "cancelled"
                    : b.state === "complete"
                      ? "complete"
                      : "confirmed"
              }
            />
          </div>
        </Rise>

        <Rise className="px-5 pt-5">
          <p className="section-label">Your money</p>
          <Card className="mt-3">
            {cancelled ? (
              <p className="text-[12px] leading-relaxed text-mist-dim">
                Cancelled — nothing is due on this booking, and it is not counted in your earnings.
              </p>
            ) : (
              fold(
                breakdown,
                (t) => (
                  <>
                    <dl className="space-y-1.5 text-[12.5px]">
                      <Row label="Booking value" value={formatEur(t.total)} />
                      <Row
                        label={
                          t.passedThrough > 0
                            ? `ICEFALL ${GUIDE_COMMISSION_PCT}% of your ${formatEur(t.commissionable)} fee`
                            : `ICEFALL ${GUIDE_COMMISSION_PCT}%`
                        }
                        value={`−${formatEur(t.commission)}`}
                        dim
                      />
                      <Row label="You receive" value={formatEur(t.guideReceives)} strong />
                    </dl>
                    {t.passedThrough > 0 && (
                      <p className="mt-2.5 border-t border-hairline pt-2.5 text-[11px] leading-relaxed text-mist-dim">
                        {formatEur(t.passedThrough)} of that is huts, lifts and permits you pay on.
                        ICEFALL takes no commission on those — only on your fee.
                      </p>
                    )}
                  </>
                ),
                (reason) => <p className="text-[12.5px] leading-relaxed text-mist-dim">{reason}</p>,
              )
            )}
          </Card>
        </Rise>

        <Rise className="px-5 pb-3 pt-5">
          <p className="section-label">Who is coming</p>
          <Card className="mt-3" inset={false}>
            <ul className="divide-y divide-hairline">
              {b.clients.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/client/${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
                  >
                    <PersonAvatar name={c.name} size={36} online={c.online} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-snow">{c.name}</span>
                      <span className="block truncate text-[11.5px] text-mist-dim">{c.from}</span>
                    </span>
                    <MessageCircle size={16} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
                  </Link>
                </li>
              ))}
              {b.clients.length === 0 && (
                <li className="px-4 py-4 text-center text-[12.5px] text-mist-dim">
                  Nobody is on this booking yet.
                </li>
              )}
            </ul>
          </Card>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Row({
  label,
  value,
  dim,
  strong,
}: {
  label: string;
  value: string;
  dim?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={dim ? "text-mist-dim" : "text-mist"}>{label}</dt>
      <dd
        className={`tnum ${strong ? "text-[14px] text-snow" : dim ? "text-mist-dim" : "text-mist"}`}
      >
        {value}
      </dd>
    </div>
  );
}
