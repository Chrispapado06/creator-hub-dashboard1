import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityType, RecorderSnapshot } from "@/tracking/types";
import { initialCueState, nextCue, type Cue, type CueState } from "./liveCues";
import type { SessionIntent } from "./sessionIntent";

/**
 * Speaks the coach's cues, and keeps a record of everything it said.
 *
 * The voice is `speechSynthesis` — part of the browser, running on the device.
 * Measured on this machine: 190 voices, every one of them `localService: true`,
 * 47 of them English. No key, no request, no cost, and it works with the radio
 * off, which is the only reason it is fit for a mountain.
 *
 * ⚠️ MUSIC DUCKING IS NOT POSSIBLE HERE. Turning Spotify down while the coach
 * speaks needs an audio session category — `AVAudioSession` with `.duckOthers`
 * on iOS — and a web page cannot reach it. On Android the platform's audio focus
 * sometimes ducks for speech; on iOS the cue plays over the music at full
 * volume. That is the same native wall the lock-screen widget is behind, and it
 * is stated here so nobody ships a "ducking" toggle that does nothing.
 */

export interface SpokenCue extends Cue {
  /** Session clock when it was said, in ms of moving time. */
  atMs: number;
}

export function useLiveCoach({
  snapshot,
  intent,
  activity,
  enabled,
}: {
  snapshot: RecorderSnapshot;
  intent: SessionIntent | null;
  activity: ActivityType;
  enabled: boolean;
}) {
  const [transcript, setTranscript] = useState<SpokenCue[]>([]);
  const state = useRef<CueState>(initialCueState());
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const say = useCallback(
    (text: string) => {
      if (!supported) return;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.0;
      // Never queue behind a stale cue: what mattered ten seconds ago on a climb
      // does not matter now, and hearing two corrections at once is worse than
      // hearing neither.
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  useEffect(() => {
    if (!enabled || snapshot.status !== "recording") return;
    const { cue, state: updated } = nextCue(snapshot, intent, activity, state.current);
    state.current = updated;
    if (!cue) return;
    say(cue.say);
    setTranscript((t) => [...t, { ...cue, atMs: snapshot.movingMs }]);
  }, [snapshot, intent, activity, enabled, say]);

  // Silence immediately when switched off or unmounted — a coach that keeps
  // talking after you turned it off is the worst possible bug in this feature.
  useEffect(() => {
    if (!enabled && supported) window.speechSynthesis.cancel();
  }, [enabled, supported]);

  useEffect(
    () => () => {
      if (supported) window.speechSynthesis.cancel();
    },
    [supported],
  );

  const reset = useCallback(() => {
    state.current = initialCueState();
    setTranscript([]);
  }, []);

  return { transcript, supported, reset, say };
}
