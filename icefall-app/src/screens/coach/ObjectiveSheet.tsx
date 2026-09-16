import { Link } from "react-router-dom";
import { Info, Mountain as MountainIcon } from "lucide-react";

import { Sheet } from "@/components/ui/Sheet";
import { useMountainImage } from "@/components/domain/MountainImage";
import { countdownLabel, useObjective } from "@/screens/coach/shell";

/**
 * THE OBJECTIVE SHEET — spec Part B6, opened from the hub's objective chip.
 *
 * The brief's §1 is explicit that the chip is the ONLY place the objective
 * changes, so this sheet's "Change" button does not open a picker of its
 * own — it hands off to the same `/goals` flow every other Coach surface
 * already uses (`shell.tsx`'s `ObjectiveContextRow`, the hub's own
 * `ObjectivePill`). Closing the sheet first keeps the transition clean: the
 * sheet's portal target lives inside the phone shell, and `/goals` renders a
 * full page over it either way, but a sheet left "open" in state while the
 * route moves on is the kind of stale-flag bug worth just not having.
 *
 * NO OBJECTIVE: the hub only shows a chip that opens THIS sheet when a goal
 * exists (an athlete with nothing set gets the plain "Set one" link instead,
 * per `shell.tsx`). This still handles the null case honestly rather than
 * assuming — a real state, not a fabricated Mont Blanc.
 */
export function ObjectiveSheet({ onClose }: { onClose: () => void }) {
  const { goal, mountain, kind, days } = useObjective();

  const image = useMountainImage({
    name: goal?.name ?? "",
    elevationM: goal?.elevationM,
    lat: goal?.lat,
    lon: goal?.lon,
    curatedId: mountain?.id,
    photo: goal?.photo ?? mountain?.photo,
    wikipedia: goal?.wikipedia,
  });

  return (
    <Sheet title="Your objective" onClose={onClose}>
      <div className="py-4">
        <p className="text-[13px] leading-relaxed text-mist">
          This is your current goal. You can update it any time.
        </p>

        {goal ? (
          <>
            <div className="mt-4 overflow-hidden rounded-card border border-hairline-strong bg-elevated">
              <div className="relative h-36 w-full bg-slate">
                <img src={image.src} alt="" aria-hidden="true" className={cnOpacity(image.real)} />
                <div className="absolute inset-0 scrim-bottom" />
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold text-snow">{goal.name}</p>
                  {kind && <p className="mt-0.5 truncate text-[13px] text-mist">{kind}</p>}
                  <p className="tnum mt-1 text-[12.5px] text-azure-bright">
                    {countdownLabel(days)}
                  </p>
                </div>
                <Link
                  to="/goals"
                  onClick={onClose}
                  className="shrink-0 rounded-full border border-hairline-strong px-4 py-2 text-[13px] text-azure-bright transition-colors hover:border-azure/50 hover:text-azure"
                >
                  Change
                </Link>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2.5 rounded-tile border border-azure/25 bg-azure/10 px-3.5 py-3">
              <Info size={15} strokeWidth={1.7} className="mt-0.5 shrink-0 text-azure-bright" />
              <p className="text-[12.5px] leading-relaxed text-azure-bright">
                Changing your objective will update your plan, but your logged data will be kept.
              </p>
            </div>
          </>
        ) : (
          <div className="mt-4 flex items-center gap-3 rounded-card border border-hairline-strong bg-elevated px-4 py-4">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-azure/15 text-azure"
            >
              <MountainIcon size={18} strokeWidth={1.6} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-snow">No objective set</p>
              <p className="text-[12.5px] text-mist">Everything here follows one.</p>
            </div>
            <Link to="/goals" onClick={onClose} className="shrink-0 text-[13px] text-azure-bright">
              Set one
            </Link>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function cnOpacity(real: boolean): string {
  return `absolute inset-0 h-full w-full object-cover ${real ? "opacity-100" : "opacity-45"}`;
}
