import { useEffect, useState, type ReactNode } from "react";
import { Resolve, Unavailable } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCommissions, listDestinations, listPlacementPrices } from "@/data/queries";
import { formatCents, loading, type Result } from "@/data/result";
import type { Commission, Mountain, PlacementPrice } from "@/data/types";
import { cn } from "@/lib/utils";

/**
 * What ICEFALL's commercial terms currently are — and, mostly, that they are not
 * yet anything.
 *
 * THE REFERRAL RATE IS AN OPEN DECISION, NOT A MISSING ROW. Every other absence
 * in this CRM means "the database cannot be read" or "nothing has happened yet".
 * This one means the owner has not decided. So the two referral fields render as
 * NOT SET with no number in them at all — not a greyed-out candidate, not a
 * placeholder carried over from the pricing model. A figure sitting in a
 * settings field is read as the current setting no matter how faintly it is
 * drawn, and the first person to read one here would quote it to an operator.
 * No candidate rate appears anywhere in this file, including in these comments,
 * so there is nothing here for a later edit to promote into the UI by accident.
 *
 * NOTHING ON THIS SCREEN IS A SETTING THIS BUILD OWNS. There is no settings
 * table in the schema. Where a figure does appear it has been read back off the
 * records that already exist — the guide rate below is the rate stored on the
 * commission records themselves, not a rule those records were made to follow.
 * The label says so, because "the rate we charge" and "the rate we happened to
 * charge" diverge the moment somebody renegotiates.
 *
 * THE RATE CARD IS NOT THE PRICE ANYONE PAYS. Placement pricing is the published
 * asking price per mountain per position. What a company actually agreed is
 * stored on their placement and may be lower; this screen never reconciles the
 * two, because a rate card that silently reported real contract values would let
 * an editor here change what a signed placement appears to have cost.
 *
 * NO WRITE PATH EXISTS. Every field is a read-only row and the save control is
 * disabled. A live-looking form that discards what you type is worse than no
 * form: it invites somebody to believe they have set the referral rate.
 *
 * ── RE-SKIN (theme match, Sep 2026) ────────────────────────────────────────
 * The eight panel buttons are the same eight buttons in the same order; they
 * now wear the theme's nav-row treatment instead of a pill. The disabled
 * per-mountain toggle became the theme's own Switch — still disabled, still
 * carrying its reason — rather than being dropped for not fitting, and the
 * disabled Save button and its paragraph are untouched. The rate card table
 * moved into the theme's Table. No field gained an input it cannot write to.
 */

type PanelId =
  | "general"
  | "commission"
  | "pricing"
  | "notifications"
  | "email"
  | "integrations"
  | "security"
  | "appearance";

const PANELS: { id: PanelId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "commission", label: "Commission Rates" },
  { id: "pricing", label: "Placement Pricing" },
  { id: "notifications", label: "Notifications" },
  { id: "email", label: "Email Settings" },
  { id: "integrations", label: "Integrations" },
  { id: "security", label: "Security" },
  { id: "appearance", label: "Appearance" },
];

/** The five positions the rate card prices. Labels are literal — never assembled. */
const SLOTS: { position: number; label: string }[] = [
  { position: 1, label: "#1 Featured" },
  { position: 2, label: "#2" },
  { position: 3, label: "#3" },
  { position: 4, label: "#4" },
  { position: 5, label: "#5" },
];

/** Basis points are stored as integers; only the render divides. 600 → "6%". */
function formatBps(bps: number): string {
  const decimals = bps % 100 === 0 ? 0 : bps % 10 === 0 ? 1 : 2;
  return `${(bps / 100).toFixed(decimals)}%`;
}

/**
 * A settings field with no input in it.
 *
 * Deliberately not an `<input disabled>`: a disabled input still looks like a
 * control that will accept a value once something is unlocked, and there is
 * nothing to unlock. `value === null` prints the words "Not set" — never a
 * dimmed number, never an empty box, which reads as zero.
 */
function Field({ label, value, note }: { label: string; value: string | null; note: string }) {
  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">{label}</p>
      <div className="flex h-12 items-center rounded-lg border border-border bg-ui-muted px-4">
        {value === null ? (
          <span className="text-muted-foreground text-sm">Not set</span>
        ) : (
          <span className="font-medium text-xl tabular-nums tracking-tight">{value}</span>
        )}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{note}</p>
    </div>
  );
}

function PanelHead({ title, body, badge }: { title: string; body: string; badge?: ReactNode }) {
  return (
    <CardHeader>
      <CardTitle className="flex flex-wrap items-center gap-2.5 text-xl leading-snug">
        {title}
        {badge}
      </CardTitle>
      <CardDescription className="max-w-2xl leading-relaxed">{body}</CardDescription>
    </CardHeader>
  );
}

