import { useState } from "react";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Cell } from "./cells";
import {
  useCreateProperty,
  useCreateRecord,
  useDeleteProperty,
  useDeleteRecord,
  useProperties,
  useRecords,
  useUpdateRecord,
  type DbPropertyType,
} from "./use-databases";

const TYPES: { value: DbPropertyType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "URL" },
];

function AddColumn({
  databaseId,
  nextPosition,
}: {
  databaseId: string;
  nextPosition: number;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<DbPropertyType>("text");
  const createProperty = useCreateProperty(databaseId);

  async function add() {
    try {
      await createProperty.mutateAsync({
        name: name.trim() || "Property",
        type,
        config: type === "select" ? { options: [] } : {},
        position: nextPosition,
      });
      setName("");
      setType("text");
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="db-add-col" title="Add column">
          <Plus className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New column</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="Column name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <Select value={type} onValueChange={(v) => setType(v as DbPropertyType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={add} disabled={createProperty.isPending}>
            Add column
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TableView({ databaseId }: { databaseId: string }) {
  const { data: properties = [], isLoading } = useProperties(databaseId);
  const { data: records = [] } = useRecords(databaseId);
  const updateRecord = useUpdateRecord(databaseId);
  const createRecord = useCreateRecord(databaseId);
  const deleteRecord = useDeleteRecord(databaseId);
  const deleteProperty = useDeleteProperty(databaseId);

  function setCell(
    recordId: string,
    current: Record<string, unknown>,
    propId: string,
    value: unknown,
  ) {
    updateRecord.mutate({
      id: recordId,
      properties: { ...current, [propId]: value },
    });
  }

  if (isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="db-table">
          <thead>
            <tr>
              {properties.map((p) => (
                <th key={p.id}>
                  <div className="db-th">
                    <span className="truncate">{p.name}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="db-th-menu">
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteProperty.mutate(p.id)}
                        >
                          <Trash2 className="size-4" /> Delete column
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </th>
              ))}
              <th className="db-add-th">
                <AddColumn databaseId={databaseId} nextPosition={properties.length} />
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="group">
                {properties.map((p) => (
                  <td key={p.id}>
                    <Cell
                      property={p}
                      value={r.properties[p.id]}
                      onChange={(v) => setCell(r.id, r.properties, p.id, v)}
                    />
                  </td>
                ))}
                <td className="db-row-actions">
                  <button
                    className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                    title="Delete row"
                    onClick={() => deleteRecord.mutate(r.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td
                  colSpan={properties.length + 1}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  No rows yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        className="db-add-row"
        onClick={() => createRecord.mutate({ position: records.length })}
      >
        <Plus className="size-4" /> New row
      </button>
    </div>
  );
}
