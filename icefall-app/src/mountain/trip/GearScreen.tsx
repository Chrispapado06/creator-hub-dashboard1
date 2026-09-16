/**
 * MOUNTAIN MODE · TRIP · GEAR (brief M5, plan §3.5).
 *
 * The kit list with tick-marks that survive leaving the screen. Derived rows
 * come from the objective's generated list; typed rows and every tick live on
 * this phone in `gearTicks` (see `gear.ts`).
 *
 * No network, no AI: the list is built from data the phone already holds, so it
 * reads the same in airplane mode.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { mountainById } from "@/data/mock/mountains";
import type { GearTick } from "@/device/types";
import { cn } from "@/lib/utils";
import { generateChecklist } from "@/services/checklist";
import { useApp } from "@/state/AppState";

import { useMountainTrip } from "../trip";
import { visibleKit } from "../tripTabModel";
import { BigButton, SectionLabel } from "../ui";
import { SubHeader, SubNote } from "./chrome";
import {
  GEAR_KEPT_HERE_SENTENCE,
  GEAR_NOT_KEPT_SENTENCE,
  MAX_GEAR_LABEL,
  PACKED,
  buildGearGroups,
  checkGearLabel,
  gearCount,
  gearScopeId,
  packedLabel,
  readGear,
  removeAddedGear,
  tickId,
  withAddedItem,
  writeAddedGear,
  writeGearTick,
  type AddedGearItem,
  type GearGroup,
  type GearRow,
} from "./gear";

const ROW =
  "flex min-h-[72px] w-full items-center gap-4 border-t border-hairline px-5 py-3 text-left";

export default function GearScreen() {
  const { trip } = useMountainTrip();
  const { can, checklistStatuses } = useApp();

  const scopeId = gearScopeId(trip);
  const goalId = trip?.record?.goalId ?? null;
  const mountain = trip?.mountainId ? mountainById(trip.mountainId) : undefined;

  const [ticks, setTicks] = useState<Record<string, GearTick>>({});
  const [added, setAdded] = useState<AddedGearItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notKept, setNotKept] = useState(false);

  useEffect(() => {
    if (!scopeId) return;
    let live = true;
    setLoaded(false);
    void readGear(scopeId).then((stored) => {
      if (!live) return;
      setTicks(stored.ticks);
      setAdded(stored.added);
      setNotKept(!stored.kept);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [scopeId]);

  // Curated mountains only: the generator reads height alone, and it prints
  // nonsense for peaks nobody surveyed (the full app's checklist screen, rule 4).
  const generated = useMemo(
    () =>
      mountain
        ? generateChecklist({
            name: mountain.name,
            elevationM: mountain.elevationM,
            lat: mountain.coords.lat,
            lon: mountain.coords.lon,
          })
        : null,
    [mountain],
  );

  const statuses = useMemo(
    () => (goalId ? (checklistStatuses[goalId] ?? {}) : {}),
    [checklistStatuses, goalId],
  );

  const items = useMemo(
    () =>
      generated
        ? visibleKit(generated.items, statuses, {
            full: can("equipment.checklist.full"),
            documents: can("equipment.documents"),
          })
        : [],
    [generated, statuses, can],
  );

  const groups = useMemo(
    () => buildGearGroups({ items, added, ticks, statuses }),
    [items, added, ticks, statuses],
  );
  const count = gearCount(groups);

  const toggle = useCallback(
    (row: GearRow) => {
      if (!scopeId) return;
      const now = Date.now();
      const packed = !row.packed;
      setTicks((prev) => {
        const next = { ...prev };
        if (packed)
          next[row.id] = {
            id: tickId(scopeId, row.id),
            scopeId,
            itemId: row.id,
            status: PACKED,
            at: now,
          };
        else delete next[row.id];
        return next;
      });
      void writeGearTick(scopeId, row.id, packed, now).then((kept) => {
        if (!kept) setNotKept(true);
      });
    },
    [scopeId],
  );

  const add = useCallback(
    (label: string) => {
      if (!scopeId) return;
      const now = Date.now();
      const next = withAddedItem(added, label, now);
      setAdded(next);
      void writeAddedGear(scopeId, next, now).then((kept) => {
        if (!kept) setNotKept(true);
      });
    },
    [scopeId, added],
  );

  const remove = useCallback(
    (id: string) => {
      if (!scopeId) return;
      void removeAddedGear(scopeId, added, id).then((res) => {
        setAdded(res.added);
        setTicks((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
        if (!res.kept) setNotKept(true);
      });
    },
    [scopeId, added],
  );

  if (!trip || !scopeId) {
    return (
      <div>
        <SubHeader title="Gear" />
        <SubNote>Start a trip in the full app to tick off its kit here.</SubNote>
      </div>
    );
  }

  return (
    <div className="pb-12">
      <SubHeader title="Gear" />

      {/* The one large thing on this screen: how much of the list is on your
          back. Counted off the ticks, never a target. */}
      <section className="px-5 pb-4 pt-2">
        <p className="m-text-title tabular-nums text-snow">
          {loaded ? packedLabel(count) : "Reading what you ticked…"}
        </p>
        <p className="mt-2 m-text-label leading-snug text-mist">
          {generated
            ? "Worked out from the mountain's height, not your route. Your guide's list comes first."
            : "ICEFALL has no kit list for this trip. Add what you are carrying below."}
        </p>
        <p className="mt-1 m-text-label leading-snug text-mist-dim">
          {notKept ? GEAR_NOT_KEPT_SENTENCE : GEAR_KEPT_HERE_SENTENCE}
        </p>
      </section>

      {groups.map((group) => (
        <Group key={group.id} group={group} onToggle={toggle} onRemove={remove} />
      ))}

      {loaded && count.total === 0 && (
        <SubNote className="border-t border-hairline">Nothing on the list yet.</SubNote>
      )}

      <AddRow groups={groups} onAdd={add} />
    </div>
  );
}

