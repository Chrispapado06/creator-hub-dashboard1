import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, EyeOff, Flag, Image as ImageIcon, MessageSquare, Trash2 } from "lucide-react";
import { Avatar, Button, Card, PageHead, Pill, SectionLabel, Stat } from "@/components/ui";
import { Failed, Forbidden, Loading, Unavailable } from "@/components/states";
import {
  claimReportCase, contentKey, deskCanRemove, dismissReportCase, listProfilesBasic, listReports,
  readReportedContent, readThreadMessages, removeReportedContent, reopenReportCase,
  type ContentIndex, type ConversationRead, type ModerationReport, type ReportCase,
  type ReportedContent, type ReportsRead, type ReportsSchema, type ReportSubjectKind,
} from "@/data/queries";
import { loading, type Result } from "@/data/result";
import { formatMoment } from "@/lib/utils";

/**
 * The moderation queue — and, since today, a queue that can ACT.
 *
 * WHAT THIS SCREEN USED TO BE. Every report, listed, with three buttons that
 * moved it between open, reviewing and closed. Closing a report closed a
 * TICKET: the post stayed up, the comment stayed under it, and the only thing
 * recorded was that somebody had looked. A queue whose sole outcome is "we
 * looked at it" is not moderation, and a person who reported something they
 * were frightened of got exactly nothing.
 *
 * WHAT IT IS NOW, and the three ideas it is built on:
 *
 *   1. A MODERATOR MUST SEE WHAT WAS REPORTED. Every case fetches the actual
 *      thing — the post's words, the comment, the message, the conversation,
 *      the person — because deciding from a row that says "post 4f2a…" is
 *      guessing, and a guess is how a real complaint gets closed and a joke
 *      gets somebody removed.
 *
 *   2. FIVE REPORTS ABOUT ONE POST ARE ONE DECISION. Reports group by the
 *      thing they name, not by themselves. The alternative is a desk that
 *      reads the same post five times and can close it four ways.
 *
 *   3. AN ACTION HAS TO HAVE AN EFFECT. Removal deletes the row; dismissal
 *      closes the case with a reason. Both write to `audit_events`, so who did
 *      what, when, and why is reviewable beside everything else the CRM
 *      records. There is no soft delete anywhere in ICEFALL, so the
 *      confirmation says the truth: it cannot be undone.
 *
 * WHAT THIS SCREEN DELIBERATELY CANNOT DO, each because the database says so
 * rather than because nobody got round to it — `deskCanRemove` in
 * `data/queries.ts` carries the policy text these come from:
 *
 *   - REMOVE A DIRECT MESSAGE. `messages` has no DELETE policy and no DELETE
 *     grant for anybody. Both people in a conversation hold that record, and
 *     ICEFALL taking one side's evidence away is not a moderation act.
 *   - REMOVE A PERSON, or a conversation. Neither is content; there is no
 *     suspension flow in this CRM to hand off to, and inventing a button that
 *     writes nothing would be worse than the honest absence.
 *   - SHOW A PHOTOGRAPH. Media lives in a private bucket and nothing here can
 *     sign a URL for it yet, so a post with an image is shown as its words plus
 *     a statement that there is an image the screen cannot display. A reported
 *     image cannot be judged from this screen, and it says so rather than
 *     letting a moderator think they have seen everything.
 *
 * AND THE ONE THAT MATTERS MOST TODAY: `20260903010000_block_and_report.sql`
 * IS NOT APPLIED. Until it is, `reports` cannot name a post, a comment or a
 * message at all — the phone app sends those and the database refuses them. So
 * an empty queue below is NOT evidence that nothing has been reported, and the
 * screen says which of those two it is looking at, measured by asking the
 * database for the columns rather than by assuming.
 */

const REASON_LABEL: Record<ModerationReport["reason"], string> = {
  spam: "Spam",
  harassment: "Harassment",
  off_platform_payment: "Off-platform payment",
  safety: "Safety",
  impersonation: "Impersonation",
  other: "Other",
};

/**
 * `off_platform_payment` and `safety` render loudest because they are the two
 * that cost a climber most: paid outside ICEFALL means no held funds, no refund
 * terms and no record of what was agreed; safety means somebody may be about to
 * go up a mountain with the wrong person.
 */
