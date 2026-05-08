// Team-chat data layer.
//
// One file holds the API surface the chat page talks to: resolving the
// current user (admin OR staff) into a chatter row, listing channels,
// fetching messages, sending, marking read, mentions, attachments. The
// route + components stay free of raw supabase queries.

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ChannelType = "public" | "private" | "creator" | "dm" | "announcements";

export type Channel = Database["public"]["Tables"]["team_channels"]["Row"];
export type ChannelMember = Database["public"]["Tables"]["team_channel_members"]["Row"];
export type Message = Database["public"]["Tables"]["team_messages"]["Row"];
export type Attachment = { url: string; name: string; type: string; size: number };

export type ChatUser = {
  id: string;        // chatters.id
  name: string;
  role: string | null;
  is_admin: boolean; // true if this row was auto-created from an admin login
};

// ── Current-user resolution ─────────────────────────────────────────────
//
// /chat is used by both staff (already has chatter_id on the session) and
// admins (no chatter_id — they log in via access_codes with account_type
// = 'admin'). We need a single chatter row to author messages, so for
// admins we either:
//   • find a chatter row whose name matches the admin's username, or
//   • create a fresh "manager"-role chatter row with that username.
// Either way the access_codes row gets updated with chatter_id so future
// logins resolve in one query.

type Session = { username: string; type: "admin" | "staff"; chatter_id: string | null };

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("agency_session");
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && obj.username) {
      return {
        username: String(obj.username),
        type: obj.type === "staff" ? "staff" : "admin",
        chatter_id: obj.chatter_id ?? null,
      };
    }
  } catch {
    // legacy plain-string session = admin
    return { username: raw, type: "admin", chatter_id: null };
  }
  return null;
}

export async function ensureCurrentChatUser(): Promise<ChatUser | null> {
  const session = readSession();
  if (!session) return null;

  // Staff: already linked to a chatter row at login time
  if (session.chatter_id) {
    const { data } = await supabase
      .from("chatters")
      .select("id, name, role")
      .eq("id", session.chatter_id)
      .maybeSingle();
    if (data) return { id: data.id, name: data.name, role: data.role, is_admin: false };
  }

  // Admin path: find an existing chatter by name (case-insensitive) so
  // we don't accidentally create duplicates if the admin already has a
  // staff record. Falls through to creating a new one if no match.
  const { data: existing } = await supabase
    .from("chatters")
    .select("id, name, role")
    .ilike("name", session.username)
    .maybeSingle();
  if (existing) {
    // Backfill access_codes.chatter_id so subsequent logins skip this lookup
    await supabase
      .from("access_codes")
      .update({ chatter_id: existing.id })
      .eq("username", session.username);
    return { id: existing.id, name: existing.name, role: existing.role, is_admin: true };
  }

  // Create a "manager" chatter row that represents this admin in chat.
  const { data: created, error } = await supabase
    .from("chatters")
    .insert({ name: session.username, role: "manager", status: "active" })
    .select("id, name, role")
    .single();
  if (error || !created) return null;

  await supabase
    .from("access_codes")
    .update({ chatter_id: created.id })
    .eq("username", session.username);
  return { id: created.id, name: created.name, role: created.role, is_admin: true };
}

// ── Channels ────────────────────────────────────────────────────────────

