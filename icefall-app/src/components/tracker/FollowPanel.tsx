import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Info, Route as RouteGlyph } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FOLLOW_LIMITS,
  compassPoint,
  type BoundRoute,
  type FollowReadout,
  type FollowUnavailable,
} from "@/tracking/follow";
import { UNAVAILABLE_COPY } from "@/tracking/metrics";

/**
 * THE ROUTE-FOLLOWING READOUT, over the live map.
 *
 * Everything on it is a measurement between two coordinates: how far the walker
 * is from the mapped line, which way the next point on that line lies, and how
 * much line is left. There is no ETA, no "you have arrived", and no instruction
 * — see the header of `@/tracking/follow` for why each of those is absent.
 *
 * ── THE ONE THING THIS COMPONENT MUST NEVER DO ──────────────────────────────
 * Show a figure derived from a fix the phone no longer has. Every number here
 * comes out of one `FollowReadout`, which is either a reading or a REASON there
 * is not one, and when it is a reason this panel prints the reason and nothing
 * else. A distance-to-the-next-point left on screen from ninety seconds ago,
 * while the walker keeps walking, is the failure that gets somebody hurt: it
 * looks exactly like a live number and it is a memory.
 */

/** How long the limits stay expanded for on a walker's first followed route. */
const LIMITS_SEEN_KEY = "icefall.follow.limits-seen.v1";

