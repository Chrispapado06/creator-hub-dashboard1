import { notFound } from "next/navigation";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { FansIncomeChart } from "@/components/tracker/FansIncomeChart";
import { LogSpendForm, LogKeywordChangeForm } from "@/components/tracker/forms";
import { StatusBadge, Lift } from "@/components/tracker/bits";
import { getCreator, getCreatorMetrics, getCreatorChanges, getCreatorExperiments } from "@/lib/tracker-db";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  const creator = await getCreator(params.id);
  if (!creator) notFound();

  const [metrics, changes, experiments] = await Promise.all([
    getCreatorMetrics(params.id),
    getCreatorChanges(params.id),
    getCreatorExperiments(params.id),
  ]);

  const chartData = metrics.map((m) => ({ date: m.metric_date, fans: m.direct_fans, income: Number(m.direct_income_usd) }));
  const markers = changes.map((c) => ({ date: c.changed_on, label: c.action ?? "change" }));
  const changeById = new Map(changes.map((c) => [c.id, c]));

  const subtitle = [
    creator.of_username ? `@${creator.of_username}` : null,
    creator.onlyfinder_ref ? `OnlyFinder: ${creator.onlyfinder_ref}` : null,
    creator.daily_budget_usd != null ? `$${creator.daily_budget_usd}/day` : null,
    creator.other_platforms?.length ? `tracked: ${creator.other_platforms.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="space-y-8">
      <PageHeader title={creator.name} subtitle={subtitle || undefined} />

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-white">Direct fans &amp; income</h2>
        <FansIncomeChart data={chartData} markers={markers} />
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-white">Experiments</h2>
        {experiments.length === 0 ? (
          <EmptyState title="No experiments yet" hint="Log a keyword change below to start one." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Change</th>
                  <th className="px-4 py-2 text-left font-medium">Window</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Fans lift</th>
                  <th className="px-4 py-2 text-right font-medium">Income lift</th>
                  <th className="px-4 py-2 text-right font-medium">Fans/$ lift</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((e) => {
                  const ch = changeById.get(e.keyword_change_id);
                  return (
                    <tr key={e.id} className="border-b border-border/60">
                      <td className="px-4 py-2 text-white">
                        {ch?.changed_on ?? "—"}
                        {ch?.new_keywords?.length ? (
                          <span className="block text-[11px] text-muted">{ch.new_keywords.join(", ")}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-muted">{e.observation_start}…{e.observation_end}</td>
                      <td className="px-4 py-2"><StatusBadge status={e.status} /></td>
                      <td className="px-4 py-2 text-right"><Lift pct={e.fans_lift_pct} /></td>
                      <td className="px-4 py-2 text-right"><Lift pct={e.income_lift_pct} /></td>
                      <td className="px-4 py-2 text-right"><Lift pct={e.fans_per_dollar_lift_pct} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Log keyword change</h2>
          <LogKeywordChangeForm creatorId={creator.id} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Log daily OnlyFinder spend</h2>
          <LogSpendForm creatorId={creator.id} />
        </Card>
      </div>
    </div>
  );
}