/** All channels the current user can see, with unread counts merged in. */
export async function listChannelsForUser(userId: string): Promise<(Channel & {
  unread_count: number;
  is_member: boolean;
  dm_partner?: { id: string; name: string } | null;
})[]> {
  // Pull every non-archived channel + the user's membership rows in
  // parallel so we can decide visibility client-side.
  const [{ data: channels }, { data: memberships }] = await Promise.all([
    supabase
      .from("team_channels")
      .select("*")
      .is("archived_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("team_channel_members")
      .select("*")
      .eq("chatter_id", userId),
  ]);

  const memberByChannel = new Map((memberships ?? []).map((m) => [m.channel_id, m]));
  const visibleChannels = (channels ?? []).filter((c) => {
    // Public + announcements + creator channels: visible to everyone.
    // Private + DM channels: only if the user is a member.
    if (c.type === "private" || c.type === "dm") return memberByChannel.has(c.id);
    return true;
  });

  // For DMs, fetch the other member's name so the UI can render it.
  const dmIds = visibleChannels.filter((c) => c.type === "dm").map((c) => c.id);
  const dmPartners = new Map<string, { id: string; name: string }>();
  if (dmIds.length > 0) {
    const { data: dmMembers } = await supabase
      .from("team_channel_members")
      .select("channel_id, chatter_id, chatters:chatter_id(id, name)")
      .in("channel_id", dmIds)
      .neq("chatter_id", userId);
    for (const m of (dmMembers ?? []) as unknown as { channel_id: string; chatters: { id: string; name: string } | null }[]) {
      if (m.chatters) dmPartners.set(m.channel_id, { id: m.chatters.id, name: m.chatters.name });
    }
  }

  // Unread count per channel: count messages newer than last_read_at.
  // Done in a single query by grouping after the fact.
  const unread = new Map<string, number>();
  if (visibleChannels.length > 0) {
    const { data: rows } = await supabase
      .from("team_messages")
      .select("channel_id, created_at")
      .in("channel_id", visibleChannels.map((c) => c.id))
      .is("deleted_at", null);
    for (const r of (rows ?? [])) {
      const m = memberByChannel.get(r.channel_id);
      const lastRead = m?.last_read_at ?? "1970-01-01";
      if (r.created_at > lastRead) {
        unread.set(r.channel_id, (unread.get(r.channel_id) ?? 0) + 1);
      }
    }
  }

  return visibleChannels.map((c) => ({
    ...c,
    unread_count: unread.get(c.id) ?? 0,
    is_member: memberByChannel.has(c.id),
    dm_partner: dmPartners.get(c.id) ?? null,
  }));
}

/** Auto-create per-creator channels that don't exist yet. Idempotent. */
export async function ensureCreatorChannels(): Promise<void> {
  const [{ data: creators }, { data: existing }] = await Promise.all([
    supabase.from("creators").select("id, name").eq("status", "active"),
    supabase.from("team_channels").select("creator_id").eq("type", "creator"),
  ]);
  const haveIds = new Set((existing ?? []).map((r) => r.creator_id));
  const toCreate = (creators ?? []).filter((c) => !haveIds.has(c.id));
  if (toCreate.length === 0) return;
  const rows = toCreate.map((c) => ({
    name: c.name,
    slug: `creator-${c.id.slice(0, 8)}`, // collision-safe
    type: "creator" as const,
    creator_id: c.id,
    description: `Channel for ${c.name}'s team`,
  }));
  await supabase.from("team_channels").upsert(rows, { onConflict: "slug" });
}

/** Find or create a 1:1 DM channel between two chatters. Returns channel id. */
export async function ensureDmChannel(meId: string, otherId: string): Promise<string | null> {
  if (!otherId || meId === otherId) return null;
  // Look up an existing DM channel that has BOTH members
  const { data: myDms } = await supabase
    .from("team_channel_members")
    .select("channel_id")
    .eq("chatter_id", meId);
  const myDmIds = (myDms ?? []).map((r) => r.channel_id);
  if (myDmIds.length > 0) {
    const { data: matches } = await supabase
      .from("team_channel_members")
      .select("channel_id, channels:channel_id(type)")
      .in("channel_id", myDmIds)
      .eq("chatter_id", otherId);
    type Match = { channel_id: string; channels: { type: ChannelType } | null };
    const dm = ((matches ?? []) as unknown as Match[]).find((m) => m.channels?.type === "dm");
    if (dm) return dm.channel_id;
  }

  // Fetch both names so we can store a meaningful channel.name for sorting
  const { data: people } = await supabase
    .from("chatters")
    .select("id, name")
    .in("id", [meId, otherId]);
  const names = (people ?? []).map((p) => p.name).join(" ↔ ");
  const slug = `dm-${[meId, otherId].sort().join("-").slice(0, 60)}`;

  const { data: chan, error } = await supabase
    .from("team_channels")
    .insert({ name: names || "Direct message", slug, type: "dm" as const })
    .select("id")
    .single();
  if (error || !chan) return null;

  await supabase.from("team_channel_members").insert([
    { channel_id: chan.id, chatter_id: meId },
    { channel_id: chan.id, chatter_id: otherId },
  ]);
  return chan.id;
}

/** Create a custom public/private channel. */
export async function createChannel(input: {
  name: string;
  type: "public" | "private";
  description?: string;
  createdBy: string;
}): Promise<string | null> {
  const slug = input.name.toLowerCase().trim()
    .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  if (!slug) return null;
  const { data, error } = await supabase
    .from("team_channels")
    .insert({
      name: input.name.trim(),
      slug,
      type: input.type,
      description: input.description ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  // Creator joins automatically; others can join later for private channels
  await supabase.from("team_channel_members").insert({ channel_id: data.id, chatter_id: input.createdBy });
  return data.id;
}

// ── Messages ────────────────────────────────────────────────────────────

export async function listMessages(channelId: string, limit = 200): Promise<Message[]> {
  const { data } = await supabase
    .from("team_messages")
    .select("*")
    .eq("channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Message[]).reverse();
}

export async function sendMessage(input: {
  channelId: string;
  author: ChatUser;
  content: string;
  attachments?: Attachment[];
  // Resolved chatter ids of the @mentions in the content
  mentionedChatterIds?: string[];
}): Promise<Message | null> {
  const trimmed = input.content.trim();
  if (!trimmed && (input.attachments ?? []).length === 0) return null;

  const { data: msg, error } = await supabase
    .from("team_messages")
    .insert({
      channel_id: input.channelId,
      author_chatter_id: input.author.id,
      author_name: input.author.name,
      author_role: input.author.role,
      content: trimmed,
      attachments: input.attachments ?? [],
    })
    .select("*")
    .single();
  if (error || !msg) return null;

  // Insert mentions in a second call (fire-and-forget; if it fails the
  // message is still delivered, just no notification).
  if ((input.mentionedChatterIds ?? []).length > 0) {
    const rows = input.mentionedChatterIds!.map((mid) => ({
      message_id: msg.id,
      mentioned_chatter_id: mid,
      channel_id: input.channelId,
    }));
    void supabase.from("team_message_mentions").insert(rows);
  }

  // Bump channel preview so the sidebar can sort by recency
  void supabase
    .from("team_channels")
    .update({
      last_message_at: msg.created_at,
      last_message_preview: trimmed ? trimmed.slice(0, 120) : `${msg.attachments.length} attachment(s)`,
    })
    .eq("id", input.channelId);

  return msg as Message;
}

export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  await supabase
    .from("team_channel_members")
    .upsert(
      { channel_id: channelId, chatter_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: "channel_id,chatter_id" },
    );
  // Mark mentions read too — clears the notification badge
  await supabase
    .from("team_message_mentions")
    .update({ read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("mentioned_chatter_id", userId)
    .is("read_at", null);
}

// ── Mentions ────────────────────────────────────────────────────────────

const MENTION_REGEX = /@([A-Za-z0-9_-]{2,40})/g;

/** Pull plain-text @handles out of a message. Resolution happens server-side. */
export function extractMentions(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(MENTION_REGEX)) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

/**
 * Match a list of @handles against the chatter directory by name (case
 * insensitive) and return the chatter ids that match. Used by the
 * composer right before sending.
 */
export async function resolveMentions(handles: string[]): Promise<string[]> {
  if (handles.length === 0) return [];
  // Match by name (lowercased, word-friendly). We prefix-match the handle
  // against the lowercase name with hyphens / underscores stripped.
  const { data } = await supabase
    .from("chatters")
    .select("id, name");
  const out: string[] = [];
  for (const c of (data ?? [])) {
    const norm = c.name.toLowerCase().replace(/\s+/g, "");
    for (const h of handles) {
      if (norm === h || norm.startsWith(h)) {
        out.push(c.id);
        break;
      }
    }
  }
  return [...new Set(out)];
}

// ── Attachment upload ───────────────────────────────────────────────────

export async function uploadChatAttachment(file: File): Promise<Attachment | null> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("chat-attachments").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) return null;
  const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  return {
    url: data.publicUrl,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
  };
}
