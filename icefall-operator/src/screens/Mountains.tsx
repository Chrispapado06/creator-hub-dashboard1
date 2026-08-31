/**
 * My Mountains, built to the mockup.
 *
 * Spec §6: "a controlled view of the mountains Icefall has assigned to the
 * operator. It is not a marketplace ranking editor."
 *
 * TWO RECORDS MEET ON THIS SCREEN and keeping them apart is the point:
 *   ACCESS     — may this company edit this mountain's content? Gates the buttons.
 *   PLACEMENT  — the paid slot, #1–#5, with a term. Expires on its own schedule.
 *
 * A company whose placement lapsed still owns its trips and still gets its
 * enquiries. A company whose ACCESS ended keeps its history but cannot edit.
 * Different sentences, and the screen says both.
 *
 * "+ Add Mountain" follows the same doctrine: an operator REQUESTS a mountain
 * and Icefall grants it. There is no self-serve path.
 *
 * SELECT FIRST, THEN REQUEST (owner, OP-03). The panel used to send a request
 * against nothing at all — an operator pressed a button and neither they nor
 * Icefall could say afterwards which peak they had asked for. It now opens on
 * ICEFALL'S OWN CATALOGUE (`backend.getMountains()`) minus the mountains this
 * company already holds a `company_mountains` row for (`useOperator().access`),
 * because the two things a request must never be are "unnamed" and "for
 * something you already have".
 *
 * WHAT SENDING DOES, AND DOES NOT DO. There is no transport. `OperatorBackend`
 * has no mountain-access write of any kind — `getAccess`, `getPlacements` and
 * `getMountains` are the whole mountain surface and all three are reads — so
 * this screen cannot deliver a request and does not claim to. The confirmation
 * says that in words rather than printing "Request sent" over a method that
 * does not exist. Filed as §2 of `requests/07-per-route-altitude.md`.
 *
 * The per-card Enquiries and Bookings figures are COUNTED from the same lead
 * and booking rows the rest of the portal shows, scoped to the reporting window
 * the page chip states — never typed, never estimated.
 */

import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Button, Card, ListingPhoto, LockedNotice, Notice, PageHeader, Pagination, Pill,
  RowMenu, SearchInput, StatusChip, Toolbar, WEB_ASSET_ORIGIN, peakPhotoUrl,
} from "@/components/ui";
import { can } from "@/domain/authz";
import { OPERATOR_NOTICES } from "@/domain/honesty";
import { formatDay, TODAY } from "@/domain/dates";
import { placementFor, placementStatus } from "@/domain/placement";
import type { Mountain } from "@/domain/types";
import { OFFLINE } from "@/offline/offline";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

const PAGE_SIZE = 3;

