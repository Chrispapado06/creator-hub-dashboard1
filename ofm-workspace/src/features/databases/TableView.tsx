import { useState } from "react";
import { Maximize2, MoreHorizontal, Plus, Tags, Trash2 } from "lucide-react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { applyView, visibleProperties } from "./apply-view";
import { Cell } from "./cells";
import { OptionManager } from "./OptionManager";
import { usePeek } from "./peek-context";
import {
  useCreateProperty,
  useCreateRecord,
  useDeleteProperty,
  useDeleteRecord,
  useProperties,
  useRecords,
  useUpdateRecord,
  type DbProperty,
  type DbPropertyType,
} from "./use-databases";
import type { DbView } from "./use-db-views";

const TYPES: { value: DbPropertyType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "multi_select", label: "Multi-select" },
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
        config:
          type === "select" || type === "multi_select" ? { options: [] } : {},
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

function HeaderCell({
  databaseId,
  property,
  onDelete,
}: {
  databaseId: string;
  property: DbProperty;
  onDelete: () => void;
}) {
  const canEditOptions =
    property.type === "select" || property.type === "multi_select";
  return (
    <div className="db-th">
      <span className="truncate">{property.name}</span>
      {canEditOptions && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="db-th-menu" title="Edit options">
              <Tags className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <OptionManager databaseId={databaseId} property={property} />
          </PopoverContent>
        </Popover>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="db-th-menu">
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            <Trash2 className="size-4" /> Delete column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function TableView({
  databaseId,
  view,
}: {
  databaseId: string;
  view?: DbView;
}) {
  const { data: properties = [], isLoading } = useProperties(databaseId);
  const { data: records = [] } = useRecords(databaseId);
  const updateRecord = useUpdateRecord(databaseId);
  const createRecord = useCreateRecord(databaseId);
  const deleteRecord = useDeleteRecord(databaseId);
  const deleteProperty = useDeleteProperty(databaseId);
  const { open } = usePeek();

  const cols = view ? visibleProperties(properties, view.config) : properties;
  const rows = view ? applyView(records, properties, view.config) : records;

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
              {cols.map((p) => (
                <th key={p.id}>
                  <HeaderCell
                    databaseId={databaseId}
                    property={p}
                    onDelete={() => deleteProperty.mutate(p.id)}
                  />
                </th>
              ))}
              <th className="db-add-th">
                <AddColumn databaseId={databaseId} nextPosition={properties.length} />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="group">
                {cols.map((p) => (
                  <td key={p.id}>
                    <Cell
                      property={p}
                      value={r.properties[p.id]}
                      onChange={(v) => setCell(r.id, r.properties, p.id, v)}
                    />
                  </td>
                ))}
                <td className="db-row-actions">
                  <div className="flex items-center gap-1">
                    <button
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                      title="Open row"
                      onClick={() => open(r.id)}
                    >
                      <Maximize2 className="size-3.5" />
                    </button>
                    <button
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                      title="Delete row"
                      onClick={() => deleteRecord.mutate(r.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={cols.length + 1}
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
