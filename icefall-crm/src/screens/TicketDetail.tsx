import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { Button, Card, PageHead, Pill, StatusChip } from "@/components/ui";
import { Resolve } from "@/components/states";
import {
  getTicket,
  listIntake,
  listTicketMessages,
  replyToTicket,
  setTicketStatus,
} from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { IntakeRequest, Ticket, TicketMessage, TicketStatus } from "@/data/types";
import { cn, formatMoment } from "@/lib/utils";
import { KIND_LABEL, ORIGIN_LABEL, statusLabel, statusState } from "./Support";

/**
 * One ticket: the conversation, a reply box, and the working state.
 *
 * TWO KINDS OF MESSAGE, VISUALLY IRRECONCILABLE ON PURPOSE. A reply
 * (`internal: false`) goes to the requester; an internal note (`internal:
 * true`) never reaches them — RLS enforces that on the database and this
 * screen says it on every note, because a note that LOOKS like a reply is how
 * a private remark gets written as if the customer will read it.
 *
 * A VISITOR'S TICKET HAS NO READER ON THE OTHER END. The requester has no
 * account, so nothing stored here reaches them by itself — the reply box says
 * so and shows the email address the answer must actually go to. Storing the
 * reply is still right: it is the case record.
 *
 * RESOLVING DEMANDS A RESOLUTION. The status CHECK refuses to close a ticket
 * without one, so the button does not exist until the sentence does.
 */

function MessageCard({ m }: { m: TicketMessage }) {
  return (
    <div
      className={cn(
        "rounded-tile p-3.5",
        m.internal ? "border border-[oklch(0.85_0.08_84)] bg-butter/60" : "bg-surface shadow-soft",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] font-semibold text-ink">{m.author_name ?? "Unknown author"}</p>
        <span className="flex items-center gap-2">
          {m.internal && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-[oklch(0.5_0.11_75)]">
              <Lock size={11} strokeWidth={2.25} aria-hidden /> Internal note — the requester never sees this
            </span>
          )}
          <span className="text-[11.5px] text-faint">{formatMoment(m.created_at)}</span>
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{m.body}</p>
    </div>
  );
}

export function Conversation({
  messages,
  intake,
}: {
  messages: TicketMessage[];
  intake: IntakeRequest | null;
}) {
  return (
    <div className="space-y-3">
      {intake && (
        <div className="rounded-tile border border-line bg-panel p-3.5">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint">
            From the public contact form — before this was a ticket
          </p>
          <p className="mt-2 text-[12.5px] font-semibold text-ink">
            {intake.name ?? intake.email}
            {intake.name && <span className="ml-2 font-normal text-muted">{intake.email}</span>}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{intake.body}</p>
          <p className="mt-2 text-[11.5px] text-faint">{formatMoment(intake.created_at)}</p>
        </div>
      )}
      {messages.length === 0 && !intake && (
        <p className="text-[12.5px] text-faint">
          No messages on this ticket yet — only its subject line was recorded.
        </p>
      )}
      {messages.map((m) => (
        <MessageCard key={m.id} m={m} />
      ))}
    </div>
  );
}

const WORKING_STATUSES: TicketStatus[] = [
  "open",
  "investigating",
  "waiting_on_customer",
  "waiting_on_company",
];

