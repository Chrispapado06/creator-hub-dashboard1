// Single source of truth for the admin sidebar pages.
//
// Used by:
//   • Settings → "Page access" picker when adding/editing an admin user
//   • __root.tsx → filtering SideNavLink entries by the session's
//     allowed_pages array
//
// Slug = the route path without the leading slash (the home page uses
// "creators" rather than an empty string for safety in array membership
// checks). Adding a new admin-facing page? Add it here so the access
// picker can target it.

export type AdminPage = {
  slug: string;        // canonical id stored in access_codes.allowed_pages
  path: string;        // TanStack Router path (with leading slash)
  label: string;       // friendly name in the sidebar + permission picker
  group: AdminPageGroup;
};

export type AdminPageGroup = "Core" | "Operations" | "Platforms" | "AI";

export const ADMIN_PAGES: AdminPage[] = [
  // Core
  { slug: "daily",     path: "/daily",    label: "Daily Dashboard",    group: "Core" },
  { slug: "creators",  path: "/",         label: "Creators",           group: "Core" },
  { slug: "revenue",   path: "/revenue",  label: "Revenue",            group: "Core" },
  { slug: "weekly",    path: "/weekly",   label: "Weekly",             group: "Core" },

  // Operations
  { slug: "chatters",   path: "/chatters",   label: "Staff",              group: "Operations" },
  { slug: "leads",      path: "/leads",      label: "Client Acquisition", group: "Operations" },
  { slug: "automation", path: "/automation", label: "Automation",         group: "Operations" },
  { slug: "financials", path: "/financials", label: "Financials",         group: "Operations" },
  { slug: "audit",      path: "/audit",      label: "Audit Log",          group: "Operations" },

  // Platforms
  { slug: "onlyfans",        path: "/onlyfans",        label: "OnlyFans",  group: "Platforms" },
  { slug: "instagram",       path: "/instagram",       label: "Instagram", group: "Platforms" },
  { slug: "reddit",          path: "/reddit",          label: "Reddit",    group: "Platforms" },
  { slug: "reddit-airtable", path: "/reddit-airtable", label: "Airtable",  group: "Platforms" },
  { slug: "x",               path: "/x",               label: "X",         group: "Platforms" },
  { slug: "tiktok",          path: "/tiktok",          label: "TikTok",    group: "Platforms" },
  { slug: "facebook",        path: "/facebook",        label: "Facebook",  group: "Platforms" },
  { slug: "ads",             path: "/ads",             label: "Ads",       group: "Platforms" },

  // AI
  { slug: "bernard", path: "/bernard", label: "Bernard", group: "AI" },
];

export const ADMIN_PAGE_GROUPS: AdminPageGroup[] = ["Core", "Operations", "Platforms", "AI"];

/** Group the registry for the picker UI. */
export function groupedAdminPages(): Record<AdminPageGroup, AdminPage[]> {
  const out = { Core: [], Operations: [], Platforms: [], AI: [] } as Record<AdminPageGroup, AdminPage[]>;
  for (const p of ADMIN_PAGES) out[p.group].push(p);
  return out;
}

/**
 * Returns the slugs an admin can access. NULL / empty allowedPages =
 * super admin (sees everything). The /settings page is a special case:
 * we never gate it behind allowed_pages so a restricted admin can't
 * accidentally promote themselves — the *settings* page is itself
 * restricted to super admins via a separate UI check.
 */
export function effectiveAllowedSlugs(allowedPages: string[] | null | undefined): Set<string> {
  if (!allowedPages || allowedPages.length === 0) {
    return new Set(ADMIN_PAGES.map((p) => p.slug));
  }
  return new Set(allowedPages);
}

/** Convenience for guards: is this slug visible to this admin? */
export function canAccessPage(slug: string, allowedPages: string[] | null | undefined): boolean {
  return effectiveAllowedSlugs(allowedPages).has(slug);
}

/** True iff the admin has no restrictions (the "main admin" / super admin). */
export function isSuperAdmin(allowedPages: string[] | null | undefined): boolean {
  return !allowedPages || allowedPages.length === 0;
}
