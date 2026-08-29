import { Camera, Plus, UtensilsCrossed } from "lucide-react";
import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { MacroBar, ProgressRing } from "@/components/ui/charts";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { CoachInsight } from "@/components/domain/cards";
import { IMAGE_ANALYSIS_NOTE, NUTRITION_DISCLAIMER } from "@/coach/nutrition";
import { fmtTime } from "@/lib/format";
import { sync } from "@/services/repository";
import { useApp } from "@/state/AppState";
import type { NutritionDay } from "@/types";

/**
 * Screen 09 — fuelling, framed as performance rather than as medicine.
 *
 * TWO THINGS THIS SCREEN GOT WRONG, AND WHY THEY MATTERED
 *
 * 1. IT SHOWED FOUR MEALS NOBODY ATE. The fixture's breakfast, snack, lunch and
 *    second snack were rendered with their `loggedAt` times formatted as 07:20,
 *    10:30, 13:15 and 16:40 — today. A timestamp is what makes a row read as a
 *    record rather than an example, and beside them sat a 2,800 kcal target and
 *    380 g of carbohydrate that no engine in this app computed for anybody.
 *    `coach/nutrition.ts` exists to derive fuelling guidance and is not wired up
 *    yet, so in an ordinary build there is no target and nothing logged, and the
 *    screen now says exactly that.
 *
 * 2. IT WROTE ITS OWN DISCLAIMER. `coach/nutrition.ts` exports two constants
 *    that were written to be rendered verbatim, and both sat unused while this
 *    file carried a two-sentence substitute of its own. The substitute dropped
 *    both halves that do the work: no mention of medication, allergies,
 *    pregnancy or a difficult relationship with food, and no "ICEFALL sets no
 *    weight or body-composition targets" — the one sentence that separates a
 *    fuelling screen from every calorie app the athlete has already deleted.
 *    The photograph note was missing entirely, next to a camera button, against
 *    an expectation set by every other app that a photograph becomes macros.
 *    Here it does not. Render the constants; do not paraphrase them.
 */

/**
 * The demo day, in DEV only — see `tracking/feed.ts` for the same argument
 * about the same fixture athlete. In a production build there is no logged day
 * and no target, which is the truth until the fuelling engine is wired.
 */
const SEEDED_DAY: NutritionDay | null = import.meta.env.DEV ? sync.nutrition : null;

export default function Nutrition() {
  const day = SEEDED_DAY;
  const { hydrationMl, addHydration } = useApp();
  const meals = day?.meals ?? [];

  const consumed = meals.reduce(
    (a, m) => ({
      calories: a.calories + m.calories,
      carbsG: a.carbsG + m.macros.carbsG,
      proteinG: a.proteinG + m.macros.proteinG,
      fatG: a.fatG + m.macros.fatG,
    }),
    { calories: 0, carbsG: 0, proteinG: 0, fatG: 0 },
  );

  const pct = day ? Math.min(100, (consumed.calories / day.calorieTarget) * 100) : 0;
  const hydrationTargetMl = day?.hydrationTargetMl ?? null;

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
          {day ? (
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
          ) : (
            <Card>
              <p className="text-[13px] text-snow">No energy target</p>
              <p className="mt-2 text-[12px] leading-relaxed text-mist">
                ICEFALL has not worked out a daily energy or macronutrient figure for you. Doing
                that honestly needs your training load and your own measurements, and the fuelling
                guidance that would use them is not connected yet. Rather than show a number
                borrowed from an average, there is none.
              </p>
            </Card>
          )}
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
                    {hydrationTargetMl === null
                      ? "L"
                      : `/ ${(hydrationTargetMl / 1000).toFixed(1)} L`}
                  </span>
                </div>
                <p className="section-label mt-2.5">
                  {hydrationTargetMl === null
                    ? "Logged today"
                    : hydrationMl >= hydrationTargetMl
                      ? "Target met"
                      : `${hydrationTargetMl - hydrationMl} ml remaining`}
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
            {hydrationTargetMl !== null && (
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-azure transition-[width] duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
                  style={{ width: `${Math.min(100, (hydrationMl / hydrationTargetMl) * 100)}%` }}
                />
              </div>
            )}
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

          {meals.length > 0 ? (
            <Card className="mt-3" inset={false}>
              <div className="px-4">
                {meals.map((m) => (
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
          ) : (
            <Card className="mt-3">
              <div className="flex items-start gap-3">
                <UtensilsCrossed size={16} strokeWidth={1.5} className="mt-px shrink-0 text-mist-dim" />
                <p className="text-[12px] leading-relaxed text-mist">
                  Nothing logged today. Anything you add here is yours — ICEFALL does not fill this
                  list in for you.
                </p>
              </div>
            </Card>
          )}

          <div className="mt-3 flex gap-2.5">
            <Button variant="secondary" className="flex-1">
              <Plus size={15} strokeWidth={1.8} /> Log a meal
            </Button>
            <Button variant="secondary" size="icon" aria-label="Photograph food">
              <Camera size={16} strokeWidth={1.6} />
            </Button>
          </div>

          {/* Next to the camera, where the expectation it defeats is formed. */}
          <Disclaimer className="mt-3">{IMAGE_ANALYSIS_NOTE}</Disclaimer>
        </Rise>

        {day && (
          <Rise className="pt-6">
            <CoachInsight title="ICEFALL Insight">{day.insight}</CoachInsight>
          </Rise>
        )}

        {/* DEV only, because `SEEDED_DAY` is. Said out loud so a screenshot of
            this screen is never mistaken for what the product does: the meals,
            the times beside them and both targets come from the demo athlete. */}
        {day && (
          <Rise className="pt-5">
            <Disclaimer>
              Development build. The meals, their times and the energy and hydration targets above
              are the demo athlete's, not yours — nothing here was logged and no target was
              calculated for anybody. A production build shows none of it.
            </Disclaimer>
          </Rise>
        )}

        <Rise className="pt-5">
          <Disclaimer>{NUTRITION_DISCLAIMER}</Disclaimer>
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
