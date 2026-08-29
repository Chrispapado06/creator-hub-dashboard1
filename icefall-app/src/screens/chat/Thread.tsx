import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  CalendarCheck,
  ChevronLeft,
  CloudOff,
  Compass,
  Check,
  Flag,
  Lock,
  Paperclip,
  Send,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Avatar, Button, Card, Disclaimer } from "@/components/ui/primitives";
import { Screen } from "@/components/layout/chrome";
import {
  LOCKED_EXPLAINER,
  LOCKED_EXPLAINER_COMPANY,
  OFF_PLATFORM_WARNING,
  fmtDay,
  fmtTime,
  isLocked,
  type ChatMessage,
  type Conversation,
} from "./data";
import { useConversation } from "./useConversations";
import { BACKEND_NOT_CONNECTED } from "@/backend/client";
import { cn } from "@/lib/utils";

/**
 * One conversation.
 *
 * TWO THINGS THIS SCREEN DOES THAT A GENERIC CHAT WOULD NOT
 *
 *   A message that has not left the device says so. No tick, no "sent" — an
 *   amber cloud and the words "waiting for signal". Someone writing from a hut
 *   needs to know their guide has not seen it, and a hopeful tick is the one
 *   piece of UI that could put a person on a mountain expecting an answer that
 *   was never delivered.
 *
 *   A guide steering the client off-platform is flagged in place. Paying outside
 *   ICEFALL costs the client the held funds, the cancellation terms and any
 *   record of what was agreed — so the warning appears against the message, with
 *   a way to report it, rather than in a help article nobody opens.
 */

/** Matches a message pushing payment off ICEFALL. Deliberately narrow. */
const OFF_PLATFORM = /\b(bank transfer|pay me directly|cash|paypal|revolut|outside the app|off the platform|knock the .*fee)\b/i;

