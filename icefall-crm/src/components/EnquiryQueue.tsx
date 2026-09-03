import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, Card, Pill, SectionLabel } from "@/components/ui";
import { answerEnquiry, handOffEnquiry, listEnquiries, markEnquirySeen } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Enquiry } from "@/data/types";
import { cn, formatMoment } from "@/lib/utils";
import { KIND_LABEL, ORIGIN_LABEL } from "@/screens/Support";

/**
 * "Who is waiting on us right now" — CR-10, made real by the enquiry ruling:
 * every enquiry from every app lands here, ranked by how long it has waited,
 * unanswered first.
 *
 * WAIT IS SHOWN BECAUSE WAIT IS MEASURED. `created_at` is a fact and the age
 * derived from it is honest. NO RESPONSE TIME IS PROMISED ANYWHERE — nothing
 * measures how fast anyone answers, and this queue must not join the four
 * screens that invented one.
 *
 * The states are the row's timestamps, nothing more: sent / seen / answered.
 * Answering records the reply on the row — for a signed-in sender that IS the
 * delivery (they read their own row in the app); for a visitor the recorded
 * answer is the case record and the email shown is where it must actually go.
 *
 * If the migration has not been pushed yet, the read fails VISIBLY with the
 * database's own message — an unpushed function must never look like an empty
 * queue.
 */

