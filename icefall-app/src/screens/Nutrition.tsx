import { Camera, Plus } from "lucide-react";
import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { MacroBar, ProgressRing } from "@/components/ui/charts";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { CoachInsight } from "@/components/domain/cards";
import { fmtTime } from "@/lib/format";
import { sync } from "@/services/repository";
import { useApp } from "@/state/AppState";

/** Screen 09 — fuelling, framed as performance rather than as medicine. */
export default function Nutrition() {
  const day = sync.nutrition;
  const { hydrationMl, addHydration } = useApp();

  const consumed = day.meals.reduce(
    (a, m) => ({
      calories: a.calories + m.calories,
      carbsG: a.carbsG + m.macros.carbsG,
      proteinG: a.proteinG + m.macros.proteinG,
      fatG: a.fatG + m.macros.fatG,
    }),
    { calories: 0, carbsG: 0, proteinG: 0, fatG: 0 },
  );

  const pct = Math.min(100, (consumed.calories / day.calorieTarget) * 100);

  return (
    <Screen>
      <Stagger>
        {/* A detail view (the tab strip is hidden here), so it carries the
            same header-with-back every sibling detail screen uses. */}
        <Rise>
          <ScreenHeader title="Daily intake" subtitle="Today" back="/coach/today" />
        </Rise>

        {/* Energy + macros */}
        <Rise className="pt-5">
          <Card>
            <div className="flex items-center gap-6">
              <ProgressRing value={pct} size={104} stroke={4}>
                <div className="text-center">
                  <div className="tnum text-[20px] font-light leading-none text-snow">
                    {consumed.calories.toLocaleString("en-GB")}
                  </div>
                  <div className="tnum mt-1 text-[10px] text-mist-dim">
                    / {day.calorieTarget.toLocaleString("en-GB")}
                  </div>
                </div>
              </ProgressRing>

              <dl className="flex-1 space-y-3.5">
                <Macro
                  label="Carbs"
                  value={consumed.carbsG}
                  target={day.macroTarget.carbsG}
                  color="var(--ice-azure)"
                />
                <Macro
                  label="Protein"
                  value={consumed.proteinG}
                  target={day.macroTarget.proteinG}
                  color="var(--ice-summit)"
                />
                <Macro
                  label="Fat"
                  value={consumed.fatG}
                  target={day.macroTarget.fatG}
                  color="var(--ice-mist)"
                />
              </dl>
            </div>

            <MacroBar
              className="mt-5"
              segments={[
                { label: "carbs", value: consumed.carbsG * 4, color: "var(--ice-azure)" },
                { label: "protein", value: consumed.proteinG * 4, color: "var(--ice-summit)" },
                { label: "fat", value: consumed.fatG * 9, color: "var(--ice-mist)" },
              ]}
            />
          </Card>
        </Rise>

        {/* Hydration */}
        <Rise className="pt-6">
          <SectionLabel>Hydration</SectionLabel>
          <Card className="mt-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="tnum text-[24px] font-light leading-none text-snow">
                  {(hydrationMl / 1000).toFixed(1)}
                  <span className="ml-1 text-[12px] text-mist">
                    / {(day.hydrationTargetMl / 1000).toFixed(1)} L
                  </span>
                </div>
                <p className="section-label mt-2.5">
                  {hydrationMl >= day.hydrationTargetMl
                    ? "Target met"
                    : `${day.hydrationTargetMl - hydrationMl} ml remaining`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => addHydration(250)}>
                  +250
                </Button>
                <Button size="sm" variant="secondary" onClick={() => addHydration(500)}>
                  +500
                </Button>
              </div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-azure transition-[width] duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
                style={{ width: `${Math.min(100, (hydrationMl / day.hydrationTargetMl) * 100)}%` }}
              />
            </div>
          </Card>
        </Rise>

        {/* Meals */}
        <Rise className="pt-6">
          <SectionLabel
            action={
              <button type="button" className="section-label transition-colors hover:text-azure">
                Add
              </button>
            }
          >
            Meals
          </SectionLabel>
          <Card className="mt-3" inset={false}>
            <div className="px-4">
              {day.meals.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3.5 border-b border-hairline py-3.5 last:border-0"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-slate">
                    <span className="section-label text-mist">{m.slot[0].toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-snow">{m.name}</p>
                    <p className="truncate text-[11px] text-mist-dim">{m.detail}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-[13px] text-snow">{m.calories}</p>
                    <p className="tnum text-[10px] text-mist-dim">{fmtTime(m.loggedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="mt-3 flex gap-2.5">
            <Button variant="secondary" className="flex-1">
              <Plus size={15} strokeWidth={1.8} /> Log a meal
            </Button>
            <Button variant="secondary" size="icon" aria-label="Photograph food">
              <Camera size={16} strokeWidth={1.6} />
            </Button>
          </div>
        </Rise>

        <Rise className="pt-6">
          <CoachInsight title="ICEFALL Insight">{day.insight}</CoachInsight>
        </Rise>

        <Rise className="pt-5">
          <Disclaimer>
            Nutrition guidance in ICEFALL is general and performance-oriented. It is not medical or
            dietetic advice — for individualised plans, or with any medical condition, consult a
            registered dietitian or your doctor.
          </Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Macro({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <dt className="text-[12px] text-mist">{label}</dt>
        <dd className="tnum text-[12px] text-snow">
          {value}
          <span className="text-mist-dim"> / {target} g</span>
        </dd>
      </div>
      <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(.22,1,.36,1)]"
          style={{ width: `${Math.min(100, (value / target) * 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}
