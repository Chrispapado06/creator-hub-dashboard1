import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Cell } from "./cells";
import { usePeek } from "./peek-context";
import {
  recordTitle,
  useProperties,
  useRecords,
  useUpdateRecord,
} from "./use-databases";

/** Click a row/card in any view -> edit all of that record's fields here. */
export function RecordPeek({ databaseId }: { databaseId: string }) {
  const { openId, close } = usePeek();
  const { data: properties = [] } = useProperties(databaseId);
  const { data: records = [] } = useRecords(databaseId);
  const update = useUpdateRecord(databaseId);
  const record = records.find((r) => r.id === openId);

  function set(propId: string, value: unknown) {
    if (!record) return;
    update.mutate({
      id: record.id,
      properties: { ...record.properties, [propId]: value },
    });
  }

  return (
    <Dialog open={Boolean(openId)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {record ? recordTitle(record, properties) : "Record"}
          </DialogTitle>
        </DialogHeader>
        {record ? (
          <div className="space-y-2">
            {properties.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-[7rem_1fr] items-center gap-2"
              >
                <span className="truncate text-sm text-muted-foreground">
                  {p.name}
                </span>
                <div className="rounded-md border">
                  <Cell
                    property={p}
                    value={record.properties[p.id]}
                    onChange={(v) => set(p.id, v)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
