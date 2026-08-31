import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { RangePicker } from "@/components/RangePicker";
import { presetRange, type DateRange } from "@/domain/range";
import { Card, Delta, Disclaimer } from "@/components/ui/primitives";
import { Figure } from "@/components/Figure";
import { Photo } from "@/components/Photo";
import { Provenance } from "@/components/Figure";
import { analytics, stagedBookings } from "@/domain/season";
import { GUIDE_NOTICES, excludedNote } from "@/domain/honesty";
import { MOCKUP_FIGURES_NOTICE, SHOW_MOCKUP_FIGURES, ratingDelta } from "@/domain/mockupFigures";
import { visibleMe } from "@/data/demo";
import { formatEur } from "@/money/model";
import { cn } from "@/lib/utils";

/**
 * ANALYTICS — the owner's mockup, with every delta computed rather than typed.
 *
 * The mockup shows "▲18% vs last season" beside each figure. Those are
 * arithmetic over this season's rows and a seeded previous season, never
 * written-in percentages — and where there is no previous period they are
 * ABSENT rather than 0%, because a guide who has no comparison has not stood
 * still, they have simply not been measured before.
 *
 * The line chart is net earnings by DEPARTURE MONTH, derived from bookings. It
 * is deliberately not called a payments history: no money has ever moved through
 * ICEFALL, there is no payouts ledger, and the caption says which of the two
 * this is.
 */
