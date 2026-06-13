// Client-side Discord ping helper for the task-handoff pipeline.
//
// All Discord logic funnels through here. This NEVER holds the webhook URL —
// it POSTs to the same-origin /api/discord-notify Vercel function, which holds
// the secret server-side and forwards to Discord.
//
// notify() is best-effort: it resolves to a boolean and never throws, so a
// failed ping can't break a flow whose DB mutation has already committed.

export type NotifyArgs = {
  /** Message body. Mentions are prepended automatically from mentionUserIds. */
  content: string;
  /** Discord user IDs to @-mention (and allowlist so they actually notify). */
  mentionUserIds?: (string | null | undefined)[];
};

/** Prepend <@id> mentions to the content for each id that exists. */
function withMentions(content: string, ids: string[]): string {
  if (ids.length === 0) return content;
  return `${ids.map((id) => `<@${id}>`).join(" ")} ${content}`;
}

export async function notify({ content, mentionUserIds }: NotifyArgs): Promise<boolean> {
  const ids = (mentionUserIds ?? []).filter((x): x is string => Boolean(x));
  try {
    const res = await fetch("/api/discord-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: withMentions(content, ids), mentionUserIds: ids }),
    });
    if (!res.ok) {
      console.error("[discord] notify HTTP", res.status);
      return false;
    }
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return Boolean(json.ok);
  } catch (e) {
    console.error("[discord] notify failed:", e);
    return false;
  }
}
