/**
 * ONE TRIP, AS ITS SELLER SEES IT — the operator half of the product detail
 * specified in `icefall-sessions/requests/08-operator-product-detail-from-03.md`.
 *
 * THE HARD DIFFERENCE, and the whole reason the request exists:
 *
 *   THERE IS NO COMMISSION ANYWHERE ON THIS SCREEN. Not a tile, not a column,
 *   not a company-earnings figure derived by subtracting one. Not hidden behind
 *   a role check and not styled out — ABSENT. An operator sees what they
 *   receive; they do not see what ICEFALL takes. Those are two different facts
 *   and only one of them is theirs. The CRM's version of this screen shows the
 *   other half to ICEFALL's own staff, and that is where it stays.
 *
 * A grep of this file for "commission" finds this comment and nothing else, and
 * that is the point of writing it here.
 *
 * WHAT IS NOT SHOWN, AND WHY IT IS SAID RATHER THAN OMITTED. Two sentences on
 * this screen — the Views tile and the closing banner — were written by the
 * owner themselves and are reproduced VERBATIM. They are not paraphrased, not
 * merged and not softened, and the demo view figures this app carries elsewhere
 * (`demoListingViews`) are deliberately not wired in here: on this screen the
 * owner's words are the answer about views.
 *
 * THE FIGURES. Every one is counted from rows this company owns —
 * their leads, their bookings, their placement. No deltas and no percentage
 * changes appear, because there is no snapshot table to compute them against
 * and a change figure invented from one reading is a claim about a trend
 * nobody measured. A booking with no reported value is EXCLUDED from the
 * revenue sum and counted separately beside it; a placement with no agreed
 * price reads "not yet agreed", never free and never €0.
 */

import { Link } from "react-router-dom";
import {
  Card, MetricTile, LockedNotice, Notice, SectionHeading, StatTile, StatusChip,
  formatMoney, formatPriceRange,
} from "@/components/ui";
import { TrendChart } from "@/components/TrendChart";
import { can } from "@/domain/authz";
import { formatDay, formatDayShort, formatRange, TODAY } from "@/domain/dates";
import {
  OPERATOR_NOTICES, estimatedGmv, measured, unavailable, type Reading,
} from "@/domain/honesty";
import { placementFor, placementStatus } from "@/domain/placement";
import { chipForProduct, type Product } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

/** Four weeks, the window every other trend in this portal uses. */
const WINDOW_DAYS = 28;

/**
 * A row of the two fact lists. `value` null is an ABSENCE with its own words —
 * never a dash standing in for a figure Icefall does not hold.
 */