const reasonTone = (r: ModerationReport["reason"]): "red" | "amber" | "neutral" =>
  r === "off_platform_payment" || r === "safety" ? "red" : r === "other" || r === "spam" ? "neutral" : "amber";

const KIND_LABEL: Record<ReportSubjectKind, string> = {
  profile: "A person",
  thread: "A conversation",
  post: "A post",
  comment: "A comment",
  group_message: "A group message",
  channel_message: "A channel message",
  message: "A direct message",
};

/** The noun on the removal button and in the confirmation sentence. */
const KIND_NOUN: Record<ReportSubjectKind, string> = {
  profile: "person",
  thread: "conversation",
  post: "post",
  comment: "comment",
  group_message: "message",
  channel_message: "message",
  message: "message",
};

const FIELD =
  "mt-2 w-full rounded-tile border border-line bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed " +
  "text-ink outline-none placeholder:text-faint focus:border-accent";

/* -------------------------------------------------------------------------- */
/* Grouping: a case is the thing reported, not the report                     */
/* -------------------------------------------------------------------------- */

interface QueueCase {
  key: string;
  /** Null only when a report names nothing at all — possible on the old table. */
  kind: ReportSubjectKind | null;
  /** Null when the thing has been deleted and the reference was cleared. */
  contentId: string | null;
  /** The person the report is about, where the database recorded one. */
  subjectId: string | null;
  reports: ModerationReport[];
  openReports: ModerationReport[];
  status: "open" | "reviewing" | "closed";
  /** The oldest report in the case — what "waiting since" means. */
  firstAt: string;
}

/**
 * What one report is about.
 *
 * THE ORDER IS THE DATABASE'S ORDER, deliberately: `reports_name_the_subject()`
 * resolves most-specific-first (message, then group message, channel message,
 * comment, post, conversation, person), and a screen that grouped by a
 * different precedence would file a report under a heading the server never
 * gave it.
 *
 * When every reference is null but `subject_kind` survives, the thing was
 * DELETED after the report was filed — the foreign keys are ON DELETE SET NULL
 * precisely so the accusation outlives the evidence. That is a case with a kind
 * and no id, and it is drawn as one.
 */
const targetOf = (r: ModerationReport): { kind: ReportSubjectKind | null; id: string | null } => {
  if (r.message_id) return { kind: "message", id: r.message_id };
  if (r.group_message_id) return { kind: "group_message", id: r.group_message_id };
  if (r.channel_message_id) return { kind: "channel_message", id: r.channel_message_id };
  if (r.comment_id) return { kind: "comment", id: r.comment_id };
  if (r.post_id) return { kind: "post", id: r.post_id };
  if (r.thread_id) return { kind: "thread", id: r.thread_id };
  // Every reference column is null from here on. `subject_kind` is stamped by
  // the server and frozen, so it outlives whatever it named — and it is checked
  // BEFORE `subject_id`, because `subject_id` survives the deletion too. Reading
  // the person first would file a deleted post under "a person was reported",
  // which is a different accusation from the one that was made.
  if (r.subject_kind && r.subject_kind !== "profile") return { kind: r.subject_kind, id: null };
  if (r.subject_id) return { kind: "profile", id: r.subject_id };
  return { kind: null, id: null };
};

