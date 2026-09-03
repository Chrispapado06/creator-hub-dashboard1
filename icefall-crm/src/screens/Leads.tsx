import { useEffect, useState } from "react";
import { BadgeCheck, CalendarCheck, FileText, Inbox, Percent, Send } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EnquiryQueue } from "@/components/EnquiryQueue";
import { Resolve } from "@/components/states";
import { listLeads } from "@/data/queries";
import { formatRatio, loading, type Ratio, type Result } from "@/data/result";
import type { Lead, LeadStatus } from "@/data/types";
import { cn, formatMoment, initials } from "@/lib/utils";

/**
 * The five stages, in order. The tone that used to hang off each of these is
 * gone: the reference theme paints every stat tile the same neutral and marks
 * the tile with a small outlined ICON SQUARE instead of a pastel fill, so the
 * icon is what tells the five apart now. Nothing is encoded in colour here that
 * is not also written in words.
 */
const PIPELINE: { id: LeadStatus; label: string; icon: React.ReactNode }[] = [
  { id: "new", label: "New", icon: <Inbox className="size-4" /> },
  { id: "contacted", label: "Contacted", icon: <Send className="size-4" /> },
  { id: "qualified", label: "Qualified", icon: <BadgeCheck className="size-4" /> },
  { id: "quoted", label: "Quoted", icon: <FileText className="size-4" /> },
  { id: "booked", label: "Booked", icon: <CalendarCheck className="size-4" /> },
];

/**
 * The status control's four states, holding exactly the meanings the older
 * pill carried: booked is settled, lost is refused, disputed is the one that
 * wants somebody, and a lead still moving is neither good news nor bad.
 */
const statusState = (s: LeadStatus): "ok" | "pending" | "bad" | "neutral" =>
  s === "booked" ? "ok" : s === "lost" ? "bad" : s === "disputed" ? "pending" : "neutral";

/**
 * The reference theme's status badge, copied off its own users table: an
 * outline badge with a filled dot, one class set per state. It replaces the
 * older filled-circle chip, and it carries the same four states and the same
 * word. The chevron the old chip drew is not reproduced — it was decorative,
 * `aria-hidden`, and pointed at a menu this build has never had.
 */
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
 * One headline figure, in the reference theme's own stat-tile shape: an outlined
 * icon square, a quiet label, and a large tabular number.
 *
 * `value` of `null` renders `reason` in muted text — NEVER a dash and never a
 * zero. This is the smallest place the honesty doctrine lives: a dashboard is
 * read as fact by default, so a tile that cannot say what it means has to say
 * why. The theme's tile has one slot for a sentence under the number and the
 * reason takes it, in place of the number rather than beside it.
 */
function StatTile({
  icon,
  label,
  value,
  reason,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  reason?: string;
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
      <CardContent>
        {value === null ? (
          <p className="text-sm leading-snug text-muted-foreground">{reason ?? "Not recorded"}</p>
        ) : (
          <div className="font-medium text-3xl leading-none tracking-tight tabular-nums">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Every enquiry, and where it got to.
 *
 * THE CONVERSION RATE IS A RATIO, NOT A NUMBER, until the moment it is drawn.
 * With no enquiries there is no conversion rate — it is unavailable, not 0%.
 * Those two render differently on purpose: 0% says the marketplace is failing,
 * "no enquiries yet" says nobody has asked. A founder reading the first when the
 * second is true would change the product to fix a problem that does not exist.
 */
export default function Leads() {
  const [result, setResult] = useState<Result<Lead[]>>(loading);
  useEffect(() => {
    void listLeads().then(setResult);
  }, []);

  const conversion = (leads: Lead[]): Ratio => ({
    numerator: leads.filter((l) => l.status === "booked").length,
    denominator: leads.length,
  });

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl tracking-tight">Leads</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Who is waiting on us right now — every enquiry from every app, longest wait first — and
            beneath it, the lead records with their attribution preserved.
          </p>
        </div>
      </div>

      <EnquiryQueue />

      <Resolve
        result={result}
        what="leads"
        isEmpty={(v) => v.length === 0}
        empty="No enquiries have been made yet. A lead is created automatically when a customer enquires."
      >
        {(leads) => {
          const rate = conversion(leads);
          const drawn = formatRatio(rate);
          return (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {PIPELINE.map((s) => (
                  <StatTile
                    key={s.id}
                    icon={s.icon}
                    label={s.label}
                    value={leads.filter((l) => l.status === s.id).length.toLocaleString("en-GB")}
                  />
                ))}
                <StatTile
                  icon={<Percent className="size-4" />}
                  label="Conversion"
                  value={drawn}
                  reason="No enquiries to divide by"
                />
              </div>

              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Each stage tile counts the enquiries sitting at that status now, not the enquiries
                that ever reached it. Lost and disputed enquiries sit at neither, so the five stages
                do not add up to the total — while the conversion divides bookings by every enquiry,
                including those two.
              </p>

              {/* `w-0 min-w-full` keeps a wide table inside its own scroll
                  container: without it the nowrap cells report their
                  max-content width up through the shell's flex column and drag
                  the whole page into a horizontal scroll. */}
              <Card className="w-0 min-w-full">
                <CardHeader className="border-b">
                  {/* The section label the old layout printed above this block,
                      moved into the card header the theme puts a title in. No
                      description is added: the list's order is whatever the read
                      returned, and a subtitle claiming otherwise would be a
                      sentence nothing verifies. */}
                  <CardTitle className="leading-none">Lead records</CardTitle>
                </CardHeader>
                <CardContent className="px-0">
                  <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4 **:data-[slot='table-cell']:py-4">
                    <TableHeader className="**:data-[slot='table-head']:h-11 **:data-[slot='table-head']:font-medium **:data-[slot='table-head']:text-foreground **:data-[slot='table-head']:text-sm">
                      <TableRow>
                        <TableHead>Mountain</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Why lost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="**:data-[slot='table-row']:border-border/50">
                      {leads.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            {/* An enquiry with no mountain on it still gets the square, so the
                                column stays a column — but the square is empty and the words
                                next to it say so, rather than a plausible-looking initial. */}
                            <span className="flex items-center gap-3">
                              <Avatar className="after:rounded-sm">
                                <AvatarFallback className="rounded-sm text-xs">
                                  {l.destination_id ? initials(l.destination_id) : ""}
                                </AvatarFallback>
                              </Avatar>
                              {l.destination_id ? (
                                <span className="font-medium">{l.destination_id}</span>
                              ) : (
                                <span className="text-muted-foreground">Not recorded</span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {formatMoment(l.created_at)}
                          </TableCell>
                          <TableCell>
                            {l.source_page ? (
                              <Badge variant="outline" className="rounded-full px-2.5">
                                {l.source_page}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">Unknown</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge state={statusState(l.status)} label={l.status} />
                          </TableCell>
                          {/* The em dash is load-bearing: no reason was recorded. It is not
                              "N/A" and it is not "None" — the field is optional and nobody
                              filled it in. */}
                          <TableCell className="text-muted-foreground">
                            {l.lost_reason ?? <span className="text-faint">—</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          );
        }}
      </Resolve>
    </div>
  );
}
