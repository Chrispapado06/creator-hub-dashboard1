import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { applyView, groupRecords, type RecordGroup } from "./apply-view";
import { Chip, PropertyValue } from "./cells";
import { usePeek } from "./peek-context";
import {
  recordTitle,
  useCreateRecord,
  useProperties,
  useRecords,
  useUpdateRecord,
  type DbProperty,
  type DbRecord,
} from "./use-databases";
import type { DbView } from "./use-db-views";

function Card({
  record,
  properties,
  subProps,
}: {
  record: DbRecord;
  properties: DbProperty[];
  subProps: DbProperty[];
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: record.id });
  const { open } = usePeek();
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => open(record.id)}
      className={cn(
        "cursor-pointer rounded-md border bg-background p-2 shadow-sm hover:bg-accent/40",
        isDragging && "opacity-50",
      )}
    >
      <div className="truncate text-sm font-medium">
        {recordTitle(record, properties)}
      </div>
      {subProps.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {subProps.map((p) => (
            <PropertyValue key={p.id} property={p} value={record.properties[p.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

function Column({
  group,
  properties,
  subProps,
  onAdd,
}: {
  group: RecordGroup;
  properties: DbProperty[];
  subProps: DbProperty[];
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: group.key ?? "__none" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col rounded-lg bg-muted/40 p-2",
        isOver && "ring-2 ring-ring",
      )}
    >
      <div className="mb-2 flex items-center gap-2 px-1 text-sm font-medium">
        {group.color ? (
          <Chip label={group.label} color={group.color} />
        ) : (
          <span className="truncate">{group.label}</span>
        )}
        <span className="text-muted-foreground">{group.records.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {group.records.map((r) => (
          <Card key={r.id} record={r} properties={properties} subProps={subProps} />
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 flex items-center gap-1 rounded px-1 py-1 text-sm text-muted-foreground hover:bg-accent"
      >
        <Plus className="size-4" /> New
      </button>
    </div>
  );
}

export function BoardView({
  databaseId,
  view,
}: {
  databaseId: string;
  view: DbView;
}) {
  const { data: properties = [] } = useProperties(databaseId);
  const { data: records = [] } = useRecords(databaseId);
  const update = useUpdateRecord(databaseId);
  const createRecord = useCreateRecord(databaseId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const groupProp = properties.find((p) => p.id === view.config.groupBy);
  const subProps = (view.config.subPropIds ?? [])
    .map((id) => properties.find((p) => p.id === id))
    .filter(Boolean) as DbProperty[];

  if (!groupProp)
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Choose a <span className="font-medium">Group by</span> property
        (select or multi-select) in view settings to use the board.
      </div>
    );

  const rows = applyView(records, properties, view.config);
  const groups = groupRecords(rows, groupProp);

  function valueForColumn(key: string | null): unknown {
    if (key == null) return groupProp!.type === "multi_select" ? [] : null;
    return groupProp!.type === "multi_select" ? [key] : key;
  }

  function onDragEnd(e: DragEndEvent) {
    const col = e.over ? String(e.over.id) : null;
    if (!col) return;
    const rec = records.find((r) => r.id === String(e.active.id));
    if (!rec) return;
    const key = col === "__none" ? null : col;
    update.mutate({
      id: rec.id,
      properties: { ...rec.properties, [groupProp!.id]: valueForColumn(key) },
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {groups.map((g) => (
          <Column
            key={g.key ?? "__none"}
            group={g}
            properties={properties}
            subProps={subProps}
            onAdd={() =>
              createRecord.mutate({
                properties: { [groupProp.id]: valueForColumn(g.key) },
                position: Date.now(),
              })
            }
          />
        ))}
      </div>
    </DndContext>
  );
}
