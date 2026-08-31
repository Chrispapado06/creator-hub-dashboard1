import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Button, Card, PageHead, Pill, SectionLabel, Stat, StatusChip, TableCard } from "@/components/ui";
import { Resolve } from "@/components/states";
import { listIntake, listStaff, listTickets, triageIntake } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { IntakeRequest, OriginApp, RequesterKind, StaffRecord, Ticket, TicketStatus } from "@/data/types";
import { cn, formatMoment } from "@/lib/utils";
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

  return (
    <>
      <PageHead
        title="Support"
        subtitle="Every request from every app — phone, web, guides, operator portal — lands here, sectioned by who asked. A ticket is read beside the company, lead and booking it is about."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          tone="butter"
          label="Open tickets"
          value={count(isUnresolved)}
          reason={reason}
          hint="Open, investigating or waiting. Resolved and closed are excluded."
        />
        <Stat
          tone="sky"
          label="From app users"
          value={count((t) => isUnresolved(t) && t.requester_kind === "athlete")}
          reason={reason}
          hint="Unresolved tickets raised by climbers."
        />
        <Stat
          tone="lilac"
          label="From companies & guides"
          value={count((t) => isUnresolved(t) && (t.requester_kind === "company" || t.requester_kind === "guide"))}
          reason={reason}
          hint="Unresolved. A company's question usually has a contract behind it."
        />
        <Stat
          tone="mint"
          label="Visitor requests waiting"
          value={intake.state === "ok" ? String(unhandledIntake) : null}
          reason={intake.state === "ok" ? undefined : "The intake queue could not be read."}
          hint="Requests from people with no account — not tickets until triaged."
        />
      </div>

      {myScopes.length > 0 && (
        <p className="mt-5 text-[12px] text-muted">
          Your desk: <span className="font-semibold text-ink">{myScopes.map((k) => KIND_LABEL[k]).join(" · ")}</span>
          {" — "}assigned on Admin Team. The other sections stay open for covering a colleague.
        </p>
      )}
      <div className={cn("mb-3 flex flex-wrap items-center gap-1.5", myScopes.length > 0 ? "mt-2" : "mt-6")}>
        {KINDS.map((k) => {
          const n =
            tickets.state === "ok"
              ? k.id === "all"
                ? tickets.value.length
                : tickets.value.filter((t) => t.requester_kind === k.id).length
              : null;
          return (
            <Button
              key={k.id}
              size="sm"
              variant={kind === k.id ? "secondary" : "ghost"}
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
            >
              {k.label}
              {n !== null && (
                <span className="tnum rounded-pill bg-raised px-1.5 py-[1px] text-[11.5px] font-medium text-faint">
                  {n}
                </span>
              )}
            </Button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        <Button
          size="sm"
          variant={kind === "intake" ? "secondary" : "ghost"}
          aria-pressed={kind === "intake"}
          onClick={() => setKind("intake")}
        >
          Intake queue
          {unhandledIntake !== null && (
            <span className="tnum rounded-pill bg-butter px-1.5 py-[1px] text-[11.5px] font-medium text-[oklch(0.5_0.11_75)]">
              {unhandledIntake}
            </span>
          )}
        </Button>
      </div>

      {kind === "intake" ? (
        <Resolve
          result={intake}
          what="the intake queue"
          isEmpty={(v) => v.length === 0}
          empty="No visitor requests. People without an account write in from the public site's contact form; their requests wait here until someone turns one into a ticket."
        >
          {(rows) => (
            <>
              <Card className="mb-3">
                <SectionLabel>Requests, not tickets</SectionLabel>
                <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
                  These came from people with no account, so they have no reference, no status and
                  no conversation yet. Opening one as a ticket gives it all three — and the answer
                  goes to the email address they left, because there is nowhere else it can go.
                </p>
              </Card>
              {triageError && <p className="mb-3 text-[12.5px] text-bad">{triageError}</p>}
              <TableCard>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11.5px] uppercase tracking-[0.06em] text-faint">
                      <th className="px-5 py-3 font-medium">From</th>
                      <th className="px-3 py-3 font-medium">Subject</th>
                      <th className="px-3 py-3 font-medium">Received</th>
                      <th className="px-3 py-3 font-medium">State</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-line-soft last:border-0">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-ink">{r.name ?? r.email}</p>
                          {r.name && <p className="text-[12px] text-muted">{r.email}</p>}
                        </td>
                        <td className="max-w-[380px] px-3 py-3">
                          <p className="font-medium text-ink">{r.subject}</p>
                          <p className="truncate text-[12px] text-muted">{r.body}</p>
                        </td>
                        <td className="px-3 py-3 text-muted">{formatMoment(r.created_at)}</td>
                        <td className="px-3 py-3">
                          {r.handled_at === null ? (
                            <Pill tone="amber">Waiting</Pill>
                          ) : (
                            <Pill tone="green">Ticket opened</Pill>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.handled_at === null ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={triaging === r.id}
                              onClick={() => void triage(r)}
                            >
                              {triaging === r.id ? "Opening…" : "Open as ticket"}
                            </Button>
                          ) : r.ticket_id ? (
                            <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/support/${r.ticket_id}`)}>
                              View ticket
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            </>
          )}
        </Resolve>
      ) : (
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
            return (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  {STATUS_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setStatus(f.id)}
                      className={cn(
                        "rounded-pill px-2.5 py-1 text-[11.5px] font-medium",
                        status === f.id ? "bg-solid text-white" : "bg-raised text-muted ring-1 ring-line hover:text-ink",
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                  <span className="mx-1 h-4 w-px bg-line" aria-hidden />
                  {(["all", "phone_app", "web", "guide_app", "operator_portal", "crm"] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOrigin(o)}
                      className={cn(
                        "rounded-pill px-2.5 py-1 text-[11.5px] font-medium",
                        origin === o ? "bg-accent-soft text-accent-ink ring-1 ring-accent/40" : "bg-raised text-muted ring-1 ring-line hover:text-ink",
                      )}
                    >
                      {o === "all" ? "Any app" : ORIGIN_LABEL[o]}
                    </button>
                  ))}
                </div>

                {shown.length === 0 ? (
                  <Card>
                    <p className="text-[12.5px] leading-relaxed text-faint">
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
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {/* CR-14: threads, not a table — the same click-a-chat
                        idiom as every other conversation surface. The whole
                        row opens the conversation. */}
                    {shown.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => navigate(`/admin/support/${t.id}`)}
                        className={cn(
                          "flex w-full items-center gap-3.5 rounded-card bg-surface p-4 text-left shadow-soft transition-colors hover:bg-raised",
                          t.priority === "critical" && "border-l-[3px] border-l-[oklch(0.55_0.17_22)]",
                          t.priority === "high" && "border-l-[3px] border-l-[oklch(0.66_0.13_70)]",
                        )}
                      >
                        <Avatar name={t.requester_name ?? KIND_LABEL[t.requester_kind]} size={38} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-semibold text-ink">
                              {t.requester_name ?? KIND_LABEL[t.requester_kind]}
                            </span>
                            <span className="tnum shrink-0 text-[11.5px] text-faint">{t.reference}</span>
                            <Pill tone={t.requester_kind === "company" ? "accent" : "neutral"}>
                              {KIND_LABEL[t.requester_kind]}
                            </Pill>
                          </span>
                          <span className="mt-0.5 block truncate text-[13px] font-medium text-ink">{t.subject}</span>
                          <span className="mt-0.5 block truncate text-[12px] text-muted">
                            {t.snippet ?? "No messages yet — only the subject was recorded."}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1.5">
                          <span className="text-[11.5px] text-faint">{formatMoment(t.created_at)}</span>
                          <StatusChip state={statusState(t.status)} label={statusLabel(t.status)} />
                          <span className="text-[11px] text-faint">{ORIGIN_LABEL[t.origin_app]}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          }}
        </Resolve>
      )}
    </>
  );
}
