"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select, Input, Label } from "@/components/ui";
import type { Creator } from "@/lib/types";

/** Creator + date-range filters that drive the dashboard via URL search params. */
export function DashboardFilters({ creators }: { creators: Creator[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/dashboard?${next.toString()}`);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <Label htmlFor="f-creator">Creator</Label>
        <Select
          id="f-creator"
          value={params.get("creator") ?? ""}
          onChange={(e) => setParam("creator", e.target.value)}
        >
          <option value="">All creators</option>
          {creators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="f-from">From</Label>
        <Input
          id="f-from"
          type="date"
          value={params.get("from") ?? ""}
          onChange={(e) => setParam("from", e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="f-to">To</Label>
        <Input
          id="f-to"
          type="date"
          value={params.get("to") ?? ""}
          onChange={(e) => setParam("to", e.target.value)}
        />
      </div>
    </div>
  );
}
