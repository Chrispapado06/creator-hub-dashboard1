"use client";

import { useState, useTransition } from "react";
import { Spinner } from "@/components/ui";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Inline delete with a click-to-confirm step. `action` is a server action bound
 * to the row id.
 */
export function DeleteButton({
  action,
  label = "Delete",
  confirmLabel = "Confirm?",
}: {
  action: () => Promise<Result>;
  label?: string;
  confirmLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return <span className="text-xs text-red-400">{error}</span>;
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        startTransition(async () => {
          const res = await action();
          if (!res.ok) setError(res.error);
        });
      }}
      onMouseLeave={() => setArmed(false)}
      className={`inline-flex items-center gap-1 text-xs font-medium transition ${
        armed ? "text-red-400" : "text-muted hover:text-red-400"
      }`}
    >
      {pending && <Spinner className="h-3 w-3" />}
      {pending ? "Deleting…" : armed ? confirmLabel : label}
    </button>
  );
}
