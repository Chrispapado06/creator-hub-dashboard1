import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { applyView } from "./apply-view";
import { usePeek } from "./peek-context";
import {
  recordTitle,
  useProperties,
  useRecords,
  type DbRecord,
} from "./use-databases";
import type { DbView } from "./use-db-views";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

export function CalendarView({
  databaseId,
  view,
}: {
  databaseId: string;
  view: DbView;
}) {
  const { data: properties = [] } = useProperties(databaseId);
  const { data: records = [] } = useRecords(databaseId);
  const rows = applyView(records, properties, view.config);
  const { open } = usePeek();
  const dateProp =
    properties.find((p) => p.id === view.config.datePropId) ??
    properties.find((p) => p.type === "date");
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  if (!dateProp)
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Add a date property (and pick it in view settings) to use the calendar.
      </div>
    );

  const byDay = new Map<string, DbRecord[]>();
  for (const r of rows) {
    const v = r.properties[dateProp.id];
    if (typeof v === "string" && v) {
      const k = v.slice(0, 10);
      const arr = byDay.get(k);
      if (arr) arr.push(r);
      else byDay.set(k, [r]);
    }
  }

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="rounded p-1 hover:bg-accent"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="min-w-40 text-sm font-medium">
          {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
        </div>
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="rounded p-1 hover:bg-accent"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border">
        {WD.map((w) => (
          <div
            key={w}
            className="border-b bg-muted/40 p-1 text-center text-xs font-medium text-muted-foreground"
          >
            {w}
          </div>
        ))}
        {days.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const recs = byDay.get(ymd(d)) ?? [];
          return (
            <div
              key={i}
              className={cn(
                "min-h-24 border-b border-r p-1",
                !inMonth && "bg-muted/20 text-muted-foreground",
              )}
            >
              <div className="mb-1 text-xs">{d.getDate()}</div>
              <div className="space-y-1">
                {recs.slice(0, 4).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => open(r.id)}
                    className="block w-full truncate rounded bg-accent px-1 py-0.5 text-left text-xs hover:bg-accent/70"
                  >
                    {recordTitle(r, properties)}
                  </button>
                ))}
                {recs.length > 4 && (
                  <div className="text-xs text-muted-foreground">
                    +{recs.length - 4} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
