// Vault picker dialog.
//
// Pulls media out of the creator's OF vault so the agency can attach
// real photos / videos to chat messages and mass DMs the same way the
// creator would on onlyfans.com → Vault.
//
// Two views:
//   • All media — flat scrollable grid, optional photo/video filter
//   • Albums — vault lists from /vault/lists; click an album to filter
//
// Selection model: array of OF media ids (numeric). Caller owns the
// state, this component is controlled. We cap selection at 10 to match
// OF's per-message media limit.
//
// Implementation notes:
//   • The picker is mounted only when `open` is true (see parent),
//     keeping the tree fresh and avoiding stale Radix portal state.
//   • We use a plain segmented switcher instead of Radix Tabs to avoid
//     the "Tabs inside Dialog" combo that can choke on React 19's
//     stricter hook ordering in production builds.
//   • Plain overflow-y-auto instead of Radix ScrollArea for the same
//     reason — fewer nested portals, fewer surprises.

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Image as ImageIcon, Video as VideoIcon, RefreshCw, Check,
  FolderOpen, Library, AlertCircle, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  listVaultMedia, listVaultLists, OfApiError,
  type OfVaultMedia, type OfVaultList,
} from "@/lib/of-api";

const MAX_SELECTION = 10;

type View = "all" | "albums";

export function OnlyFansVaultPicker({
  accountId,
  open,
  onOpenChange,
  selectedMediaIds,
  onConfirm,
}: {
  accountId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedMediaIds: number[];
  onConfirm: (ids: number[], previews: Record<number, string>) => void;
}) {
  // Mount-gate: only render the dialog body when actually open. Keeps
  // the tree small and avoids stale Radix portal state when re-opened.
  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <PickerBody
        accountId={accountId}
        selectedMediaIds={selectedMediaIds}
        onClose={() => onOpenChange(false)}
        onConfirm={onConfirm}
      />
    </Dialog>
  );
}

