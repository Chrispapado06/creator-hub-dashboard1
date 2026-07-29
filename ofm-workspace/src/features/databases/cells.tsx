import { useEffect, useState } from "react";
import { Check } from "lucide-react";

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
import type { DbProperty } from "./use-databases";

// Notion-style option colors (light chip bg + dark text — readable in both app
// themes since the chip carries its own background). Also the target the Notion
// importer maps select/multi_select/status option colors onto.
const OPTION_COLORS: Record<string, string> = {
  default: "#e3e2e0",
  gray: "#e3e2e0",
  brown: "#eee0da",
  orange: "#fadec9",
  yellow: "#fdecc8",
  green: "#dbeddb",
  blue: "#d3e5ef",
  purple: "#e8deee",
  pink: "#f5e0e9",
  red: "#ffe2dd",
};

function chipStyle(color?: string) {
  return {
    backgroundColor: OPTION_COLORS[color ?? "default"] ?? OPTION_COLORS.default,
    color: "#37352f",
  };
}

function Chip({ label, color }: { label: string; color?: string }) {
  return (
    <span
      className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-xs"
      style={chipStyle(color)}
    >
      {label}
    </span>
  );
}

function TextCell({
  value,
  onCommit,
  numeric,
}: {
  value: unknown;
  onCommit: (v: string) => void;
  numeric?: boolean;
}) {
  const initial = value == null ? "" : String(value);
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== initial) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      inputMode={numeric ? "decimal" : undefined}
      className="h-8 w-full bg-transparent px-2 text-sm outline-none"
    />
  );
}

function SelectCell({
  property,
  value,
  onChange,
}: {
  property: DbProperty;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const options = property.config.options ?? [];
  return (
    <Select
      value={value ?? "__none"}
      onValueChange={(v) => onChange(v === "__none" ? null : v)}
    >
      <SelectTrigger className="h-8 w-full rounded-none border-0 bg-transparent px-2 shadow-none focus:ring-0">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">—</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            <Chip label={o.label} color={o.color} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiSelectCell({
  property,
  value,
  onChange,
}: {
  property: DbProperty;
  value: unknown;
  onChange: (v: string[]) => void;
}) {
  const options = property.config.options ?? [];
  const selected = Array.isArray(value) ? (value as string[]) : [];
  const byId = new Map(options.map((o) => [o.id, o]));

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-full flex-wrap items-center gap-1 overflow-hidden px-2 text-left"
        >
          {selected.length ? (
            selected.map((id) => {
              const o = byId.get(id);
              return o ? <Chip key={id} label={o.label} color={o.color} /> : null;
            })
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52">
        {options.length === 0 && (
          <div className="px-2 py-1 text-xs text-muted-foreground">
            No options
          </div>
        )}
        {options.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={(e) => {
              e.preventDefault();
              toggle(o.id);
            }}
          >
            <span className="min-w-0 flex-1">
              <Chip label={o.label} color={o.color} />
            </span>
            {selected.includes(o.id) && <Check className="size-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Cell({
  property,
  value,
  onChange,
}: {
  property: DbProperty;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (property.type) {
    case "checkbox":
      return (
        <div className="flex h-8 items-center px-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4 cursor-pointer accent-[var(--primary)]"
          />
        </div>
      );
    case "select":
      return (
        <SelectCell
          property={property}
          value={(value as string | null) ?? null}
          onChange={onChange}
        />
      );
    case "multi_select":
      return (
        <MultiSelectCell property={property} value={value} onChange={onChange} />
      );
    case "date":
      return (
        <input
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-8 w-full bg-transparent px-2 text-sm outline-none"
        />
      );
    case "number":
      return (
        <TextCell
          value={value}
          numeric
          onCommit={(v) => onChange(v === "" ? null : Number(v))}
        />
      );
    default:
      return (
        <TextCell value={value} onCommit={(v) => onChange(v === "" ? null : v)} />
      );
  }
}
