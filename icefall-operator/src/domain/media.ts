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
  {
    mimeTypes: readonly string[];
    maxBytes: number;
    minWidthPx?: number;
    minHeightPx?: number;
    /**
     * The furthest from square a mark may be, longer side ÷ shorter side.
     * Only set for `logo`; see the note on that entry.
     */
    maxAspectRatio?: number;
  }
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
  /**
   * A COMPANY MARK, WHICH IS NOT A PHOTOGRAPH.
   *
   * This kind exists because `image`'s rules are wrong for a logo in all three
   * dimensions, and applying them would have refused ordinary, correct files.
   *
   * NO `image/svg+xml`, AND THAT IS THE SECURITY DECISION, NOT A GAP. An SVG is
   * a script-carrying document — it can hold `<script>`, event handlers and
   * external references, and it executes when served same-origin. An operator
   * upload is UNTRUSTED INPUT: it arrives from outside ICEFALL and is then shown
   * to climbers on ICEFALL's own pages. `icefall-web` bundles `.svg` marks for
   * its own seed companies, but those are build-time content the team wrote;
   * they are not a precedent for accepting one over a form. AVIF is out too, for
   * a duller reason: a mark gains nothing from it and PNG/WebP are universal.
   */
  logo: {
    mimeTypes: ["image/png", "image/webp", "image/jpeg"],
    // 2 MB. A mark is flat colour and small; the photograph's 12 MB ceiling is
    // sized for a 6000px camera file and would wave through an unexported
    // master that then has to be rejected by a human.
    maxBytes: 2 * 1024 * 1024,
    /**
     * 256, and the number is reasoned rather than round.
     *
     * The largest slot a logo lands in today is the 64 CSS px tile on the
     * company profile. At a 3× device pixel ratio that tile needs 192 real
     * pixels, so 256 clears the biggest current use with headroom for a larger
     * one later. It is also low enough that the ordinary square exports
     * operators actually have — 256, 320, 512 — pass untouched, which the
     * photograph's 1200×800 floor would not.
     */
    minWidthPx: 256,
    minHeightPx: 256,
    /**
     * 2, so a horizontal wordmark is fine and a banner is not.
     *
     * The logo is drawn in a small, roughly square slot above the company name
     * on every trip. A 6:1 strip put in that slot is either squashed or shrunk
     * to an illegible sliver — neither is the operator's design, and both look
     * like ICEFALL broke their brand. 2:1 accepts the common
     * mark-beside-wordmark lockup and refuses the letterhead.
     */
    maxAspectRatio: 2,
  },
  video: { mimeTypes: ["video/mp4", "video/webm"], maxBytes: 200 * 1024 * 1024 },
  document: {
    mimeTypes: ["application/pdf", "image/jpeg", "image/png"],
    maxBytes: 20 * 1024 * 1024,
  },
};

const KIND_LABEL: Record<MediaKind, string> = {
  image: "photograph",
  logo: "logo",
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
  /**
   * `aspect` is its own field rather than a second `dimensions` problem so that
   * a file which is both too small AND too wide reports both lines, each with
   * its own key, instead of one silently overwriting the other.
   */
  field: "type" | "size" | "dimensions" | "aspect" | "name";
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
    // The SVG sentence is separate because "not an accepted type" reads as an
    // oversight to someone holding the file every design tool exports by
    // default. Saying it will not be accepted, and giving the export that will,
    // is the difference between a refusal and a support email.
    const svgSentence =
      kind === "logo"
        ? `Icefall cannot accept an SVG logo — an uploaded SVG can carry scripts, so it is refused rather than published. Export the same mark as a PNG or WebP at ${rules.minWidthPx} px or more on its shortest side.`
        : "SVG cannot be used for a listing image. Export it as a PNG or WebP at 1200 px wide or more.";
    problems.push({
      field: "type",
      message:
        file.mimeType === "image/svg+xml"
          ? svgSentence
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

  // Dimensions are only knowable for a raster image, and only checked when the
  // caller has actually measured them. An unmeasured image is not a failed one.
  const w = file.widthPx ?? null;
  const h = file.heightPx ?? null;
  const measured = w !== null && h !== null && w > 0 && h > 0;

  if ((kind === "image" || kind === "logo") && rules.minWidthPx && rules.minHeightPx) {
    if (measured && (w < rules.minWidthPx || h < rules.minHeightPx)) {
      problems.push({
        field: "dimensions",
        message:
          kind === "logo"
            ? `That logo is ${w}×${h}. A mark needs to be at least ${rules.minWidthPx}×${rules.minHeightPx} — below that it blurs on a high-resolution screen. Export it again at a larger size; it does not need to be redrawn.`
            : `That image is ${w}×${h}. Listing photographs need to be at least ${rules.minWidthPx}×${rules.minHeightPx} — smaller ones look soft on a phone.`,
      });
    }
  }

  // Shape, reported ALONGSIDE the other problems rather than instead of them.
  // A wordmark is a legitimate logo, so this is not "wrong file" — it says what
  // the slot is and what will happen, in a sentence the operator can act on.
  if (rules.maxAspectRatio && measured) {
    const ratio = Math.max(w, h) / Math.min(w, h);
    if (ratio > rules.maxAspectRatio) {
      problems.push({
        field: "aspect",
        message: `That mark is ${w}×${h}, about ${ratio.toFixed(1)}:1. Your logo is shown in a small, roughly square slot above your company name, and a shape that long is squashed or shrunk to a sliver there. Send a squarer lockup — up to ${rules.maxAspectRatio}:1 — or leave this empty and climbers see your initials.`,
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
