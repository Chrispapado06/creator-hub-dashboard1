import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag } from "lucide-react";
import { Avatar, Button, Card, PageHead, Pill, SectionLabel, TableCard } from "@/components/ui";
import { listProfilesBasic, listReports, setReportStatus } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { ReportRow } from "@/data/types";
import { formatMoment } from "@/lib/utils";

/**
 * The moderation queue — the reports table's first reader, ever.
 *
 * Reporting has existed since the chat migration ("any app where strangers
 * can message each other needs blocking and reporting on day one"); what
 * never existed was a screen where a report lands in front of a person. This
 * is that screen: every report, unresolved first, oldest wait on top.
 *
 * WHAT THIS SCREEN DOES NOT DO: act on content. Deleting a post or comment
 * happens where the content lives, under the delete policies (author, their
 * company's admin, or staff) — and every such delete writes an audit event,
 * so what a moderator did is reviewable beside why they did it. This queue
 * moves a report through open → reviewing → closed and nothing else; closing
 * a report is a statement that a person looked, not that they agreed.
 *
 * `off_platform_payment` renders loudest because it is the report that costs
 * a client the most: paid outside ICEFALL, they lose held funds, refund terms
 * and any record of what was agreed.
 */

const REASON_LABEL: Record<ReportRow["reason"], string> = {
  spam: "Spam",
  harassment: "Harassment",
  off_platform_payment: "Off-platform payment",
  safety: "Safety",
  impersonation: "Impersonation",
  other: "Other",
};

const reasonTone = (r: ReportRow["reason"]): "red" | "amber" | "neutral" =>
  r === "off_platform_payment" || r === "safety" ? "red" : r === "other" || r === "spam" ? "neutral" : "amber";

export default function Moderation() {
  const [reports, setReports] = useState<Result<ReportRow[]>>(loading);
  const [people, setPeople] = useState<Result<{ id: string; display_name: string; role: string }[]>>(loading);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const refresh = useCallback(() => {
    void listReports().then(setReports);
    void listProfilesBasic().then(setPeople);
  }, []);
  useEffect(refresh, [refresh]);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    if (people.state === "ok") for (const p of people.value) m.set(p.id, p.display_name);
    return (id: string | null) => (id ? (m.get(id) ?? id.slice(0, 8)) : null);
  }, [people]);

  const move = async (id: string, status: ReportRow["status"]) => {
    setBusy(true);
    setErr(null);
    const r = await setReportStatus(id, status);
    setBusy(false);
    if (r.state !== "ok") setErr(r.state === "error" ? r.reason : "No database is configured.");
    refresh();
  };

  const about = (r: ReportRow): string => {
    const bits: string[] = [];
    const who = nameOf(r.subject_id);
    if (who) bits.push(who);
    if (r.thread_id) bits.push(`thread ${r.thread_id.slice(0, 8)}`);
    if (r.post_id) bits.push(`post ${r.post_id.slice(0, 8)}`);
    // A report whose post was deleted keeps saying so — the deletion may be
    // exactly what the report achieved.
    return bits.length > 0 ? bits.join(" · ") : "its target no longer exists";
  };

  const table = (rows: ReportRow[]) => (
    <TableCard>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-faint">
            <th className="px-4 py-3 font-medium">Reported</th>
            <th className="px-3 py-3 font-medium">By</th>
            <th className="px-3 py-3 font-medium">Reason</th>
            <th className="px-3 py-3 font-medium">About</th>
            <th className="px-3 py-3 font-medium">Detail</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line-soft align-top">
              <td className="tnum whitespace-nowrap px-4 py-3 text-muted">{formatMoment(r.created_at)}</td>
              <td className="px-3 py-3">
                <span className="flex items-center gap-2">
                  <Avatar name={nameOf(r.reporter_id) ?? "?"} size={26} />
                  <span className="text-ink">{nameOf(r.reporter_id) ?? r.reporter_id.slice(0, 8)}</span>
                </span>
              </td>
              <td className="px-3 py-3"><Pill tone={reasonTone(r.reason)}>{REASON_LABEL[r.reason]}</Pill></td>
              <td className="px-3 py-3 text-muted">{about(r)}</td>
              <td className="max-w-[300px] px-3 py-3 text-muted">
                {r.detail ? <span className="line-clamp-3">{r.detail}</span> : <span className="text-faint">none given</span>}
              </td>
              <td className="px-3 py-3">
                <Pill tone={r.status === "open" ? "amber" : r.status === "reviewing" ? "accent" : "neutral"}>{r.status}</Pill>
              </td>
              <td className="px-3 py-3 text-right">
                <span className="flex justify-end gap-1.5">
                  {r.status === "open" && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void move(r.id, "reviewing")}>Start review</Button>
                  )}
                  {r.status !== "closed" && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void move(r.id, "closed")}>Close</Button>
                  )}
                  {r.status === "closed" && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void move(r.id, "reviewing")}>Reopen</Button>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );

  return (
    <>
      <PageHead
        title="Moderation"
        subtitle="Every report a user has filed — about a person, a conversation or a post — unresolved first. Content actions happen where the content lives and are audited there; this queue records that somebody looked."
      />
      {err && <p className="mb-3 text-[12.5px] text-bad">{err}</p>}

      {reports.state === "loading" ? (
        <Card><p className="text-[12.5px] text-faint">Reading the queue…</p></Card>
      ) : reports.state !== "ok" ? (
        <Card>
          <p className="text-[12.5px] leading-relaxed text-bad">
            Reports could not be read: {"reason" in reports ? reports.reason : ""}
          </p>
        </Card>
      ) : (
        (() => {
          const open = reports.value.filter((r) => r.status !== "closed")
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          const closed = reports.value.filter((r) => r.status === "closed");
          return (
            <>
              <SectionLabel>Waiting on a person</SectionLabel>
              <div className="mt-2">
                {open.length === 0 ? (
                  <Card>
                    <p className="flex items-center gap-2 text-[12.5px] text-faint">
                      <Flag size={14} strokeWidth={2} /> Nothing is waiting. A report appears here the moment
                      anyone files one, from any app.
                    </p>
                  </Card>
                ) : (
                  table(open)
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                className="mt-3 text-[12px] font-medium text-muted hover:text-ink"
              >
                {showClosed ? "Hide" : "Show"} closed ({closed.length})
              </button>
              {showClosed && closed.length > 0 && <div className="mt-2">{table(closed)}</div>}
            </>
          );
        })()
      )}
    </>
  );
}
