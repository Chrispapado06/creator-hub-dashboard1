import { useEffect, useState } from "react";
import { Avatar, PageHead, Pill, TableCard } from "@/components/ui";
import { Resolve } from "@/components/states";
import { listAuditEvents } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { AuditEvent } from "@/data/types";
import { formatMoment } from "@/lib/utils";

/**
 * Who changed what, and when.
 *
 * READ-ONLY, AND NOT BY CONVENTION. There is no UPDATE or DELETE policy on this
 * table for anyone — including a super admin — and a trigger refuses both even
 * from the service key. A correction is a new event, never an edit to an old
 * one. That is the only way the log is worth reading.
 *
 * THE AVATAR IS THE ENTITY, NOT THE ACTOR. Every row here is about a record —
 * a company, a placement, a lead — and that is what the initials stand for. The
 * log stores the account and the desk that acted rather than a display name, so
 * nothing on this screen may put a face against a change.
 */
export default function Audit() {
  const [result, setResult] = useState<Result<AuditEvent[]>>(loading);
  useEffect(() => {
    void listAuditEvents().then(setResult);
  }, []);

  return (
    <>
      <PageHead
        title="Audit Log"
        subtitle="Every commercially meaningful action. Append-only: entries cannot be edited or removed by anyone, so a mistake is corrected by recording what actually happened, not by tidying the record."
      />
      <Resolve
        result={result}
        what="audit events"
        isEmpty={(v) => v.length === 0}
        empty="Nothing has been recorded yet."
      >
        {(events) => (
          <TableCard>
            <table className="w-full min-w-[900px] text-[13.5px]">
              <thead>
                <tr className="border-b border-line-soft text-left">
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">When</th>
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Action</th>
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Entity</th>
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Change</th>
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Reason</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-line-soft last:border-0 align-top hover:bg-raised">
                    <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">{formatMoment(e.created_at)}</td>
                    <td className="px-5 py-3.5">
                      <Pill tone="neutral">{e.action}</Pill>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-3">
                        <Avatar name={e.entity_type.replace(/_/g, " ")} size={34} />
                        <span className="min-w-0">
                          <span className="block font-medium text-ink">{e.entity_type}</span>
                          <span className="tnum block text-[12px] text-faint">
                            {e.entity_id.slice(0, 8)}…
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      <Diff previous={e.previous} next={e.next} />
                    </td>
                    <td className="px-5 py-3.5 text-muted">
                      {e.reason ?? <span className="text-faint">None given</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </Resolve>
    </>
  );
}

function Diff({ previous, next }: { previous: Record<string, unknown> | null; next: Record<string, unknown> | null }) {
  if (!previous && !next) return <span className="text-faint">—</span>;
  const keys = Array.from(new Set([...Object.keys(previous ?? {}), ...Object.keys(next ?? {})]));
  return (
    <span className="space-y-0.5">
      {keys.map((k) => (
        <span key={k} className="block">
          <span className="text-faint">{k}: </span>
          {previous?.[k] !== undefined && <span className="line-through opacity-60">{fmt(previous[k])}</span>}
          {previous?.[k] !== undefined && next?.[k] !== undefined && " → "}
          {next?.[k] !== undefined && <span className="text-ink">{fmt(next[k])}</span>}
        </span>
      ))}
    </span>
  );
}

const fmt = (v: unknown) => (typeof v === "object" ? JSON.stringify(v) : String(v));
