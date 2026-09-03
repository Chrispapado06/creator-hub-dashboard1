import { useEffect, useState, type ReactNode } from "react";
import { Compass, Handshake, Mountain, Repeat } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Resolve, Unavailable } from "@/components/states";
import { listBookings, listRevenue } from "@/data/queries";
import { formatCents, formatCentsShort, loading, type Result } from "@/data/result";
import type { Booking, RevenueRecord, RevenueStream } from "@/data/types";
import { cn } from "@/lib/utils";

/**
 * THE PAGE HEADER, INLINE AND NOT `PageHead`.
 *
 * `components/ui.tsx` exports `PageHead`, and it draws the title at 31px
 * EXTRABOLD. The theme draws every page title at exactly `text-3xl
 * tracking-tight` — 30px, weight 400 — measured on localhost:3100
 * (`h2.text-3xl.tracking-tight` → fontSize 30px, fontWeight 400, letterSpacing
 * -0.75px), with a 14px `text-muted-foreground` line under it.
 *
 * That difference is the single most visible thing on every screen, and
 * `PageHead` takes no className, so it cannot be overridden from here. This
 * pass may not edit shared components, so the header is written out at the four
 * call sites it owns. THE RIGHT FIX IS ONE EDIT TO `PageHead` ITSELF, which
 * would carry all 32 screens at once — flagged for whoever owns that file.
 */
