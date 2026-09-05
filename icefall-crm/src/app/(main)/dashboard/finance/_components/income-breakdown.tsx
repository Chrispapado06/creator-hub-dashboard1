import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

/**
 * Where ICEFALL's money comes from — the five streams the business actually
 * has, in the owner's own order.
 *
 * FIGURES ARE PLACEHOLDERS. They are the template's invented numbers wearing
 * our labels, kept only so the layout can be judged with a populated card.
 * Each one becomes a real read when the finance ledger is wired: subscriptions
 * from the billing records, slots and referrals from `revenue_records`, guide
 * income from the stored commission rows.
 */
const INCOME_SOURCES: { label: string; share: number; amount: string }[] = [
  { label: "Subscriptions", share: 34, amount: "$4,560.00" },
  { label: "Ads", share: 22, amount: "$2,950.00" },
  { label: "Expedition Company Slots", share: 21, amount: "$2,815.00" },
  { label: "Expedition Company Referrals", share: 14, amount: "$1,880.00" },
  { label: "Guides", share: 9, amount: "$1,205.00" },
];

/** Strongest stream solid, each next one a shade lighter — the template's ramp. */
const BAR_TONE = ["bg-chart-3", "bg-chart-3/85", "bg-chart-3/70", "bg-chart-3/55", "bg-chart-3/40"];

export function IncomeBreakdown() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal">Income sources</CardTitle>
      </CardHeader>

      <CardContent className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-5">
        {INCOME_SOURCES.map((source, i) => (
          <section key={source.label} className="isolate flex gap-[0.5px]">
            <Separator
              orientation="vertical"
              className="mb-1 h-auto self-auto border-muted-foreground/50 border-l border-dashed bg-transparent"
            />
            <div className="flex min-h-24 flex-1 flex-col justify-between">
              <div className="flex min-w-0 flex-col gap-1 px-1">
                <p className="wrap-break-word text-muted-foreground text-xs leading-none">
                  {source.label} · {source.share}%
                </p>
                <div className="text-lg leading-none tracking-tight">{source.amount}</div>
              </div>
              <div className={`-ml-0.5 h-5 rounded-sm ${BAR_TONE[i]}`} />
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
