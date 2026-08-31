import { getLastSyncedAt, getTrackingLinks } from "@/lib/queries";
import { SyncButton } from "@/components/SyncButton";
import { Card, PageHeader } from "@/components/ui";
import { shortDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const [lastSynced, links] = await Promise.all([getLastSyncedAt(), getTrackingLinks()]);

  return (
    <div>
      <PageHeader
        title="Sync"
        subtitle="Pull the latest subscriber + revenue numbers from the OnlyFans API for every tracking link."
      />

      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-1 border-b border-border pb-5">
          <span className="text-xs uppercase tracking-wide text-muted">Last synced</span>
          <span className="text-lg font-medium text-white">
            {lastSynced ? shortDateTime(lastSynced) : "Never"}
          </span>
          <span className="text-xs text-muted">
            {links.length} tracking link{links.length === 1 ? "" : "s"} configured.
          </span>
        </div>

        <SyncButton />

        <p className="mt-5 text-xs text-muted">
          Each sync looks up every creator&apos;s OF account by username, pulls their tracking-link
          stats, matches them to your saved links by ID, and stores a fresh snapshot. The dashboard
          always uses the most recent snapshot per link.
        </p>
      </Card>
    </div>
  );
}
