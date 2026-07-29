import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Copy, MoreHorizontal, Pencil, Plus, Table2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageIcon } from "@/features/pages/PageIcon";
import {
  useArchiveDatabase,
  useCreateDatabase,
  useDatabases,
  useUpdateDatabase,
  type DatabaseMeta,
} from "./use-databases";

function DatabaseRow({ db }: { db: DatabaseMeta }) {
  const navigate = useNavigate();
  const { databaseId } = useParams();
  const update = useUpdateDatabase();
  const archive = useArchiveDatabase();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(db.title);

  const isActive = databaseId === db.id;

  async function saveRename() {
    setRenaming(false);
    const t = name.trim();
    if (t !== db.title) {
      try {
        await update.mutateAsync({ id: db.id, patch: { title: t } });
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  }

  async function del() {
    try {
      await archive.mutateAsync(db.id);
      toast.success("Database moved to trash");
      if (isActive) navigate("/");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function copyLink() {
    navigator.clipboard
      .writeText(`${window.location.origin}/db/${db.id}`)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Couldn't copy link"));
  }

  return (
    <div
      className={cn(
        "group flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
      )}
      onClick={() => !renaming && navigate(`/db/${db.id}`)}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        {db.icon ? (
          <PageIcon icon={db.icon} />
        ) : (
          <Table2 className="size-4 opacity-70" />
        )}
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
              setName(db.title);
              setRenaming(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded border border-input bg-background px-1 py-0.5 text-sm outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-left">
          {db.title || "Untitled database"}
        </span>
      )}

      <div className="ml-auto hidden shrink-0 items-center group-hover:flex">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Database options"
              className="flex size-5 items-center justify-center rounded hover:bg-sidebar-accent"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onClick={() => {
                setName(db.title);
                setRenaming(true);
              }}
            >
              <Pencil className="size-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={copyLink}>
              <Copy className="size-4" /> Copy link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={del}>
              <Trash2 className="size-4" /> Move to trash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function DatabaseList() {
  const { data: dbs = [] } = useDatabases();
  const create = useCreateDatabase();
  const navigate = useNavigate();

  async function newDatabase() {
    try {
      const id = await create.mutateAsync({});
      navigate(`/db/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-xs font-medium text-muted-foreground">
          Databases
        </span>
        <button
          type="button"
          title="New database"
          onClick={newDatabase}
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="space-y-0.5">
        {dbs.map((d) => (
          <DatabaseRow key={d.id} db={d} />
        ))}
        <button
          onClick={newDatabase}
          className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-sidebar-accent/50"
        >
          <Plus className="size-4" /> New database
        </button>
      </div>
    </div>
  );
}
