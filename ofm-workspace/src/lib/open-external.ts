import { isTauri } from "@tauri-apps/api/core";

/** Open an external URL in the OS browser (Tauri), or a new tab in the browser. */
export async function openExternal(url: string) {
  if (isTauri()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch {
      /* fall back to window.open */
    }
  }
  window.open(url, "_blank", "noopener");
}