function buildCases(rows: ModerationReport[]): QueueCase[] {
  const byKey = new Map<string, QueueCase>();
  for (const r of rows) {
    const t = targetOf(r);
    // A deleted post and a deleted comment by the same person are told apart by
    // kind; two deleted posts by the same person are NOT, because nothing that
    // survives can tell them apart. The card says so rather than implying the
    // desk is looking at one item.
    const key = t.kind && t.id
      ? contentKey(t.kind, t.id)
      : t.kind
        ? `gone:${t.kind}:${r.subject_id ?? r.id}`
        : `unnamed:${r.id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.reports.push(r);
      continue;
    }
    byKey.set(key, {
      key,
      kind: t.kind,
      contentId: t.id,
      subjectId: r.subject_id,
      reports: [r],
      openReports: [],
      status: "open",
      firstAt: r.created_at,
    });
  }

  const cases = Array.from(byKey.values());
  for (const c of cases) {
    c.reports.sort((a, b) => a.created_at.localeCompare(b.created_at));
    c.firstAt = c.reports[0].created_at;
    c.openReports = c.reports.filter((r) => r.status !== "closed");
    c.status =
      c.openReports.length === 0
        ? "closed"
        : c.openReports.every((r) => r.status === "reviewing")
          ? "reviewing"
          : "open";
    // A person is what several reports have in common; keep the first one the
    // database actually recorded rather than whichever report sorted first.
    c.subjectId = c.reports.find((r) => r.subject_id)?.subject_id ?? null;
  }
  return cases.sort((a, b) => a.firstAt.localeCompare(b.firstAt));
}

/**
 * The case, as the write layer wants it.
 *
 * `every` is for reopening: a closed case has no open reports, so acting on
 * "the open ones" would be acting on nothing at all.
 */
const caseRef = (k: QueueCase, every = false): ReportCase => {
  const rows = every ? k.reports : k.openReports;
  return {
    subjectKind: k.contentId ? k.kind : null,
    subjectId: k.contentId ?? k.reports[0].id,
    reportIds: rows.map((r) => r.id),
    statuses: rows.map((r) => r.status),
    about: k.contentId
      ? undefined
      : k.kind
        ? `${k.kind} — deleted before the desk decided`
        : "the report named nothing",
  };
};

/** Whole days a report has been waiting. Null when the stamp will not parse. */
const daysWaiting = (iso: string): number | null => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
};

const waitPhrase = (iso: string): string => {
  const d = daysWaiting(iso);
  if (d === null) return "waiting since a time that will not read";
  return d === 0 ? "reported today" : d === 1 ? "waiting 1 day" : `waiting ${d} days`;
};

/* -------------------------------------------------------------------------- */
/* The reported thing                                                         */
/* -------------------------------------------------------------------------- */

type Shown =
  | { state: "loading" }
  | { state: "read"; content: ReportedContent }
  | { state: "withheld"; why: string }
  | { state: "reference_cleared" }
  | { state: "missing" }
  | { state: "failed"; why: string }
  | { state: "never_named" };

const shownContent = (k: QueueCase, content: Result<ContentIndex>): Shown => {
  if (!k.kind) return { state: "never_named" };
  if (!k.contentId) return { state: "reference_cleared" };
  if (content.state === "loading") return { state: "loading" };
  if (content.state !== "ok")
    return { state: "failed", why: "reason" in content ? content.reason : "No reason was given." };
  const hit = content.value.found.get(contentKey(k.kind, k.contentId));
  if (hit) return { state: "read", content: hit };
  const why = content.value.withheld.get(k.kind);
  return why ? { state: "withheld", why } : { state: "missing" };
};

function Words({ body }: { body: string | null }) {
  if (body === null || body.trim().length === 0)
    return (
      <p className="mt-2 text-[12.5px] text-faint">
        No words — this was sent as a file or an image only.
      </p>
    );
  return (
    <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">
      {body}
    </p>
  );
}

function MediaNote({ path }: { path: string | null }) {
  if (!path) return null;
  return (
    <p className="mt-2 flex items-start gap-2 text-[12px] leading-relaxed text-warn">
      <ImageIcon size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
      This carries a file as well as the words above. It sits in a private bucket and this screen cannot
      display it — if the report is about the image, it has not been seen here.
    </p>
  );
}

/** The conversation behind a reported thread or direct message, on request. */
function Conversation({ threadId, nameOf }: { threadId: string; nameOf: (id: string | null) => string }) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<Result<ConversationRead>>(loading);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void readThreadMessages(threadId).then((r) => {
      if (!cancelled) setRead(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open, threadId]);

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent-ink hover:underline"
      >
        <MessageSquare size={13} strokeWidth={2} /> Read the recent messages
      </button>
    );

  if (read.state === "loading")
    return <p className="mt-2.5 text-[12px] text-faint">Reading the conversation…</p>;
  if (read.state !== "ok")
    return (
      <p className="mt-2.5 text-[12px] leading-relaxed text-bad">
        The conversation could not be read: {"reason" in read ? read.reason : ""}
      </p>
    );

  const { messages, total } = read.value;
  return (
    <div className="mt-2.5">
      <p className="text-[11.5px] leading-relaxed text-faint">
        {total === null
          ? `The ${messages.length} most recent messages. How many there are in total could not be counted.`
          : total <= messages.length
            ? `The whole conversation — ${total} message${total === 1 ? "" : "s"}.`
            : `The ${messages.length} most recent of ${total} messages. The earlier ones are not on this screen.`}
      </p>
      <div className="mt-1.5 space-y-1.5">
        {messages.map((m) => (
          <div key={m.id} className="rounded-tile bg-surface px-3 py-2">
            <p className="text-[11.5px] text-faint">
              {nameOf(m.author_id)} · {formatMoment(m.created_at) ?? "time not readable"}
              {m.message_kind !== "text" && ` · ${m.message_kind}`}
            </p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-ink">
              {m.body ?? "An attachment with no words."}
            </p>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-[12px] text-faint">This conversation holds no messages at all.</p>
        )}
      </div>
    </div>
  );
}

function ContentPanel({
  kase,
  shown,
  nameOf,
}: {
  kase: QueueCase;
  shown: Shown;
  nameOf: (id: string | null) => string;
}) {
  const noun = kase.kind ? KIND_NOUN[kase.kind] : "thing";

  const frame = (children: React.ReactNode) => (
    <div className="mt-3 rounded-tile bg-panel px-3.5 py-3">{children}</div>
  );

  if (shown.state === "loading") return frame(<p className="text-[12.5px] text-faint">Fetching what was reported…</p>);

  if (shown.state === "never_named")
    return frame(
      <p className="text-[12.5px] leading-relaxed text-muted">
        This report names nothing — no person, no conversation, no post. It was filed against the old
        table, which had no rule requiring a subject. There is nothing here to look at and nothing to
        remove; all the desk can do is close it.
      </p>,
    );

  if (shown.state === "reference_cleared")
    return frame(
      <p className="text-[12.5px] leading-relaxed text-muted">
        The {noun} this report named has been deleted. The report survives on purpose — deleting your
        posts must not clear your record — and it still names {nameOf(kase.subjectId)}. What was
        actually said is in the audit log, filed under the deletion.
      </p>,
    );

  if (shown.state === "missing")
    return frame(
      <p className="text-[12.5px] leading-relaxed text-muted">
        This {noun} is no longer in the database — somebody has already removed it. The report is still
        open, so the decision left to make is about the person, not the words.
      </p>,
    );

  if (shown.state === "withheld")
    return frame(
      <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-warn">
        <EyeOff size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
        {shown.why}
      </p>,
    );

  if (shown.state === "failed")
    return frame(
      <p className="text-[12.5px] leading-relaxed text-bad">
        What was reported could not be read: {shown.why} Nothing below has been checked against it.
      </p>,
    );

  const c = shown.content;
  const when = formatMoment(c.created_at) ?? "a time that will not read";

  return frame(
    <>
      {c.kind === "post" && (
        <>
          <p className="text-[12px] text-faint">
            Post by {nameOf(c.author_id)} · {when}
            {c.author_kind === "company" && " · posted for a company"}
            {c.expires_at && " · a story, which expires"}
          </p>
          <Words body={c.body} />
          <MediaNote path={c.media_path} />
        </>
      )}

      {c.kind === "comment" && (
        <>
          <p className="tnum text-[12px] text-faint">
            Comment by {nameOf(c.author_id)} · {when} · under post {c.post_id.slice(0, 8)}
          </p>
          <Words body={c.body} />
        </>
      )}

      {c.kind === "group_message" && (
        <>
          <p className="text-[12px] text-faint">
            {nameOf(c.author_id)} · {when} · in the group{" "}
            {c.group_name ?? "whose name could not be read"}
          </p>
          <Words body={c.body} />
          <MediaNote path={c.media_path} />
        </>
      )}

      {c.kind === "channel_message" && (
        <>
          <p className="text-[12px] text-faint">
            {nameOf(c.author_id)} · {when} · in the company channel{" "}
            {c.channel_name ?? "whose name could not be read"}
          </p>
          <Words body={c.body} />
          <MediaNote path={c.media_path} />
        </>
      )}

      {c.kind === "message" && (
        <>
          <p className="text-[12px] text-faint">
            Direct message from {nameOf(c.author_id)} · {when}
            {c.message_kind !== "text" && ` · sent as ${c.message_kind}`}
          </p>
          <Words body={c.body} />
          <Conversation threadId={c.thread_id} nameOf={nameOf} />
        </>
      )}

      {c.kind === "thread" && (
        <>
          <p className="text-[12px] text-faint">
            A conversation{c.thread_kind ? ` (${c.thread_kind})` : ""} · opened {when}
          </p>
          <p className="mt-1 text-[13px] font-medium text-ink">
            {c.title ?? c.peak_name ?? "This conversation carries no title."}
          </p>
          <Conversation threadId={c.id} nameOf={nameOf} />
        </>
      )}

      {c.kind === "profile" && (
        <>
          <p className="flex items-center gap-2.5">
            <Avatar name={c.display_name} size={32} />
            <span>
              <span className="block text-[13px] font-medium text-ink">{c.display_name}</span>
              <span className="block text-[11.5px] text-faint">
                {c.username ? `@${c.username} · ` : ""}
                {c.role} · joined {formatMoment(c.created_at) ?? "on a date that will not read"}
              </span>
            </span>
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            The report is about the person rather than one thing they wrote. Anything of theirs that was
            reported separately is its own case in this queue.
          </p>
        </>
      )}
    </>,
  );
}

/* -------------------------------------------------------------------------- */
/* One case                                                                   */
/* -------------------------------------------------------------------------- */

function CaseCard({
  kase,
  schema,
  content,
  nameOf,
  alsoNamed,
  busy,
  onAct,
}: {
  kase: QueueCase;
  schema: ReportsSchema;
  content: Result<ContentIndex>;
  nameOf: (id: string | null) => string;
  alsoNamed: QueueCase[];
  busy: boolean;
  onAct: (run: () => Promise<Result<null>>, done: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "remove" | "dismiss">("idle");
  const [note, setNote] = useState("");

  const shown = shownContent(kase, content);
  const noun = kase.kind ? KIND_NOUN[kase.kind] : "thing";
  const removable =
    shown.state === "read" && kase.kind !== null && deskCanRemove(kase.kind, schema) && kase.contentId !== null;

  const reasons = Array.from(new Set(kase.reports.map((r) => r.reason)));
  const reset = () => {
    setMode("idle");
    setNote("");
  };
  const act = (run: () => Promise<Result<null>>, done: string) => {
    reset();
    onAct(run, done);
  };

  return (
    <Card className="mb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-bold text-ink">
              {kase.kind ? KIND_LABEL[kase.kind] : "A report naming nothing"}
            </span>
            {reasons.map((r) => (
              <Pill key={r} tone={reasonTone(r)}>
                {REASON_LABEL[r]}
              </Pill>
            ))}
          </p>
          <p className="mt-1 text-[12px] text-muted">
            {kase.reports.length === 1
              ? "1 report"
              : `${kase.reports.length} reports, one decision`}{" "}
            · {waitPhrase(kase.firstAt)}
            {kase.subjectId && ` · about ${nameOf(kase.subjectId)}`}
          </p>
        </div>
        <Pill tone={kase.status === "open" ? "amber" : kase.status === "reviewing" ? "accent" : "neutral"}>
          {kase.status}
        </Pill>
      </div>

      <ContentPanel kase={kase} shown={shown} nameOf={nameOf} />

      {alsoNamed.length > 0 && (
        <p className="mt-2.5 flex items-start gap-2 text-[12px] leading-relaxed text-warn">
          <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
          The same person is named in {alsoNamed.length} other unresolved{" "}
          {alsoNamed.length === 1 ? "case" : "cases"} in this queue:{" "}
          {alsoNamed
            .map((o) => (o.kind ? KIND_LABEL[o.kind].toLowerCase() : "a report naming nothing"))
            .join(", ")}
          .
        </p>
      )}

      {/* The reports themselves — who said what, in their words. */}
      <div className="mt-3">
        <SectionLabel>What was said about it</SectionLabel>
        <div className="mt-1.5 space-y-1.5">
          {kase.reports.map((r) => (
            <div key={r.id} className="rounded-tile bg-raised px-3 py-2">
              <p className="flex flex-wrap items-center gap-2 text-[11.5px] text-faint">
                <Avatar name={nameOf(r.reporter_id)} size={22} />
                <span className="text-muted">{nameOf(r.reporter_id)}</span>
                <span>· {REASON_LABEL[r.reason]}</span>
                <span>· {formatMoment(r.created_at) ?? "time not readable"}</span>
                {r.status === "closed" && <Pill tone="neutral">closed</Pill>}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-ink">
                {r.detail ?? <span className="text-faint">They wrote nothing beyond the reason.</span>}
              </p>
              {r.status === "closed" && (
                <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
                  {r.resolution
                    ? `Closed: ${r.resolution}${r.handled_at ? ` — ${formatMoment(r.handled_at)}` : ""}`
                    : "Closed. The words behind the decision are in the audit log, not on this row."}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Acting. Confirmations are inline: nothing in ICEFALL opens over the
          thing a person is deciding about. */}
      {kase.openReports.length > 0 && mode === "idle" && (
        <div className="mt-3.5 flex flex-wrap justify-end gap-1.5">
          {kase.status === "open" && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => act(() => claimReportCase(caseRef(kase), schema), "Marked as being reviewed.")}
            >
              Start review
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setMode("dismiss")}>
            Dismiss…
          </Button>
          {removable && (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setMode("remove")}>
              <Trash2 size={13} strokeWidth={2} /> Remove this {noun}…
            </Button>
          )}
        </div>
      )}

      {/* Why the removal button is not there. An absent control with no
          explanation reads as a bug; this one is the database's answer. */}
      {kase.openReports.length > 0 && mode === "idle" && !removable && (
        <p className="mt-2 text-right text-[11.5px] leading-relaxed text-faint">
          {shown.state !== "read"
            ? "Nothing can be removed from here until the thing itself can be read."
            : kase.kind === "message"
              ? "ICEFALL cannot delete a direct message. Nobody has that power in the database — both people hold that record."
              : kase.kind === "profile" || kase.kind === "thread"
                ? "There is no content here to remove. Closing this case with a reason is the decision."
                : "Removing this kind of message needs 20260903010000_block_and_report.sql applied; the desk has no delete on it yet."}
        </p>
      )}

      {mode === "dismiss" && (
        <div className="mt-3 rounded-tile bg-raised p-3.5">
          <p className="text-[12.5px] font-semibold text-ink">
            Close {kase.reports.length === 1 ? "this report" : `all ${kase.openReports.length} open reports here`}{" "}
            without removing anything
          </p>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
            Write what you decided. It is recorded against your name in the audit log
            {schema === "content_aware" ? " and kept on the report itself" : ""}, and it is the only
            account of why this was let stand.
          </p>
          <textarea
            rows={2}
            value={note}
            maxLength={1800}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What you decided, and why — required"
            className={FIELD}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={reset}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || note.trim().length < 4}
              onClick={() =>
                act(() => dismissReportCase(caseRef(kase), note, schema), "Closed, with your reason recorded.")
              }
            >
              Close the case
            </Button>
          </div>
        </div>
      )}

      {mode === "remove" && shown.state === "read" && (
        <div className="mt-3 rounded-tile bg-raised p-3.5">
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-bad">
            <AlertTriangle size={14} strokeWidth={2.2} /> This cannot be undone
          </p>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
            The {noun} disappears from ICEFALL for everyone, including whoever wrote it. There is no bin,
            no restore and no undo anywhere in this product. Its words are written into the audit log
            with your name and your reason — and if that record cannot be written, this screen tells you
            so rather than pretending.
            {kase.openReports.length > 1 &&
              ` All ${kase.openReports.length} open reports about it close together.`}
          </p>
          <textarea
            rows={2}
            value={note}
            maxLength={1800}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why it is being removed — required, recorded, permanent"
            className={FIELD}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={reset}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy || note.trim().length < 4}
              onClick={() =>
                act(
                  () =>
                    removeReportedContent({
                      content: shown.content,
                      reportCase: caseRef(kase),
                      reason: note,
                      schema,
                    }),
                  `The ${noun} was removed and the act recorded.`,
                )
              }
            >
              <Trash2 size={13} strokeWidth={2} /> Remove permanently
            </Button>
          </div>
        </div>
      )}

      {kase.openReports.length === 0 && (
        <div className="mt-3.5 flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onAct(() => reopenReportCase(caseRef(kase, true), schema), "Reopened for a second look.")}
          >
            Reopen
          </Button>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

export default function Moderation() {
  const [reports, setReports] = useState<Result<ReportsRead>>(loading);
  const [people, setPeople] = useState<Result<{ id: string; display_name: string; role: string }[]>>(loading);
  const [content, setContent] = useState<Result<ContentIndex>>(loading);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const refresh = useCallback(() => {
    setContent(loading<ContentIndex>());
    void listReports().then(setReports);
    void listProfilesBasic().then(setPeople);
  }, []);
  useEffect(refresh, [refresh]);

  // The reported things, fetched once the queue is known — one query per KIND,
  // so five reports about one post ask for that post once.
  useEffect(() => {
    if (reports.state !== "ok") return;
    const targets: { kind: ReportSubjectKind; id: string }[] = [];
    for (const r of reports.value.rows) {
      const t = targetOf(r);
      if (t.kind && t.id) targets.push({ kind: t.kind, id: t.id });
    }
    let cancelled = false;
    void readReportedContent(targets, reports.value.schema).then((r) => {
      if (!cancelled) setContent(r);
    });
    return () => {
      cancelled = true;
    };
  }, [reports]);

  /**
   * A display name, or the honest reason there isn't one. The two absences are
   * kept apart: a directory that failed to load is not the same news as a
   * person who is no longer in it, and a raw id fragment says neither.
   */
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    if (people.state === "ok") for (const p of people.value) m.set(p.id, p.display_name);
    return (id: string | null): string => {
      if (!id) return "nobody the report named";
      const hit = m.get(id);
      if (hit) return hit;
      return people.state === "ok" ? "someone no longer in the directory" : "a name that could not be read";
    };
  }, [people]);

  const act = (run: () => Promise<Result<null>>, message: string) => {
    setBusy(true);
    setErr(null);
    setDone(null);
    void run().then((r) => {
      setBusy(false);
      if (r.state === "ok") setDone(message);
      else setErr(r.state === "error" ? r.reason : "This CRM is not connected to a database.");
      refresh();
    });
  };

  return (
    <>
      <PageHead
        title="Moderation"
        subtitle="Everything users have reported, grouped by the thing they reported so several complaints about one post are one decision. Each case shows what was actually said, and the desk can remove it or close it with a reason — both recorded in the audit log."
      />

      {err && <p className="mb-3 text-[12.5px] leading-relaxed text-bad">{err}</p>}
      {done && <p className="mb-3 text-[12.5px] text-muted">{done}</p>}

      {reports.state === "loading" ? (
        <Loading what="the moderation queue" />
      ) : reports.state === "unavailable" ? (
        <Unavailable reason={reports.reason} />
      ) : reports.state === "forbidden" ? (
        <Forbidden reason={reports.reason} />
      ) : reports.state === "error" ? (
        <Failed reason={reports.reason} />
      ) : (
        <Queue
          read={reports.value}
          content={content}
          nameOf={nameOf}
          busy={busy}
          onAct={act}
          showClosed={showClosed}
          setShowClosed={setShowClosed}
        />
      )}
    </>
  );
}

function Queue({
  read,
  content,
  nameOf,
  busy,
  onAct,
  showClosed,
  setShowClosed,
}: {
  read: ReportsRead;
  content: Result<ContentIndex>;
  nameOf: (id: string | null) => string;
  busy: boolean;
  onAct: (run: () => Promise<Result<null>>, done: string) => void;
  showClosed: boolean;
  setShowClosed: (v: boolean) => void;
}) {
  const cases = useMemo(() => buildCases(read.rows), [read.rows]);
  const waiting = cases.filter((c) => c.status !== "closed");
  const closed = cases.filter((c) => c.status === "closed");

  const openReportCount = waiting.reduce((n, c) => n + c.openReports.length, 0);
  const oldest = waiting.length > 0 ? daysWaiting(waiting[0].firstAt) : null;
  const unremovable = waiting.filter((c) => !c.kind || !deskCanRemove(c.kind, read.schema)).length;

  /** Other unresolved cases naming the same person — the repeat-offender signal
   *  that grouping by content would otherwise hide. A count would not be enough;
   *  what the other cases ARE is the useful half. */
  const othersFor = (c: QueueCase) =>
    c.subjectId ? waiting.filter((o) => o.key !== c.key && o.subjectId === c.subjectId) : [];

  return (
    <>
      {read.schema === "legacy" && (
        <Card className="mb-4">
          <p className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
            <AlertTriangle size={15} strokeWidth={2.2} className="text-warn" />
            This queue is reading the older reports table
          </p>
          <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            Measured just now by asking the database for the columns, not assumed: a report here can name
            a person or a conversation and nothing else. There is no column for a post, a comment or a
            message, so{" "}
            <span className="font-semibold text-ink">
              no report about a post, a comment or a message can reach ICEFALL at all
            </span>{" "}
            — the phone app sends one, the database refuses it, and the person who reported it is told it
            stayed on their phone. An empty queue below is therefore not evidence that nothing has been
            reported.
          </p>
          <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            Applying <span className="tnum text-ink">20260903010000_block_and_report.sql</span> changes
            three things here: those reports start arriving, the desk gains a read on group messages and
            a delete on both message tables, and a closed report carries the sentence the moderator wrote.
            Until then that sentence is recorded in the audit log only.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          tone="butter"
          label="Cases waiting"
          value={String(waiting.length)}
          hint="One case is one thing reported, however many people reported it."
        />
        <Stat
          tone="sky"
          label="Reports waiting"
          value={String(openReportCount)}
          hint={
            waiting.length === 0
              ? "Nothing is open."
              : `Across ${waiting.length} case${waiting.length === 1 ? "" : "s"}.`
          }
        />
        <Stat
          tone="lilac"
          label="Longest wait"
          value={oldest === null ? null : oldest === 0 ? "Today" : `${oldest}d`}
          reason="Nothing is waiting, so there is no wait to measure."
          hint="Since the oldest unresolved report was filed."
        />
        <Stat
          tone="mint"
          label="Nothing to remove"
          value={String(unremovable)}
          hint="Cases about a person, a conversation, a direct message, or content this database will not let the desk delete. They can still be closed with a reason."
        />
      </div>

      <div className="mt-6">
        <SectionLabel>Waiting on a decision</SectionLabel>
        <div className="mt-2">
          {waiting.length === 0 ? (
            <Card>
              <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-faint">
                <Flag size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
                {read.schema === "legacy"
                  ? "Nothing is waiting — but read the notice above before taking that as good news. On this database only a report about a person or a conversation can arrive at all."
                  : "Nothing is waiting. A case appears here the moment anyone reports anything, from any app."}
              </p>
            </Card>
          ) : (
            waiting.map((c) => (
              <CaseCard
                key={c.key}
                kase={c}
                schema={read.schema}
                content={content}
                nameOf={nameOf}
                alsoNamed={othersFor(c)}
                busy={busy}
                onAct={onAct}
              />
            ))
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowClosed(!showClosed)}
        className="mt-3 text-[12px] font-medium text-muted hover:text-ink"
      >
        {showClosed ? "Hide" : "Show"} decided cases ({closed.length})
      </button>
      {showClosed && closed.length > 0 && (
        <div className="mt-2">
          {closed.map((c) => (
            <CaseCard
              key={c.key}
              kase={c}
              schema={read.schema}
              content={content}
              nameOf={nameOf}
              alsoNamed={[]}
              busy={busy}
              onAct={onAct}
            />
          ))}
        </div>
      )}

      <p className="mt-5 max-w-3xl text-[12px] leading-relaxed text-faint">
        Removal is a real delete: ICEFALL has no soft delete, so a removed post is gone from the product
        and survives only as its words in the audit log. A direct message can never be removed here — the
        database gives nobody, staff included, that power, because both people in a conversation hold that
        record. There is no way to report a group itself, and a company cannot be reported: only the
        person who posted for it.
      </p>
    </>
  );
}
