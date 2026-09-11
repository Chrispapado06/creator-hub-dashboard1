import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Group } from "@/components/settings/kit";
import {
  BENCHMARK_STORAGE_NOTICE,
  BENCHMARK_TESTS,
  NO_PASS_MARK_NOTICE,
  PACK_WEIGHT_NOTICE,
  addBenchmarkResult,
  benchmarkSchedule,
  forgetBenchmarkResult,
  latestComparison,
  localDateKey,
  resultFromActivity,
  resultsForTest,
  suggestTest,
  useBenchmarkResults,
  verticalRate,
  type BenchmarkResult,
  type BenchmarkTestId,
} from "@/tracking/benchmarks";
import { useRecordedActivities } from "@/tracking/feed";
import { cn } from "@/lib/utils";

/**
 * BENCHMARK TESTS — the screen that turns "I feel fitter" into a figure.
 *
 * ============================================================================
 * WHAT IS AND IS NOT ON THIS PAGE
 * ============================================================================
 *
 * There is NO TARGET TIME anywhere on it, because `tracking/benchmarks.ts`
 * holds none. The tests prescribe a height and a pack — the measurement — and
 * nothing prescribes how fast anybody should do it. `NO_PASS_MARK_NOTICE` is
 * the first thing the athlete reads, above the tests, so nobody arrives at the
 * form expecting a verdict.
 *
 * The one comparison drawn is against THE SAME ATHLETE'S LAST RESULT ON THE
 * SAME TEST, and the engine refuses it in six cases — different test, different
 * pack, different climb, too soon, same day, unusable figures. When it refuses,
 * this screen prints the refusal. That is the whole point: a comparison that
 * cannot be honestly drawn is more useful said out loud than quietly not drawn.
 *
 * ============================================================================
 * THREE PROVENANCE LABELS, NOT ONE — RULE 5
 * ============================================================================
 *
 * A result reads "Measured" only when its time and ascent came off a recorded
 * activity. THE PACK IS ALWAYS THE ATHLETE'S OWN FIGURE whichever way the rest
 * arrived, because nothing ICEFALL records says what anybody was carrying —
 * which is exactly what `Benchmark.tsx` already tells them about the
 * pack-endurance demand. `PACK_WEIGHT_NOTICE` sits under the pack field rather
 * than in a footnote.
 *
 * ============================================================================
 * NO BOXES. Flat rows, hairlines and spacing — the same shapes as
 * `/coach/plan/changes` and `/coach/memory`, which this screen is a sibling of.
 */

const num = (v: string): number | null => {
  const n = Number(v.trim());
  return v.trim().length > 0 && Number.isFinite(n) ? n : null;
};

