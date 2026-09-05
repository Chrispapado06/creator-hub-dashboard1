import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Mountain, Plus } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Card, Fab, Tabs } from "@/components/ui/primitives";
import { Photo } from "@/components/Photo";
import { useStoreScope } from "@/domain/sampleGate";
import { offeredRoutes } from "@/domain/listing";
import { eur } from "@/data/demo";

type Tab = "all" | "mountain" | "trek";
const TABS = [
  { value: "all" as const, label: "All" },
  { value: "mountain" as const, label: "Mountains" },
  { value: "trek" as const, label: "Treks" },
];

/**
 * WHAT I GUIDE — the listing, mountains and treks together.
 *
 * THIS IS THE SUPPLY SIDE, not a report. Everywhere else shows what has
 * happened; this is where the guide says what they offer, which is the thing a
 * climber books against. It is not derived from bookings — a guide with an empty
 * season still has a listing, and having been up something once is not an offer
 * to take somebody else.
 *
 * TREKS SIT BESIDE MOUNTAINS RATHER THAN IN THEIR OWN SECTION OF THE APP.
 * A guide who runs the Tour du Mont Blanc and the Matterhorn is one guide with
 * one calendar and one rate card; splitting them would mean two of everything
 * and a client seeing half a person.
 */
export default function MyMountains() {
  const [tab, setTab] = useState<Tab>("all");
  /**
   * COMPUTED EVERY RENDER, NOT CAPTURED ONCE. This was
   * `useState(() => offeredRoutes())`, which freezes the listing at first paint
   * — so when the sample gate closes (somebody signs in) this screen would keep
   * showing the invented guide's mountains for as long as it stayed mounted.
   * A `useState` initialiser is a snapshot, and a snapshot of data that can be
   * revoked is the §6aj failure with a React shape.
   */
  /* Computing every render is necessary but not sufficient: nothing re-renders
     this screen when the drawer resolves, so a direct load still showed the
     empty state forever. Subscribing is the other half of the same fix. */
  useStoreScope();
  const all = offeredRoutes();
  const rows = tab === "all" ? all : all.filter((r) => r.kind === tab);

  const counts = {
    mountain: all.filter((r) => r.kind === "mountain").length,
    trek: all.filter((r) => r.kind === "trek").length,
  };

  return (
    <Screen>
      <Stagger>
        <Rise className="flex items-center gap-3 pb-1 pt-7">
          <Link to="/profile" aria-label="Back" className="-ml-1 text-mist">
            <ChevronLeft size={22} strokeWidth={1.7} />
          </Link>
          <h1 className="text-[20px] font-light text-snow">What I guide</h1>
        </Rise>
        <Rise className="pb-4">
          <p className="tnum text-[12px] leading-relaxed text-mist-dim">
            {counts.mountain} {counts.mountain === 1 ? "mountain" : "mountains"} · {counts.trek}{" "}
            {counts.trek === 1 ? "trek" : "treks"} · your terms on each
          </p>
        </Rise>

        <Rise>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
        </Rise>

        <Rise className="space-y-2.5 pt-4">
          {rows.map((m) => (
            <Link
              key={`${m.kind}:${m.routeId}`}
              to={`/route/${m.kind}/${m.routeId}`}
              className="block"
            >
              <Card className="transition-colors hover:border-hairline-strong">
                <div className="flex items-center gap-3.5">
                  <Photo
                    peak={m.routeId}
                    kind={m.photoKind}
                    alt=""
                    className="h-16 w-16 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    {/* The kind sits on the meta line, not beside the title —
                        squeezed against a badge, "Mount Everest" wrapped to two
                        lines and the row lost its rhythm. The title gets the
                        width; the badge goes where there is room. */}
                    <p className="text-[14.5px] leading-snug text-snow">{m.name}</p>
                    <p className="mt-0.5 truncate text-[11.5px] text-mist">{m.routes}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="rounded-[5px] border border-hairline-strong px-1.5 py-[2px] text-[9px] uppercase tracking-[0.1em] text-mist-dim">
                        {m.kind === "trek" ? "Trek" : "Peak"}
                      </span>
                      <span className="tnum text-[11.5px] text-mist-dim">
                        {eur(m.dayRateEur)}/day · {m.typicalDays} days · {m.grade}
                      </span>
                    </div>
                    {m.detail && <p className="tnum mt-1 text-[11px] text-mist-dim">{m.detail}</p>}
                  </div>
                  <ChevronRight size={18} strokeWidth={1.6} className="shrink-0 text-mist-dim" />
                </div>
              </Card>
            </Link>
          ))}

          {rows.length === 0 && (
            <Card>
              <div className="py-6 text-center">
                <Mountain size={26} strokeWidth={1.3} className="mx-auto text-mist-dim" />
                <p className="mt-3 text-[13px] text-snow">
                  {all.length === 0
                    ? "You have not added anything yet."
                    : `Nothing in ${tab === "trek" ? "treks" : "mountains"} yet.`}
                </p>
                <p className="mx-auto mt-1.5 max-w-[34ch] text-[12px] leading-relaxed text-mist-dim">
                  A climber cannot find you until you say what you guide.
                </p>
                <Link
                  to="/route/add"
                  className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] text-azure"
                >
                  <Plus size={14} strokeWidth={2} />
                  Add a mountain or trek
                </Link>
              </div>
            </Card>
          )}
        </Rise>

        {rows.length > 0 && (
          <Rise className="pt-3">
            <p className="text-[11px] leading-relaxed text-mist-dim">
              Saved on this phone. ICEFALL cannot publish a guide's listing yet.
            </p>
          </Rise>
        )}
      </Stagger>

      <Fab label="Add a mountain or trek" to="/route/add">
        <Plus size={22} strokeWidth={2.2} />
      </Fab>
    </Screen>
  );
}
