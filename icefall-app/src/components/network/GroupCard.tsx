import { Link } from "react-router-dom";
import { CalendarRange, ChevronRight, Users } from "lucide-react";

import { Badge, Card } from "@/components/ui/primitives";
import { useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtElevation } from "@/lib/format";
import { EXPERIENCE_LABELS, LOOKING_FOR_LABELS, type Expedition } from "@/network/types";
import {
  GROUP_STYLE_LABELS,
  formatWindow,
  windowCountdown,
  type GroupStyle,
} from "@/network/groups";

/**
 * A group, as it appears in a list.
 *
 * Extracted from the card that used to live inside the old Expeditions screen,
 * with the member list, the readiness figures and the actions taken out of it:
 * those belong to the workspace, where there is room to carry their provenance,
 * and a list card that showed a readiness number next to a name would be the
 * first step towards ranking people by it.
 *
 * What it must never do is the same as everywhere else in this feature: it
 * draws the REAL membership count against the REAL party size, never pads a
 * party towards its minimum to look populated, and carries no verification
 * badge — ICEFALL has checked nobody.
 */
export function GroupCard({
  group,
  style,
  to,
  className,
}: {
  group: Expedition;
  /** Guided or independent. Undefined renders as nothing, never as a default. */
  style?: GroupStyle;
  /** Where the card leads. Omitted where there is nowhere to go, e.g. a preview. */
  to?: string;
  className?: string;
}) {
  const image = useMountainImage({ name: group.peakName, elevationM: group.elevationM });
  const countdown = windowCountdown(group.window);

  const body = (
    <Card inset={false} className={cn("overflow-hidden", className)}>
      {/* Photography where the peak has a verified photograph; terrain of the
          right altitude band, held back and captioned, where it does not. */}
      <div className="grain relative aspect-[16/9] w-full overflow-hidden bg-slate">
        <img
          src={image.src}
          alt={image.real ? group.peakName : ""}
          aria-hidden={image.real ? undefined : true}
          loading="lazy"
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            image.real ? "opacity-100" : "opacity-45",
          )}
        />
        <div className="absolute inset-0 scrim-bottom" />

        {!image.real && (
          <span
            title={image.caption}
            className="absolute right-3 top-3 rounded-full border border-hairline-strong bg-obsidian/70 px-2 py-[3px] text-[9px] font-medium uppercase tracking-[0.1em] text-mist backdrop-blur"
          >
            Representative terrain
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 p-4">
          <h3 className="truncate text-[19px] font-light text-snow">{group.peakName}</h3>
          <p className="tnum mt-0.5 text-[12px] text-mist">
            {typeof group.elevationM === "number"
              ? `${fmtElevation(group.elevationM)} m`
              : "Elevation not recorded"}
            {" · "}
            {group.privacy === "public" ? "Public" : "Invite-only"}
          </p>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-2.5">
          <CalendarRange size={15} strokeWidth={1.5} className="mt-[3px] shrink-0 text-azure" />
          <div className="min-w-0">
            <p className="tnum text-[13px] text-snow">{formatWindow(group.window)}</p>
            <p className="tnum mt-0.5 text-[11px] text-mist-dim">{countdown.label}</p>
          </div>
        </div>

        <div className="mt-3.5 flex items-start gap-2.5">
          <Users size={15} strokeWidth={1.5} className="mt-[3px] shrink-0 text-azure" />
          <div className="min-w-0">
            {/* The real count against the real ceiling. The remaining places are
                places, not people, and nothing fills them. */}
            <p className="tnum text-[13px] text-snow">
              {group.memberIds.length} / {group.sizeMax} members
            </p>
            <p className="tnum mt-0.5 text-[11px] text-mist-dim">
              Party of {group.sizeMin}–{group.sizeMax}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {/* Self-declared standing, said so on the chip itself — ICEFALL has no
              way to check what anyone can do. */}
          <Badge tone="neutral">{EXPERIENCE_LABELS[group.experience]} · self-declared</Badge>
          {style !== undefined && <Badge tone="neutral">{GROUP_STYLE_LABELS[style]}</Badge>}
          {group.lookingFor.map((l) => (
            <Badge key={l} tone="neutral">
              {LOOKING_FOR_LABELS[l]}
            </Badge>
          ))}
        </div>

        {group.description?.trim() && (
          <p className="mt-4 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-mist">
            {group.description.trim()}
          </p>
        )}

        {to && (
          <span className="mt-4 flex items-center gap-1.5 text-[12px] text-azure">
            Open the workspace
            <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" />
          </span>
        )}
      </div>
    </Card>
  );

  if (!to) return body;

  return (
    <Link to={to} className="block transition-opacity hover:opacity-95">
      {body}
    </Link>
  );
}