function Facts({ rows }: { rows: readonly { label: string; value: string | null; missing: string }[] }) {
  return (
    <dl className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between gap-3 text-[12.5px]">
          <dt className="shrink-0 text-muted">{r.label}</dt>
          {r.value === null ? (
            <dd className="text-right text-faint">{r.missing}</dd>
          ) : (
            <dd className="tnum text-right font-medium text-ink">{r.value}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

export function ProductOverview({ product }: { product: Product }) {
  const session = useSession();
  const { backend, company, mountains, placements, revision } = useOperator();

  const leads = useAsync(() => backend.getLeads(session), [session, revision], []);
  const bookings = useAsync(() => backend.getBookings(session), [session, revision], []);

  const mountainName = (id: string) => mountains.find((m) => m.id === id)?.name ?? id;
  const mountainNames = product.mountainIds.map(mountainName).join(", ");

  /* ---- the rows this trip is made of ----------------------------------- */

  const myLeads = leads.filter((l) => l.productId === product.id);
  const myBookings = bookings.filter((b) => b.productId === product.id);

  const answered = myLeads.filter((l) => l.firstResponseAt !== null).length;
  const fromIcefall = myLeads.filter((l) => l.origin === "icefall").length;
  const ownLeads = myLeads.length - fromIcefall;

  const cancelled = myBookings.filter((b) => b.status === "cancelled").length;
  const notYetConfirmed = myBookings.filter((b) => b.status === "pending").length;
  /*
   * Revenue counts CONFIRMED AND COMPLETED bookings only, the same rule the
   * per-mountain revenue in `getInsights` uses. A cancelled booking is money
   * that did not arrive, and a pending one is money nobody has yet said
   * arrived; folding either into a total would overstate the operator's own
   * takings on the one screen they use to judge whether Icefall is working.
   */
  const counted = myBookings.filter((b) => b.status === "confirmed" || b.status === "completed");
  const { total: revenue, excluded: valueless } = estimatedGmv(counted.map((b) => b.value));

  const revenueFootnote = [
    "Reported on your confirmed and completed bookings.",
    valueless > 0 ? OPERATOR_NOTICES.gmvExcludes(valueless) : null,
    notYetConfirmed > 0 ? OPERATOR_NOTICES.bookingsNotConfirmed(notYetConfirmed) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const answeredReading: Reading<number> =
    myLeads.length === 0
      ? unavailable("No enquiries about this trip yet, so there is no answered share to show.")
      : measured(answered);

  /* ---- the placement, which is Icefall's to arrange and never yours ----- */

  const placement =
    product.mountainIds.map((id) => placementFor(placements, id)).find((p) => p !== null) ?? null;
  const placementState = placement ? placementStatus(placement) : null;

  const placementReading: Reading<number> = !placement
    ? unavailable(
        `You hold no placement slot on ${mountainNames || "this mountain"}, so there is no placement price to show.`,
      )
    : placement.priceCents === null
      ? unavailable(
          `Slot #${placement.slotPosition} on ${mountainName(placement.mountainId)} — price not yet agreed. Never free.`,
        )
      : measured(placement.priceCents);

  /* ---- the chart: counted days, never interpolated ---------------------- */

  const end = Date.parse(`${TODAY}T00:00:00Z`);
  const window = Array.from({ length: WINDOW_DAYS }, (_, k) => {
    const iso = new Date(end - (WINDOW_DAYS - 1 - k) * 86_400_000).toISOString().slice(0, 10);
    return {
      label: formatDayShort(iso),
      enquiries: myLeads.filter((l) => l.createdAt.slice(0, 10) === iso).length,
      bookings: myBookings.filter((b) => b.bookedAt.slice(0, 10) === iso).length,
    };
  });
  const inWindow = window.reduce((n, d) => n + d.enquiries + d.bookings, 0);
  const outsideWindow = myLeads.length + myBookings.length - inWindow;

  const price = formatPriceRange(product.priceFromCents, product.priceToCents, product.currency);
  const checked = OPERATOR_NOTICES.documentsChecked(
    company?.documentsCheckedAt ? formatDay(company.documentsCheckedAt.slice(0, 10)) : null,
  );

  return (
    <div className="space-y-4">
      {/*
        SIX TILES AND NO SEVENTH. The CRM's screen has two more — Icefall's
        commission and the company earnings derived from it. Neither is here.
      */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricTile
          label="Bookings"
          reading={measured(myBookings.length)}
          format={String}
          footnote={
            cancelled > 0
              ? `Recorded against this trip. ${cancelled} of them ${cancelled === 1 ? "was" : "were"} cancelled.`
              : "Recorded against this trip."
          }
          href="/operator/bookings"
        />
        <MetricTile
          label="Revenue recorded"
          reading={revenue}
          format={(c) => formatMoney(c, product.currency)}
          footnote={revenueFootnote}
        />
        <MetricTile
          label="Enquiries"
          reading={measured(myLeads.length)}
          format={String}
          footnote={
            myLeads.length === 0
              ? "None recorded against this trip yet."
              : ownLeads > 0
                ? `${fromIcefall} passed to you by Icefall, ${ownLeads} recorded by your team.`
                : "All passed to you by Icefall."
          }
          href="/operator/leads"
        />
        <MetricTile
          label="Enquiries → answered"
          reading={answeredReading}
          format={(v) => `${v} / ${myLeads.length}`}
          footnote="Answered means a first reply is recorded against the enquiry."
        />
        <MetricTile
          label="Placement — agreed price"
          reading={placementReading}
          format={(c) => formatMoney(c, placement?.currency ?? "EUR")}
          /*
           * THE OPERATOR'S SIDE OF THE SAME FACT. The CRM calls this row
           * "placement income" because it is money Icefall receives. From this
           * side of the trade it is money the company pays, and labelling a
           * cost as income would be the same class of lie as inventing a
           * figure. Same stored `price_cents`, stated from the reader's side.
           */
          footnote="What you have agreed to pay Icefall for this slot."
        />
        {/*
          THE OWNER'S WORDS, VERBATIM. Not paraphrased, not shortened, and not
          replaced by the demo view figure this app shows on its list screens.
        */}
        <StatTile label="Views">
          <p className="max-w-[30ch] text-[12.5px] leading-snug text-muted">Not measured — We do not currently track views. This metric is not available.</p>
        </StatTile>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-4">
          <SectionHeading
            title="Bookings and enquiries over time"
            detail="Daily, over the last four weeks."
          />
          {inWindow === 0 ? (
            <p className="text-[12.5px] leading-relaxed text-muted">
              No enquiries or bookings for this trip in the last four weeks, so there is no line to
              draw.
              {outsideWindow > 0
                ? ` ${outsideWindow} earlier ${outsideWindow === 1 ? "record sits" : "records sit"} outside this window.`
                : ""}
            </p>
          ) : (
            <TrendChart
              days={window.map((d) => d.label)}
              series={[
                {
                  key: "enq",
                  label: "Enquiries",
                  colour: "var(--op-azure)",
                  points: window.map((d) => d.enquiries),
                },
                {
                  key: "book",
                  label: "Bookings",
                  colour: "var(--op-pending)",
                  points: window.map((d) => d.bookings),
                },
              ]}
            />
          )}
        </Card>

        <Card className="p-4">
          <SectionHeading title="About this trip" detail="What Icefall holds on this record." />
          <Facts
            rows={[
              { label: "Type", value: product.kind === "expedition" ? "Expedition" : "Trek", missing: "" },
              { label: "Mountain", value: mountainNames || null, missing: "None recorded" },
              {
                label: "Duration",
                value: product.durationDays !== null ? `${product.durationDays} days` : null,
                missing: "Not stated",
              },
              { label: "Difficulty", value: product.difficulty, missing: "Not recorded" },
              { label: "Season", value: product.seasonality, missing: "Not stated" },
              {
                label: "Highest point",
                /* The trip's OWN figure. Never the mountain's summit — a base-camp
                   trek tops out thousands of metres below the peak above it. */
                value:
                  product.maxAltitudeM !== null
                    ? `${product.maxAltitudeM.toLocaleString("en-GB")} m`
                    : null,
                missing: "Not held by Icefall",
              },
              { label: "Price", value: price, missing: "Not priced" },
              { label: "Last updated", value: formatDay(product.updatedAt.slice(0, 10)), missing: "" },
            ]}
          />
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line-soft pt-3">
            <span className="text-[12.5px] text-muted">Publication</span>
            <StatusChip status={chipForProduct(product.status)} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-4">
          <SectionHeading title="Your company" detail="The seller on this trip's page." />
          {company === null ? (
            <p className="text-[12.5px] text-muted">Your company record has not loaded.</p>
          ) : (
            <>
              <p className="ser text-[19px] leading-tight text-ink">{company.name}</p>
              {company.tagline && <p className="mt-0.5 text-[12.5px] text-muted">{company.tagline}</p>}
              <div className="mt-3">
                <Facts
                  rows={[
                    {
                      label: "Based in",
                      value: [company.city, company.country].filter(Boolean).join(", ") || null,
                      missing: "Not recorded",
                    },
                    {
                      label: "Founded",
                      value: company.foundedYear !== null ? String(company.foundedYear) : null,
                      missing: "Not recorded",
                    },
                    {
                      label: "Languages",
                      value: company.languages.length > 0 ? company.languages.join(", ") : null,
                      missing: "None listed",
                    },
                  ]}
                />
              </div>
              <p className="mt-3 text-[11.5px] leading-snug text-faint">
                {/* A check Icefall performed, or the absence of one. Never a date invented to fill the line. */}
                {checked ?? "No document check has been recorded against your company yet."}
              </p>
              {can(session, "editCompanyProfile") && (
                <Link
                  to="/operator/company"
                  className="mt-3 inline-block text-[12px] font-medium text-azure-ink hover:underline"
                >
                  View company profile
                </Link>
              )}
            </>
          )}
        </Card>

        <Card className="p-4">
          <SectionHeading title="Placement / slot" detail="Your paid position on this mountain." />
          {placement === null ? (
            <p className="text-[12.5px] leading-relaxed text-muted">
              You hold no placement on {mountainNames || "this mountain"}. Your trips, enquiries and
              bookings do not depend on one — placement is a separate commercial arrangement Icefall
              offers.
            </p>
          ) : (
            <>
              <Facts
                rows={[
                  { label: "Position", value: `#${placement.slotPosition}`, missing: "" },
                  { label: "Mountain", value: mountainName(placement.mountainId), missing: "" },
                  {
                    label: "Term",
                    value: formatRange(placement.startsOn, placement.endsOn),
                    missing: "Not stated",
                  },
                  {
                    label: "Agreed price",
                    value:
                      placement.priceCents !== null
                        ? formatMoney(placement.priceCents, placement.currency)
                        : null,
                    missing: "Not yet agreed — never free",
                  },
                  {
                    label: "Days remaining",
                    value:
                      placementState && placementState.daysRemaining !== null
                        ? String(placementState.daysRemaining)
                        : null,
                    missing: "No end date recorded",
                  },
                ]}
              />
              {placementState?.effectiveStatus === "expired" && (
                <div className="mt-3">
                  <Notice tone="expired">{OPERATOR_NOTICES.PLACEMENT_EXPIRED}</Notice>
                </div>
              )}
            </>
          )}
          <div className="mt-3">
            {/*
              Read-only, stated as a rule rather than shown as a disabled input.
              `canEditPlacement()` is false unconditionally and there is no
              placement write on the backend — this sentence is the whole
              interface an operator has to it.
            */}
            <LockedNotice>{OPERATOR_NOTICES.PLACEMENT_READ_ONLY}</LockedNotice>
          </div>
        </Card>
      </div>

      {/* THE OWNER'S BANNER, VERBATIM — written by them, and better than ours. */}
      <div className="hairline rounded-card bg-azure-soft p-4">
        <p className="text-[12.5px] font-semibold text-azure-ink">About views</p>
        <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-azure-ink">ICEFALL does not currently record view counts, impressions or click-through data. We are focused on revenue, bookings and enquiries — the metrics that matter.</p>
      </div>
    </div>
  );
}
