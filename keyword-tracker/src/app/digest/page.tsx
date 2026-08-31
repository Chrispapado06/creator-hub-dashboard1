import { PageHeader, EmptyState, Card } from "@/components/ui";
import { ActionChip } from "@/components/tracker/bits";
import { getLatestDigest } from "@/lib/tracker-db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const digest = await getLatestDigest();

  if (!digest) {
    return (
      <div className="space-y-6">
        <PageHeader title="Morning digest" subtitle="Today's Claude readout across all creators." />
        <EmptyState title="No digest yet" hint="The daily pull generates this each morning." />
      </div>
    );
  }

  const items = digest.items ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Morning digest"
        subtitle={`For ${digest.digest_date}${digest.model ? ` · ${digest.model}` : ""}`}
      />

      {digest.prose_summary && (
        <Card className="p-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">{digest.prose_summary}</p>
        </Card>
      )}

      <div className="space-y-3">
        {items.length === 0 ? (
          <EmptyState title="No experiments in today's digest" />
        ) : (
          items.map((it, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">{it.status_line}</div>
                  <p className="mt-1 text-sm text-muted">{it.read}</p>
                  {it.confound_warning && <p className="mt-1 text-xs text-amber-300">⚠ {it.confound_warning}</p>}
                </div>
                <ActionChip action={it.recommended_action} />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
