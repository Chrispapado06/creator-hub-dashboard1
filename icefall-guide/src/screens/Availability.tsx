import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Lock, X } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Card, StatusPill } from "@/components/ui/primitives";
import { Photo } from "@/components/Photo";
import { stagedBookings, upcoming } from "@/domain/season";
import { clearDay, loadStates, setDay, type SettableState } from "@/data/availabilityStore";
import { CUTOFF_DAYS, fmtRange } from "@/data/demo";
import { dayOffset, parseDay, startOfDay } from "@/lib/day";
import { cn } from "@/lib/utils";

/**
 * AVAILABILITY — the guide says which days they will work.
 *
 * EDITABLE, AND IT SAVES. Tapping a day selects it; the row underneath sets it.
 * The marks persist on this device (see `data/availabilityStore.ts`) because a
 * calendar that forgets on reload is a control that writes into nothing.
 *
 * BOOKED DAYS ARE LOCKED, and that is a real rule rather than a limitation. Those
 * days come from the bookings themselves, so the calendar can never disagree
 * with the trips — and a guide cannot mark themselves free on a day a client has
 * already paid for.
 *
 * A DAY WITH NO COLOUR IS ONE THEY HAVE NOT SPOKEN ABOUT. Clearing deletes the
 * entry rather than writing "unavailable": "I have not said" and "I am busy" are
 * different statements, and only one of them is a refusal of work.
 */
