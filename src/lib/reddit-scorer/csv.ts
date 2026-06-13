/**
 * CSV bulk import for the subreddit catalog.
 *
 * Pure functions only — the UI decides what to do with the results. The
 * low-level RFC-4180 parser is carried over from the standalone scorer; the
 * field mapping + coercion target the dashboard's `subreddit_catalog`
 * columns (name, subscribers, niche, nsfw, verification_required, min_karma,
 * min_account_age_days, allows_promo, posting_notes, last_verified, active).
 *
 * Upsert semantics: rows are upserted on subreddit `name`. Only columns
 * present in the CSV are written, so a partial spreadsheet (e.g. just
 * name + subscribers) updates those fields without clobbering the rest.
 */
import { z } from "zod";

// ── Row schema (mirrors the subreddit_catalog DB columns) ───────────────────
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => !Number.isNaN(new Date(s + "T00:00:00Z").getTime()), "Invalid date");

export const CatalogCsvSchema = z.object({
  name: z.string().trim().min(1, "Name is required").transform((s) => s.replace(/^r\//i, "").toLowerCase()),
  subscribers: z.number().int("Whole number").min(0).default(0),
  niche: z.array(z.string().trim().min(1)).default([]),
  nsfw: z.boolean().default(true),
  verification_required: z.boolean().default(false),
  min_karma: z.number().int("Whole number").min(0).default(0),
  min_account_age_days: z.number().int("Whole number").min(0).default(0),
  allows_promo: z.boolean().default(true),
  posting_notes: z.string().nullable().default(null),
  last_verified: isoDate.nullable().default(null),
  active: z.boolean().default(true),
});
export type CatalogCsvValues = z.infer<typeof CatalogCsvSchema>;

export const CSV_FIELDS = Object.keys(CatalogCsvSchema.shape) as Array<keyof CatalogCsvValues>;

/** Friendly header aliases → canonical column names. */
export const CSV_HEADER_ALIASES: Record<string, keyof CatalogCsvValues> = {
  subreddit: "name",
  sub: "name",
  members: "subscribers",
  member_count: "subscribers",
  subscriber_count: "subscribers",
  tags: "niche",
  niches: "niche",
  niche_tags: "niche",
  verification: "verification_required",
  verify: "verification_required",
  karma: "min_karma",
  min_account_karma: "min_karma",
  age_days: "min_account_age_days",
  promo: "allows_promo",
  notes: "posting_notes",
  verified: "last_verified",
};

// ── Low-level CSV parsing (quotes, escaped quotes, CRLF) ─────────────────────
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// ── Cell coercion ────────────────────────────────────────────────────────────
const TRUE_WORDS = new Set(["true", "yes", "y", "1", "t"]);
const FALSE_WORDS = new Set(["false", "no", "n", "0", "f"]);

function coerceCell(field: keyof CatalogCsvValues, raw: string): unknown {
  const s = raw.trim();
  switch (field) {
    case "name":
      return s;
    case "niche":
      if (s === "") return [];
      return s.split(/[|;,]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    case "nsfw":
    case "verification_required":
    case "allows_promo":
    case "active": {
      if (s === "") return undefined; // schema default
      const w = s.toLowerCase();
      if (TRUE_WORDS.has(w)) return true;
      if (FALSE_WORDS.has(w)) return false;
      return s; // let Zod report "expected boolean"
    }
    case "subscribers":
    case "min_karma":
    case "min_account_age_days": {
      if (s === "") return undefined;
      const n = Number(s.replace(/[,_ ]/g, ""));
      return Number.isNaN(n) ? s : n;
    }
    case "last_verified":
    case "posting_notes":
      return s === "" ? null : s;
    default:
      return s;
  }
}

// ── Header mapping + row validation ─────────────────────────────────────────
export type CsvRowResult = {
  line: number;
  values: Partial<CatalogCsvValues> | null;
  errors: string[];
};

export type CsvValidation = {
  fields: Array<keyof CatalogCsvValues>;
  unknownHeaders: string[];
  rows: CsvRowResult[];
  validCount: number;
  errorCount: number;
  fileErrors: string[];
};

function normalizeHeader(h: string): keyof CatalogCsvValues | null {
  const key = h.trim().toLowerCase().replace(/\s+/g, "_");
  if ((CSV_FIELDS as string[]).includes(key)) return key as keyof CatalogCsvValues;
  return CSV_HEADER_ALIASES[key] ?? null;
}

export function validateCsv(text: string): CsvValidation {
  const grid = parseCsv(text);
  if (grid.length < 2) {
    return {
      fields: [], unknownHeaders: [], rows: [], validCount: 0, errorCount: 0,
      fileErrors: [grid.length === 0 ? "File is empty." : "No data rows below the header."],
    };
  }

  const headerCells = grid[0];
  const mapped = headerCells.map(normalizeHeader);
  const fields = mapped.filter((f): f is keyof CatalogCsvValues => f !== null);
  const unknownHeaders = headerCells.filter((_, i) => mapped[i] === null).map((h) => h.trim());

  const fileErrors: string[] = [];
  if (!fields.includes("name")) fileErrors.push('Missing required "name" column (aliases: subreddit, sub).');
  const dupes = fields.filter((f, i) => fields.indexOf(f) !== i);
  if (dupes.length) fileErrors.push(`Duplicate column(s): ${[...new Set(dupes)].join(", ")}`);
  if (fileErrors.length) {
    return { fields, unknownHeaders, rows: [], validCount: 0, errorCount: 0, fileErrors };
  }

  const seenNames = new Set<string>();
  const rows: CsvRowResult[] = grid.slice(1).map((cells, idx) => {
    const line = idx + 2;
    const candidate: Record<string, unknown> = {};
    mapped.forEach((field, col) => {
      if (!field) return;
      const coerced = coerceCell(field, cells[col] ?? "");
      if (coerced !== undefined) candidate[field] = coerced;
    });

    const parsed = CatalogCsvSchema.safeParse(candidate);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`);
      return { line, values: null, errors };
    }
    if (seenNames.has(parsed.data.name)) {
      return { line, values: null, errors: [`Duplicate name in file: ${parsed.data.name}`] };
    }
    seenNames.add(parsed.data.name);

    // Keep only the columns the CSV actually provided (plus name), so the
    // upsert never clobbers existing values with schema defaults.
    const payload: Partial<CatalogCsvValues> = {};
    for (const f of new Set<keyof CatalogCsvValues>([...fields, "name"])) {
      // @ts-expect-error — narrowing per-key assignment from the parsed record
      payload[f] = parsed.data[f];
    }
    return { line, values: payload, errors: [] };
  });

  return {
    fields,
    unknownHeaders,
    rows,
    validCount: rows.filter((r) => r.values).length,
    errorCount: rows.filter((r) => !r.values).length,
    fileErrors: [],
  };
}
