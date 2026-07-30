import {
  Calendar,
  ChevronDown,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Settings2,
  SquareKanban,
  Table2,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { GROUPABLE_TYPES, OPERATORS_BY_TYPE, OPERATOR_LABELS, VIEW_TYPE_LABELS, type FilterOperator, type ViewType } from "./view-types";
import { useProperties, type DbProperty } from "./use-databases";
import {
  useCreateView,
  useDeleteView,
  useUpdateView,
  type DbView,
} from "./use-db-views";

const VIEW_ICON: Record<ViewType, typeof Table2> = {
  table: Table2,
  board: SquareKanban,
  calendar: Calendar,
  gallery: LayoutGrid,
  list: ListIcon,
};

const uid = () => crypto.randomUUID().slice(0, 8);

export function ViewBar({
  databaseId,
  views,
  activeId,
  onSelect,
}: {
  databaseId: string;
  views: DbView[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data: properties = [] } = useProperties(databaseId);
  const createView = useCreateView(databaseId);
  const updateView = useUpdateView(databaseId);
  const deleteView = useDeleteView(databaseId);
  const active = views.find((v) => v.id === activeId);

  const setConfig = (patch: Partial<DbView["config"]>) => {
    if (!active) return;
    updateView.mutate({ id: active.id, patch: { config: { ...active.config, ...patch } } });
  };

  const groupable = properties.filter((p) => GROUPABLE_TYPES.includes(p.type));
  const dateProps = properties.filter((p) => p.type === "date");
  const urlProps = properties.filter((p) => p.type === "url");

  return (
    <div className="flex items-center gap-1 border-b pb-2">
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {views.map((v) => {
          const Icon = VIEW_ICON[v.type];
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(v.id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-sm",
                v.id === activeId
                  ? "bg-accent font-medium"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="size-3.5" /> {v.name}
            </button>
          );
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent/50">
              <Plus className="size-3.5" /> Add view
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.keys(VIEW_TYPE_LABELS) as ViewType[]).map((t) => {
              const Icon = VIEW_ICON[t];
              return (
                <DropdownMenuItem
                  key={t}
                  onClick={() =>
                    createView.mutate(
                      { name: VIEW_TYPE_LABELS[t], type: t, position: views.length },
                      { onSuccess: (id) => onSelect(id as unknown as string) },
                    )
                  }
                >
                  <Icon className="size-4" /> {VIEW_TYPE_LABELS[t]}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {active && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent/50">
                <Settings2 className="size-3.5" /> View
                <ChevronDown className="size-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
              {/* Rename */}
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Name</div>
                <input
                  defaultValue={active.name}
                  onBlur={(e) => {
                    const n = e.target.value.trim();
                    if (n && n !== active.name)
                      updateView.mutate({ id: active.id, patch: { name: n } });
                  }}
                  className="h-8 w-full rounded border bg-background px-2 text-sm outline-none"
                />
              </div>

              {/* Type-specific picker */}
              {(active.type === "board" || active.type === "list") && (
                <PropPicker
                  label="Group by"
                  props={groupable}
                  value={active.config.groupBy ?? null}
                  onChange={(id) => setConfig({ groupBy: id })}
                />
              )}
              {active.type === "calendar" && (
                <PropPicker
                  label="Date property"
                  props={dateProps}
                  value={active.config.datePropId ?? null}
                  onChange={(id) => setConfig({ datePropId: id })}
                />
              )}
              {active.type === "gallery" && (
                <PropPicker
                  label="Cover (URL property)"
                  props={urlProps}
                  value={active.config.coverPropId ?? null}
                  onChange={(id) => setConfig({ coverPropId: id })}
                />
              )}

              {/* Card fields (chips) for board/gallery/list */}
              {active.type !== "table" && active.type !== "calendar" && (
                <MultiPropPicker
                  label="Card fields"
                  props={properties}
                  value={active.config.subPropIds ?? []}
                  onChange={(ids) => setConfig({ subPropIds: ids })}
                />
              )}

              <SortEditor
                properties={properties}
                sorts={active.config.sorts ?? []}
                onChange={(sorts) => setConfig({ sorts })}
              />
              <FilterEditor
                properties={properties}
                filters={active.config.filters ?? []}
                onChange={(filters) => setConfig({ filters })}
              />

              <div className="border-t pt-2">
                <button
                  type="button"
                  onClick={() => deleteView.mutate(active.id)}
                  disabled={views.length <= 1}
                  className="flex items-center gap-1 text-sm text-destructive disabled:opacity-40"
                >
                  <Trash2 className="size-4" /> Delete view
                </button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

function PropPicker({
  label,
  props,
  value,
  onChange,
}: {
  label: string;
  props: DbProperty[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-8 w-full rounded border bg-background px-2 text-sm outline-none"
      >
        <option value="">— none —</option>
        {props.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function MultiPropPicker({
  label,
  props,
  value,
  onChange,
}: {
  label: string;
  props: DbProperty[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {props.map((p) => {
          const on = value.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])
              }
              className={cn(
                "rounded border px-1.5 py-0.5 text-xs",
                on ? "bg-accent font-medium" : "text-muted-foreground",
              )}
            >
              {p.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SortEditor({
  properties,
  sorts,
  onChange,
}: {
  properties: DbProperty[];
  sorts: { propId: string; direction: "asc" | "desc" }[];
  onChange: (s: { propId: string; direction: "asc" | "desc" }[]) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">Sort</div>
      {sorts.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <select
            value={s.propId}
            onChange={(e) =>
              onChange(sorts.map((x, j) => (j === i ? { ...x, propId: e.target.value } : x)))
            }
            className="h-7 flex-1 rounded border bg-background px-1 text-sm outline-none"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={s.direction}
            onChange={(e) =>
              onChange(sorts.map((x, j) => (j === i ? { ...x, direction: e.target.value as "asc" | "desc" } : x)))
            }
            className="h-7 rounded border bg-background px-1 text-sm outline-none"
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
          <button type="button" onClick={() => onChange(sorts.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
            <X className="size-4" />
          </button>
        </div>
      ))}
      {properties.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([...sorts, { propId: properties[0].id, direction: "asc" }])}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          + Add sort
        </button>
      )}
    </div>
  );
}

function FilterEditor({
  properties,
  filters,
  onChange,
}: {
  properties: DbProperty[];
  filters: { id: string; propId: string; op: FilterOperator; value?: unknown }[];
  onChange: (f: { id: string; propId: string; op: FilterOperator; value?: unknown }[]) => void;
}) {
  const propById = new Map(properties.map((p) => [p.id, p]));
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">Filters</div>
      {filters.map((f) => {
        const prop = propById.get(f.propId);
        const ops = prop ? OPERATORS_BY_TYPE[prop.type] : [];
        const needsValue = !["is_empty", "is_not_empty"].includes(f.op);
        return (
          <div key={f.id} className="flex flex-wrap items-center gap-1">
            <select
              value={f.propId}
              onChange={(e) => {
                const np = propById.get(e.target.value);
                const nop = np ? OPERATORS_BY_TYPE[np.type][0] : f.op;
                onChange(filters.map((x) => (x.id === f.id ? { ...x, propId: e.target.value, op: nop } : x)));
              }}
              className="h-7 rounded border bg-background px-1 text-sm outline-none"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={f.op}
              onChange={(e) => onChange(filters.map((x) => (x.id === f.id ? { ...x, op: e.target.value as FilterOperator } : x)))}
              className="h-7 rounded border bg-background px-1 text-sm outline-none"
            >
              {ops.map((o) => (
                <option key={o} value={o}>{OPERATOR_LABELS[o]}</option>
              ))}
            </select>
            {needsValue &&
              (prop?.type === "select" ? (
                <select
                  value={String(f.value ?? "")}
                  onChange={(e) => onChange(filters.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))}
                  className="h-7 flex-1 rounded border bg-background px-1 text-sm outline-none"
                >
                  <option value="">—</option>
                  {(prop.config.options ?? []).map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              ) : prop?.type === "checkbox" ? (
                <select
                  value={String(f.value ?? "true")}
                  onChange={(e) => onChange(filters.map((x) => (x.id === f.id ? { ...x, value: e.target.value === "true" } : x)))}
                  className="h-7 rounded border bg-background px-1 text-sm outline-none"
                >
                  <option value="true">Checked</option>
                  <option value="false">Unchecked</option>
                </select>
              ) : (
                <input
                  value={String(f.value ?? "")}
                  onChange={(e) => onChange(filters.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))}
                  type={prop?.type === "date" ? "date" : prop?.type === "number" ? "number" : "text"}
                  className="h-7 flex-1 rounded border bg-background px-1 text-sm outline-none"
                />
              ))}
            <button type="button" onClick={() => onChange(filters.filter((x) => x.id !== f.id))} className="text-muted-foreground hover:text-destructive">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
      {properties.length > 0 && (
        <button
          type="button"
          onClick={() =>
            onChange([
              ...filters,
              { id: uid(), propId: properties[0].id, op: OPERATORS_BY_TYPE[properties[0].type][0], value: "" },
            ])
          }
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          + Add filter
        </button>
      )}
    </div>
  );
}
