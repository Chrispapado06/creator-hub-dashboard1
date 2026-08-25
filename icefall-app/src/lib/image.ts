/**
 * Taking a photo from the device and making it small enough to keep.
 *
 * ICEFALL has no upload server, so a profile photo has to live in
 * localStorage — which holds roughly 5 MB for the WHOLE app, shared with every
 * activity, goal and setting. A modern phone photo is 3–8 MB before encoding
 * and about a third larger again as a data URL, so storing one raw would fill
 * the quota and start silently dropping the athlete's training history.
 *
 * So every image is redrawn through a canvas at avatar size and re-encoded as
 * JPEG. A 256 px square lands at 15–40 KB, which is affordable, and is more
 * resolution than any avatar in the app renders at.
 */

/** Square, because every place an avatar appears is a circle. */
export const AVATAR_PX = 256;

/**
 * The profile banner: wide, and only as tall as it is drawn.
 *
 * 1024×384 is 8:3, which matches the header's aspect, and re-encodes to roughly
 * 60–120 KB — affordable in the same localStorage budget the avatar shares,
 * because it is stored once and never per-activity.
 */
export const BANNER_W = 1024;
export const BANNER_H = 384;

/** Above this, the result is refused rather than quietly filling the quota. */
export const MAX_STORED_BYTES = 400_000;

export interface ImageError {
  reason: "not-an-image" | "unreadable" | "too-large";
  message: string;
}

const MESSAGES: Record<ImageError["reason"], string> = {
  "not-an-image": "That file isn't an image.",
  unreadable: "That image couldn't be read. Try a different one.",
  "too-large": "That image is too big to store on this device. Try a smaller one.",
};

const fail = (reason: ImageError["reason"]): ImageError => ({ reason, message: MESSAGES[reason] });

/**
 * Reads a file, crops it square from the centre, scales it to `size`, and
 * returns a JPEG data URL.
 *
 * Centre-crop rather than letterbox: an avatar is always drawn in a circle, so
 * bars at the edges would be visible as gaps in the ring.
 */
export function readAvatar(file: File, size = AVATAR_PX): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(fail("not-an-image"));
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(fail("unreadable"));
          return;
        }

        // Centre square of the source, whichever way round the photo is.
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;

        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

        // 0.82 is the point where a face at 256 px stops gaining visibly and
        // the file starts growing quickly.
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        if (dataUrl.length > MAX_STORED_BYTES) {
          reject(fail("too-large"));
          return;
        }
        resolve(dataUrl);
      } catch {
        reject(fail("unreadable"));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(fail("unreadable"));
    };

    img.src = url;
  });
}

/**
 * The same treatment for a wide profile banner.
 *
 * Cropped to the banner's aspect from the CENTRE-TOP rather than the middle:
 * people photograph mountains with the sky in the upper half and the summit
 * near the top third, and a centre crop cuts the peak off.
 */
export function readBanner(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(fail("not-an-image"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = BANNER_W;
        canvas.height = BANNER_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(fail("unreadable"));
          return;
        }

        const targetRatio = BANNER_W / BANNER_H;
        const sourceRatio = img.naturalWidth / img.naturalHeight;
        let sw = img.naturalWidth;
        let sh = img.naturalHeight;
        if (sourceRatio > targetRatio) {
          sw = img.naturalHeight * targetRatio;
        } else {
          sh = img.naturalWidth / targetRatio;
        }
        const sx = (img.naturalWidth - sw) / 2;
        // A quarter down rather than half: keeps ridgelines and summits in frame.
        const sy = Math.min((img.naturalHeight - sh) / 2, img.naturalHeight * 0.25);

        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, BANNER_W, BANNER_H);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
        if (dataUrl.length > MAX_STORED_BYTES) {
          reject(fail("too-large"));
          return;
        }
        resolve(dataUrl);
      } catch {
        reject(fail("unreadable"));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(fail("unreadable"));
    };

    img.src = url;
  });
}
