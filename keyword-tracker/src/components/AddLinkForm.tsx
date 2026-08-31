"use client";

import { useState, useRef } from "react";
import { createTrackingLink } from "@/lib/actions/links";
import { Button } from "@/components/Button";
import { Card, Input, Select, Label, ErrorBanner, SuccessBanner } from "@/components/ui";
import type { Creator } from "@/lib/types";

export function AddLinkForm({ creators }: { creators: Creator[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const fd = new FormData(e.currentTarget);
    const res = await createTrackingLink(fd);

    setLoading(false);
    if (res.ok) {
      setSuccess("Tracking link added.");
      formRef.current?.reset();
    } else {
      setError(res.error);
    }
  }

  if (creators.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted">
          No creators found in the database. Add a creator in the main dashboard first.
        </p>
      </Card>
    );
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>+ Add Tracking Link</Button>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="creator_id">Creator</Label>
            <Select id="creator_id" name="creator_id" defaultValue="" required>
              <option value="" disabled>
                Select creator…
              </option>
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.of_username ? ` (@${c.of_username})` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="keyword">Keyword name</Label>
            <Input id="keyword" name="keyword" placeholder="e.g. petite blonde" required />
          </div>
          <div>
            <Label htmlFor="onlyfinder_campaign">OnlyFinder campaign name</Label>
            <Input id="onlyfinder_campaign" name="onlyfinder_campaign" placeholder="e.g. spring-promo" />
          </div>
          <div>
            <Label htmlFor="link_name">Link name (optional)</Label>
            <Input id="link_name" name="link_name" placeholder="Friendly label" />
          </div>
          <div>
            <Label htmlFor="link_id">OF tracking link ID</Label>
            <Input id="link_id" name="link_id" placeholder="Paste from your OF dashboard" required />
          </div>
          <div>
            <Label htmlFor="url">URL (optional)</Label>
            <Input id="url" name="url" placeholder="https://onlyfans.com/…/trk/…" />
          </div>
        </div>

        {error && <ErrorBanner message={error} />}
        {success && <SuccessBanner message={success} />}

        <div className="flex items-center gap-2">
          <Button type="submit" loading={loading}>
            Save link
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setOpen(false);
              setError(null);
              setSuccess(null);
            }}
          >
            Close
          </Button>
        </div>
      </form>
    </Card>
  );
}
