import { useRef, useState, type ReactNode } from "react";

/**
 * Wraps media (image/video/embed) in a width-constrained box with drag handles
 * on both edges. Reports the new pixel width on release; double-click a handle
 * resets to natural width. Handles only render when `editable`.
 */
export function ResizableFrame({
  width,
  onResize,
  editable,
  children,
}: {
  width?: number | null;
  onResize: (width: number | null) => void;
  editable: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);
  const [live, setLive] = useState<number | null>(null);
  const w = live ?? width ?? null;

  function startDrag(e: React.PointerEvent, side: "left" | "right") {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = ref.current?.offsetWidth ?? 0;
    const maxW = ref.current?.parentElement?.offsetWidth ?? 9999;

    const move = (ev: PointerEvent) => {
      const delta = side === "right" ? ev.clientX - startX : startX - ev.clientX;
      const next = Math.max(120, Math.min(maxW, startW + delta));
      last.current = next;
      setLive(next);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (last.current != null) onResize(Math.round(last.current));
      last.current = null;
      setLive(null);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  return (
    <div
      ref={ref}
      className={"resizable-frame" + (w != null ? " has-width" : "")}
      style={{ width: w ? `${w}px` : undefined, maxWidth: "100%" }}
    >
      {children}
      {editable && (
        <>
          <span
            className="rz-handle rz-left"
            onPointerDown={(e) => startDrag(e, "left")}
            onDoubleClick={() => onResize(null)}
            title="Drag to resize · double-click to reset"
          />
          <span
            className="rz-handle rz-right"
            onPointerDown={(e) => startDrag(e, "right")}
            onDoubleClick={() => onResize(null)}
            title="Drag to resize · double-click to reset"
          />
        </>
      )}
    </div>
  );
}
