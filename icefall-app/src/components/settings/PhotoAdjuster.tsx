import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";
import { cropToDataUrl, prepareImage, type CropRect, type PreparedImage } from "@/lib/image";

/**
 * FRAMING A PHOTOGRAPH, INSTEAD OF BEING TOLD WHERE IT WAS CUT.
 *
 * Until this existed, choosing a profile photo uploaded it immediately and
 * `lib/image.ts` took the middle square. Every phone photo of a person is
 * portrait, so the middle square is a chest, and the head left through the top
 * of the circle. There was no control to fix it — the only remedy was to shoot
 * the picture again, framed for a crop you could not see. That is the gap the
 * owner's reviewer found ("make sure logo size is adjustable"), and the thing
 * that needed adjusting was the face.
 *
 * ── WHAT THIS IS AND IS NOT ──────────────────────────────────────────────────
 *
 * It is a step BETWEEN choosing a file and uploading one. It never touches the
 * server: it hands `onConfirm` a JPEG data URL of exactly the visible frame,
 * and the caller's existing upload, error and sync path takes it from there
 * unchanged. Cancelling hands back nothing, so the photo already on the
 * profile is not disturbed — which is why the file input is NOT read into
 * `settings.avatar` until this returns.
 *
 * ── WHY THE MASK IS A PROP ───────────────────────────────────────────────────
 *
 * The profile header edits two pictures, a circular avatar and a wide banner,
 * and the banner had the same problem in the other direction (`readBanner`
 * guessed a quarter down the frame because summits sit high — which is wrong
 * for every photograph taken FROM a summit). Hard-coding a circle would mean
 * writing this twice. So the shape, the aspect, the output size and the JPEG
 * quality are all arguments.
 *
 * BOTH PICTURES ARE NOW WIRED, in both places a profile can be edited: the
 * settings header (`screens/settings/Sections.tsx`, face and cover) and the
 * profile screen's own cover control (`screens/Profile.tsx`). Three call
 * sites, one component, and the differences between them are four props. If a
 * fourth surface ever wants a different shape, that is a prop too — never a
 * second cropper, because two croppers is two sets of gestures to learn and
 * two places for the crop to disagree with what was on screen.
 *
 * ── THE ONE GUARANTEE ────────────────────────────────────────────────────────
 *
 * The picture under the finger and the picture written to the canvas are the
 * same pixels — `prepareImage` decodes the file once and everything after
 * reads that one working canvas. So there is no orientation, colour or scaling
 * step that could happen to the stored copy and not to the preview. This is
 * also the whole of the EXIF answer: whichever way round the browser turned
 * the photograph, that is the way round it is framed, so a rotation this code
 * never inspects cannot surprise anybody after the fact.
 *
 * ── MOTION ───────────────────────────────────────────────────────────────────
 *
 * Direct manipulation has no animation to suppress: a drag must track the
 * finger exactly, and easing it would read as lag rather than polish. The only
 * motion here is Reset, which is a jump rather than a gesture and is eased so
 * the eye can follow where the picture went. `prefers-reduced-motion` removes
 * that one easing, and index.css already flattens the sheet's own rise.
 */

export type PhotoMask = "circle" | "rect";

/**
 * How far past 1:1 the zoom may go.
 *
 * `1` is the picture exactly filling the frame — it cannot go below that, or
 * the mask would show background through a corner. The ceiling is worked out
 * per photograph in `maxScale` below, from how many pixels the photograph
 * actually has: past that point every extra step is invented detail. These two
 * only bound that calculation, so the control is never useless on a small
 * photograph (floor) and nobody can zoom into porridge on a large one (cap).
 */
const ZOOM_FLOOR = 2;
const ZOOM_CAP = 5;

/** Arrow-key nudge, in screen pixels. Shift moves four times as far. */
const NUDGE_PX = 6;

interface View {
  /** Multiplier over the size at which the photo exactly fills the frame. */
  scale: number;
  /** The photo's centre, offset from the frame's centre, in screen pixels. */
  x: number;
  y: number;
}

const START: View = { scale: 1, x: 0, y: 0 };

interface Size {
  w: number;
  h: number;
}

