"use client";

import { Button } from "@/components/Button";
import { Card } from "@/components/ui";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted">
        Couldn&apos;t load this page. This is usually a missing environment variable or a Supabase
        connection issue.
      </p>
      <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-surface-2 p-3 text-left font-mono text-xs text-red-300">
        {error.message}
      </pre>
      <div className="mt-4">
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      </div>
    </Card>
  );
}
