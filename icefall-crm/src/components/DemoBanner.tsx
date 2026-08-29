import { TriangleAlert } from "lucide-react";
import { DEMO_NOTICE, SHOW_DEMO_DATA } from "@/lib/demoFlag";

/**
 * Says, on the face of the screen, that the numbers are invented.
 *
 * A business dashboard is read as fact by default — that is the entire point of
 * one — so placeholder revenue needs saying out loud, on every screen, every
 * time. Not once in a README, and not in a corner: the figures on these pages
 * decide what a company is charged and whether ICEFALL renews them.
 *
 * Renders nothing at all when the flag is off, so a real build carries no
 * mention of demo data anywhere.
 */
export function DemoBanner() {
  if (!SHOW_DEMO_DATA) return null;
  return (
    <div className="mb-5 flex gap-3 rounded-card border border-[oklch(0.86_0.07_84)] bg-[oklch(0.985_0.025_84)] px-4 py-3">
      <TriangleAlert
        size={16}
        strokeWidth={1.9}
        className="mt-[1px] shrink-0 text-[oklch(0.58_0.12_70)]"
      />
      <p className="text-[12.5px] leading-relaxed text-[oklch(0.40_0.07_70)]">
        <span className="font-medium">Demonstration data.</span> {DEMO_NOTICE}
      </p>
    </div>
  );
}
