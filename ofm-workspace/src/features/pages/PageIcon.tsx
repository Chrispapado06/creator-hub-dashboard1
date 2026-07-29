import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND_BY_SLUG } from "./icons";

/**
 * Renders a page icon string: an emoji, a `si:<brand>` logo, or a fallback doc
 * icon when unset. Brand logos use currentColor so they stay visible in both
 * light and dark themes.
 */
export function PageIcon({
  icon,
  className = "size-4",
  emojiClassName = "text-[15px] leading-none",
}: {
  icon?: string | null;
  className?: string;
  emojiClassName?: string;
}) {
  if (icon && icon.startsWith("si:")) {
    const brand = BRAND_BY_SLUG[icon.slice(3)];
    if (brand) {
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          role="img"
          aria-label={brand.title}
          className={className}
        >
          <path d={brand.path} />
        </svg>
      );
    }
  }
  if (icon) return <span className={emojiClassName}>{icon}</span>;
  return <FileText className={cn(className, "opacity-70")} />;
}
