import { useEffect, useState } from "react";

/**
 * Installing ICEFALL, and knowing whether it already is.
 *
 * ICEFALL is a PWA. There is no App Store listing and no Play listing, so a
 * "Download on the App Store" button would be a link to nothing. What exists is
 * the browser's own install flow:
 *
 *   · Chrome / Edge / Android fire `beforeinstallprompt`, which can be saved
 *     and replayed from a button. That is a real one-tap install.
 *   · iOS Safari has no such event — installing is Share ▸ Add to Home Screen,
 *     which only the person can do. There the button becomes instructions.
 *
 * The hook reports which of those applies so a screen can offer the right one
 * instead of a button that silently does nothing on half of all phones.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallMode =
  /** Running as an installed app already. */
  | "installed"
  /** A one-tap install is available. */
  | "prompt"
  /** iOS: possible, but only by hand. */
  | "manual-ios"
  /** A desktop browser, or one that cannot install. */
  | "unsupported";

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  // iOS Safari's own flag, which predates the standard media query.
  (navigator as unknown as { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS 13+ reports itself as a Mac; the touch points give it away.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function useInstall() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Chrome shows its own mini-infobar unless this is prevented; keeping the
      // event lets the install happen from a button that says what it does.
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const mode: InstallMode = installed
    ? "installed"
    : deferred
      ? "prompt"
      : isIos()
        ? "manual-ios"
        : "unsupported";

  async function install(): Promise<boolean> {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === "accepted";
  }

  return { mode, install };
}

export const IOS_INSTALL_STEPS =
  "In Safari, tap the Share button, then Add to Home Screen. ICEFALL then opens like any other app and works without a signal.";
