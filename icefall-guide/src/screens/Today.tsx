import { Link } from "react-router-dom";
import { ArrowRight, CalendarRange, Clock } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Badge, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Notice } from "@/components/guide";
import { Provenance, StatTile } from "@/components/Figure";
import { GUIDE_NOTICES, excludedNote, fold } from "@/domain/honesty";
import { guideSummary } from "@/domain/season";
import { DEMO_NOTICE, ME, APPLICATION, eur, fmtRange, fmtDate } from "@/data/demo";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { formatEur } from "@/money/model";
import { STATUS_COPY, effectiveStatus, expiringSoon } from "@/data/model";

/**
 * TODAY — the four questions a guide opens this app to answer.
 *
 *   1. What have I earned, and what is coming?
 *   2. Who is waiting on a reply from me?
 *   3. How am I doing on the marketplace?
 *   4. When am I free?
 *
 * In that order, because that is the order a self-employed person cares about
 * them, and because the one at the top is the one they came for.
 *
 * EVERY NUMBER HERE IS A CLAIM ABOUT THIS PERSON'S OWN LIVELIHOOD, which is why
 * the screen is built on `Reading` rather than on numbers. Where ICEFALL cannot
 * measure something, the sentence saying so takes the space the figure would
 * have had. Three things on this screen are currently unmeasurable and all three
 * say so rather than showing a zero: profile views, the enquiry funnel, and the
 * earnings history.
 *
 * WHAT WAS REMOVED FROM THIS SCREEN ON 2026-08-29, and why it mattered:
 *
 *   · A FIVE-MONTH EARNINGS BAR CHART, drawn from a hardcoded array, footnoted
 *     "Nothing has been paid through ICEFALL yet". The footnote was true and the
 *     chart was not — and a reader takes the shape before the caption. No money
 *     has ever moved through ICEFALL and there is no payments ledger anywhere in
 *     the family, so the series could not have been derived from anything.
 *
 *   · A "BOOKED" TILE showing `Σ taken × priceEur` across the openings — the
 *     gross face value of every seat sold, presented beside a commission this
 *     app was deducting at the wrong rate. It answered no question a guide asks:
 *     it was not what they had been paid, not what was coming, and not net of
 *     anything. Replaced by the two figures they actually plan against.
 *
 *   · A GREETING THAT ASSUMED A GUIDE. `ME` is null in any build without the
 *     demo flag, and the screen now says so instead of reading a name off it.
 */