const km = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`;

export function FollowPanel({
  route,
  readout,
  className,
}: {
  route: BoundRoute;
  readout: FollowReadout;
  className?: string;
}) {
  /*
   * ONCE, AND WITHOUT NAGGING.
   *
   * The limits are open the first time this athlete follows anything and folded
   * away for ever after, still one tap from being read again. A panel that
   * re-lectured on every walk would be scrolled past unread by the third one,
   * which is the same as not saying it.
   */
  const [openLimits, setOpenLimits] = useState(() => {
    try {
      return localStorage.getItem(LIMITS_SEEN_KEY) !== "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (!openLimits) return;
    try {
      localStorage.setItem(LIMITS_SEEN_KEY, "1");
    } catch {
      /* private mode — it opens again next time, which is the safe direction */
    }
  }, [openLimits]);

  /*
   * A CUT SENTENCE HAS TO LOOK CUT.
   *
   * The caller caps this panel's height so it cannot swallow the map, so on a
   * short screen — or with the limits open and an off-route paragraph above
   * them — the last of the four limits ends mid-word at the panel's edge. Read
   * from a phone that looks like the app has broken, not like there is more,
   * and the limit it truncates is the one about the map, the compass and the
   * guide. So the edge says so and points down.
   */
  const scroller = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [openLimits, readout]);

  const r = readout.value;

  return (
    /* TWO ELEMENTS, AND THE SPLIT IS THE POINT.
       The OUTER is the surface: the caller decides what this sits on — over the
       live map it is a glass plate — and caps its height. It does not scroll.
       The INNER scrolls and owns the content's padding, so the overflow marker
       can be pinned to the surface's true bottom edge without this file having
       to know what padding the caller chose. Sized by flex rather than by
       repeating the caller's max-height, which would be the same coupling
       written twice. */
    <div className={cn("relative flex flex-col", className)}>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 pb-3.5 pt-3">
      {/* ---- Which line, and the state of the walker against it ---------- */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="section-label flex min-w-0 items-center gap-1.5 text-mist">
          <RouteGlyph size={11} strokeWidth={1.8} className="shrink-0 text-azure" />
          <span className="truncate">Following · {route.name}</span>
        </span>
        {r && (
          <span className="tnum shrink-0 text-[10px] uppercase tracking-[0.14em] text-mist-dim">
            {km(r.totalM)} mapped
          </span>
        )}
      </div>

      {r === null ? (
        /* ---- NO POSITION. The reason, and nothing that needs one. ------- */
        <div className="mt-2.5 flex gap-2.5">
          <AlertTriangle size={15} strokeWidth={1.6} className="mt-0.5 shrink-0 text-alert" />
          <div>
            <p className="text-[13px] text-snow">{ABSENCE_TITLE[readout.reason]}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">{ABSENCE_DETAIL[readout.reason]}</p>
          </div>
        </div>
      ) : (
        <>
          {/* ---- On or off the line ------------------------------------- */}
          <div className="mt-2.5 flex items-baseline gap-2">
            <span
              className={cn(
                "text-[13px] uppercase tracking-[0.14em]",
                r.offRoute ? "text-alert" : "text-summit",
              )}
            >
              {r.offRoute ? "Off the line" : "On the line"}
            </span>
            <span className="tnum text-[13px] text-snow">
              {Math.round(r.offM)} m from it
            </span>
            {/* THE FIX'S OWN ACCURACY, BESIDE THE FIGURE IT LIMITS. Twelve
                metres off the line from a ±40 m fix is not a measurement of
                being twelve metres off anything, and the walker is the one who
                should get to weigh that. */}
            {r.accuracyM !== null && (
              <span className="tnum text-[11px] text-mist-dim">±{Math.round(r.accuracyM)} m</span>
            )}
          </div>

          {r.offRoute && (
            <p className="mt-1 text-[11.5px] leading-relaxed text-mist">
              The nearest point on the mapped line is {km(r.nearest.distanceM)} away, bearing{" "}
              {Math.round(r.nearest.bearingDeg)}° true ({compassPoint(r.nearest.bearingDeg)}).
              ICEFALL cannot show you a way back to it — it has no routing, so it will not draw a
              line across ground nobody has mapped.
            </p>
          )}

          {/* ---- The three figures -------------------------------------- */}
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <Figure
              label="Next point on the line"
              value={r.next ? km(r.next.distanceM) : "—"}
              /* TRUE, NOT MAGNETIC, and the word is on the screen beside every
                 bearing: this app carries no declination model, so a walker
                 setting a compass has to apply that correction themselves. */
              sub={
                r.next
                  ? `${Math.round(r.next.bearingDeg)}° true · ${compassPoint(r.next.bearingDeg)}`
                  : r.atEnd
                    ? "the mapped line ends here"
                    : "nothing far enough ahead to take a bearing to"
              }
            />
            {r.direction === null ? (
              /* DIRECTION IS MEASURED, and until it has been, both ends are
                 shown rather than one of them guessed at. */
              <Figure
                label="To each end of the line"
                value={`${km(r.toStartM)} · ${km(r.toEndM)}`}
                sub={
                  r.closed
                    ? "back · on — this route is a circuit, so both are the same place on the ground"
                    : "back · on — which way you are walking is not measured yet"
                }
              />
            ) : (
              <Figure
                label={r.direction === "forwards" ? "To the end of the line" : "To the start of the line"}
                value={km(r.remainingM ?? 0)}
                sub={
                  r.atEnd
                    ? "you are at that end of the mapped line"
                    : "along the line, measured — not a time"
                }
              />
            )}
          </div>

          {/* ---- Where the line itself is not continuous ----------------- */}
          {r.pieces > 1 && (
            <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
              OpenStreetMap holds this route in {r.pieces} separate pieces. The ground between them
              is not mapped, nothing is drawn across it, and the distances above do not include it.
            </p>
          )}
        </>
      )}

      {/* ---- What this is and is not -------------------------------------- */}
      <button
        type="button"
        onClick={() => setOpenLimits((v) => !v)}
        aria-expanded={openLimits}
        className="mt-3 flex items-center gap-1.5 text-[11.5px] text-azure"
      >
        <Info size={12} strokeWidth={1.8} />
        What this does, and what it does not
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={cn("transition-transform", openLimits && "rotate-180")}
        />
      </button>
      {openLimits && (
        <ul className="mt-2 space-y-1.5">
          {FOLLOW_LIMITS.map((l) => (
            <li key={l} className="text-[11px] leading-relaxed text-mist-dim">
              {l}
            </li>
          ))}
        </ul>
      )}

      </div>

      {more && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center rounded-b-card bg-gradient-to-t from-obsidian via-obsidian/85 to-transparent pb-1.5 pt-8">
          <ChevronDown size={13} strokeWidth={2} className="text-mist-dim" aria-hidden />
          <span className="sr-only">There is more below — scroll this panel.</span>
        </div>
      )}
    </div>
  );
}

/**
 * The second sentence of an absence: what it means for the walker right now.
 *
 * `UNAVAILABLE_COPY` gives the two-word label the metric tiles use, which is
 * the right length beside a number and far too short to be the whole of what a
 * person standing in a gorge with no fix needs to be told.
 */
/**
 * The short label. Deferred to `UNAVAILABLE_COPY` for everything the metric
 * tiles already word, so the panel and the tile beside it cannot say two
 * different things about the same missing sensor; the two line states are this
 * screen's own and are worded here.
 */
const ABSENCE_TITLE: Record<FollowUnavailable, string> = {
  ...UNAVAILABLE_COPY,
  "line-loading": "Waiting for the line",
  "line-failed": "No line",
};

const ABSENCE_DETAIL: Record<FollowUnavailable, string> = {
  "needs-permission":
    "ICEFALL cannot see where you are, so it cannot place you on the line. Grant location access to this site and start again.",
  "no-gps":
    "This device is giving ICEFALL no position at all. Nothing on this screen can be measured against the route.",
  /* CARRIES WHAT THE SIGNAL TOAST USED TO SAY, because on a followed walk this
     replaces it: the clock is the fact a walker most wants after "no fix". */
  "signal-lost":
    "The last fix is too old to be where you are. It is still on the map as part of your track, and it is not your position — everything measured against the route stops until a fix returns. The clock keeps running, and distance resumes with the next fix.",
  "awaiting-signal":
    "Waiting for the first fix. Nothing is placed on the line until there is a real position to place.",
  "no-sensor": "No position source.",
  indoor: "This activity records no position.",
  "not-connected": "No position source is connected.",
  "line-loading":
    "OpenStreetMap has not sent this route's geometry yet. Your position is not the problem — there is nothing yet to measure it against.",
  "line-failed":
    "OpenStreetMap did not send this route's line, so there is nothing to follow. This is a connection problem, not an empty route. The activity is still recording.",
};

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="section-label text-[9px]">{label}</p>
      <p className="tnum mt-1 text-[20px] font-light leading-none text-snow">{value}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-mist-dim">{sub}</p>
    </div>
  );
}
