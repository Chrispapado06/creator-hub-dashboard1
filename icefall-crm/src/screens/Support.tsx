import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Inbox, LifeBuoy, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Resolve } from "@/components/states";
import { listIntake, listStaff, listTickets, triageIntake } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { IntakeRequest, OriginApp, RequesterKind, StaffRecord, Ticket, TicketStatus } from "@/data/types";
import { cn, formatMoment, initials } from "@/lib/utils";
import { useStaff } from "@/auth/session";

/**
 * The support desk — sectioned by WHO ASKED, which is the owner's ask verbatim:
 * "if I send a message to support via app, I should receive it in the company
 * CRM at app users section."
 *
 * `requester_kind` is stamped on the row at write time by `open_support_ticket`
 * and never accepted from a client, so the sections need no join and cannot be
 * gamed. `origin_app` is a FILTER within a section, not a section of its own —
 * an athlete's billing question gets the same answer from the same person
 * whether they typed it on a phone or a laptop; splitting the desk by surface
 * doubles the queues without changing an answer.
 *
 * THE INTAKE QUEUE IS NOT A TICKET LIST and this screen never calls it one.
 * Visitors with no account land in `support_intake` (insert-only, unreadable by
 * its writers); staff turn a request into a real ticket, and only then does it
 * have a reference, a status and a conversation.
 *
 * NO RESPONSE-TIME PROMISE ANYWHERE. `first_response_at` exists and is empty
 * because nothing has ever been answered; when it has data the number can be
 * stated, and not before.
 *
 * ── LAYOUT (2026-09-03) ────────────────────────────────────────────────────
 * Re-expressed on the reference theme: four metric cards across the top, then
 * ONE card that holds the whole desk — sections as a tab strip, status and app
 * as select filters in the card's action slot, the list in the body. Nothing
 * was dropped: the two pill rows became two selects, the section buttons
 * became tabs, and the intake queue kept its own tab, its own table and its
 * own two buttons per row.
 */

const KINDS: { id: RequesterKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "athlete", label: "App users" },
  { id: "guide", label: "Guides" },
  { id: "company", label: "Companies" },
  { id: "visitor", label: "Visitors" },
  { id: "staff", label: "Staff" },
];