export default function Availability() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [own, setOwn] = useState<Record<string, SettableState>>(() => loadStates());
  const [saveFailed, setSaveFailed] = useState(false);

  const now = new Date();
  const staged = stagedBookings();
  const ahead = upcoming(staged, now);

  /** Days a booking holds. Derived, never stored, never editable. */
  const bookedDays = useMemo(() => {
    const set = new Set<string>();
    for (const b of staged) {
      if (b.state === "cancelled") continue;
      const from = parseDay(b.from);
      const to = parseDay(b.to);
      if (!from || !to) continue;
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        set.add(dayOffset(d, 0));
      }
    }
    return set;
  }, [staged]);

  const cursor = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthLabel = cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const firstWeekday = (cursor.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      dayOffset(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1), 0),
    ),
  ];

  const today = startOfDay(now);
  const stateOf = (day: string): "booked" | SettableState | null =>
    bookedDays.has(day) ? "booked" : (own[day] ?? null);

  const apply = (state: SettableState | null) => {
    if (!selected) return;
    const ok = state === null ? clearDay(selected) : setDay(selected, state);
    setSaveFailed(!ok);
    setOwn(loadStates());
  };

  const freeDays = Object.values(own).filter((s) => s === "available").length;
  const selectedState = selected ? stateOf(selected) : null;

  return (
    <Screen>
      <Stagger>
        <Rise className="pb-4 pt-7">
          <h1 className="text-[22px] font-light text-snow">Availability</h1>
          <p className="tnum mt-1 text-[12px] text-mist-dim">
            {freeDays} {freeDays === 1 ? "day" : "days"} open · {CUTOFF_DAYS} days' notice
          </p>
        </Rise>

        <Rise>
          <Card>
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setMonthOffset((m) => m - 1)}
                className="text-mist hover:text-snow"
              >
                <ChevronLeft size={18} strokeWidth={1.7} />
              </button>
              <p className="tnum text-[14px] text-snow">{monthLabel}</p>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setMonthOffset((m) => m + 1)}
                className="text-mist hover:text-snow"
              >
                <ChevronRight size={18} strokeWidth={1.7} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <span
                  key={d}
                  className="pb-1 text-center text-[9.5px] uppercase tracking-[0.1em] text-mist-dim"
                >
                  {d}
                </span>
              ))}
              {cells.map((day, i) => {
                if (day === null) return <span key={`pad-${i}`} />;
                const state = stateOf(day);
                const d = parseDay(day);
                const isToday = d !== null && d.getTime() === today.getTime();
                const locked = state === "booked";
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelected(day === selected ? null : day)}
                    aria-pressed={day === selected}
                    title={locked ? "A booking holds this day" : (state ?? "Not set")}
                    className={cn(
                      "tnum grid h-9 place-items-center rounded-tile text-[12.5px] transition-colors",
                      state === "booked" && "bg-azure text-obsidian",
                      state === "available" && "border border-azure/45 text-snow",
                      state === "partial" && "border border-alert/50 text-snow",
                      state === "unavailable" && "bg-elevated text-mist-dim",
                      !state && "text-mist-dim hover:bg-white/[0.04]",
                      isToday && "ring-1 ring-snow/40",
                      day === selected && "ring-2 ring-snow",
                    )}
                  >
                    {d?.getDate()}
                  </button>
                );
              })}
            </div>

            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-hairline pt-3">
              <Key className="border border-azure/45" label="Open" />
              <Key className="bg-azure" label="Booked" />
              <Key className="bg-elevated" label="Not working" />
            </ul>
          </Card>
        </Rise>

        {/* ---- The editor ------------------------------------------------------ */}
        <Rise className="pt-3">
          {selected === null ? (
            <p className="px-1 text-[12px] text-mist-dim">
              Tap a day to set whether you are working.
            </p>
          ) : (
            <Card>
              <div className="flex items-baseline justify-between gap-3">
                <p className="tnum text-[14px] text-snow">{longDay(selected)}</p>
                <span className="text-[11.5px] text-mist-dim">
                  {selectedState === "booked"
                    ? "Booked"
                    : selectedState === "available"
                      ? "Open for work"
                      : selectedState === "unavailable"
                        ? "Not working"
                        : selectedState === "partial"
                          ? "Part booked"
                          : "Not set"}
                </span>
              </div>

              {selectedState === "booked" ? (
                <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-mist-dim">
                  <Lock size={13} strokeWidth={1.8} className="mt-px shrink-0" />
                  A booking holds this day, so it cannot be changed here. Cancel the trip first if
                  you need it back.
                </p>
              ) : (
                <>
                  <div className="mt-3.5 grid grid-cols-3 gap-2">
                    <Choice
                      active={selectedState === "available"}
                      onClick={() => apply("available")}
                      icon={<Check size={14} strokeWidth={2.2} />}
                      label="Open"
                    />
                    <Choice
                      active={selectedState === "unavailable"}
                      onClick={() => apply("unavailable")}
                      icon={<X size={14} strokeWidth={2.2} />}
                      label="Busy"
                    />
                    <Choice
                      active={selectedState === null}
                      onClick={() => apply(null)}
                      label="Clear"
                    />
                  </div>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
                    Clearing removes the day entirely — it is not the same as marking yourself
                    unavailable.
                  </p>
                </>
              )}

              {saveFailed && (
                <p className="mt-2.5 text-[11.5px] leading-relaxed text-danger">
                  That did not save — this device is refusing to store it. Your other days are
                  unaffected.
                </p>
              )}
            </Card>
          )}
        </Rise>

        <Rise className="pt-3">
          <p className="px-1 text-[11px] leading-relaxed text-mist-dim">
            Saved on this phone. ICEFALL cannot publish a guide's calendar yet, so athletes do not
            see these days.
          </p>
        </Rise>

        {/* ---- Upcoming bookings ------------------------------------------------ */}
        <Rise className="pb-2 pt-6">
          <div className="flex items-baseline justify-between">
            <p className="section-label">Upcoming bookings</p>
            <Link to="/clients" className="text-[11.5px] text-azure">
              View all
            </Link>
          </div>
          <div className="mt-3 space-y-2.5">
            {ahead.map((b) => (
              <Link key={b.id} to={`/booking/${b.id}`} className="block">
                <Card className="transition-colors hover:border-hairline-strong">
                  <div className="flex items-center gap-3">
                    <Photo peak={b.peak} alt="" className="h-12 w-12 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] text-snow">{b.title}</p>
                      <p className="tnum mt-0.5 text-[11.5px] text-mist-dim">
                        {fmtRange(b.from, b.to)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-mist-dim">
                        {b.clients.length} {b.clients.length === 1 ? "Client" : "Clients"}
                      </p>
                    </div>
                    <StatusPill state={b.state === "pending" ? "pending" : "confirmed"} />
                  </div>
                </Card>
              </Link>
            ))}
            {ahead.length === 0 && (
              <Card>
                <p className="py-3 text-center text-[13px] text-mist-dim">Nothing booked ahead.</p>
              </Card>
            )}
          </div>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Choice({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-9 items-center justify-center gap-1.5 rounded-tile border text-[12px] transition-colors",
        active
          ? "border-azure bg-azure/15 text-azure"
          : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5 text-[11px] text-mist-dim">
      <span className={cn("h-2.5 w-2.5 rounded-[3px]", className)} />
      {label}
    </li>
  );
}

const longDay = (day: string) =>
  parseDay(day)?.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }) ?? day;
