// Active voice call tray.
//
// Mounts above the chat composer when the user is in a voice channel.
// Two zones:
//   • Participants — your tile + every remote peer's tile, in a small
//     scrollable row. Each tile shows avatar, name, mic/cam state, and
//     (when video is on) the live <video> element wired to the peer's
//     MediaStream.
//   • Controls — mic mute, camera toggle, screen share toggle, leave.
//
// We deliberately render <audio> elements for remote streams, NOT
// <video>, so the audio plays even when video isn't enabled. The
// video element only appears when the remote peer flips their camera
// or screen share on.
//
// Lifecycle ownership: the parent page owns the VoiceCallManager
// instance. This component just renders state and forwards control
// clicks. That keeps voice state alive when the user navigates between
// channels (so they can keep talking while reading another channel).

import { useEffect, useRef, useState } from "react";
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, PhoneOff, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RemoteParticipant, VoiceCallManager } from "@/lib/voice-call";

export type LocalState = {
  isMuted: boolean;
  hasVideo: boolean;
  isScreenSharing: boolean;
};

export function VoiceCallTray({
  manager,
  localStream,
  participants,
  channelName,
  meName,
  meId,
  chatterIndex,    // chatter_id -> name lookup for remote tiles
  onLeave,
}: {
  manager: VoiceCallManager;
  localStream: MediaStream | null;
  participants: RemoteParticipant[];
  channelName: string;
  meName: string;
  meId: string;
  chatterIndex: Record<string, { name: string }>;
  onLeave: () => void;
}) {
  const [muted, setMuted] = useState(false);
  const [video, setVideo] = useState(false);
  const [screen, setScreen] = useState(false);

  return (
    <div className="border-t border-border bg-emerald-500/5">
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-border/60">
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Voice connected · #{channelName}
          <span className="text-muted-foreground font-normal ml-1">
            · {participants.length + 1} {participants.length === 0 ? "person" : "people"}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
          onClick={onLeave}
        >
          <PhoneOff className="h-3.5 w-3.5 mr-1" /> Leave
        </Button>
      </div>

      {/* Tiles row */}
      <div className="px-3 py-2 flex items-center gap-2 overflow-x-auto">
        <SelfTile
          name={meName}
          meId={meId}
          stream={localStream}
          muted={muted}
          hasVideo={video}
          screen={screen}
        />
        {participants.map((p) => (
          <RemoteTile
            key={p.peerId}
            participant={p}
            name={chatterIndex[p.chatterId]?.name ?? "—"}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="px-3 py-2 flex items-center justify-center gap-1.5 border-t border-border/60">
        <ControlBtn
          active={!muted}
          dangerWhenInactive
          icon={muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          label={muted ? "Unmute" : "Mute"}
          onClick={() => setMuted(manager.toggleMic())}
        />
        <ControlBtn
          active={video}
          icon={video ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          label={video ? "Camera off" : "Camera on"}
          onClick={async () => setVideo(await manager.toggleCamera())}
        />
        <ControlBtn
          active={screen}
          icon={screen ? <MonitorOff className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
          label={screen ? "Stop sharing" : "Share screen"}
          onClick={async () => setScreen(await manager.toggleScreenShare())}
        />
      </div>
    </div>
  );
}

// ── Tiles ────────────────────────────────────────────────────────────

function SelfTile({
  name, meId, stream, muted, hasVideo, screen,
}: {
  name: string;
  meId: string;
  stream: MediaStream | null;
  muted: boolean;
  hasVideo: boolean;
  screen: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Wire up the local stream to the <video> element. We MUST mute the
  // local <video> (otherwise the user hears their own mic with a
  // delay — terrible echo experience).
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <Tile
      name={`${name} (you)`}
      idHint={meId}
      muted={muted}
      isVideoOn={hasVideo || screen}
      isScreen={screen}
    >
      {(hasVideo || screen) ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      ) : null}
    </Tile>
  );
}

function RemoteTile({
  participant, name,
}: {
  participant: RemoteParticipant;
  name: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Wire the remote stream to BOTH a <video> and an <audio> element.
  // <audio> ensures we hear them even when their camera is off.
  // <video> only renders when has_video / is_screen_sharing flips on.
  useEffect(() => {
    if (audioRef.current && participant.stream) {
      audioRef.current.srcObject = participant.stream;
    }
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const hasVisualTrack = participant.hasVideo || participant.isScreenSharing;

  return (
    <Tile
      name={name}
      idHint={participant.chatterId}
      muted={participant.isMuted}
      isVideoOn={hasVisualTrack}
      isScreen={participant.isScreenSharing}
      speaking={participant.isSpeaking}
    >
      {hasVisualTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : null}
      {/* Always-mounted audio sink */}
      <audio ref={audioRef} autoPlay />
    </Tile>
  );
}

function Tile({
  name, idHint, muted, isVideoOn, isScreen, speaking, children,
}: {
  name: string;
  idHint: string;
  muted: boolean;
  isVideoOn: boolean;
  isScreen: boolean;
  speaking?: boolean;
  children?: React.ReactNode;
}) {
  const initials = name.replace(/\(you\)/, "").trim().slice(0, 2).toUpperCase();
  return (
    <div
      className={`relative shrink-0 h-20 w-28 rounded-md overflow-hidden bg-secondary/40 border-2 transition-colors ${
        speaking ? "border-emerald-500/70" : "border-transparent"
      }`}
      title={`${name}${idHint ? ` · ${idHint.slice(0, 6)}` : ""}`}
    >
      {/* Video / screen share goes first (absolute behind) */}
      {isVideoOn ? (
        <div className="absolute inset-0">{children}</div>
      ) : (
        // Avatar fallback
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-[11px] font-semibold text-foreground">
            {initials || "?"}
          </span>
        </div>
      )}
      {/* Always-mounted audio (in case children includes one) */}
      {!isVideoOn && children}

      {/* Bottom strip: name + state pills */}
      <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] text-white truncate font-medium">{name}</span>
          <span className="flex items-center gap-1">
            {isScreen && (
              <span className="h-3.5 w-3.5 rounded-sm bg-blue-500 inline-flex items-center justify-center">
                <MonitorUp className="h-2.5 w-2.5 text-white" />
              </span>
            )}
            {muted ? (
              <span className="h-3.5 w-3.5 rounded-sm bg-rose-500 inline-flex items-center justify-center">
                <MicOff className="h-2.5 w-2.5 text-white" />
              </span>
            ) : (
              <span className="h-3.5 w-3.5 rounded-sm bg-emerald-500/80 inline-flex items-center justify-center">
                <Volume2 className="h-2.5 w-2.5 text-white" />
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Control button ─────────────────────────────────────────────────

function ControlBtn({
  active, icon, label, onClick, dangerWhenInactive,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  dangerWhenInactive?: boolean;
}) {
  const tone = active
    ? "bg-secondary/40 hover:bg-secondary/70 text-foreground"
    : dangerWhenInactive
      ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-400"
      : "bg-primary/15 hover:bg-primary/25 text-primary";
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors ${tone}`}
    >
      {icon}
    </button>
  );
}
