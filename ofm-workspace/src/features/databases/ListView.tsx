import { applyView, groupRecords } from "./apply-view";
import { Chip, PropertyValue } from "./cells";
import { usePeek } from "./peek-context";
import {
  recordTitle,
  useProperties,
  useRecords,
  type DbProperty,
} from "./use-databases";
import type { DbView } from "./use-db-views";

export function ListView({
  databaseId,
  view,
}: {
  databaseId: string;
  view: DbView;
}) {
  const { data: properties = [] } = useProperties(databaseId);
  const { data: records = [] } = useRecords(databaseId);
  const rows = applyView(records, properties, view.config);
  const { open } = usePeek();
  const groupProp = properties.find((p) => p.id === view.config.groupBy);
  const subProps = (view.config.subPropIds ?? [])
    .map((id) => properties.find((p) => p.id === id))
    .filter(Boolean) as DbProperty[];
  const groups = groupProp
    ? groupRecords(rows, groupProp)
    : [{ key: null, label: "", color: undefined, records: rows }];

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.key ?? "all"}>
          {groupProp && (
            <div className="mb-1 flex items-center gap-2 text-sm font-medium">
              {g.color ? <Chip label={g.label} color={g.color} /> : g.label}
              <span className="text-muted-foreground">{g.records.length}</span>
            </div>
          )}
          <div className="divide-y rounded-lg border">
            {g.records.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => open(r.id)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/40"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {recordTitle(r, properties)}
                </span>
                {subProps.map((p) => (
                  <span key={p.id} className="hidden shrink-0 sm:block">
                    <PropertyValue property={p} value={r.properties[p.id]} />
                  </span>
                ))}
              </button>
            ))}
            {!g.records.length && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                Empty
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
