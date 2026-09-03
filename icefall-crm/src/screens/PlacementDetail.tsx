import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BadgeEuro, CalendarClock, Trophy } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, Resolve } from "@/components/states";
import { listAuditEvents, listCompanies, listDestinations, listPlacements } from "@/data/queries";
import { formatCents, loading, type Result } from "@/data/result";
import type {
  AuditEvent,
  Company,
  Mountain,
  PlacementEffectiveStatus,
  PlacementView,
} from "@/data/types";
import { cn, formatDay, formatMoment, initials } from "@/lib/utils";
import { slotLabel } from "@/components/placement";

/**
 * One paid position: what was agreed, and everything that has happened to it.
 *
 * TWO THINGS THIS PAGE REFUSES TO DO.
 *
 * It does not keep a history of its own. "Placement history" here IS
 * `audit_events`, filtered to this placement — the same rows the Activity Log
 * draws. A second, screen-local history would be a second version of the truth,
 * and the one people trust would be whichever was written last. The trade is
 * that this page reads a fixed window of recent events; when a change is older
 * than that window the page says so rather than implying nothing happened.
 *
 * It does not release the position. An expired term is a computed reading, not
 * an action: `placement_status` works out `effective_status` when the row is
 * read and nothing ever writes it back. So an expired placement still holds its
 * slot, and this screen states that in words rather than leaving a reader to
 * infer from an amber pill that the position has been vacated. Nothing here
 * happens on a timer; a person moves or cancels it, and that writes an event.
 *
 * Payment status is absent on purpose — no invoice table is wired to placements
 * yet, and "Paid" next to a fee nobody has invoiced is the most expensive kind
 * of guess this CRM could make.
 */

/** How many recent audit events this page reads before filtering to one placement. */
const HISTORY_WINDOW = 200;

/**
 * The effective status in the theme's status badge, carrying exactly the
 * meanings the pill carried on the list: active is settled, cancelled is a
 * refusal, an expired term is the one thing here waiting on a person, and a
 * position that has been reserved but has not started is neither.
 *
 * Written out as literal state names. A tone assembled from the status would
 * produce no class at all — Tailwind scans source text.
 */
const effectiveState = (s: PlacementEffectiveStatus): "ok" | "pending" | "bad" | "neutral" =>
  s === "active" ? "ok" : s === "cancelled" ? "bad" : s === "expired" ? "pending" : "neutral";

