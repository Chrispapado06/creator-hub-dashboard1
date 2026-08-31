import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Card, Fab, StatusPill, Tabs } from "@/components/ui/primitives";
import { Notice, inputClass } from "@/components/guide";
import { PersonAvatar } from "@/components/Photo";
import { stagedBookings, type StagedBooking } from "@/domain/season";
import { visibleClients, ME, fmtRange } from "@/data/demo";

type Tab = "all" | "groups" | "pending";
const TABS = [
  { value: "all" as const, label: "All" },
  { value: "groups" as const, label: "Groups" },
  { value: "pending" as const, label: "Pending" },
];

/**
 * CLIENTS — the mockup's list, one row per client with their current trip.
 *
 * The status pill states where the BOOKING is, not a judgement about the person.
 * A client with no booking shows no pill rather than an invented one.
 */
export default function Clients() {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const staged = stagedBookings();

  const tripFor = (clientId: string): StagedBooking | undefined =>
    staged
      .filter((b) => b.clientIds.includes(clientId) && b.state !== "cancelled")
      .sort((a, b) => +new Date(a.departureIso) - +new Date(b.departureIso))[0];

  const rows = visibleClients().filter((c) => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    const t = tripFor(c.id);
    if (tab === "groups") return (t?.clientIds.length ?? 0) > 1;
    if (tab === "pending") return t?.state === "pending";
    return true;
  });

  return (
    <Screen>
      <Stagger>
        <Rise className="pb-4 pt-7">
          <h1 className="text-[22px] font-light text-snow">Clients</h1>
        </Rise>

        <Rise>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
        </Rise>

        <Rise className="pt-4">
          <label className="relative block">
            <Search
              size={15}
              strokeWidth={1.8}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-dim"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search clients"
              className={`${inputClass} pl-9`}
            />
          </label>
        </Rise>

        <Rise className="space-y-2.5 pt-4">
          {rows.map((c) => {
            const trip = tripFor(c.id);
            return (
              <Link key={c.id} to={`/client/${c.id}`} className="block">
                <Card className="transition-colors hover:border-hairline-strong">
                  <div className="flex items-center gap-3">
                    <PersonAvatar name={c.name} size={42} online={c.online} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-snow">{c.name}</p>
                      {trip ? (
                        <>
                          <p className="mt-0.5 truncate text-[11.5px] text-mist">{trip.title}</p>
                          <p className="tnum mt-0.5 text-[11px] text-mist-dim">
                            {fmtRange(trip.from, trip.to)}
                          </p>
                        </>
                      ) : (
                        <p className="mt-0.5 text-[11.5px] text-mist-dim">No trip booked.</p>
                      )}
                    </div>
                    {trip && (
                      <StatusPill
                        state={
                          trip.state === "pending"
                            ? "pending"
                            : trip.state === "complete"
                              ? "archived"
                              : "confirmed"
                        }
                      />
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}

          {rows.length === 0 && (
            <Card>
              <p className="py-5 text-center text-[13px] leading-relaxed text-mist-dim">
                {visibleClients().length === 0
                  ? "No client has written to you yet. Nothing has gone missing — ICEFALL cannot carry client messages yet, so none can reach this device."
                  : "No client matches that."}
              </p>
            </Card>
          )}
        </Rise>

        {!ME && (
          <Rise className="pt-4">
            <Notice tone="neutral">
              Sign in to see the people you are guiding.
            </Notice>
          </Rise>
        )}
      </Stagger>

      <Fab label="Add a client" disabled>
        <Plus size={22} strokeWidth={2.2} />
      </Fab>
    </Screen>
  );
}
