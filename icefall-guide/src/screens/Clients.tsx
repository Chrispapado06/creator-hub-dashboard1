import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Card, Fab, StatusPill, Tabs } from "@/components/ui/primitives";
import { Notice, inputClass } from "@/components/guide";
import { PersonAvatar } from "@/components/Photo";
import { stagedBookings, type StagedBooking } from "@/domain/season";
import { visibleClients, fmtRange } from "@/data/demo";
import { useIdentity } from "@/domain/identity";

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
  /**
   * "SIGN IN" IS A QUESTION ABOUT THE SESSION, AND IT WAS ASKING ABOUT THE SEED.
   *
   * The invitation below was gated on `!ME` — whether the invented sample guide
   * exists in this bundle. `ME` is null in every ordinary build, so a genuinely
   * signed-in, verified guide opened Clients and was told to sign in; and it is
   * non-null in every demo build, so the one reader for whom the invitation is
   * useful never saw it. Exactly backwards, in both directions, and it
   * typechecked.
   *
   * `identity.mode` is the question actually being asked, and Home and Profile
   * already ask it this way. Three states, three answers:
   *   session → they are signed in; nothing to invite them to.
   *   sample  → the seed is on screen with the strip over it, and Home carries
   *             the sign-in door in the same sentence that says the account is
   *             invented. Telling this reader to "sign in to see the people you
   *             are guiding" over a list of six people is its own confusion.
   *   none    → the empty screen. This is the only state the invitation fits.
   *
   * `loading` is held out because `useIdentity()` reports `none` until the
   * session resolves — without it a signed-in guide gets a flash of the very
   * sentence this fix exists to stop them seeing.
   */
  const { identity, loading } = useIdentity();

  const now = new Date();

  /**
   * THE TRIP THAT MATTERS NOW — the soonest one still ahead, and only if there
   * is none does the most recent past trip stand in.
   *
   * This sorted ascending and took `[0]`, which is the client's OLDEST booking:
   * a guide with a client departing in a fortnight saw a trek that ended over a
   * year ago, complete with its "archived" pill, while the trip actually about
   * to happen was invisible. It also emptied the Pending tab permanently —
   * pending bookings are by nature the future ones, and the filter only ever
   * looked at the past.
   */
  const tripFor = (clientId: string): StagedBooking | undefined => {
    const theirs = staged.filter((b) => b.clientIds.includes(clientId) && b.state !== "cancelled");
    const ahead = theirs
      .filter((b) => new Date(b.departureIso) >= now)
      .sort((a, b) => +new Date(a.departureIso) - +new Date(b.departureIso));
    if (ahead.length > 0) return ahead[0];
    return theirs.sort((a, b) => +new Date(b.departureIso) - +new Date(a.departureIso))[0];
  };

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

        {!loading && identity.mode === "none" && (
          <Rise className="pt-4">
            <Notice tone="neutral">Sign in to see the people you are guiding.</Notice>
          </Rise>
        )}
      </Stagger>

      <Fab label="Add a client" disabled>
        <Plus size={22} strokeWidth={2.2} />
      </Fab>
    </Screen>
  );
}