function Group({
  group,
  onToggle,
  onRemove,
}: {
  group: GearGroup;
  onToggle: (row: GearRow) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section aria-labelledby={`gear-${group.id}`}>
      <SectionLabel as="h2" id={`gear-${group.id}`} className="px-5 pb-2 pt-6">
        {group.label}
      </SectionLabel>
      <ul>
        {group.rows.map((row) => (
          <li key={row.id} className="flex items-stretch border-t border-hairline">
            <button
              type="button"
              role="checkbox"
              aria-checked={row.packed}
              onClick={() => onToggle(row)}
              className={cn(ROW, "flex-1 border-t-0")}
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[22px]",
                  row.packed
                    ? "bg-azure text-obsidian"
                    : "border border-hairline-strong text-transparent",
                )}
              >
                ✓
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block m-text-body leading-snug",
                    row.packed ? "text-mist line-through" : "text-snow",
                  )}
                >
                  {row.label}
                </span>
                {row.statusLabel && (
                  <span className="mt-0.5 block m-text-label text-mist-dim">
                    In the app: {row.statusLabel}
                  </span>
                )}
              </span>
            </button>
            {row.added && (
              <button
                type="button"
                onClick={() => onRemove(row.id)}
                aria-label={`Remove ${row.label}`}
                className="flex min-h-[72px] min-w-16 shrink-0 items-center justify-center px-4 m-text-label text-mist"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Kept at the bottom: it is the one thing on this screen you type, and typing wants thumb reach. */
function AddRow({ groups, onAdd }: { groups: GearGroup[]; onAdd: (label: string) => void }) {
  const [text, setText] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const submit = () => {
    const check = checkGearLabel(text, groups);
    if (!check.ok) return setReason(check.reason);
    onAdd(check.label);
    setText("");
    setReason(null);
    input.current?.focus();
  };

  return (
    <form
      className="mt-8 border-t border-hairline px-5 pt-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="gear-add" className="section-label">
        Add an item
      </label>
      <input
        id="gear-add"
        ref={input}
        value={text}
        maxLength={MAX_GEAR_LABEL}
        onChange={(e) => {
          setText(e.target.value);
          if (reason) setReason(null);
        }}
        placeholder="Spare gloves"
        className="mt-2 min-h-16 w-full rounded-[12px] border border-hairline-strong bg-transparent px-4 m-text-body text-snow placeholder:text-mist-dim"
      />
      {reason && <p className="mt-2 m-text-label text-alert">{reason}</p>}
      <BigButton variant="azure" type="submit" className="mt-3">
        Add
      </BigButton>
    </form>
  );
}