/** hh:mm or plain minutes. Athletes write both; neither is guessed at. */
function parseElapsed(raw: string): number | null {
  const v = raw.trim();
  if (v.length === 0) return null;
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(v);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m} min`;
}

function readableDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const FIELD =
  "w-full rounded-none border-0 border-b border-hairline bg-transparent px-0 py-2 text-[15px] text-snow outline-none placeholder:text-mist focus:border-snow/40";

export default function Benchmarks() {
  const results = useBenchmarkResults();
  const activities = useRecordedActivities();

  /* The athlete's own biggest recorded day, which is the ONLY input to the
     suggestion. Simulated recordings are excluded here as everywhere else —
     a demo track is not evidence about a person. */
  const biggestDay = useMemo(() => {
    const real = activities.filter((a) => !a.simulated && a.elevationGainM > 0);
    if (real.length === 0) return null;
    return Math.max(...real.map((a) => a.elevationGainM));
  }, [activities]);

  const suggestion = useMemo(() => suggestTest(biggestDay), [biggestDay]);

  /* Which test is open. Defaults to the one the athlete already has history on
     — repeating the same test is the entire value — and only falls back to the
     suggestion when there is none. */
  const [testId, setTestId] = useState<BenchmarkTestId>(() => {
    const withHistory = BENCHMARK_TESTS.filter((t) => results.some((r) => r.testId === t.id));
    if (withHistory.length > 0) return withHistory[0].id;
    return suggestion.suggested?.id ?? "hill-400-10";
  });

  const test = BENCHMARK_TESTS.find((t) => t.id === testId) ?? BENCHMARK_TESTS[0];
  const schedule = useMemo(() => benchmarkSchedule(results, testId), [results, testId]);
  const series = useMemo(() => resultsForTest(results, testId), [results, testId]);
  const comparison = useMemo(() => latestComparison(results, testId), [results, testId]);

  /* ---- The form -------------------------------------------------------- */

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(localDateKey());
  const [elapsed, setElapsed] = useState("");
  const [ascent, setAscent] = useState("");
  const [pack, setPack] = useState(String(test.packKg));
  const [effort, setEffort] = useState("");
  const [note, setNote] = useState("");
  /* Set only when the figures were pulled off a recorded activity. Cleared the
     moment the athlete edits a field, because a hand-edited figure is not a
     measured one and must not keep the "Measured" label. */
  const [fromActivity, setFromActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recent = useMemo(
    () => activities.filter((a) => !a.simulated && a.elevationGainM > 0).slice(0, 12),
    [activities],
  );

  const typed = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setFromActivity(null);
  };

  function pull(activityId: string) {
    const activity = activities.find((a) => a.id === activityId);
    if (!activity) return;
    const draft = resultFromActivity({ activity, testId, packKg: Number(pack) || test.packKg });
    if (!draft) {
      setError("That recording has no usable time or ascent, so it cannot stand as a result.");
      return;
    }
    setDate(draft.date);
    setElapsed(String(draft.elapsedMin));
    setAscent(String(draft.ascentM));
    setFromActivity(activity.id);
    setError(null);
  }

  function save() {
    const minutes = parseElapsed(elapsed);
    const climbed = num(ascent);
    const kg = num(pack);

    if (minutes === null || minutes <= 0) {
      setError("Give the elapsed time, either as minutes or as h:mm.");
      return;
    }
    if (climbed === null || climbed <= 0) {
      setError("Give the ascent your watch recorded, in metres.");
      return;
    }
    if (kg === null || kg < 0) {
      setError("Give the pack weight in kilograms. It is the other half of the measurement.");
      return;
    }

    const saved = addBenchmarkResult({
      testId,
      date,
      elapsedMin: minutes,
      ascentM: climbed,
      packKg: kg,
      /* "recorded" is only reachable when the figures came off an activity and
         have not been edited since. Anything else is the athlete's own. */
      provenance: fromActivity ? "recorded" : "self-reported",
      activityId: fromActivity ?? undefined,
      effort: num(effort) ?? undefined,
      note,
    });

    if (!saved) {
      setError(
        "Those figures are outside anything ICEFALL will file as a result. Check them over.",
      );
      return;
    }

    setOpen(false);
    setElapsed("");
    setAscent("");
    setEffort("");
    setNote("");
    setFromActivity(null);
    setError(null);
  }

  const provenanceLabel = (r: BenchmarkResult) =>
    r.provenance === "recorded" ? "Measured" : "You told ICEFALL";

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Benchmark tests"
          subtitle="Kept on this device"
          back="/coach/progress"
          large
        />
      </div>

      <Stagger className="px-5">
        <Rise>
          <p className="text-[13px] leading-relaxed text-mist">{NO_PASS_MARK_NOTICE}</p>
          <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
            Do one every four to six weeks, on the same hill, with the same pack. What changes
            between two of them is the only thing here that means anything.
          </p>
        </Rise>

        {/* ---- Which test ------------------------------------------------ */}

        <Group label="The test">
          <div>
            {BENCHMARK_TESTS.map((t) => {
              const selected = t.id === testId;
              const done = results.filter((r) => r.testId === t.id).length;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTestId(t.id);
                    setPack(String(t.packKg));
                    setFromActivity(null);
                  }}
                  className="-mx-5 flex w-[calc(100%+2.5rem)] items-start gap-3.5 border-t border-hairline px-5 py-3.5 text-left first:border-t-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[15px]", selected ? "text-snow" : "text-mist")}>
                      {t.name}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-mist">
                      {t.ascentM} m of ascent, {t.packKg} kg pack
                      {done > 0 ? ` · ${done} recorded` : ""}
                    </p>
                  </div>
                  {selected ? <span className="mt-1 text-[12px] text-azure">Open</span> : null}
                </button>
              );
            })}
          </div>
        </Group>

        <Rise>
          <p className="text-[13px] leading-relaxed text-mist">{suggestion.because}</p>
        </Rise>

        {/* ---- Where it stands ------------------------------------------- */}

        <Group label="Where you stand">
          <p className="py-1 text-[14px] leading-relaxed text-snow">{schedule.note}</p>

          {comparison.comparable ? (
            <>
              <p className="mt-3 text-[15px] leading-relaxed text-snow">{comparison.summary}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">
                {comparison.daysApart} days apart. {comparison.confounders}
              </p>
            </>
          ) : (
            <p className="mt-3 text-[13px] leading-relaxed text-mist">{comparison.reason}</p>
          )}
        </Group>

        {/* ---- What the test is ------------------------------------------ */}

        <Group label="What to do">
          <ol className="list-none">
            {test.protocol.map((step, i) => (
              <li
                key={step}
                className="flex gap-3.5 border-t border-hairline py-3 text-[14px] leading-relaxed text-snow first:border-t-0"
              >
                <span className="shrink-0 text-mist">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[13px] leading-relaxed text-mist">{test.why}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-mist">{test.limits}</p>
        </Group>

        {/* ---- Record one ------------------------------------------------ */}

        <Group label="Record a result">
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="-mx-5 w-[calc(100%+2.5rem)] px-5 py-3.5 text-left text-[15px] text-azure"
            >
              Add a {test.name.toLowerCase()}
            </button>
          ) : (
            <div className="pt-1">
              {recent.length > 0 ? (
                <div className="border-b border-hairline pb-3">
                  <p className="text-[12.5px] text-mist">
                    Pull the time and ascent off a recording, and they stay labelled as measured.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {recent.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => pull(a.id)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[12.5px]",
                          fromActivity === a.id
                            ? "border-azure/50 text-azure"
                            : "border-hairline text-mist",
                        )}
                      >
                        {readableDay(a.startedAt.slice(0, 10))} · {Math.round(a.elevationGainM)} m
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="mt-3 block">
                <span className="text-[12.5px] text-mist">Date</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => typed(setDate)(e.target.value)}
                  className={FIELD}
                />
              </label>

              <label className="mt-3 block">
                <span className="text-[12.5px] text-mist">Elapsed time — minutes, or h:mm</span>
                <input
                  inputMode="text"
                  value={elapsed}
                  onChange={(e) => typed(setElapsed)(e.target.value)}
                  placeholder="1:58"
                  className={FIELD}
                />
              </label>

              <label className="mt-3 block">
                <span className="text-[12.5px] text-mist">
                  Ascent your watch recorded, in metres
                </span>
                <input
                  inputMode="numeric"
                  value={ascent}
                  onChange={(e) => typed(setAscent)(e.target.value)}
                  placeholder={String(test.ascentM)}
                  className={FIELD}
                />
              </label>

              <label className="mt-3 block">
                <span className="text-[12.5px] text-mist">Pack weight, in kilograms</span>
                <input
                  inputMode="decimal"
                  value={pack}
                  onChange={(e) => setPack(e.target.value)}
                  placeholder={String(test.packKg)}
                  className={FIELD}
                />
              </label>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{PACK_WEIGHT_NOTICE}</p>

              <label className="mt-3 block">
                <span className="text-[12.5px] text-mist">
                  How hard it felt, 1 to 10 — optional
                </span>
                <input
                  inputMode="numeric"
                  value={effort}
                  onChange={(e) => setEffort(e.target.value)}
                  className={FIELD}
                />
              </label>

              <label className="mt-3 block">
                <span className="text-[12.5px] text-mist">
                  Anything worth remembering — optional
                </span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Hot, went off too fast"
                  className={FIELD}
                />
              </label>

              {error ? <p className="mt-3 text-[13px] leading-relaxed text-snow">{error}</p> : null}

              <div className="mt-4 flex gap-5 pb-1">
                <button type="button" onClick={save} className="text-[15px] text-azure">
                  Save result
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                  }}
                  className="text-[15px] text-mist"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Group>

        {/* ---- History --------------------------------------------------- */}

        <Group label={series.length > 0 ? `Your results · ${series.length}` : "Your results"}>
          {series.length === 0 ? (
            <p className="py-3 text-[13px] leading-relaxed text-mist">
              Nothing recorded for this test yet. The first one is not a score — it is the line the
              next one is measured from.
            </p>
          ) : (
            <div>
              {[...series].reverse().map((r) => (
                <div
                  key={r.id}
                  className="-mx-5 flex items-start gap-3.5 border-t border-hairline px-5 py-3.5 first:border-t-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] text-snow">
                      {hhmm(r.elapsedMin)} · {r.ascentM} m · {r.packKg} kg
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-mist">
                      {readableDay(r.date)} · {Math.round(verticalRate(r))} m/h ·{" "}
                      {provenanceLabel(r)}
                      {r.effort ? ` · felt ${r.effort}/10` : ""}
                    </p>
                    {r.note ? (
                      <p className="mt-1 text-[13px] leading-relaxed text-mist">“{r.note}”</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => forgetBenchmarkResult(r.id)}
                    aria-label={`Delete the result from ${readableDay(r.date)}`}
                    className="-mr-2 mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
                  >
                    <Trash2 size={16} strokeWidth={1.7} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[12.5px] leading-relaxed text-mist">{BENCHMARK_STORAGE_NOTICE}</p>
        </Group>
      </Stagger>
    </Screen>
  );
}