export default function Today() {
  const s = guideSummary();
  const status = effectiveStatus(APPLICATION);
  const copy = STATUS_COPY[status];
  const soon = expiringSoon(APPLICATION);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Screen>
      <Stagger>
        {/* ---- Who is reading ---------------------------------------------- */}
        <Rise className="pb-5 pt-7">
          {ME ? (
            <>
              <p className="section-label">{ME.basedIn}</p>
              <h1 className="display mt-2.5 text-[30px] text-snow">
                {greeting},<br />
                {ME.name.split(" ")[0]}.
              </h1>
            </>
          ) : (
            <>
              <p className="section-label">ICEFALL Guide</p>
              <h1 className="display mt-2.5 text-[30px] text-snow">{greeting}.</h1>
              <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
                No guide account is signed in on this device, so there is nothing here yet.
              </p>
              <Link
                to="/welcome"
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-azure"
              >
                Sign in or apply to guide <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            </>
          )}
        </Rise>

        {SHOW_DEMO_DATA && ME && (
          <Rise>
            <Disclaimer>{DEMO_NOTICE}</Disclaimer>
          </Rise>
        )}

        {/* ---- The one thing that needs doing ------------------------------- */}
        {ME && status !== "approved" ? (
          <Rise className="pt-5">
            <Notice tone={copy.tone === "bad" ? "danger" : "alert"}>
              <p className="text-snow">{copy.label}</p>
              <p className="mt-1.5">{copy.says}</p>
              <Link
                to="/verification"
                className="mt-2.5 inline-flex items-center gap-1.5 text-azure"
              >
                Open verification <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            </Notice>
          </Rise>
        ) : ME && soon.length > 0 ? (
          <Rise className="pt-5">
            <Notice tone="alert">
              <p className="text-snow">A document expires soon</p>
              <p className="mt-1.5">
                Your listing hides itself the day after it expires. Replace it before then and nothing is
                interrupted.
              </p>
              <Link
                to="/verification"
                className="mt-2.5 inline-flex items-center gap-1.5 text-azure"
              >
                Review documents <ArrowRight size={13} strokeWidth={1.8} />
              </Link>
            </Notice>
          </Rise>
        ) : null}

        {/* ---- 1. What have I earned, and what is coming? ------------------- */}
        <Rise className="pt-7">
          <SectionLabel>Your money</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <StatTile
              label="Coming"
              reading={s.earnings.coming}
              format={formatEur}
              href="/payouts"
              footnote={
                excludedNote(s.earnings.coming, s.earnings.comingExcluded) ??
                (s.earnings.coming.available ? "Held until each party walks in." : undefined)
              }
            />
            <StatTile
              label="Paid out"
              reading={s.earnings.paidOut}
              format={formatEur}
              href="/payouts"
              footnote={excludedNote(s.earnings.paidOut, s.earnings.paidOutExcluded)}
            />
          </div>
          {(s.earnings.coming.available || s.earnings.paidOut.available) && (
            <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
              {GUIDE_NOTICES.EARNINGS_ARE_NET}
            </p>
          )}

          {s.next && (
            <Card className="mt-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="section-label">Next on the hill</p>
                  <p className="mt-1.5 truncate text-[14px] text-snow">{s.next.peak}</p>
                  <p className="tnum mt-0.5 text-[11.5px] text-mist-dim">
                    {s.next.client} · {fmtDate(s.next.departureIso)}
                  </p>
                </div>
                <Badge tone={s.next.payout === "releasable" ? "summit" : "neutral"}>
                  {s.next.payout === "releasable" ? "Ready" : "Held"}
                </Badge>
              </div>
            </Card>
          )}
        </Rise>

        {/* ---- 2. Who is waiting on a reply from me? ------------------------ */}
        <Rise className="pt-7">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Waiting on you</SectionLabel>
            <Link to="/enquiries" className="text-[11px] text-azure">
              All clients
            </Link>
          </div>

          {s.waiting.longestHours !== null && (
            <p className="tnum mt-2 text-[11px] text-mist-dim">
              Longest a client has waited: {s.waiting.longestHours} h
            </p>
          )}

          <div className="mt-3 space-y-2.5">
            {s.waiting.enquiries.map((e) => (
              <Card key={e.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] text-snow">{e.client}</p>
                    <p className="mt-0.5 text-[11.5px] text-mist-dim">
                      {e.peak} · {e.dates}
                    </p>
                  </div>
                  <Badge tone={e.hours > 12 ? "danger" : "alert"}>
                    <Clock size={10} strokeWidth={2} />
                    {e.hours} h
                  </Badge>
                </div>
                <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-mist">
                  “{e.message}”
                </p>
              </Card>
            ))}
            {s.waiting.enquiries.length === 0 && (
              <Card>
                <p className="py-3 text-center text-[13px] text-mist-dim">
                  {s.market.enquiries.available && s.market.enquiries.value > 0
                    ? "Nothing waiting. Everyone has had an answer."
                    : "No client has written to you yet."}
                </p>
              </Card>
            )}
          </div>
        </Rise>

        {/* ---- 3. How am I doing on the marketplace? ------------------------ */}
        <Rise className="pt-7">
          <SectionLabel>On the marketplace</SectionLabel>
          <Card className="mt-3">
            <div className="grid grid-cols-2 gap-2.5">
              <StatTile label="Profile views" reading={s.market.views} format={String} />
              <StatTile
                label="Enquiries"
                reading={s.market.enquiries}
                format={String}
                href="/enquiries"
              />
              {/*
                ONE TILE, NOT TWO. The count and the rate answer the same
                question, and when neither can be attributed they carry the SAME
                sentence — two tiles would have stacked one explanation on top of
                an identical one, which reads as padding and teaches the reader
                to skip both.
              */}
              <StatTile
                label="Became a booking"
                reading={s.market.booked}
                format={String}
                footnote={fold(
                  s.market.conversion,
                  (v) => `${Math.round(v * 100)}% of your enquiries`,
                  () => undefined,
                )}
              />
            </div>
            <Provenance>{s.market.provenance}</Provenance>
          </Card>
        </Rise>

        {/* ---- 4. When am I free? ------------------------------------------- */}
        <Rise className="pt-7">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Your dates</SectionLabel>
            <Link to="/openings" className="text-[11px] text-azure">
              Manage
            </Link>
          </div>

          {s.dates.emptyReason ? (
            <Card className="mt-3">
              <p className="text-[12.5px] leading-relaxed text-mist">{s.dates.emptyReason}</p>
              <Link
                to="/openings"
                className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-azure"
              >
                <CalendarRange size={13} strokeWidth={1.8} />
                Open a date
              </Link>
            </Card>
          ) : (
            <>
              <p className="tnum mt-2 text-[11px] text-mist-dim">
                {s.dates.placesFree === 0
                  ? `${s.dates.live.length} live ${s.dates.live.length === 1 ? "date" : "dates"} · every place taken`
                  : `${s.dates.placesFree} ${s.dates.placesFree === 1 ? "place" : "places"} still open across ${s.dates.live.length} ${s.dates.live.length === 1 ? "date" : "dates"}`}
              </p>
              <Card className="mt-3" inset={false}>
                <ul className="divide-y divide-hairline">
                  {s.dates.live.slice(0, 3).map((o) => (
                    <li
                      key={o.id}
                      className="flex items-baseline justify-between gap-3 px-4 py-3.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] text-snow">{o.peak}</p>
                        <p className="tnum mt-0.5 text-[11.5px] text-mist-dim">
                          {fmtRange(o.from, o.to)} · {eur(o.priceEur)} per person
                        </p>
                      </div>
                      <span className="tnum shrink-0 text-[12px] text-mist">
                        {o.taken}/{o.places}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </Rise>

        {/* ---- The chart that is not here ------------------------------------ */}
        <Rise className="pt-7 pb-2">
          <SectionLabel>Your fee, by month</SectionLabel>
          <Card className="mt-3">
            <p className="text-[12.5px] leading-relaxed text-mist">
              {GUIDE_NOTICES.EARNINGS_HISTORY_NOT_RECORDED}
            </p>
          </Card>
        </Rise>
      </Stagger>
    </Screen>
  );
}
