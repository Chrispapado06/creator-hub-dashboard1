/**
 * Media: what may be uploaded, and where it goes.
 *
 * Spec §18 requires type, size and dimensions to be validated BEFORE submission.
 * This module is that validation, and it is deliberately the same rules the
 * database enforces on `media_assets` — not a looser client-side approximation.
 * A client that accepts what the server will reject teaches an operator to
 * distrust the form; one that rejects what the server would accept quietly
 * removes a capability nobody decided to remove.
 *
 * WHAT THIS MODULE DOES NOT DO: upload anything. There is no Supabase project
 * yet, so a network call here would be a code path that cannot run and cannot be
 * tested while presenting itself as the working one — the §6c artefact. The
 * validator, the path builder and the review states are all real, testable and
 * useful today; the transfer is one function added later, and `MediaPanel` says
 * plainly that it is not connected rather than implying it is.
 */

import type { MediaKind } from "./types";

/* -------------------------------------------------------------------------- */
/* The rules, mirroring the shipped constraints exactly                        */
/* -------------------------------------------------------------------------- */

/**
 * An ALLOWLIST, not a blocklist.
 *
 * Note the absence of `image/svg+xml`. An operator wanting to upload an SVG logo
 * is entirely reasonable and it is also a script-execution vector to serve, so
 * it is absent here and must stay absent. Adding it back is a security decision,
 * not a convenience one.
 */
export const MEDIA_RULES: Record<
  MediaKind,
  { mimeTypes: readonly string[]; maxBytes: number; minWidthPx?: number; minHeightPx?: number }
> = {
  image: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    maxBytes: 12 * 1024 * 1024,
    // A listing photograph is rendered wide on a phone and wider on the web. A
    // 400px image is not "slightly soft", it is unusable, and catching it here
    // saves a review round trip.
    minWidthPx: 1200,
    minHeightPx: 800,
  },
  video: { mimeTypes: ["video/mp4", "video/webm"], maxBytes: 200 * 1024 * 1024 },
  document: {
    mimeTypes: ["application/pdf", "image/jpeg", "image/png"],
    maxBytes: 20 * 1024 * 1024,
  },
};

const KIND_LABEL: Record<MediaKind, string> = {
  image: "photograph",
  video: "video",
  document: "document",
};

/* -------------------------------------------------------------------------- */
/* The storage path                                                            */
/* -------------------------------------------------------------------------- */

/**
 * `<company_id>/<company|product_id>/<filename>` in the private `operator-media`
 * bucket.
 *
 * THE COMPANY ID COMES FIRST AND THAT ORDERING IS LOAD-BEARING. A storage policy
 * can only see the object's path, so the path has to carry the authorization key
 * somewhere a policy can read it. Put the product first and the policy has
 * nothing to match on.
 *
 * The database enforces the same shape —
 * `check (storage_path like company_id || '/%')` — so a bug in this function
 * becomes a rejected insert rather than a cross-company write.
 */
export function storagePathFor(args: {
  companyId: string;
  ownerId: string;
  fileName: string;
}): string {
  return `${args.companyId}/${args.ownerId}/${safeFileName(args.fileName)}`;
}

/**
 * A filename that cannot climb out of its folder or collide by accident.
 *
 * `../` in a name would defeat the whole path convention, so separators and dots
 * are collapsed rather than escaped — there is no legitimate operator filename
 * that needs them.
 */
export function safeFileName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const dot = trimmed.lastIndexOf(".");
  const stem = (dot > 0 ? trimmed.slice(0, dot) : trimmed)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const ext = (dot > 0 ? trimmed.slice(dot + 1) : "").replace(/[^a-z0-9]/g, "").slice(0, 8);
  const base = stem || "file";
  return ext ? `${base}.${ext}` : base;
}

/** Is this path inside that company's folder? The check the database also makes. */
export const pathIsInCompanyFolder = (path: string, companyId: string): boolean =>
  path.startsWith(`${companyId}/`);

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export interface CandidateFile {
  name: string;
  mimeType: string;
  byteSize: number;
  widthPx?: number | null;
  heightPx?: number | null;
}

export interface MediaProblem {
  /** Rendered to the operator as-is. Says what is wrong AND what to do. */
  message: string;
  field: "type" | "size" | "dimensions" | "name";
}

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/**
 * Every problem at once, not the first one.
 *
 * An operator who fixes the file type only to be told the size is wrong, then
 * the dimensions, has been made to do three round trips for one decision.
 */
export function validateFile(kind: MediaKind, file: CandidateFile): MediaProblem[] {
  const rules = MEDIA_RULES[kind];
  const problems: MediaProblem[] = [];

  if (!rules.mimeTypes.includes(file.mimeType)) {
    const accepted = rules.mimeTypes.map((m) => m.split("/")[1].toUpperCase()).join(", ");
    problems.push({
      field: "type",
      message:
        file.mimeType === "image/svg+xml"
          ? "SVG cannot be used for a listing image. Export it as a PNG or WebP at 1200 px wide or more."
          : `That is not a file type Icefall can publish as a ${KIND_LABEL[kind]}. Accepted: ${accepted}.`,
    });
  }

  if (file.byteSize <= 0) {
    problems.push({ field: "size", message: "That file appears to be empty." });
  } else if (file.byteSize > rules.maxBytes) {
    problems.push({
      field: "size",
      message: `That file is ${mb(file.byteSize)}. The limit for a ${KIND_LABEL[kind]} is ${mb(rules.maxBytes)}.`,
    });
  }

  // Dimensions are only knowable for an image, and only checked when the caller
  // has actually measured them. An unmeasured image is not a failed one.
  if (kind === "image" && rules.minWidthPx && rules.minHeightPx) {
    const w = file.widthPx ?? null;
    const h = file.heightPx ?? null;
    if (w !== null && h !== null && (w < rules.minWidthPx || h < rules.minHeightPx)) {
      problems.push({
        field: "dimensions",
        message: `That image is ${w}×${h}. Listing photographs need to be at least ${rules.minWidthPx}×${rules.minHeightPx} — smaller ones look soft on a phone.`,
      });
    }
  }

  if (!file.name.trim()) {
    problems.push({ field: "name", message: "That file has no name." });
  }

  return problems;
}

export const isAcceptable = (kind: MediaKind, file: CandidateFile): boolean =>
  validateFile(kind, file).length === 0;

/** The `accept` attribute for a file input, from the same allowlist. */
export const acceptAttribute = (kind: MediaKind): string => MEDIA_RULES[kind].mimeTypes.join(",");

/* -------------------------------------------------------------------------- */
/* Attribution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What still stands between an asset and publication.
 *
 * `media_approved_is_attributed` refuses to approve a photograph with no licence
 * and no credit, so an operator who uploads without them has done work that
 * cannot be published and has not been told why. Surfacing it at upload turns a
 * silent rejection into a form field.
 */
export function missingForApproval(asset: {
  licence: string | null;
  credit: string | null;
  mimeType: string | null;
  byteSize: number | null;
}): string[] {
  const missing: string[] = [];
  if (!asset.licence?.trim()) missing.push("a licence");
  if (!asset.credit?.trim()) missing.push("a credit");
  if (!asset.mimeType || asset.byteSize === null) missing.push("a readable file type and size");
  return missing;
}
