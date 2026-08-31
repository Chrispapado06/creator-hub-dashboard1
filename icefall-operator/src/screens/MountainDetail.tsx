/**
 * One mountain's workspace, built to the mockup.
 *
 * The mockup's hero carries the mountain, its elevation, the Featured badge and
 * the expiry date; then tabs for Overview / Expeditions / Treks / Mountain Info,
 * a status panel, and the per-section Live/Pending list.
 *
 * The read/write split of spec §6 is rendered literally: name, placement and
 * term are facts Icefall sets; trips and mountain-specific content are the
 * operator's, through pending edits. When access has ended the trips stay
 * visible and editing stops — hiding them would make an operator think their
 * catalogue had been deleted.
 */

import { ArrowLeft, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Button, Card, ListingPhoto, LockedNotice, Notice, StatusChip, Tabs, peakPhotoUrl,
} from "@/components/ui";
import { can, canManageMountain } from "@/domain/authz";
import { OPERATOR_NOTICES } from "@/domain/honesty";
import { formatDay, formatRange, timeAgo, NOW } from "@/domain/dates";
import { placementFor, placementStatus } from "@/domain/placement";
import { chipForProduct } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

type Tab = "overview" | "expeditions" | "treks" | "info";

export default function MountainDetail() {
  const { id = "" } = useParams();
  const session = useSession();
  const { backend, access, placements, mountains, revision } = useOperator();
  const products = useAsync(() => backend.getProducts(session), [session, revision], []);
  const versions = useAsync(() => backend.getVersions(session, "product"), [session, revision], []);
  const [tab, setTab] = useState<Tab>("overview");

  const mountain = mountains.find((m) => m.id === id);
  const assignment = access.find((a) => a.mountainId === id);

  /**
   * The authorization boundary, checked before anything renders. An operator
   * reaching this URL for a mountain Icefall never assigned them is told so
   * plainly — not a 404, because the mountain exists and their access to it does
   * not, and those are different facts.
   */
  if (!assignment || !mountain) {
    return (
      <>
        <Link to="/operator/mountains" className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden /> Back to my mountains
        </Link>
        <Notice>
          Icefall has not assigned this mountain to your company, so there is no workspace for it here. If you
          think that is wrong, reply to your Icefall contact.
        </Notice>
      </>
    );
  }

  const placement = placementFor(placements, id);
  const state = placement ? placementStatus(placement) : null;
  const editable = canManageMountain(session, access, id);
  const onThis = products.filter((p) => p.mountainIds.includes(id));
  const expeditions = onThis.filter((p) => p.kind === "expedition");
  const treks = onThis.filter((p) => p.kind === "trek");

  const shown = tab === "expeditions" ? expeditions : tab === "treks" ? treks : onThis;

  return (
    <>
      <Link
        to="/operator/mountains"
        className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"
      >
        <ArrowLeft size={13} aria-hidden /> Back to my mountains
      </Link>

      <Card className="overflow-hidden">
        {/* The banner is a photograph (icefall-web's credited library) with the
            contour drawing as its honest fallback; the identity row sits below
            it so ink text never fights a photo for legibility. */}
        <ListingPhoto
          sources={[peakPhotoUrl(mountain.id)]}
          alt={mountain.name}
          seed={id}
          className="h-48 w-full"
        />
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-4">
          <div>
            <div className="ser text-[26px] leading-none text-ink">{mountain.name}</div>
            <div className="tnum mt-1.5 text-[12px] text-muted">
              {mountain.elevationM?.toLocaleString("en-GB") ?? "—"} m · {mountain.country ?? "—"}
            </div>
          </div>
          <div className="text-right">
            {state?.effectiveStatus === "expired" ? (
              <StatusChip status="expired" />
            ) : placement ? (
              <span className="tnum rounded-pill bg-azure px-2.5 py-1 text-[11.5px] font-semibold text-canvas">
                Featured #{placement.slotPosition}
              </span>
            ) : (
              <span className="rounded-pill bg-draft-soft px-2.5 py-1 text-[11.5px] text-muted">Listed</span>
            )}
            {placement?.endsOn && (
              <div className="mt-1.5 text-[11.5px] text-muted">Expires {formatDay(placement.endsOn)}</div>
            )}
          </div>
        </div>

        <div className="border-t border-line px-4 py-2.5">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: "overview" as const, label: "Overview" },
              { key: "expeditions" as const, label: "Expeditions", count: expeditions.length },
              { key: "treks" as const, label: "Treks", count: treks.length },
              { key: "info" as const, label: "Mountain info" },
            ]}
          />
        </div>
      </Card>

      {state?.effectiveStatus === "expired" && (
        <div className="mt-4">
          <Notice tone="expired" title="Placement expired">
            {OPERATOR_NOTICES.PLACEMENT_EXPIRED}
          </Notice>
        </div>
      )}
      {!editable && (
        <div className="mt-4">
          <Notice tone="rejected" title="Editing paused on this mountain">
            Your commercial relationship with Icefall for {mountain.name} has ended, so its trips can no longer
            be edited. Everything you have — the trips, the enquiries, the bookings — is kept exactly as it is.
          </Notice>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <div>
          {tab === "info" ? (
            <Card className="p-4">
              <h2 className="text-[13.5px] font-semibold text-ink">Your content on this mountain</h2>
              {/*
               * THIS PANEL USED TO LIE, and it is worth recording how.
               *
               * It listed three rows — Overview, Route & season, Permits &
               * regulations — each wearing a PUBLISHED chip, above an "Edit
               * mountain info" button with no handler. None of that content
               * exists: `CompanyMountain` carries permission and nothing else,
               * by design. So the screen told an operator that climbers were
               * reading three pieces of writing they had never written, and
               * offered a button that did nothing when they went to change it.
               *
               * The same defect decision 14 caught in the company film row: a
               * section invented to fill a layout, wearing a status that made
               * the invention look measured. Replaced with what is true.
               */}
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                Icefall does not yet store anything you write about a specific mountain. What a climber
                sees on this peak is drawn from your company profile and from each trip you publish here.
              </p>
              <div className="mt-3.5">
                <Notice tone="neutral">
                  A pitch for this mountain, and a promotional film for it, are with Icefall as a request.
                  Until they exist there is nothing to write here — and nothing has been published on your
                  behalf.
                </Notice>
              </div>
              <div className="mt-4">
                {editable && can(session, "editProducts") ? (
                  <Link
                    to={`/operator/mountains/${mountain.id}/edit`}
                    className="inline-flex items-center gap-1.5 rounded-tile bg-azure px-3 py-1.5 text-[13px] font-medium text-canvas transition-colors hover:bg-azure-ink"
                  >
                    See how you appear on this mountain
                  </Link>
                ) : (
                  <LockedNotice>
                    Icefall has paused this mountain for your company, so nothing here can be changed.
                  </LockedNotice>
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
                <div>
                  <h2 className="text-[13.5px] font-semibold text-ink">
                    {tab === "expeditions" ? "Expeditions" : tab === "treks" ? "Treks" : "Your trips"} on{" "}
                    {mountain.name}
                  </h2>
                  <p className="mt-0.5 text-[11.5px] text-muted">
                    One company can run several trips on the same mountain.
                  </p>
                </div>
                {editable && can(session, "editProducts") && (
                  <div className="flex items-center gap-2">
                    {/* Where the block a climber actually sees is explained. */}
                    <Link to={`/operator/mountains/${id}/edit`}>
                      <Button>How you appear</Button>
                    </Link>
                    <Link to="/operator/products/new">
                      <Button variant="primary">
                        <Plus size={13} aria-hidden /> Add
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
              {shown.length === 0 ? (
                <p className="px-4 py-10 text-center text-[12.5px] text-muted">Nothing listed here yet.</p>
              ) : (
                shown.map((p, i) => {
                  const isPending = versions.some((v) => v.entityId === p.id && v.state === "pending");
                  return (
                    <Link
                      key={p.id}
                      to={`/operator/products/${p.id}`}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-raised ${
                        i > 0 ? "border-t border-line-soft" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                        <span className="block text-[11.5px] text-muted capitalize">
                          {p.kind}
                          {p.durationDays ? ` · ${p.durationDays} days` : ""}
                        </span>
                      </span>
                      {isPending && (
                        <span className="rounded-pill bg-pending-soft px-2 py-0.5 text-[11px] text-pending">
                          Edit pending
                        </span>
                      )}
                      <StatusChip status={chipForProduct(p.status)} />
                    </Link>
                  );
                })
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">Set by Icefall</h2>
            <dl className="mt-3 space-y-3">
              <div>
                <dt className="lbl">Placement</dt>
                <dd className="tnum mt-1 text-[13.5px] font-medium text-ink">
                  {placement ? `Featured #${placement.slotPosition}` : "Listed, no featured position"}
                </dd>
              </div>
              <div>
                <dt className="lbl">Term</dt>
                <dd className="mt-1 text-[13.5px] text-ink">
                  {placement ? formatRange(placement.startsOn, placement.endsOn) : "—"}
                </dd>
              </div>
              <div>
                <dt className="lbl">Status</dt>
                <dd className="mt-1.5">
                  <StatusChip status={state?.effectiveStatus === "expired" ? "expired" : "live"} />
                </dd>
              </div>
              <div>
                <dt className="lbl">Access</dt>
                <dd className="mt-1 text-[13px] text-ink capitalize">{assignment.status}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <LockedNotice>{OPERATOR_NOTICES.PLACEMENT_READ_ONLY}</LockedNotice>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">Your content</h2>
            <dl className="mt-2.5 space-y-2 text-[12.5px]">
              {[
                ["Expeditions", expeditions.length],
                ["Treks", treks.length],
                ["Awaiting review", versions.filter((v) => v.state === "pending").length],
              ].map(([label, n]) => (
                <div key={String(label)} className="flex items-center justify-between">
                  <dt className="text-muted">{label}</dt>
                  <dd className="tnum font-medium text-ink">{n}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">Recent updates</h2>
            <div className="mt-2.5 space-y-2.5">
              {versions.slice(0, 3).map((v) => (
                <div key={v.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] text-ink">
                      {products.find((p) => p.id === v.entityId)?.name ?? "A trip"}
                    </div>
                    <div className="text-[11px] text-faint">{timeAgo(v.updatedAt, NOW)}</div>
                  </div>
                  <StatusChip status={v.state === "pending" ? "pending" : v.state === "rejected" ? "rejected" : "live"} />
                </div>
              ))}
              {versions.length === 0 && <p className="text-[12px] text-muted">No changes yet.</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
