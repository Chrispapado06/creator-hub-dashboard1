import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/ui";
import { Lift } from "@/components/tracker/bits";
import { getDecisions } from "@/lib/tracker-db";

export const dynamic = "force-dynamic";

const COLS = [
  { key: "scale", title: "Scale", accent: "text-emerald-300", ring: "border-emerald-500/30" },
  { key: "hold", title: "Hold", accent: "text-indigo-300", ring: "border-accent/30" },
  { key: "kill", title: "Kill", accent: "text-red-300", ring: "border-red-500/30" },
] as const;

export default async function Page() {
  const d = await getDecisions();
  const total = d.scale.length + d.hold.length + d.kill.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Decisions"
        subtitle="Concluded experiments, bucketed by direct-fans lift (±15%). Confounded or unfinished windows never appear here."
      />
      {total === 0 ? (
        <EmptyState title="No concluded experiments yet" hint="Decisions appear once an experiment's 7-day observation window closes." />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLS.map((col) => (
            <div key={col.key} className={`rounded-xl border bg-surface ${col.ring}`}>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className={`text-sm font-semibold ${col.accent}`}>{col.title}</span>
                <span className="text-xs text-muted">{d[col.key].length}</span>
              </div>
              <div className="space-y-2 p-3">
                {d[col.key].length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-muted">None</p>
                ) : (
                  d[col.key].map((row) => (
                    <Link
                      key={row.id}
                      href={`/creators/${row.creator_id}`}
                      className="block rounded-lg border border-border bg-surface-2 p-3 transition hover:border-accent/50"
                    >
                      <div className="text-sm font-medium text-white">{row.creator_name}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                        <span>fans <Lift pct={row.fans_lift_pct} /></span>
                        <span>income <Lift pct={row.income_lift_pct} /></span>
                      </div>
                      <div className="mt-1 text-[10px] text-muted">ended {row.observation_end}</div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
