import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Backpack, Plus, Search, Trash2 } from "lucide-react";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { DonutChart, FactorBar, ScoreRing } from "@/components/coach/CoachUI";
import { UnavailableState } from "@/components/coach/DataState";
import { UpgradePrompt } from "@/components/growth/UpgradePrompt";
import { known, unavailable } from "@/coach/types";
import { cn } from "@/lib/utils";
import { fmtElevation } from "@/lib/format";
import { useApp } from "@/state/AppState";
import { sync } from "@/services/repository";
import { assessPeak } from "@/services/peakAssessment";
import { REFERENCE_NO_KIT_LIST, REFERENCE_NEXT_STEP, TIER_EYEBROW } from "@/services/peakTier";
import {
  CHECKLIST_DISCLAIMER,
  PACK_KIND_LABEL,
  STATUS_LABEL,
  completion,
  fmtGrams,
  generateChecklist,
  packTotals,
  type ChecklistItem,
  type ItemStatus,
  type PackItem,
  type PackKind,
  type PackTotals,
} from "@/services/checklist";

/**
 * EQUIPMENT — do I have what I need?
 *
 * The third axis of Mountain Intelligence. The list is generated from the peak
 * itself (see `@/services/checklist`), so what appears here is a claim about the
 * class of mountain, not about the athlete's route.
 *
 * Three things this screen must never do, all of them load-bearing:
 *
 *  1. Tell anyone they are ready. A complete list is a complete list; it is not
 *     clearance to climb, and the disclaimer sits under the ring rather than at
 *     the bottom of the page where nobody reads it.
 *  2. Invent a weight. Every gram in the pack section was typed in by the
 *     athlete. An item they have not weighed is shown as unweighed and left out
 *     of the total — a zero would quietly make a heavy pack look light.
 *  3. Send anyone to a shop. ICEFALL has no retail partners and no affiliate
 *     arrangements, so the "find equipment" affordance on a needed item is
 *     disabled and says exactly why. A plausible-looking link to nowhere is
 *     worse than no link at all.
 *  4. Derive a list for a peak nobody has surveyed. The generator reads an
 *     elevation band and nothing else, and on Erciyes Dağı — a 3,917 m
 *     volcano with no glacier — it printed a crevasse rescue kit as ESSENTIAL
 *     (measured 2026-09-11). A reference goal gets the athlete's own pack
 *     planner and a sentence saying why there is no list; see
 *     `REFERENCE_NO_KIT_LIST`.
 */

const STATUSES: ItemStatus[] = ["have", "need", "replace", "borrow", "rent", "n/a"];

const PACK_KINDS: PackKind[] = ["base", "consumable", "water"];

const INPUT_CLASS =
  "h-11 w-full rounded-tile border border-hairline bg-elevated/40 px-3.5 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50";