/**
 * The six panels the mockup draws that have nothing behind them.
 *
 * Each says what it would hold and why that is not stored, rather than sharing
 * one blanket sentence — "not configured yet" hides that email and integrations
 * are absent for completely different reasons, and only one of them is waiting
 * on a decision anybody here can take.
 */
const UNBUILT: Record<Exclude<PanelId, "commission" | "pricing">, { title: string; body: string; reason: string }> = {
  general: {
    title: "General",
    body: "Organisation details and the defaults every other module inherits.",
    reason:
      "Organisation name, contact address, default currency and timezone would live here. None of them is stored anywhere — this build has no settings table at all, so a form on this panel would be collecting values with nothing to write them to.",
  },
  notifications: {
    title: "Notifications",
    body: "Which events raise a task, and which desk they land on.",
    reason:
      "Tasks are raised today by a scheduled function that notifies and never acts — an expired placement produces a task, and a person moves the slot. The routing rules that would sit on this panel, deciding who is told about what, are not stored anywhere, so there is nothing to read back.",
  },
  email: {
    title: "Email Settings",
    body: "Sending domain, from-address and the templates staff mail goes out on.",
    reason:
      "This application sends no email. There is no sending domain, no from-address and no template, so every field on this panel would be empty of anything ICEFALL has actually configured.",
  },
  integrations: {
    title: "Integrations",
    body: "The outside services this CRM reads from or writes to.",
    reason:
      "Nothing is connected. No payment provider is live — which is the same reason invoices and payment status are absent elsewhere in this CRM — and nothing writes analytics events, which is why the funnel on the dashboard has no views figure. Listing an integration here as available would imply a connection that has never been made.",
  },
  security: {
    title: "Security",
    body: "Who reaches this CRM, and for how long.",
    reason:
      "Access is decided by the staff gate on sign-in and by the database's own row policies, neither of which is configurable from this screen. Session length, two-factor policy and address restrictions are not stored, so a control here would not be the thing actually granting access.",
  },
  appearance: {
    title: "Appearance",
    body: "Theme and density.",
    reason:
      "The interface has one appearance and no stored preference, for staff or for the workspace. A switch on this panel would be attached to nothing.",
  },
};

