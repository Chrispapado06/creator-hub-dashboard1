import type { ReactNode } from "react";
import { CloudOff, WifiOff } from "lucide-react";
import { OFFLINE } from "./offline";

/**
 * The banner that keeps the offline build honest.
 *
 * ICEFALL never displays a number it cannot measure. Offline it can measure
 * NOTHING — every figure on every screen is invented, and the screens are built
 * to look exactly like the real thing because that is what they are for. So the
 * banner is not decoration and it is not dismissable: it is the only thing
 * standing between a convincing screenshot and a claim about the business.
 *
 * It sits ABOVE the application shell rather than inside it, so it survives
 * every route, every error state and every screen that renders its own layout.
 * It renders nothing at all when the flag is off, which is why the wrapper is
 * safe to leave in `main.tsx` permanently.
 */
export function OfflineBanner() {
  if (!OFFLINE) return null;
  return (
    <div className="flex items-center justify-center gap-2.5 bg-[oklch(0.205_0.006_264)] px-4 py-2.5 text-center">
      <WifiOff size={15} strokeWidth={2.2} className="shrink-0 text-[oklch(0.873_0.147_92)]" />
      <p className="text-[12.5px] font-bold uppercase tracking-[0.16em] text-[oklch(0.873_0.147_92)]">
        Offline demo · sample data, not real
      </p>
    </div>
  );
}

/**
 * Wraps the application so the banner can own a strip of the viewport without
 * the shell losing its full-height layout. Off the flag this is a passthrough
 * that adds no element at all.
 */
export function OfflineFrame({ children }: { children: ReactNode }) {
  if (!OFFLINE) return <>{children}</>;
  // A grid rather than a flex column: the shell inside is `h-full`, and a grid
  // track gives it a definite height to resolve that percentage against without
  // depending on how a stretched flex item is sized.
  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
      <OfflineBanner />
      <div className="min-h-0">{children}</div>
    </div>
  );
}

/**
 * What to draw where a live, streamed surface would be.
 *
 * A map, a tile server, an embedded page from another origin — none of them can
 * work with no network, and the two dishonest answers are a blank grey void
 * (which reads as broken) and a drawn-on picture of a map (which reads as a
 * measurement). Say what is missing instead.
 */
export function NeedsConnection({
  what,
  detail,
}: {
  what: string;
  detail?: string;
}) {
  return (
    <div className="grid h-full w-full place-items-center bg-panel px-8 py-10 text-center">
      <div className="flex max-w-[420px] flex-col items-center gap-2.5">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-surface text-faint shadow-soft">
          <CloudOff size={19} strokeWidth={1.8} />
        </span>
        <p className="text-[13.5px] font-medium text-ink">{what} needs a connection.</p>
        <p className="text-[12.5px] leading-relaxed text-muted">
          {detail ??
            "This build is running offline, so nothing can be streamed in. Everything else on this screen works."}
        </p>
      </div>
    </div>
  );
}
