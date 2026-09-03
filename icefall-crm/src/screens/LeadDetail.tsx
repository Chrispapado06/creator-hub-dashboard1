import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Wallet } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, Resolve, Unavailable } from "@/components/states";
import {
  listAuditEvents,
  listBookings,
  listCompanies,
  listCustomers,
  listLeads,
  listProducts,
  listStaff,
} from "@/data/queries";
import { formatCents, loading, type Result } from "@/data/result";
import type {
  AuditEvent,
  Booking,
  Company,
  CustomerRecord,
  Lead,
  LeadStatus,
  Product,
  StaffRecord,
} from "@/data/types";
import { cn, formatMoment, initials } from "@/lib/utils";

/**
 * One enquiry, and everything ICEFALL is actually allowed to know about it.
 *
 * THE CONVERSATION IS NOT ON THIS PAGE, AND THAT IS THE FEATURE. The messages
 * between a customer and an operator live in the shared messaging tables, where
 * reading a thread requires being a participant in it. A staff member opening a
 * lead is not a participant, so this screen shows that the thread exists and
 * refuses to show what is in it. Anything else would mean a customer describing
 * a bad experience with an operator is writing into a room the whole company can
 * read, which is a different product from the one they were offered.
 *
 * THE LIFECYCLE TIMELINE NEVER FILLS IN A GAP. A null `contacted_at` renders as
 * "not contacted yet", never as a date and never as the created date standing in
 * for it. It is also not proof the step did not happen: a lead can be moved
 * straight to a later stage, and the timeline says so underneath rather than
 * inviting the reader to conclude that nobody replied.
 *
 * THE BOOKING VALUE IS ONLY A FIGURE WHEN IT WAS REPORTED. `value_status` has
 * three states and only one of them carries money; a booking that converted but
 * whose worth nobody has confirmed reads "not yet reported", because a lead
 * showing €0 next to a confirmed booking is read as a worthless customer rather
 * than an unfinished record.
 *
 * ── THE RE-SKIN ───────────────────────────────────────────────────────────
 * Rebuilt on the reference theme's own record page: breadcrumb, an identity
 * header with the actions on the right, then line tabs over the panes. Two
 * controls MOVED rather than went — the "All leads" back button is now the
 * breadcrumb's Leads link, and the status control moved from beside the title
 * into the header's action slot as the theme's status badge.
 */

type Tab = "conversation" | "details" | "notes" | "activity";

// The mockup's order. The screen opens on Details rather than Conversation
// because Conversation has nothing to show and never will from here.
const TABS: { id: Tab; label: string }[] = [
  { id: "conversation", label: "Conversation" },
  { id: "details", label: "Details" },
  { id: "notes", label: "Notes" },
  { id: "activity", label: "Activity" },
];

// Mirrors the map in Leads.tsx, which does not export it. Literal state names,
// never one assembled from the status — Tailwind would emit nothing. Booked is
// settled, lost is refused, disputed is the one that wants somebody, and a lead
// still moving is neither good news nor bad.
const statusState = (s: LeadStatus): "ok" | "pending" | "bad" | "neutral" =>
  s === "booked" ? "ok" : s === "lost" ? "bad" : s === "disputed" ? "pending" : "neutral";

/**
 * A booking's own status, read the same three ways Bookings.tsx reads it. The
 * column is free text, so anything unrecognised stays neutral rather than being
 * guessed into a colour it has not earned.
 */
const bookingState = (status: string): "ok" | "bad" | "neutral" =>
  status === "completed" ? "ok" : status === "cancelled" ? "bad" : "neutral";

