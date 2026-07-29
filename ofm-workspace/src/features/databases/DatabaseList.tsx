import { useNavigate, useParams } from "react-router-dom";
import { Plus, Table2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { PageIcon } from "@/features/pages/PageIcon";
import { useCreateDatabase, useDatabases } from "./use-databases";

export function DatabaseList() {
  const { data: dbs = [] } = useDatabases();
  const create = useCreateDatabase();
  const navigate = useNavigate();
  const { databaseId } = useParams();

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
          <button
            key={d.id}
            onClick={() => navigate(`/db/${d.id}`)}
            className={cn(
              "flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-sm",
              databaseId === d.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
            )}
          >
            <span className="flex size-5 items-center justify-center">
              {d.icon ? (
                <PageIcon icon={d.icon} />
              ) : (
                <Table2 className="size-4 opacity-70" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-left">
              {d.title || "Untitled database"}
            </span>
          </button>
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
