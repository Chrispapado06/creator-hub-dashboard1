// Voice / video call manager — WebRTC peer-to-peer mesh, signaled over
// Supabase Realtime broadcast. Built for Discord-style "voice channels"
// inside the agency Team Chat.
//
// Design: there is no SFU / TURN-only relay. Every participant opens
// a direct RTCPeerConnection to every other participant (mesh).
// That keeps infra cost = $0 and works fine for the small (<= 6
// participant) calls a working agency actually needs. If a call grows
// beyond ~6 people the upload bandwidth math gets ugly — at that
// scale, swap this module for LiveKit and keep the same UI surface.
//
// Two channels of communication:
//   1. presence (who is in the call) — `public.voice_session_participants`
//      Postgres rows. INSERT on join, DELETE on leave, UPDATE on
//      mic/camera toggle. Realtime fans out to everyone in the chat.
//   2. signaling (SDP offers/answers, ICE candidates) — Supabase
//      Realtime broadcast topic `voice:${channelId}`. Targeted by
//      `to_peer`, ignored by recipients with a different peer id.
//
// The "polite peer" pattern from the WebRTC spec is used to avoid
// glare (both sides offering at once): the lexicographically-larger
// peer id is impolite (always sends offers); the smaller one is
// polite (rolls back its own offer if it sees an inbound one). This
// makes the signaling resilient to startup ordering between peers.
//
// STUN: free Google STUN servers. Most agency teams will be on
// home/office NATs that punch through fine with STUN alone. If you
// later see "ICE failed" in logs, add a TURN server to ICE_SERVERS.

import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Constants ────────────────────────────────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

const HEARTBEAT_MS = 15_000;       // refresh last_heartbeat every 15s
const STALE_AFTER_MS = 60_000;     // consider a peer abandoned after 60s

// ── Types ────────────────────────────────────────────────────────────

export type ParticipantRow = {
  id: string;
  channel_id: string;
  chatter_id: string;
  peer_id: string;
  is_muted: boolean;
  has_video: boolean;
  is_screen_sharing: boolean;
  is_speaking: boolean;
  joined_at: string;
  last_heartbeat: string;
};

export type RemoteParticipant = {
  peerId: string;
  chatterId: string;
  isMuted: boolean;
  hasVideo: boolean;
  isScreenSharing: boolean;
  isSpeaking: boolean;
  // The MediaStream we get from the remote peer's RTCPeerConnection,
  // or null until they send tracks.
  stream: MediaStream | null;
};

