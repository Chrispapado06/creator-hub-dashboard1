import { CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What stands where a map would be, in the offline build.
 *
 * Map tiles are streamed — raster from OpenStreetMap, vector from OpenFreeMap,
 * terrain from the AWS elevation set, satellite from Esri. None of them can be
 * bundled and none of them can be faked: a procedurally generated contour plate
 * looks surveyed at thumbnail size, which is the single most convincing lie the
 * app could tell. So the map says what is true — it needs a connection — in the
 * same calm register as the rest of the app, and takes the same space the map
 * would have taken so nothing jumps when the connection comes back.
 */
export function MapUnavailable({
  className,
  compact = false,
  label = "Map needs a connection",
}: {
  className?: string;
  /** For thumbnails: drops the words and keeps the mark. */
  compact?: boolean;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden border border-hairline-strong bg-slate",
        compact ? "rounded-[10px]" : "rounded-2xl",
        className,
      )}
      role="img"
      aria-label={label}
    >
      {/* A faint contour wash — abstract enough that nobody could read it as
          terrain, and it keeps the panel from being a flat grey void. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(115deg, transparent 0 9px, currentColor 9px 10px)",
          color: "var(--ice-mist, #8a96a3)",
        }}
      />
      {compact ? (
        <CloudOff size={14} strokeWidth={1.6} className="relative text-mist-dim" />
      ) : (
        <div className="relative flex flex-col items-center gap-2 px-6 py-8 text-center">
          <CloudOff size={18} strokeWidth={1.5} className="text-mist-dim" />
          <p className="text-[12.5px] leading-snug text-mist">{label}</p>
          <p className="max-w-[16rem] text-[11.5px] leading-relaxed text-mist-dim">
            Map tiles are streamed, so they cannot be bundled with an offline
            build. Everything else on this screen still works.
          </p>
        </div>
      )}
    </div>
  );
}
