import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { establishSessionFromUrl } from "./session-from-url";

/**
 * Desktop only: listens for auth deep links (ofm://auth/callback#...) opened
 * from the invite email, establishes the session, then routes to the
 * set-password screen. No-ops in the browser dev preview.
 */
export function useDeepLinkAuth() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
        const handler = await onOpenUrl(async (urls) => {
          const url = urls[0];
          if (!url) return;
          const established = await establishSessionFromUrl(url);
          if (established) navigate("/auth/callback", { replace: true });
        });
        if (cancelled) handler();
        else unlisten = handler;
      } catch (e) {
        console.error("Deep-link auth init failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [navigate]);
}