function PickerBody({
  accountId, selectedMediaIds, onClose, onConfirm,
}: {
  accountId: string;
  selectedMediaIds: number[];
  onClose: () => void;
  onConfirm: (ids: number[], previews: Record<number, string>) => void;
}) {
  // Working copy so the user can cancel without losing their old selection.
  const [draft, setDraft] = useState<number[]>(selectedMediaIds);
  // Keep thumbs around so the parent can render chips without re-fetching.
  const [previews, setPreviews] = useState<Record<number, string>>({});

  const [view, setView] = useState<View>("all");
  const [media, setMedia] = useState<OfVaultMedia[]>([]);
  const [vaultLists, setVaultLists] = useState<OfVaultList[]>([]);
  const [typeFilter, setTypeFilter] = useState<"all" | "photo" | "video">("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load albums once
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ls = await listVaultLists(accountId);
        if (!cancelled) setVaultLists(ls);
      } catch {
        // Albums are optional; ignore failures so the main grid still shows.
      }
    })();
    return () => { cancelled = true; };
  }, [accountId]);

  // Load media — reloads when the type filter changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMedia([]);
    setHasMore(true);
    void (async () => {
      try {
        const items = await listVaultMedia(accountId, {
          type: typeFilter === "all" ? undefined : typeFilter,
          limit: 50,
          maxPages: 1,
        });
        if (cancelled) return;
        setMedia(items);
        setHasMore(items.length >= 50);
        // Cache thumbs for the chips outside the dialog.
        const next: Record<number, string> = {};
        for (const m of items) next[m.id] = m.thumb ?? m.preview ?? m.src ?? "";
        setPreviews((p) => ({ ...p, ...next }));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof OfApiError ? e.message : "Couldn't load vault");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId, typeFilter]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const items = await listVaultMedia(accountId, {
        type: typeFilter === "all" ? undefined : typeFilter,
        limit: 50,
        offset: media.length,
        maxPages: 1,
      });
      setMedia((prev) => [...prev, ...items]);
      setHasMore(items.length >= 50);
      const next: Record<number, string> = {};
      for (const m of items) next[m.id] = m.thumb ?? m.preview ?? m.src ?? "";
      setPreviews((p) => ({ ...p, ...next }));
    } catch (e) {
      toast.error(e instanceof OfApiError ? e.message : "Couldn't load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleMedia = (m: OfVaultMedia) => {
    setDraft((prev) => {
      if (prev.includes(m.id)) return prev.filter((id) => id !== m.id);
      if (prev.length >= MAX_SELECTION) {
        toast.error(`Max ${MAX_SELECTION} files per message (OF limit)`);
        return prev;
      }
      return [...prev, m.id];
    });
  };

  const onDone = () => {
    onConfirm(draft, previews);
    onClose();
  };

  return (
    <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
      <DialogHeader className="p-5 pb-3 border-b border-border">
        <DialogTitle className="flex items-center gap-2">
          <Library className="h-4 w-4 text-primary" /> Pick from vault
        </DialogTitle>
        <DialogDescription>
          Attach real OnlyFans media — locked PPV photos / videos go out exactly as the creator uploaded them.
        </DialogDescription>
      </DialogHeader>

      {/* Toolbar */}
      <div className="px-5 pt-3 flex items-center justify-between gap-2 flex-wrap">
        {/* View switcher (plain — no Radix Tabs) */}
        <div className="inline-flex items-center rounded-md border border-border bg-secondary/30 p-0.5 text-xs">
          <ViewBtn active={view === "all"} onClick={() => setView("all")} icon={<ImageIcon className="h-3.5 w-3.5" />}>All</ViewBtn>
          <ViewBtn active={view === "albums"} onClick={() => setView("albums")} icon={<FolderOpen className="h-3.5 w-3.5" />}>
            Albums {vaultLists.length > 0 && (
              <span className="ml-1 px-1 rounded text-[9px] bg-primary/20 text-primary">{vaultLists.length}</span>
            )}
          </ViewBtn>
        </div>

        {/* Type filter pills (only meaningful in 'all' view) */}
        {view === "all" && (
          <div className="flex items-center gap-1 text-xs">
            {(["all", "photo", "video"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-2 py-1 rounded-md border transition-colors ${
                  typeFilter === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border bg-secondary/40 hover:bg-secondary/70"
                }`}
              >
                {t === "all" ? "All" : t === "photo" ? "Photos" : "Videos"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 mt-3">
        {view === "all" ? (
          <MediaGrid
            media={media}
            draft={draft}
            loading={loading}
            error={error}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onToggle={toggleMedia}
            onLoadMore={loadMore}
          />
        ) : (
          <AlbumsGrid
            albums={vaultLists}
            onPick={() => {
              // Future: filter media by album. For now, jump back to All.
              setView("all");
              toast.info("Album filtering coming soon — showing all media");
            }}
          />
        )}
      </div>

      <DialogFooter className="p-4 border-t border-border flex-row items-center justify-between gap-2 sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {draft.length === 0
            ? "Nothing selected yet"
            : `${draft.length}/${MAX_SELECTION} selected`}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={onDone} disabled={draft.length === 0}>
            <Check className="h-3.5 w-3.5 mr-1.5" /> Attach {draft.length || ""}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

function ViewBtn({
  active, onClick, icon, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function MediaGrid({
  media, draft, loading, error, hasMore, loadingMore, onToggle, onLoadMore,
}: {
  media: OfVaultMedia[];
  draft: number[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onToggle: (m: OfVaultMedia) => void;
  onLoadMore: () => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pb-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-md bg-card/60 animate-pulse" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-xs text-rose-400 italic py-12 text-center border border-dashed border-rose-500/30 rounded-lg flex flex-col items-center gap-2">
        <AlertCircle className="h-5 w-5" /> {error}
      </div>
    );
  }
  if (media.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-12 text-center border border-dashed border-border rounded-lg">
        Vault is empty. Upload media on OnlyFans first.
      </div>
    );
  }
  return (
    <div className="space-y-3 pb-4">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {media.map((m) => {
          const checked = draft.includes(m.id);
          const thumb = m.thumb ?? m.preview ?? m.src ?? "";
          return (
            <button
              key={m.id}
              onClick={() => onToggle(m)}
              className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all ${
                checked ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
              }`}
            >
              {thumb ? (
                <img src={thumb} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center bg-secondary/40">
                  {m.type === "video" ? <VideoIcon className="h-5 w-5 text-muted-foreground" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                </span>
              )}
              <span className="absolute bottom-1 left-1 text-[9px] px-1 rounded bg-black/60 text-white inline-flex items-center gap-0.5">
                {m.type === "video" ? <VideoIcon className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                {m.type}
              </span>
              {checked && (
                <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full"
        >
          {loadingMore ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
          Load more
        </Button>
      )}
    </div>
  );
}

function AlbumsGrid({
  albums, onPick,
}: {
  albums: OfVaultList[];
  onPick: (album: OfVaultList) => void;
}) {
  if (albums.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-12 text-center border border-dashed border-border rounded-lg">
        No albums on this account. Create them on OnlyFans first.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4">
      {albums.map((al) => (
        <button
          key={al.id}
          onClick={() => onPick(al)}
          className="rounded-lg border border-border bg-secondary/30 hover:bg-secondary/60 p-4 text-left"
        >
          <FolderOpen className="h-5 w-5 text-primary mb-2" />
          <div className="text-sm font-medium truncate">{al.name}</div>
          {al.mediaCount !== undefined && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {al.mediaCount} item{al.mediaCount === 1 ? "" : "s"}
            </div>
          )}
          <div className="text-[10px] text-primary mt-1.5 flex items-center gap-0.5">
            <ArrowLeft className="h-2.5 w-2.5 rotate-180" /> Open
          </div>
        </button>
      ))}
    </div>
  );
}
