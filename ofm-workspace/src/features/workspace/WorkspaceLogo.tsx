import { cn } from "@/lib/utils";
import { PageIcon } from "@/features/pages/PageIcon";

function initial(name: string) {
  return (name.trim().charAt(0) || "W").toUpperCase();
}

/**
 * Workspace avatar: an uploaded image if set, else an emoji/brand icon, else the
 * name's initial on a solid tile. Used in the switcher and settings.
 */
export function WorkspaceLogo({
  name,
  icon,
  logoUrl,
  className,
  emojiClassName = "text-sm leading-none",
}: {
  name: string;
  icon?: string | null;
  logoUrl?: string | null;
  className?: string;
  emojiClassName?: string;
}) {
  const box = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded",
    className,
  );

  if (logoUrl) {
    return (
      <div className={box}>
        <img src={logoUrl} alt="" className="size-full object-cover" />
      </div>
    );
  }
  if (icon) {
    return (
      <div className={cn(box, "bg-muted")}>
        <PageIcon icon={icon} className="size-2/3" emojiClassName={emojiClassName} />
      </div>
    );
  }
  return (
    <div
      className={cn(box, "bg-primary font-bold text-primary-foreground")}
      aria-hidden
    >
      {initial(name)}
    </div>
  );
}
