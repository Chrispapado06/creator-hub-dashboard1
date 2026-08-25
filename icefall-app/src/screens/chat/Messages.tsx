import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Check, CloudOff, Lock, Search, Users } from "lucide-react";
import { Rise, Screen, ScreenHeader, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { Avatar, Card, Disclaimer } from "@/components/ui/primitives";
import { fmtDay, isLocked, lastMessage, type Counterparty } from "./data";
import { useConversations } from "./useConversations";
import { BACKEND_NOT_CONNECTED } from "@/backend/client";
import { cn } from "@/lib/utils";

type Filter = "all" | "guide" | "athlete" | "group";

const TABS = [
  { value: "all" as const, label: "All" },
  { value: "guide" as const, label: "Guides" },
  { value: "athlete" as const, label: "People" },
  { value: "group" as const, label: "Groups" },
];

/** The conversation list. */
export default function Messages() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const conversations = useConversations();

  const list = conversations.filter((c) => {
    const byTab =
      tab === "all" ||
      (tab === "guide" ? c.kind === "guide" || c.kind === "company" : c.kind === tab);
    const byQ = !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase());
    return byTab && byQ;
  });

  const queued = conversations.flatMap((c) => c.messages).filter((m) => m.state === "queued");

  return (
    <Screen>
      <Stagger>
        <ScreenHeader title="Messages" subtitle="Guides, companies and other mountaineers." />

        <Rise>
          <div className="relative">
            <Search
              size={15}
              strokeWidth={1.7}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search conversations"
              className="w-full rounded-pill border border-hairline bg-graphite py-2.5 pl-10 pr-4 text-[13.5px] text-snow outline-none placeholder:text-mist-dim focus:border-azure"
            />
          </div>
        </Rise>

        {/* The one state a mountaineering app must never hide. */}
        {queued.length > 0 && (
          <Rise className="pt-4">
            <Card className="border-alert/30">
              <div className="flex items-start gap-2.5">
                <CloudOff size={15} strokeWidth={1.7} className="mt-px shrink-0 text-alert" />
                <p className="text-[12px] leading-relaxed text-mist">
                  <span className="text-snow">
                    {queued.length} message{queued.length === 1 ? "" : "s"} waiting to send.
                  </span>{" "}
                  They are on this device only and will go out when you have signal.
                </p>
              </div>
            </Card>
          </Rise>
        )}

        <Rise className="pt-5">
          <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
        </Rise>

        <Rise className="pt-4">
          <Card inset={false}>
            <ul className="divide-y divide-hairline">
              {list.map((c) => {
                const last = lastMessage(c);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => navigate(`/messages/${c.id}`)}
                      className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
                    >
                      {c.kind === "group" ? (
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline-strong bg-slate text-mist">
                          <Users size={17} strokeWidth={1.6} />
                        </span>
                      ) : (
                        <Avatar name={c.name} size={44} />
                      )}

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[14px] text-snow">{c.name}</span>
                          {c.verifiedOn && (
                            <BadgeCheck
                              size={13}
                              strokeWidth={2}
                              className="shrink-0 text-azure"
                              aria-label={`Documents checked by ICEFALL on ${c.verifiedOn}`}
                            />
                          )}
                          <KindTag kind={c.kind} members={c.members} />
                        </span>

                        {isLocked(c) ? (
                          <span className="mt-1 flex items-center gap-1 text-[12px] text-mist-dim">
                            <Lock size={11} strokeWidth={1.9} className="shrink-0" />
                            Book to message
                          </span>
                        ) : (
                          <span className="mt-1 block truncate text-[12px] text-mist">
                            {last?.state === "queued" && (
                              <CloudOff
                                size={11}
                                strokeWidth={1.9}
                                className="mr-1 inline-block align-[-1px] text-alert"
                              />
                            )}
                            {last?.state === "sent" && (
                              <Check
                                size={11}
                                strokeWidth={2.2}
                                className="mr-1 inline-block align-[-1px] text-mist-dim"
                              />
                            )}
                            {last?.from === "me" && last?.state !== "queued" ? "You: " : ""}
                            {last?.body}
                          </span>
                        )}
                      </span>

                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="tnum text-[10.5px] text-mist-dim">
                          {last ? fmtDay(last.at) : ""}
                        </span>
                        {c.unread > 0 && (
                          <span className="tnum grid h-[18px] min-w-[18px] place-items-center rounded-full bg-azure px-1.5 text-[10px] font-medium text-obsidian">
                            {c.unread}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}

              {list.length === 0 && (
                <li className="px-4 py-8 text-center text-[13px] leading-relaxed text-mist-dim">
                  {conversations.length === 0
                    ? "No conversations yet. Open a mountain, find a guide or an expedition company, and write to them."
                    : "Nothing matches."}
                </li>
              )}
            </ul>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <Disclaimer>{BACKEND_NOT_CONNECTED}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function KindTag({ kind, members }: { kind: Counterparty; members?: number }) {
  const label =
    kind === "guide"
      ? "Guide"
      : kind === "company"
        ? "Company"
        : kind === "group"
          ? `${members ?? 0} people`
          : null;
  if (!label) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-pill border px-1.5 py-[1px] text-[9.5px] uppercase tracking-[0.1em]",
        kind === "group" ? "border-hairline-strong text-mist-dim" : "border-azure/30 text-azure/80",
      )}
    >
      {label}
    </span>
  );
}
