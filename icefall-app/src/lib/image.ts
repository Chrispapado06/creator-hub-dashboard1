/**
 * Taking a photo from the device and making it small enough to keep.
 *
 * Every profile photo lives in localStorage FIRST — which holds roughly 5 MB
 * for the WHOLE app, shared with every activity, goal and setting. A modern
 * phone photo is 3–8 MB before encoding and about a third larger again as a
 * data URL, so storing one raw would fill the quota and start silently
 * dropping the athlete's training history.
 *
 * So every image is redrawn through a canvas at avatar size and re-encoded as
 * JPEG, and `MAX_STORED_BYTES` refuses anything that still comes out too big.
 *
 * A photograph does also leave the phone now — `settings/sync.ts` decodes the
 * same data URL into a blob and uploads it to the `profile-media` bucket — and
 * this file predates that, so an earlier version of this note said flatly that
 * there was no upload server. Having one does not relax anything here: the
 * local copy is still what the app draws offline and still a data URL in
 * localStorage, so that budget remains the binding constraint and it is what
 * decides the sizes below, not the bucket's far larger limits.
 */

/**
 * Square, because every place an avatar appears is a circle.
 *
 * WHY THIS IS 512 AND WAS 256. The old note here claimed 256 was "more
 * resolution than any avatar in the app renders at". That was true only in CSS
 * pixels. The profile header draws the avatar at 104 px (`screens/Profile.tsx`),
 * and the owner tests on a real iPhone at device-pixel-ratio 3 — 312 actual
 * pixels, half again more than the stored square had. The face was being
 * resampled upward on the one screen it is largest on, which is a poor way to
 * repay somebody who has just framed it by hand.
 *
 * 512 covers that render to beyond 4x and costs what the budget can pay. Run
 * through this very file in the browser, the app's own mountain photographs —
 * the densest detail anything here will meet, and far denser than a face —
 * come out at 59 KB (ama-dablam), 75 KB (cho-oyu), 112 KB (k2) and 126 KB
 * (toubkal-1) of data URL, the worst of them 31% of the 400 KB ceiling below.
 *
 * Going further is where that stops being comfortable: JPEG bytes track pixel
 * count, so 1024 would put that worst case near the ceiling and somebody would
 * be told their photograph was too big — for a sharpness no screen in this app
 * can show. `MAX_STORED_BYTES` is the guard either way, but a guard that fires
 * is a person who cannot set their picture, so the size is chosen to stay well
 * clear of it rather than to lean on it.
 */
export const AVATAR_PX = 512;

/**
 * The profile banner: wide, and only as tall as it is drawn.
 *
 * 1024×384 is 8:3, which matches the header's aspect, and re-encodes to roughly
 * 60–120 KB — affordable in the same localStorage budget the avatar shares,
 * because it is stored once and never per-activity.
 */
export const BANNER_W = 1024;
export const BANNER_H = 384;

/**
 * The JPEG rate a banner is stored at, and why it is not the avatar's 0.82.
 *
 * A banner is four times the area of an avatar out of the same localStorage
 * budget, and it is scenery seen behind a gradient rather than a face somebody
 * looks at. 0.78 is the number `readBanner` below has always used; it is named
 * here because `PhotoAdjuster` now encodes the banner instead, in two separate
 * screens, and the same number typed three times is a number that will one day
 * be three different numbers.
 */
export const BANNER_QUALITY = 0.78;

/** Above this, the result is refused rather than quietly filling the quota. */
export const MAX_STORED_BYTES = 400_000;

export interface ImageError {
  reason: "not-an-image" | "unreadable" | "too-large" | "heic";
  message: string;
}