const STATUS_FILTERS: { id: TicketStatus | "all"; label: string }[] = [
  { id: "all", label: "Any status" },
  { id: "open", label: "Open" },
  { id: "investigating", label: "Investigating" },
  { id: "waiting_on_customer", label: "Waiting on customer" },
  { id: "waiting_on_company", label: "Waiting on company" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
];

export const ORIGIN_LABEL: Record<OriginApp, string> = {
  phone_app: "Phone app",
  web: "Web",
  guide_app: "Guide app",
  operator_portal: "Operator portal",
  crm: "CRM",
};

export const KIND_LABEL: Record<RequesterKind, string> = {
  athlete: "App user",
  guide: "Guide",
  company: "Company",
  visitor: "Visitor",
  staff: "Staff",
};

/** Neither resolved nor closed — the tickets somebody still owes an answer on. */
const UNRESOLVED: TicketStatus[] = ["open", "investigating", "waiting_on_customer", "waiting_on_company"];
const isUnresolved = (t: Ticket) => UNRESOLVED.includes(t.status);

export const statusState = (s: TicketStatus): "ok" | "pending" | "bad" | "neutral" =>
  s === "resolved" ? "ok" : s === "closed" ? "neutral" : "pending";

export const statusLabel = (s: TicketStatus) =>
  s === "waiting_on_customer" ? "waiting on customer" : s === "waiting_on_company" ? "waiting on company" : s;

/**
 * The reference theme's status badge, verbatim: an outline pill with a coloured
 * dot. It replaces the old filled glyph with a chevron beside it — the chevron
 * was drawn because the mockup drew one and did nothing, and a control that
 * looks like it acts and does not is the same class of problem as a figure that
 * looks measured and is not. Dropping it removes no capability.
 */
const DOT: Record<"ok" | "pending" | "bad" | "neutral", { badge: string; dot: string }> = {
  ok: { badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600", dot: "bg-emerald-500" },
  pending: { badge: "border-amber-500/20 bg-amber-500/10 text-amber-600", dot: "bg-amber-500" },
  bad: { badge: "border-destructive/20 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  neutral: { badge: "border-border bg-ui-muted/50 text-muted-foreground", dot: "bg-muted-foreground" },
};

export function StatusBadge({
  state,
  label,
}: {
  state: "ok" | "pending" | "bad" | "neutral";
  label: string;
}) {
  const m = DOT[state];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium", m.badge)}>
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {label}
    </Badge>
  );
}

/**
 * A figure, or the reason there is not one.
 *
 * `value` of `null` renders the reason in muted text — never a dash and never a
 * zero, and the hint that belongs to a figure disappears with the figure. This
 * is the theme's metric card carrying the honesty rule the old tile carried.
 */
function Metric({
  icon,
  label,
  value,
  reason,
  hint,
}: {
  icon: React.ReactNode;
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

export default function Support() {
  const navigate = useNavigate();
  const me = useStaff();
  const [tickets, setTickets] = useState<Result<Ticket[]>>(loading);
  const [intake, setIntake] = useState<Result<IntakeRequest[]>>(loading);
  const [team, setTeam] = useState<Result<StaffRecord[]>>(loading);
  const [kind, setKind] = useState<RequesterKind | "all" | "intake">("all");
  const [scopeApplied, setScopeApplied] = useState(false);

  /**
   * CR-14: a scoped person's desk OPENS on their people. The scope is an
   * assignment (set on Admin Team, super admin only, audited), never a read
   * barrier — every section stays clickable for covering a colleague.
   */
  const myScopes: RequesterKind[] =
    team.state === "ok"
      ? (team.value.find((t) => t.profile_id === me?.profileId)?.support_scopes ?? [])
      : [];
  useEffect(() => {
    if (!scopeApplied && myScopes.length > 0) {
      setKind(myScopes[0]);
      setScopeApplied(true);
    }
  }, [myScopes, scopeApplied]);
  const [status, setStatus] = useState<TicketStatus | "all">("all");
  const [origin, setOrigin] = useState<OriginApp | "all">("all");
  const [triaging, setTriaging] = useState<string | null>(null);
  const [triageError, setTriageError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listTickets().then(setTickets);
    void listIntake().then(setIntake);
    void listStaff().then(setTeam);
  }, []);
  useEffect(refresh, [refresh]);

  const count = (match: (t: Ticket) => boolean): string | null =>
    tickets.state === "ok" ? String(tickets.value.filter(match).length) : null;

  const reason =
    tickets.state === "loading"
      ? "Still reading the ticket list."
      : tickets.state === "unavailable" || tickets.state === "error"
        ? tickets.reason
        : "Not recorded";

  const unhandledIntake = intake.state === "ok" ? intake.value.filter((r) => r.handled_at === null).length : null;

  const triage = async (row: IntakeRequest) => {
    setTriaging(row.id);
    setTriageError(null);
    const res = await triageIntake(row);
    setTriaging(null);
    if (res.state === "ok") navigate(`/admin/support/${res.value.id}`);
    else setTriageError(res.state === "error" ? res.reason : "No database is configured.");
  };

  const onIntake = kind === "intake";

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h2 className="text-3xl tracking-tight">Support</h2>
        <p className="max-w-3xl text-muted-foreground text-sm">
          Every request from every app — phone, web, guides, operator portal — lands here, sectioned by
          who asked. A ticket is read beside the company, lead and booking it is about.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={<LifeBuoy className="size-4" />}
          label="Open tickets"
          value={count(isUnresolved)}
          reason={reason}
          hint="Open, investigating or waiting. Resolved and closed are excluded."
        />
        <Metric
          icon={<Users className="size-4" />}
          label="From app users"
          value={count((t) => isUnresolved(t) && t.requester_kind === "athlete")}
          reason={reason}
          hint="Unresolved tickets raised by climbers."
        />
        <Metric
          icon={<Building2 className="size-4" />}
          label="From companies & guides"
          value={count((t) => isUnresolved(t) && (t.requester_kind === "company" || t.requester_kind === "guide"))}
          reason={reason}
          hint="Unresolved. A company's question usually has a contract behind it."
        />
        <Metric
          icon={<Inbox className="size-4" />}
          label="Visitor requests waiting"
          value={intake.state === "ok" ? String(unhandledIntake) : null}
          reason={intake.state === "ok" ? undefined : "The intake queue could not be read."}
          hint="Requests from people with no account — not tickets until triaged."
        />
      </div>

      <Card>
        <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
          <CardTitle className="text-xl leading-none">{onIntake ? "Intake queue" : "Tickets"}</CardTitle>
          <CardDescription className="max-w-xl leading-snug">
            {onIntake ? (
              <>
                {/* The words this card carried before the re-skin, kept exactly:
                    the whole point of the panel is that these are REQUESTS and
                    not tickets, and a shorter sentence loses the reason. */}
                <span className="font-medium text-foreground">Requests, not tickets.</span> These came
                from people with no account, so they have no reference, no status and no conversation
                yet. Opening one as a ticket gives it all three — and the answer goes to the email
                address they left, because there is nowhere else it can go.
              </>
            ) : (
              "Pick the section, then narrow by working state and by the app it came from."
            )}
          </CardDescription>
          {!onIntake && (
            <CardAction className="col-start-1 row-start-auto flex w-full flex-wrap justify-start gap-2 justify-self-stretch md:col-start-2 md:row-span-2 md:row-start-1 md:w-auto md:flex-nowrap md:justify-end md:justify-self-end">
              <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus | "all")}>
                <SelectTrigger size="sm" className="w-auto" aria-label="Filter by working state">
                  <span className="text-muted-foreground">Status:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="end">
                  <SelectGroup>
                    {STATUS_FILTERS.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              <Select value={origin} onValueChange={(v) => setOrigin(v as OriginApp | "all")}>
                <SelectTrigger size="sm" className="w-auto" aria-label="Filter by the app it came from">
                  <span className="text-muted-foreground">App:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="end">
                  <SelectGroup>
                    {(["all", "phone_app", "web", "guide_app", "operator_portal", "crm"] as const).map((o) => (
                      <SelectItem key={o} value={o}>
                        {o === "all" ? "Any app" : ORIGIN_LABEL[o]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </CardAction>
          )}
        </CardHeader>

        <CardContent className="flex flex-col gap-4 px-0">
          <div className="flex flex-col gap-3 px-4">
            <Tabs
              value={kind}
              onValueChange={(v) => setKind(v as RequesterKind | "all" | "intake")}
              className="max-w-full"
            >
              <TabsList className="max-w-full overflow-x-auto">
                {KINDS.map((k) => {
                  const n =
                    tickets.state === "ok"
                      ? k.id === "all"
                        ? tickets.value.length
                        : tickets.value.filter((t) => t.requester_kind === k.id).length
                      : null;
                  return (
                    <TabsTrigger key={k.id} value={k.id} className="px-2.5">
                      {k.label}
                      {n !== null && <span className="text-muted-foreground text-xs tabular-nums">{n}</span>}
                    </TabsTrigger>
                  );
                })}
                <TabsTrigger value="intake" className="px-2.5">
                  Intake queue
                  {unhandledIntake !== null && (
                    <span className="text-muted-foreground text-xs tabular-nums">{unhandledIntake}</span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {myScopes.length > 0 && (
              <p className="text-muted-foreground text-sm">
                Your desk:{" "}
                <span className="font-medium text-foreground">
                  {myScopes.map((k) => KIND_LABEL[k]).join(" · ")}
                </span>
                {" — "}assigned on Admin Team. The other sections stay open for covering a colleague.
              </p>
            )}
          </div>

          {onIntake ? (
            <div className="px-4">
              <Resolve
                result={intake}
                what="the intake queue"
                isEmpty={(v) => v.length === 0}
                empty="No visitor requests. People without an account write in from the public site's contact form; their requests wait here until someone turns one into a ticket."
              >
                {(rows) => (
                  <>
                    {triageError && <p className="mb-3 text-destructive text-sm">{triageError}</p>}
                    <Table className="**:data-[slot='table-cell']:px-3 **:data-[slot='table-head']:px-3">
                      <TableHeader className="[&_tr]:border-t">
                        <TableRow>
                          <TableHead className="py-3 font-normal">From</TableHead>
                          <TableHead className="py-3 font-normal">Subject</TableHead>
                          <TableHead className="py-3 font-normal">Received</TableHead>
                          <TableHead className="py-3 font-normal">State</TableHead>
                          <TableHead className="py-3" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={r.id} className="border-border/60">
                            <TableCell className="py-3 align-middle">
                              <p className="font-medium">{r.name ?? r.email}</p>
                              {r.name && <p className="text-muted-foreground text-xs">{r.email}</p>}
                            </TableCell>
                            <TableCell className="max-w-[380px] py-3 align-middle">
                              <p className="truncate font-medium">{r.subject}</p>
                              <p className="truncate text-muted-foreground text-xs">{r.body}</p>
                            </TableCell>
                            <TableCell className="py-3 align-middle text-muted-foreground">
                              {formatMoment(r.created_at)}
                            </TableCell>
                            <TableCell className="py-3 align-middle">
                              {r.handled_at === null ? (
                                <StatusBadge state="pending" label="Waiting" />
                              ) : (
                                <StatusBadge state="ok" label="Ticket opened" />
                              )}
                            </TableCell>
                            <TableCell className="py-3 text-right align-middle">
                              {r.handled_at === null ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={triaging === r.id}
                                  onClick={() => void triage(r)}
                                >
                                  {triaging === r.id ? "Opening…" : "Open as ticket"}
                                </Button>
                              ) : r.ticket_id ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigate(`/admin/support/${r.ticket_id}`)}
                                >
                                  View ticket
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </Resolve>
            </div>
          ) : (
            <div className="px-4">
              <Resolve
                result={tickets}
                what="support tickets"
                isEmpty={(v) => v.length === 0}
                empty="No tickets have been raised. One arrives the moment someone taps Help in any of the apps — phone, web, guide or operator portal."
              >
                {(list) => {
                  const inKind = kind === "all" ? list : list.filter((t) => t.requester_kind === kind);
                  const shown = inKind
                    .filter((t) => status === "all" || t.status === status)
                    .filter((t) => origin === "all" || t.origin_app === origin);

                  if (shown.length === 0) {
                    return (
                      <p className="pb-2 text-[13px] leading-relaxed text-faint">
                      {/* Guide and company sections are empty for a stated
                          reason, not a fault: those two apps cannot raise a
                          ticket yet (no real sign-in), a scope decision that
                          sits with the owner. Say that rather than implying
                          a quiet desk. */}
                      {kind === "guide" && status === "all" && origin === "all"
                        ? "No guide tickets — and none can arrive yet: the guide app has no real sign-in, so it cannot raise tickets until its auth lands. Not a fault on this desk."
                        : kind === "company" && status === "all" && origin === "all"
                          ? "No company tickets — and none can arrive yet: the operator portal has no real sign-in, so it cannot raise tickets until its auth lands. Not a fault on this desk."
                          : "Nothing matches this section and filter. The counts on the tabs say where the tickets are."}
                    </p>
                  );
                }

                  return (
                    <div className="-mx-4 border-t border-border/60">
                      {/* CR-14: threads, not a table — the same click-a-chat
                          idiom as every other conversation surface. The whole
                          row opens the conversation. */}
                      {shown.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => navigate(`/admin/support/${t.id}`)}
                        className={cn(
                          "flex w-full items-center gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-0 hover:bg-ui-muted/50",
                          // Priority still reads at a glance, in the theme's
                          // own two colours: destructive for critical, plain
                          // ink for high, nothing for the rest.
                          t.priority === "critical" && "border-l-2 border-l-destructive",
                          t.priority === "high" && "border-l-2 border-l-foreground/40",
                        )}
                      >
                        <Avatar size="lg">
                          <AvatarFallback>
                            {initials(t.requester_name ?? KIND_LABEL[t.requester_kind])}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium">
                              {t.requester_name ?? KIND_LABEL[t.requester_kind]}
                            </span>
                            <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                              {t.reference}
                            </span>
                            <Badge variant="outline">{KIND_LABEL[t.requester_kind]}</Badge>
                          </span>
                          <span className="mt-0.5 block truncate font-medium">{t.subject}</span>
                          <span className="mt-0.5 block truncate text-muted-foreground text-sm">
                            {t.snippet ?? "No messages yet — only the subject was recorded."}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1.5">
                          <span className="text-muted-foreground text-xs">{formatMoment(t.created_at)}</span>
                          <StatusBadge state={statusState(t.status)} label={statusLabel(t.status)} />
                          <span className="text-xs text-faint">{ORIGIN_LABEL[t.origin_app]}</span>
                        </span>
                      </button>
                      ))}
                    </div>
                  );
                }}
              </Resolve>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