export default function Checklist() {
  const { goalId } = useParams<{ goalId: string }>();
  const {
    goals,
    can,
    checklistStatuses,
    setChecklistStatus,
    clearChecklistStatus,
    packItems,
    addPackItem,
    removePackItem,
    packTargetGrams,
    setPackTarget,
  } = useApp();

  const goal = goals.find((g) => g.id === goalId);
  const curated = goal?.mountainId ? sync.mountainById(goal.mountainId) : undefined;
  const elevationM = goal?.elevationM;
  const lat = goal?.lat ?? curated?.coords.lat;
  const lon = goal?.lon ?? curated?.coords.lon;

  const generated = useMemo(
    () =>
      goal === undefined || elevationM === undefined || curated === undefined
        ? null
        : generateChecklist({ name: goal.name, elevationM, lat, lon }),
    [goal, elevationM, lat, lon, curated],
  );

  // Read for the competences the list assumes and whether a guide is advised.
  // Latitude only drives the season window, which this screen never states.
  // Surveyed mountains only — rule 4 above.
  const assessment = useMemo(
    () =>
      elevationM === undefined || curated === undefined
        ? null
        : assessPeak(elevationM, lat ?? 0, lon),
    [elevationM, lat, lon, curated],
  );

  const statuses = useMemo(
    () => (goalId ? (checklistStatuses[goalId] ?? {}) : {}),
    [checklistStatuses, goalId],
  );

  const fullList = can("equipment.checklist.full");
  const canDocuments = can("equipment.documents");

  /**
   * What this athlete can see.
   *
   * The free plan gets the essentials; Pro adds the mountain-specific items and
   * the documents. The first rule wins over both: an item the athlete has
   * already recorded something against is ALWAYS shown, because a plan that
   * lapses must not take away what they told us. Nothing is withdrawn.
   */
  const visibleItems = useMemo(() => {
    if (!generated) return [];
    return generated.items.filter((item) => {
      if (statuses[item.id] !== undefined) return true;
      if (item.category === "documents") return canDocuments;
      return fullList || item.essential;
    });
  }, [generated, statuses, canDocuments, fullList]);

  const hiddenCount = (generated?.items.length ?? 0) - visibleItems.length;

  // Computed over the items in front of the athlete rather than the full
  // generated list: a figure that counted rows they cannot see would be a score
  // against a hidden denominator.
  const progress = useMemo(() => completion(visibleItems, statuses), [visibleItems, statuses]);

  const visibleCategories = useMemo(() => {
    if (!generated) return [];
    const shown = new Set(visibleItems.map((i) => i.id));
    return generated.categories
      .map((c) => ({ ...c, items: c.items.filter((i) => shown.has(i.id)) }))
      .filter((c) => c.items.length > 0);
  }, [generated, visibleItems]);

  const pack = useMemo(() => (goalId ? (packItems[goalId] ?? []) : []), [packItems, goalId]);
  const targetGrams = goalId ? packTargetGrams[goalId] : undefined;

  if (!goalId || !goal) return <Navigate to="/goals" replace />;

  /* -- A reference entry: the athlete's own pack, and no derived list ------ */

  if (!curated) {
    const totals = packTotals(pack);
    const packGranted = can("equipment.pack") || pack.length > 0;
    return (
      <Screen padded={false}>
        <div className="px-5">
          <ScreenHeader
            title="Equipment"
            subtitle={
              elevationM === undefined
                ? goal.name
                : `${goal.name} · ${fmtElevation(elevationM)} m · ${TIER_EYEBROW.reference}`
            }
            back={`/goals/${goal.id}`}
            className="pb-4"
          />
        </div>
        <Stagger className="px-5">
          <Rise className="pt-1">
            <Card>
              <p className="section-label text-mist-dim">No kit list</p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-mist">{REFERENCE_NO_KIT_LIST}</p>
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">{REFERENCE_NEXT_STEP}</p>
            </Card>
          </Rise>

          <Rise className="pt-8">
            <SectionLabel>Pack</SectionLabel>
            {packGranted ? (
              <Pack
                items={pack}
                targetGrams={targetGrams}
                onAdd={(item) => addPackItem(goalId, item)}
                onRemove={(id) => removePackItem(goalId, id)}
                onTarget={(grams) => setPackTarget(goalId, grams)}
                totals={totals}
              />
            ) : (
              <UpgradePrompt
                featureId="equipment.pack"
                title="Weigh the pack before the mountain does it for you."
                body="Pro adds itemised pack weights split into base, consumables and water, with a total and an optional target."
                className="mt-3"
              />
            )}
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  /* -- A goal with no mountain under it ------------------------------------ */

  if (elevationM === undefined || !generated || !assessment) {
    return (
      <Screen padded={false}>
        <div className="px-5">
          <ScreenHeader
            title="Equipment"
            subtitle={goal.name}
            back={`/goals/${goal.id}`}
            className="pb-4"
          />
        </div>
        <Stagger className="px-5">
          <Rise className="pt-1">
            <Card className="py-8">
              {/* No elevation means no band, and the band is what the entire
                  list is derived from. Guessing one would produce a confident
                  kit list for a mountain ICEFALL knows nothing about. */}
              <UnavailableState reason="no-data" size="lg" />
              <p className="mt-4 text-center text-[13px] leading-relaxed text-mist">
                This objective has no elevation recorded, so ICEFALL cannot work out what class of
                mountain it is — and the kit list follows entirely from that.
              </p>
            </Card>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  const totals = packTotals(pack);
  // The planner is a growth surface only while it is empty. Once the athlete has
  // weighed something it is their data, and their data is never taken away.
  const packGranted = can("equipment.pack") || pack.length > 0;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Equipment"
          subtitle={`${goal.name} · ${fmtElevation(elevationM)} m · ${curated.difficultyLabel}`}
          back={`/goals/${goal.id}`}
          className="pb-4"
        />
      </div>

      <Stagger className="px-5">
        {/* -- Completion -------------------------------------------------- */}

        <Rise className="pt-1">
          <Card>
            <div className="flex flex-col items-center">
              <ScoreRing
                // Never a zero standing in for "nothing to count". When every
                // item has been struck out as not applicable the ring is dashed
                // and the sentence below says what happened.
                score={progress.applicable === 0 ? unavailable("no-data") : known(progress.overall)}
                unit="%"
                size={132}
              />
              {progress.applicable === 0 ? (
                <p className="mt-4 max-w-[34ch] text-center text-[12px] leading-relaxed text-mist">
                  Every item on this list is marked not applicable, so there is nothing left to
                  count.
                </p>
              ) : (
                <>
                  <p className="tnum mt-4 text-[13px] text-snow">
                    {progress.resolved} of {progress.applicable} sorted
                  </p>
                  <p className="mt-1.5 max-w-[36ch] text-center text-[11px] leading-relaxed text-mist-dim">
                    Have, borrowing and renting count towards this. Anything marked N/A is left out
                    of the figure entirely, and anything you have not reviewed counts as
                    outstanding.
                  </p>
                </>
              )}
            </div>
          </Card>
        </Rise>

        {/* -- By category -------------------------------------------------- */}

        <Rise className="pt-6">
          <SectionLabel>By category</SectionLabel>
          <Card className="mt-3">
            {visibleCategories.map((category) => {
              const applicable = progress.applicableByCategory[category.id];
              return (
                <FactorBar
                  key={category.id}
                  label={category.label}
                  // A category the athlete has struck out entirely is unknown,
                  // not zero per cent done.
                  score={
                    applicable === 0
                      ? unavailable("no-data")
                      : known(progress.byCategory[category.id])
                  }
                  note={`${progress.resolvedByCategory[category.id]} of ${applicable} sorted`}
                />
              );
            })}
          </Card>
        </Rise>

        {/* -- What the list assumes ---------------------------------------- */}

        <Rise className="pt-6">
          <SectionLabel>What this list assumes</SectionLabel>
          <Card className="mt-3">
            <ul className="space-y-2.5">
              {assessment.skills.map((skill) => (
                <li key={skill} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                  {skill}
                </li>
              ))}
            </ul>
            {assessment.requiresGuide && (
              <Disclaimer className="mt-4">
                At this grade the kit only works alongside the competence to use it. ICEFALL defers
                to an IFMGA/UIAGM-certified guide for anything glaciated, technical or at altitude,
                and their kit list replaces this one.
              </Disclaimer>
            )}
          </Card>
        </Rise>

        {/* -- The list ----------------------------------------------------- */}

        {hiddenCount > 0 && (
          <Rise className="pt-6">
            <UpgradePrompt
              featureId="equipment.checklist.full"
              title={`${hiddenCount} further items are derived from this mountain.`}
              body="Pro adds the altitude, glacier and expedition kit for this peak, the permits and insurance section, and the reason each item is on the list."
            />
          </Rise>
        )}

        {visibleCategories.map((category) => (
          <Rise key={category.id} className="pt-6">
            <SectionLabel>{category.label}</SectionLabel>
            <Card className="mt-3" inset={false}>
              {category.items.map((item, i) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  status={statuses[item.id]}
                  showDetail={fullList}
                  first={i === 0}
                  onSet={(status) => setChecklistStatus(goalId, item.id, status)}
                  onClear={() => clearChecklistStatus(goalId, item.id)}
                />
              ))}
            </Card>
          </Rise>
        ))}

        <Rise className="pt-4">
          <p className="text-[11px] leading-relaxed text-mist-dim">
            Items without the ICEFALL mark are made by other manufacturers. ICEFALL does not sell
            them, does not recommend a brand, and earns nothing from any of them.
          </p>
        </Rise>

        {/* -- Pack --------------------------------------------------------- */}

        <Rise className="pt-8">
          <SectionLabel>Pack</SectionLabel>
          {packGranted ? (
            <Pack
              items={pack}
              targetGrams={targetGrams}
              onAdd={(item) => addPackItem(goalId, item)}
              onRemove={(id) => removePackItem(goalId, id)}
              onTarget={(grams) => setPackTarget(goalId, grams)}
              totals={totals}
            />
          ) : (
            <UpgradePrompt
              featureId="equipment.pack"
              title="Weigh the pack before the mountain does it for you."
              body="Pro adds itemised pack weights split into base, consumables and water, with a total and an optional target."
              className="mt-3"
            />
          )}
        </Rise>

        {/* -- Disclaimer ---------------------------------------------------- */}

        <Rise className="pt-8">
          <Disclaimer>{CHECKLIST_DISCLAIMER}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* One item                                                                   */
/* -------------------------------------------------------------------------- */

function ItemRow({
  item,
  status,
  showDetail,
  first,
  onSet,
  onClear,
}: {
  item: ChecklistItem;
  status: ItemStatus | undefined;
  showDetail: boolean;
  first: boolean;
  onSet: (status: ItemStatus) => void;
  onClear: () => void;
}) {
  return (
    <div className={cn("px-4 py-3.5", !first && "border-t border-hairline")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug text-snow">{item.label}</p>
          {showDetail && item.detail && (
            <p className="mt-1 text-[12px] leading-relaxed text-mist-dim">{item.detail}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {item.essential && <Badge tone="neutral">Essential</Badge>}
          {/* The only brand claim on the row, and it is only made where it is
              true: the range is apparel and packs, nothing else. */}
          {!item.thirdParty && <Badge tone="azure">ICEFALL</Badge>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {STATUSES.map((s) => {
          const active = status === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              // Tapping the active status clears it rather than re-asserting it,
              // so a mis-tap is one tap to undo instead of a permanent claim.
              onClick={() => (active ? onClear() : onSet(s))}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.1em] transition-colors",
                active
                  ? "border-azure/50 bg-azure/10 text-azure"
                  : "border-hairline-strong text-mist-dim hover:border-azure/30 hover:text-mist",
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>

      {(status === "need" || status === "replace") && <FindEquipmentSlot />}
    </div>
  );
}

/**
 * The one place this screen would love to send someone shopping, and cannot.
 *
 * ICEFALL has no retailers, no affiliates and no commercial relationships of
 * any kind. The slot exists because the need is real, and it is disabled and
 * explains itself rather than linking to a search page dressed up as a partner.
 */
function FindEquipmentSlot() {
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled
        className="flex w-full items-center gap-2.5 rounded-tile border border-dashed border-hairline-strong px-3.5 py-3 text-left text-mist-dim disabled:cursor-not-allowed disabled:opacity-70"
      >
        <Search size={14} strokeWidth={1.6} className="shrink-0" />
        <span className="text-[12px] leading-snug">Find equipment — not available</span>
      </button>
      <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
        ICEFALL has no retail partners yet, so there is nowhere honest to send you. Your local
        mountaineering shop or hire service is the better answer in the meantime.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pack                                                                       */
/* -------------------------------------------------------------------------- */

const KIND_COLOUR: Record<PackKind, string> = {
  base: "var(--ice-azure)",
  consumable: "oklch(1 0 0 / 34%)",
  water: "oklch(1 0 0 / 16%)",
};

function Pack({
  items,
  totals,
  targetGrams,
  onAdd,
  onRemove,
  onTarget,
}: {
  items: PackItem[];
  totals: PackTotals;
  targetGrams: number | undefined;
  onAdd: (item: Omit<PackItem, "id">) => void;
  onRemove: (id: string) => void;
  onTarget: (grams: number | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [grams, setGrams] = useState("");
  const [kind, setKind] = useState<PackKind>("base");

  const submit = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const parsed = Number(grams.trim());
    // Anything that is not a usable positive number is stored as NO WEIGHT, not
    // as zero. The athlete gets an unweighed row they can see, rather than a
    // total that silently swallowed a blank field.
    const weight =
      grams.trim() !== "" && Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
    onAdd({ label: trimmed, grams: weight, kind });
    setLabel("");
    setGrams("");
  };

  const segments = PACK_KINDS.filter((k) => totals[k] > 0).map((k) => ({
    id: k,
    label: PACK_KIND_LABEL[k],
    value: totals[k],
    color: KIND_COLOUR[k],
  }));

  /**
   * What a line in the legend is allowed to say.
   *
   * "0 g" is only true when the athlete owns nothing of that kind. Where they
   * have listed items and not weighed them, the subtotal is UNKNOWN, and a zero
   * would read as a category that weighs nothing.
   */
  const kindReading = (k: PackKind): string => {
    const ofKind = items.filter((i) => i.kind === k);
    if (ofKind.length === 0) return "None listed";
    if (!ofKind.some((i) => i.grams !== null)) return "Unweighed";
    return fmtGrams(totals[k]);
  };

  return (
    <>
      <Card className="mt-3">
        {totals.weighed === 0 ? (
          <div className="py-2">
            {/* Nothing has been weighed, so there is no total. A "0 kg" here
                would be a measurement ICEFALL never took. */}
            <UnavailableState reason="not-reported" size="md" />
            <p className="mt-3 text-center text-[12px] leading-relaxed text-mist">
              Add what you are carrying and enter the weights you measure. ICEFALL never fills a
              weight in for you.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <DonutChart segments={segments} size={104} />
            <div className="min-w-0 flex-1">
              <p className="section-label">Total weighed</p>
              <p className="tnum mt-1.5 text-[26px] font-extralight leading-none text-snow">
                {fmtGrams(totals.total)}
              </p>
              <ul className="mt-3 space-y-1.5">
                {PACK_KINDS.map((k) => (
                  <li key={k} className="flex items-center gap-2 text-[12px]">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: KIND_COLOUR[k] }}
                    />
                    <span className="flex-1 text-mist">{PACK_KIND_LABEL[k]}</span>
                    <span className="tnum text-mist-dim">{kindReading(k)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {totals.unweighed > 0 && (
          <p className="mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
            {totals.unweighed} {totals.unweighed === 1 ? "item has" : "items have"} no weight
            entered and {totals.unweighed === 1 ? "is" : "are"} left out of the total. The pack
            weighs more than the figure above.
          </p>
        )}
      </Card>

      {items.length > 0 && (
        <Card className="mt-2.5" inset={false}>
          {items.map((item, i) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                i !== 0 && "border-t border-hairline",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-snow">{item.label}</p>
                <p className="section-label mt-1 text-[9px]">{PACK_KIND_LABEL[item.kind]}</p>
              </div>
              {item.grams === null ? (
                <span className="shrink-0 text-[11px] text-mist-dim">Unweighed</span>
              ) : (
                <span className="tnum shrink-0 text-[13px] text-mist">{fmtGrams(item.grams)}</span>
              )}
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.label}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-mist-dim transition-colors hover:bg-white/[0.05] hover:text-snow"
              >
                <Trash2 size={14} strokeWidth={1.6} />
              </button>
            </div>
          ))}
        </Card>
      )}

      <Card className="mt-2.5">
        <div className="flex items-center gap-2.5">
          <Backpack size={15} strokeWidth={1.5} className="shrink-0 text-azure/70" />
          <p className="section-label">Add an item</p>
        </div>

        <div className="mt-3 space-y-2.5">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What are you carrying?"
            aria-label="Item name"
            className={INPUT_CLASS}
          />
          <input
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Weight in grams — leave blank if you have not weighed it"
            aria-label="Weight in grams, optional"
            className={cn(INPUT_CLASS, "tnum")}
          />
          <div className="flex flex-wrap gap-1.5">
            {PACK_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.1em] transition-colors",
                  kind === k
                    ? "border-azure/50 bg-azure/10 text-azure"
                    : "border-hairline-strong text-mist-dim hover:border-azure/30 hover:text-mist",
                )}
              >
                {PACK_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <Button variant="secondary" className="w-full" onClick={submit} disabled={!label.trim()}>
            <Plus size={15} strokeWidth={1.8} />
            Add to pack
          </Button>
        </div>
      </Card>

      <Card className="mt-2.5">
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] text-snow">Target weight</p>
            <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">
              Optional, and yours to set — ICEFALL has no view on what your pack should weigh. Your
              guide or operator may.
            </p>
          </div>
          <div className="flex shrink-0 items-baseline gap-1">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={targetGrams === undefined ? "" : (targetGrams / 1000).toString()}
              onChange={(e) => {
                const kg = Number(e.target.value);
                onTarget(e.target.value.trim() === "" || !Number.isFinite(kg) ? null : kg * 1000);
              }}
              aria-label="Target pack weight in kilograms"
              className="tnum h-10 w-[84px] rounded-tile border border-hairline bg-elevated/40 px-3 text-right text-[15px] text-snow outline-none focus:border-azure/50"
            />
            <span className="text-[12px] text-mist">kg</span>
          </div>
        </div>

        {targetGrams !== undefined && totals.weighed > 0 && (
          <p className="tnum mt-3 border-t border-hairline pt-3 text-[12px] leading-relaxed text-mist">
            {totals.total <= targetGrams
              ? `${fmtGrams(targetGrams - totals.total)} under your target`
              : `${fmtGrams(totals.total - targetGrams)} over your target`}
            {totals.unweighed > 0 && (
              <span className="text-mist-dim">
                {` — before the ${totals.unweighed} unweighed ${totals.unweighed === 1 ? "item" : "items"}.`}
              </span>
            )}
          </p>
        )}
      </Card>
    </>
  );
}