const DOT: Record<"ok" | "pending" | "bad" | "neutral", { badge: string; dot: string }> = {
  ok: { badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600", dot: "bg-emerald-500" },
  pending: { badge: "border-amber-500/20 bg-amber-500/10 text-amber-600", dot: "bg-amber-500" },
  bad: { badge: "border-destructive/20 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  neutral: { badge: "border-border bg-ui-muted/50 text-muted-foreground", dot: "bg-muted-foreground" },
};

function StatusBadge({ state, label }: { state: "ok" | "pending" | "bad" | "neutral"; label: string }) {
  const m = DOT[state];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium capitalize", m.badge)}>
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {label}
    </Badge>
  );
}

/**
 * A figure, or the reason there is not one.
 *
 * `value` of `null` renders the reason in muted text — never a dash and never a
 * zero — and the hint that belongs to the figure goes with the figure.
 */
function Metric({
  icon,
  label,
  value,
  reason,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  reason?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex size-7 items-center justify-center rounded-lg border bg-ui-muted text-muted-foreground">
            {icon}
          </div>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {value === null ? (
          <p className="text-[13px] leading-relaxed text-faint">{reason ?? "Not recorded"}</p>
        ) : (
          <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">{value}</div>
        )}
        {hint && value !== null && <p className="text-muted-foreground text-sm">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function PlacementDetail() {
  const { id } = useParams<{ id: string }>();
  const [placements, setPlacements] = useState<Result<PlacementView[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  const [mountains, setMountains] = useState<Result<Mountain[]>>(loading);
  const [audit, setAudit] = useState<Result<AuditEvent[]>>(loading);

  useEffect(() => {
    void listPlacements().then(setPlacements);
    void listCompanies().then(setCompanies);
    void listDestinations().then(setMountains);
    void listAuditEvents(HISTORY_WINDOW).then(setAudit);
  }, []);

  // The named absence to show wherever the audit log itself could not be read:
  // the real failure message when there is one, never a bare "none".
  const auditReason =
    audit.state === "unavailable" || audit.state === "error"
      ? audit.reason
      : audit.state === "loading"
        ? "Reading the audit log…"
        : null;

  return (
    <Resolve result={placements} what="this placement">
      {(all) => {
        const p = all.find((x) => x.id === id);
        if (!p) {
          return (
            <div className="flex flex-col gap-4 md:gap-6">
              <Button variant="outline" size="sm" asChild className="w-fit">
                <Link to="/admin/placements">
                  <ArrowLeft /> All placements
                </Link>
              </Button>
              <Empty
                what="No placement with that reference"
                body="Nothing in the placement list carries this id. The link may be out of date, or the placement may have been created since this page was loaded."
              />
            </div>
          );
        }

        const company =
          companies.state === "ok" ? (companies.value.find((c) => c.id === p.company_id) ?? null) : null;
        const mountain =
          mountains.state === "ok" ? (mountains.value.find((m) => m.id === p.destination_id) ?? null) : null;

        // The company id is a uuid and the mountain id is its slug. Falling back
        // to either is falling back to a real identifier, not to a placeholder.
        const companyLabel = company?.name ?? `Company ${p.company_id.slice(0, 8)}…`;
        const mountainLabel = mountain?.name ?? p.destination_id;

        const mine = (e: AuditEvent) => e.entity_type === "placement" && e.entity_id === p.id;
        const events = audit.state === "ok" ? audit.value.filter(mine) : [];

        // `placements` has no `created_by` column — creation is recorded once, by
        // the audit event the creating statement wrote. Events arrive newest
        // first, so the earliest creation event is the last one in the list.
        const creations = events.filter((e) => e.action.endsWith("created"));
        const created = creations.length > 0 ? creations[creations.length - 1] : null;

        const expired = p.effective_status === "expired";
        const cancelled = p.effective_status === "cancelled";

        return (
          <div className="flex flex-col gap-4 md:gap-6">
            <Button variant="outline" size="sm" asChild className="w-fit">
              <Link to="/admin/placements">
                <ArrowLeft /> All placements
              </Link>
            </Button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                {/* Only when the directory actually named the company. Initials
                    struck from "Company 1a2b3c…" would be initials of an id. */}
                {company && (
                  <Avatar size="lg" className="mt-1">
                    <AvatarFallback>{initials(company.name)}</AvatarFallback>
                  </Avatar>
                )}
                <div className="min-w-0 space-y-1">
                  <h2 className="text-3xl tracking-tight">
                    {companyLabel} — {mountainLabel} #{p.slot_position}
                  </h2>
                  <p className="max-w-3xl text-muted-foreground text-sm">
                    A paid position on a mountain listing. Everything below is what was recorded — this
                    page reports the placement, it does not compute anything about it.
                  </p>
                </div>
              </div>
              <StatusBadge state={effectiveState(p.effective_status)} label={p.effective_status} />
            </div>

            {expired && (
              <Card>
                <CardContent className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-ui-muted text-warn">
                    <AlertTriangle className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">
                      The term ended {formatDay(p.ends_on) ?? "on an unrecorded date"} — this position is
                      still held.
                    </p>
                    <p className="mt-1.5 max-w-3xl text-muted-foreground text-sm leading-relaxed">
                      {companyLabel} keeps position #{p.slot_position} on {mountainLabel}. Expiry is
                      worked out when the row is read and is never written back, so nothing releases,
                      reassigns or downgrades this position on a timer. It will not change until an
                      administrator moves or cancels it, and that action will appear in the history below.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* The three things anybody opens this page to read, set large. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Metric icon={<Trophy className="size-4" />} label="Position" value={slotLabel(p.slot_position)} />
              <Metric
                icon={<BadgeEuro className="size-4" />}
                label="Price"
                value={formatCents(p.price_cents, p.currency)}
                reason="No price is recorded against this placement. It is not free — nobody has entered what was agreed."
              />
              <Metric
                icon={<CalendarClock className="size-4" />}
                label="Expires"
                value={formatDay(p.ends_on)}
                reason="The term has no recorded end date."
                hint={cancelled ? "Cancelled — the term no longer applies." : remaining(p.days_remaining)}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>What was recorded</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                  <Field
                    label="Mountain"
                    value={
                      <Link to={`/admin/mountains/${p.destination_id}`} className="hover:underline">
                        {mountainLabel}
                      </Link>
                    }
                  />

                  <Field
                    label="Company"
                    value={
                      <span className="flex min-w-0 items-center gap-2.5">
                        {company && (
                          <Avatar size="sm">
                            <AvatarFallback>{initials(company.name)}</AvatarFallback>
                          </Avatar>
                        )}
                        <Link to={`/admin/companies/${p.company_id}`} className="truncate hover:underline">
                          {companyLabel}
                        </Link>
                      </span>
                    }
                  />

                  <Field
                    label="Start date"
                    value={formatDay(p.starts_on)}
                    absent="The term has no recorded start date."
                  />

                  <Field
                    label="Payment status"
                    value={null}
                    absent="Not recorded. Nothing links invoices to a placement yet, so this page cannot say whether the fee was billed or paid."
                    note={
                      <Link to="/admin/billing" className="hover:underline">
                        Invoices and payments →
                      </Link>
                    }
                  />

                  <Field
                    label="Created by"
                    value={created ? actorLine(created) : null}
                    absent={
                      auditReason ??
                      `The placement record itself holds no creator. The audit log does, and no creation event for this placement is among the ${HISTORY_WINDOW} most recent entries.`
                    }
                    note={created ? `on ${formatMoment(created.created_at) ?? "an unrecorded date"}` : undefined}
                  />

                  <Field
                    label="Last changed by"
                    value={p.changed_by}
                    absent="No change has been recorded on this placement row. Any change made through the CRM also appears in the history below."
                    note={
                      p.changed_at || p.change_reason
                        ? [formatMoment(p.changed_at), p.change_reason].filter(Boolean).join(" · ")
                        : undefined
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-xl tracking-tight">Placement history</h3>
                <p className="max-w-3xl text-muted-foreground text-sm">
                  The audit log, filtered to this placement — not a separate record. Newest first, and
                  read from the {HISTORY_WINDOW} most recent events across the CRM, so a change older than
                  that window is still in the log but is not shown here.
                </p>
              </div>
              <Resolve
                result={audit}
                what="history for this placement"
                isEmpty={(v) => v.filter(mine).length === 0}
                empty={`No change to this placement is among the ${HISTORY_WINDOW} most recent audit events. Every move, cancellation and price change is written by the same statement that makes it, so this means either nothing has been done to it recently or its events are older than that window.`}
              >
                {() => (
                  <ol className="flex flex-col gap-4">
                    {events.map((e) => (
                      <li key={e.id}>
                        <Card>
                          <CardContent className="flex items-start gap-3">
                            {/* The log records the desk that acted, not a
                                display name, so the initials are the role's
                                — and "··" where even that was not recorded. */}
                            <Avatar>
                              <AvatarFallback>
                                {initials((e.actor_role ?? "").replace(/_/g, " "))}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline">{e.action}</Badge>
                                  <span className="text-muted-foreground text-sm">{actorLine(e)}</span>
                                </div>
                                <span className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
                                  {formatMoment(e.created_at) ?? "At an unrecorded time"}
                                </span>
                              </div>
                              <div className="mt-2.5">
                                <Change event={e} currency={p.currency} />
                              </div>
                              <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                                {e.reason ?? <span className="text-faint">No reason given</span>}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ol>
                )}
              </Resolve>
            </div>
          </div>
        );
      }}
    </Resolve>
  );
}

/** A labelled fact, or the reason there is not one. Never a dash, never a zero. */
function Field({
  label,
  value,
  absent,
  note,
}: {
  label: string;
  value: ReactNode;
  absent?: string;
  note?: ReactNode;
}) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className="min-w-0">
      <p className="font-medium text-muted-foreground text-xs">{label}</p>
      {missing ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-faint">{absent ?? "Not recorded"}</p>
      ) : (
        <div className="mt-1.5 font-medium text-sm">{value}</div>
      )}
      {note && <p className="mt-1.5 text-xs leading-relaxed text-faint">{note}</p>}
    </div>
  );
}

/**
 * How much of the term is left, in whole calendar days.
 *
 * `days_remaining` comes from the view, computed against the database's clock at
 * read time — this only puts it into words. Zero is a real answer here ("ends
 * today"), which is why it is spelled out rather than printed as a bare 0.
 */
function remaining(days: number): string {
  if (days > 1) return `${days} days left`;
  if (days === 1) return "1 day left";
  if (days === 0) return "Ends today";
  const ago = Math.abs(days);
  return `Ended ${ago} ${ago === 1 ? "day" : "days"} ago`;
}

/**
 * Who did it.
 *
 * Staff are identified by the id the database recorded against the action. Names
 * would have to come from the Admin Team module, which has no table yet, and an
 * unresolved id is a truthful answer where an invented name is not. A null actor
 * is a system action, and says so rather than borrowing whoever is reading.
 */
function actorLine(e: AuditEvent): string {
  const role = e.actor_role ? ` · ${e.actor_role}` : "";
  if (!e.actor_id) return `System action — no staff actor recorded${role}`;
  return `Staff ${e.actor_id.slice(0, 8)}…${role}`;
}

/** The placement fields an event can carry, in the words used on this screen. */
const FIELD_LABEL: Record<string, string> = {
  slot_position: "Position",
  status: "Status",
  price_cents: "Price",
  currency: "Currency",
  starts_on: "Term start",
  ends_on: "Term end",
  destination_id: "Mountain",
  company_id: "Company",
  change_reason: "Reason",
};

function fieldValue(key: string, v: unknown, currency: string): string {
  if (v === null || v === undefined) return "not set";
  if (key === "slot_position" && typeof v === "number") return `#${v}`;
  if (key.endsWith("_cents") && typeof v === "number") return formatCents(v, currency) ?? String(v);
  if (key.endsWith("_on") && typeof v === "string") return formatDay(v) ?? v;
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/**
 * What changed, old → new.
 *
 * Read straight off the event's own `previous` and `next` payloads. Nothing is
 * reconstructed from the placement's current values: the point of the log is
 * that it says what the row looked like then, not what it looks like now.
 */
function Change({ event, currency }: { event: AuditEvent; currency: string }) {
  const { previous, next } = event;
  const payloadCurrency =
    typeof next?.currency === "string"
      ? next.currency
      : typeof previous?.currency === "string"
        ? previous.currency
        : currency;

  const keys = Array.from(new Set([...Object.keys(previous ?? {}), ...Object.keys(next ?? {})]));
  if (keys.length === 0) {
    return (
      <p className="text-[13px] text-faint">
        The event records no field values — only that the action was taken.
      </p>
    );
  }

  return (
    <div className="space-y-0.5 text-sm">
      {!previous && <p className="text-[13px] text-faint">Created with these values:</p>}
      {keys.map((k) => {
        const had = previous ? k in previous : false;
        const has = next ? k in next : false;
        return (
          <p key={k}>
            <span className="text-faint">{FIELD_LABEL[k] ?? k}: </span>
            {had && (
              <span className="text-muted-foreground line-through">
                {fieldValue(k, previous?.[k], payloadCurrency)}
              </span>
            )}
            {had && has && <span className="text-faint"> → </span>}
            {has && <span>{fieldValue(k, next?.[k], payloadCurrency)}</span>}
          </p>
        );
      })}
    </div>
  );
}
