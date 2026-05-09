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
export type Category = Database["public"]["Tables"]["team_categories"]["Row"];
export type Attachment = { url: string; name: string; type: string; size: number };

export type ChatUser = {
  id: string;        // chatters.id
  name: string;
  role: string | null;
  is_admin: boolean; // true if this row was auto-created from an admin login
};

// All chatter roles that exist today. Source of truth is the role enum
// in the chatters table, mirrored here so the role-mention picker /
// permission picker can iterate without an extra query.
export const CHATTER_ROLES = [
  { value: "manager",          label: "Manager" },
  { value: "chatter",          label: "Chatter" },
  { value: "reddit_va",        label: "Reddit VA" },
  { value: "instagram_va",     label: "Instagram VA" },
  { value: "facebook_va",      label: "Facebook VA" },
  { value: "x_va",             label: "X VA" },
  { value: "tiktok_va",        label: "TikTok VA" },
  { value: "social_media_va",  label: "Social Media VA" },
  { value: "content_editor",   label: "Content Editor" },
  { value: "recruiter",        label: "Recruiter" },
  { value: "other",            label: "Other" },
] as const;
export type ChatterRole = typeof CHATTER_ROLES[number]["value"];

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
  // staff record.
  //
  // CRITICAL: this used to call .maybeSingle() which throws an error
  // when more than one row matches (data: null, error: PGRST116). The
  // error wasn't being checked — the code just saw `existing` was null
  // and fell through to INSERT, creating yet another duplicate. Each
  // page load that mounted ChatBadge added one more row, snowballing
  // into hundreds of "Admin" entries on the Roster.
  //
  // The fix: order by created_at ASC and limit(1). Always returns the
  // OLDEST row even when many duplicates exist, never errors. Future
  // duplicates can't be created because we always reuse the oldest.
  const { data: existingRows } = await supabase
    .from("chatters")
    .select("id, name, role")
    .ilike("name", session.username)
    .order("created_at", { ascending: true })
    .limit(1);
  const existing = existingRows?.[0];
  if (existing) {
    // Backfill access_codes.chatter_id so subsequent logins skip this lookup
    await supabase
      .from("access_codes")
      .update({ chatter_id: existing.id })
      .eq("username", session.username);
    return { id: existing.id, name: existing.name, role: existing.role, is_admin: true };
  }

  // Create a "manager" chatter row that represents this admin in chat.
  // Only happens when truly no row exists — duplicate-creation is now
  // guarded by the ordered-limit-1 lookup above.
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

/**
 * All channels the current user can see, with unread counts merged in.
 * Visibility rules — applied in this order:
 *   1. Channels in a category check the category's allowed_roles. Empty
 *      / NULL allowed_roles = visible to everyone. Admins always pass.
 *   2. Private + DM channels also require membership.
 *   3. Public / announcements / creator channels with no category are
 *      visible to everyone.
 */
