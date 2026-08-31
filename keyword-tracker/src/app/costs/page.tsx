import { getCreators, getTrackingLinks, getCostHistory } from "@/lib/queries";
import { deleteCost } from "@/lib/actions/costs";
import { LogCostForm, type LinkOption } from "@/components/LogCostForm";
import { DeleteButton } from "@/components/DeleteButton";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import { usd, num } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const [creators, links, history] = await Promise.all([
    getCreators(),
    getTrackingLinks(),
    getCostHistory(),
  ]);

  const creatorName = new Map(creators.map((c) => [c.id, c.name]));
  const linkOptions: LinkOption[] = links.map((l) => ({
    id: l.id,
    label: `${creatorName.get(l.creator_id) ?? "?"} · ${l.keyword}`,
  }));

  return (
    <div>
      <PageHeader
        title="Costs"
        subtitle="Log daily clicks + spend from OnlyFinder. Re-logging a date overwrites it."
      />

      <div className="mb-8">
        <LogCostForm links={linkOptions} />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-muted">Cost history</h2>
      {history.length === 0 ? (
        <EmptyState title="No costs logged yet" hint="Use the form above to record CPC data." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Link</th>
                  <th className="px-4 py-3 text-right font-medium">Clicks</th>
                  <th className="px-4 py-3 text-right font-medium">Spend</th>
                  <th className="px-4 py-3 text-right font-medium">CPC</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/40">
                    <td className="whitespace-nowrap px-4 py-3 text-white">{c.date}</td>
                    <td className="px-4 py-3 text-muted">{c.label}</td>
                    <td className="px-4 py-3 text-right text-white">{num(c.clicks)}</td>
                    <td className="px-4 py-3 text-right text-white">{usd(Number(c.spend_usd))}</td>
                    <td className="px-4 py-3 text-right text-muted">
                      {c.clicks > 0 ? usd(Number(c.spend_usd) / c.clicks) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeleteButton action={deleteCost.bind(null, c.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
