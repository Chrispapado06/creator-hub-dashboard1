/**
 * The single v1 workspace id (seeded by the auth/RBAC migration). The data model
 * is multi-workspace-ready, but v1 runs one shared workspace.
 */
export const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

/** Custom URL scheme used for auth deep links into the desktop app. */
export const DEEP_LINK_SCHEME = "ofm";

/** Public download for the macOS desktop app (Apple Silicon), hosted on Supabase Storage. */
export const DOWNLOAD_MAC_URL =
  "https://jzlrwlqytyqhlpuyblld.supabase.co/storage/v1/object/public/downloads/OFM-Workspace-0.1.0-aarch64.dmg";
