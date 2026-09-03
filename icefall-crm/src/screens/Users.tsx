import { useEffect, useState, type ReactNode } from "react";
import { PieChart, ShieldAlert, UserRound, UserRoundX, Users as UsersIcon } from "lucide-react";
import { Avatar } from "@/components/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, Resolve, Unavailable } from "@/components/states";
import { listCustomers, listLeads } from "@/data/queries";
import { formatRatio, loading, type Result } from "@/data/result";
import type { CustomerRecord, Lead } from "@/data/types";
import { formatDay, formatMoment } from "@/lib/utils";

/**
 * The customer database — the people who use ICEFALL, as distinct from the
 * companies that sell through it.
 *
 * THERE IS NO SUBSCRIPTION COLUMN. ICEFALL has no subscription product and no
 * payment processor, so nobody is on a tier — not a paid one, and not a free one
 * either. Printing "Free" would assert that a paid tier exists alongside it and
 * that this person is not on it, which is a product decision the company has not
 * made. The column is omitted rather than filled with a page of identical
 * absences: an absence repeated down a column reads as a data-entry backlog
 * somebody could clear, when the truth is that there is nothing to enter and no
 * amount of work here would change it. The sentence at the foot of the page says
 * it once, in the place where it can be read as the fact it is.
 *
 * THERE IS NO LAST-ACTIVE COLUMN EITHER. `last_active_at` is null for every
 * customer because nothing writes it — no sign-in, no app open, no page view is
 * recorded anywhere in ICEFALL. Rendering "never" would turn missing
 * instrumentation into a claim about a person's behaviour, and it is exactly the
 * claim on which somebody suspends an account. In its place the table carries
 * LAST ENQUIRY, which is a real event with a real timestamp: the most recent
 * lead ICEFALL holds for that customer. It is not a sign-in and it does not
 * pretend to be one.
 *
 * THE COUNTS HERE ARE HONEST ZEROS. A customer with no bookings has made none —
 * that figure is a count of rows that exist, not a measurement that failed to
 * arrive. When the directory itself cannot be read the tiles carry no number at
 * all and give the reason instead, because "nobody has registered" and "we could
 * not reach the customer table" are not the same news.
 *
 * LAYOUT: the reference theme's own users page, 1:1 — metric cards across the
 * top, then ONE card holding the title, the filter row and the table, with the
 * standing footnote in the card's footer. Not one column, tab or sentence was
 * dropped to fit it.
 */

type Tab = "all" | CustomerRecord["status"];

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "suspended", label: "Suspended" },
];

/**
 * The theme's metric card, with ICEFALL's honesty contract intact: `value` of
 * null prints the REASON there is no figure — never a dash, never a zero
 * standing in for one. A measured zero prints as "0".
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
    <Card className="min-w-0">
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
          <p className="text-sm leading-relaxed text-muted-foreground">{reason ?? "Not recorded"}</p>
        ) : (
          <>
            <div className="font-medium text-3xl leading-none tracking-tight tabular-nums">{value}</div>
            {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The theme's status badge: hairline outline, a coloured dot, the word as it
 *  is stored. Nothing here reworded a status. */
function AccountBadge({ status }: { status: CustomerRecord["status"] }) {
  const suspended = status === "suspended";
  return (
    <Badge
      className={
        suspended
          ? "gap-1.5 border border-bad/20 bg-bad/10 px-2 py-1 font-medium text-bad"
          : "gap-1.5 border border-ok/20 bg-ok/10 px-2 py-1 font-medium text-ok"
      }
      variant="outline"
    >
      <span className={`size-1.5 rounded-full ${suspended ? "bg-bad" : "bg-ok"}`} />
      {status}
    </Badge>
  );
}

