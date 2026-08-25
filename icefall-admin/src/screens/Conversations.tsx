import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Avatar, Card, DemoBanner, PageHead, Pill, SectionLabel } from "@/components/ui";
import { CONVERSATIONS, DEMO_NOTICE, contactById, fmtShort } from "@/data/demo";
import { cn } from "@/lib/utils";

/**
 * Oversight of client ↔ partner conversations.
 *
 * DELIBERATELY LIST-ONLY, AND STAFF CANNOT WRITE HERE. Support needs to see that
 * a client has been left waiting four days; it does not need to sit inside a
 * private negotiation about someone's money and their risk appetite. The message
 * bodies are shown because answering "why has nobody replied" requires reading
 * the last one — but there is no reply box, no edit and no delete, and the
 * database refuses those operations for admins too, not just this screen.
 */
export default function Conversations() {
  const [filter, setFilter] = useState<"all" | "waiting">("all");
  const list = filter === "waiting" ? CONVERSATIONS.filter((c) => c.unreplied) : CONVERSATIONS;

  return (
    <>
      <PageHead
        title="Conversations"
        subtitle="Every thread between an athlete and a guide or company."
      />

      <DemoBanner>{DEMO_NOTICE}</DemoBanner>

      <div className="mb-3 flex items-center gap-2">
        {(["all", "waiting"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "h-8 rounded-pill px-3 text-[12.5px] transition-colors",
              filter === f
                ? "bg-accent-soft font-medium text-accent-ink"
                : "border border-line bg-surface text-muted hover:text-ink",
            )}
          >
            {f === "all" ? `All ${CONVERSATIONS.length}` : `Waiting ${CONVERSATIONS.filter((c) => c.unreplied).length}`}
          </button>
        ))}
      </div>

      <Card pad={false}>
        <ul className="divide-y divide-line-soft">
          {list.map((c) => {
            const athlete = contactById(c.athleteId);
            const partner = contactById(c.partnerId);
            return (
              <li key={c.id} className="flex items-start gap-3 px-4 py-4 hover:bg-raised">
                <div className="flex shrink-0 -space-x-2">
                  <Avatar name={athlete?.name ?? "?"} size={30} />
                  <Avatar name={partner?.name ?? "?"} size={30} tone="accent" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[13px] text-ink">
                      {athlete?.name} <span className="text-faint">and</span> {partner?.name}
                    </p>
                    <Pill>{c.peak}</Pill>
                    {c.unreplied && <Pill tone="red">Awaiting reply</Pill>}
                  </div>
                  <p className="mt-1 truncate text-[12.5px] text-muted">“{c.lastMessage}”</p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="tnum text-[11.5px] text-faint">{fmtShort(c.at)}</p>
                  <p className="tnum mt-1 text-[11.5px] text-faint">{c.messages} messages</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mt-4 border-line-soft bg-raised">
        <div className="flex gap-3">
          <ShieldAlert size={17} strokeWidth={1.7} className="mt-[1px] shrink-0 text-faint" />
          <div>
            <SectionLabel>What staff can and cannot do here</SectionLabel>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
              This screen is read-only, and so is the database beneath it: messages have no update or
              delete policy for anyone, including admins. A message is the record of what was
              actually agreed, and the athlete is the party with less power in that conversation —
              so nobody gets to revise it afterwards, including us.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
