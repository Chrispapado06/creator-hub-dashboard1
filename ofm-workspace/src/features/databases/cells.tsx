import { useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DbProperty } from "./use-databases";

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
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
