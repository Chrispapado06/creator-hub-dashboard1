import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { FileText, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { buildTree } from "./tree";
import {
  INDENT_WIDTH,
  computePosition,
  flattenTree,
  getProjection,
  removeChildrenOf,
} from "./tree-dnd";
import { SortableTreeItem } from "./SortableTreeItem";
import { PageIcon } from "./PageIcon";
import { useCreatePage, useFavorites, usePages, useUpdatePage, type PageNode } from "./use-pages";

function PageLink({ page }: { page: PageNode }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/page/${page.id}`)}
      className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/50"
    >
      <span className="flex size-5 items-center justify-center">
        <PageIcon icon={page.icon} />
      </span>
      <span className="min-w-0 flex-1 truncate text-left">
        {page.title || "Untitled"}
      </span>
    </button>
  );
}

export function PageTree() {
  const { data: pages = [], isLoading } = usePages();
  const { data: favorites = [] } = useFavorites();
  const create = useCreatePage();
  const update = useUpdatePage();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const flattened = useMemo(
    () => flattenTree(buildTree(pages), expanded),
    [pages, expanded],
  );
  const sortableItems = useMemo(
    () => (activeId ? removeChildrenOf(flattened, [activeId]) : flattened),
    [flattened, activeId],
  );
  const itemIds = useMemo(() => sortableItems.map((i) => i.id), [sortableItems]);
  const projected =
    activeId && overId
      ? getProjection(sortableItems, activeId, overId, offsetLeft, INDENT_WIDTH)
      : null;

  const favPages = useMemo(
    () => pages.filter((p) => favorites.includes(p.id)),
    [pages, favorites],
  );
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return pages
      .filter((p) => (p.title || "untitled").toLowerCase().includes(q))
      .slice(0, 30);
  }, [pages, query]);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const expand = (id: string) => setExpanded((s) => new Set(s).add(id));

  async function newRootPage() {
    try {
      const id = await create.mutateAsync({ parentId: null });
      navigate(`/page/${id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function resetDrag() {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
  }
  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    setOverId(String(active.id));
    // Collapse the dragged node so its subtree travels with it visually.
    setExpanded((s) => {
      const n = new Set(s);
      n.delete(String(active.id));
      return n;
    });
  }
  function onDragMove({ delta }: DragMoveEvent) {
    setOffsetLeft(delta.x);
  }
  function onDragOver({ over }: DragOverEvent) {
    setOverId(over ? String(over.id) : null);
  }
  async function onDragEnd({ active, over }: DragEndEvent) {
    const activeKey = String(active.id);
    const overKey = over ? String(over.id) : null;
    const currentItems = removeChildrenOf(flattened, [activeKey]);
    resetDrag();
    if (!overKey) return;

    const proj = getProjection(
      currentItems,
      activeKey,
      overKey,
      offsetLeft,
      INDENT_WIDTH,
    );
    const newPosition = computePosition(
      currentItems,
      activeKey,
      overKey,
      proj.parentId,
    );
    const current = pages.find((p) => p.id === activeKey);
    if (
      current &&
      current.parentId === proj.parentId &&
      current.position === newPosition
    ) {
      return;
    }
    try {
      await update.mutateAsync({
        id: activeKey,
        patch: { parent_id: proj.parentId, position: newPosition },
      });
      if (proj.parentId) expand(proj.parentId);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages…"
          className="h-8 w-full rounded-md border border-input bg-background/60 pl-7 pr-7 text-sm outline-none focus:border-ring"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {query ? (
        <div className="space-y-0.5">
          {results.length === 0 ? (
            <div className="px-2 py-1 text-sm text-muted-foreground">
              No pages match “{query}”.
            </div>
          ) : (
            results.map((p) => <PageLink key={p.id} page={p} />)
          )}
        </div>
      ) : (
        <>
          {favPages.length > 0 && (
            <div>
              <div className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                Favorites
              </div>
              <div className="space-y-0.5">
                {favPages.map((p) => (
                  <PageLink key={p.id} page={p} />
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-xs font-medium text-muted-foreground">
                Workspace
              </span>
              <button
                type="button"
                title="New page"
                onClick={newRootPage}
                className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            </div>

            {isLoading ? (
              <div className="px-2 py-1 text-sm text-muted-foreground">
                Loading…
              </div>
            ) : sortableItems.length === 0 ? (
              <button
                onClick={newRootPage}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent/50"
              >
                <FileText className="size-4" /> Create your first page
              </button>
            ) : (
              <DndContext
                sensors={sensors}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragOver={onDragOver}
                onDragEnd={onDragEnd}
                onDragCancel={resetDrag}
              >
                <SortableContext
                  items={itemIds}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-0.5">
                    {sortableItems.map((item) => (
                      <SortableTreeItem
                        key={item.id}
                        item={item}
                        depthOverride={
                          item.id === activeId && projected
                            ? projected.depth
                            : undefined
                        }
                        onToggle={toggle}
                        onExpand={expand}
                        favorites={favorites}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            <button
              onClick={newRootPage}
              className={cn(
                "mt-1 flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <Plus className="size-4" /> New page
            </button>
          </div>
        </>
      )}
    </div>
  );
}
