import { useEffect, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  PageHead,
  Pill,
  SectionLabel,
  Stat,
  StatusChip,
  TableCard,
} from "@/components/ui";
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
 */

type Tab = "all" | CustomerRecord["status"];

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "suspended", label: "Suspended" },
];

/** The mockup's table metrics: roomy gutters, a tall row, a quiet header. */
const TH = "px-5 py-3.5 text-[12px] font-semibold text-faint";
const TD = "px-5 py-3.5";

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
    if (leads.state !== "ok") return <span className="text-faint">Unavailable</span>;
    const theirs = leads.value.filter((l) => l.customer_id === c.id);
    if (theirs.length === 0) {
      // Not "never active" — only that no enquiry of theirs is on file.
      return <span className="text-faint">No enquiry on file</span>;
    }
    const latest = theirs.reduce((best, l) =>
      new Date(l.created_at).getTime() > new Date(best.created_at).getTime() ? l : best,
    );
    return (
      formatMoment(latest.created_at) ?? <span className="text-faint">At an unrecorded time</span>
    );
  };

  return (
    <>
      <PageHead
        title="Users"
        subtitle="Every person who holds an ICEFALL account, with the enquiries and bookings attributed to them. This is the customer side of the marketplace — the operators they enquire with live under Companies."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          tone="butter"
          label="Customers"
          value={roster ? String(roster.length) : null}
          reason={customerReason}
          hint="Accounts on the directory, active and suspended together."
        />
        <Stat
          tone="sky"
          label="Suspended accounts"
          value={roster ? String(roster.filter((c) => c.status === "suspended").length) : null}
          reason={customerReason}
          hint="Set by an administrator. Everyone else is active."
        />
        <Stat
          tone="lilac"
          label="Customers who have enquired"
          value={enquired === null ? null : String(enquired)}
          reason={roster === null ? customerReason : leadReason}
          hint="Counted from the lead table, not from the counter on the customer record."
        />
        <Stat
          tone="mint"
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

      <Card className="mt-3">
        <SectionLabel>Personal data — staff only</SectionLabel>
        <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
          This page shows real people&rsquo;s names, email addresses and countries. It is part of the
          internal CRM and is never bundled into the customer app or the operator portal. Export it,
          paste it into a message or hand it to an operator and it has left ICEFALL&rsquo;s control —
          an operator is entitled to the customers who enquired with them, not to the directory.
        </p>
      </Card>

      <div className="mt-6">
        <Resolve
          result={customers}
          what="customers"
          isEmpty={(v) => v.length === 0}
          empty="Nobody holds an ICEFALL account yet. A record appears here when a person registers, and their enquiries and bookings attach to it from that point on."
        >
          {(list) => {
            const shown = tab === "all" ? list : list.filter((c) => c.status === tab);
            return (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  {TABS.map((t) => {
                    const n = t.id === "all" ? list.length : list.filter((c) => c.status === t.id).length;
                    return (
                      <Button
                        key={t.id}
                        size="sm"
                        variant={tab === t.id ? "secondary" : "ghost"}
                        aria-pressed={tab === t.id}
                        onClick={() => setTab(t.id)}
                      >
                        {t.label}
                        <span className="tnum text-[11.5px] font-semibold text-faint">{n}</span>
                      </Button>
                    );
                  })}
                </div>

                {shown.length === 0 ? (
                  <Empty
                    what="No customers with this account status"
                    body="Every customer ICEFALL holds is under one of the other tabs — the count beside each name says where they are."
                  />
                ) : (
                  <>
                    <TableCard>
                      <table className="w-full min-w-[1020px] text-[13px]">
                        <thead>
                          <tr className="border-b border-line-soft text-left">
                            <th className={TH}>Customer</th>
                            <th className={TH}>Country</th>
                            <th className={TH}>Joined</th>
                            <th className={TH}>Mountain interests</th>
                            <th className={TH}>Leads</th>
                            <th className={TH}>Bookings</th>
                            <th className={TH}>Last enquiry</th>
                            <th className={TH}>Account</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((c) => (
                            <tr key={c.id} className="border-b border-line-soft last:border-0 hover:bg-raised">
                              <td className={TD}>
                                <div className="flex items-center gap-3">
                                  <Avatar name={c.name} size={34} />
                                  <div className="min-w-0">
                                    <p className="font-medium text-ink">{c.name}</p>
                                    <p className="text-[12px] text-faint">{c.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className={`${TD} text-muted`}>
                                {c.country ?? <span className="text-faint">Not recorded</span>}
                              </td>
                              <td className={`tnum whitespace-nowrap ${TD} text-muted`}>
                                {formatDay(c.joined_on) ?? <span className="text-faint">Not recorded</span>}
                              </td>
                              <td className={TD}>
                                {c.mountain_interests.length === 0 ? (
                                  <span className="text-faint">None recorded</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {c.mountain_interests.map((m) => (
                                      <Pill key={m}>{m}</Pill>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className={`tnum ${TD} text-[15px] font-bold tracking-[-0.02em] text-ink`}>
                                {c.leads}
                              </td>
                              <td className={`tnum ${TD} text-[15px] font-bold tracking-[-0.02em] text-ink`}>
                                {c.bookings}
                              </td>
                              <td className={`tnum whitespace-nowrap ${TD} text-muted`}>
                                {lastEnquiry(c)}
                              </td>
                              <td className={TD}>
                                <StatusChip
                                  state={c.status === "suspended" ? "bad" : "ok"}
                                  label={c.status}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableCard>
                    <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-faint">
                      Mountain interests are the identifiers the customer chose, printed as they are
                      stored — this screen does not read the mountain list, so it does not guess at a
                      display name. Leads and Bookings are the customer record&rsquo;s own counters; Last
                      enquiry is read from the lead table, so a customer whose enquiries ICEFALL cannot
                      currently read shows the absence rather than a date.
                    </p>
                  </>
                )}
              </>
            );
          }}
        </Resolve>
      </div>

      <div className="mt-6">
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
    </>
  );
}
