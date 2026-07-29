import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageIcon } from "./PageIcon";
import { INDENT_WIDTH, type FlatItem } from "./tree-dnd";
import {
  useArchivePage,
  useCreatePage,
  useToggleFavorite,
  useUpdatePage,
} from "./use-pages";

export function SortableTreeItem({
  item,
  depthOverride,
  onToggle,
  onExpand,
  favorites,
}: {
  item: FlatItem;
  depthOverride?: number;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
  favorites: string[];
}) {
  const navigate = useNavigate();
  const { pageId } = useParams();
  const create = useCreatePage();
  const update = useUpdatePage();
  const archivePage = useArchivePage();
  const toggleFav = useToggleFavorite();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(item.title);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const depth = depthOverride ?? item.depth;
  const isActive = pageId === item.id;
  const isFav = favorites.includes(item.id);

  async function addChild(e?: React.MouseEvent) {
    e?.stopPropagation();
    try {
      const id = await create.mutateAsync({ parentId: item.id });
      onExpand(item.id);
      navigate(`/page/${id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function saveRename() {
    setRenaming(false);
    const t = name.trim();
    if (t !== item.title) {
      try {
        await update.mutateAsync({ id: item.id, patch: { title: t } });
      } catch (err) {
        toast.error((err as Error).message);
      }
    }
  }

  async function archive() {
    try {
      // Archives this page AND its whole subtree together.
      await archivePage.mutateAsync(item.id);
      if (isActive) navigate("/");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-50")}
    >
      <div
        className={cn(
          "group flex h-7 cursor-pointer items-center gap-1 rounded-md pr-1 text-sm",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
        )}
        style={{ paddingLeft: depth * INDENT_WIDTH + 2 }}
        onClick={() => !renaming && navigate(`/page/${item.id}`)}
      >
        <button
          type="button"
          className="flex size-4 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-sidebar-accent group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>

        <button
          type="button"
          className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-sidebar-accent"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(item.id);
          }}
        >
          {item.hasChildren ? (
            item.collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )
          ) : (
            <span className="size-3.5" />
          )}
        </button>

        <span className="flex size-5 shrink-0 items-center justify-center">
          <PageIcon icon={item.icon} />
        </span>

        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveRename();
              if (e.key === "Escape") {
                setName(item.title);
                setRenaming(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 rounded border border-input bg-background px-1 py-0.5 text-sm outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">
            {item.title || "Untitled"}
          </span>
        )}

        <div className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button
            type="button"
            title="Add subpage"
            className="flex size-5 items-center justify-center rounded hover:bg-sidebar-accent"
            onClick={addChild}
          >
            <Plus className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded hover:bg-sidebar-accent"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem
                onClick={() => {
                  setName(item.title);
                  setRenaming(true);
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => toggleFav.mutate({ pageId: item.id, on: !isFav })}
              >
                <Star className={cn("size-4", isFav && "fill-current")} />
                {isFav ? "Remove from favorites" : "Add to favorites"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addChild()}>
                <Plus className="size-4" /> Add subpage
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={archive}>
                <Trash2 className="size-4" /> Move to trash
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