export default function Settings() {
  const [panel, setPanel] = useState<PanelId>("commission");

  const [commissions, setCommissions] = useState<Result<Commission[]>>(loading);
  const [prices, setPrices] = useState<Result<PlacementPrice[]>>(loading);
  const [mountains, setMountains] = useState<Result<Mountain[]>>(loading);

  useEffect(() => {
    void listCommissions().then(setCommissions);
    void listPlacementPrices().then(setPrices);
    void listDestinations().then(setMountains);
  }, []);

  const commissionReason =
    commissions.state === "unavailable" || commissions.state === "error"
      ? commissions.reason
      : commissions.state === "loading"
        ? "Reading commission records…"
        : "Not recorded";

  /**
   * The guide rate, read back off the records rather than off a rule.
   *
   * If the recorded rates disagree there is no single rate to show, and showing
   * one of them — the newest, the commonest — would be picking a winner the data
   * does not support.
   */
  const guideRate: { value: string | null; note: string } = (() => {
    if (commissions.state !== "ok") return { value: null, note: commissionReason };
    const rows = commissions.value.filter((c) => c.kind === "guide");
    if (rows.length === 0) {
      return {
        value: null,
        note: "No guide commission has been recorded, so there is no rate to read back. Nothing stores a configured rate — the figure here, when there is one, is the rate the existing records were computed with.",
      };
    }
    const rates = Array.from(new Set(rows.map((c) => c.rate_bps).filter((b): b is number => b !== null)));
    if (rates.length === 0) {
      return {
        value: null,
        note: `${rows.length} guide commission${rows.length === 1 ? "" : "s"} recorded, none of them carrying a rate. Those are broken records rather than free bookings.`,
      };
    }
    if (rates.length > 1) {
      return {
        value: null,
        note: `Guide commissions have been recorded at ${rates.length} different rates (${rates.map(formatBps).join(", ")}). There is no single agreed rate to show, and picking one of them would invent an agreement.`,
      };
    }
    return {
      value: formatBps(rates[0]),
      note: `Read back from ${rows.length} guide commission record${rows.length === 1 ? "" : "s"}. This is the rate those records were computed with — it is not a setting, and changing it here would not change them.`,
    };
  })();

  /**
   * A floor on a commission is a rule, and no rule of any kind is stored. The
   * smallest fee recorded so far is offered underneath as context for whoever
   * sets one — clearly as an observation, because a number inside the field
   * would read as the floor already being in force.
   */
  const floorContext: string | null = (() => {
    if (commissions.state !== "ok") return null;
    const rows = commissions.value;
    if (rows.length === 0) return "No commission has been recorded yet, so there is nothing to size a floor against.";
    const currency = rows[0].currency;
    if (!rows.every((r) => r.currency === currency)) {
      return "Commissions have been recorded in more than one currency and ICEFALL stores no exchange rate, so there is no single smallest amount to compare a floor against.";
    }
    const smallest = rows.reduce((n, r) => Math.min(n, r.amount_cents), rows[0].amount_cents);
    const drawn = formatCents(smallest, currency);
    if (drawn === null) return null;
    // Tied back to the record's own rate on purpose: the amount exists, but the
    // rate it was computed at is not an agreed rate, and this line must not read
    // as though it were.
    return `For whoever sets it: the smallest commission recorded so far is ${drawn}, at whatever rate that record was computed with. A floor above that figure would have changed what the booking earned.`;
  })();

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">Settings</h1>
        <p className="max-w-3xl text-muted-foreground text-sm">
          ICEFALL's commercial terms, as they actually stand. This build reads settings and cannot
          write them — there is no settings table behind this screen, so every field below is a
          read-only row.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections">
          <Card className="py-2">
            <CardContent className="px-2">
              <div className="flex flex-row flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
                {PANELS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPanel(p.id)}
                    aria-current={panel === p.id ? "page" : undefined}
                    className={cn(
                      "rounded-lg px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:w-full",
                      panel === p.id
                        ? "bg-ui-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-ui-muted hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </nav>

        <div className="min-w-0">
          {panel === "commission" && (
            <Card>
              <PanelHead
                title="Commission Rates"
                body="What ICEFALL charges on a booking it introduced. A rate is copied onto each commission at the moment that commission is computed, so agreeing one later can never move a figure already recorded."
                badge={
                  <Badge
                    variant="outline"
                    className="border-amber-500/20 bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400"
                  >
                    Decision outstanding
                  </Badge>
                }
              />

              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field
                    label="Expedition Referral Fee"
                    value={null}
                    note="Not agreed. No expedition referral fee can be calculated until it is."
                  />
                  <Field
                    label="Trek Referral Fee"
                    value={null}
                    note="Not agreed either, and separately so: this is its own field, and settling the expedition rate would not settle this one."
                  />
                </div>

                {/* Amber, and this is what amber is for: somebody has to decide
                    this before the referral stream can bill anything at all. */}
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-4">
                  <p className="font-medium text-amber-700 text-sm leading-relaxed dark:text-amber-400">
                    The referral rate has not been agreed. This is not a figure missing from the database — it is a
                    decision nobody has taken yet, which is why no number appears above, greyed out or otherwise.
                  </p>
                  <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                    Until a rate is agreed, no new referral commission can be computed from it and no referral fee can be
                    billed on a booking converted from here on. Whatever rate is chosen will be stored on each commission
                    record as that record is computed, and never looked up again afterwards — so agreeing one now cannot
                    move a figure any earlier booking is already recorded as having earned, and renegotiating later
                    cannot either.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field label="Guide Commission" value={guideRate.value} note={guideRate.note} />
                  <Field
                    label="Minimum Commission Amount"
                    value={null}
                    note="No floor is configured. Nothing in the schema stores one, so every commission recorded so far is the computed fee with nothing applied underneath it."
                  />
                </div>

                {floorContext && (
                  <p className="max-w-2xl text-muted-foreground text-xs leading-relaxed">{floorContext}</p>
                )}

                {/* A toggle that cannot be turned on, shown rather than hidden:
                    the mockup asks for it, and its absence is a schema fact worth
                    reading rather than a control quietly left out. */}
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Apply different rates by mountain</p>
                    <p className="mt-1 max-w-xl text-muted-foreground text-xs leading-relaxed">
                      Cannot be switched on here. A commission rule carries no mountain scope in this schema, so there is
                      nowhere to store a per-mountain rate — and the rate it would vary has not been agreed either.
                    </p>
                  </div>
                  {/* `data-[state=unchecked]:bg-input` is a CALL-SITE PATCH, not
                      a preference. The ported switch styles its off state with
                      `data-unchecked:bg-input`, but the Radix build in this app
                      emits `data-state="unchecked"` — so the track renders
                      transparent and the control disappears against the card.
                      An invisible disabled toggle is a lost control, and the
                      shared component is not this pass's to edit. */}
                  <Switch
                    checked={false}
                    disabled
                    aria-label="Apply different rates by mountain"
                    className="mt-0.5 data-[state=unchecked]:bg-input"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex-wrap items-center gap-3">
                <Button disabled>Save changes</Button>
                <p className="max-w-xl text-muted-foreground text-xs leading-relaxed">
                  Disabled, and shown rather than removed: there is no write path for settings in this build, and a
                  button that accepted a click and discarded it would let somebody leave believing the referral rate
                  had been set.
                </p>
              </CardFooter>
            </Card>
          )}

          {panel === "pricing" && (
            <Card>
              <PanelHead
                title="Placement Pricing"
                body="The published rate card: what a position on a mountain is offered at for a term. It is not what anyone is paying — the price agreed on a placement is stored on that placement, can differ from the figure here, and is never recalculated from this card."
              />
              <CardContent>
                <Resolve
                  result={prices}
                  what="published placement prices"
                  isEmpty={(v) => v.length === 0}
                  empty="No position has been priced yet. A rate card row is created when a price per position is published for a mountain."
                >
                  {(rows) => {
                    const byCell = new Map(rows.map((r) => [`${r.destination_id}:${r.slot_position}`, r]));
                    const names =
                      mountains.state === "ok" ? new Map(mountains.value.map((m) => [m.id, m.name])) : null;

                    const ids = Array.from(new Set(rows.map((r) => r.destination_id))).sort((a, b) =>
                      (names?.get(a) ?? a).localeCompare(names?.get(b) ?? b),
                    );

                    const priced = new Set(ids);
                    const unpriced =
                      mountains.state === "ok" ? mountains.value.filter((m) => !priced.has(m.id)) : null;

                    const outsideCard = rows.filter((r) => r.slot_position < 1 || r.slot_position > 5).length;

                    return (
                      <>
                        <div className="overflow-hidden rounded-lg border border-border">
                          <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="font-normal text-muted-foreground">Mountain</TableHead>
                                {SLOTS.map((s) => (
                                  <TableHead key={s.position} className="font-normal text-muted-foreground">
                                    {s.label}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {ids.map((id) => (
                                <TableRow key={id} className="border-border/60">
                                  <TableCell className="py-3 font-medium">
                                    {names?.get(id) ?? <span className="text-muted-foreground">{id}</span>}
                                  </TableCell>
                                  {SLOTS.map((s) => {
                                    const cell = byCell.get(`${id}:${s.position}`);
                                    return (
                                      <TableCell key={s.position} className="py-3 tabular-nums">
                                        {cell ? (
                                          formatCents(cell.price_cents, cell.currency)
                                        ) : (
                                          // Never blank and never a zero: a
                                          // position nobody has priced.
                                          <span className="text-muted-foreground">Not priced</span>
                                        )}
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        <div className="mt-3 space-y-1.5">
                          <p className="max-w-2xl text-muted-foreground text-xs leading-relaxed">
                            Position #1 is called Featured because it is a paid position, not because ICEFALL ranks the
                            company holding it above the others. Nothing on this card reflects demand or how many people
                            asked for a slot, and a blank cell is a position that has never been priced — not a free one.
                          </p>
                          {names === null && (
                            <p className="max-w-2xl text-muted-foreground text-xs leading-relaxed">
                              Mountain names could not be read, so each row is identified by its slug instead.
                            </p>
                          )}
                          {/* The denominator is the catalogue, not the rows above:
                              a price may reference a mountain the catalogue does not
                              list, and adding the two would overstate the total. */}
                          {unpriced !== null && mountains.state === "ok" && unpriced.length > 0 && (
                            <p className="max-w-2xl text-muted-foreground text-xs leading-relaxed">
                              {unpriced.length} of {mountains.value.length} mountains in the catalogue carry no
                              published rate at all and are absent from this card.
                            </p>
                          )}
                          {unpriced !== null && unpriced.length === 0 && (
                            <p className="max-w-2xl text-muted-foreground text-xs leading-relaxed">
                              Every mountain in the catalogue carries a published rate.
                            </p>
                          )}
                          {outsideCard > 0 && (
                            <p className="max-w-2xl text-amber-600 text-xs leading-relaxed dark:text-amber-400">
                              {outsideCard} published price{outsideCard === 1 ? " sits" : "s sit"} on a position outside
                              #1–#5 and {outsideCard === 1 ? "is" : "are"} not shown in this grid.
                            </p>
                          )}
                          <p className="max-w-2xl text-muted-foreground text-xs leading-relaxed">
                            Read-only. Publishing a new rate is not something this build can do, and editing a figure
                            here would not alter any placement already agreed at a different price.
                          </p>
                        </div>
                      </>
                    );
                  }}
                </Resolve>
              </CardContent>
            </Card>
          )}

          {panel !== "commission" && panel !== "pricing" && (
            <Card>
              <PanelHead title={UNBUILT[panel].title} body={UNBUILT[panel].body} />
              <CardContent>
                <Unavailable reason={UNBUILT[panel].reason} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
