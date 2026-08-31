import { getCreators, getTrackingLinks } from "@/lib/queries";
import { deleteTrackingLink } from "@/lib/actions/links";
import { AddLinkForm } from "@/components/AddLinkForm";
import { DeleteButton } from "@/components/DeleteButton";
import { Card, PageHeader, EmptyState } from "@/components/ui";

// Always fetch fresh — this is an internal tool, not cacheable content.
export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const [creators, links] = await Promise.all([getCreators(), getTrackingLinks()]);
  const creatorName = new Map(creators.map((c) => [c.id, c.name]));

  // Group links by creator for display.
  const grouped = new Map<string, typeof links>();
  for (const l of links) {
    const arr = grouped.get(l.creator_id) ?? [];
    arr.push(l);
    grouped.set(l.creator_id, arr);
  }

  return (
    <div>
      <PageHeader
        title="Tracking Links"
        subtitle="Map each OnlyFinder ad keyword to an OnlyFans tracking link."
      />

      <div className="mb-6">
        <AddLinkForm creators={creators} />
      </div>

      {links.length === 0 ? (
        <EmptyState
          title="No tracking links yet"
          hint="Add your first link above to start attributing subscribers and revenue to keywords."
        />
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([creatorId, creatorLinks]) => (
            <div key={creatorId}>
              <h2 className="mb-2 text-sm font-semibold text-muted">
                {creatorName.get(creatorId) ?? "Unknown creator"}
              </h2>
              <Card className="divide-y divide-border overflow-hidden">
                {creatorLinks.map((l) => (
                  <div
                    key={l.id}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white">{l.keyword}</span>
                        {l.onlyfinder_campaign && (
                          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-muted">
                            {l.onlyfinder_campaign}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted">
                        Link ID: <span className="font-mono">{l.link_id}</span>
                        {l.url ? (
                          <>
                            {" · "}
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent hover:underline"
                            >
                              open URL
                            </a>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <DeleteButton action={deleteTrackingLink.bind(null, l.id)} />
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