export default function TicketDetail() {
  const { id } = useParams();
  const [ticket, setTicket] = useState<Result<Ticket>>(loading);
  const [messages, setMessages] = useState<Result<TicketMessage[]>>(loading);
  const [intakeRow, setIntakeRow] = useState<IntakeRequest | null>(null);
  const [draft, setDraft] = useState("");
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!id) return;
    void getTicket(id).then(setTicket);
    void listTicketMessages(id).then(setMessages);
    void listIntake().then((r) => {
      if (r.state === "ok") setIntakeRow(r.value.find((x) => x.ticket_id === id) ?? null);
    });
  }, [id]);
  useEffect(refresh, [refresh]);

  const send = async (internal: boolean) => {
    if (!id || draft.trim().length === 0) return;
    setBusy(true);
    setError(null);
    const res = await replyToTicket(id, draft, internal);
    setBusy(false);
    if (res.state === "ok") {
      setDraft("");
      refresh();
    } else setError(res.state === "error" ? res.reason : "No database is configured.");
  };

  const move = async (status: TicketStatus) => {
    if (!id) return;
    setBusy(true);
    setError(null);
    const res = await setTicketStatus(id, status, status === "resolved" ? resolution : undefined);
    setBusy(false);
    if (res.state === "ok") {
      setResolution("");
      refresh();
    } else setError(res.state === "error" ? res.reason : "No database is configured.");
  };

  return (
    <Resolve result={ticket} what="the ticket">
      {(t) => (
        <>
          <div className="mb-5 flex items-start gap-3">
            <Link
              to="/admin/support"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-line bg-surface text-muted hover:text-ink"
              aria-label="Back to support"
            >
              <ArrowLeft size={16} strokeWidth={2} />
            </Link>
            <div className="min-w-0">
              <PageHead title={`${t.reference} — ${t.subject}`} />
              <div className="-mt-4 flex flex-wrap items-center gap-2">
                <Pill tone={t.requester_kind === "company" ? "accent" : "neutral"}>
                  {KIND_LABEL[t.requester_kind]}
                </Pill>
                <Pill tone="neutral">{ORIGIN_LABEL[t.origin_app]}</Pill>
                {/* WHERE THEY WERE STANDING — triage context, never authority
                    (support contract). "They were on /placements" is not "move
                    their placement": a request is a message, actioned by a
                    person through the audited function, never inferred from a
                    URL. The portal's inability to write placements must not
                    reopen socially through this label. */}
                {t.origin_screen && <span className="text-[11.5px] text-faint">was on {t.origin_screen}</span>}
                <Pill tone="neutral">{t.type}</Pill>
                <StatusChip state={statusState(t.status)} label={statusLabel(t.status)} />
                <span className="text-[11.5px] text-faint">opened {formatMoment(t.created_at)}</span>
              </div>
            </div>
          </div>

          {error && (
            <p className="mb-3 rounded-tile bg-[oklch(0.955_0.03_25)] px-3.5 py-2.5 text-[12.5px] text-bad">
              {error}
            </p>
          )}

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <Resolve result={messages} what="the conversation">
                {(msgs) => <Conversation messages={msgs} intake={intakeRow} />}
              </Resolve>

              <Card className="mt-4">
                {t.requester_kind === "visitor" && (
                  <p className="mb-3 rounded-tile bg-butter/70 px-3 py-2.5 text-[12px] leading-relaxed text-[oklch(0.45_0.1_75)]">
                    The requester has no account, so nothing written here reaches them by itself.
                    Send the actual answer to <span className="font-semibold">{t.requester_email}</span> —
                    what you store below is the case record.
                  </p>
                )}
                <textarea
                  rows={4}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a reply, or an internal note…"
                  className="w-full rounded-tile border border-line bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-accent"
                />
                <div className="mt-2.5 flex items-center justify-end gap-2">
                  <Button
                    variant="secondary"
                    disabled={busy || draft.trim().length === 0}
                    onClick={() => void send(true)}
                  >
                    <Lock size={13} strokeWidth={2.25} /> Internal note
                  </Button>
                  <Button
                    className="!bg-accent text-white hover:opacity-90"
                    disabled={busy || draft.trim().length === 0}
                    onClick={() => void send(false)}
                  >
                    Reply to requester
                  </Button>
                </div>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <p className="text-[13.5px] font-bold text-ink">Requester</p>
                <div className="mt-2.5 space-y-1.5 text-[12.5px]">
                  <p className="text-muted">
                    {KIND_LABEL[t.requester_kind]} · via {ORIGIN_LABEL[t.origin_app]}
                  </p>
                  {t.requester_name && <p className="font-semibold text-ink">{t.requester_name}</p>}
                  {t.requester_email && <p className="tnum text-ink">{t.requester_email}</p>}
                  {!t.requester_email && t.customer_id && (
                    <p className="text-faint">Signed-in requester — replies reach them in the app.</p>
                  )}
                </div>
              </Card>

              <Card>
                <p className="text-[13.5px] font-bold text-ink">Working state</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {WORKING_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy || t.status === s}
                      onClick={() => void move(s)}
                      className={cn(
                        "rounded-pill px-2.5 py-1 text-[11.5px] font-medium",
                        t.status === s
                          ? "bg-solid text-white"
                          : "bg-raised text-muted ring-1 ring-line hover:text-ink",
                      )}
                    >
                      {statusLabel(s)}
                    </button>
                  ))}
                </div>
                {t.status !== "resolved" && t.status !== "closed" ? (
                  <div className="mt-4 border-t border-line-soft pt-3">
                    <p className="text-[12px] font-medium text-muted">Resolve</p>
                    {/* The status CHECK refuses a resolution-less close; the
                        button appears only once the sentence exists. */}
                    <textarea
                      rows={2}
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="What settled it — required to resolve"
                      className="mt-1.5 w-full rounded-tile border border-line bg-surface px-3 py-2 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-accent"
                    />
                    <Button
                      size="sm"
                      className="mt-2 !bg-accent text-white hover:opacity-90"
                      disabled={busy || resolution.trim().length === 0}
                      onClick={() => void move("resolved")}
                    >
                      Mark resolved
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 text-[12px] leading-relaxed text-faint">
                    {t.status === "resolved" ? "Resolved." : "Closed."} Reopen by picking a working
                    state above.
                  </p>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </Resolve>
  );
}
