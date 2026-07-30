import { applyView } from "./apply-view";
import { PropertyValue } from "./cells";
import { usePeek } from "./peek-context";
import {
  recordTitle,
  useProperties,
  useRecords,
  type DbProperty,
} from "./use-databases";
import type { DbView } from "./use-db-views";

export function GalleryView({
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
  const coverProp = properties.find((p) => p.id === view.config.coverPropId);
  const subProps = (view.config.subPropIds ?? [])
    .map((id) => properties.find((p) => p.id === id))
    .filter(Boolean) as DbProperty[];

  if (!rows.length)
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No records.
      </div>
    );

  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
      {rows.map((r) => {
        const cover = coverProp ? String(r.properties[coverProp.id] ?? "") : "";
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => open(r.id)}
            className="flex flex-col overflow-hidden rounded-lg border text-left transition-colors hover:bg-accent/40"
          >
            <div className="flex aspect-video w-full items-center justify-center bg-muted">
              {cover ? (
                <img src={cover} alt="" className="size-full object-cover" />
              ) : (
                <span className="text-2xl opacity-30">🗂️</span>
              )}
            </div>
            <div className="space-y-1 p-2.5">
              <div className="truncate font-medium">
                {recordTitle(r, properties)}
              </div>
              <div className="flex flex-wrap gap-1">
                {subProps.map((p) => (
                  <PropertyValue key={p.id} property={p} value={r.properties[p.id]} />
                ))}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
