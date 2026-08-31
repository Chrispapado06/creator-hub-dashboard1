import { useState } from "react";
import { cn } from "@/lib/utils";
import { initialsFor } from "@/lib/monogram";

/**
 * A company's own mark, before its name.
 *
 * ONE COMPONENT, BECAUSE THERE WERE FOUR AND THEY DISAGREED.
 *
 * An expedition company was drawn four different ways depending on which screen
 * you were on: a monogram in the directory, a DIFFERENT monogram on the company
 * profile (the two algorithms split names differently, so the same company
 * could be "SE" on one screen and "SX" on the next), a generic lucide mountain
 * glyph on a trip's "run by" block, and a fourth variant in the message list.
 * The mountain was the worst of them — every company got the same picture, so
 * the mark carried no identity at all and a climber scanning a list could not
 * tell two operators apart by anything but reading.
 *
 * THE MONOGRAM IS THE DEFAULT PATH, NOT AN ERROR STATE.
 *
 * This is the part most likely to be "fixed" by somebody later, so it is
 * written down. A real business's logo is its trademark. ICEFALL does not
 * bundle other people's trademarks, does not fetch them from their websites,
 * and does not keep them on its servers — so for almost every company there is
 * no image to draw, and there is not supposed to be. Rendering initials is the
 * correct, expected, permanent outcome for a company that has not uploaded a
 * mark itself. It is not a missing asset, it is not a 404 to chase, and it must
 * never be styled as a failure.
 *
 * WHAT THIS MUST NEVER DO
 *
 *   Never generate a mark. No initial-based "logo" dressed up as a brand, no
 *   generated crest, no colour derived from the name and presented as theirs.
 *   A generated mark is a fabricated identity for a real business.
 *
 *   Never substitute another company's mark, a placeholder brand, or a stock
 *   glyph that implies a specific company. The mountain glyph did the last of
 *   these by accident: it looked like a mark and belonged to nobody.
 *
 *   Never let the mark carry a claim. A logo is not evidence of anything —
 *   uploading an image says nothing about whether a company is real, checked or
 *   safe. The verified tick is a SEPARATE claim rendered by the caller, and the
 *   two must not be wired together: a company with a logo and no check must not
 *   look checked, and a checked company with no logo must not look unchecked.
 */

/**
 * The company's initials.
 *
 * Re-exported rather than implemented here: `lib/monogram` now serves people as
 * well as companies (see its header), and a UI primitive must not import from a
 * domain component to reach it. The name stays for the call sites that read
 * better with it.
 */
export const companyMonogram = initialsFor;

export function CompanyMark({
  name,
  logoPath,
  size = 44,
  shape = "tile",
  className,
}: {
  name: string;
  /**
   * The company's OWN uploaded mark, or null/undefined — which is the normal
   * case and stays the normal case. Never a path this app invented.
   */
  logoPath?: string | null;
  size?: number;
  shape?: "tile" | "circle";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showLogo = Boolean(logoPath) && !failed;

  // Scales with the mark so a 32px row and a 72px profile header both read.
  const initialsSize = Math.max(10, Math.round(size * 0.3));

  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden border border-hairline bg-elevated",
        shape === "circle" ? "rounded-full" : "rounded-tile",
        className,
      )}
      /* The name is already beside this on every caller, so the mark itself is
         decoration to a screen reader rather than a second announcement. */
      aria-hidden="true"
    >
      {showLogo ? (
        <img
          src={logoPath ?? undefined}
          alt=""
          aria-hidden
          loading="lazy"
          /* A logo that fails to load falls back to the monogram WITHOUT
             changing the size of the box — a card that reflows when an image
             404s is how a list ends up jumping under somebody's thumb. */
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-1.5"
        />
      ) : (
        <span
          style={{ fontSize: initialsSize }}
          className="font-light tracking-[0.08em] text-mist"
        >
          {companyMonogram(name)}
        </span>
      )}
    </span>
  );
}