export default function Analytics() {
  const [range, setRange] = useState<DateRange>(() => presetRange("season"));
  const [picking, setPicking] = useState(false);
  const staged = stagedBookings();
  const a = analytics(staged, undefined, range);

  if (!visibleMe()) {
    return (
      <Screen>
        <Stagger>
          <Rise className="pt-7">
            <h1 className="text-[22px] font-light text-snow">Analytics</h1>
            <Card className="mt-5">
              <p className="text-[12.5px] leading-relaxed text-mist">
                There is nothing to analyse yet — no bookings, no clients and no season on this
                device.
              </p>
            </Card>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stagger>
        <Rise className="flex items-center justify-between pb-1 pt-7">
          <h1 className="text-[22px] font-light text-snow">Analytics</h1>
          <button
            type="button"
            onClick={() => setPicking((v) => !v)}
            aria-expanded={picking}
            className="flex items-center gap-1.5 rounded-tile border border-hairline bg-graphite px-3 py-1.5 text-[12px] text-mist transition-colors hover:border-hairline-strong hover:text-snow"
          >
            {a.range.label}
            <ChevronDown
              size={14}
              strokeWidth={1.9}
              className={cn("transition-transform", picking && "rotate-180")}
            />
          </button>
        </Rise>

        {picking && (
          <Rise>
            <RangePicker value={a.range} onChange={setRange} onClose={() => setPicking(false)} />
          </Rise>
        )}

        {/* ---- Total earnings + trend ---------------------------------------- */}
        <Rise className="pt-4">
          <Card>
            <p className="section-label">Total earnings</p>
            <div className="mt-2 min-h-[36px]">
              <Figure reading={a.earnings} format={formatEur} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Delta value={a.earningsDelta} />
              {/* The delta names the window it is measured against, because the
                  guide can now change that window and "vs last season" would be
                  false the moment they did. */}
              {a.earningsDelta !== null && (
                <span className="text-[11.5px] text-mist-dim">vs {a.previousLabel}</span>
              )}
              {a.earningsDelta === null && a.earnings.available && (
                <span className="text-[11.5px] text-mist-dim">
                  Nothing in {a.previousLabel} to compare against
                </span>
              )}
            </div>
            {excludedNote(a.earnings, a.earningsExcluded) && (
              <p className="mt-1.5 text-[11px] text-mist-dim">
                {excludedNote(a.earnings, a.earningsExcluded)}
              </p>
            )}

            {/* A FLAT LINE AT ZERO IS A CLAIM — that the guide earned nothing
                each month — where an absent chart is the honest "nothing here".
                The figure above already says it in words; drawing it as data
                would be saying it twice, and the second time inaccurately. */}
            {a.earnings.available && <LineChart points={a.months} className="mt-4" />}
          </Card>
        </Rise>

        {/* ---- The four tiles -------------------------------------------------- */}
        <Rise className="grid grid-cols-2 gap-2.5 pt-4">
          <StatCard label="Bookings" reading={a.bookings} format={String} delta={a.bookingsDelta} />
          <StatCard label="Clients" reading={a.clients} format={String} delta={a.clientsDelta} />
          <StatCard
            label="Repeat clients"
            reading={a.repeat}
            format={(v) => `${Math.round(v * 100)}%`}
            delta={a.repeatDelta}
            deltaSuffix="pp"
          />
          <StatCard
            label="Avg. rating"
            reading={a.rating}
            format={(v) => `${v.toFixed(1)} ★`}
            delta={ratingDelta()}
            deltaSuffix=""
          />
        </Rise>

        {SHOW_MOCKUP_FIGURES && (
          <Rise className="pt-3">
            <Disclaimer>{MOCKUP_FIGURES_NOTICE}</Disclaimer>
          </Rise>
        )}

        {/* ---- Earnings breakdown ---------------------------------------------- */}
        <Rise className="pt-5">
          <Card>
            <p className="section-label">Earnings breakdown</p>
            {a.categories.length > 0 ? (
              <>
                <div className="mt-4 flex items-center gap-5">
                  <Donut slices={a.categories} />
                  <ul className="min-w-0 flex-1 space-y-2.5">
                    {a.categories.map((c, i) => (
                      <li key={c.key} className="flex items-center gap-2.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: SLICE_COLOURS[i % SLICE_COLOURS.length] }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-mist">
                          {c.label}
                        </span>
                        <span className="tnum shrink-0 text-[12.5px] text-snow">
                          {formatEur(c.cents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                {a.categoriesExcluded > 0 && (
                  <p className="mt-3 text-[11px] text-mist-dim">
                    {GUIDE_NOTICES.earningsExcludes(a.categoriesExcluded)}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-dim">
                No booking with a recorded value yet, so there is nothing to break down.
              </p>
            )}
          </Card>
        </Rise>

        {/* ---- Top clientele -------------------------------------------------- */}
        <Rise className="pb-2 pt-5">
          <p className="section-label">Top clientele</p>
          <p className="mt-1 text-[11.5px] text-mist-dim">
            Who your work comes from, by what reaches you.
          </p>
          <Card className="mt-3" inset={false}>
            <ul className="divide-y divide-hairline">
              {a.clientele.slice(0, 5).map((row) => {
                const max = Math.max(...a.clientele.map((x) => x.cents), 1);
                return (
                  <li key={row.client.id}>
                    <Link
                      to={`/client/${row.client.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]"
                    >
                      {/* The mountain or trek they are actually on — the owner's
                          "images of the acc mountains or treks" (GU-02). */}
                      <Photo peak={row.peak} alt="" className="h-11 w-11 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate text-[13px] text-snow">
                            {row.client.name}
                          </span>
                          {/*
                            €0 IS A CLAIM, AND THE WRONG ONE. A client whose only
                            trip has no recorded value is not a client worth
                            nothing — nobody has told us what the trip was worth.
                            Showing the figure only when something was actually
                            counted; the omission line below already says why.
                          */}
                          <span className="tnum shrink-0 text-[12.5px] text-mist">
                            {row.cents > 0 || row.excluded === 0
                              ? formatEur(row.cents)
                              : "Not recorded"}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-[11.5px] text-mist-dim">
                          {row.trips[0]?.title}
                          {row.trips.length > 1 && ` · +${row.trips.length - 1} more`}
                        </span>
                        <span className="mt-2 flex items-center gap-2.5">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-elevated">
                            <span
                              className="block h-full rounded-pill bg-azure"
                              style={{ width: `${Math.max(4, (row.cents / max) * 100)}%` }}
                            />
                          </span>
                          <span className="tnum shrink-0 text-[11px] text-mist-dim">
                            {row.trips.length} {row.trips.length === 1 ? "trip" : "trips"}
                          </span>
                        </span>
                        {row.excluded > 0 && (
                          <span className="mt-1 block text-[11px] text-mist-dim">
                            {GUIDE_NOTICES.earningsExcludes(row.excluded)}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
              {a.clientele.length === 0 && (
                <li className="px-4 py-5 text-center text-[12.5px] text-mist-dim">
                  No clients in this period.
                </li>
              )}
            </ul>
            <Provenance>{a.provenance}</Provenance>
          </Card>
        </Rise>

      </Stagger>
    </Screen>
  );
}

const SLICE_COLOURS = [
  "var(--ice-azure)",
  "var(--ice-azure-bright)",
  "var(--ice-azure-deep)",
];

function StatCard<T>({
  label,
  reading,
  format,
  delta,
  deltaSuffix,
}: {
  label: string;
  reading: import("@/domain/honesty").Reading<T>;
  format: (v: T) => string;
  delta: number | null;
  deltaSuffix?: string;
}) {
  return (
    <Card className={cn(!reading.available && "col-span-2")}>
      <p className="section-label">{label}</p>
      <div className="mt-2.5 min-h-[28px]">
        <Figure reading={reading} format={format} size="md" />
      </div>
      <div className="mt-1.5">
        <Delta value={reading.available ? delta : null} suffix={deltaSuffix} />
      </div>
    </Card>
  );
}

/** The mockup's line chart. Pure SVG — no chart library in this app. */
function LineChart({ points, className }: { points: { label: string; cents: number }[]; className?: string }) {
  if (points.length === 0) return null;
  const max = Math.max(...points.map((p) => p.cents), 1);
  const W = 300;
  const H = 92;
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * W;
  const y = (c: number) => H - (c / max) * (H - 10) - 4;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`).join(" ");

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[92px] w-full overflow-visible" role="img" aria-label="Earnings by month">
        <path d={`${d} L${W},${H} L0,${H} Z`} className="fill-azure/10" />
        <path d={d} className="stroke-azure" fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={p.label} cx={x(i)} cy={y(p.cents)} r={2.5} className="fill-azure" />
        ))}
      </svg>
      <div className="mt-2 flex justify-between">
        {points.map((p) => (
          <span key={p.label} className="text-[10px] uppercase tracking-[0.08em] text-mist-dim">
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The mockup's ring. Stroke-dasharray arcs, no library. */
function Donut({ slices }: { slices: { key: string; cents: number }[] }) {
  const total = slices.reduce((n, s) => n + s.cents, 0) || 1;
  const R = 34;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 90 90" className="h-[92px] w-[92px] shrink-0 -rotate-90" role="img" aria-label="Earnings by kind of work">
      <circle cx={45} cy={45} r={R} className="stroke-elevated" strokeWidth={14} fill="none" />
      {slices.map((s, i) => {
        const len = (s.cents / total) * C;
        const el = (
          <circle
            key={s.key}
            cx={45}
            cy={45}
            r={R}
            strokeWidth={14}
            fill="none"
            stroke={SLICE_COLOURS[i % SLICE_COLOURS.length]}
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}
