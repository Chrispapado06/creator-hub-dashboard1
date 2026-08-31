import Link from "next/link";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import { AddCreatorForm } from "@/components/tracker/forms";
import { listCreators } from "@/lib/tracker-db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const creators = await listCreators();
  return (
    <div className="space-y-8">
      <PageHeader title="Creators" subtitle="One experiment per keyword change — movement, not attribution." />

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Add a creator</h2>
        <AddCreatorForm />
      </Card>

      {creators.length === 0 ? (
        <EmptyState title="No creators yet" hint="Add one above — onboarding a creator never needs a code change." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {creators.map((c) => (
            <Link key={c.id} href={`/creators/${c.id}`} className="block">
              <Card className="p-4 transition hover:border-accent/50">
                <div className="font-medium text-white">{c.name}</div>
                <div className="mt-1 text-xs text-muted">
                  {c.of_username ? `@${c.of_username}` : "no OF username"}
                  {c.daily_budget_usd != null && ` · $${c.daily_budget_usd}/day`}
                </div>
                {c.other_platforms && c.other_platforms.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.other_platforms.map((p) => (
                      <span key={p} className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
