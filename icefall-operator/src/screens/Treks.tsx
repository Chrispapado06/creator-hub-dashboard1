/**
 * Treks — the company's own trek products, and the ROUTES it is allowed to sell.
 *
 * TWO RECORDS MEET ON THIS SCREEN, exactly as two meet on My Mountains, and
 * keeping them apart is the point:
 *
 *   THE PRODUCTS   the trips this company authors, prices and publishes.
 *                  `ProductList` renders them, and it is shared with Expeditions
 *                  because spec §7 gives both kinds one infrastructure.
 *   THE ACCESS     `company_treks` — which catalogue routes Icefall has granted.
 *                  A grant carries permission and nothing else.
 *
 * "+ REQUEST A TREK" FOLLOWS THE MOUNTAIN DOCTRINE WORD FOR WORD (owner, OP-04:
 * "Yes add them to also request a trek"), because two request flows that behave
 * differently are two products:
 *
 *   SELECT FIRST, THEN REQUEST. The panel opens on ICEFALL'S OWN CATALOGUE
 *   minus every route this company already holds a row for — at ANY status, not
 *   only `active`, because a suspended grant is still a decision Icefall made
 *   about this pair and offering "request" beside it would invite an operator to
 *   route around it. A company can never invent a route.
 *
 *   WHAT SENDING DOES, AND DOES NOT DO. There is no transport. The trek surface
 *   on `OperatorBackend` is two reads — `getTreks` and `getTrekAccess` — and so
 *   is the mountain surface; neither noun has a write. So this screen cannot
 *   deliver a request and does not claim to, and says so in words instead of
 *   printing "Request sent" over a method that does not exist. Asked for in
 *   `icefall-sessions/requests/09-company-treks-migration.md`.
 *
 * THE ALTITUDE RULE. A route's highest point is read from the ROUTE'S OWN
 * record and from nowhere else. An Everest Base Camp trek tops out at 5,364 m,
 * or 5,545 m by way of Kala Patthar, where Everest stands at 8,849 m — and that
 * gap is the one number a person uses to judge whether they can survive the
 * trip. Where the catalogue has no per-route figure this screen SAYS there is
 * none. It never borrows the peak's.
 */

import { Plus } from "lucide-react";
import { useState } from "react";
import {
  Button, Card, ListingPhoto, LockedNotice, Notice, SearchInput, SectionHeading,
  trekPhotoUrl,
} from "@/components/ui";
import type { Trek, CompanyTrek } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";
import { ProductList } from "./ProductList";

export default function Treks() {
  return (
    <>
      <ProductList kind="trek" />
      <TrekAccess />
    </>
  );
}

/** Days on the route, or the honest absence of a range. */
function duration(t: Trek): string {
  if (!t.durationDays) return "Duration not published";
  const [a, b] = t.durationDays;
  return a === b ? `${a} days` : `${a}–${b} days`;
}

/**
 * THE ROUTE'S OWN HIGH POINT, or a plain statement that there is none.
 *
 * One function, used by both lists on this screen, so there is exactly one
 * place this could ever go wrong. It takes a `Trek` and has no access to a
 * mountain record, which is the strongest form the rule can take here: the
 * substitution is not merely forbidden, it is not reachable.
 */
function highPoint(t: Trek): string {
  return t.maxAltitudeM !== null
    ? `${t.maxAltitudeM.toLocaleString("en-GB")} m`
    : "Highest point not published";
}