export default function Users() {
  const [customers, setCustomers] = useState<Result<CustomerRecord[]>>(loading);
  const [leads, setLeads] = useState<Result<Lead[]>>(loading);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    void listCustomers().then(setCustomers);
    void listLeads().then(setLeads);
  }, []);

  // Narrow once. Never `?? []` — an unreadable directory must not arrive at the
  // tiles disguised as an empty one.
  const roster = customers.state === "ok" ? customers.value : null;

  const customerReason =
    customers.state === "loading"
      ? "Still reading the customer directory."
      : customers.state === "unavailable" || customers.state === "error"
        ? customers.reason
        : "Not recorded";

  const leadReason =
    leads.state === "loading"
      ? "Still reading the lead table."
      : leads.state === "unavailable" || leads.state === "error"
        ? leads.reason
        : "Not recorded";

  // Who has enquired is read from the lead table itself rather than from the
  // counter on the customer row, because the leads are the records and the
  // counter is a summary of them.
  const enquirers = leads.state === "ok" ? new Set(leads.value.map((l) => l.customer_id)) : null;
  const enquired = roster && enquirers ? roster.filter((c) => enquirers.has(c.id)).length : null;

  // A share with no customers to divide by is unavailable, not 0%.
  const share =
    roster && enquired !== null
      ? formatRatio({ numerator: enquired, denominator: roster.length })
      : null;

  const lastEnquiry = (c: CustomerRecord) => {
    if (leads.state !== "ok") return <span className="text-muted-foreground">Unavailable</span>;
    const theirs = leads.value.filter((l) => l.customer_id === c.id);
    if (theirs.length === 0) {
      // Not "never active" — only that no enquiry of theirs is on file.
      return <span className="text-muted-foreground">No enquiry on file</span>;
    }
    const latest = theirs.reduce((best, l) =>
      new Date(l.created_at).getTime() > new Date(best.created_at).getTime() ? l : best,
    );
    return (
      formatMoment(latest.created_at) ?? (
        <span className="text-muted-foreground">At an unrecorded time</span>
      )
    );
  };

  return (
    /* `@container` is load-bearing, not decoration: it gives this box size
       containment in the inline axis, so a wide table scrolls inside its own
       card instead of pushing the whole page sideways and clipping its last
       column. The reference theme gets the same result from an
       `overflow-x-hidden` on its page container. */
    <div className="@container/page flex min-w-0 flex-col gap-4">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl tracking-tight">Users</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Every person who holds an ICEFALL account, with the enquiries and bookings attributed to
            them. This is the customer side of the marketplace — the operators they enquire with live
            under Companies.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
        <Metric
          icon={<UsersIcon className="size-4" />}
          label="Customers"
          value={roster ? String(roster.length) : null}
          reason={customerReason}
          hint="Accounts on the directory, active and suspended together."
        />
        <Metric
          icon={<UserRoundX className="size-4" />}
          label="Suspended accounts"
          value={roster ? String(roster.filter((c) => c.status === "suspended").length) : null}
          reason={customerReason}
          hint="Set by an administrator. Everyone else is active."
        />
        <Metric
          icon={<UserRound className="size-4" />}
          label="Customers who have enquired"
          value={enquired === null ? null : String(enquired)}
          reason={roster === null ? customerReason : leadReason}
          hint="Counted from the lead table, not from the counter on the customer record."
        />
        <Metric
          icon={<PieChart className="size-4" />}
          label="Share who have enquired"
          value={share}
          reason={
            roster === null
              ? customerReason
              : enquired === null
                ? leadReason
                : "No customers to divide by"
          }
        />
      </div>

      {/* Kept whole. The theme's Alert is the closest thing it owns to a
          standing notice, so the sentence moved into one rather than losing
          its box. */}
      <Alert>
        <ShieldAlert />
        <AlertTitle>Personal data — staff only</AlertTitle>
        <AlertDescription className="max-w-3xl leading-relaxed">
          This page shows real people&rsquo;s names, email addresses and countries. It is part of the
          internal CRM and is never bundled into the customer app or the operator portal. Export it,
          paste it into a message or hand it to an operator and it has left ICEFALL&rsquo;s control —
          an operator is entitled to the customers who enquired with them, not to the directory.
        </AlertDescription>
      </Alert>

      <Resolve
        result={customers}
        what="customers"
        isEmpty={(v) => v.length === 0}
        empty="Nobody holds an ICEFALL account yet. A record appears here when a person registers, and their enquiries and bookings attach to it from that point on."
      >
        {(list) => {
          const shown = tab === "all" ? list : list.filter((c) => c.status === tab);
          return (
            <Card className="min-w-0">
              <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
                <CardTitle className="text-xl leading-none">Customers</CardTitle>
                <CardDescription className="max-w-sm leading-snug">
                  The directory, filtered by account status.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 px-0">
                {/* The account-status filter. Same three tabs, same counts, same
                    behaviour — drawn as the theme draws a segmented filter. */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4">
                  <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
                    <TabsList>
                      {TABS.map((t) => {
                        const n = t.id === "all" ? list.length : list.filter((c) => c.status === t.id).length;
                        return (
                          <TabsTrigger
                            key={t.id}
                            value={t.id}
                            /* The chosen filter has to LOOK chosen. The ported
                               tabs component styles its active trigger with
                               `data-active:`, which this build's Tailwind does
                               not map onto Radix's `data-state="active"` — so
                               active and inactive render identically and the
                               reader cannot tell which filter is applied. These
                               three classes are the theme's own active
                               treatment (white pill, ink text, small shadow)
                               written through a selector that works here. */
                            className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                          >
                            {t.label}
                            <span className="text-muted-foreground tabular-nums">{n}</span>
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </Tabs>
                  <div className="text-sm tabular-nums text-muted-foreground">
                    {shown.length} shown
                  </div>
                </div>

                {shown.length === 0 ? (
                  <div className="px-4">
                    <Empty
                      what="No customers with this account status"
                      body="Every customer ICEFALL holds is under one of the other tabs — the count beside each name says where they are."
                    />
                  </div>
                ) : (
                  <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
                    <TableHeader className="[&_tr]:border-t">
                      <TableRow>
                        <TableHead className="py-4 font-normal">Customer</TableHead>
                        <TableHead className="py-4 font-normal">Country</TableHead>
                        <TableHead className="py-4 font-normal">Joined</TableHead>
                        <TableHead className="py-4 font-normal">Mountain interests</TableHead>
                        <TableHead className="py-4 font-normal">Leads</TableHead>
                        <TableHead className="py-4 font-normal">Bookings</TableHead>
                        <TableHead className="py-4 font-normal">Last enquiry</TableHead>
                        <TableHead className="py-4 font-normal">Account</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((c) => (
                        <TableRow key={c.id} className="border-border/60">
                          <TableCell className="py-4 align-middle">
                            <div className="flex items-center gap-3">
                              <Avatar name={c.name} size={40} />
                              <div className="grid min-w-0 gap-0.5">
                                <span className="font-medium">{c.name}</span>
                                <span className="text-xs text-muted-foreground">{c.email}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-4 align-middle text-muted-foreground">
                            {c.country ?? <span className="text-muted-foreground">Not recorded</span>}
                          </TableCell>
                          <TableCell className="py-4 align-middle tabular-nums text-muted-foreground">
                            {formatDay(c.joined_on) ?? <span className="text-muted-foreground">Not recorded</span>}
                          </TableCell>
                          <TableCell className="py-4 align-middle whitespace-normal">
                            {c.mountain_interests.length === 0 ? (
                              <span className="text-muted-foreground">None recorded</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {c.mountain_interests.map((m) => (
                                  <Badge key={m} className="rounded-sm" variant="outline">
                                    {m}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          {/* Counts, not measurements. A zero here means none. */}
                          <TableCell className="py-4 align-middle font-medium tabular-nums">{c.leads}</TableCell>
                          <TableCell className="py-4 align-middle font-medium tabular-nums">{c.bookings}</TableCell>
                          <TableCell className="py-4 align-middle tabular-nums text-muted-foreground">
                            {lastEnquiry(c)}
                          </TableCell>
                          <TableCell className="py-4 align-middle">
                            <AccountBadge status={c.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
              {shown.length > 0 && (
                /* The standing footnote. It did not shrink and it did not move
                   off the screen — the theme has a card footer, so it lives
                   there now, still attached to the table it describes. */
                <CardFooter>
                  <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
                    Mountain interests are the identifiers the customer chose, printed as they are
                    stored — this screen does not read the mountain list, so it does not guess at a
                    display name. Leads and Bookings are the customer record&rsquo;s own counters; Last
                    enquiry is read from the lead table, so a customer whose enquiries ICEFALL cannot
                    currently read shows the absence rather than a date.
                  </p>
                </CardFooter>
              )}
            </Card>
          );
        }}
      </Resolve>

      <Unavailable
        reason={
          "Subscription status and last active are not shown. ICEFALL sells no subscription and " +
          "runs no payment processor, so there is no tier a customer could be on — a column " +
          "reading \"Free\" would assert a paid tier beside it that does not exist. Nothing " +
          "records sign-ins, sessions or app opens either, so last active would be \"never\" for " +
          "everyone: an absence of instrumentation printed as a statement about the person. Both " +
          "arrive with the systems that would measure them, and neither is estimated in the " +
          "meantime. Last enquiry is shown instead, because an enquiry is an event ICEFALL " +
          "actually witnessed."
        }
      />
    </div>
  );
}
