import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceStore, useCurrentWorkspaceId } from "@/stores/workspace-store";
import { useCreateWorkspace, useWorkspaces } from "./use-workspaces";
import { WorkspaceLogo } from "./WorkspaceLogo";

export function WorkspaceSwitcher() {
  const { data: workspaces = [] } = useWorkspaces();
  const currentId = useCurrentWorkspaceId();
  const setCurrent = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const create = useCreateWorkspace();
  const navigate = useNavigate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const current = workspaces.find((w) => w.id === currentId);

  function switchTo(id: string) {
    if (id !== currentId) {
      setCurrent(id);
      navigate("/");
    }
  }

  async function createWs() {
    const n = name.trim();
    if (!n) return;
    try {
      const id = await create.mutateAsync(n);
      setCurrent(id);
      setName("");
      setDialogOpen(false);
      navigate("/");
      toast.success(`Created “${n}”`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-14 w-full items-center gap-2 border-b px-3 text-left transition-colors hover:bg-sidebar-accent/50">
            <WorkspaceLogo
              name={current?.name ?? "W"}
              icon={current?.icon}
              logoUrl={current?.logoUrl}
              className="size-6 text-xs"
            />
            <span className="min-w-0 flex-1 truncate font-semibold">
              {current?.name ?? "Workspace"}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => switchTo(w.id)}>
              <WorkspaceLogo
                name={w.name}
                icon={w.icon}
                logoUrl={w.logoUrl}
                className="size-5 text-[10px]"
              />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.id === currentId && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              A fresh, separate workspace — you'll be its owner.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Workspace name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createWs();
            }}
          />
          <DialogFooter>
            <Button onClick={createWs} disabled={create.isPending || !name.trim()}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