function TrekAccess() {
  const session = useSession();
  const { backend, revision } = useOperator();

  /*
   * NULL IS "NOT AVAILABLE", AND IS NOT AN EMPTY LIST. The trek reads are
   * optional on the seam (see `adapter.ts`), and an implementation without them
   * must produce "Icefall's trek catalogue is not available here", never a page
   * that reads as Icefall having no routes and this company holding none.
   */
  const catalogue = useAsync<Trek[] | null>(
    () => (backend.getTreks ? backend.getTreks() : Promise.resolve(null)),
    [revision],
    null,
  );
  const access = useAsync<CompanyTrek[] | null>(
    () => (backend.getTrekAccess ? backend.getTrekAccess(session) : Promise.resolve(null)),
    [session, revision],
    null,
  );

  const [open, setOpen] = useState(false);
  /** The chosen route's id. Null until one is picked — see `requested`. */
  const [picked, setPicked] = useState<string | null>(null);
  const [pickQuery, setPickQuery] = useState("");
  /** The route a request was raised against, kept so the notice can name it. */
  const [requested, setRequested] = useState<Trek | null>(null);

  const available = catalogue !== null && access !== null;
  const treks = catalogue ?? [];
  const rows = access ?? [];

  const heldIds = new Set(rows.map((a) => a.trekId));
  const pq = pickQuery.trim().toLowerCase();
  const requestable = treks
    .filter((t) => !heldIds.has(t.id))
    .filter((t) =>
      !pq ? true : [t.name, t.country, t.region, t.style].some((f) => f.toLowerCase().includes(pq)),
    );
  const pickedTrek = requestable.find((t) => t.id === picked) ?? null;

  const close = () => {
    setOpen(false);
    setRequested(null);
    setPicked(null);
    setPickQuery("");
  };

  return (
    <section className="mt-6">
      <SectionHeading
        title="Trek routes assigned to you"
        detail="Icefall grants the routes your company may sell trips on. Requesting one starts that conversation."
        action={
          available ? (
            <Button variant="primary" onClick={() => (open ? close() : setOpen(true))}>
              <Plus size={14} aria-hidden /> Request a trek
            </Button>
          ) : undefined
        }
      />

      {!available ? (
        <Notice>
          Icefall's trek catalogue is not available in this build, so the routes your company holds cannot be
          shown and a route cannot be requested here.
        </Notice>
      ) : (
        <>
          {open && (
            <Card className="mb-4 p-4">
              {requested ? (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[13.5px] font-semibold text-ink">
                      You have requested {requested.name}
                    </h3>
                    {/*
                      TWO SEPARATE TRUTHS, AND BOTH ARE SAID — the same two the
                      mountain panel says. The first is that the portal cannot
                      deliver this: there is no trek-access write in
                      `OperatorBackend` at all. The second is the doctrine: a
                      request grants nothing, and Icefall decides.
                    */}
                    <Notice tone="pending" title="This portal cannot deliver the request yet">
                      Icefall does not receive trek requests through this portal — there is no route for one in
                      the system today, so nothing has been transmitted and no record of it has been kept. Send
                      {" "}
                      {requested.name} to your Icefall contact and they will pick it up there.
                    </Notice>
                    <div className="mt-2">
                      <LockedNotice>
                        Nothing is granted by requesting. Icefall reviews and grants access — the right to list
                        trips on a route — and {requested.name} appears in this list only if they assign it.
                      </LockedNotice>
                    </div>
                  </div>
                  <Button variant="quiet" onClick={close}>
                    Close
                  </Button>
                </div>
              ) : (
                <>
                  <h3 className="text-[13.5px] font-semibold text-ink">Request a trek</h3>
                  <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
                    Routes are not added from this portal, and you cannot invent one. Choose a route that is
                    already in Icefall's catalogue, and Icefall reviews and grants access — the right to list
                    trips on it. Requesting starts that conversation and grants nothing on its own.
                  </p>

                  <div className="mt-3 max-w-[420px]">
                    <SearchInput
                      value={pickQuery}
                      onChange={setPickQuery}
                      placeholder="Search Icefall's trek routes..."
                    />
                  </div>

                  {treks.length === 0 ? (
                    <div className="mt-3">
                      <Notice>Icefall's trek catalogue has not loaded, so there is nothing to choose from.</Notice>
                    </div>
                  ) : requestable.length === 0 ? (
                    <div className="mt-3">
                      <Notice>
                        {pq
                          ? `No route in Icefall's catalogue matches “${pickQuery.trim()}” that your company does not already hold.`
                          : "Your company already holds every route in Icefall's catalogue, so there is none left to request."}
                      </Notice>
                    </div>
                  ) : (
                    <>
                      <div
                        role="radiogroup"
                        aria-label="Trek routes you can request"
                        className="mt-3 max-h-[268px] overflow-auto rounded-tile border border-line"
                      >
                        {requestable.map((t, i) => {
                          const on = picked === t.id;
                          return (
                            <button
                              key={t.id}
                              role="radio"
                              aria-checked={on}
                              onClick={() => setPicked(on ? null : t.id)}
                              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                i === 0 ? "" : "border-t border-line-soft"
                              } ${on ? "bg-azure-soft" : "hover:bg-raised"}`}
                            >
                              <span
                                aria-hidden
                                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-pill border ${
                                  on ? "border-azure" : "border-line"
                                }`}
                              >
                                {on && <span className="h-1.5 w-1.5 rounded-pill bg-azure" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={`block truncate text-[13px] ${on ? "text-azure-ink" : "text-ink"}`}>
                                  {t.name}
                                </span>
                                <span className="block truncate text-[11.5px] text-muted">
                                  {[t.region, t.country, t.style].join(" · ")}
                                </span>
                              </span>
                              {/*
                                The ROUTE'S own high point, off the route record,
                                which is what this row is. It is not, and must
                                never become, the summit of a peak the route
                                happens to pass.
                              */}
                              <span className="tnum shrink-0 text-[11.5px] text-muted">
                                {t.maxAltitudeM !== null ? `${t.maxAltitudeM.toLocaleString("en-GB")} m` : "—"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] text-faint">
                        {requestable.length} {requestable.length === 1 ? "route" : "routes"} you can request
                        {rows.length > 0 &&
                          ` · ${rows.length} already assigned to you and not listed here`}
                      </p>
                    </>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      disabled={pickedTrek === null}
                      title={pickedTrek === null ? "Choose a route first" : undefined}
                      onClick={() => pickedTrek && setRequested(pickedTrek)}
                    >
                      {pickedTrek ? `Request ${pickedTrek.name}` : "Choose a route first"}
                    </Button>
                    <Button variant="quiet" onClick={close}>
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </Card>
          )}

          {rows.length === 0 ? (
            <Notice>
              Icefall has not assigned any trek routes to your company yet. Once it does they appear here and you
              can list trips on them.
            </Notice>
          ) : (
            <div className="space-y-3">
              {rows.map((a) => {
                const trek = treks.find((t) => t.id === a.trekId) ?? null;
                return (
                  <Card key={a.id} className="flex flex-wrap items-center gap-4 p-4">
                    <ListingPhoto
                      sources={[trekPhotoUrl(a.trekId)]}
                      alt={trek?.name ?? "Trek route"}
                      seed={a.trekId}
                      className="h-16 w-24 shrink-0 rounded-tile"
                    />

                    <div className="min-w-0 flex-1">
                      <span className="ser text-[18px] text-ink">{trek?.name ?? a.trekId}</span>
                      <div className="mt-0.5 text-[11.5px] text-muted">
                        {trek
                          ? [trek.region, trek.country, trek.style].join(" · ")
                          : "This route is not in the catalogue this portal can read."}
                      </div>
                      {a.status !== "active" && (
                        <div className="mt-1.5">
                          <span className="rounded-pill bg-rejected-soft px-2 py-0.5 text-[11.5px] text-rejected">
                            Editing paused
                          </span>
                        </div>
                      )}
                    </div>

                    {trek && (
                      <div className="flex shrink-0 flex-wrap items-start gap-6 pr-1">
                        <div>
                          <div className="lbl">Difficulty</div>
                          <div className="mt-1 text-[12.5px] text-ink">
                            {trek.difficulty ?? "Not graded"}
                          </div>
                        </div>
                        <div>
                          <div className="lbl">Duration</div>
                          <div className="tnum mt-1 text-[12.5px] text-ink">{duration(trek)}</div>
                        </div>
                        <div>
                          <div className="lbl">Highest point</div>
                          <div className="tnum mt-1 text-[12.5px] text-ink">{highPoint(trek)}</div>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          <Card className="mt-5 p-4">
            <h3 className="text-[13.5px] font-semibold text-ink">What a grant does and does not carry</h3>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
              A route Icefall has assigned you carries permission and nothing else — no spots, no itinerary, no
              price and no position. Those stay on the trip you author, where your changes go through review.
              Difficulty and the highest point on the route belong to the route itself and are the same for
              everyone selling it, so they are shown here rather than offered as fields to fill in.
            </p>
            <div className="mt-3">
              <LockedNotice>
                Access can be paused or ended by Icefall. Your trips and your enquiries stay yours either way —
                what stops is editing against that route.
              </LockedNotice>
            </div>
          </Card>
        </>
      )}
    </section>
  );
}