/** The theme's outline status badge, one class set per state. */
const STATE_CLASS: Record<"ok" | "pending" | "bad" | "neutral", { badge: string; dot: string }> = {
  ok: { badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  pending: { badge: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  bad: { badge: "border-destructive/20 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  neutral: { badge: "border-border bg-ui-muted/50 text-muted-foreground", dot: "bg-muted-foreground" },
};

function StatusBadge({ state, label }: { state: "ok" | "pending" | "bad" | "neutral"; label: string }) {
  const tone = STATE_CLASS[state];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium capitalize", tone.badge)}>
      <span className={cn("size-1.5 rounded-full", tone.dot)} />
      {label}
    </Badge>
  );
}

/**
 * THE LINE TAB, MADE TO WORK IN THIS BUILD — read this before "simplifying" it.
 *
 * `components/ui/tabs.tsx` is a verbatim port of the reference theme's Tabs, and
 * the theme expresses EVERY tab state through custom Tailwind variants that ship
 * in `shadcn/tailwind.css`: `data-active`, `data-horizontal`, `data-vertical`.
 * This app never imports that stylesheet — `shadcn` is not even a dependency —
 * so in the compiled CSS `data-horizontal` degrades to the literal attribute
 * `[data-horizontal]`, which nothing sets, and `data-active` is dropped
 * entirely. Two consequences, both verified on screen:
 *   · the Tabs root keeps `flex-direction: row`, so the list and the pane sit
 *     SIDE BY SIDE and the pane is squeezed to its minimum width;
 *   · an ACTIVE tab renders identically to an inactive one — no underline, no
 *     ink — because the whole active treatment hangs off `data-active`.
 * `flex-col` on the root and the classes below restate exactly what the theme's
 * variants would, against the `data-state` attribute Radix actually sets. They
 * are harmless once the import lands: same selectors, same values.
 */
const LINE_TAB =
  "after:inset-x-0 after:-bottom-[5px] after:h-0.5 data-[state=active]:text-foreground data-[state=active]:after:opacity-100";

/**
 * The stages a lead passes through, each read off its own column.
 *
 * `notReached` is deliberately a different sentence per stage: "not contacted
 * yet" and "no quote sent" tell whoever is reading which person owes the next
 * move, where a shared "—" would tell them nothing.
 */
const STAGES: { key: string; label: string; at: (l: Lead) => string | null; notReached: string }[] = [
  { key: "created", label: "Enquiry received", at: (l) => l.created_at, notReached: "No time recorded" },
  { key: "contacted", label: "Contacted", at: (l) => l.contacted_at, notReached: "Not contacted yet" },
  { key: "qualified", label: "Qualified", at: (l) => l.qualified_at, notReached: "Not qualified yet" },
  { key: "quoted", label: "Quoted", at: (l) => l.quoted_at, notReached: "No quote sent yet" },
  { key: "booked", label: "Booked", at: (l) => l.booked_at, notReached: "Not booked" },
  { key: "lost", label: "Lost", at: (l) => l.lost_at, notReached: "Not marked lost" },
];

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();

  const [leads, setLeads] = useState<Result<Lead[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  const [bookings, setBookings] = useState<Result<Booking[]>>(loading);
  const [customers, setCustomers] = useState<Result<CustomerRecord[]>>(loading);
  const [products, setProducts] = useState<Result<Product[]>>(loading);
  const [staff, setStaff] = useState<Result<StaffRecord[]>>(loading);
  const [audit, setAudit] = useState<Result<AuditEvent[]>>(loading);

  const [tab, setTab] = useState<Tab>("details");

  useEffect(() => {
    void listLeads().then(setLeads);
    void listCompanies().then(setCompanies);
    void listBookings().then(setBookings);
    void listCustomers().then(setCustomers);
    void listProducts().then(setProducts);
    void listStaff().then(setStaff);
    void listAuditEvents().then(setAudit);
  }, []);

  /**
   * Each directory is a separate read, and any of them can be missing while the
   * lead itself is perfectly readable. When one is, we print the identifier the
   * lead actually holds rather than "Unknown": the record exists and the lead
   * knows which one it is — this screen simply cannot spell its name yet.
   */
  // The record, where one was found, and the label separately. An avatar is
  // drawn only from a name the directory actually returned: initials struck from
  // a raw uuid would be initials of an identifier, dressed as a person.
  const companyOf = (cid: string): Company | undefined =>
    companies.state === "ok" ? companies.value.find((c) => c.id === cid) : undefined;

  const companyName = (cid: string): string => companyOf(cid)?.name ?? cid;

  const productName = (pid: string): string =>
    products.state === "ok" ? (products.value.find((p) => p.id === pid)?.name ?? pid) : pid;

  const customerOf = (cid: string): CustomerRecord | undefined =>
    customers.state === "ok" ? customers.value.find((c) => c.id === cid) : undefined;

  const staffOf = (sid: string): StaffRecord | undefined =>
    staff.state === "ok" ? staff.value.find((s) => s.profile_id === sid) : undefined;

  const staffName = (sid: string): string => staffOf(sid)?.name ?? sid;

  const eventsFor = (l: Lead): AuditEvent[] =>
    audit.state === "ok"
      ? audit.value.filter((e) => e.entity_type === "lead" && e.entity_id === l.id)
      : [];

  /**
   * The one money figure on this page, and the four separate reasons it may be
   * absent. They are kept apart because "this enquiry never converted" and "the
   * booking table could not be read" are opposite facts about the same lead.
   */
  const bookingFigure = (l: Lead): { value: string | null; reason: string } => {
    if (!l.booking_id) {
      return {
        value: null,
        reason:
          l.status === "lost"
            ? "This enquiry did not convert, so there is no booking to value."
            : "No booking has been attached to this enquiry yet.",
      };
    }
    if (bookings.state !== "ok") {
      return {
        value: null,
        reason: bookings.state === "loading" ? "Still reading the booking list." : bookings.reason,
      };
    }
    const b = bookings.value.find((x) => x.id === l.booking_id);
    if (!b) {
      return {
        value: null,
        reason: `The booking list was read but holds no record ${l.booking_id}. The enquiry references a booking this account cannot see.`,
      };
    }
    if (b.value_status !== "reported") {
      return {
        value: null,
        reason:
          "Not yet reported. The booking exists; what it was worth has not been confirmed, and an unconfirmed value is not a zero one.",
      };
    }
    return {
      value: formatCents(b.value_cents, b.currency),
      reason: "Marked as reported, but no amount was stored against the booking.",
    };
  };

  return (
    <Resolve result={leads} what="leads">
      {(all) => {
        const lead = all.find((l) => l.id === id);
        if (!lead) {
          return (
            <Empty
              what="This enquiry is not in the lead list"
              body="The list was read and holds no enquiry with the reference in this address. It may have been removed, or the address may be wrong — nothing is shown here rather than an empty record that would look like a real one."
            />
          );
        }

        const customer = customerOf(lead.customer_id);
        const raised = formatMoment(lead.created_at);
        const booking =
          lead.booking_id && bookings.state === "ok"
            ? bookings.value.find((b) => b.id === lead.booking_id)
            : undefined;
        const figure = bookingFigure(lead);
        const events = eventsFor(lead);
        // Named by the customer when the directory can be read, and by the
        // enquiry's own reference when it cannot. Never by a guess.
        const title = customer?.name ?? `Enquiry ${lead.id}`;

        return (
          <div className="flex flex-col gap-4 md:gap-6">
            {/* The "All leads" back button, moved into the breadcrumb the theme
                puts at the top of a record page. Still a link, still to the
                same place. */}
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to="/admin/leads">Leads</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                {/* Drawn only when the customer directory named somebody. An
                    avatar over "Enquiry 4f2c…" would be initials of a reference. */}
                {customer && (
                  <Avatar size="lg" className="shrink-0">
                    <AvatarFallback>{initials(customer.name)}</AvatarFallback>
                  </Avatar>
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h1 className="truncate font-heading font-semibold text-xl leading-6 tracking-tight sm:text-2xl sm:leading-7">
                    {title}
                  </h1>
                  <p className="max-w-3xl text-sm leading-5 text-muted-foreground">
                    {customer
                      ? `${customer.email} · enquired ${raised ?? "at an unrecorded time"}`
                      : `Enquired ${raised ?? "at an unrecorded time"}. The customer directory could not be read, so this page is named by the enquiry's own reference rather than by a name ICEFALL cannot currently confirm.`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge state={statusState(lead.status)} label={lead.status} />
              </div>
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex-col gap-0">
              <div className="no-scrollbar touch-pan-x overflow-x-auto overscroll-x-contain border-b">
                <TabsList variant="line" className="h-8 w-max min-w-full justify-start gap-4 *:data-[slot=tabs-trigger]:flex-none">
                  {TABS.map((t) => (
                    <TabsTrigger key={t.id} value={t.id} className={LINE_TAB}>
                      {t.label}
                      {/* Only Activity carries a count, and only when the log was
                          actually read. A "0" beside Conversation or Notes would
                          claim this screen had looked and found nothing. */}
                      {t.id === "activity" && audit.state === "ok" && (
                        <span className="text-muted-foreground tabular-nums">{events.length}</span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="details" className="flex flex-col gap-4 pt-4 md:gap-6">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                  <Card className="lg:col-span-3">
                    <CardHeader>
                      <CardTitle>Enquiry</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <dl className="grid gap-5 sm:grid-cols-2">
                        <Field
                          label="Customer"
                          absent="Not recorded"
                          value={
                            customer ? (
                              <span className="flex items-center gap-2.5">
                                <Avatar size="sm">
                                  <AvatarFallback className="text-[10px]">{initials(customer.name)}</AvatarFallback>
                                </Avatar>
                                <span>{customer.name}</span>
                              </span>
                            ) : (
                              lead.customer_id
                            )
                          }
                        />
                        <Field
                          label="Company"
                          absent="Not recorded"
                          value={
                            <span className="flex min-w-0 items-center gap-2.5">
                              {companyOf(lead.company_id) && (
                                <Avatar size="sm" className="after:rounded-sm">
                                  <AvatarFallback className="rounded-sm text-[10px]">
                                    {initials(companyName(lead.company_id))}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                              <Link
                                to={`/admin/companies/${lead.company_id}`}
                                className="truncate hover:underline"
                              >
                                {companyName(lead.company_id)}
                              </Link>
                            </span>
                          }
                        />
                        <Field
                          label="Mountain"
                          absent="No mountain was attached to this enquiry"
                          value={
                            lead.destination_id ? (
                              <Link to={`/admin/mountains/${lead.destination_id}`} className="hover:underline">
                                {lead.destination_id}
                              </Link>
                            ) : null
                          }
                        />
                        <Field
                          label="Product"
                          absent="No specific expedition or trek was named"
                          value={lead.product_id ? productName(lead.product_id) : null}
                        />
                        <Field
                          label="Source page"
                          absent="Unknown — the enquiry arrived without a recorded origin"
                          value={lead.source_page}
                        />
                        <Field
                          label="Assigned to"
                          absent="Nobody has been assigned to this enquiry"
                          value={
                            lead.assigned_to ? (
                              <span className="flex min-w-0 items-center gap-2.5">
                                {staffOf(lead.assigned_to) && (
                                  <Avatar size="sm">
                                    <AvatarFallback className="text-[10px]">
                                      {initials(staffName(lead.assigned_to))}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                                <span className="truncate">{staffName(lead.assigned_to)}</span>
                              </span>
                            ) : null
                          }
                        />
                      </dl>

                      {lead.status === "disputed" && (
                        <p className="text-sm leading-relaxed text-warn">
                          Attribution on this enquiry is disputed. Whether it converted through
                          ICEFALL is not settled, so it should not be counted as won or lost until
                          somebody resolves it.
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Lifecycle</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <ol>
                        {STAGES.map((s, i) => {
                          const at = s.at(lead);
                          // A stored timestamp that will not parse is still a
                          // stage that happened — it must not fall back to the
                          // "never reached" sentence.
                          const when = at ? (formatMoment(at) ?? "at an unrecorded time") : null;
                          return (
                            <li key={s.key} className="relative flex gap-3.5 pb-5 last:pb-0">
                              {i < STAGES.length - 1 && (
                                <span
                                  aria-hidden
                                  className="absolute top-5 bottom-0 left-[5.5px] w-px bg-border"
                                />
                              )}
                              <span
                                aria-hidden
                                className={cn(
                                  "relative mt-1.5 size-3 shrink-0 rounded-full",
                                  when ? "bg-primary" : "bg-ui-muted ring-1 ring-border",
                                )}
                              />
                              <div className="min-w-0">
                                <p className={cn("text-sm", when ? "font-medium" : "text-muted-foreground")}>
                                  {s.label}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                                  {when ?? s.notReached}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        A stage with no time was never recorded against this enquiry. That is not
                        the same as it never happening — a lead can be moved straight to a later
                        stage, and nothing here fills the gap in afterwards.
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {/* The figure, or the reason there isn't one. Never a dash and
                      never a zero: a lead showing €0 beside a confirmed booking
                      is read as a worthless customer rather than an unfinished
                      record. */}
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <div className="flex size-7 items-center justify-center rounded-lg border bg-ui-muted text-muted-foreground">
                          <Wallet className="size-4" />
                        </div>
                      </CardTitle>
                      <CardDescription>Booking value</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1">
                      {figure.value === null ? (
                        <p className="text-sm leading-snug text-muted-foreground">{figure.reason}</p>
                      ) : (
                        <>
                          <div className="font-medium text-3xl leading-none tracking-tight tabular-nums">
                            {figure.value}
                          </div>
                          {booking && (
                            <p className="text-sm text-muted-foreground">
                              Booking {booking.id} · attribution recorded as {booking.attribution_status}.
                            </p>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="sm:col-span-2">
                    <CardHeader>
                      <CardTitle>Outcome</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      {booking ? (
                        <dl className="grid gap-5 sm:grid-cols-3">
                          <Field label="Booking" absent="Not recorded" value={booking.id} />
                          <Field
                            label="Status"
                            absent="Not recorded"
                            value={
                              <StatusBadge
                                state={bookingState(booking.status)}
                                label={booking.status.replace(/_/g, " ")}
                              />
                            }
                          />
                          <Field
                            label="Booked"
                            absent="At an unrecorded time"
                            value={formatMoment(booking.booked_at)}
                          />
                        </dl>
                      ) : (
                        <p className="text-sm leading-relaxed text-muted-foreground">{figure.reason}</p>
                      )}
                      {lead.status === "lost" && (
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {lead.lost_reason ??
                            "No reason was given for the loss. The field is optional, so this enquiry closed without anyone saying why."}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="conversation" className="flex flex-col gap-4 pt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Message thread</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={
                        lead.thread_id
                          ? "font-medium text-sm tabular-nums"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      {lead.thread_id ?? "No message thread is attached to this enquiry."}
                    </p>
                  </CardContent>
                </Card>
                {/* The refusal, verbatim. It is not a toast and it does not
                    vanish: this is the product's rule, printed where the
                    conversation would otherwise be. */}
                <Unavailable
                  reason={
                    "The conversation is not readable from here. Messages between the customer and the " +
                    "operator live in the shared messaging tables, and reading a thread requires being a " +
                    "participant in it — a member of staff opening this page is not one. That is a " +
                    "deliberate rule rather than a missing feature: what a customer writes about their own " +
                    "experience of an operator is theirs, and a CRM that quietly reproduced it would be a " +
                    "different promise from the one they were given. If a thread genuinely needs staff " +
                    "eyes, it is escalated into a support ticket by someone who is in it."
                  }
                />
              </TabsContent>

              <TabsContent value="notes" className="pt-4">
                <Unavailable
                  reason={
                    "No internal notes are shown, because no read is wired to them yet. Notes are stored " +
                    "apart from the message thread on purpose — that separation is the only thing keeping a " +
                    "candid internal remark out of what the customer and the operator can see, and it is " +
                    "worth more than the convenience of holding both in one table. Until the notes read " +
                    "exists, this tab shows nothing rather than borrowing the conversation to fill itself."
                  }
                />
              </TabsContent>

              <TabsContent value="activity" className="pt-4">
                <Resolve
                  result={audit}
                  what="activity"
                  isEmpty={() => events.length === 0}
                  empty="Nothing has been recorded against this enquiry. The audit log holds staff actions, so a lead that has only been moved through its stages by the marketplace itself leaves no entry here. Anything done to the booking is recorded against the booking, not against the lead."
                >
                  {() => (
                    <Card className="w-0 min-w-full">
                      <CardContent className="px-0">
                        <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="h-11 font-medium text-muted-foreground">When</TableHead>
                              <TableHead className="h-11 font-medium text-muted-foreground">Action</TableHead>
                              <TableHead className="h-11 font-medium text-muted-foreground">Who</TableHead>
                              <TableHead className="h-11 font-medium text-muted-foreground">Reason</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {events.map((e) => (
                              <TableRow key={e.id} className="border-border/60 align-top">
                                <TableCell className="py-4 text-muted-foreground tabular-nums">
                                  {formatMoment(e.created_at) ?? (
                                    <span className="text-muted-foreground">At an unrecorded time</span>
                                  )}
                                </TableCell>
                                <TableCell className="py-4">
                                  <Badge variant="outline" className="rounded-full px-2.5">{e.action}</Badge>
                                </TableCell>
                                <TableCell className="py-4">
                                  <div className="flex items-center gap-3">
                                    {/* Struck from the staff name where the
                                        directory had one, and otherwise from the
                                        desk the log recorded — never from a uuid. */}
                                    <Avatar>
                                      <AvatarFallback className="text-xs">
                                        {initials(
                                          (e.actor_id ? staffOf(e.actor_id)?.name : undefined) ??
                                            (e.actor_role ?? "").replace(/_/g, " "),
                                        )}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                      <p className="font-medium text-sm">
                                        {e.actor_id ? (
                                          staffName(e.actor_id)
                                        ) : (
                                          <span className="font-normal text-muted-foreground">
                                            No actor recorded
                                          </span>
                                        )}
                                      </p>
                                      {e.actor_role && (
                                        <p className="mt-0.5 text-xs text-muted-foreground">{e.actor_role}</p>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                {/* "None given" is the field being optional, not
                                    a missing read. It is not "N/A". */}
                                <TableCell className="py-4 text-muted-foreground">
                                  {e.reason ?? <span className="text-faint">None given</span>}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </Resolve>
              </TabsContent>
            </Tabs>
          </div>
        );
      }}
    </Resolve>
  );
}

/**
 * One labelled fact, or the sentence explaining its absence.
 *
 * `absent` is a required argument rather than a defaulted dash: whoever adds a
 * field has to decide what it means for that field to be missing.
 */
function Field({ label, value, absent }: { label: string; value: ReactNode; absent: string }) {
  const missing = value === null || value === undefined || value === "";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 text-sm", missing && "text-muted-foreground")}>
        {missing ? absent : value}
      </dd>
    </div>
  );
}