/** "3h", "2d 4h" — elapsed since a real timestamp. Measured, not promised. */
function waited(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function EnquiryQueue() {
  const [result, setResult] = useState<Result<Enquiry[]>>(loading);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAnswered, setShowAnswered] = useState(false);

  const refresh = useCallback(() => void listEnquiries().then(setResult), []);
  useEffect(refresh, [refresh]);

  const seen = async (id: string) => {
    setBusy(true);
    const r = await markEnquirySeen(id);
    setBusy(false);
    if (r.state !== "ok") setErr(r.state === "error" ? r.reason : "No database is configured.");
    refresh();
  };

  const handOff = async (id: string) => {
    setBusy(true);
    setErr(null);
    const r = await handOffEnquiry(id);
    setBusy(false);
    if (r.state !== "ok") setErr(r.state === "error" ? r.reason : "No database is configured.");
    refresh();
  };

  const answer = async (id: string) => {
    setBusy(true);
    setErr(null);
    const r = await answerEnquiry(id, draft);
    setBusy(false);
    if (r.state === "ok") {
      setDraft("");
      setOpen(null);
      refresh();
    } else setErr(r.state === "error" ? r.reason : "No database is configured.");
  };

  return (
    <div className="mb-6">
      <SectionLabel>Waiting on us right now</SectionLabel>
      {result.state === "loading" ? (
        <Card className="mt-2"><p className="text-[12.5px] text-faint">Reading the queue…</p></Card>
      ) : result.state !== "ok" ? (
        <Card className="mt-2">
          <p className="text-[12.5px] leading-relaxed text-bad">
            The enquiry queue could not be read: {"reason" in result ? result.reason : ""}
          </p>
          <p className="mt-1 text-[12px] text-faint">
            If this says the table does not exist, the enquiries migration has not been pushed yet
            — nothing works until it is, and this message is deliberately not an empty queue.
          </p>
        </Card>
      ) : (
        (() => {
          const waiting = result.value
            .filter((e) => e.answered_at === null)
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          const answered = result.value
            .filter((e) => e.answered_at !== null)
            .sort((a, b) => (b.answered_at ?? "").localeCompare(a.answered_at ?? ""));
          return (
            <>
              {err && <p className="mt-2 text-[12.5px] text-bad">{err}</p>}
              {waiting.length === 0 ? (
                <Card className="mt-2">
                  <p className="text-[12.5px] text-faint">
                    Nobody is waiting. Every enquiry that arrives from the phone app or the
                    website appears here the moment it is sent.
                  </p>
                </Card>
              ) : (
                <div className="mt-2 space-y-2">
                  {waiting.map((e) => (
                    <Card key={e.id} pad={false} className="p-4">
                      <button
                        type="button"
                        className="flex w-full items-center gap-3.5 text-left"
                        onClick={() => {
                          setOpen(open === e.id ? null : e.id);
                          setDraft("");
                        }}
                      >
                        <Avatar name={e.sender_name ?? KIND_LABEL[e.sender_kind]} size={38} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[13.5px] font-semibold text-ink">
                              {e.sender_name ?? (e.sender_email ?? KIND_LABEL[e.sender_kind])}
                            </span>
                            <Pill tone="neutral">{KIND_LABEL[e.sender_kind]}</Pill>
                            <Pill tone="accent">{e.object_label}</Pill>
                            <span className="text-[11.5px] text-faint">{ORIGIN_LABEL[e.origin_app]}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-[12.5px] text-muted">{e.body}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={cn(
                              "tnum rounded-pill px-2 py-[3px] text-[11.5px] font-semibold",
                              // Unseen = the warn wash; seen = the neutral raised chip. `butter` still
                              // resolves to the theme's flat neutral, which left this pair telling
                              // itself apart by TEXT colour only — an amber word on grey. The wash
                              // restores the distinction the way the theme does it.
                              e.seen_at ? "bg-raised text-muted ring-1 ring-line" : "bg-warn/10 text-warn",
                            )}
                          >
                            waiting {waited(e.created_at)}
                          </span>
                          <span className="text-[11px] text-faint">{e.seen_at ? "seen" : "not yet seen"}</span>
                          {e.handed_off_at && <Pill tone="accent">with the company</Pill>}
                        </span>
                      </button>

                      {open === e.id && (
                        <div className="mt-3 border-t border-line-soft pt-3">
                          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{e.body}</p>
                          {e.sender_kind === "visitor" && e.sender_email && (
                            <p className="mt-2 rounded-tile bg-warn/10 px-3 py-2 text-[12px] leading-relaxed text-warn">
                              No account behind this one — the recorded answer is the case record;
                              send the actual reply to <span className="font-semibold">{e.sender_email}</span>.
                            </p>
                          )}
                          {/* S4: only an enquiry that names a company can go
                              to one, and only once. The customer's email never
                              travels with it — the view withholds it. */}
                          {e.company_id && !e.handed_off_at && (
                            <p className="mt-2 text-[11.5px] text-faint">
                              Hand off shares the words, the object and any recorded answer with the
                              company — never the sender's contact details. The desk keeps the row.
                            </p>
                          )}
                          <div className="mt-3 flex items-start gap-2">
                            {!e.seen_at && (
                              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void seen(e.id)}>
                                Mark seen
                              </Button>
                            )}
                            {e.company_id && !e.handed_off_at && (
                              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void handOff(e.id)}>
                                Hand off to company
                              </Button>
                            )}
                            <textarea
                              rows={2}
                              value={draft}
                              onChange={(ev) => setDraft(ev.target.value)}
                              placeholder="Answer — recorded on the enquiry, and a signed-in sender reads it in their app. It cannot be edited afterwards."
                              className="min-w-0 flex-1 rounded-tile border border-line bg-surface px-3 py-2 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-accent"
                            />
                            <Button
                              size="sm"
                              className="!bg-accent text-primary-foreground hover:opacity-90"
                              disabled={busy || draft.trim().length === 0}
                              onClick={() => void answer(e.id)}
                            >
                              Answer
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowAnswered((v) => !v)}
                className="mt-3 text-[12px] font-medium text-muted hover:text-ink"
              >
                {showAnswered ? "Hide" : "Show"} answered ({answered.length})
              </button>
              {showAnswered && answered.length > 0 && (
                <div className="mt-2 space-y-2">
                  {answered.map((e) => (
                    <Card key={e.id} pad={false} className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-ink">
                          {e.sender_name ?? e.sender_email ?? KIND_LABEL[e.sender_kind]}
                        </span>
                        <Pill tone="accent">{e.object_label}</Pill>
                        <Pill tone="green">answered</Pill>
                        <span className="text-[11.5px] text-faint">{formatMoment(e.answered_at)}</span>
                      </div>
                      <p className="mt-1.5 text-[12.5px] text-muted">{e.body}</p>
                      <p className="mt-1.5 rounded-tile bg-mint/60 px-3 py-2 text-[12.5px] leading-relaxed text-ink">
                        {e.answer}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </>
          );
        })()
      )}
    </div>
  );
}
