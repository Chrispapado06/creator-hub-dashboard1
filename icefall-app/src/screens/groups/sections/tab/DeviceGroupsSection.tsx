/**
 * SAVED ON THIS PHONE — the groups somebody planned here, and the one tap that
 * moves each of them to their ICEFALL account.
 *
 * Structure plan §2.2 and §5.2. It replaces the old "On this device" rows,
 * which linked to a workspace and said "N members on this device" — a count
 * that was true and useless, because the only id it ever held was the owner's.
 *
 * WHAT IT IS HONEST ABOUT:
 *   - it never merges these rows into the server list above it, because they
 *     are a different record with a different promise;
 *   - a group that has moved is not listed here, because it is now a group on
 *     the account and is listed there;
 *   - nothing moves without a tap, and no row is removed by one: the record and
 *     everything written on it stay on the phone either way.
 *
 * STAGGER: this section returns a FRAGMENT whose children are `<Rise>` elements
 * and nothing else. The tab's own `<Stagger>` is the parent, and the house trap
 * (`Groups.tsx`, note 2) is that anything between the two can leave content at
 * opacity 0 — present in the DOM, invisible on screen, with no console error. A
 * fragment is transparent, so the rows really are the Stagger's children; this
 * was checked by reading computed opacity in the browser after the animation
 * settled, not by looking at a screenshot. When S9 rebuilds the tab, this
 * section takes a `<Stagger>` of its own (plan §5.1) and the rule holds either
 * way: never a wrapper, never a `<div>`, between a Stagger and its Rises.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { MountainThumb } from "@/components/domain/MountainImage";
import { Rise } from "@/components/layout/chrome";
import { SectionLabel } from "@/components/ui/primitives";
import { hasMoved, isSeededDemoGroupId } from "@/groups/local/phoneGroups";
import { formatWindow } from "@/network/groups";
import type { Expedition } from "@/network/types";
import { useApp } from "@/state/AppState";
import { fmtElevation } from "@/lib/format";
import { MoveToAccount } from "@/screens/groups/local/MoveToAccount";

/** One sentence, above the rows. */
const DEVICE_GROUPS_LINE = "A group you planned on this phone, which nobody else can open.";

export function DeviceGroupsSection({ query }: { query: string }) {
  const { expeditions } = useApp();

  /*
   * A row that has just been moved STAYS until the tab is left. The record has
   * gone from the list this section draws, so without this the row would vanish
   * under the finger that tapped it and the person would be left guessing
   * whether it worked.
   */
  const [justMoved, setJustMoved] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return expeditions.filter(
      (e) =>
        !isSeededDemoGroupId(e.id) &&
        (!hasMoved(e) || e.id in justMoved) &&
        (needle === "" || e.peakName.toLowerCase().includes(needle)),
    );
  }, [expeditions, query, justMoved]);

  if (rows.length === 0) return null;

  return (
    <>
      <Rise className="pt-8">
        <SectionLabel>Saved on this phone</SectionLabel>
        <p className="mt-2 max-w-[320px] text-[11.5px] leading-relaxed text-mist-dim">
          {DEVICE_GROUPS_LINE}
        </p>
      </Rise>
      {rows.map((expedition) => (
        <Rise key={expedition.id} className="pt-3">
          <DeviceGroupRow
            expedition={expedition}
            movedTo={justMoved[expedition.id] ?? null}
            onMoved={(groupId) =>
              setJustMoved((current) => ({ ...current, [expedition.id]: groupId }))
            }
          />
        </Rise>
      ))}
    </>
  );
}

/**
 * The peak, the dates and the move, in the row shape the rest of the tab uses.
 *
 * The row itself opens the read-only summary; the move sits under it rather
 * than inside the link, because a button inside a link is a tap nobody can
 * aim at.
 */
function DeviceGroupRow({
  expedition,
  movedTo,
  onMoved,
}: {
  expedition: Expedition;
  movedTo: string | null;
  onMoved: (serverGroupId: string) => void;
}) {
  return (
    <div>
      <Link
        to={`/social/groups/${expedition.id}`}
        className="flex min-h-[64px] items-center gap-3.5 py-2 transition-opacity hover:opacity-80"
      >
        <MountainThumb
          peak={{ name: expedition.peakName, elevationM: expedition.elevationM }}
          size={52}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-snow">{expedition.peakName}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-mist">
            {expedition.elevationM
              ? `${fmtElevation(expedition.elevationM)} m`
              : "Elevation not recorded"}
          </span>
          <span className="tnum mt-0.5 block truncate text-[11.5px] text-mist-dim">
            {formatWindow(expedition.window)}
          </span>
        </span>
      </Link>

      {movedTo !== null ? (
        <p className="pt-1 text-[11.5px] leading-relaxed text-mist">
          It is on your account now, so{" "}
          <Link to={`/social/groups/${movedTo}`} className="text-azure">
            open it there
          </Link>
          .
        </p>
      ) : (
        <MoveToAccount expedition={expedition} onMoved={onMoved} />
      )}
    </div>
  );
}
