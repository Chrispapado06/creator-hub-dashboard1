import { toast } from "sonner";
import { RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageIcon } from "./PageIcon";
import { useArchivedPages, useDeletePage, useUpdatePage } from "./use-pages";

export default function TrashPage() {
  const { data: archived = [], isLoading } = useArchivedPages();
  const update = useUpdatePage();
  const del = useDeletePage();

  async function restore(id: string) {
    try {
      await update.mutateAsync({ id, patch: { archived_at: null } });
      toast.success("Page restored");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(id: string) {
    try {
      await del.mutateAsync(id);
      toast.success("Page permanently deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Trash</h1>
        <p className="text-muted-foreground">
          Restore pages, or delete them permanently. Deleting also removes any
          subpages.
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : archived.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Trash is empty.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {archived.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex size-6 items-center justify-center">
                <PageIcon icon={p.icon} />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {p.title || "Untitled"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => restore(p.id)}
                disabled={update.isPending}
              >
                <RotateCcw className="size-4" /> Restore
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => remove(p.id)}
                disabled={del.isPending}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
