import type { DbProperty, DbRecord } from "./use-databases";
import type { ViewConfig, ViewFilter } from "./view-types";

const isEmpty = (v: unknown) =>
  v == null || v === "" || (Array.isArray(v) && v.length === 0);

function rawValue(record: DbRecord, propId: string): unknown {
  if (propId === "__created") return record.created_at;
  if (propId === "__updated") return record.updated_at;
  return record.properties?.[propId];
}

function matchFilter(
  record: DbRecord,
  f: ViewFilter,
  prop: DbProperty | undefined,
): boolean {
  const v = rawValue(record, f.propId);
  switch (f.op) {
    case "is_empty":
      return isEmpty(v);
    case "is_not_empty":
      return !isEmpty(v);
    case "is":
      if (prop?.type === "checkbox") return Boolean(v) === Boolean(f.value);
      return String(v ?? "") === String(f.value ?? "");
    case "is_not":
      return String(v ?? "") !== String(f.value ?? "");
    case "contains": {
      if (Array.isArray(v)) return v.includes(f.value as never);
      return String(v ?? "").toLowerCase().includes(String(f.value ?? "").toLowerCase());
    }
    case "not_contains": {
      if (Array.isArray(v)) return !v.includes(f.value as never);
      return !String(v ?? "").toLowerCase().includes(String(f.value ?? "").toLowerCase());
    }
    case "eq": return Number(v) === Number(f.value);
    case "neq": return Number(v) !== Number(f.value);
    case "gt": return Number(v) > Number(f.value);
    case "gte": return Number(v) >= Number(f.value);
    case "lt": return Number(v) < Number(f.value);
    case "lte": return Number(v) <= Number(f.value);
    case "before": return String(v ?? "") < String(f.value ?? "");
    case "after": return String(v ?? "") > String(f.value ?? "");
    case "on_or_before": return String(v ?? "") <= String(f.value ?? "");
    case "on_or_after": return String(v ?? "") >= String(f.value ?? "");
    default:
      return true;
  }
}

function compare(a: unknown, b: unknown, prop: DbProperty | undefined): number {
  if (isEmpty(a) && isEmpty(b)) return 0;
  if (isEmpty(a)) return 1; // empties last
  if (isEmpty(b)) return -1;
  if (prop?.type === "number") return Number(a) - Number(b);
  if (prop?.type === "checkbox") return (a ? 1 : 0) - (b ? 1 : 0);
  if (prop?.type === "select") {
    // order by the option's position in config.options
    const opts = prop.config?.options ?? [];
    const ia = opts.findIndex((o) => o.id === a);
    const ib = opts.findIndex((o) => o.id === b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  }
  return String(a).localeCompare(String(b));
}

export function applyView(
  records: DbRecord[],
  properties: DbProperty[],
  config: ViewConfig | undefined,
): DbRecord[] {
  const byId = new Map(properties.map((p) => [p.id, p]));
  let out = records;
  const filters = config?.filters ?? [];
  if (filters.length) {
    out = out.filter((r) => filters.every((f) => matchFilter(r, f, byId.get(f.propId))));
  }
  const sorts = config?.sorts ?? [];
  if (sorts.length) {
    out = [...out].sort((ra, rb) => {
      for (const s of sorts) {
        const p = byId.get(s.propId);
        const c = compare(rawValue(ra, s.propId), rawValue(rb, s.propId), p);
        if (c !== 0) return s.direction === "desc" ? -c : c;
      }
      return ra.position - rb.position;
    });
  }
  return out;
}

/** Properties visible in a view (denylist), in position order. */
export function visibleProperties(
  properties: DbProperty[],
  config: ViewConfig | undefined,
): DbProperty[] {
  const hidden = new Set(config?.hidden ?? []);
  return properties.filter((p) => !hidden.has(p.id));
}

export interface RecordGroup {
  key: string | null; // option id, or null for "no value"
  label: string;
  color?: string;
  records: DbRecord[];
}

/** Group records by a select/multi_select property (board columns / list sections). */
export function groupRecords(
  records: DbRecord[],
  prop: DbProperty | undefined,
): RecordGroup[] {
  if (!prop) return [{ key: null, label: "All", records }];
  const options = prop.config?.options ?? [];
  const groups: RecordGroup[] = options.map((o) => ({
    key: o.id,
    label: o.label,
    color: o.color,
    records: [],
  }));
  const empty: RecordGroup = { key: null, label: `No ${prop.name}`, records: [] };
  const byId = new Map(groups.map((g) => [g.key, g]));

  for (const r of records) {
    const v = r.properties?.[prop.id];
    const ids = Array.isArray(v) ? (v as string[]) : v ? [v as string] : [];
    if (!ids.length) {
      empty.records.push(r);
      continue;
    }
    // single-select: one group; multi_select: first option's column (drag stays simple)
    const g = byId.get(ids[0]);
    (g ?? empty).records.push(r);
  }
  return [...groups, empty];
}
