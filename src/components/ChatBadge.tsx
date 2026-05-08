// Discord-style red mention badge for the sidebar Team Chat link.
//
// Subscribes to team_message_mentions for the current user via Supabase
// Realtime so the count updates instantly when someone @mentions you
// (including @everyone broadcasts) — no polling. The chat page bumps
// `read_at` via markChannelRead on channel open; that UPDATE event
// flows here too and clears the badge.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureCurrentChatUser } from "@/lib/chat";
import { toast } from "sonner";

/** Returns the count of unread mentions for the current chat user. */
export function useUnreadChatMentions() {
  const [count, setCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  // Resolve the current user once on mount. ensureCurrentChatUser also
  // creates the chatter row for admins on first chat use.
  useEffect(() => {
    void ensureCurrentChatUser().then((u) => {
      if (u) setUserId(u.id);
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { count: c } = await supabase
      .from("team_message_mentions")
      .select("*", { count: "exact", head: true })
      .eq("mentioned_chatter_id", userId)
      .is("read_at", null);
    setCount(c ?? 0);
  }, [userId]);

  // Track which mention message ids we've already notified about so a
  // re-render of the subscription doesn't double-toast.
  const notifiedRef = useRef<Set<string>>(new Set());

  // Initial load + realtime subscription. Listens to BOTH inserts (new
  // mention) and updates (mention marked read). Filtering on
  // mentioned_chatter_id keeps the bandwidth tight.
  useEffect(() => {
    if (!userId) return;
    void refresh();
    const sub = supabase
      .channel(`mentions-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_message_mentions",
          filter: `mentioned_chatter_id=eq.${userId}`,
        },
        async (payload) => {
          void refresh();
          // Only notify for fresh INSERTs, not for the UPDATE that
          // marks the row as read. And only when not already on the
          // chat page (where the user can see the message anyway).
          if (payload.eventType !== "INSERT") return;
          const row = payload.new as { message_id?: string; channel_id?: string };
          if (!row.message_id || notifiedRef.current.has(row.message_id)) return;
          notifiedRef.current.add(row.message_id);
          const onChatPage = typeof window !== "undefined" && window.location.pathname === "/chat";
          if (onChatPage && document.visibilityState === "visible") return;
          // Fetch enough context for a useful notification — author +
          // first chunk of the message. One small query per mention.
          const { data: msg } = await supabase
            .from("team_messages")
            .select("author_name, content")
            .eq("id", row.message_id)
            .maybeSingle();
          const author = msg?.author_name ?? "Someone";
          const preview = (msg?.content ?? "").trim().slice(0, 140) || "(attachment)";
          const title = `${author} mentioned you`;
          // Native browser notification — only if the user already
          // granted permission (we don't ask here).
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              const n = new Notification(title, {
                body: preview,
                tag: `mention-${row.message_id}`,
              });
              n.onclick = () => {
                window.focus();
                if (window.location.pathname !== "/chat") window.location.href = "/chat";
                n.close();
              };
            }
          } catch { /* ignore */ }
          // Toast as a backstop — visible inside the app even without
          // browser-notification permission.
          toast.message(title, {
            description: preview,
            action: {
              label: "Open",
              onClick: () => {
                if (window.location.pathname !== "/chat") window.location.href = "/chat";
              },
            },
          });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(sub); };
  }, [userId, refresh]);

  return count;
}

/** Renders the Discord-style red pill if there are any unread mentions. */
export function ChatBadge() {
  const count = useUnreadChatMentions();
  if (count <= 0) return null;
  return (
    <span
      className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500 text-white min-w-[18px] text-center leading-none"
      title={`${count} unread mention${count === 1 ? "" : "s"}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
