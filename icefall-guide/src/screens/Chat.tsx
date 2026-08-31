import { useState } from "react";
import { Link } from "react-router-dom";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Card, Tabs } from "@/components/ui/primitives";
import { AvatarStack, PersonAvatar } from "@/components/Photo";
import { conversations } from "@/domain/season";
import { BACKEND_NOT_CONNECTED } from "@/backend/client";
import { fmtWhen } from "@/data/demo";

type Tab = "all" | "groups" | "clients";
const TABS = [
  { value: "all" as const, label: "All" },
  { value: "groups" as const, label: "Groups" },
  { value: "clients" as const, label: "Clients" },
];

/**
 * CHAT — the conversation list from the mockup.
 *
 * The unread badge is the count of messages a client has sent that have not been
 * answered. It is derived, not stored, so a badge cannot disagree with the
 * thread it points at.
 */
export default function Chat() {
  const [tab, setTab] = useState<Tab>("all");
  const all = conversations();
  const rows = all.filter((c) =>
    tab === "groups" ? c.clients.length > 1 : tab === "clients" ? c.clients.length === 1 : true,
  );

  return (
    <Screen>
      <Stagger>
        <Rise className="flex items-center justify-between pb-4 pt-7">
          <h1 className="text-[22px] font-light text-snow">Chat</h1>
          <div className="flex items-center gap-4 text-mist">
            {/*
              Chat search went the same way, for a different reason: not
              forbidden, just never built, never owned and in nobody's backlog —
              a phantom control by the standard already applied to "New" and
              "Replace" on the listing screens. Two removals, two reasons, and
              the distinction matters: this one may legitimately come back.
            */}
            {/*
              THERE IS NO "NEW MESSAGE" BUTTON HERE, AND THERE MUST NEVER BE ONE.
              A compose icon sat here, disabled, reading as "not built yet". It is
              not unbuilt — decision 19 forbids it: a guide or operator may REPLY
              to a conversation a client opened, never open one. The messaging
              migration (written, awaiting push as of 2026-08-31) enforces that
              in its INSERT policy; the real cost either way is that a
              greyed-out control promises a capability the platform has ruled out,
              and the obvious way to "finish" it is to ask for the grant that
              would break the rule. Removed rather than left disabled.
            */}
          </div>
        </Rise>

        <Rise>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
        </Rise>

        <Rise className="space-y-1 pt-3">
          {rows.map((c) => {
            const title = c.title ?? c.clients[0]?.name ?? "Conversation";
            const preview =
              c.last?.voiceSeconds !== undefined
                ? "Voice message"
                : (c.last?.body ?? "No messages yet.");
            const prefix = c.last?.fromClientId === null ? "You: " : "";
            return (
              <Link key={c.id} to={`/chat/${c.id}`} className="block">
                <div className="flex items-start gap-3 rounded-tile px-1 py-3 transition-colors hover:bg-white/[0.03]">
                  {c.clients.length > 1 ? (
                    <AvatarStack names={c.clients.map((x) => x.name)} size={44} />
                  ) : (
                    <PersonAvatar name={title} size={44} online={c.clients[0]?.online} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="min-w-0 flex-1 truncate text-[14px] text-snow">{title}</p>
                      <span className="tnum shrink-0 text-[11px] text-mist-dim">
                        {c.last ? fmtWhen(c.last.at) : ""}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-mist">
                      {prefix}
                      {preview}
                    </p>
                    {c.waitingHours !== null && c.waitingHours > 0 && (
                      <p className="tnum mt-1 text-[11px] text-alert">
                        Waiting {c.waitingHours} h for a reply
                      </p>
                    )}
                  </div>
                  {c.unread > 0 && (
                    <span className="tnum mt-1 grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-azure px-1.5 text-[10.5px] font-semibold text-obsidian">
                      {c.unread}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}

          {rows.length === 0 && (
            <Card>
              <p className="py-5 text-center text-[13px] leading-relaxed text-mist-dim">
                {all.length === 0 ? BACKEND_NOT_CONNECTED : "Nothing in this list."}
              </p>
            </Card>
          )}
        </Rise>
      </Stagger>
    </Screen>
  );
}
