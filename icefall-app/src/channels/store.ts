import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import type { Channel, ChannelFeed, ChannelMessage } from "./types";

/**
 * The channel adapter.
 *
 * Untyped client, like `network/interest.ts`: the generated `Database` types do
 * not yet include the channel tables, and asserting them into the typed client
 * would be claiming a shape the generator has not seen.
 */
const db = supabase as unknown as SupabaseClient | null;

async function signedIn(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

/** Postgres codes that mean "the table is not there" rather than "you cannot". */
/* 42501 is NOT a deployment fact — it is a refusal. Measured 2026-09-02: a
   deployed table with no grant for this role answers 42501, a missing one
   answers PGRST205. Telling somebody whose session expired that the feature
   is not live yet is a false claim about the server. See backend/pgErrors.ts. */
const MISSING = new Set(["42P01", "PGRST205"]);

/**
 * A company's channels, with the reader's own membership folded in.
 *
 * `channel_members` is read for THIS reader only — the select policy allows
 * nothing else, and this adapter never asks for more. It is why `joined` and
 * `muted` can be trusted: they are the reader's own row, not a company's claim
 * about them.
 */
export function useCompanyChannels(companyId: string | undefined): {
  feed: ChannelFeed;
  reload: () => void;
} {
  const [feed, setFeed] = useState<ChannelFeed>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    let alive = true;

    void (async () => {
      if (!db) {
        if (alive) setFeed({ status: "no-backend" });
        return;
      }
      if (!(await signedIn())) {
        if (alive) setFeed({ status: "signed-out" });
        return;
      }

      const { data, error } = await db
        .from("channels")
        .select("id, company_id, name, description, cover_path, archived_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });

      if (!alive) return;
      if (error) {
        setFeed({ status: MISSING.has(error.code) ? "no-backend" : "unreachable" });
        return;
      }

      const rows = data ?? [];
      const { data: mine } = await db
        .from("channel_members")
        .select("channel_id, muted")
        .in(
          "channel_id",
          rows.map((r) => r.id as string),
        );

      if (!alive) return;
      const membership = new Map((mine ?? []).map((m) => [m.channel_id as string, m]));

      setFeed({
        status: "ready",
        channels: rows.map((r) => ({
          id: r.id as string,
          companyId: r.company_id as string,
          name: r.name as string,
          description: (r.description as string | null) ?? null,
          coverPath: (r.cover_path as string | null) ?? null,
          archivedAt: (r.archived_at as string | null) ?? null,
          joined: membership.has(r.id as string),
          muted: Boolean(membership.get(r.id as string)?.muted),
        })),
      });
    })();

    return () => {
      alive = false;
    };
  }, [companyId, nonce]);

  return { feed, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

/**
 * Join, by inserting YOUR OWN row.
 *
 * `channel_members` insert requires `profile_id = auth.uid()`, so this cannot
 * add anybody else even if a caller passed another id — an audience a company
 * assembled is a mailing list nobody consented to.
 */
export async function joinChannel(channelId: string): Promise<boolean> {
  if (!db || !supabase) return false;
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return false;
  const { error } = await db
    .from("channel_members")
    .insert({ channel_id: channelId, profile_id: me });
  return !error;
}

export async function leaveChannel(channelId: string): Promise<boolean> {
  if (!db) return false;
  const { error } = await db.from("channel_members").delete().eq("channel_id", channelId);
  return !error;
}

export async function setChannelMuted(channelId: string, muted: boolean): Promise<boolean> {
  if (!db) return false;
  const { error } = await db.from("channel_members").update({ muted }).eq("channel_id", channelId);
  return !error;
}

/**
 * A channel's messages, newest last, each with its view count.
 *
 * THE COUNT COMES FROM THE VIEW, never from counting rows here. `channel_message_stats`
 * aggregates server-side; a client-side count would need to read
 * `channel_message_views`, which nobody may do beyond their own row — and the
 * shape returned from here carries no profile id at all, so no screen built on
 * it can render "who viewed" however hard it tries.
 */
export async function readChannelMessages(channelId: string): Promise<ChannelMessage[] | null> {
  if (!db) return null;

  const { data, error } = await db
    .from("channel_messages")
    .select("id, channel_id, body, created_at, product_id, departure_id, promo_note")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true });
  if (error) return null;

  const rows = data ?? [];
  const { data: stats } = await db
    .from("channel_message_stats")
    .select("message_id, views")
    .in(
      "message_id",
      rows.map((r) => r.id as string),
    );

  const views = new Map((stats ?? []).map((s) => [s.message_id as string, Number(s.views)]));

  return rows.map((r) => ({
    id: r.id as string,
    channelId: r.channel_id as string,
    body: r.body as string,
    createdAt: r.created_at as string,
    promotion: r.product_id
      ? {
          productId: r.product_id as string,
          departureId: (r.departure_id as string | null) ?? null,
          productName: null,
          promoNote: (r.promo_note as string | null) ?? null,
        }
      : null,
    // Absent from the stats view means the count did not arrive — `null`, which
    // renders nothing. A real zero arrives as 0 and renders "0 views".
    views: views.has(r.id as string) ? (views.get(r.id as string) ?? null) : null,
  }));
}

/**
 * Record that this reader actually SAW a message.
 *
 * ONCE PER PERSON PER MESSAGE — the table's primary key enforces it, so a
 * repeat is a harmless conflict rather than a second view. The caller decides
 * WHEN, and the contract is specific: on the message genuinely being on screen,
 * not on an off-screen list item mounting. A count nobody can stand behind is
 * worse than no count, and this is the only real number in the feature.
 */
export async function recordChannelView(messageId: string): Promise<void> {
  if (!db || !supabase) return;
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return;
  await db
    .from("channel_message_views")
    .upsert({ message_id: messageId, profile_id: me }, { onConflict: "message_id,profile_id" });
}
