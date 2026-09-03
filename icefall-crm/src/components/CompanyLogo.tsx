import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A company mark in a SQUARE — the owner's instruction for the Companies
 * rebuild ("in square not circle"), so this exists beside `Avatar` rather than
 * replacing it: people stay round, businesses go square.
 *
 * Real operators' logos are fetched from their own domains AT RENDER TIME —
 * first the logo endpoint, then the favicon service, then initials. Nothing is
 * downloaded into the repository, so there is no copied asset to license: the
 * browser shows each company's own mark from its own site, or shows letters.
 * The chain degrades silently offline, which is correct — a missing logo is a
 * cosmetic absence, not information.
 */
export function CompanyLogo({
  name,
  domain,
  size = 34,
  className,
}: {
  name: string;
  domain?: string | null;
  size?: number;
  className?: string;
}) {
  // 0 = logo endpoint, 1 = favicon service, 2 = initials.
  const [stage, setStage] = useState(0);

  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  if (!domain || stage >= 2) {
    return (
      <span
        style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
        className={cn(
          "grid shrink-0 place-items-center rounded-md bg-panel font-bold text-muted",
          className,
        )}
      >
        {initials}
      </span>
    );
  }

  const src =
    stage === 0
      ? `https://logo.clearbit.com/${domain}`
      : `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  return (
    <img
      src={src}
      alt={`${name} logo`}
      style={{ width: size, height: size }}
      className={cn(
        "shrink-0 rounded-md border border-line-soft bg-card object-contain p-[3px]",
        className,
      )}
      onError={() => setStage((s) => s + 1)}
    />
  );
}
