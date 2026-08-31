import { Link, useParams } from "react-router-dom";
import { ChevronLeft, FileText, Mic, Play, Send, Smile } from "lucide-react";
import { Screen } from "@/components/layout/chrome";
import { Card } from "@/components/ui/primitives";
import { AvatarStack, PersonAvatar, Photo } from "@/components/Photo";
import { inputClass } from "@/components/guide";
import { conversations } from "@/domain/season";
import { clientById, fmtWhen } from "@/data/demo";
import { cn } from "@/lib/utils";

/**
 * A CONVERSATION — the mockup's thread view.
 *
 * THE COMPOSER IS DISABLED AND SAYS SO. There is no server: a working-looking
 * box that silently discarded a reply would be worse than one that admits it
 * cannot send, and a client waiting on an answer is the thing this app exists to
 * prevent. It stays hard-disabled until a real send path exists — not gated on
 * an environment variable, which is only a promise that someone set it
 * correctly (§6c).
 */
export default function Thread() {
  const { id } = useParams();
  const convo = conversations().find((c) => c.id === id);

  if (!convo) {
    return (
      <Screen>
        <div className="px-5 pt-8">
          <Link to="/chat" className="inline-flex items-center gap-1 text-[12.5px] text-mist">
            <ChevronLeft size={16} strokeWidth={1.7} /> Chat
          </Link>
          <Card className="mt-5">
            <p className="text-[12.5px] text-mist">This conversation is not on this device.</p>
          </Card>
        </div>
      </Screen>
    );
  }

  const title = convo.title ?? convo.clients[0]?.name ?? "Conversation";
  const isGroup = convo.clients.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ---- Header --------------------------------------------------------- */}
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 pb-3 pt-6">
        <Link to="/chat" aria-label="Back" className="-ml-1 text-mist">
          <ChevronLeft size={22} strokeWidth={1.7} />
        </Link>
        {isGroup ? (
          <AvatarStack names={convo.clients.map((c) => c.name)} size={36} />
        ) : (
          <PersonAvatar name={title} size={36} online={convo.clients[0]?.online} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] text-snow">{title}</p>
          <p className="text-[11px] text-mist-dim">
            {isGroup ? `${convo.clients.length} members` : (convo.clients[0]?.from ?? "Client")}
          </p>
        </div>
      </header>

      {/* ---- Messages -------------------------------------------------------- */}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {convo.bookingId && (
          <div className="mb-4">
            <Photo peak={peakFor(convo.bookingId)} alt="" className="h-32 w-full" rounded="rounded-card" />
          </div>
        )}

        <ul className="space-y-3">
          {convo.messages.map((m) => {
            const mine = m.fromClientId === null;
            const who = m.fromClientId ? clientById(m.fromClientId)?.name : null;
            return (
              <li key={m.id} className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
                {!mine && who && <PersonAvatar name={who} size={30} className="mt-4" />}
                <div className={cn("max-w-[76%]", mine && "items-end")}>
                  {!mine && isGroup && who && (
                    <p className="mb-1 text-[11px] text-azure">{who}</p>
                  )}
                  <div
                    className={cn(
                      "rounded-card border p-3",
                      mine
                        ? "rounded-br-sm border-azure/30 bg-azure/15"
                        : "rounded-bl-sm border-hairline bg-graphite",
                    )}
                  >
                    {m.voiceSeconds !== undefined ? (
                      <VoiceNote seconds={m.voiceSeconds} />
                    ) : (
                      <p className="text-[13px] leading-relaxed text-snow">{m.body}</p>
                    )}
                  </div>
                  <p
                    className={cn(
                      "tnum mt-1 text-[10.5px] text-mist-dim",
                      mine && "text-right",
                    )}
                  >
                    {fmtWhen(m.at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ---- Composer -------------------------------------------------------- */}
      <div className="shrink-0 border-t border-hairline px-4 pb-4 pt-3">
        {/* Building an offer is the one thing on this screen that WORKS, so it
            leads rather than sitting under the disabled controls. */}
        <Link
          to={`/chat/${convo.id}/offer`}
          className="mb-3 flex items-center gap-2 text-[12.5px] text-azure"
        >
          <FileText size={14} strokeWidth={1.8} />
          Build a custom offer for this client
        </Link>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              disabled
              placeholder="Replying is not connected yet."
              className={cn(inputClass, "pr-9 disabled:opacity-60")}
            />
            <Smile
              size={16}
              strokeWidth={1.7}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mist-dim"
            />
          </div>
          <button
            type="button"
            disabled
            aria-label="Record a voice message"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-azure text-obsidian disabled:opacity-40"
          >
            <Mic size={18} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            disabled
            aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-hairline-strong text-mist disabled:opacity-40"
          >
            <Send size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** The peak behind a booking, for the thread's header photograph. */
function peakFor(bookingId: string): string {
  const map: Record<string, string> = {
    b1: "everest",
    b2: "ama-dablam",
    b3: "mont-blanc",
    b4: "lobuche-east",
    b5: "island-peak",
    b6: "mera-peak",
  };
  return map[bookingId] ?? "";
}

function VoiceNote({ seconds }: { seconds: number }) {
  const bars = Array.from({ length: 28 }, (_, i) => 4 + ((i * 37) % 15));
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-azure text-obsidian">
        <Play size={13} strokeWidth={2.4} className="ml-0.5" />
      </span>
      <span className="flex h-6 flex-1 items-center gap-[2px]" aria-hidden>
        {bars.map((h, i) => (
          <span key={i} className="w-[2px] rounded-pill bg-azure/50" style={{ height: h }} />
        ))}
      </span>
      <span className="tnum shrink-0 text-[11px] text-mist-dim">
        0:{String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}
