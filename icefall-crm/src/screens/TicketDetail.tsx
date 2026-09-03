import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
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
import { KIND_LABEL, ORIGIN_LABEL, StatusBadge, statusLabel, statusState } from "./Support";

/**
 * One ticket: the conversation, a reply box, and the working state.
 *
 * TWO KINDS OF MESSAGE, VISUALLY IRRECONCILABLE ON PURPOSE. A reply
 * (`internal: false`) goes to the requester; an internal note (`internal:
 * true`) never reaches them — RLS enforces that on the database and this
 * screen says it on every note, because a note that LOOKS like a reply is how
 * a private remark gets written as if the customer will read it.
 *
 * The theme has no butter yellow to carry that difference, so it is carried by
 * three things at once instead of by a hue: a note sits on the recessed grey
 * with a DASHED edge where a reply sits on a plain white card, and it keeps its
 * amber lock line saying in words that the requester never sees it.
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
        "rounded-xl px-4 py-3",
        m.internal
          ? "border border-dashed border-border bg-ui-muted"
          : "bg-card ring-1 ring-foreground/10",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium text-sm">{m.author_name ?? "Unknown author"}</p>
        <span className="flex flex-wrap items-center gap-2">
          {m.internal && (
            <span className="flex items-center gap-1 font-medium text-warn text-xs">
              <Lock className="size-3" aria-hidden /> Internal note — the requester never sees this
            </span>
          )}
          <span className="text-muted-foreground text-xs">{formatMoment(m.created_at)}</span>
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
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
        <div className="rounded-xl border border-border bg-ui-muted/50 px-4 py-3">
          <p className="font-medium text-muted-foreground text-xs">
            From the public contact form — before this was a ticket
          </p>
          <p className="mt-2 font-medium text-sm">
            {intake.name ?? intake.email}
            {intake.name && <span className="ml-2 font-normal text-muted-foreground">{intake.email}</span>}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{intake.body}</p>
          <p className="mt-2 text-muted-foreground text-xs">{formatMoment(intake.created_at)}</p>
        </div>
      )}
      {messages.length === 0 && !intake && (
        <p className="text-[13px] text-faint">
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
        <div className="flex flex-col gap-4 md:gap-6">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="icon" asChild aria-label="Back to support">
              <Link to="/admin/support">
                <ArrowLeft />
              </Link>
            </Button>
            <div className="min-w-0 space-y-2">
              <h2 className="text-3xl tracking-tight">
                {t.reference} — {t.subject}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{KIND_LABEL[t.requester_kind]}</Badge>
                <Badge variant="outline">{ORIGIN_LABEL[t.origin_app]}</Badge>
                {/* WHERE THEY WERE STANDING — triage context, never authority
                    (support contract). "They were on /placements" is not "move
                    their placement": a request is a message, actioned by a
                    person through the audited function, never inferred from a
                    URL. The portal's inability to write placements must not
                    reopen socially through this label. */}
                {t.origin_screen && (
                  <span className="text-muted-foreground text-xs">was on {t.origin_screen}</span>
                )}
                <Badge variant="outline">{t.type}</Badge>
                <StatusBadge state={statusState(t.status)} label={statusLabel(t.status)} />
                <span className="text-muted-foreground text-xs">
                  opened {formatMoment(t.created_at)}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-col gap-4">
              <Resolve result={messages} what="the conversation">
                {(msgs) => <Conversation messages={msgs} intake={intakeRow} />}
              </Resolve>

              <Card>
                <CardContent className="flex flex-col gap-3">
                  {t.requester_kind === "visitor" && (
                    <p className="rounded-lg bg-ui-muted px-3 py-2.5 text-[13px] leading-relaxed text-warn">
                      The requester has no account, so nothing written here reaches them by itself.
                      Send the actual answer to{" "}
                      <span className="font-medium">{t.requester_email}</span> — what you store below
                      is the case record.
                    </p>
                  )}
                  <Textarea
                    rows={4}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a reply, or an internal note…"
                  />
                </CardContent>
                <CardFooter className="justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={busy || draft.trim().length === 0}
                    onClick={() => void send(true)}
                  >
                    <Lock /> Internal note
                  </Button>
                  <Button disabled={busy || draft.trim().length === 0} onClick={() => void send(false)}>
                    Reply to requester
                  </Button>
                </CardFooter>
              </Card>
            </div>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Requester</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <p className="text-muted-foreground">
                    {KIND_LABEL[t.requester_kind]} · via {ORIGIN_LABEL[t.origin_app]}
                  </p>
                  {t.requester_name && <p className="font-medium">{t.requester_name}</p>}
                  {t.requester_email && <p className="tabular-nums">{t.requester_email}</p>}
                  {!t.requester_email && t.customer_id && (
                    <p className="text-faint">Signed-in requester — replies reach them in the app.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Working state</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    {WORKING_STATUSES.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={t.status === s ? "default" : "outline"}
                        disabled={busy || t.status === s}
                        onClick={() => void move(s)}
                      >
                        {statusLabel(s)}
                      </Button>
                    ))}
                  </div>
                  {t.status !== "resolved" && t.status !== "closed" ? (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <p className="font-medium text-muted-foreground text-sm">Resolve</p>
                        {/* The status CHECK refuses a resolution-less close; the
                            button appears only once the sentence exists. */}
                        <Textarea
                          rows={2}
                          value={resolution}
                          onChange={(e) => setResolution(e.target.value)}
                          placeholder="What settled it — required to resolve"
                        />
                        <Button
                          size="sm"
                          disabled={busy || resolution.trim().length === 0}
                          onClick={() => void move("resolved")}
                        >
                          Mark resolved
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-[13px] leading-relaxed text-faint">
                      {t.status === "resolved" ? "Resolved." : "Closed."} Reopen by picking a working
                      state above.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </Resolve>
  );
}