const MESSAGES: Record<ImageError["reason"], string> = {
  "not-an-image": "That file isn't an image.",
  unreadable: "That image couldn't be read. Try a different one.",
  "too-large": "That image is too big to store on this device. Try a smaller one.",
  /*
   * HEIC IS ITS OWN SENTENCE BECAUSE IT IS NOT THE PERSON'S MISTAKE.
   *
   * An iPhone shoots HEIC by default. Picking one out of Photos usually hands
   * the browser a JPEG, because iOS transcodes on the way out of the picker —
   * but picking the same photograph out of Files, or opening ICEFALL in a
   * desktop browser, hands over the raw .heic, and no browser engine decodes
   * it. Folding that into "couldn't be read" would send somebody hunting for a
   * corrupt file that is perfectly fine, so it says what actually happened and
   * what works instead.
   */
  heic: "This browser can't open HEIC photos. Pick the photo from your camera roll rather than Files, or save a JPEG copy of it first.",
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
 * The same treatment for a wide picture, cropped without being asked.
 *
 * Cropped to the banner's aspect from the CENTRE-TOP rather than the middle:
 * people photograph mountains with the sky in the upper half and the summit
 * near the top third, and a centre crop cuts the peak off.
 *
 * NO PROFILE BANNER COMES THROUGH HERE ANY MORE. Both places a cover photo can
 * be set — the settings header and the profile screen's own "…" menu — open
 * `PhotoAdjuster` instead, because the guess above is exactly backwards for a
 * photograph taken FROM a summit, where the ridge is along the bottom, and
 * there was no way to say so. What still calls this is the post and summit-log
 * composers, whose pictures are not profile pictures; the guess is unchanged
 * for them, and wiring them to the adjuster is the same four props if somebody
 * decides it should be.
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

        const dataUrl = canvas.toDataURL("image/jpeg", BANNER_QUALITY);
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

/* -------------------------------------------------------------------------- */
/* Adjusting the crop instead of accepting it                                  */
/* -------------------------------------------------------------------------- */

/**
 * WHY THE CENTRE CROP ABOVE WAS NOT ENOUGH.
 *
 * `readAvatar` takes the middle square of whatever it is handed. For a photo
 * shot in portrait — which is every photo a phone takes of a person — the
 * middle square is the chest, and the head leaves through the top of the
 * circle. The only remedy anybody had was to shoot the picture again, framed
 * for a cropper they could not see. The owner's reviewer asked for the size to
 * be adjustable; the thing that needed adjusting was the face.
 *
 * The three functions below are the parts an adjuster needs, and they are here
 * rather than in the component because the budget they answer to lives here:
 * `MAX_STORED_BYTES`, and the localStorage quota it protects.
 *
 * THE ONE PROPERTY THAT MATTERS: the file is decoded ONCE, into a working
 * canvas, and both the picture the person drags around and the square that
 * finally gets stored are drawn from those same pixels. There is no second
 * decode in between that could orient, scale or colour-manage it differently,
 * so what they framed is what everybody else sees. It is also what makes the
 * EXIF question moot rather than answered: whichever way round the decoder
 * turned the photograph, that is the way round they see it while framing it.
 */

/**
 * The long edge of the working copy the adjuster manipulates.
 *
 * A recent iPhone photo is 8064 px on the long edge. Holding one as a live
 * `<img>` under a CSS transform while a finger drags it is exactly what makes
 * a cropper stutter on a phone, and every pixel past what the output needs is
 * spent on heat. 1600 is chosen against `AVATAR_PX` and the zoom ceiling in
 * `PhotoAdjuster`: for a phone photograph — portrait, so about 1200×1600 once
 * shrunk — the tightest crop the adjuster permits still takes about as many
 * pixels as `AVATAR_PX` stores, because that ceiling is worked out from the
 * photograph's own detail rather than fixed. So this downscale costs nothing
 * that could be seen. It is NOT a quality ceiling on the stored picture — the
 * output size is.
 *
 * (A SMALL source is the one case where the adjuster does let somebody zoom
 * past the detail they have: `ZOOM_FLOOR` keeps the control usable on a
 * 600 px photograph rather than seizing at 1.2x. That is not hidden — the
 * adjuster says the result will look soft once the zoom actually passes what
 * the photograph holds.)
 */
export const WORK_PX = 1600;

/** A decoded, oriented, downscaled photograph, ready to be framed. */
export interface PreparedImage {
  /** The working pixels. Both the preview and the crop are drawn from these. */
  readonly canvas: HTMLCanvasElement;
  /** Working size, in pixels — after the downscale, not the file's own size. */
  readonly width: number;
  readonly height: number;
  /** The same pixels as an object URL, for the `<img>` the person drags. */
  readonly previewUrl: string;
  /** Frees `previewUrl`. Idempotent, so an unmount race cannot double-revoke. */
  release(): void;
}

/** Where in the working image the visible frame sits, in working pixels. */
export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const HEIC_TYPE = /^image\/(heic|heif|heic-sequence|heif-sequence)$/i;
const HEIC_NAME = /\.(heic|heif)$/i;

/** A file no browser engine decodes, named so the message can say so. */
function isHeic(file: File): boolean {
  return HEIC_TYPE.test(file.type) || HEIC_NAME.test(file.name);
}

interface Decoded {
  draw: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

/**
 * File to pixels, with the rotation the camera recorded already applied.
 *
 * `createImageBitmap(file, { imageOrientation: "from-image" })` is the only way
 * to ASK for the EXIF rotation rather than hope for it, so it is tried first.
 * The `<img>` fallback below is not a lesser path by much — every current
 * engine defaults `image-orientation` to `from-image` for HTML images — but it
 * is a default rather than a request, and Safari has shipped
 * `createImageBitmap` without understanding the options bag before now and
 * throws instead of ignoring what it does not know. Hence the try, and hence
 * the fallback rather than a refusal.
 */
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        draw: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      /* Fall through to the <img> path; this is not the failure, only a
         browser that could not take the instruction. */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("undecodable"));
      el.src = url;
    });
    // Revoking is safe the moment it has loaded: the pixels are decoded and
    // held by the element, and nothing below re-fetches the URL.
    return {
      draw: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => undefined,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The working pixels as a blob URL, which is far cheaper to hold than base64. */
function previewUrlFor(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(URL.createObjectURL(blob));
        else reject(fail("unreadable"));
      },
      "image/jpeg",
      0.92,
    );
  });
}

