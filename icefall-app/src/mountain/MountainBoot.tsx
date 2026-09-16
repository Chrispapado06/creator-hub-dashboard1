/**
 * THE BOOT SCREEN (mockup spec §1).
 *
 * What a cold start meets when `boot.ts` has decided this launch belongs in
 * Mountain mode. The full app's `Splash` is a photograph and a wordmark; this
 * one has a job to do, so it says which mode is opening and gives a way out.
 *
 * ONE HERO, then quiet things under it, exactly as §0 asks: the lockup, the
 * state in very large type, a grey line saying what is happening, a thin azure
 * bar, and the escape link at the very bottom. No header and no tab bar — the
 * shell has not mounted yet and this screen is deliberately outside it.
 *
 * HONESTY, TWO PLACES
 * -------------------
 * 1. The hero is not the literal "No signal" of the mockup. It is read from
 *    the live connectivity state, because this screen also opens when a trip
 *    is running today and the phone still has bars — and telling somebody with
 *    a signal that they have none would be the first lie the app tells them.
 * 2. The bar is not "roughly 1/3 filled". It is the real elapsed share of the
 *    hold below, so a moving bar always means time actually passing. It is
 *    stepped from a timer with no CSS transition or animation on it, which is
 *    why `prefers-reduced-motion` has nothing here to suppress.
 *
 * THE ESCAPE LINK is `canOpenFullApp`'s decision, not this screen's. With no
 * signal the full app's login check can hang with no time limit (plan §2.9),
 * so offline the slot keeps its place and carries the same honest wording the
 * shell menu and the Trip tab already use, rather than offering a tap that
 * strands somebody on a blank screen.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { IcefallLockup } from "@/components/ui/IcefallMark";
import { cn } from "@/lib/utils";
import { useMountainDocument } from "@/settings/useMountainSettings";
import { useConnectivity } from "@/trip/connectivity";

import { consumeBootRedirect } from "./boot";
import { canOpenFullApp } from "./MountainShell";
import { leaveMountainMode } from "./mode";

/**
 * How long the screen holds before it opens Mountain mode, in ms. Long enough
 * to read the two lines, short enough that nobody standing in the cold waits
 * on it. The bar below measures this and nothing else.
 */
const HOLD_MS = 900;
/** How often the bar is redrawn. Stepped, never transitioned. */
const STEP_MS = 60;

export default function MountainBoot({ to }: { to: string }) {
  const navigate = useNavigate();
  /* THE MOUNTAIN PALETTE, FROM THE FIRST FRAME. This screen renders before the
     shell mounts, so without this it draws on the FULL APP's theme: on a phone
     set to light that is a cream page with near-black text — the exact inverse
     of the mockup's near-black screen, and a white flash in the eyes of someone
     who just opened the app in the dark. Same hook the shell uses, so the two
     agree on theme, text size and motion and nothing changes at the handover. */
  useMountainDocument();
  const signal = useConnectivity();
  const offline = signal.state === "unreachable";
  const openable = canOpenFullApp(signal);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const ms = Date.now() - started;
      setElapsed(ms);
      if (ms >= HOLD_MS) {
        clearInterval(timer);
        navigate(to, { replace: true });
      }
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [navigate, to]);

  const openFullApp = () => {
    if (!openable) return;
    /* Without this the redirect is still cached for this page load, "/home" is
       a launch path, and the app would bounce straight back to this screen. */
    consumeBootRedirect();
    leaveMountainMode();
    navigate("/home", { replace: true });
  };

  const filled = Math.min(100, Math.round((elapsed / HOLD_MS) * 100));

  return (
    <div className="flex h-full w-full flex-col items-center justify-between bg-obsidian px-6 pb-6 pt-16 text-snow">
      <div aria-hidden className="h-4 shrink-0" />

      <div className="flex flex-col items-center text-center">
        <IcefallLockup size="md" />

        {/* THE HERO. Mixed case, not caps — it is a state, not a label. */}
        <h1 className="m-text-number mt-12 font-light tracking-[-0.02em] text-snow">
          {offline ? "No signal" : "Mountain mode"}
        </h1>
        <p className="mt-3 text-[17px] leading-snug text-mist">Opening Mountain mode</p>

        {/* A thin azure bar. Real elapsed time; no transition, so nothing here
            moves for its own sake. The sentence above is what a screen reader
            is told — a percentage of a 0.9 s hold is noise, not information. */}
        <div
          aria-hidden
          className="mt-10 h-[3px] w-40 overflow-hidden rounded-full bg-hairline-strong"
        >
          <div className="h-full rounded-full bg-azure" style={{ width: `${filled}%` }} />
        </div>
      </div>

      {/* The way out, at the very bottom. Same 64 px target as everything else. */}
      {openable ? (
        <button
          type="button"
          onClick={openFullApp}
          className={cn(
            "flex min-h-16 w-full items-center justify-center px-4 text-center text-[15px] text-snow underline underline-offset-4",
          )}
        >
          Open full app instead
        </button>
      ) : (
        <p className="flex min-h-16 w-full items-center justify-center px-4 text-center text-[15px] leading-snug text-mist-dim">
          Open the full app · needs a signal
        </p>
      )}
    </div>
  );
}