export default function Thread() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const convo = useConversation(id);
  const [draft, setDraft] = useState("");
  const [reported, setReported] = useState(false);

  const grouped = useMemo(() => {
    const out: { day: string; items: ChatMessage[] }[] = [];
    for (const m of convo?.messages ?? []) {
      const day = fmtDay(m.at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [convo]);

  if (!convo) return <Navigate to="/messages" replace />;

  const locked = isLocked(convo);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ---- Header -------------------------------------------------------- */}
      <header
        className="flex shrink-0 items-center gap-3 border-b border-hairline bg-obsidian/90 px-3 py-3 backdrop-blur"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top, 0px))" }}
      >
        <button
          onClick={() => navigate("/messages")}
          aria-label="Back"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <ChevronLeft size={20} strokeWidth={1.6} />
        </button>

        {convo.kind === "group" ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline-strong bg-slate text-mist">
            <Users size={16} strokeWidth={1.6} />
          </span>
        ) : (
          <Avatar name={convo.name} size={36} />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[14px] text-snow">{convo.name}</p>
            {/* NO VERIFICATION TICK, AND NO DATE.
                This rendered "Documents checked by ICEFALL on 5 Jun 2026. We
                have not contacted the issuing association." Careful second
                half, invented first half: nobody has read anybody's documents,
                on that date or any other. It was the same fabricated record
                that came out of the booking flow (`screens/booking/data.ts`),
                reaching production by a second path, above a conversation the
                athlete is using to decide who to hire. `verifiedOn` stays in
                the fixture type for the day a real check produces a real date,
                and until then nothing draws it. */}
          </div>
          <p className="truncate text-[11px] text-mist-dim">
            {convo.kind === "group"
              ? `${convo.members} people · ${convo.peak}`
              : (convo.credential ?? `Climbing ${convo.peak}`)}
          </p>
        </div>
      </header>

      {locked ? (
        <LockedBody
          convo={convo}
          onAction={() =>
            navigate(convo.kind === "company" ? "/explore/expeditions" : "/book")
          }
        />
      ) : (
        <>
      {/* ---- Messages ------------------------------------------------------ */}
      <Screen className="px-4">
        <div className="space-y-5 pt-5">
          {grouped.map((g) => (
            <div key={g.day}>
              <p className="mb-4 text-center text-[10.5px] uppercase tracking-[0.14em] text-mist-dim">
                {g.day}
              </p>

              <div className="space-y-2.5">
                {g.items.map((m) => {
                  if (m.kind === "system") {
                    return (
                      <p key={m.id} className="text-center text-[11.5px] text-mist-dim">
                        {m.body}
                      </p>
                    );
                  }

                  const mine = m.from === "me";
                  const flagged = !mine && OFF_PLATFORM.test(m.body);

                  return (
                    <div key={m.id}>
                      <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[84%] rounded-card px-3.5 py-2.5",
                            mine
                              ? "rounded-br-sm bg-azure/[0.14] ring-1 ring-azure/25"
                              : "rounded-bl-sm border border-hairline bg-graphite",
                          )}
                        >
                          {m.author && (
                            <p className="mb-1 text-[11px] text-azure/80">{m.author}</p>
                          )}
                          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-snow">
                            {m.body}
                          </p>
                          <p className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] text-mist-dim">
                            <span className="tnum">{fmtTime(m.at)}</span>
                            {mine && <State state={m.state} />}
                          </p>
                        </div>
                      </div>

                      {flagged && !reported && (
                        <Card className="mt-2.5 border-alert/35">
                          <div className="flex items-start gap-2.5">
                            <ShieldAlert
                              size={15}
                              strokeWidth={1.8}
                              className="mt-px shrink-0 text-alert"
                            />
                            <div className="min-w-0">
                              <p className="text-[12.5px] text-snow">
                                This message suggests paying outside ICEFALL
                              </p>
                              <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist">
                                {OFF_PLATFORM_WARNING}
                              </p>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="mt-3"
                                onClick={() => setReported(true)}
                              >
                                <Flag size={13} strokeWidth={1.8} />
                                Report this
                              </Button>
                            </div>
                          </div>
                        </Card>
                      )}

                      {flagged && reported && (
                        <Card className="mt-2.5">
                          <p className="text-[12px] text-mist">
                            Nothing was sent — reporting is not connected yet. When it is, this goes
                            to ICEFALL with the message attached, and the guide is not told who
                            reported it.
                          </p>
                        </Card>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <Disclaimer className="pt-3">{BACKEND_NOT_CONNECTED}</Disclaimer>
        </div>
      </Screen>

      {/* ---- Composer ------------------------------------------------------- */}
      <div
        className="shrink-0 border-t border-hairline bg-obsidian/90 px-3 py-2.5 backdrop-blur"
        style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-end gap-2">
          <button
            disabled
            aria-label="Attach"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-mist-dim disabled:opacity-45"
          >
            <Paperclip size={18} strokeWidth={1.6} />
          </button>

          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message"
            className="no-scrollbar max-h-28 min-h-[40px] flex-1 resize-none rounded-card border border-hairline bg-graphite px-3.5 py-2.5 text-[13.5px] text-snow outline-none placeholder:text-mist-dim focus:border-azure"
          />

          <button
            disabled
            aria-label="Send"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-azure text-obsidian disabled:opacity-45"
          >
            <Send size={16} strokeWidth={1.9} />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10.5px] text-mist-dim">
          Sending is not connected — nothing leaves this device.
        </p>
      </div>
        </>
      )}
    </div>
  );
}

/**
 * The channel before it is unlocked.
 *
 * No history and no composer, because there is nothing to show and nothing to
 * send. HOW it unlocks depends on who is on the other side, and the two are not
 * the same: a GUIDE opens on a paid booking (an in-app purchase), a COMPANY
 * opens on a qualified enquiry (an expedition is arranged and paid off-platform,
 * so there is nothing to charge — ICEFALL earns a referral on what results). One
 * action is offered, and it is the one that opens the channel.
 */
function LockedBody({ convo, onAction }: { convo: Conversation; onAction: () => void }) {
  const first = convo.name.split(" ")[0];
  const company = convo.kind === "company";
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full border border-hairline bg-graphite text-mist-dim">
        <Lock size={22} strokeWidth={1.5} />
      </span>
      <h2 className="mt-5 text-[16px] text-snow">
        {company ? `Message ${convo.name} after a qualified enquiry` : `Message ${first} after you book`}
      </h2>
      <p className="mt-2.5 max-w-[19rem] text-[12.5px] leading-relaxed text-mist">
        {company ? LOCKED_EXPLAINER_COMPANY : LOCKED_EXPLAINER}
      </p>
      <Button size="lg" className="mt-6 w-full max-w-[16rem]" onClick={onAction}>
        {company ? (
          <>
            <Compass size={15} strokeWidth={1.8} />
            Send a qualified enquiry
          </>
        ) : (
          <>
            <CalendarCheck size={15} strokeWidth={1.8} />
            Book {first}
          </>
        )}
      </Button>
      <p className="mt-3 text-[11px] text-mist-dim">
        {company
          ? "It costs nothing and reaches them with your verified readiness."
          : "Free cancellation up to 14 days before you start."}
      </p>
    </div>
  );
}

/**
 * The delivery state, told straight.
 *
 * There is no double-tick here. ICEFALL knows a message was stored and knows
 * when the other party last opened the thread; it does not know their phone
 * received it. So: waiting, sent, seen — and nothing in between that would imply
 * more than is known.
 */
function State({ state }: { state?: ChatMessage["state"] }) {
  if (state === "queued")
    return (
      <span className="flex items-center gap-1 text-alert">
        <CloudOff size={11} strokeWidth={1.9} />
        Waiting for signal
      </span>
    );
  if (state === "failed") return <span className="text-danger">Failed</span>;
  // Distinct from "queued": nothing is waiting for signal, because there is no
  // server for it to reach.
  if (state === "unsent") return <span className="text-mist-dim">Not sent — no server yet</span>;
  if (state === "read")
    return (
      <span className="flex items-center gap-0.5 text-azure">
        <Check size={11} strokeWidth={2.4} />
        Seen
      </span>
    );
  return <Check size={11} strokeWidth={2.2} className="text-mist-dim" />;
}
