/**
 * The one way a picture goes into `group-media`.
 *
 * Structure plan R13 and slice S3. A phone photo usually carries the GPS
 * position it was taken at, and group chat used to upload the raw file, so
 * that position reached every member of the group. Now every picture is:
 *
 *   1. decoded and redrawn through `prepareImage` (`lib/image.ts`), at most
 *      1600 px on the long edge, and saved again as a JPEG;
 *   2. stripped of any metadata segment the browser's encoder added
 *      (`jpegMetadata.ts`), so the result does not depend on one browser;
 *   3. checked, and REFUSED if any metadata is still there or the bytes cannot
 *      be read as a JPEG.
 *
 * Only a `CleanGroupImage` can be uploaded, and only `prepareGroupImage` can
 * make one. `test:groups-media-location` checks that no other code uploads to
 * this bucket.
 *
 * Steps 2 and 3 are pure and run under node. Step 1 needs a canvas, so the
 * test swaps in its own encoder.
 */
import { prepareImage, WORK_PX } from "@/lib/image";

import { jpegCarriesMetadata, stripJpegMetadata } from "./jpegMetadata";

/**
 * Private; reads are gated on membership, and the path is
 * `<group_id>/<uploader_uid>/<file>` (20260902220000). Both leading segments
 * are matched by the storage policies.
 */
export const GROUP_MEDIA_BUCKET = "group-media";

/** `storage.buckets.file_size_limit` for `group-media`, to the byte. */
export const GROUP_MEDIA_MAX_BYTES = 26_214_400;

/** Long edge of a group picture, in pixels. */
export const GROUP_IMAGE_EDGE_PX = WORK_PX;

/** JPEG quality for the re-saved picture. */
export const GROUP_IMAGE_QUALITY = 0.86;

/** What an encoder hands back: JPEG bytes and the size it drew. */
export interface EncodedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export type GroupImageEncoder = (file: File) => Promise<EncodedImage>;

/** Written to `media_meta`. Every field was measured from the uploaded bytes. */
export interface GroupImageMeta {
  kind: "image";
  mime: "image/jpeg";
  bytes: number;
  width: number;
  height: number;
}

const CLEANED = Symbol("clean-group-image");

/** A picture that has been re-saved and checked. Only this module makes one. */
export interface CleanGroupImage {
  readonly [CLEANED]: true;
  readonly blob: Blob;
  readonly meta: GroupImageMeta;
}

export type GroupImageRefusal = "not-an-image" | "heic" | "unreadable" | "not-clean" | "too-large";

/** One sentence each. */
export const GROUP_IMAGE_MESSAGES: Record<GroupImageRefusal, string> = {
  "not-an-image": "Only pictures can go in a group message, so nothing was sent.",
  heic: "This browser can't open HEIC photos, so nothing was sent; pick the photo from your camera roll or save a JPEG copy first.",
  unreadable: "That picture couldn't be read, so nothing was sent.",
  "not-clean": "That picture couldn't be re-saved without its location and camera details, so nothing was sent.",
  "too-large": "That picture is still over 25MB after being re-saved, so nothing was sent.",
};

export type PreparedGroupImage =
  | { ok: true; image: CleanGroupImage }
  | { ok: false; reason: GroupImageRefusal; message: string };

const refuse = (reason: GroupImageRefusal): PreparedGroupImage => ({
  ok: false,
  reason,
  message: GROUP_IMAGE_MESSAGES[reason],
});

/** A picture by its type, or a HEIC by its name (Files can hand one over with no type). */
export function isPictureFile(file: File): boolean {
  return file.type.toLowerCase().startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
}

/** The browser encoder: `prepareImage`, then a JPEG from a canvas. */
export async function encodeThroughCanvas(file: File): Promise<EncodedImage> {
  const prepared = await prepareImage(file, GROUP_IMAGE_EDGE_PX);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = prepared.width;
    canvas.height = prepared.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw { reason: "unreadable" };
    // JPEG has no transparency, and a transparent pixel would come out black.
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(prepared.canvas, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", GROUP_IMAGE_QUALITY),
    );
    if (!blob) throw { reason: "unreadable" };
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  } finally {
    prepared.release();
  }
}

/**
 * Re-save, strip and check one picture. Nothing touches the network here.
 * `encode` and `strip` are swapped only by the test: the encoder because a
 * canvas cannot run under node, the stripper to prove the check refuses on
 * its own.
 */
export async function prepareGroupImage(
  file: File,
  encode: GroupImageEncoder = encodeThroughCanvas,
  strip: (bytes: Uint8Array) => Uint8Array | null = stripJpegMetadata,
): Promise<PreparedGroupImage> {
  if (!isPictureFile(file)) return refuse("not-an-image");

  let encoded: EncodedImage;
  try {
    encoded = await encode(file);
  } catch (error) {
    const reason = (error as { reason?: unknown } | null)?.reason;
    return refuse(reason === "heic" ? "heic" : reason === "not-an-image" ? "not-an-image" : "unreadable");
  }

  const { width, height } = encoded;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return refuse("unreadable");
  }

  const stripped = strip(encoded.bytes);
  // The refusal the plan asks for: if anything survived, or the bytes are not
  // a JPEG this module can follow, nothing is uploaded.
  if (!stripped || jpegCarriesMetadata(stripped)) return refuse("not-clean");
  if (stripped.byteLength > GROUP_MEDIA_MAX_BYTES) return refuse("too-large");

  const blob = new Blob([stripped as Uint8Array<ArrayBuffer>], { type: "image/jpeg" });
  return {
    ok: true,
    image: {
      [CLEANED]: true,
      blob,
      meta: { kind: "image", mime: "image/jpeg", bytes: blob.size, width, height },
    },
  };
}

/** The part of a storage client this module uses. A Supabase client fits it. */
export interface GroupMediaStorage {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Blob,
        options: { contentType: string; upsert: boolean },
      ): PromiseLike<{ error: unknown }>;
    };
  };
}

export type GroupImageUpload = { ok: true; path: string; meta: GroupImageMeta } | { ok: false };

/**
 * Upload a checked picture to `<group_id>/<uid>/<random>.jpg`. A random name
 * cannot collide, cannot add a path segment, and does not leak what the file
 * was called on the phone.
 */
export async function uploadGroupImage(
  client: GroupMediaStorage,
  groupId: string,
  uid: string,
  image: CleanGroupImage,
): Promise<GroupImageUpload> {
  const path = `${groupId}/${uid}/${crypto.randomUUID()}.jpg`;
  const { error } = await client.storage
    .from(GROUP_MEDIA_BUCKET)
    .upload(path, image.blob, { contentType: "image/jpeg", upsert: false });
  if (error) return { ok: false };
  return { ok: true, path, meta: image.meta };
}
