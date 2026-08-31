import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, Check, Compass, Download, Mountain as MountainIcon, Route, SlidersHorizontal, X } from "lucide-react";
import { Button, Card, PageHead, Pill, SectionLabel } from "@/components/ui";
import { Resolve } from "@/components/states";
import { getBookingAgreement, listAuditEvents, listBookingsDetailed, type BookingDetailed } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { AuditEvent, BookingAgreement } from "@/data/types";
import { cn, formatDay, formatMoment } from "@/lib/utils";
import { BOOKINGS_MOCKUP, type MockBookingRow } from "@/demo/mockupScreens";
import { GOLD, GOLD_HOVER } from "@/components/drawn";

/**
 * Bookings — ONE screen, the owner's drawn layout, two data sources (their 31
 * Aug ruling: the mockups ARE the production design). Master list of spaced
 * card rows on the left, the selected booking's detail on the right, exactly
 * as drawn. SHOW_DEMO_DATA fills the drawing's sample figures; flag off, every
 * number comes from a stored row and the honest states render inside the same
 * layout. The old parallel demo face was deleted with the fork (§6u).
 *
 * THE RATE IS NEVER A CONSTANT in live mode. The mockup prints "(15%)" on
 * every line; the guide rate genuinely is 15% today — and it was 10% this
 * morning, which is exactly why live percentages come from the COMMISSION
 * ROW's `rate_bps`, copied at conversion and frozen. A booking with no
 * commission row shows no percentage at all.
 *
 * THE AGREEMENT TAB: a booking WITH a booking_agreements row shows exactly
 * what the customer saw (pinned text, immutable including to staff); one
 * WITHOUT shows the absence honestly — a fabricated agreement record is worse
 * than a missing one. The drawn checklist renders on sample figures only.
 *
 * Other honest rows, live: customer payments are not recorded (no processor —
 * `value_status` is what is known about the value, never a payment claim);
 * party size is not in the schema ("—", not a number); ids are real and
 * shortened.
 */

type Tab = "guide" | "mountain" | "trek";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "guide", label: "Guide Bookings", icon: <Compass size={16} strokeWidth={2} /> },
  { id: "mountain", label: "Expedition Mountains", icon: <MountainIcon size={16} strokeWidth={2} /> },
  { id: "trek", label: "Expedition Treks", icon: <Route size={16} strokeWidth={2} /> },
];

const inTab = (b: BookingDetailed, t: Tab) =>
  t === "guide" ? b.kind === "guide" : b.kind === "expedition" && (b.destination_kind ?? "mountain") === t;

const eur = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;
const bps = (n: number) => `${(n / 100).toFixed(n % 100 === 0 ? 0 : 1)}%`;

const statusTone = (s: string): "green" | "amber" | "red" | "neutral" =>
  /cancel|refus|lost/.test(s) ? "red" : /complete|confirm|paid/.test(s) ? "green" : "amber";

/** What is KNOWN about the money, never a payment claim. */
function valueLabel(b: BookingDetailed): { main: string; sub: string } {
  if (b.value_cents === null) return { main: "no value yet", sub: b.value_status };
  return { main: eur(b.value_cents), sub: b.value_status };
}

function commissionOf(b: BookingDetailed): { cents: number; rate: string | null } | null {
  if (b.commissions.length === 0) return null;
  const cents = b.commissions.reduce((s, c) => s + c.amount_cents, 0);
  const rates = [...new Set(b.commissions.map((c) => c.rate_bps).filter((r): r is number => r !== null))];
  return { cents, rate: rates.length === 1 ? bps(rates[0]) : null };
}

function Photo({ id, size }: { id: string | null; size: string }) {
  const [gone, setGone] = useState(false);
  if (!id || gone) return <span className={cn(size, "shrink-0 rounded-[10px] bg-panel")} aria-hidden />;
  return (
    <img
      src={`/img/destinations/${id}.jpg`}
      alt=""
      className={cn(size, "shrink-0 rounded-[10px] object-cover")}
      onError={() => setGone(true)}
    />
  );
}

