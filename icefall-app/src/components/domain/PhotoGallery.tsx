import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A snap-scrolling photo strip.
 *
 * Used where ICEFALL has more than one verified photograph of a place. It stays
 * a plain scroller rather than an auto-advancing carousel — the athlete decides
 * when to move, and nothing animates on its own behind the content.
 */
export function PhotoGallery({
  images,
  alt,
  caption,
  captions,
  ratio = "aspect-[16/10]",
  className,
  children,
}: {
  images: string[];
  alt: string;
  /** Rendered small beneath the frame — used to mark representative imagery. */
  caption?: string;
  /**
   * Per-frame captions, tracking the visible image. Needed once a strip mixes
   * verified photographs with representative terrain: one shared caption would
   * either credit a photographer for artwork they didn't shoot, or label a real
   * summit photo as a stand-in.
   */
  captions?: string[];
  ratio?: string;
  className?: string;
  /** Overlaid on the first frame only, so headline type isn't repeated. */
  children?: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  // Verified photographs arrive after the first paint and go in front of the
  // fallback terrain. The scroller keeps its pixel offset across that change, so
  // without this the strip lands mid-way through the new set — showing frame 9
  // of 11 rather than the photograph that was just fetched.
  const key = images.join("|");
  useEffect(() => {
    scroller.current?.scrollTo({ left: 0 });
    setIndex(0);
  }, [key]);

  if (images.length === 0) return null;

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };

  return (
    <div className={className}>
      <div className="relative">
        <div
          ref={scroller}
          onScroll={onScroll}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-card"
        >
          {images.map((src, i) => (
            <div
              key={src}
              className={cn("grain relative w-full shrink-0 snap-center bg-slate", ratio)}
            >
              <img
                src={src}
                alt={i === 0 ? alt : `${alt} — ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 scrim-bottom" />
              {i === 0 && children && (
                <div className="absolute inset-0 flex flex-col justify-end p-4">{children}</div>
              )}
            </div>
          ))}
        </div>

        {images.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((src, i) => (
              <span
                key={src}
                className={cn(
                  "h-1 rounded-full transition-all duration-300",
                  i === index ? "w-4 bg-azure" : "w-1 bg-white/35",
                )}
              />
            ))}
          </div>
        )}
      </div>

      {(captions?.[index] ?? caption) && (
        <p className="mt-2 text-[10px] leading-relaxed text-mist-dim">
          {captions?.[index] ?? caption}
        </p>
      )}
    </div>
  );
}
