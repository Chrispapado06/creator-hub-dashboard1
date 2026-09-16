import { Mountain as MountainIcon, ShieldCheck } from "lucide-react";

import { Sheet } from "@/components/ui/Sheet";

/**
 * THE ABOUT-THIS-COACH SHEET — spec Part B7, opened from the hub's "About
 * this coach" row (brief §1: "About this coach row, which opens its sheet").
 *
 * Two fixed rows, copy taken verbatim from the mockup transcription. Nothing
 * here reads app state — it is the coach's standing disclosure, not a
 * personalised card — so unlike `ObjectiveSheet` it takes no data at all
 * beyond the close handler.
 */
export function AboutCoachSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="About this coach" onClose={onClose}>
      <div className="divide-y divide-hairline">
        <Row
          icon={MountainIcon}
          title="A planning aid, not a measurement"
          detail="I help you plan and stay consistent based on what you've logged. I can't judge recovery, injury or altitude response."
        />
        <Row
          icon={ShieldCheck}
          title="Answers from your data"
          detail="I only use your logged data. If something isn't logged, I'll say so rather than guessing."
        />
      </div>
    </Sheet>
  );
}

function Row({
  icon: Icon,
  title,
  detail,
}: {
  icon: React.ComponentType<{
    size?: number | string;
    strokeWidth?: number | string;
    className?: string;
  }>;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3.5 py-4 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-azure/15 text-azure"
      >
        <Icon size={18} strokeWidth={1.6} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold leading-snug text-snow">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-mist">{detail}</p>
      </div>
    </div>
  );
}