type SignalEnvelope =
  | { kind: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { kind: "hello"; from: string; to: string };  // "I just joined, send me an offer"

export type VoiceCallEvents = {
  onLocalStream?: (stream: MediaStream | null) => void;
  onParticipantsChanged?: (participants: RemoteParticipant[]) => void;
  onError?: (msg: string) => void;
  onLeft?: () => void;
};

// ── Manager ──────────────────────────────────────────────────────────

export class VoiceCallManager {
  // Identity
  private channelId: string;
  private chatterId: string;
  private peerId: string;
  private participantRowId: string | null = null;

  // ── Media tracks ──────────────────────────────────────────────────
  // Audio is always present once the user grants the mic prompt.
  // For video we use **track substitution**: each peer connection has
  // exactly one video sender, allocated up-front via addTransceiver.
  // toggling camera or screen-share calls `sender.replaceTrack(newTrack)`
  // — no SDP renegotiation needed, and the receiver's <video> element
  // keeps the same MediaStream the whole time.
  //
  // localStream     — the audio-only stream attached to peer conns at join
  // cameraTrack     — webcam track (null when camera off)
  // screenStream    — screen-share MediaStream (the whole stream, so we
  //                   can listen for its 'ended' event when the user
  //                   clicks the browser's "Stop sharing" pill)
  // outgoingVideo   — what's currently being sent: cameraTrack OR
  //                   screenStream's video track OR null. Used to drive
  //                   the local self-tile preview.
  private localStream: MediaStream | null = null;
  private cameraTrack: MediaStreamTrack | null = null;
  private screenStream: MediaStream | null = null;
  private outgoingVideoTrack: MediaStreamTrack | null = null;
  // Stream wrapping the current outgoing video, so the self-tile
  // <video> element has something stable to bind to.
  private localPreviewStream: MediaStream | null = null;

  // Per-remote-peer state. Keyed by peerId.
  private peers = new Map<string, {
    pc: RTCPeerConnection;
    chatterId: string;
    stream: MediaStream | null;
    isMuted: boolean;
    hasVideo: boolean;
    isScreenSharing: boolean;
    isSpeaking: boolean;
    // "Polite peer" rollback machinery
    polite: boolean;
    makingOffer: boolean;
    ignoreOffer: boolean;
  }>();

  // Realtime channels
  private signalChannel: RealtimeChannel | null = null;
  private presenceChannel: RealtimeChannel | null = null;

  // Heartbeat
  private heartbeatTimer: number | null = null;

  // Events
  private events: VoiceCallEvents;

  // Local state
  private isMuted = false;
  private hasVideo = false;
  private isScreenSharing = false;

  constructor(opts: {
    channelId: string;
    chatterId: string;
    events?: VoiceCallEvents;
  }) {
    this.channelId = opts.channelId;
    this.chatterId = opts.chatterId;
    this.peerId = crypto.randomUUID();
    this.events = opts.events ?? {};
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Acquire mic (and optionally camera), insert a presence row, and
   * subscribe to the signaling/presence channels. Once subscribed,
   * existing peers will broadcast offers to us automatically.
   */
  async join(opts?: { withVideo?: boolean }): Promise<void> {
    // Audio-only stream is the baseline. Video lives in cameraTrack /
    // screenStream and gets pushed through replaceTrack on demand
    // — see broadcastVideoTrack().
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (e) {
      this.events.onError?.(
        e instanceof Error ? `Mic blocked: ${e.message}` : "Mic blocked",
      );
      throw e;
    }
    // If the caller asked for video at join, kick the camera on after
    // the audio stream is in place. This keeps the join path simple.
    this.localPreviewStream = new MediaStream();
    this.events.onLocalStream?.(this.localPreviewStream);
    if (opts?.withVideo) {
      // Best-effort — if camera fails we still join with audio.
      void this.toggleCamera();
    }

    // Insert presence row (this announces us to everyone subscribed)
    const { data, error } = await supabase
      .from("voice_session_participants")
      .insert({
        channel_id: this.channelId,
        chatter_id: this.chatterId,
        peer_id: this.peerId,
        is_muted: this.isMuted,
        has_video: this.hasVideo,
        is_screen_sharing: false,
      })
      .select("id")
      .single();
    if (error || !data) {
      this.cleanupMedia();
      throw new Error(`Couldn't join voice: ${error?.message ?? "unknown"}`);
    }
    this.participantRowId = data.id;

    // Heartbeat keeps us "alive" for stale-row cleanup.
    this.heartbeatTimer = window.setInterval(() => {
      void this.heartbeat();
    }, HEARTBEAT_MS);

    // Subscribe to signaling broadcasts BEFORE saying hello to peers,
    // so we don't miss inbound offers in the gap.
    await this.subscribeSignaling();

    // Subscribe to presence row changes for participant list updates.
    await this.subscribePresence();

    // Pull the current participant list and connect to existing peers.
    // For each existing peer, we send a "hello" — they'll respond with
    // an offer (they're the established side, so they're impolite).
    const existing = await this.fetchParticipants();
    for (const p of existing) {
      if (p.peer_id === this.peerId) continue;
      this.ensurePeer(p.peer_id, p.chatter_id);
      this.sendSignal({ kind: "hello", from: this.peerId, to: p.peer_id });
    }
    this.emitParticipants();

    // Stale row sweep — best-effort, nothing dramatic if it fails.
    void this.sweepStaleRows();
  }

  async leave(): Promise<void> {
    // Best-effort row deletion FIRST so other peers see us drop fast.
    if (this.participantRowId) {
      await supabase
        .from("voice_session_participants")
        .delete()
        .eq("id", this.participantRowId);
      this.participantRowId = null;
    }
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    // Tear down peer connections
    for (const { pc } of this.peers.values()) {
      try { pc.close(); } catch { /* ignore */ }
    }
    this.peers.clear();
    // Unsubscribe realtime
    if (this.signalChannel) {
      await supabase.removeChannel(this.signalChannel);
      this.signalChannel = null;
    }
    if (this.presenceChannel) {
      await supabase.removeChannel(this.presenceChannel);
      this.presenceChannel = null;
    }
    this.cleanupMedia();
    this.events.onLeft?.();
  }

  toggleMic(): boolean {
    if (!this.localStream) return false;
    this.isMuted = !this.isMuted;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !this.isMuted;
    }
    void this.updatePresenceFlags({ is_muted: this.isMuted });
    return this.isMuted;
  }

  async toggleCamera(): Promise<boolean> {
    if (this.hasVideo && !this.isScreenSharing) {
      // Currently showing camera → turn it off.
      this.cameraTrack?.stop();
      this.cameraTrack = null;
      this.hasVideo = false;
      await this.broadcastVideoTrack(null);
      void this.updatePresenceFlags({ has_video: false });
      return false;
    }
    if (this.isScreenSharing) {
      // We're screen-sharing — turning camera "on" swaps from screen
      // to camera (single video pipe, so they're mutually exclusive).
      // The user is unlikely to want both at once, and this matches
      // Discord behaviour.
      await this.stopScreenShareInternal();
    }
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.cameraTrack = camStream.getVideoTracks()[0];
      this.hasVideo = true;
      await this.broadcastVideoTrack(this.cameraTrack);
      void this.updatePresenceFlags({ has_video: true, is_screen_sharing: false });
      return true;
    } catch (e) {
      this.events.onError?.(
        e instanceof Error ? `Camera error: ${e.message}` : "Camera blocked",
      );
      return false;
    }
  }

  async toggleScreenShare(): Promise<boolean> {
    if (this.isScreenSharing) {
      await this.stopScreenShareInternal();
      return false;
    }
    // Camera & screen are mutually exclusive on the wire — replacing
    // turns camera off implicitly. We still keep cameraTrack alive in
    // memory only if the user wanted both, which we don't support here.
    if (this.hasVideo) {
      this.cameraTrack?.stop();
      this.cameraTrack = null;
      this.hasVideo = false;
      void this.updatePresenceFlags({ has_video: false });
    }
    try {
      // getDisplayMedia is the standard screen-share API. Browsers
      // will show their own picker UI here. iOS Safari does NOT
      // support this — it'll throw NotAllowedError or NotSupportedError.
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: false, // tab/system audio is finicky cross-browser; skip
      });
      this.screenStream = screen;
      const screenTrack = screen.getVideoTracks()[0];
      // Browser-driven "Stop sharing" pill ends the track. We listen
      // and tear down our local state in response.
      screenTrack.addEventListener("ended", () => {
        // Avoid recursion: this is the user-initiated stop, not us.
        if (this.isScreenSharing) {
          void this.stopScreenShareInternal();
        }
      });
      this.isScreenSharing = true;
      await this.broadcastVideoTrack(screenTrack);
      void this.updatePresenceFlags({ is_screen_sharing: true });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Screen share denied";
      this.events.onError?.(`Screen share: ${msg}`);
      return false;
    }
  }

  /**
   * Tear down screen share without flipping presence twice. Called
   * both from the user's toggle and from the 'ended' event when the
   * browser pill ends the share.
   */
  private async stopScreenShareInternal(): Promise<void> {
    if (this.screenStream) {
      for (const t of this.screenStream.getTracks()) t.stop();
      this.screenStream = null;
    }
    this.isScreenSharing = false;
    await this.broadcastVideoTrack(null);
    void this.updatePresenceFlags({ is_screen_sharing: false });
  }

  /**
   * Push a new outgoing video track to every peer's video sender.
   * Pass null to stop sending video. This is the heart of the
   * track-substitution model: replaceTrack swaps the bytes flowing
   * through the existing RTP stream — no renegotiation, no extra
   * <video> element on the remote side, just a smooth content swap.
   *
   * Also rebuilds the local preview MediaStream so the self-tile
   * actually shows what we're sending.
   */
  private async broadcastVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    this.outgoingVideoTrack = track;
    // Rebuild local preview stream
    if (this.localPreviewStream) {
      for (const t of this.localPreviewStream.getVideoTracks()) {
        this.localPreviewStream.removeTrack(t);
      }
    } else {
      this.localPreviewStream = new MediaStream();
    }
    if (track) this.localPreviewStream.addTrack(track);
    // Notify the UI — passing null is a valid signal: video off.
    this.events.onLocalStream?.(this.localPreviewStream);

    // Replace the track on every peer's video sender. Each peer was
    // initialised with addTransceiver('video') so a sender always
    // exists, even when no video has ever been sent.
    await Promise.all([...this.peers.values()].map(async (peer) => {
      const sender = this.findVideoSender(peer.pc);
      if (sender) {
        try { await sender.replaceTrack(track); } catch (e) {
          console.warn("replaceTrack failed:", e);
        }
      }
    }));
  }

  private findVideoSender(pc: RTCPeerConnection): RTCRtpSender | null {
    // Prefer a sender bound to a video transceiver. A sender's track
    // can be null if we haven't sent video yet, so check both .track
    // kind and the transceiver kind for a reliable match.
    for (const tx of pc.getTransceivers()) {
      if (tx.sender.track?.kind === "video") return tx.sender;
    }
    for (const tx of pc.getTransceivers()) {
      // Transceivers don't expose .kind directly — derive from receiver
      // (the receiver is created when addTransceiver decides the m-line)
      if (tx.receiver.track.kind === "video") return tx.sender;
    }
    return null;
  }

  // ── Internals ──────────────────────────────────────────────────

  private cleanupMedia(): void {
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) t.stop();
      this.localStream = null;
    }
    this.cameraTrack?.stop();
    this.cameraTrack = null;
    if (this.screenStream) {
      for (const t of this.screenStream.getTracks()) t.stop();
      this.screenStream = null;
    }
    this.outgoingVideoTrack = null;
    this.localPreviewStream = null;
    this.events.onLocalStream?.(null);
  }

  private async heartbeat(): Promise<void> {
    if (!this.participantRowId) return;
    await supabase
      .from("voice_session_participants")
      .update({ last_heartbeat: new Date().toISOString() })
      .eq("id", this.participantRowId);
  }

  private async updatePresenceFlags(flags: Partial<{
    is_muted: boolean; has_video: boolean; is_screen_sharing: boolean; is_speaking: boolean;
  }>): Promise<void> {
    if (!this.participantRowId) return;
    await supabase
      .from("voice_session_participants")
      .update(flags)
      .eq("id", this.participantRowId);
  }

  private async fetchParticipants(): Promise<ParticipantRow[]> {
    const { data } = await supabase
      .from("voice_session_participants")
      .select("*")
      .eq("channel_id", this.channelId);
    return (data ?? []) as ParticipantRow[];
  }

  private async sweepStaleRows(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    await supabase
      .from("voice_session_participants")
      .delete()
      .eq("channel_id", this.channelId)
      .lt("last_heartbeat", cutoff);
  }

  // ── Signaling ──────────────────────────────────────────────────

  private async subscribeSignaling(): Promise<void> {
    const topic = `voice:${this.channelId}`;
    this.signalChannel = supabase.channel(topic, {
      config: { broadcast: { self: false } },
    });
    this.signalChannel.on("broadcast", { event: "signal" }, (payload) => {
      const env = payload.payload as SignalEnvelope;
      if (env.to !== this.peerId) return;
      void this.handleSignal(env);
    });
    await new Promise<void>((resolve) => {
      this.signalChannel!.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
    });
  }

  private sendSignal(env: SignalEnvelope): void {
    if (!this.signalChannel) return;
    void this.signalChannel.send({
      type: "broadcast",
      event: "signal",
      payload: env,
    });
  }

  private async handleSignal(env: SignalEnvelope): Promise<void> {
    switch (env.kind) {
      case "hello": {
        // Newcomer wants us to send them an offer. We're impolite
        // (established peer): we're allowed to start the negotiation.
        const peer = this.ensurePeer(env.from, /* chatterId — fill later from presence */ "");
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        this.sendSignal({
          kind: "offer", from: this.peerId, to: env.from, sdp: peer.pc.localDescription!,
        });
        return;
      }
      case "offer": {
        const peer = this.ensurePeer(env.from, "");
        const offerCollision =
          peer.makingOffer || peer.pc.signalingState !== "stable";
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        if (offerCollision) {
          await Promise.all([
            peer.pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit),
            peer.pc.setRemoteDescription(env.sdp),
          ]);
        } else {
          await peer.pc.setRemoteDescription(env.sdp);
        }
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.sendSignal({
          kind: "answer", from: this.peerId, to: env.from, sdp: peer.pc.localDescription!,
        });
        return;
      }
      case "answer": {
        const peer = this.peers.get(env.from);
        if (!peer) return;
        try {
          await peer.pc.setRemoteDescription(env.sdp);
        } catch (e) {
          console.warn("setRemoteDescription(answer) failed:", e);
        }
        return;
      }
      case "ice": {
        const peer = this.peers.get(env.from);
        if (!peer) return;
        try {
          await peer.pc.addIceCandidate(env.candidate);
        } catch (e) {
          if (!peer.ignoreOffer) {
            console.warn("addIceCandidate failed:", e);
          }
        }
        return;
      }
    }
  }

  // ── Peer connection lifecycle ──────────────────────────────────

  private ensurePeer(
    remotePeerId: string,
    remoteChatterId: string,
  ): { pc: RTCPeerConnection; polite: boolean; makingOffer: boolean; ignoreOffer: boolean } & { stream: MediaStream | null } & {
    chatterId: string; isMuted: boolean; hasVideo: boolean; isScreenSharing: boolean; isSpeaking: boolean;
  } {
    const existing = this.peers.get(remotePeerId);
    if (existing) {
      // Backfill chatterId if we now know it
      if (remoteChatterId && !existing.chatterId) existing.chatterId = remoteChatterId;
      return existing;
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    // Add audio (always sent once mic is granted).
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }
    // Pre-allocate a video transceiver in sendrecv mode. This carves
    // out an m-line for video right away so future replaceTrack()
    // calls (toggleCamera / toggleScreenShare) don't trigger SDP
    // renegotiation. If we already have an outgoing video track,
    // attach it now so newcomers see our screen / camera immediately.
    const videoTx = pc.addTransceiver("video", { direction: "sendrecv" });
    if (this.outgoingVideoTrack) {
      void videoTx.sender.replaceTrack(this.outgoingVideoTrack);
    }
    // "Polite" peer is the one with the lexicographically-smaller id.
    const polite = this.peerId < remotePeerId;
    const peer = {
      pc,
      chatterId: remoteChatterId,
      stream: null as MediaStream | null,
      isMuted: false,
      hasVideo: false,
      isScreenSharing: false,
      isSpeaking: false,
      polite,
      makingOffer: false,
      ignoreOffer: false,
    };
    this.peers.set(remotePeerId, peer);

    // Wire up events
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      peer.stream = stream;
      this.emitParticipants();
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendSignal({
          kind: "ice", from: this.peerId, to: remotePeerId, candidate: ev.candidate.toJSON(),
        });
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.sendSignal({
          kind: "offer", from: this.peerId, to: remotePeerId, sdp: pc.localDescription!,
        });
      } catch (e) {
        console.warn("negotiationneeded:", e);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected"
      ) {
        // Don't immediately drop on "disconnected" — it can recover.
        // Just emit so UI can show a stale-ring state.
        this.emitParticipants();
      }
    };
    return peer;
  }

  // ── Presence (participant list) ───────────────────────────────

  private async subscribePresence(): Promise<void> {
    this.presenceChannel = supabase
      .channel(`voice-presence:${this.channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "voice_session_participants",
          filter: `channel_id=eq.${this.channelId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as ParticipantRow;
            if (row.peer_id !== this.peerId) {
              this.ensurePeer(row.peer_id, row.chatter_id);
              const peer = this.peers.get(row.peer_id);
              if (peer) {
                peer.isMuted = row.is_muted;
                peer.hasVideo = row.has_video;
                peer.isScreenSharing = row.is_screen_sharing;
                peer.isSpeaking = row.is_speaking;
              }
            }
            this.emitParticipants();
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as ParticipantRow;
            const peer = this.peers.get(row.peer_id);
            if (peer) {
              try { peer.pc.close(); } catch { /* ignore */ }
              this.peers.delete(row.peer_id);
            }
            this.emitParticipants();
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as ParticipantRow;
            const peer = this.peers.get(row.peer_id);
            if (peer) {
              peer.isMuted = row.is_muted;
              peer.hasVideo = row.has_video;
              peer.isScreenSharing = row.is_screen_sharing;
              peer.isSpeaking = row.is_speaking;
              this.emitParticipants();
            }
          }
        },
      );
    await new Promise<void>((resolve) => {
      this.presenceChannel!.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
    });
  }

  private emitParticipants(): void {
    const list: RemoteParticipant[] = [];
    for (const [peerId, p] of this.peers) {
      list.push({
        peerId,
        chatterId: p.chatterId,
        isMuted: p.isMuted,
        hasVideo: p.hasVideo,
        isScreenSharing: p.isScreenSharing,
        isSpeaking: p.isSpeaking,
        stream: p.stream,
      });
    }
    this.events.onParticipantsChanged?.(list);
  }
}

// ── Helper: "is anyone in the call right now?" ─────────────────────
//
// Used by the channel sidebar to render the "🔊 N in voice" pill.
// We can subscribe to the table once at the chat-page level and let
// each row of the sidebar derive its count.

export async function listVoiceParticipants(
  channelIds: string[],
): Promise<Record<string, ParticipantRow[]>> {
  if (channelIds.length === 0) return {};
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data } = await supabase
    .from("voice_session_participants")
    .select("*")
    .in("channel_id", channelIds)
    .gte("last_heartbeat", cutoff);
  const out: Record<string, ParticipantRow[]> = {};
  for (const row of (data ?? []) as ParticipantRow[]) {
    (out[row.channel_id] ??= []).push(row);
  }
  return out;
}
