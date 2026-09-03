import { useEffect, useState } from "react";
import { Resolve } from "@/components/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAuditEvents } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { AuditEvent } from "@/data/types";
import { formatMoment, initials } from "@/lib/utils";

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
 *
 * RE-SKIN NOTE (theme match): the table moved into the theme's Card + Table
 * primitives and the type dropped to the theme's two text tiers. Nothing was
 * added and nothing was taken away — there is no control on this screen to
 * move, because a read-only log has none. Every string below is the string that
 * was here before, including the em dash for "no change recorded" and "None
 * given" for an absent reason.
 */
export default function Audit() {
  const [result, setResult] = useState<Result<AuditEvent[]>>(loading);
  useEffect(() => {
    void listAuditEvents().then(setResult);
  }, []);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">Audit Log</h1>
        <p className="max-w-3xl text-muted-foreground text-sm">
          Every commercially meaningful action. Append-only: entries cannot be edited or removed by
          anyone, so a mistake is corrected by recording what actually happened, not by tidying the
          record.
        </p>
      </div>

      <Resolve
        result={result}
        what="audit events"
        isEmpty={(v) => v.length === 0}
        empty="Nothing has been recorded yet."
      >
        {(events) => (
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-xl leading-none">Recorded events</CardTitle>
              <CardDescription>
                {/* A measured count of the rows below, not a claim about the whole table. */}
                {events.length} event{events.length === 1 ? "" : "s"} on record, newest first.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-0">
              <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-4 font-normal">When</TableHead>
                    <TableHead className="py-4 font-normal">Action</TableHead>
                    <TableHead className="py-4 font-normal">Entity</TableHead>
                    <TableHead className="py-4 font-normal">Change</TableHead>
                    <TableHead className="py-4 font-normal">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id} className="border-border/60 align-top">
                      <TableCell className="py-4 align-top text-muted-foreground tabular-nums">
                        {formatMoment(e.created_at)}
                      </TableCell>
                      <TableCell className="py-4 align-top">
                        <Badge variant="outline">{e.action}</Badge>
                      </TableCell>
                      <TableCell className="py-4 align-top">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {initials(e.entity_type.replace(/_/g, " "))}
                            </AvatarFallback>
                          </Avatar>
                          <div className="grid gap-0.5">
                            <span>{e.entity_type}</span>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {e.entity_id.slice(0, 8)}…
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 align-top whitespace-normal text-muted-foreground">
                        <Diff previous={e.previous} next={e.next} />
                      </TableCell>
                      <TableCell className="py-4 align-top whitespace-normal text-muted-foreground">
                        {e.reason ?? <span className="text-muted-foreground">None given</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Resolve>
    </div>
  );
}

function Diff({ previous, next }: { previous: Record<string, unknown> | null; next: Record<string, unknown> | null }) {
  // The em dash, unchanged: this row recorded no before and no after. It is not
  // "N/A" and it is not an empty cell — both of those read as tidy-up.
  if (!previous && !next) return <span className="text-muted-foreground">—</span>;
  const keys = Array.from(new Set([...Object.keys(previous ?? {}), ...Object.keys(next ?? {})]));
  return (
    <span className="space-y-0.5">
      {keys.map((k) => (
        <span key={k} className="block">
          <span className="text-muted-foreground">{k}: </span>
          {previous?.[k] !== undefined && <span className="line-through opacity-60">{fmt(previous[k])}</span>}
          {previous?.[k] !== undefined && next?.[k] !== undefined && " → "}
          {next?.[k] !== undefined && <span className="text-foreground">{fmt(next[k])}</span>}
        </span>
      ))}
    </span>
  );
}

const fmt = (v: unknown) => (typeof v === "object" ? JSON.stringify(v) : String(v));