/**
 * Opens a chosen file for framing. Rejects with an `ImageError`, same as the
 * readers above, so one `catch` in the caller covers both paths.
 */
export async function prepareImage(file: File, work = WORK_PX): Promise<PreparedImage> {
  const heic = isHeic(file);
  // A .heic from the Files app can arrive with an empty `type`, so the HEIC
  // check comes first — otherwise it would be reported as "not an image",
  // which is both wrong and useless.
  if (!heic && !file.type.startsWith("image/")) throw fail("not-an-image");

  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw fail(heic ? "heic" : "unreadable");
  }

  const { draw, width, height, close } = decoded;
  try {
    if (width < 1 || height < 1) throw fail(heic ? "heic" : "unreadable");

    const shrink = Math.min(1, work / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * shrink));
    canvas.height = Math.max(1, Math.round(height * shrink));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw fail("unreadable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(draw, 0, 0, canvas.width, canvas.height);

    const previewUrl = await previewUrlFor(canvas);
    let released = false;
    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      previewUrl,
      release() {
        if (released) return;
        released = true;
        URL.revokeObjectURL(previewUrl);
      },
    };
  } finally {
    close();
  }
}

/**
 * The framed rectangle, redrawn at the size it is stored at.
 *
 * The rectangle is expected to lie inside the working image — `PhotoAdjuster`
 * clamps it there, because letting it hang over the edge would fill the gap
 * with transparency, which JPEG turns black. Nothing here re-checks that: a
 * silent correction would move the crop away from what the person framed, and
 * this function's entire job is to not do that.
 */
export function cropToDataUrl(
  prepared: PreparedImage,
  rect: CropRect,
  outW: number,
  outH: number,
  quality = 0.82,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw fail("unreadable");

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(prepared.canvas, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, outW, outH);

  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  // The same ceiling the two readers above answer to, for the same reason: one
  // oversized picture in localStorage evicts an athlete's training history.
  if (dataUrl.length > MAX_STORED_BYTES) throw fail("too-large");
  return dataUrl;
}
