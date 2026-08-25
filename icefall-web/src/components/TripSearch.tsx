import { useState } from "react";
import { ChevronDown, Minus, Mountain, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui";
import { DateRangeField, type DateRange } from "@/components/DatePicker";
import { ORIGINS } from "@/lib/flights";
import {
  OBJECTIVES, TRIP_MODES, modeIncludesFlights, parseDay, isoDay,
  type TripMode, type TripSearch,
} from "@/lib/trip";
import { cn } from "@/lib/utils";

/**
 * The trip search — the thing the whole web app is organised around.
 *
 * You choose WHAT you're buying first (a guide, guide + flights, or the whole
 * package), then the mountain, dates, where you're flying from and how many of
 * you. Pressing Search does not book anything — it asks the question, and the
 * results page answers it. Used on the front page (hero) and again at the top of
 * the results page (bar) so a search is always editable in place.
 */
export function TripSearch({
  initial,
  variant = "hero",
  onSubmit,
}: {
  initial: TripSearch;
  variant?: "hero" | "bar";
  onSubmit: (s: TripSearch) => void;
}) {
  const [mode, setMode] = useState<TripMode>(initial.mode);
  const [objectiveId, setObjectiveId] = useState(initial.objectiveId);
  const [originCode, setOriginCode] = useState(initial.originCode);
  const [pax, setPax] = useState(initial.pax);
  const [range, setRange] = useState<DateRange>(() => {
    const from = parseDay(initial.startIso) ?? new Date();
    const to = parseDay(initial.endIso) ?? from;
    return { from, to };
  });

  const withFlights = modeIncludesFlights(mode);

  function submit() {
    onSubmit({
      mode,
      objectiveId,
      originCode,
      startIso: isoDay(range.from),
      endIso: isoDay(range.to),
      pax,
    });
  }

  return (
    <div
      className={cn(
        "rounded-card border border-hairline bg-graphite/90 p-3 backdrop-blur",
        variant === "hero" ? "max-w-[860px]" : "",
      )}
    >
      {/* What are you booking? Never let the labels wrap; scroll if truly tight. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="inline-flex w-max rounded-tile border border-hairline bg-obsidian/50 p-1">
          {TRIP_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                "whitespace-nowrap rounded-[8px] px-3 py-2 text-[12.5px] transition-colors",
                mode === m.id ? "bg-azure text-obsidian" : "text-mist hover:text-snow",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* The fields */}
      <div className="mt-3 flex flex-col gap-2.5 lg:flex-row lg:items-end">
        <Field label="Mountain" className="lg:flex-1">
          <Select value={objectiveId} onChange={setObjectiveId} icon={<Mountain size={15} strokeWidth={1.7} />}>
            {OBJECTIVES.map((o) => (
              <option key={o.id} value={o.id} className="bg-graphite text-snow">
                {o.mountain} · {o.region}
              </option>
            ))}
          </Select>
        </Field>

        {withFlights && (
          <Field label="Flying from" className="lg:w-[190px]">
            <Select value={originCode} onChange={setOriginCode}>
              {ORIGINS.map((o) => (
                <option key={o.code} value={o.code} className="bg-graphite text-snow">
                  {o.city} ({o.code})
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Dates" className="lg:w-[230px]">
          <DateRangeField value={range} onChange={setRange} />
        </Field>

        <Field label="Climbers" className="lg:w-[128px]">
          <PartyStepper value={pax} onChange={setPax} />
        </Field>

        <Button size="lg" className="lg:w-auto" onClick={submit}>
          <Search size={16} strokeWidth={2} />
          Search
        </Button>
      </div>

      <p className="mt-2.5 px-1 text-[11.5px] text-mist-dim">
        {TRIP_MODES.find((m) => m.id === mode)?.blurb}
      </p>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block px-1 text-[10.5px] uppercase tracking-[0.12em] text-mist-dim">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span className="relative flex items-center">
      {icon && <span className="pointer-events-none absolute left-3 text-mist-dim">{icon}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-[46px] w-full appearance-none truncate rounded-tile border border-hairline bg-obsidian/40 pr-9 text-[13.5px] text-snow outline-none transition-colors hover:border-hairline-strong focus:border-azure/55",
          icon ? "pl-9" : "pl-3.5",
        )}
      >
        {children}
      </select>
      <ChevronDown size={15} strokeWidth={1.8} className="pointer-events-none absolute right-3 text-mist-dim" />
    </span>
  );
}

function PartyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <span className="flex h-[46px] items-center justify-between rounded-tile border border-hairline bg-obsidian/40 px-3">
      <StepBtn onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1}>
        <Minus size={14} strokeWidth={2} />
      </StepBtn>
      <span className="tnum flex items-center gap-1.5 text-[13.5px] text-snow">
        <Users size={13} strokeWidth={1.7} className="text-mist-dim" />
        {value}
      </span>
      <StepBtn onClick={() => onChange(Math.min(8, value + 1))} disabled={value >= 8}>
        <Plus size={14} strokeWidth={2} />
      </StepBtn>
    </span>
  );
}

function StepBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="grid h-6 w-6 place-items-center rounded-full text-mist transition-colors hover:text-snow disabled:opacity-30"
    >
      {children}
    </button>
  );
}
