// "Join voice" banner shown at the top of a channel header.
//
// Three states:
//   • Empty       — nobody is in the call. "Start voice chat"
//   • Has people  — N people are in. "Join · Alice, Bob, +2"
//   • You're in   — banner is hidden; the active VoiceCallTray takes
//                   over below. (Parent decides when to render us.)
//
// Joining is a per-channel action, not a per-message one — once you
// join, you stay in the call across channel switches and even if you
// navigate inside the chat. Parent keeps a single VoiceCallManager
// alive for the duration.

import { Phone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ParticipantRow } from "@/lib/voice-call";

export function VoiceJoinBar({
  channelName,
  participants,
  chatterIndex,
  joining,
  onJoin,
}: {
  channelName: string;
  participants: ParticipantRow[];
  chatterIndex: Record<string, { name: string }>;
  joining: boolean;
  onJoin: () => void;
}) {
  const hasPeople = participants.length > 0;
  const names = participants
    .slice(0, 3)
    .map((p) => chatterIndex[p.chatter_id]?.name?.split(" ")[0] ?? "Someone")
    .join(", ");
  const more = participants.length > 3 ? ` +${participants.length - 3}` : "";

  return (
    <div className={`px-3 py-2 border-b border-border flex items-center justify-between gap-2 ${
      hasPeople ? "bg-emerald-500/5" : "bg-secondary/30"
    }`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
        {hasPeople ? (
          <>
            <Users className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">
              <span className="text-emerald-400 font-medium">{participants.length} in voice</span>
              <span className="mx-1">·</span>
              <span className="text-foreground">{names}{more}</span>
            </span>
          </>
        ) : (
          <>
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">No voice chat in #{channelName} — start one</span>
          </>
        )}
      </div>
      <Button
        size="sm"
        variant={hasPeople ? "default" : "outline"}
        className="h-7 text-xs shrink-0"
        onClick={onJoin}
        disabled={joining}
      >
        <Phone className="h-3 w-3 mr-1" />
        {joining ? "Joining…" : hasPeople ? "Join call" : "Start voice"}
      </Button>
    </div>
  );
}
