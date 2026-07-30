import type { DbPropertyType } from "./use-databases";

export type ViewType = "table" | "board" | "calendar" | "gallery" | "list";

export type FilterOperator =
  | "is" | "is_not"
  | "contains" | "not_contains"
  | "is_empty" | "is_not_empty"
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "before" | "after" | "on_or_before" | "on_or_after";

export interface ViewFilter {
  id: string;
  propId: string;
  op: FilterOperator;
  value?: unknown;
}
export interface ViewSort {
  propId: string;
  direction: "asc" | "desc";
}

export interface ViewConfig {
  filters?: ViewFilter[]; // AND-combined
  sorts?: ViewSort[]; // primary first
  groupBy?: string | null; // board columns / list sections (select|multi_select propId)
  datePropId?: string | null; // calendar positioning (date prop)
  coverPropId?: string | null; // gallery cover (url prop)
  subPropIds?: string[]; // extra props shown as chips on cards/rows
  hidden?: string[]; // denylist of hidden propIds
  cardSize?: "small" | "medium" | "large";
}

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  not_contains: "does not contain",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  eq: "=",
  neq: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  before: "before",
  after: "after",
  on_or_before: "on or before",
  on_or_after: "on or after",
};

export const OPERATORS_BY_TYPE: Record<DbPropertyType, FilterOperator[]> = {
  text: ["contains", "not_contains", "is", "is_not", "is_empty", "is_not_empty"],
  url: ["contains", "not_contains", "is", "is_not", "is_empty", "is_not_empty"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"],
  select: ["is", "is_not", "is_empty", "is_not_empty"],
  multi_select: ["contains", "not_contains", "is_empty", "is_not_empty"],
  date: ["is", "before", "after", "on_or_before", "on_or_after", "is_empty", "is_not_empty"],
  checkbox: ["is"],
  person: ["is", "is_not", "is_empty", "is_not_empty"],
  relation: ["contains", "not_contains", "is_empty", "is_not_empty"],
  created_time: ["before", "after", "on_or_before", "on_or_after"],
  updated_time: ["before", "after", "on_or_before", "on_or_after"],
};

/** Property types that can group a Board / List view. */
export const GROUPABLE_TYPES: DbPropertyType[] = ["select", "multi_select"];

export const VIEW_TYPE_LABELS: Record<ViewType, string> = {
  table: "Table",
  board: "Board",
  calendar: "Calendar",
  gallery: "Gallery",
  list: "List",
};
