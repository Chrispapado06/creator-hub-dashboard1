import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";

/**
 * Desktop only: on launch, check GitHub Releases for a newer version and, if
 * found, download + install it and relaunch. No-ops in the browser/dev preview.
 */
export function useAppUpdater() {
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (cancelled || !update) return;
        await update.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } catch (e) {
        console.error("Update check failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
