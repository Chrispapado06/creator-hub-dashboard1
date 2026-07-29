/**
 * The single v1 workspace id (seeded by the auth/RBAC migration). The data model
 * is multi-workspace-ready, but v1 runs one shared workspace.
 */
export const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";

/** Custom URL scheme used for auth deep links into the desktop app. */
export const DEEP_LINK_SCHEME = "ofm";
