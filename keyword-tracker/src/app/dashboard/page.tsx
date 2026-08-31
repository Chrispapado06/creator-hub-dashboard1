import { getCreators, getDashboardRows } from "@/lib/queries";
import { DashboardFilters } from "@/components/DashboardFilters";
import { RoiCell } from "@/components/RoiCell";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import { usd, num } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { creator?: string; from?: string; to?: string };
}) {
  const creatorId = searchParams.creator || undefined;
  const range = { from: searchParams.from || undefined, to: searchParams.to || undefined };

  const [creators, rows] = await Promise.all([
    getCreators(),
    getDashboardRows({ creatorId, range }),
  ]);

  // Totals across the visible rows.
  const totals = rows.reduce(
    (acc, r) => {
      acc.clicks += r.clicks;
      acc.spend += r.spend;
      acc.subscribers += r.subscribers;
      acc.revenue += r.revenue;
      return acc;
    },
    { clicks: 0, spend: 0, subscribers: 0, revenue: 0 },
  );
  const totalRoi = totals.spend > 0 ? ((totals.revenue - totals.spend) / totals.spend) * 100 : null;
  const totalCostPerSub = totals.subscribers > 0 ? totals.spend / totals.subscribers : null;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="ROI per keyword: what to scale, what to cut."
      />

      <div className="mb-6">
        <DashboardFilters creators={creators} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to show yet"
          hint="Add tracking links, log OnlyFinder costs, and run a sync to populate the dashboard."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Keyword</th>
                  <th className="px-4 py-3 text-right font-medium">Clicks</th>
                  <th className="px-4 py-3 text-right font-medium">Spend</th>
                  <th className="px-4 py-3 text-right font-medium">Subscribers</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue</th>
                  <th className="px-4 py-3 text-right font-medium">Cost/Sub</th>
                  <th className="px-4 py-3 text-right font-medium">ROI%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.link.id} className="hover:bg-surface-2/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{r.link.keyword}</div>
                      <div className="text-xs text-muted">
                        {r.creatorName}
                        {r.link.onlyfinder_campaign ? ` · ${r.link.onlyfinder_campaign}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-white">{num(r.clicks)}</td>
                    <td className="px-4 py-3 text-right text-white">{usd(r.spend)}</td>
                    <td className="px-4 py-3 text-right text-white">{num(r.subscribers)}</td>
                    <td className="px-4 py-3 text-right text-white">{usd(r.revenue)}</td>
                    <td className="px-4 py-3 text-right text-muted">{usd(r.costPerSub)}</td>
                    <td className="px-4 py-3 text-right">
                      <RoiCell roi={r.roi} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface-2/30 font-medium">
                  <td className="px-4 py-3 text-white">Total ({rows.length})</td>
                  <td className="px-4 py-3 text-right text-white">{num(totals.clicks)}</td>
                  <td className="px-4 py-3 text-right text-white">{usd(totals.spend)}</td>
                  <td className="px-4 py-3 text-right text-white">{num(totals.subscribers)}</td>
                  <td className="px-4 py-3 text-right text-white">{usd(totals.revenue)}</td>
                  <td className="px-4 py-3 text-right text-muted">{usd(totalCostPerSub)}</td>
                  <td className="px-4 py-3 text-right">
                    <RoiCell roi={totalRoi} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
