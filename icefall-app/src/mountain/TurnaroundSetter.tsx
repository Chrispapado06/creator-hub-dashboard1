/**
 * SETTING THE TURNAROUND TIME (plan §3.7).
 *
 * The one setter, drawn by the Now tab at `/mountain/now/turnaround` inside the
 * Mountain mode shell, so the SOS button and the tabs stay on screen while it
 * is open.
 *
 * The day defaults to the itinerary's summit day where there is an itinerary.
 * The TIME is never pre-filled: ICEFALL holds no itinerary turnaround time for
 * any trip, and an invented one is worse than an empty field.
 *
 * The first instruction is "set it on your watch too", and the full limits
 * sentence sits right here — at the point of setting, not in a help page.
 */

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { checkTurnaroundInput, dayOptions, defaultDay } from "./alarmModel";
import { primeAlarmSound } from "./alarmSound";
import { durationLabel } from "./format";
import type { MountainTrip } from "./trip";
import { buttonClass } from "./ui";
import {
  ALARM_LIMITS,
  ARMING_FIRST_LINE,
  TURNAROUND_UNSET,
  clearTurnaround,
  phoneTimeZone,
  setTurnaround,
  useTurnaround,
} from "./turnaround";

const pad = (n: number) => `${n}`.padStart(2, "0");

function shiftTime(time: string, minutes: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const total = Math.min(23 * 60 + 59, Math.max(0, Number(m[1]) * 60 + Number(m[2]) + minutes));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

function dateLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function TurnaroundSetter({ trip, today, onClose }: { trip: MountainTrip; today: string; onClose: () => void }) {
  const { setting, now } = useTurnaround(trip.id);
  const options = useMemo(() => dayOptions(trip, today), [trip, today]);
  const [date, setDate] = useState(() =>
    setting && options.some((o) => o.date === setting.date) ? setting.date : defaultDay(options),
  );
  const [time, setTime] = useState(setting?.time ?? "");
  const [tried, setTried] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const check = checkTurnaroundInput(date, time, now);
  const zone = phoneTimeZone();

  const save = () => {
    // This tap is the moment the browser allows the alarm to make sound later.
    primeAlarmSound();
    setTried(true);
    if (!check.ok) return;
    const r = setTurnaround(trip.id, date, time);
    if ("error" in r) {
      setSaveError(r.error);
      return;
    }
    onClose();
  };

  const remove = () => {
    clearTurnaround(trip.id);
    onClose();
  };

  return (
    <div role="form" aria-labelledby="turnaround-setter-title" className="flex min-h-full flex-col">
      <div className="px-5 pb-6 pt-6">
        <h1 id="turnaround-setter-title" className="text-[28px] font-light leading-tight text-snow">
          Turnaround time
        </h1>
        <p className="mt-3 text-[17px] leading-snug text-snow">{ARMING_FIRST_LINE}</p>
        <p className="mt-2 text-[15px] leading-snug text-mist">{trip.name}</p>
        {trip.notice && <p className="mt-1 text-[15px] leading-snug text-mist">{trip.notice}</p>}
        <p className="mt-2 text-[15px] leading-snug text-mist">
          {setting ? `Now set: ${setting.time}, ${dateLabel(setting.date)}.` : TURNAROUND_UNSET}
        </p>

        <p className="section-label mt-8">Day</p>
        {options.length === 1 ? (
          <p className="mt-2 text-[17px] text-snow">
            {options[0].label} · {dateLabel(options[0].date)}
          </p>
        ) : (
          <div className="mt-1" role="radiogroup" aria-label="Day">
            {options.map((o) => {
              const on = o.date === date;
              return (
                <button
                  key={o.date}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDate(o.date)}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3 border-b border-hairline text-left text-[17px]",
                    on ? "text-snow" : "text-mist",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("h-3 w-3 shrink-0 rounded-full", on ? "bg-azure" : "bg-mist-dim/40")}
                  />
                  <span className="min-w-0 flex-1">
                    {o.label}
                    <span className="block text-[15px] text-mist">
                      {dateLabel(o.date)}
                      {o.summitDay ? " · summit day" : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <p className="section-label mt-8">Time</p>
        <label className="mt-2 block">
          <span className="sr-only">Turnaround time, 24-hour</span>
          <input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              setSaveError(null);
            }}
            className="h-20 w-full border-b border-hairline-strong bg-transparent text-[40px] font-light tabular-nums text-snow outline-none"
          />
        </label>
        <div className="mt-3 flex gap-3">
          {[-15, 15].map((delta) => (
            <button
              key={delta}
              type="button"
              disabled={!time}
              onClick={() => setTime((t) => shiftTime(t, delta))}
              className="min-h-16 flex-1 rounded-full text-[17px] text-snow disabled:text-mist-dim"
            >
              {delta < 0 ? "− 15 min" : "+ 15 min"}
            </button>
          ))}
        </div>
        <p className="mt-3 min-h-6 text-[17px] leading-snug" role="status">
          {check.ok ? (
            <span className="text-snow">In {durationLabel(check.msAhead)}</span>
          ) : tried || (time && !check.ok) ? (
            <span className="text-alert">{saveError ?? check.error}</span>
          ) : null}
        </p>
        <p className="mt-1 text-[15px] leading-snug text-mist">This phone's clock: {zone}.</p>

        <p className="mt-8 text-[15px] leading-relaxed text-mist">{ALARM_LIMITS}</p>

        <div className="mt-6 border-t border-hairline">
          {setting && (
            <button
              type="button"
              onClick={remove}
              className="min-h-16 w-full border-b border-hairline text-left text-[17px] text-mist"
            >
              Remove turnaround time
            </button>
          )}
          <button type="button" onClick={onClose} className="min-h-16 w-full text-left text-[17px] text-mist">
            Cancel
          </button>
        </div>
      </div>

      <div className="flex-1" />
      {/* Pinned in thumb reach, inside the shell's scroller. */}
      <div className="sticky bottom-0 border-t border-hairline bg-obsidian px-5 py-3">
        {/* AZURE, NOT WHITE (mockup spec §0): azure is the primary action in
            every mockup, and a white slab here read as a different app from the
            screen that opened it. */}
        <button
          type="button"
          onClick={save}
          className={cn(buttonClass("azure"), "h-[88px] text-[20px]")}
        >
          Set turnaround
        </button>
      </div>
    </div>
  );
}
