"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { syncSubscriberData, type SyncResult } from "@/lib/actions/sync";
import { Button } from "@/components/Button";
import { ErrorBanner, SuccessBanner } from "@/components/ui";

export function SyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    const res = await syncSubscriberData();
    setResult(res);
    setLoading(false);
    // Refresh the "last synced" timestamp rendered by the server component.
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Button onClick={run} loading={loading}>
        {loading ? "Syncing…" : "Sync Subscriber Data"}
      </Button>

      {result && (
        <div className="space-y-2">
          {result.ok ? (
            <SuccessBanner
              message={`Synced ${result.synced} link${result.synced === 1 ? "" : "s"}${
                result.skipped ? `, skipped ${result.skipped}` : ""
              }.`}
            />
          ) : (
            <ErrorBanner message={result.error ?? "Sync failed."} />
          )}

          {result.warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              {result.warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
