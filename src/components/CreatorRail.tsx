// Sticky left rail for the creator detail page.
//
// Shows every creator as a clickable row with their avatar, name, and
// status pill — clicking switches the detail view to that creator
// without leaving the page. Mirrors the Golfy "Clients" pattern: a list
// panel on the left, the active client's detail on the right.
//
// Avatar priority matches the Creators tab + OnlyFans page:
//   1. Manual upload (creators.avatar_url)
//   2. OnlyFans-synced (of_creator_stats.avatar_url)
//   3. Initial chip
//
// Mobile: collapses to a "Switch creator" button that opens the list as
// a fullscreen drawer. Desktop (lg+): always-visible 280px rail.

import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronLeft, X as XIcon, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type RailCreator = {
  id: string;
  name: string;
  status: "active" | "paused" | "inactive" | string;
  avatar_url: string | null;
  of_avatar_url: string | null;
  of_username: string | null;
};

const statusTone: Record<string, { bg: string; fg: string; label: string }> = {
  active:   { bg: "bg-emerald-500/12", fg: "text-emerald-700 dark:text-emerald-400", label: "Active" },
  paused:   { bg: "bg-amber-500/15",   fg: "text-amber-700 dark:text-amber-400",     label: "Paused" },
  inactive: { bg: "bg-muted",          fg: "text-muted-foreground",                  label: "Inactive" },
};

export function CreatorRail({ activeId }: { activeId: string }) {
  const [creators, setCreators] = useState<RailCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeRowRef = useRef<HTMLAnchorElement | null>(null);

  // Load every creator + their OF synced avatar in one shot. Cached
  // inside the component instance — re-fetched only when the rail
  // mounts, which happens once per creator-detail page navigation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: cs }, { data: ofStats }] = await Promise.all([
        supabase
          .from("creators")
          .select("id, name, status, avatar_url, of_username")
          .order("status", { ascending: true })   // active first
          .order("name", { ascending: true }),
        supabase
          .from("of_creator_stats")
          .select("creator_id, avatar_url"),
      ]);
      if (cancelled) return;
      const ofAvatar = new Map<string, string>();
      for (const r of (ofStats ?? []) as Array<{ creator_id: string; avatar_url: string | null }>) {
        if (r.avatar_url) ofAvatar.set(r.creator_id, r.avatar_url);
      }
      const rows: RailCreator[] = (cs ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        status: (c.status as string) ?? "active",
        avatar_url: (c.avatar_url as string | null) ?? null,
        of_avatar_url: ofAvatar.get(c.id as string) ?? null,
        of_username: (c.of_username as string | null) ?? null,
      }));
      // Sort: active → paused → inactive, alpha within each.
      const order: Record<string, number> = { active: 0, paused: 1, inactive: 2 };
      rows.sort((a, b) => {
        const sa = order[a.status] ?? 99;
        const sb = order[b.status] ?? 99;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
      });
      setCreators(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Scroll the active row into view when it changes (e.g. user clicks
  // a different creator and the rail re-highlights the new one).
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId, creators.length]);

  // Close the mobile drawer whenever the active creator changes — it
  // means the user just picked one, no need to keep the drawer open.
  useEffect(() => {
    setDrawerOpen(false);
  }, [activeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.of_username ?? "").toLowerCase().includes(q),
    );
  }, [creators, search]);

  return (
    <>
      {/* Mobile: floating "Switch creator" button. Hidden on lg+ where the
          rail is permanently visible. */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="lg:hidden inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <Users className="h-3.5 w-3.5" />
        Switch creator
      </button>

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        />
      )}

      {/* Rail content. Permanent on lg+, slides in from the left on
          mobile. On lg+ the rail is flush against the admin sidebar
          (no left border / no gap) and runs the full screen height,
          so it reads as a continuation of the main nav — Golfy "Clients"
          pattern. */}
      <aside
        className={`flex flex-col bg-card shrink-0 transition-transform
          lg:sticky lg:top-0 lg:self-stretch lg:h-screen lg:w-72 lg:border-r lg:border-border lg:translate-x-0
          fixed inset-y-0 left-0 z-50 w-80 border-r border-border lg:relative lg:inset-auto
          ${drawerOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Header — title + close on mobile */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-primary/12 text-primary flex items-center justify-center">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-bold">Creators</div>
              <div className="text-[10px] text-muted-foreground">
                {creators.length} total · click to switch
              </div>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="lg:hidden h-7 w-7 rounded-md flex items-center justify-center hover:bg-secondary"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search creators…"
              className="w-full h-9 pl-8 pr-3 text-xs rounded-full border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Back link to /creators */}
        <Link
          to="/"
          className="flex items-center gap-1.5 px-4 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary/40 border-b border-border transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All creators
        </Link>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {loading ? (
            <div className="space-y-1.5 p-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              No matches.
            </div>
          ) : (
            filtered.map((c) => {
              const isActive = c.id === activeId;
              const tone = statusTone[c.status] ?? statusTone.inactive;
              const photo = c.avatar_url ?? c.of_avatar_url;
              return (
                <Link
                  key={c.id}
                  to="/creators/$creatorId"
                  params={{ creatorId: c.id }}
                  ref={isActive ? activeRowRef : undefined}
                  className={`flex items-center gap-3 rounded-xl p-2.5 transition-all duration-150 ease-out ${
                    isActive
                      ? "bg-primary/10 border border-primary/40 shadow-sm"
                      : "border border-transparent hover:bg-secondary/40 hover:border-border"
                  }`}
                >
                  {/* Avatar */}
                  {photo ? (
                    <div className="relative shrink-0">
                      <img
                        src={photo}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover border border-border"
                      />
                      {!c.avatar_url && c.of_avatar_url && (
                        <span
                          title="Synced from OnlyFans"
                          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card"
                          style={{ backgroundColor: "#00AFF0" }}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground flex items-center justify-center font-semibold text-sm">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Name + status pill */}
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-semibold truncate ${isActive ? "text-foreground" : ""}`}>
                      {c.name}
                    </div>
                    <span className={`inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${tone.bg} ${tone.fg}`}>
                      {tone.label}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
