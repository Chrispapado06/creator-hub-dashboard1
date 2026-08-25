import { useState } from "react";
import { ChevronLeft, Clock, Send } from "lucide-react";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Badge, Button, Card, Disclaimer } from "@/components/ui/primitives";
import { Notice, inputClass } from "@/components/guide";
import { DEMO_NOTICE, ENQUIRIES, fmtDate } from "@/data/demo";
import { cn } from "@/lib/utils";

/**
 * Talking to clients.
 *
 * On a phone this is a list that becomes a thread, not a two-pane desktop inbox.
 * The reply box is deliberately DISABLED rather than absent: a working-looking
 * box that silently discards a reply would be worse than one that says it cannot
 * send yet, and a client waiting on an answer is the thing this app exists to
 * prevent.
 */
export default function Enquiries() {
  const [openId, setOpenId] = useState<string | null>(null);
  const current = ENQUIRIES.find((e) => e.id === openId);

  if (current) {
    return (
      <Screen>
        <Stagger>
          <Rise className="pb-4 pt-6">
            <button
              onClick={() => setOpenId(null)}
              className="-ml-2 mb-4 flex items-center gap-1 rounded-full px-2 py-1 text-[12.5px] text-mist transition-colors hover:text-snow"
            >
              <ChevronLeft size={16} strokeWidth={1.7} />
              All clients
            </button>

            <h1 className="text-[20px] font-light text-snow">{current.client}</h1>
            <p className="mt-1 text-[12px] text-mist-dim">
              {current.country} · {current.peak} · {current.dates}
            </p>
          </Rise>

          <Rise>
            <div className="max-w-[85%] rounded-card rounded-tl-sm border border-hairline bg-graphite p-3.5">
              <p className="text-[13px] leading-relaxed text-snow">{current.message}</p>
              <p className="mt-2 text-[10.5px] text-mist-dim">{fmtDate(current.at)}</p>
            </div>
          </Rise>

          <Rise className="pt-6">
            <textarea
              rows={3}
              disabled
              placeholder="Replying is not connected yet."
              className={cn(inputClass, "resize-none disabled:opacity-60")}
            />
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <p className="text-[11px] text-mist-dim">Nothing is sent from this build.</p>
              <Button size="sm" disabled>
                <Send size={13} strokeWidth={1.8} />
                Reply
              </Button>
            </div>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stagger>
        <ScreenHeader title="Clients" subtitle="Athletes asking about your dates." />

        <Rise>
          <Disclaimer>{DEMO_NOTICE}</Disclaimer>
        </Rise>

        <Rise className="space-y-2.5 pt-5">
          {ENQUIRIES.map((e) => (
            <button key={e.id} onClick={() => setOpenId(e.id)} className="block w-full text-left">
              <Card className="transition-colors hover:border-hairline-strong">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] text-snow">{e.client}</p>
                      {e.unread && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-mist-dim">
                      {e.peak} · {e.dates}
                    </p>
                  </div>
                  {e.waitingHours > 0 && (
                    <Badge tone={e.waitingHours > 12 ? "danger" : "alert"}>
                      <Clock size={10} strokeWidth={2} />
                      {e.waitingHours} h
                    </Badge>
                  )}
                </div>
                <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-mist">
                  “{e.message}”
                </p>
              </Card>
            </button>
          ))}
        </Rise>

        <Rise className="pt-6">
          <Notice tone="neutral">
            Response time is the one thing every client feels. When messaging is connected, an
            unanswered enquiry will chase you here and then by email — not to police you, but
            because silence reads as “not interested” and costs you the work.
          </Notice>
        </Rise>
      </Stagger>
    </Screen>
  );
}
