import { useState } from "react";
import { Plus, X } from "lucide-react";

import { OPTION_COLORS, OPTION_COLOR_KEYS } from "./cells";
import {
  useUpdateProperty,
  type DbProperty,
  type SelectOption,
} from "./use-databases";

/** Add / rename / recolor / delete the options of a select or multi-select column. */
export function OptionManager({
  databaseId,
  property,
}: {
  databaseId: string;
  property: DbProperty;
}) {
  const update = useUpdateProperty(databaseId);
  const options = property.config.options ?? [];
  const [name, setName] = useState("");

  function save(next: SelectOption[]) {
    update.mutate({
      id: property.id,
      patch: { config: { ...property.config, options: next } },
    });
  }
  function add() {
    const n = name.trim();
    if (!n) return;
    save([...options, { id: crypto.randomUUID(), label: n, color: "gray" }]);
    setName("");
  }

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">Options</div>
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {options.map((o) => (
          <div key={o.id} className="flex items-center gap-1">
            <select
              value={o.color ?? "gray"}
              onChange={(e) =>
                save(options.map((x) => (x.id === o.id ? { ...x, color: e.target.value } : x)))
              }
              className="h-7 w-7 shrink-0 cursor-pointer rounded border text-transparent"
              style={{ backgroundColor: OPTION_COLORS[o.color ?? "gray"] }}
              title="Color"
            >
              {OPTION_COLOR_KEYS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={o.label}
              onChange={(e) =>
                save(options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))
              }
              className="h-7 flex-1 rounded border bg-background px-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => save(options.filter((x) => x.id !== o.id))}
              className="flex size-6 items-center justify-center text-muted-foreground hover:text-destructive"
              title="Delete option"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {!options.length && (
          <div className="px-1 text-xs text-muted-foreground">No options yet.</div>
        )}
      </div>
      <div className="flex items-center gap-1 pt-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="New option"
          className="h-7 flex-1 rounded border bg-background px-2 text-sm outline-none"
        />
        <button
          type="button"
          onClick={add}
          className="flex size-7 items-center justify-center rounded border hover:bg-accent"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
