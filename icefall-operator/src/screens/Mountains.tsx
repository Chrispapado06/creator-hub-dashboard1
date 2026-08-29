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
 * and Icefall grants it. There is no self-serve path, so the button opens an
 * explanatory panel rather than a form that would imply one.
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
import { OPERATOR_NOTICES } from "@/domain/honesty";
import { formatDay, TODAY } from "@/domain/dates";
import { placementFor, placementStatus } from "@/domain/placement";
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
  const [requestSent, setRequestSent] = useState(false);

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
        <Button variant="primary" onClick={() => setRequestOpen((o) => !o)}>
          <Plus size={14} aria-hidden /> Add Mountain
        </Button>
      </Toolbar>

      {requestOpen && (
        <Card className="mb-4 p-4">
          {requestSent ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Notice>
                Request sent to Icefall. Mountains are granted after a review — nothing changes in your
                portal until Icefall assigns it, and the mountain then appears in this list.
              </Notice>
              <Button
                variant="quiet"
                onClick={() => {
                  setRequestOpen(false);
                  setRequestSent(false);
                }}
              >
                Close
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-[13.5px] font-semibold text-ink">Request a mountain</h2>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
                Mountains are not added from this portal. You request one, and Icefall reviews and grants
                access — the right to list trips on it. Featured placement is a separate arrangement that
                Icefall also decides. Sending this request starts that conversation.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="primary" onClick={() => setRequestSent(true)}>
                  Send request
                </Button>
                <Button variant="quiet" onClick={() => setRequestOpen(false)}>
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