function Head({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">{title}</h1>
        {subtitle && <p className="max-w-3xl text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * The theme's stat tile, and the honesty rule that survives inside it.
 *
 * Shape copied from the theme's own metric card
 * (dashboard/default/_components/metric-cards.tsx): a `size-7 rounded-lg border
 * bg-muted text-muted-foreground` icon square, then the label as
 * CardDescription, then a 30px tabular figure, then a 14px muted caption.
 *
 * WHAT DID NOT CHANGE, AND MUST NOT. `value === null` still renders the REASON
 * in prose. Never a dash, never a zero, never "N/A", never a skeleton. This is
 * the same contract `Stat` in components/ui.tsx carries and the tile it
 * replaces; only the chrome around it is the theme's.
 */
function Tile({
  label,
  value,
  reason,
  hint,
  icon,
}: {
  label: string;
  value: string | null;
  reason?: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        {icon && (
          <CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg border bg-ui-muted text-muted-foreground">
              {icon}
            </div>
          </CardTitle>
        )}
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {value === null ? (
          <p className="text-muted-foreground text-sm leading-relaxed">{reason ?? "Not recorded"}</p>
        ) : (
          <>
            <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">{value}</div>
            {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The four streams, each with the icon it keeps.
 *
 * THE `tone`/`swatch` FIELDS ARE GONE, and this is a consequence of the
 * re-skin rather than a decision taken here: butter, sky, lilac and mint all
 * now resolve to the SAME neutral (index.css rebinds all four onto
 * `--muted`), so four differently-named swatches drew four identical grey
 * circles. A row could no longer be told apart by its dot.
 *
 * The capability is restored the theme's own way: each stream keeps its ICON,
 * in the theme's `rounded-lg border bg-muted` square, on the tile AND in the
 * table row. Shape and glyph distinguish the four streams where colour used
 * to, which is exactly how the theme distinguishes its own four metric cards.
 */
const STREAMS: { id: RevenueStream; label: string; icon: ReactNode }[] = [
  { id: "placement", label: "Mountain placements", icon: <Mountain className="size-4" /> },
  { id: "referral", label: "Referral fees", icon: <Handshake className="size-4" /> },
  { id: "guide_commission", label: "Guide commissions", icon: <Compass className="size-4" /> },
  { id: "subscription", label: "Consumer subscriptions", icon: <Repeat className="size-4" /> },
];

/**
 * Where a recognised record has got to, as the theme's status badge.
 *
 * Collected is money that arrived; invoiced is money asked for and still
 * waiting; written off is money that will not come; accrued is neither asked
 * for nor refused, so it stays neutral rather than borrowing a colour that
 * would suggest somebody has to act on it.
 *
 * The four classes are the theme's own `statusMeta`, lifted verbatim from
 * dashboard/users/_components/data.tsx. The chip this replaces drew a filled
 * circular glyph and a CHEVRON; the chevron was documented as decorative and
 * `aria-hidden` ("nothing in this build can change a status from a list row
 * yet"), so dropping it removes no capability — the dot and the word both stay.
 */
const STATUS_TONE: Record<"ok" | "pending" | "bad" | "neutral", { badge: string; dot: string }> = {
  ok: { badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  pending: { badge: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  bad: { badge: "border-destructive/20 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  neutral: { badge: "border-border bg-ui-muted/50 text-muted-foreground", dot: "bg-muted-foreground" },
};

const statusState = (s: RevenueRecord["status"]): "ok" | "pending" | "bad" | "neutral" =>
  s === "collected" ? "ok" : s === "invoiced" ? "pending" : s === "written_off" ? "bad" : "neutral";

function StatusBadge({ status }: { status: RevenueRecord["status"] }) {
  const tone = STATUS_TONE[statusState(status)];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium", tone.badge)}>
      <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden />
      {status}
    </Badge>
  );
}

/**
 * ICEFALL's commercial ledger. Not accounting software.
 *
 * FOUR STREAMS, NEVER ADDED UP CARELESSLY. A placement fee is invoiced to a
 * company; a referral fee is a claim against money that never touched ICEFALL; a
 * guide commission comes out of a payment ICEFALL processed; a subscription is
 * consumer revenue. They have different collection risks and different people
 * chasing them, and one total across all four hides which of those is true.
 *
 * GMV IS THE HONEST ONE TO GET WRONG. A booking may be recorded with no value —
 * the database refuses to store an unknown as zero — so the total below sums
 * only the bookings whose value was actually reported, and says how many it left
 * out. A GMV figure that silently treats unknowns as zero understates the
 * marketplace and looks precise while doing it.
 */
export default function Revenue() {
  const [revenue, setRevenue] = useState<Result<RevenueRecord[]>>(loading);
  const [bookings, setBookings] = useState<Result<Booking[]>>(loading);

  useEffect(() => {
    void listRevenue().then(setRevenue);
    void listBookings().then(setBookings);
  }, []);

  const streamTotal = (id: RevenueStream): string | null =>
    revenue.state === "ok"
      ? formatCentsShort(
          revenue.value.filter((r) => r.stream === id).reduce((n, r) => n + r.amount_cents, 0),
        )
      : null;

  const collected = (status: RevenueRecord["status"]): string | null =>
    revenue.state === "ok"
      ? formatCentsShort(
          revenue.value.filter((r) => r.status === status).reduce((n, r) => n + r.amount_cents, 0),
        )
      : null;

  // Reported only, and the count of what was excluded travels with it.
  const gmv = (() => {
    if (bookings.state !== "ok") return { value: null, excluded: 0 };
    const reported = bookings.value.filter((b) => b.value_status === "reported");
    return {
      value: formatCentsShort(reported.reduce((n, b) => n + (b.value_cents ?? 0), 0)),
      excluded: bookings.value.length - reported.length,
    };
  })();

  const reason = revenue.state === "unavailable" || revenue.state === "error" ? revenue.reason : "Not recorded";

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Head
        title="Revenue"
        subtitle="ICEFALL's commercial ledger and management view — not a replacement for accounting software. The four streams are kept apart because they carry different collection risks."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STREAMS.map((s) => (
          <Tile key={s.id} label={s.label} value={streamTotal(s.id)} reason={reason} icon={s.icon} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Tile
          label="GMV attributed to ICEFALL"
          value={gmv.value}
          reason={reason}
          hint={
            gmv.excluded > 0
              ? `Excludes ${gmv.excluded} booking${gmv.excluded === 1 ? "" : "s"} whose value has not been reported.`
              : "Every recorded booking has a reported value."
          }
        />
        <Tile label="Collected" value={collected("collected")} reason={reason} />
        <Tile label="Outstanding — invoiced" value={collected("invoiced")} reason={reason} />
      </div>

      <Resolve
        result={revenue}
        what="revenue records"
        isEmpty={(v) => v.length === 0}
        empty="Nothing has been recognised yet. Referral revenue appears once a commission rule is configured and a booking is converted."
      >
        {(records) => (
          <Card>
            <CardHeader>
              <CardTitle className="leading-none">Records</CardTitle>
              <CardDescription>
                Every amount ICEFALL has recognised, in the stream it belongs to.
              </CardDescription>
            </CardHeader>
            {/* The theme's in-card table: header row 44px with `text-sm
                font-medium text-foreground` headings (NOT the small-caps grey
                this screen used), cells at px-4 py-4, rows separated at
                border/50, and the whole table bleeding to the card edge
                (`px-0`). Copied from crm/_components/opportunities-section. */}
            <CardContent className="px-0">
              <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4 **:data-[slot='table-cell']:py-4">
                <TableHeader className="border-t **:data-[slot='table-head']:h-11 **:data-[slot='table-head']:font-medium **:data-[slot='table-head']:text-foreground **:data-[slot='table-head']:text-sm">
                  <TableRow>
                    <TableHead>Recognised</TableHead>
                    <TableHead>Stream</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="**:data-[slot='table-row']:border-border/50">
                  {records.map((r) => {
                    const stream = STREAMS.find((s) => s.id === r.stream);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground tabular-nums">{r.recognised_on}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {/* A stream is a taxonomy, not a person, so this is
                                the theme's icon square rather than an avatar —
                                it keeps the row's rhythm without implying
                                somebody is behind it. A stream with no icon of
                                its own gets the empty square. */}
                            <span
                              aria-hidden
                              className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-ui-muted text-muted-foreground"
                            >
                              {stream?.icon}
                            </span>
                            <span className="font-medium text-sm">{stream?.label ?? r.stream}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-sm tabular-nums">
                          {formatCents(r.amount_cents, r.currency)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Resolve>

      {/* The MRR/ARR refusal, verbatim. `Unavailable` is the shared honesty
          frame and is deliberately not restyled into a theme "empty" — the
          theme's Empty component says "No data", which erases the difference
          between a figure nobody measured and a measured zero. */}
      <Unavailable
        reason={
          "MRR and ARR are not shown. ICEFALL has no subscription product and no payment processor, " +
          "so there is no recurring revenue to annualise — a figure here would be arithmetic performed " +
          "on nothing. Average booking value is likewise withheld while most bookings carry no reported " +
          "value: a mean over three of eleven bookings is not the average booking value, it is the " +
          "average of the three somebody happened to fill in."
        }
      />
    </div>
  );
}
