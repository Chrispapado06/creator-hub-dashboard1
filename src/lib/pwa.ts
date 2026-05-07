/**
 * PWA bootstrap helpers — service worker registration + install prompt capture.
 *
 * The SW is only registered in production. In dev (Vite HMR) we skip it,
 * because aggressive caching breaks fast-refresh in confusing ways.
 */

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: InstallPromptEvent | null = null;

const PROMPT_AVAILABLE_EVENT = "pwa-install-available";
const PROMPT_CONSUMED_EVENT = "pwa-install-consumed";

export function registerPwa() {
  if (typeof window === "undefined") return;

  // Capture the browser's "you can install this" event so a UI elsewhere can
  // trigger the prompt at a useful moment (e.g. on the staff portal after they
  // log in).
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
    window.dispatchEvent(new CustomEvent(PROMPT_AVAILABLE_EVENT));
  });

  // Fired when the user installs (either from our prompt or the browser's UI).
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent(PROMPT_CONSUMED_EVENT));
  });

  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("[pwa] sw register failed:", err));
  });
}

export function hasInstallPrompt(): boolean {
  return deferredPrompt !== null;
}

export async function triggerInstallPrompt(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  window.dispatchEvent(new CustomEvent(PROMPT_CONSUMED_EVENT));
  return choice.outcome;
}

export const PWA_EVENTS = {
  available: PROMPT_AVAILABLE_EVENT,
  consumed: PROMPT_CONSUMED_EVENT,
} as const;
