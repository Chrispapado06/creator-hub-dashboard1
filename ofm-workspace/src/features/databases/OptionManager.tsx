import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { OPTION_COLORS, OPTION_COLOR_KEYS } from "./cells";
import {
  useUpdateProperty,
  type DbProperty,
  type SelectOption,
} from "./use-databases";

/** One option row with a LOCAL label draft (commits on blur) so we don't write
 *  to the server on every keystroke (which reverted characters mid-typing). */
function OptionRow({
  option,
  onLabel,
  onColor,
  onDelete,
}: {
  option: SelectOption;
  onLabel: (label: string) => void;
  onColor: (color: string) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(option.label);
  useEffect(() => setLabel(option.label), [option.label]);
  return (
    <div className="flex items-center gap-1">
      <select
        value={option.color ?? "gray"}
        onChange={(e) => onColor(e.target.value)}
        className="h-7 w-7 shrink-0 cursor-pointer rounded border text-transparent"
        style={{ backgroundColor: OPTION_COLORS[option.color ?? "gray"] }}
        title="Color"
      >
        {OPTION_COLOR_KEYS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          if (label.trim() && label !== option.label) onLabel(label.trim());
          else setLabel(option.label);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-7 flex-1 rounded border bg-background px-2 text-sm outline-none"
      />
      <button
        type="button"
        onClick={onDelete}
        className="flex size-6 items-center justify-center text-muted-foreground hover:text-destructive"
        title="Delete option"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

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
          <OptionRow
            key={o.id}
            option={o}
            onLabel={(label) =>
              save(options.map((x) => (x.id === o.id ? { ...x, label } : x)))
            }
            onColor={(color) =>
              save(options.map((x) => (x.id === o.id ? { ...x, color } : x)))
            }
            onDelete={() => save(options.filter((x) => x.id !== o.id))}
          />
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
