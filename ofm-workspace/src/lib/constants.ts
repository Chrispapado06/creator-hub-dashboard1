/**
 * The single v1 workspace id (seeded by the auth/RBAC migration). The data model
 * is multi-workspace-ready, but v1 runs one shared workspace.
 */
export const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

/** Custom URL scheme used for auth deep links into the desktop app. */
export const DEEP_LINK_SCHEME = "ofm";

/** Public download for the macOS desktop app (universal — Intel + Apple Silicon). */
export const DOWNLOAD_MAC_URL =
  "https://jzlrwlqytyqhlpuyblld.supabase.co/storage/v1/object/public/downloads/OFM-Workspace-0.1.0-universal.dmg";

/** Public download for the Windows desktop app (.exe installer), from GitHub Releases. */
export const DOWNLOAD_WIN_URL =
  "https://github.com/Chrispapado06/creator-hub-dashboard1/releases/download/ofm-v0.1.0/OFM.Workspace_0.1.0_x64-setup.exe";