export function PhotoAdjuster({
  file,
  title,
  mask,
  aspect,
  outputWidth,
  quality,
  confirmLabel = "Use photo",
  onCancel,
  onConfirm,
}: {
  /** The file just chosen. Opened here; never uploaded from here. */
  file: File;
  title: string;
  mask: PhotoMask;
  /** Width divided by height, for both the frame on screen and the output. */
  aspect: number;
  /** The stored picture's width in pixels; the height follows from `aspect`. */
  outputWidth: number;
  quality?: number;
  confirmLabel?: string;
  /** Leaves the existing picture exactly as it was. */
  onCancel: () => void;
  /** A JPEG data URL of the visible frame, at the output size. */
  onConfirm: (dataUrl: string) => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const hintId = useId();

  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(START);
  const [eased, setEased] = useState(false);

  const stage = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<Size>({ w: 0, h: 0 });

  const outputHeight = Math.max(1, Math.round(outputWidth / aspect));

  /* ---- Opening the file ------------------------------------------------- */

  useEffect(() => {
    let live = true;
    let opened: PreparedImage | null = null;

    void (async () => {
      try {
        const image = await prepareImage(file);
        opened = image;
        // Unmounting mid-decode would otherwise leak the object URL, which on
        // a phone is a whole downscaled photograph held for the session.
        if (!live) {
          image.release();
          return;
        }
        setPrepared(image);
        setView(START);
      } catch (e) {
        if (!live) return;
        setError((e as { message?: string }).message ?? "That image couldn't be used.");
      }
    })();

    return () => {
      live = false;
      opened?.release();
    };
  }, [file]);

  /* ---- How big the frame actually is ------------------------------------ */

  /*
   * MEASURED, NOT ASSUMED. The crop arithmetic converts between screen pixels
   * and image pixels, so a guessed frame width would put the stored square
   * somewhere other than where the mask showed it. The element is sized by CSS
   * — it has to be, to fit inside a sheet on a phone of any width — so the only
   * honest source for the number is the element itself.
   */
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const read = () => setFrame({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [prepared]);

  /* ---- The arithmetic ---------------------------------------------------- */

  const image: Size = { w: prepared?.width ?? 0, h: prepared?.height ?? 0 };
  const ready = prepared !== null && frame.w > 0 && frame.h > 0 && image.w > 0 && image.h > 0;

  /** Screen pixels per image pixel at zoom 1: the photo exactly covering. */
  const base = ready ? Math.max(frame.w / image.w, frame.h / image.h) : 0;

  /**
   * The zoom at which the frame is taking exactly as many image pixels as the
   * output has. Past it the canvas is enlarging, not sampling, and the result
   * gets soft — which is a real outcome the person can see and choose, so it
   * is allowed within the bounds above and said out loud below rather than
   * forbidden.
   */
  const nativeLimit = ready && base > 0 ? frame.w / (base * outputWidth) : ZOOM_FLOOR;
  const maxScale = Math.min(ZOOM_CAP, Math.max(ZOOM_FLOOR, nativeLimit));

  /** Keeps the photo covering the frame; there is no valid view where it does not. */
  const clamp = useCallback(
    (next: View): View => {
      if (!ready) return next;
      const scale = Math.min(maxScale, Math.max(1, next.scale));
      const spreadX = Math.max(0, (image.w * base * scale - frame.w) / 2);
      const spreadY = Math.max(0, (image.h * base * scale - frame.h) / 2);
      return {
        scale,
        x: Math.min(spreadX, Math.max(-spreadX, next.x)),
        y: Math.min(spreadY, Math.max(-spreadY, next.y)),
      };
    },
    [ready, maxScale, image.w, image.h, base, frame.w, frame.h],
  );

  /**
   * Zooms about a point rather than about the middle.
   *
   * Pinching about the frame's centre feels broken: the detail between your
   * fingers slides away as it grows. Holding the focal point still is one line
   * of algebra — the photo point under `focal` must land back on `focal` — and
   * it is the difference between a cropper that feels like a photo app and one
   * that feels like a slider. `focal` is measured from the frame's centre, so
   * passing `{x: 0, y: 0}` (what the slider does) is the ordinary centred zoom.
   */
  const clampAbout = useCallback(
    (v: View, focal: { x: number; y: number }, target: number, panX = 0, panY = 0): View => {
      const scale = Math.min(maxScale, Math.max(1, target));
      const k = v.scale > 0 ? scale / v.scale : 1;
      return clamp({
        scale,
        x: focal.x - (focal.x - v.x) * k + panX,
        y: focal.y - (focal.y - v.y) * k + panY,
      });
    },
    [clamp, maxScale],
  );

  const zoomAbout = useCallback(
    (focal: { x: number; y: number }, nextScale: number) => {
      setEased(false);
      setView((v) => clampAbout(v, focal, nextScale));
    },
    [clampAbout],
  );

  /** Client coordinates to coordinates measured from the frame's centre. */
  const toFrame = useCallback((clientX: number, clientY: number) => {
    const el = stage.current;
    if (!el) return { x: 0, y: 0 };
    const box = el.getBoundingClientRect();
    return { x: clientX - box.left - box.width / 2, y: clientY - box.top - box.height / 2 };
  }, []);

  /* ---- Touch and pointer ------------------------------------------------- */

  /*
   * Pointer events rather than touch events, because the same three handlers
   * then serve a finger, a mouse and a stylus, and because pointer capture
   * means a drag that leaves the frame keeps working instead of stopping dead
   * at the edge — which is precisely where somebody dragging a face upward
   * ends up.
   */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mid: { x: number; y: number } } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ready) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setEased(false);
    const both = [...pointers.current.values()];
    if (both.length >= 2) {
      const [a, b] = both;
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ready) return;
    const last = pointers.current.get(e.pointerId);
    if (!last) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const both = [...pointers.current.values()];

    if (both.length >= 2) {
      const [a, b] = both;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const was = pinch.current;
      pinch.current = { dist, mid };
      if (!was || was.dist <= 0) return;
      const focal = toFrame(mid.x, mid.y);
      // Two fingers do both jobs at once: the distance between them is the
      // zoom and the point between them is the pan, which is how every photo
      // app behaves and what a hand expects.
      setView((v) =>
        clampAbout(v, focal, v.scale * (dist / was.dist), mid.x - was.mid.x, mid.y - was.mid.y),
      );
      return;
    }

    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }));
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  /*
   * THE WHEEL LISTENER IS NATIVE ON PURPOSE. React attaches `onWheel` at the
   * root as a passive listener, so `preventDefault` inside a JSX handler is
   * ignored and the sheet scrolls away underneath while the picture zooms.
   * Registering it here with `passive: false` is the only way to stop that.
   */
  useEffect(() => {
    const el = stage.current;
    if (!el || !ready) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const focal = toFrame(e.clientX, e.clientY);
      setEased(false);
      // Exponential rather than additive, so one notch changes the picture by
      // the same PROPORTION at every zoom — additive steps crawl when zoomed
      // out and lurch when zoomed in. Read through the updater rather than
      // from `view`, so this listener is registered once instead of on every
      // frame of a trackpad glide.
      setView((v) => clampAbout(v, focal, v.scale * Math.exp(-e.deltaY * 0.0015)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ready, toFrame, clampAbout]);

  /* ---- Keyboard ---------------------------------------------------------- */

  /*
   * A cropper that only answers to a finger is a cropper somebody using a
   * keyboard cannot use at all — and unlike most controls there is no
   * equivalent elsewhere to fall back on. The zoom is a real range input
   * below, which is the honest control for a continuous value; the position
   * is the arrow keys here.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready) return;
    const step = e.shiftKey ? NUDGE_PX * 4 : NUDGE_PX;
    const move =
      e.key === "ArrowLeft"
        ? { x: -step, y: 0 }
        : e.key === "ArrowRight"
          ? { x: step, y: 0 }
          : e.key === "ArrowUp"
            ? { x: 0, y: -step }
            : e.key === "ArrowDown"
              ? { x: 0, y: step }
              : null;
    if (!move) return;
    e.preventDefault();
    setEased(false);
    setView((v) => clamp({ ...v, x: v.x + move.x, y: v.y + move.y }));
  };

  /* ---- Confirming -------------------------------------------------------- */

  /** The visible frame, expressed in the working image's own pixels. */
  const cropRect = (): CropRect | null => {
    if (!prepared || !ready) return null;
    const k = base * view.scale;
    if (k <= 0) return null;
    const shownW = image.w * k;
    const shownH = image.h * k;
    let sw = frame.w / k;
    let sh = frame.h / k;
    let sx = (shownW - frame.w) / 2 / k - view.x / k;
    let sy = (shownH - frame.h) / 2 / k - view.y / k;
    // `clamp` already guarantees this rectangle is inside the image; the two
    // lines below only absorb the last fraction of a pixel that float
    // arithmetic leaves behind, because drawing even 0.4px outside the source
    // fills that edge with transparency, which JPEG renders as a black hairline.
    sw = Math.min(sw, image.w);
    sh = Math.min(sh, image.h);
    sx = Math.min(Math.max(0, sx), image.w - sw);
    sy = Math.min(Math.max(0, sy), image.h - sh);
    return { sx, sy, sw, sh };
  };

  const confirm = () => {
    const rect = cropRect();
    if (!prepared || !rect) return;
    try {
      onConfirm(cropToDataUrl(prepared, rect, outputWidth, outputHeight, quality));
    } catch (e) {
      setError((e as { message?: string }).message ?? "That image couldn't be used.");
    }
  };

  const reset = () => {
    setEased(true);
    setView(START);
  };

  /* ---- Render ------------------------------------------------------------ */

  const soft = ready && view.scale > nativeLimit + 0.01;
  const zoomPct = Math.round(view.scale * 100);

  return (
    <Sheet title={title} onClose={onCancel}>
      <div className="py-4">
        {error !== null ? (
          <>
            <p className="text-[13px] leading-relaxed text-danger">{error}</p>
            <Button variant="secondary" size="md" className="mt-4 w-full" onClick={onCancel}>
              Close
            </Button>
          </>
        ) : (
          <>
            <div
              ref={stage}
              tabIndex={0}
              role="group"
              aria-label="Photo framing. Drag to move it, arrow keys to nudge it."
              aria-describedby={hintId}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
              onKeyDown={onKeyDown}
              className={cn(
                "relative mx-auto overflow-hidden bg-slate",
                // touch-action is what stops the sheet scrolling out from
                // under a finger that is dragging the photograph.
                "touch-none select-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60",
                "focus-visible:ring-offset-2 focus-visible:ring-offset-graphite",
                mask === "circle" ? "w-[264px] max-w-full rounded-full" : "w-full rounded-[10px]",
                ready ? "cursor-grab active:cursor-grabbing" : "cursor-default",
              )}
              style={{ aspectRatio: `${aspect}` }}
            >
              {prepared !== null && base > 0 && (
                <img
                  src={prepared.previewUrl}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className={cn(
                    "pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none",
                    eased && !reduce && "transition-transform duration-200 ease-out",
                  )}
                  style={{
                    width: image.w * base,
                    height: image.h * base,
                    transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                  }}
                />
              )}
              {prepared === null && (
                <span className="absolute inset-0 grid place-items-center text-[12px] text-mist-dim">
                  Opening the photo…
                </span>
              )}
            </div>

            <p id={hintId} className="mt-3 text-center text-[11.5px] leading-relaxed text-mist-dim">
              Drag the photo to move it, pinch or scroll to zoom. Only what is inside the frame is
              saved.
            </p>

            <div className="mt-4 flex items-center gap-3">
              <span className="shrink-0 text-[11.5px] text-mist">Zoom</span>
              <input
                type="range"
                min={100}
                max={Math.round(maxScale * 100)}
                step={1}
                value={Math.min(zoomPct, Math.round(maxScale * 100))}
                disabled={!ready}
                aria-label="Zoom"
                aria-valuetext={`${zoomPct} per cent`}
                onChange={(e) => zoomAbout({ x: 0, y: 0 }, Number(e.target.value) / 100)}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/[0.12] accent-azure disabled:opacity-40"
              />
              <button
                type="button"
                onClick={reset}
                disabled={!ready}
                aria-label="Reset framing"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:text-snow disabled:opacity-40"
              >
                <RotateCcw size={15} strokeWidth={1.7} aria-hidden />
              </button>
            </div>

            {/*
              THE STORED SIZE IS STATED, and it is a measured number rather than
              a reassurance: it is the exact width and height handed to the
              canvas. The softness line only appears once the zoom has actually
              passed the photograph's own detail, so it is never a warning about
              a problem that is not happening.
            */}
            <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
              Saved at {outputWidth} × {outputHeight} pixels.
              {soft && " Zoomed in further than this photo has detail for, so it will look soft."}
            </p>

            <div className="mt-5 flex gap-3">
              <Button variant="secondary" size="md" className="flex-1" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                disabled={!ready}
                onClick={confirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
