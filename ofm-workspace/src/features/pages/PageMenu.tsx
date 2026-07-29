import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Copy,
  CornerUpRight,
  Files,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { siGoogletranslate } from "simple-icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TRANSLATE_LANGS } from "@/features/editor/translate-content";
import { PageIcon } from "./PageIcon";
import { useArchivePage, usePages, useUpdatePage } from "./use-pages";
import { useDuplicatePage } from "./use-page-actions";

function GTLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d={siGoogletranslate.path} />
    </svg>
  );
}

interface PageMenuProps {
  page: {
    id: string;
    title: string;
    icon: string | null;
    content?: unknown;
    parentId: string | null;
  };
  /** Full-width toggle only makes sense in the page editor; omit elsewhere. */
  fullWidth?: boolean;
  onToggleFullWidth?: () => void;
  /** If provided, "Rename" calls this (e.g. focus the title input). Otherwise a
   *  built-in rename dialog updates the title directly. */
  onRename?: () => void;
  /** Called after the page is moved to trash. Defaults to navigating home. */
  onDeleted?: () => void;
  /** Extra classes for the ⋯ trigger button (e.g. hover-reveal in a block). */
  triggerClassName?: string;
}

export function PageMenu({
  page,
  fullWidth,
  onToggleFullWidth,
  onRename,
  onDeleted,
  triggerClassName,
}: PageMenuProps) {
  const navigate = useNavigate();
  const { data: pages = [] } = usePages();
  const duplicate = useDuplicatePage();
  const update = useUpdatePage();
  const archive = useArchivePage();
  const [moveOpen, setMoveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // Pages you can move into = everything except this page and its descendants.
  const moveTargets = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    for (const p of pages) {
      const k = p.parentId ?? "";
      const arr = childrenByParent.get(k);
      if (arr) arr.push(p.id);
      else childrenByParent.set(k, [p.id]);
    }
    const banned = new Set<string>();
    const stack = [page.id];
    while (stack.length) {
      const cur = stack.pop()!;
      banned.add(cur);
      for (const c of childrenByParent.get(cur) ?? []) stack.push(c);
    }
    return pages.filter((p) => !banned.has(p.id));
  }, [pages, page.id]);

  function startRename() {
    if (onRename) {
      onRename();
      return;
    }
    setRenameValue(page.title);
    setRenameOpen(true);
  }

  async function saveRename() {
    const next = renameValue.trim();
    setRenameOpen(false);
    if (!next || next === page.title) return;
    try {
      await update.mutateAsync({ id: page.id, patch: { title: next } });
      toast.success("Renamed");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doDuplicate(translateTo?: string, langLabel?: string) {
    try {
      const id = await duplicate.mutateAsync({
        title: page.title,
        icon: page.icon,
        content: page.content,
        sourceId: page.id,
        parentId: page.parentId,
        translateTo,
        langLabel,
      });
      toast.success(translateTo ? `Translated copy created` : "Page duplicated");
      navigate(`/page/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function moveTo(parentId: string | null) {
    setMoveOpen(false);
    try {
      await update.mutateAsync({ id: page.id, patch: { parent_id: parentId } });
      toast.success("Page moved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function del() {
    try {
      await archive.mutateAsync(page.id);
      toast.success("Moved to trash");
      if (onDeleted) onDeleted();
      else navigate("/");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function copyLink() {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Couldn't copy link"));
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8", triggerClassName)}
            title="Page options"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={startRename}>
            <Pencil className="size-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => doDuplicate()}>
            <Files className="size-4" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMoveOpen(true)}>
            <CornerUpRight className="size-4" /> Move to…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={copyLink}>
            <Copy className="size-4" /> Copy link
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <GTLogo className="size-4" />
              <span className="ml-2">Translate</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              <div className="px-2 py-1 text-xs text-muted-foreground">
                Duplicate as translation
              </div>
              {TRANSLATE_LANGS.map((l) => (
                <DropdownMenuItem
                  key={l.code}
                  onClick={() => doDuplicate(l.code, l.label)}
                >
                  {l.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {onToggleFullWidth && (
            <DropdownMenuItem onClick={onToggleFullWidth}>
              {fullWidth ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
              {fullWidth ? "Narrow width" : "Full width"}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={del}>
            <Trash2 className="size-4" /> Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move page to…</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            <button
              onClick={() => moveTo(null)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <CornerUpRight className="size-4 opacity-70" /> Top level
            </button>
            {moveTargets.map((p) => (
              <button
                key={p.id}
                onClick={() => moveTo(p.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="flex size-5 items-center justify-center">
                  <PageIcon icon={p.icon} />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {p.title || "Untitled"}
                </span>
              </button>
            ))}
            {moveTargets.length === 0 && (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                No other pages to move into.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename page</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveRename();
              }
            }}
            placeholder="Untitled"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveRename()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