export async function listChannelsForUser(
  userId: string,
  opts?: { user?: ChatUser },
): Promise<(Channel & {
  unread_count: number;
  is_member: boolean;
  dm_partner?: { id: string; name: string } | null;
})[]> {
  const isAdmin = opts?.user?.is_admin ?? false;
  // Pull every non-archived channel + the user's membership rows + every
  // category in parallel so we can decide visibility client-side.
  const [{ data: channels }, { data: memberships }, { data: cats }, { data: meRow }] = await Promise.all([
    supabase
      .from("team_channels")
      .select("*")
      .is("archived_at", null)
      .order("position", { ascending: true })
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("team_channel_members")
      .select("*")
      .eq("chatter_id", userId),
    supabase
      .from("team_categories")
      .select("id, allowed_roles")
      .is("archived_at", null),
    // Pull our own role for category gating (the auto-created admin
    // chatter is role='manager', which is fine — admins also bypass
    // via isAdmin).
    supabase.from("chatters").select("role").eq("id", userId).maybeSingle(),
  ]);

  const myRole = (meRow as { role: string } | null)?.role ?? null;
  const catRoles = new Map<string, string[] | null>(
    (cats ?? []).map((c) => [c.id, (c.allowed_roles ?? null) as string[] | null]),
  );

  const memberByChannel = new Map((memberships ?? []).map((m) => [m.channel_id, m]));
  const visibleChannels = (channels ?? []).filter((c) => {
    // Category visibility gate. Skipped for admins. Skipped for channels
    // with no category. Skipped for categories with empty allowed_roles.
    if (c.category_id && !isAdmin) {
      const allowed = catRoles.get(c.category_id);
      if (allowed && allowed.length > 0) {
        if (!myRole || !allowed.includes(myRole)) return false;
      }
    }
    // Public + announcements + creator channels: visible to everyone
    // (after the category gate). Private + DM channels still require
    // membership.
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

/** Create a custom public/private channel, optionally inside a category. */
export async function createChannel(input: {
  name: string;
  type: "public" | "private";
  description?: string;
  createdBy: string;
  categoryId?: string | null;
  /** When true, the channel is a Discord-style voice channel: members
      can join voice, turn on camera, and share screen. Default false. */
  isVoiceChannel?: boolean;
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
      category_id: input.categoryId ?? null,
      is_voice_channel: input.isVoiceChannel ?? false,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  // Creator joins automatically; others can join later for private channels
  await supabase.from("team_channel_members").insert({ channel_id: data.id, chatter_id: input.createdBy });
  return data.id;
}

// ── Categories ─────────────────────────────────────────────────────────

export async function listCategories(): Promise<Category[]> {
  const { data } = await supabase
    .from("team_categories")
    .select("*")
    .is("archived_at", null)
    .order("position", { ascending: true })
    .order("name");
  return (data ?? []) as Category[];
}

export async function createCategory(input: {
  name: string;
  allowedRoles?: string[] | null;  // null/empty = visible to everyone
  createdBy: string;
}): Promise<string | null> {
  const slug = input.name.toLowerCase().trim()
    .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  if (!slug) return null;
  // Allowed roles is stored as NULL when "everyone" so the visibility
  // check stays cheap. Empty arrays are normalized to NULL for the
  // same reason.
  const allowedRoles = (input.allowedRoles && input.allowedRoles.length > 0)
    ? input.allowedRoles
    : null;
  const { data, error } = await supabase
    .from("team_categories")
    .insert({
      name: input.name.trim(),
      slug,
      allowed_roles: allowedRoles,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

export async function updateCategoryRoles(
  categoryId: string,
  allowedRoles: string[] | null,
): Promise<boolean> {
  const normalized = (allowedRoles && allowedRoles.length > 0) ? allowedRoles : null;
  const { error } = await supabase
    .from("team_categories")
    .update({ allowed_roles: normalized })
    .eq("id", categoryId);
  return !error;
}

export async function deleteCategory(categoryId: string): Promise<boolean> {
  // Channels in the category get their category_id nulled (FK ON DELETE
  // SET NULL); they reappear at the top level of the sidebar.
  const { error } = await supabase.from("team_categories").delete().eq("id", categoryId);
  return !error;
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

/**
 * Soft-delete a message. We set deleted_at instead of removing the
 * row so any audit / mention chain stays intact and the realtime
 * UPDATE event reaches every other viewer (DELETE events with
 * postgres_changes are flaky to filter by foreign key).
 *
 * No server-side permission check — the UI gates the delete button
 * to the message's own author. (Same single-tenant trust model the
 * rest of the app uses; tighten later with proper Supabase auth.)
 */
export async function deleteMessage(messageId: string): Promise<boolean> {
  const { error } = await supabase
    .from("team_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId);
  return !error;
}

export async function markChannelRead(channelId: string, userId: string): Promise<void> {
  await supabase
    .from("team_channel_members")
    .upsert(
      { channel_id: channelId, chatter_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: "channel_id,chatter_id" },
    );
  // Mark mentions in THIS channel read too — clears their per-channel
  // unread + the global ping pill (after refresh).
  await supabase
    .from("team_message_mentions")
    .update({ read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("mentioned_chatter_id", userId)
    .is("read_at", null);
}

/**
 * Clear EVERY unread mention for the current user, regardless of
 * channel. Called when the chat page opens / becomes visible — the
 * sidebar ping is meant to alert "look at chat", and once the user
 * is on /chat that signal has done its job. Per-channel unread
 * counts (driven by last_read_at on membership) still persist until
 * the user opens each channel.
 */
export async function markAllMentionsRead(userId: string): Promise<void> {
  await supabase
    .from("team_message_mentions")
    .update({ read_at: new Date().toISOString() })
    .eq("mentioned_chatter_id", userId)
    .is("read_at", null);
}

// ── Mentions ────────────────────────────────────────────────────────────

const MENTION_REGEX = /@([A-Za-z0-9_-]{2,40})/g;
// Special handles that fan out to the whole team. Discord-equivalents:
//   @everyone → every active chatter
//   @here     → every member of the current channel
const SPECIAL_MENTIONS = new Set(["everyone", "here", "all"]);

/** Pull plain-text @handles out of a message. Resolution happens server-side. */
export function extractMentions(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(MENTION_REGEX)) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

/** True if any handle in the list is @everyone / @all / @here. */
export function hasBroadcastMention(handles: string[]): boolean {
  return handles.some((h) => SPECIAL_MENTIONS.has(h));
}

/**
 * Match a list of @handles against the chatter directory by name (case
 * insensitive) and return the chatter ids that match. Skips the
 * broadcast handles (@everyone, @here, @all) — those are handled
 * separately via expandBroadcastMention because they fan out to many
 * users at once.
 */
export async function resolveMentions(handles: string[]): Promise<string[]> {
  const direct = handles.filter((h) => !SPECIAL_MENTIONS.has(h));
  if (direct.length === 0) return [];
  // Match by name (lowercased, word-friendly). We prefix-match the handle
  // against the lowercase name with hyphens / underscores stripped.
  const { data } = await supabase
    .from("chatters")
    .select("id, name");
  const out: string[] = [];
  for (const c of (data ?? [])) {
    const norm = c.name.toLowerCase().replace(/\s+/g, "");
    for (const h of direct) {
      if (norm === h || norm.startsWith(h)) {
        out.push(c.id);
        break;
      }
    }
  }
  return [...new Set(out)];
}

// ── Role mentions (@RedditVA / @manager etc.) ──────────────────────────
//
// Builds a normalized handle map so users don't need to type the
// underscored DB role exactly: any of "@redditva", "@reddit_va",
// "@reddit-va", "@redditvas" all expand to chatters with role=reddit_va.

const normHandle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Map of normalized handle → DB role value
const ROLE_HANDLES: Map<string, ChatterRole> = (() => {
  const out = new Map<string, ChatterRole>();
  for (const { value, label } of CHATTER_ROLES) {
    out.set(normHandle(value), value);
    out.set(normHandle(value) + "s", value);   // managers, chatters
    out.set(normHandle(label), value);          // "Reddit VA" → reddit_va
    out.set(normHandle(label) + "s", value);
  }
  return out;
})();

/** True if any handle in the list maps to a chatter role. */
export function hasRoleMention(handles: string[]): boolean {
  return handles.some((h) => ROLE_HANDLES.has(normHandle(h)));
}

/** Pretty label for a role handle, used by the message renderer. */
export function roleLabelFor(handle: string): string | null {
  const role = ROLE_HANDLES.get(normHandle(handle));
  if (!role) return null;
  return CHATTER_ROLES.find((r) => r.value === role)?.label ?? null;
}

/**
 * Expand @rolename handles → all active chatters with that role,
 * minus the author. Used by sendMessage alongside the broadcast and
 * direct-mention expansions.
 */
export async function expandRoleMention(
  handles: string[],
  authorId: string,
): Promise<string[]> {
  const roles = new Set<ChatterRole>();
  for (const h of handles) {
    const r = ROLE_HANDLES.get(normHandle(h));
    if (r) roles.add(r);
  }
  if (roles.size === 0) return [];
  const { data } = await supabase
    .from("chatters")
    .select("id")
    .in("role", [...roles])
    .eq("status", "active");
  return (data ?? []).map((r) => r.id).filter((id) => id !== authorId);
}

/**
 * Expand @everyone / @all → every active chatter id (minus the author).
 * Expand @here → every channel member (minus the author).
 * Used by sendMessage to insert mention rows for the broadcast.
 */
export async function expandBroadcastMention(
  handles: string[],
  channelId: string,
  authorId: string,
): Promise<string[]> {
  if (!hasBroadcastMention(handles)) return [];
  const isHere = handles.includes("here") && !handles.some((h) => h === "everyone" || h === "all");
  if (isHere) {
    const { data } = await supabase
      .from("team_channel_members")
      .select("chatter_id")
      .eq("channel_id", channelId);
    return (data ?? []).map((r) => r.chatter_id).filter((id) => id !== authorId);
  }
  // @everyone / @all → every active team member except the author
  const { data } = await supabase
    .from("chatters")
    .select("id")
    .eq("status", "active");
  return (data ?? []).map((r) => r.id).filter((id) => id !== authorId);
}

// Note: the React `useUnreadChatMentions` hook lives in
// `src/components/ChatBadge.tsx` so this file stays a pure data-layer
// module that's safe to import from non-React code (e.g. tests).

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
