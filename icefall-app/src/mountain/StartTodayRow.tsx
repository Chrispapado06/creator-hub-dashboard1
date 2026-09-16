/**
 * "START TODAY" — the way in, drawn the same on every screen that offers it
 * (brief M3).
 *
 * The button is the athlete's own trip record being written, so the line under
 * it says what the tap will do BEFORE the tap: which dates, which trip, and
 * that it is kept on this phone. One tap, no confirmation sheet — a
 * confirmation that repeats a sentence already on screen is just a second tap
 * in gloves.
 *
 * It reads the trip record directly rather than `useMountainTrip`, because that
 * hook can answer with the review example trip, which has nothing to start.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useTrip } from "@/trip/trip";

import { MOUNTAIN_PATHS } from "./paths";
import { planStartToday, startMountainTrip, type StartGoal } from "./start";
import { useToday } from "./trip";

export function StartTodayRow({
  goal = null,
  goalMountainId = null,
  className,
}: {
  goal?: StartGoal | null;
  goalMountainId?: string | null;
  className?: string;
}) {
  const navigate = useNavigate();
  const today = useToday();
  const { trip } = useTrip();
  const [error, setError] = useState<string | null>(null);

  const plan = planStartToday({ today, trip, goal });

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          const result = startMountainTrip(plan, { goal, goalMountainId });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setError(null);
          navigate(MOUNTAIN_PATHS.now);
        }}
        className="flex min-h-16 w-full items-center justify-center rounded-[12px] bg-azure px-5 text-[15px] uppercase tracking-[0.1em] text-obsidian transition-colors hover:bg-azure-bright"
      >
        {plan.label}
      </button>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{plan.detail}</p>
      {error && <p className="mt-2 text-[12.5px] leading-relaxed text-danger">{error}</p>}
    </div>
  );
}
