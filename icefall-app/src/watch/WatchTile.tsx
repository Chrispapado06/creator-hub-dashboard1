import { Loader2, Watch } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WatchConnection } from "./connection";

/**
 * THE ONE TILE EVERY WATCH PROVIDER DRAWS.
 *
 * Neutral by necessity and by rule, not by choice: COROS, Suunto and Polar
 * grant this app no mark at all (see `BrandMarks.tsx` — COROS's terms forbid
 * the wordmark without written consent, Suunto's and Polar's publish no brand
 * kit reachable before their agreements are signed), and Garmin's OWN brand
 * guidelines forbid its tag logo "in instances where Garmin device-sourced
 * data is not present" — which is every surface in ICEFALL today, because
 * there is no Garmin adapter (`registry.ts` gate: `"not-built"`). So every
 * provider gets the same 40×40 `rounded-[10px]` span on `--ice-elevated`,
 * a lucide `Watch` glyph in `text-mist`, and its name as text beside it. One
 * treatment, so no tile looks more "real" or more official than another —
 * a COROS card that drew a real mark next to a Suunto card that could not
 * would itself misstate which of the four ICEFALL is actually approved by.
 */
export function WatchTile({ size = 40 }: { size?: number }) {
  const inner = Math.round(size * 0.475); // 19px at the default 40px
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[10px]"
      style={{ width: size, height: size, background: "var(--ice-elevated)" }}
    >
      <Watch size={inner} strokeWidth={1.8} className="text-mist" />
    </span>
  );
}

/**
 * The right-hand word for one watch card, and every state it can honestly be
 * — nine of them, and they are never merged. The same doctrine as
 * `Connections.tsx`'s Strava `StatusMark`: "Not connected" (nobody has linked
 * this account) and "Cannot be checked" (ICEFALL asked and got no answer) are
 * different facts, and "Not set up" / "Not approved" / "Not yet" are three
 * more that must not collapse into one "Unavailable" — each names a
 * different reason there is nothing to press, and the reason sentence under
 * the card is what actually explains it.
 */
export function WatchStatusMark({ connection }: { connection: WatchConnection }) {
  const { state, canImport } = connection;

  if (state === "loading") {
    return (
      <Loader2 size={14} strokeWidth={2} className="mt-1 shrink-0 animate-spin text-mist-dim" />
    );
  }

  const label =
    state === "connected"
      ? canImport
        ? "Connected"
        : "Needs permission"
      : state === "not-connected"
        ? "Not connected"
        : state === "signed-out"
          ? "Sign in first"
          : state === "no-backend"
            ? "Unavailable"
            : state === "unreachable"
              ? "Cannot be checked"
              : state === "needs-registration"
                ? "Not set up"
                : state === "vendor-approval-required"
                  ? "Not approved"
                  : "Not yet"; // not-built

  return (
    <span
      className={cn(
        "mt-0.5 shrink-0 text-[11.5px]",
        state === "connected" && canImport ? "text-summit" : "text-mist-dim",
      )}
    >
      {label}
    </span>
  );
}
