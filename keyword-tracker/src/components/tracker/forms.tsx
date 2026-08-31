"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Input, Label, Select, ErrorBanner, SuccessBanner } from "@/components/ui";
import { addCreator, logKeywordChange, logDailySpend, type ActionResult } from "@/lib/tracker-actions";

const todayISO = () => new Date().toISOString().slice(0, 10);

function useFormSubmit(action: (fd: FormData) => Promise<ActionResult>, successMsg: string) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setMsg({});
    start(async () => {
      const r = await action(fd);
      if (r.ok) {
        setMsg({ ok: successMsg });
        form.reset();
      } else {
        setMsg({ err: r.error });
      }
    });
  }
  return { pending, msg, onSubmit };
}

const btn =
  "rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50";

// ── Add creator ──────────────────────────────────────────────────────────────
export function AddCreatorForm() {
  const { pending, msg, onSubmit } = useFormSubmit(addCreator, "Creator added.");
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Name *</Label>
          <Input id="name" name="name" placeholder="Aria" required />
        </div>
        <div>
          <Label htmlFor="of_username">OnlyFans username</Label>
          <Input id="of_username" name="of_username" placeholder="ariaxo" />
        </div>
        <div>
          <Label htmlFor="ofapi_ref">OFAPI ref (acct id)</Label>
          <Input id="ofapi_ref" name="ofapi_ref" placeholder="acct_… (optional — resolves from username)" />
        </div>
        <div>
          <Label htmlFor="onlyfinder_ref">OnlyFinder ref</Label>
          <Input id="onlyfinder_ref" name="onlyfinder_ref" placeholder="onlyfinder profile / handle" />
        </div>
        <div>
          <Label htmlFor="daily_budget_usd">Daily OnlyFinder budget ($)</Label>
          <Input id="daily_budget_usd" name="daily_budget_usd" type="number" step="0.01" placeholder="25" />
        </div>
        <div>
          <Label htmlFor="other_platforms">Other (tracked) platforms</Label>
          <Input id="other_platforms" name="other_platforms" placeholder="reddit, instagram, tiktok" />
        </div>
      </div>
      {msg.err && <ErrorBanner message={msg.err} />}
      {msg.ok && <SuccessBanner message={msg.ok} />}
      <button className={btn} disabled={pending}>{pending ? "Adding…" : "Add creator"}</button>
    </form>
  );
}

// ── Log keyword change ───────────────────────────────────────────────────────
export function LogKeywordChangeForm({ creatorId }: { creatorId: string }) {
  const { pending, msg, onSubmit } = useFormSubmit(logKeywordChange, "Keyword change logged — experiment started.");
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="creator_id" value={creatorId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="changed_on">Date changed *</Label>
          <Input id="changed_on" name="changed_on" type="date" defaultValue={todayISO()} required />
        </div>
        <div>
          <Label htmlFor="action">Action</Label>
          <Select id="action" name="action" defaultValue="replaced">
            <option value="added">added</option>
            <option value="removed">removed</option>
            <option value="replaced">replaced</option>
            <option value="reordered">reordered</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="new_keywords">New keywords * (comma-separated)</Label>
        <Input id="new_keywords" name="new_keywords" placeholder="petite, gamer girl, cosplay" required />
      </div>
      <div>
        <Label htmlFor="note">Note</Label>
        <Input id="note" name="note" placeholder="optional context" />
      </div>
      {msg.err && <ErrorBanner message={msg.err} />}
      {msg.ok && <SuccessBanner message={msg.ok} />}
      <button className={btn} disabled={pending}>{pending ? "Saving…" : "Log keyword change"}</button>
    </form>
  );
}

// ── Log daily spend ──────────────────────────────────────────────────────────
export function LogSpendForm({ creatorId }: { creatorId: string }) {
  const { pending, msg, onSubmit } = useFormSubmit(logDailySpend, "Spend saved.");
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="creator_id" value={creatorId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="metric_date">Date *</Label>
          <Input id="metric_date" name="metric_date" type="date" defaultValue={todayISO()} required />
        </div>
        <div>
          <Label htmlFor="spend_usd">OnlyFinder spend ($) *</Label>
          <Input id="spend_usd" name="spend_usd" type="number" step="0.01" placeholder="25.00" required />
        </div>
      </div>
      {msg.err && <ErrorBanner message={msg.err} />}
      {msg.ok && <SuccessBanner message={msg.ok} />}
      <button className={btn} disabled={pending}>{pending ? "Saving…" : "Log spend"}</button>
    </form>
  );
}
