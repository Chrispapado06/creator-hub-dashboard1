import { useEffect, useState } from "react";
import { Smartphone, X, Download } from "lucide-react";
import { hasInstallPrompt, triggerInstallPrompt, PWA_EVENTS } from "@/lib/pwa";

const DISMISSED_KEY = "agency_pwa_dismissed_at";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // re-show after 7 days

/**
 * Subtle bottom banner that nudges the user to install the PWA. Only shows when:
 *   - The browser has fired `beforeinstallprompt` (so installation is actually possible)
 *   - The user hasn't dismissed it within the last 7 days
 *   - The app isn't already running in standalone mode
 *
 * iOS Safari does NOT fire `beforeinstallprompt`, so we show a one-line hint
 * to install via the share sheet on iPhone instead.
 */
export function InstallPromptBanner() {
  const [available, setAvailable] = useState(hasInstallPrompt());
  const [dismissed, setDismissed] = useState(() => {
    const ts = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(ts) && Date.now() - ts < COOLDOWN_MS;
  });
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const onAvail = () => setAvailable(true);
    const onConsumed = () => setAvailable(false);
    window.addEventListener(PWA_EVENTS.available, onAvail);
    window.addEventListener(PWA_EVENTS.consumed, onConsumed);
    return () => {
      window.removeEventListener(PWA_EVENTS.available, onAvail);
      window.removeEventListener(PWA_EVENTS.consumed, onConsumed);
    };
  }, []);

  useEffect(() => {
    // iOS detection: show a hint on iPhone Safari since they can't auto-prompt
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream;
    const isStandalone = (window.matchMedia?.("(display-mode: standalone)").matches) || (navigator as { standalone?: boolean }).standalone === true;
    if (isIOS && !isStandalone && !dismissed) setIosHint(true);
  }, [dismissed]);

  if (dismissed) return null;
  if (!available && !iosHint) return null;

  const onInstall = async () => {
    const outcome = await triggerInstallPrompt();
    if (outcome === "accepted") {
      setAvailable(false);
    } else if (outcome === "dismissed") {
      onDismiss();
    }
  };

  const onDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:left-auto z-50 max-w-sm">
      <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-lg p-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Install Agency Console</div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
            {iosHint
              ? "Tap the Share button in Safari, then 'Add to Home Screen' to use this app from your phone."
              : "Add to your phone or desktop for one-tap access."}
          </p>
          {!iosHint && (
            <button
              onClick={onInstall}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Download className="h-3 w-3" /> Install
            </button>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground p-1 -m-1 shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
