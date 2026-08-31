import { useLocation } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { DEMO_NOTICE, SHOW_DEMO_DATA } from "@/lib/demoFlag";
import { DRAWN_ROUTES } from "@/components/drawn";
import { OFFLINE } from "@/offline/offline";

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
  const { pathname } = useLocation();
  if (!SHOW_DEMO_DATA) return null;
  // NOT on the drawn screens WHEN THE OFFLINE STRIP CARRIES THE DISCLOSURE
  // (the ruling that removed the second banner assumed the strip exists — it
  // does only on OFFLINE bundles). A public DEMO deployment has no strip, and
  // invented figures on the open internet without a notice is the one thing
  // this component exists to prevent — so there, the drawn screens keep it.
  if (OFFLINE && DRAWN_ROUTES.some((r) => pathname.startsWith(r))) return null;
  // ONE slim marker, not a boxed callout: the owner's drawings start at the
  // page title, and two disclosures are clutter where one is honest.
  return (
    <div
      className="mb-4 flex items-center justify-center gap-2 rounded-pill bg-[oklch(0.97_0.02_84)] px-4 py-1.5"
      title={DEMO_NOTICE}
    >
      <TriangleAlert size={12} strokeWidth={2} className="shrink-0 text-[oklch(0.58_0.12_70)]" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[oklch(0.45_0.08_70)]">
        Demo · sample data, not real
      </p>
    </div>
  );
}
