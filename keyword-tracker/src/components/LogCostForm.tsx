"use client";

import { useState, useRef } from "react";
import { logCost } from "@/lib/actions/costs";
import { Button } from "@/components/Button";
import { Card, Input, Select, Label, ErrorBanner, SuccessBanner } from "@/components/ui";
import { todayISO } from "@/lib/format";

export type LinkOption = { id: string; label: string };

export function LogCostForm({ links }: { links: LinkOption[] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const res = await logCost(new FormData(e.currentTarget));

    setLoading(false);
    if (res.ok) {
      setSuccess("Cost logged.");
      // Keep the selected link + date, just clear the numbers for fast entry.
      const form = formRef.current;
      if (form) {
        (form.elements.namedItem("clicks") as HTMLInputElement).value = "";
        (form.elements.namedItem("spend_usd") as HTMLInputElement).value = "";
      }
    } else {
      setError(res.error);
    }
  }

  if (links.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted">
          No tracking links yet. Add one on the Links page before logging costs.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="tracking_link_id">Tracking link</Label>
          <Select id="tracking_link_id" name="tracking_link_id" defaultValue="" required>
            <option value="" disabled>
              Select link…
            </option>
            {links.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="date">Date</Label>
            <Input id="date" name="date" type="date" defaultValue={todayISO()} required />
          </div>
          <div>
            <Label htmlFor="clicks">Clicks</Label>
            <Input id="clicks" name="clicks" type="number" min="0" step="1" placeholder="0" required />
          </div>
          <div>
            <Label htmlFor="spend_usd">Spend ($)</Label>
            <Input
              id="spend_usd"
              name="spend_usd"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              required
            />
          </div>
        </div>

        {error && <ErrorBanner message={error} />}
        {success && <SuccessBanner message={success} />}

        <Button type="submit" loading={loading}>
          Log cost
        </Button>
      </form>
    </Card>
  );
}