function MoneyTile({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] font-medium text-muted">{label}</p>
      {value === null ? (
        <p className="mt-0.5 text-[12px] leading-snug text-faint">{sub}</p>
      ) : (
        <>
          <p className="tnum truncate text-[17px] font-extrabold text-ink">{value}</p>
          {sub && <p className="text-[10.5px] text-faint">{sub}</p>}
        </>
      )}
    </div>
  );
}

/** One list row, from either source. */
interface ListRow {
  id: string;
  photo: string | null;
  trip: string;
  line2: string;
  line3: string;
  customer: string;
  customerSub: string;
  dates: string;
  party: string;
  amountMain: string;
  amountSub: string;
  commMain: string;
  commSub: string;
  status: string;
  tone: "green" | "amber" | "red" | "neutral";
}

/**
 * THE detail panel — one component, two data sources. `sample` carries the
 * drawing's fixture; with it set, no reads fire and the drawn checklist pane
 * renders. Without it, everything derives from the stored row, agreement
 * record included.
 */
function DetailPanel({ b, sample, onClose }: {
  b: BookingDetailed | null;
  sample: { row: MockBookingRow; d: NonNullable<typeof BOOKINGS_MOCKUP>["detail"] | null } | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"agreement" | "payments" | "messages" | "activity">("agreement");
  const [audit, setAudit] = useState<Result<AuditEvent[]>>(loading);
  const [agreement, setAgreement] = useState<Result<BookingAgreement | null>>(loading);
  useEffect(() => {
    if (!b) return; // sample mode reads nothing
    void listAuditEvents(200).then(setAudit);
    void getBookingAgreement(b.id).then(setAgreement);
  }, [b?.id, b]);

  const commission = b ? commissionOf(b) : null;
  const value = b ? valueLabel(b) : null;
  const title = sample ? sample.row.trip : (b!.product_name ?? b!.destination_name ?? "Booking");
  const photoId = sample ? sample.row.destination_id : b!.destination_id;
  const statusText = sample ? sample.row.status : b!.status;
  const tone = sample
    ? sample.row.status === "CONFIRMED" ? "green" : sample.row.status === "PENDING" ? "amber" : "red"
    : statusTone(b!.status);
  // Company earnings are DERIVED and say so: value minus ICEFALL's stored
  // commission. Both parts must exist or the tile carries the reason instead.
  const earnings =
    b && b.value_cents !== null && commission !== null ? b.value_cents - commission.cents : null;

  const events = audit.state === "ok" && b ? audit.value.filter((e) => e.entity_id === b.id) : null;
  const sd = sample?.d ?? null;

  return (
    <Card pad={false} className="overflow-hidden">
      <div className="relative">
        <Photo id={photoId} size="h-44 w-full !rounded-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/30" aria-hidden />
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-3 flex items-center gap-1.5 text-[12.5px] font-medium text-white/90 hover:text-white"
        >
          <ArrowLeft size={14} strokeWidth={2.25} /> Back to bookings
        </button>
        <div className="absolute right-3 top-3 flex items-center gap-2">
          <span className="rounded-[9px] bg-black/45 px-3 py-1.5 text-[12px] font-medium text-white">More actions ▾</span>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full bg-black/35 text-white hover:bg-black/50">
            <X size={14} strokeWidth={2.25} />
          </button>
        </div>
        <div className="absolute bottom-3 left-4 right-4">
          <p className="flex items-center gap-2 text-[20px] font-extrabold text-white">
            {title}
            <Pill tone={tone}>{statusText}</Pill>
          </p>
          <p className="text-[12px] font-medium text-white/85">
            {sample
              ? "Guide Booking"
              : `${b!.kind === "guide" ? "Guide booking" : "Expedition booking"}${b!.company_name ? ` · ${b!.company_name}` : ""}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-b border-line-soft px-5 py-4 sm:grid-cols-5">
        {sd ? (
          sd.tiles.map(([label, v]) => (
            <div key={label} className="min-w-0">
              <p className="text-[11.5px] font-medium text-muted">{label}</p>
              <p className="tnum truncate text-[17px] font-extrabold text-ink">{v}</p>
            </div>
          ))
        ) : b ? (
          <>
            <MoneyTile label="Recorded value" value={value!.main === "no value yet" ? null : value!.main} sub={value!.sub} />
            <MoneyTile
              label={commission?.rate ? `ICEFALL Commission (${commission.rate})` : "ICEFALL Commission"}
              value={commission ? eur(commission.cents) : null}
              sub={commission ? b.commissions.map((c) => c.status).join(", ") : "none recorded yet"}
            />
            <MoneyTile
              label="Company earnings"
              value={earnings !== null ? eur(earnings) : null}
              sub={earnings !== null ? "derived: value − commission" : "needs a value and a commission"}
            />
            <MoneyTile
              label="Pass-through costs"
              value={b.pass_through_state === "stated" && b.pass_through_cents !== null ? eur(b.pass_through_cents) : null}
              sub={
                b.pass_through_state === "none"
                  ? "none — the company passes nothing through"
                  : b.pass_through_state === "unknown"
                    ? "not stated by the company yet"
                    : "permits & fees, excluded from the commission basis"
              }
            />
            <MoneyTile label="Total recorded" value={value!.main === "no value yet" ? null : value!.main} sub="the booking's stored value" />
          </>
        ) : (
          <p className="col-span-full text-[12px] text-faint">Sample booking — money tiles fill from the drawn primary booking only.</p>
        )}
      </div>

      <div className="grid gap-4 px-5 py-4 lg:grid-cols-3">
        <div>
          <SectionLabel>Customer</SectionLabel>
          {sd ? (
            <>
              <p className="mt-2 text-[13.5px] font-semibold text-ink">{sd.customer.name}</p>
              <p className="text-[12px] text-muted">{sd.customer.email}</p>
              <p className="text-[12px] text-muted">{sd.customer.phone}</p>
              <span className="mt-2 inline-block rounded-pill border border-line px-3.5 py-1.5 text-[12px] font-medium text-ink">View customer</span>
            </>
          ) : sample ? (
            <>
              <p className="mt-2 text-[13.5px] font-semibold text-ink">{sample.row.customer}</p>
              <p className="text-[12px] text-muted">{sample.row.email}</p>
              <span className="mt-2 inline-block rounded-pill border border-line px-3.5 py-1.5 text-[12px] font-medium text-ink">View customer</span>
            </>
          ) : (
            <>
              <p className="mt-2 text-[13.5px] font-semibold text-ink">{b!.customer_name ?? "No account linked"}</p>
              <p className="text-[11.5px] text-faint">email lives in the auth system, not on this record</p>
              {b!.customer_id && (
                <Link to="/admin/users" className="mt-2 inline-block text-[12px] font-medium text-accent-ink hover:underline">
                  View customer
                </Link>
              )}
            </>
          )}
        </div>
        <div>
          <SectionLabel>Booking details</SectionLabel>
          <dl className="mt-2 space-y-1.5 text-[12.5px]">
            {sd ? (
              sd.details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="tnum text-right font-medium text-ink">{v}</dd></div>
              ))
            ) : sample ? (
              <>
                <div className="flex justify-between gap-3"><dt className="text-muted">Trip</dt><dd className="text-right font-medium text-ink">{sample.row.trip}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Guide</dt><dd className="text-ink">{sample.row.guide}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Where</dt><dd className="text-ink">{sample.row.place}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Party size</dt><dd className="tnum text-ink">{sample.row.party} climbers</dd></div>
              </>
            ) : (
              <>
                <div className="flex justify-between gap-3"><dt className="text-muted">Booking ID</dt><dd className="tnum font-medium text-ink">{b!.id.slice(0, 8)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Booked on</dt><dd className="tnum text-ink">{formatDay(b!.booked_at)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Trip</dt><dd className="text-right text-ink">{b!.product_name ?? "not linked"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{b!.destination_kind === "trek" ? "Trek" : "Mountain"}</dt><dd className="text-ink">{b!.destination_name ?? "not linked"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{b!.kind === "guide" ? "Guide" : "Company"}</dt><dd className="text-ink">{b!.kind === "guide" ? (b!.guide_name ?? "not linked") : (b!.company_name ?? "not linked")}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Party size</dt><dd className="text-faint">not recorded — the schema has no such field yet</dd></div>
              </>
            )}
          </dl>
        </div>
        <div>
          <SectionLabel>Dates</SectionLabel>
          <dl className="mt-2 space-y-1.5 text-[12.5px]">
            {sd ? (
              sd.dates.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="tnum text-right font-medium text-ink">{v}</dd></div>
              ))
            ) : sample ? (
              <div className="flex justify-between gap-3"><dt className="text-muted">Dates</dt><dd className="tnum text-ink">{sample.row.dates}</dd></div>
            ) : (
              <>
                <div className="flex justify-between gap-3"><dt className="text-muted">Start date</dt><dd className="tnum text-ink">{formatDay(b!.starts_on) ?? "not set"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">Completed</dt><dd className="tnum text-ink">{formatDay(b!.completed_at) ?? "not yet"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">End date</dt><dd className="text-faint">not recorded</dd></div>
              </>
            )}
            <div className="flex justify-between gap-3"><dt className="text-muted">Status</dt><dd><Pill tone={tone}>{statusText}</Pill></dd></div>
          </dl>
        </div>
      </div>

      <div className="border-t border-line-soft px-5 pt-2">
        <div className="flex gap-1">
          {(["agreement", "payments", "messages", "activity"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "border-b-2 px-3 py-2 text-[12.5px] font-semibold capitalize",
                tab === t ? "" : "border-transparent text-muted hover:text-ink",
              )}
              style={tab === t ? { color: GOLD_HOVER, borderColor: GOLD } : undefined}
            >
              {t === "activity" ? "Activity log" : t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4">
        {tab === "agreement" && (
          sd ? (
            /* The drawn pane, on sample figures: checklist + policy + disclosures. */
            <div className="grid gap-5 lg:grid-cols-3">
              <div>
                <p className="text-[13px] font-semibold text-ink">Terms Accepted</p>
                <div className="mt-2 space-y-2">
                  {sd.agreement.accepted.map((a) => (
                    <div key={a.label} className="flex items-start gap-2 text-[12.5px]">
                      <Check size={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                      <span><span className="font-medium text-ink">{a.label}</span><span className="block text-[11px] text-faint">{a.on}</span></span>
                    </div>
                  ))}
                </div>
                <span className="mt-3 inline-block rounded-pill border border-line px-3.5 py-1.5 text-[12px] font-medium text-ink">Download all documents</span>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink">Cancellation Policy <span className="font-normal text-muted">(Agreed at time of booking)</span></p>
                <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-ink">
                  {sd.agreement.policy.map((li) => <li key={li} className="flex gap-2"><span className="text-faint">·</span>{li}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink">What Was Disclosed</p>
                <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-ink">
                  {sd.agreement.disclosures.map((li) => <li key={li} className="flex gap-2"><span className="text-faint">·</span>{li}</li>)}
                </ul>
              </div>
            </div>
          ) : sample ? (
            <p className="text-[12.5px] text-faint">Sample booking — the drawn agreement fills on the primary sample only.</p>
          ) : agreement.state === "loading" ? (
            <p className="text-[12.5px] text-faint">Reading the agreement record…</p>
          ) : agreement.state === "ok" && agreement.value !== null ? (
            <div className="grid max-w-4xl gap-5 lg:grid-cols-3">
              <div>
                <p className="text-[13px] font-semibold text-ink">Terms accepted</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                  Version <span className="tnum font-medium text-ink">{agreement.value.terms_version}</span>,
                  accepted {formatMoment(agreement.value.accepted_at)} via {agreement.value.origin_app.replaceAll("_", " ")}.
                </p>
                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-tile bg-panel p-3 text-[12px] leading-relaxed text-ink">
                  {agreement.value.terms_text}
                </p>
              </div>
              <div>
                {/* The owner's own heading, verbatim — rate preservation. */}
                <p className="text-[13px] font-semibold text-ink">
                  Cancellation policy <span className="font-normal text-muted">(Agreed at time of booking)</span>
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">
                  {agreement.value.cancellation_policy}
                </p>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink">What was disclosed</p>
                {agreement.value.disclosures.length === 0 ? (
                  <p className="mt-1.5 text-[12.5px] text-faint">No disclosures were shown.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-ink">
                    {agreement.value.disclosures.map((d, i) => (
                      <li key={i} className="flex gap-2"><span className="text-faint">·</span>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl">
              <p className="text-[13px] font-semibold text-ink">Not recorded</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                No acceptance record exists for this booking — it was made before acceptance
                capture existed{agreement.state !== "ok" ? ", or the record could not be read" : ""}.
                Nothing here assumes today's terms applied: a fabricated agreement record is worse
                than a missing one.
              </p>
            </div>
          )
        )}
        {tab === "payments" && (
          sample ? (
            <p className="text-[12.5px] text-faint">Sample booking — this pane fills from the live record.</p>
          ) : (
            <p className="max-w-2xl text-[12.5px] leading-relaxed text-muted">
              Customer payments are not recorded — ICEFALL has no payment processor, and the payments
              ledger holds company invoice money only. What is known about this booking's value is on
              the tiles above, stated as "{b!.value_status}", never as a payment claim.
            </p>
          )
        )}
        {tab === "messages" && (
          sample ? (
            <p className="text-[12.5px] text-faint">Sample booking — this pane fills from the live record.</p>
          ) : b!.thread_id ? (
            <p className="text-[12.5px] text-muted">
              This booking is linked to a conversation thread. Thread reading arrives with the
              messaging surface; the link is real: <span className="tnum">{b!.thread_id.slice(0, 8)}</span>.
            </p>
          ) : (
            <p className="text-[12.5px] text-muted">No conversation thread is linked to this booking.</p>
          )
        )}
        {tab === "activity" && (
          sample ? (
            <p className="text-[12.5px] text-faint">Sample booking — this pane fills from the live record.</p>
          ) : events === null ? (
            <p className="text-[12.5px] text-faint">Reading the audit log…</p>
          ) : events.length === 0 ? (
            <p className="text-[12.5px] text-muted">
              No audit events name this booking. The log records placement moves, approvals and
              commission decisions; routine reads leave no trace.
            </p>
          ) : (
            <div className="space-y-2">
              {events.map((e) => (
                <p key={e.id} className="text-[12.5px] text-ink">
                  <span className="font-medium">{e.action}</span>
                  <span className="text-faint"> · {formatMoment(e.created_at)}</span>
                </p>
              ))}
            </div>
          )
        )}
      </div>

      {/* The owner's own words, verbatim — drawn by them on two mockups running. */}
      <div className="mx-5 mb-5 rounded-tile bg-accent-soft/60 px-4 py-3">
        <p className="text-[12px] font-semibold text-accent-ink">About views</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-accent-ink/80">
          We do not currently track views, impressions or click-through data. This metric is not
          available.
        </p>
      </div>
    </Card>
  );
}

export default function Bookings() {
  const M = BOOKINGS_MOCKUP;
  const [result, setResult] = useState<Result<BookingDetailed[]>>(loading);
  const [tab, setTab] = useState<Tab>("guide");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(M ? "demo-b1" : null);

  useEffect(() => {
    void listBookingsDetailed().then(setResult);
  }, []);

  const rows = result.state === "ok" ? result.value : null;
  const counts = useMemo(
    () =>
      M
        ? M.counts
        : rows
          ? {
              guide: rows.filter((b) => inTab(b, "guide")).length,
              mountain: rows.filter((b) => inTab(b, "mountain")).length,
              trek: rows.filter((b) => inTab(b, "trek")).length,
            }
          : null,
    [rows, M],
  );

  const shown = useMemo(() => {
    if (M || !rows) return [];
    const q = query.trim().toLowerCase();
    return rows
      .filter((b) => inTab(b, tab))
      .filter(
        (b) =>
          q === "" ||
          [b.product_name, b.destination_name, b.company_name, b.customer_name, b.guide_name]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(q)),
      );
  }, [rows, tab, query, M]);

  /** Both sources shaped into the drawn row. */
  const listRows: ListRow[] = useMemo(() => {
    if (M)
      return M.rows.map((r) => ({
        id: r.id, photo: r.destination_id, trip: r.trip, line2: `Guide: ${r.guide}`, line3: r.place,
        customer: r.customer, customerSub: r.email, dates: r.dates, party: String(r.party),
        amountMain: r.amount, amountSub: "Paid", commMain: r.commission, commSub: "Paid",
        status: r.status, tone: r.status === "CONFIRMED" ? "green" : r.status === "PENDING" ? "amber" : "red",
      }));
    return shown.map((b) => {
      const value = valueLabel(b);
      const commission = commissionOf(b);
      return {
        id: b.id, photo: b.destination_id,
        trip: b.product_name ?? b.destination_name ?? "Booking",
        line2: b.kind === "guide" ? `Guide: ${b.guide_name ?? "not linked"}` : (b.company_name ?? ""),
        line3: b.destination_name ?? "",
        customer: b.customer_name ?? "no account", customerSub: "",
        dates: formatDay(b.starts_on) ?? "no start date", party: "—",
        amountMain: value.main, amountSub: value.sub,
        commMain: commission ? eur(commission.cents) : "—",
        commSub: commission ? (commission.rate ?? "mixed rates") : "no commission",
        status: b.status, tone: statusTone(b.status),
      };
    });
  }, [M, shown]);

  const selLive = !M ? (rows?.find((b) => b.id === selected) ?? null) : null;
  const selSample = M ? (M.rows.find((r) => r.id === selected) ?? null) : null;
  const detailOpen = Boolean(selLive || selSample);

  const list = (
    <div className={cn(detailOpen && "hidden xl:block")}>
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-card border px-4 py-3 text-left",
              tab === t.id ? "border-[oklch(0.72_0.13_60)] bg-butter/40" : "border-line bg-surface hover:bg-raised",
            )}
          >
            <span className={cn("shrink-0", tab === t.id ? "text-[oklch(0.55_0.12_60)]" : "text-faint")}>{t.icon}</span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-medium text-muted">{t.label}</span>
              <span className="tnum block text-[16px] font-extrabold text-ink">{counts ? counts[t.id] : "…"}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${TABS.find((t) => t.id === tab)!.label.toLowerCase()}…`}
          className="h-10 min-w-0 flex-1 rounded-tile border border-line bg-surface px-3.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent"
        />
        <Button variant="secondary"><SlidersHorizontal size={13} strokeWidth={2} /> Filters</Button>
      </div>

      {/* Column labels above SPACED CARD rows — the drawing's list is separate
          rounded cards, not a flush table. Live commission column carries no
          typed rate; the stored one renders per row. */}
      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1.15fr)_0.9fr_0.4fr_0.7fr_0.9fr_86px] items-center gap-2 px-4 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.05em] text-faint">
        <span>Booking</span><span>Customer</span><span>Dates</span><span>Party</span>
        <span className="text-right">Amount Paid</span><span className="text-right">Commission</span><span className="text-right">Status</span>
      </div>
      <div className="space-y-2.5">
        {listRows.map((r) => (
          <button key={r.id} type="button" onClick={() => setSelected(r.id)}
            className={cn("grid w-full grid-cols-[minmax(0,1.7fr)_minmax(0,1.15fr)_0.9fr_0.4fr_0.7fr_0.9fr_86px] items-center gap-2 rounded-tile border px-4 py-2.5 text-left",
              selected === r.id ? "border-accent/40 bg-accent-soft/30" : "border-line-soft bg-raised/60 hover:bg-raised")}>
            <span className="flex min-w-0 items-center gap-3">
              <Photo id={r.photo} size="h-12 w-14" />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold text-ink">{r.trip}</span>
                <span className="block truncate text-[11px] text-muted">{r.line2}</span>
                <span className="block truncate text-[10.5px] text-faint">{r.line3}</span>
              </span>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] text-ink">{r.customer}</span>
              <span className="block truncate text-[10.5px] text-faint">{r.customerSub}</span>
            </span>
            <span className="tnum block text-[11px] leading-snug text-muted">{r.dates.replace(" – ", " –\n")}</span>
            <span className="tnum text-[12px] text-ink">{r.party}</span>
            <span className="text-right">
              <span className="tnum block text-[12.5px] font-semibold text-ink">{r.amountMain}</span>
              <span className="block text-[10.5px] text-faint">{r.amountSub}</span>
            </span>
            <span className="text-right">
              <span className="tnum block text-[12.5px] font-semibold text-ink">{r.commMain}</span>
              <span className="block text-[10.5px] text-faint">{r.commSub}</span>
            </span>
            <span className="justify-self-end"><Pill tone={r.tone}>{r.status}</Pill></span>
          </button>
        ))}
      </div>
      {M ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-[11.5px] text-faint">Showing 1 to 8 of 126 bookings</p>
          <div className="flex items-center gap-1.5">
            <span className="px-1 text-[12.5px] text-faint">‹</span>
            {[1, 2, 3, 4, 5, "…", 16].map((pg, i) =>
              pg === "…" ? (
                <span key={`e${i}`} className="px-1 text-[12.5px] text-faint">…</span>
              ) : (
                <span key={pg} className={pg === 1 ? "grid h-8 w-8 place-items-center rounded-[8px] bg-[oklch(0.72_0.13_60)] text-[12.5px] font-semibold text-white" : "grid h-8 w-8 place-items-center rounded-[8px] text-[12.5px] font-medium text-muted"}>{pg}</span>
              ),
            )}
            <span className="px-1 text-[12.5px] text-faint">›</span>
          </div>
          <span className="text-[12px] text-faint">10 / page</span>
        </div>
      ) : (
        // No invented pagination: every stored row is on this list.
        <p className="mt-3 px-1 text-[11.5px] text-faint">
          Showing all {listRows.length} booking{listRows.length === 1 ? "" : "s"} in this section.
        </p>
      )}
    </div>
  );

  return (
    <>
      <PageHead
        title="Bookings"
        subtitle="All bookings across guides, expeditions and treks."
        actions={
          <div className="flex items-center gap-2.5">
            <Button variant="secondary"><Download size={14} strokeWidth={2} /> Export</Button>
            <span className="relative grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-muted">
              <Bell size={16} strokeWidth={1.9} />
              {/* The count is a figure; only the sample set carries one. */}
              {M && <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-bad text-[9px] font-bold text-white">8</span>}
            </span>
          </div>
        }
      />

      <div className={cn("grid items-start gap-5", detailOpen && "xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]")}>
        {M ? (
          list
        ) : (
          <div className={cn(detailOpen && "hidden xl:block")}>
            <Resolve
              result={result}
              what="bookings"
              isEmpty={(v) => v.length === 0}
              empty="No bookings recorded yet. The first appears here the moment one is — and its commission will carry the rate stored on that day."
            >
              {() => list}
            </Resolve>
          </div>
        )}

        {selSample && M && (
          <DetailPanel
            b={null}
            sample={{ row: selSample, d: selSample.id === M.detail.id ? M.detail : null }}
            onClose={() => setSelected(null)}
          />
        )}
        {selLive && <DetailPanel b={selLive} sample={null} onClose={() => setSelected(null)} />}
      </div>
    </>
  );
}