export default function Mountains() {
  const session = useSession();
  const navigate = useNavigate();
  const { backend, access, placements, mountains, revision } = useOperator();
  const products = useAsync(() => backend.getProducts(session), [session, revision], []);
  const leads = useAsync(() => backend.getLeads(session), [session, revision], []);
  const bookings = useAsync(() => backend.getBookings(session), [session, revision], []);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [requestOpen, setRequestOpen] = useState(false);
  /** The chosen mountain's id. Null until one is picked — see `requested`. */
  const [picked, setPicked] = useState<string | null>(null);
  const [pickQuery, setPickQuery] = useState("");
  /** The mountain a request was raised against, kept so the notice can name it. */
  const [requested, setRequested] = useState<Mountain | null>(null);

  /** The reporting window the page chip states: month-to-date. */
  const monthStart = `${TODAY.slice(0, 7)}-01`;
  const enquiriesOn = (mountainId: string) =>
    leads.filter((l) => l.mountainId === mountainId && l.createdAt.slice(0, 10) >= monthStart).length;
  const bookingsOn = (mountainId: string) =>
    bookings.filter((b) => b.mountainId === mountainId && b.bookedAt.slice(0, 10) >= monthStart).length;

  const q = query.trim().toLowerCase();
  const rows = access.filter((a) => {
    if (!q) return true;
    const m = mountains.find((mm) => mm.id === a.mountainId);
    return [m?.name, m?.country, m?.range]
      .some((field) => field?.toLowerCase().includes(q));
  });

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const paged = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  /*
   * WHAT MAY BE REQUESTED: Icefall's catalogue, minus every mountain this
   * company already holds a row for — at ANY status, not only `active`. A
   * suspended or ended access row is still a decision Icefall made about this
   * pair, and offering "request" beside it would invite an operator to try to
   * route around it. Those mountains stay in the list above with their own
   * wording; they are simply not requestable a second time.
   */
  const heldIds = new Set(access.map((a) => a.mountainId));
  const held = mountains.filter((m) => heldIds.has(m.id));
  const pq = pickQuery.trim().toLowerCase();
  const requestable = mountains
    .filter((m) => !heldIds.has(m.id))
    .filter((m) =>
      !pq ? true : [m.name, m.country, m.range, m.region].some((f) => f?.toLowerCase().includes(pq)),
    );
  const pickedMountain = requestable.find((m) => m.id === picked) ?? null;

  const closeRequest = () => {
    setRequestOpen(false);
    setRequested(null);
    setPicked(null);
    setPickQuery("");
  };

  return (
    <>
      <PageHeader title="My Mountains" detail="Mountains where your expeditions are listed." />

      <Toolbar
        search={
          <SearchInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Search mountains..."
          />
        }
      >
        <Button variant="primary" onClick={() => (requestOpen ? closeRequest() : setRequestOpen(true))}>
          <Plus size={14} aria-hidden /> Add Mountain
        </Button>
      </Toolbar>

      {requestOpen && (
        <Card className="mb-4 p-4">
          {requested ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-[13.5px] font-semibold text-ink">
                  You have requested {requested.name}
                </h2>
                {/*
                  TWO SEPARATE TRUTHS, AND BOTH ARE SAID. The first is that the
                  portal cannot deliver this — there is no mountain-access write
                  in `OperatorBackend` at all, so a "Request sent" line here
                  would be describing a method that does not exist. The second is
                  the doctrine that was already on this panel and stays: a
                  request grants nothing, and Icefall decides.
                */}
                <Notice tone="pending" title="This portal cannot deliver the request yet">
                  Icefall does not receive mountain requests through this portal — there is no route for
                  one in the system today, so nothing has been transmitted and no record of it has been
                  kept. Send {requested.name} to your Icefall contact and they will pick it up there.
                </Notice>
                <div className="mt-2">
                  <LockedNotice>
                    Nothing is granted by requesting. Icefall reviews and grants access — the right to list
                    trips on a mountain — and {requested.name} appears in this list only if they assign it.
                    Featured placement is a separate arrangement that Icefall also decides.
                  </LockedNotice>
                </div>
              </div>
              <Button variant="quiet" onClick={closeRequest}>
                Close
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-[13.5px] font-semibold text-ink">Request a mountain</h2>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
                Mountains are not added from this portal, and you cannot invent one. Choose a mountain
                that is already in Icefall's catalogue, and Icefall reviews and grants access — the right
                to list trips on it. Featured placement is a separate arrangement that Icefall also
                decides. Requesting starts that conversation and grants nothing on its own.
              </p>

              <div className="mt-3 max-w-[420px]">
                <SearchInput
                  value={pickQuery}
                  onChange={setPickQuery}
                  placeholder="Search Icefall's mountains..."
                />
              </div>

              {mountains.length === 0 ? (
                <div className="mt-3">
                  <Notice>Icefall's mountain catalogue has not loaded, so there is nothing to choose from.</Notice>
                </div>
              ) : requestable.length === 0 ? (
                <div className="mt-3">
                  <Notice>
                    {pq
                      ? `No mountain in Icefall's catalogue matches “${pickQuery.trim()}” that your company does not already hold.`
                      : "Your company already holds every mountain in Icefall's catalogue, so there is none left to request."}
                  </Notice>
                </div>
              ) : (
                <>
                  <div
                    role="radiogroup"
                    aria-label="Mountains you can request"
                    className="mt-3 max-h-[268px] overflow-auto rounded-tile border border-line"
                  >
                    {requestable.map((m, i) => {
                      const on = picked === m.id;
                      return (
                        <button
                          key={m.id}
                          role="radio"
                          aria-checked={on}
                          onClick={() => setPicked(on ? null : m.id)}
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
                              {m.name}
                            </span>
                            <span className="block truncate text-[11.5px] text-muted">
                              {[m.range, m.region, m.country].filter(Boolean).join(" · ") || "Location not recorded"}
                            </span>
                          </span>
                          {/*
                            The mountain's OWN summit, off the mountain record —
                            which is what this row is. It is not, and must never
                            become, the highest point of a trip on it.
                          */}
                          <span className="tnum shrink-0 text-[11.5px] text-muted">
                            {m.elevationM !== null ? `${m.elevationM.toLocaleString("en-GB")} m` : "—"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-faint">
                    {requestable.length} {requestable.length === 1 ? "mountain" : "mountains"} you can request
                    {held.length > 0 && ` · ${held.length} already assigned to you and not listed here`}
                  </p>
                </>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  disabled={pickedMountain === null}
                  title={pickedMountain === null ? "Choose a mountain first" : undefined}
                  onClick={() => pickedMountain && setRequested(pickedMountain)}
                >
                  {pickedMountain ? `Request ${pickedMountain.name}` : "Choose a mountain first"}
                </Button>
                <Button variant="quiet" onClick={closeRequest}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {access.length === 0 ? (
        <Notice>
          Icefall has not assigned any mountains to your company yet. Once it does they appear here and you can
          list trips on them.
        </Notice>
      ) : rows.length === 0 ? (
        <Notice>No mountains match “{query.trim()}”.</Notice>
      ) : (
        <div className="space-y-3">
          {paged.map((a) => {
            const mountain = mountains.find((m) => m.id === a.mountainId);
            const placement = placementFor(placements, a.mountainId);
            const state = placement ? placementStatus(placement) : null;
            const onThis = products.filter((p) => p.mountainIds.includes(a.mountainId));
            const expeditions = onThis.filter((p) => p.kind === "expedition").length;
            const treks = onThis.filter((p) => p.kind === "trek").length;
            const tripParts = [
              expeditions > 0 ? `${expeditions} Expedition${expeditions === 1 ? "" : "s"}` : null,
              treks > 0 ? `${treks} Trek${treks === 1 ? "" : "s"}` : null,
            ].filter((part): part is string => part !== null);

            return (
              <Card
                key={a.id}
                className="relative flex flex-wrap items-center gap-4 p-4 transition-colors hover:bg-raised"
              >
                <ListingPhoto
                  sources={[peakPhotoUrl(a.mountainId)]}
                  alt={mountain?.name ?? "Mountain"}
                  seed={a.mountainId}
                  className="h-16 w-24 shrink-0 rounded-tile"
                />

                <div className="min-w-0 flex-1">
                  <Link
                    to={`/operator/mountains/${a.mountainId}`}
                    className="after:absolute after:inset-0 after:rounded-card"
                  >
                    <span className="ser text-[18px] text-ink">{mountain?.name ?? "Unknown"}</span>
                  </Link>
                  <div className="tnum mt-0.5 text-[11.5px] text-muted">
                    {mountain?.elevationM?.toLocaleString("en-GB") ?? "—"} m · {mountain?.country ?? "—"}
                  </div>

                  {(placement || a.status !== "active") && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {placement && state && (
                        state.effectiveStatus === "expired" ? (
                          <StatusChip status="expired" />
                        ) : (
                          <Pill tone="azure">Featured #{placement.slotPosition}</Pill>
                        )
                      )}
                      {placement?.endsOn && state && (
                        <span className="tnum text-[11.5px] text-muted">
                          {state.daysRemaining !== null && state.daysRemaining >= 0
                            ? `Expires ${formatDay(placement.endsOn)} · ${state.daysRemaining} days`
                            : `Ended ${formatDay(placement.endsOn)}`}
                        </span>
                      )}
                      {a.status !== "active" && (
                        <span className="rounded-pill bg-rejected-soft px-2 py-0.5 text-[11.5px] text-rejected">
                          Editing paused
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-1 text-[11.5px] text-muted">
                    {tripParts.length > 0 ? tripParts.join(" · ") : "No trips listed yet"}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-6 pr-1">
                  <div className="text-center">
                    <div className="tnum ser text-[22px] leading-none text-ink">{enquiriesOn(a.mountainId)}</div>
                    <div className="lbl mt-1.5">Enquiries</div>
                  </div>
                  <div className="text-center">
                    <div className="tnum ser text-[22px] leading-none text-ink">{bookingsOn(a.mountainId)}</div>
                    <div className="lbl mt-1.5">Bookings</div>
                  </div>
                  <div className="relative z-10">
                    <RowMenu
                      label={`Actions for ${mountain?.name ?? a.mountainId}`}
                      items={[
                        { label: "Manage", onClick: () => navigate(`/operator/mountains/${a.mountainId}`) },
                        /* Offered only to the role the route will actually let in. */
                        ...(a.status === "active" && can(session, "editProducts")
                          ? [
                              {
                                label: "How you appear",
                                onClick: () => navigate(`/operator/mountains/${a.mountainId}/edit`),
                              },
                            ]
                          : []),
                        /*
                          The public page lives on the Icefall website. Offline
                          that tab could only open on a browser error, which
                          reads as a broken portal rather than an absent
                          network, so the row does not offer it.
                        */
                        ...(OFFLINE
                          ? []
                          : [
                              {
                                label: "View on Icefall",
                                onClick: () => {
                                  window.open(
                                    `${WEB_ASSET_ORIGIN}/app/mountains/${a.mountainId}`,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                },
                              },
                            ]),
                      ]}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Pagination page={current} pageCount={pageCount} onChange={setPage} />

      <Card className="mt-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[13.5px] font-semibold text-ink">About placements</h2>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
              {OPERATOR_NOTICES.PLACEMENT_READ_ONLY} Icefall decides which companies are featured on a
              mountain and in what order, and will contact you before a placement ends. Nothing about your
              position changes automatically — not when a term expires, and not when another company joins.
            </p>
          </div>
        </div>
        <div className="mt-3">
          <LockedNotice>
            If you would like to discuss a placement, reply to your Icefall contact. There is no way to bid or
            change position from inside this portal, by design.
          </LockedNotice>
        </div>
      </Card>
    </>
  );
}
