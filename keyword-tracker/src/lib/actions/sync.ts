"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { findAccountByUsername, listTrackingLinks, OfApiError } from "@/lib/of-api";
import type { Creator, TrackingLink } from "@/lib/types";

export type SyncResult = {
  ok: boolean;
  synced: number; // snapshots written
  skipped: number; // links with no OF match / no username
  warnings: string[];
  error?: string;
};

/**
 * Sync subscriber + revenue data for every tracking link:
 *   1. Group our tracking_links by creator.
 *   2. Resolve each creator's OF account id from their of_username.
 *   3. Pull live tracking-link stats from the OF API.
 *   4. Match by link_id (== OF campaignCode) and snapshot subs + revenue.
 *
 * One OF API list call per creator (not per link) to stay light on the API.
 */
export async function syncSubscriberData(): Promise<SyncResult> {
  const db = supabaseAdmin();
  const warnings: string[] = [];
  let synced = 0;
  let skipped = 0;

  try {
    const [{ data: linkRows, error: linkErr }, { data: creatorRows, error: creatorErr }] =
      await Promise.all([
        db.from("tracking_links").select("*"),
        db.from("creators").select("id, name, of_username"),
      ]);
    if (linkErr) throw new Error(linkErr.message);
    if (creatorErr) throw new Error(creatorErr.message);

    const links = (linkRows ?? []) as TrackingLink[];
    const creators = (creatorRows ?? []) as Creator[];
    if (links.length === 0) {
      return { ok: true, synced: 0, skipped: 0, warnings: ["No tracking links to sync yet."] };
    }

    const creatorById = new Map(creators.map((c) => [c.id, c]));

    // Group links by creator so we hit the OF API once per creator.
    const linksByCreator = new Map<string, TrackingLink[]>();
    for (const l of links) {
      const arr = linksByCreator.get(l.creator_id) ?? [];
      arr.push(l);
      linksByCreator.set(l.creator_id, arr);
    }

    const snapshots: {
      tracking_link_id: string;
      subscriber_count: number;
      total_revenue_usd: number;
    }[] = [];

    for (const [creatorId, creatorLinks] of linksByCreator) {
      const creator = creatorById.get(creatorId);
      const username = creator?.of_username?.trim();
      if (!username) {
        skipped += creatorLinks.length;
        warnings.push(`${creator?.name ?? "A creator"} has no OF username set — skipped.`);
        continue;
      }

      let account;
      try {
        account = await findAccountByUsername(username);
      } catch (e) {
        const msg = e instanceof OfApiError ? e.message : (e as Error).message;
        warnings.push(`Could not look up @${username}: ${msg}`);
        skipped += creatorLinks.length;
        continue;
      }
      if (!account) {
        warnings.push(`No connected OF account for @${username} — skipped.`);
        skipped += creatorLinks.length;
        continue;
      }

      let ofLinks;
      try {
        ofLinks = await listTrackingLinks(account.id);
      } catch (e) {
        const msg = e instanceof OfApiError ? e.message : (e as Error).message;
        warnings.push(`Failed to pull tracking links for @${username}: ${msg}`);
        skipped += creatorLinks.length;
        continue;
      }

      const ofByCode = new Map(ofLinks.map((l) => [String(l.campaignCode), l]));

      for (const link of creatorLinks) {
        const match = ofByCode.get(String(link.link_id));
        if (!match) {
          skipped += 1;
          warnings.push(`Link "${link.keyword}" (id ${link.link_id}) not found on @${username}.`);
          continue;
        }
        snapshots.push({
          tracking_link_id: link.id,
          subscriber_count: match.subscribersCount ?? 0,
          total_revenue_usd: Number(match.revenue?.total ?? 0),
        });
      }
    }

    if (snapshots.length > 0) {
      const { error: insErr } = await db.from("subscriber_snapshots").insert(snapshots);
      if (insErr) throw new Error(`Failed to write snapshots: ${insErr.message}`);
      synced = snapshots.length;
    }

    revalidatePath("/sync");
    revalidatePath("/dashboard");
    return { ok: true, synced, skipped, warnings };
  } catch (e) {
    const msg = e instanceof OfApiError ? e.message : (e as Error).message;
    return { ok: false, synced, skipped, warnings, error: msg };
  }
}
