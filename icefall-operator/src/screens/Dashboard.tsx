/**
 * The dashboard, built to the operator mockup (light portal, decision #18).
 *
 * Layout is the mockup's: "Dashboard" and the reporting window, a row of four
 * metric tiles, then Performance Overview beside Top Expeditions, then Recent
 * Enquiries beside Pending Approvals.
 *
 * THE FIRST TILE IS THE SANCTIONED INVENTION. Nothing in the ICEFALL family
 * counts a listing view, so the mockup's "Profile views" figure cannot be
 * measured. The owner chose (constitution §6 #18) to show the mockup's number
 * while the portal is local-only, and `@/domain/demo` is the only module allowed
 * to make that substitution — flip its flag off and the tile says the honest
 * sentence it always had underneath. Every other figure on this screen is
 * computed from seeded rows, deltas included.
 */

import { Clock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { TrendChart } from "@/components/TrendChart";
import {
  Button, Card, ListingPhoto, MetricTile, Notice, PageHeader, peakPhotoUrl, SectionHeading, PersonAvatar, VerifiedMark } from "@/components/ui";
import { measured, OPERATOR_NOTICES } from "@/domain/honesty";
import { demoViewsDelta, demoViewsReading } from "@/domain/demo";
import { formatDay, timeAgo, NOW } from "@/domain/dates";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

/** Null when there is nothing to compare against — never a fabricated 0%. */
function delta(now: number, before: number | undefined): number | null {
  if (before === undefined || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export default function Dashboard() {
  const session = useSession();
  const navigate = useNavigate();
  const { backend, company, revision } = useOperator();

  const summary = useAsync(() => backend.getDashboard(session), [session, revision], null);
  const trend = useAsync(() => backend.getTrend(session, 28), [session, revision], []);
  const top = useAsync(() => backend.getProductPerformance(session), [session, revision], []);
  const conversations = useAsync(() => backend.getConversations(session), [session, revision], []);
  const versions = useAsync(() => backend.getVersions(session), [session, revision], []);
  const products = useAsync(() => backend.getProducts(session), [session, revision], []);

  const recent = conversations.slice(0, 3);
  const pending = versions.filter((v) => v.state === "pending");
  const pendingCompanyEdit = pending.find((v) => v.entityType === "company");
  const topExpeditions = top.filter((p) => p.kind === "expedition").slice(0, 3);

  /**
   * The public sections a profile cannot go live without. Checked against the
   * real company record — the "not live" banner renders ONLY when one of these
   * is genuinely absent, never as decoration.
   */
  const profileMissing = company
    ? ([
        ["a description", company.description],
        ["an about section", company.about],
        ["a location", company.city && company.country],
      ] as const)
        .filter(([, present]) => !present)
        .map(([label]) => label)
    : [];

  /** The mountain behind a ranked product, for its credited photo. */
  const mountainIdFor = (productId: string): string | undefined =>
    products.find((p) => p.id === productId)?.mountainIds[0];

  if (!summary) return null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        detail={`Here's what's happening with ${company?.name ?? "your company"}.`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* Doctrine tier 4 — the one sanctioned invention, and only here. */}
        <MetricTile
          label="Profile views"
          reading={demoViewsReading(summary.views)}
          format={(v) => v.toLocaleString("en-GB")}
          delta={demoViewsDelta()}
          footnote={demoViewsDelta() !== null ? `vs ${summary.previousRangeLabel}` : undefined}
        />
        <MetricTile
          label="Enquiries"
          reading={measured(summary.funnel.enquiries)}
          format={String}
          delta={delta(summary.funnel.enquiries, summary.previous?.enquiries)}
          footnote={summary.previous ? `vs ${summary.previousRangeLabel}` : "No earlier period to compare"}
          href="/operator/leads"
        />
        <MetricTile
          label="Qualified leads"
          reading={measured(summary.funnel.qualified)}
          format={String}
          delta={delta(summary.funnel.qualified, summary.previous?.qualified)}
          footnote={summary.previous ? `vs ${summary.previousRangeLabel}` : "No earlier period to compare"}
          href="/operator/leads"
        />
        <MetricTile
          label="Bookings"
          reading={measured(summary.funnel.bookings)}
          format={String}
          delta={delta(summary.funnel.bookings, summary.previous?.bookings)}
          footnote={summary.previous ? `vs ${summary.previousRangeLabel}` : "No earlier period to compare"}
          href="/operator/bookings"
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-4">
          <SectionHeading title="Performance overview" detail="Daily, over the last four weeks." />
          <TrendChart
            days={trend.map((t) => t.label)}
            series={[
              { key: "enq", label: "Enquiries", colour: "var(--op-azure)", points: trend.map((t) => t.enquiries) },
              { key: "qual", label: "Qualified", colour: "var(--op-live)", points: trend.map((t) => t.qualified) },
              { key: "book", label: "Bookings", colour: "var(--op-pending)", points: trend.map((t) => t.bookings) },
            ]}
            unavailableNote={{ label: "Profile views", reason: OPERATOR_NOTICES.VIEWS_NOT_COUNTED }}
          />
        </Card>

        <Card className="p-4">
          <SectionHeading
            title="Top expeditions"
            detail="Ranked by enquiries."
            action={
              <Link to="/operator/expeditions" className="text-[12px] font-medium text-azure-ink hover:underline">
                View all
              </Link>
            }
          />
          <div className="space-y-2">
            {topExpeditions.map((p, i) => {
              const mountainId = mountainIdFor(p.productId);
              return (
                <Link
                  key={p.productId}
                  to={`/operator/products/${p.productId}`}
                  className="flex items-center gap-3 rounded-tile px-1 py-1.5 transition-colors hover:bg-raised"
                >
                  <span className="tnum w-4 shrink-0 text-[12px] text-faint">{i + 1}</span>
                  <ListingPhoto
                    sources={mountainId ? [peakPhotoUrl(mountainId)] : []}
                    alt=""
                    seed={mountainId ?? p.name}
                    className="h-8 w-11 shrink-0 rounded-tile"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-ink">{p.name}</span>
                    <span className="tnum block text-[11px] text-muted">
                      {p.enquiries} {p.enquiries === 1 ? "enquiry" : "enquiries"} · {p.bookings} booked
                    </span>
                  </span>
                </Link>
              );
            })}
            {topExpeditions.length === 0 && (
              <p className="py-4 text-center text-[12.5px] text-muted">No expeditions yet.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionHeading
            title="Recent enquiries"
            detail="Customers interested in your expeditions."
            action={
              <Link to="/operator/leads" className="text-[12px] font-medium text-azure-ink hover:underline">
                View all
              </Link>
            }
          />
          <div className="space-y-1">
            {recent.map((c) => (
              <Link
                key={c.id}
                to={`/operator/inbox/${c.id}`}
                className="flex items-center gap-3 rounded-tile px-1 py-2 transition-colors hover:bg-raised"
              >
                <PersonAvatar name={c.customerName} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">{c.customerName} <VerifiedMark name={c.customerName} size={13} /></span>
                  <span className="block truncate text-[11px] text-muted">
                    {c.productNameAtCreation ?? "General enquiry"}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-faint">{timeAgo(c.lastMessageAt, NOW)}</span>
                {c.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-azure" aria-hidden />}
              </Link>
            ))}
            {recent.length === 0 && (
              <p className="py-4 text-center text-[12.5px] text-muted">No enquiries yet.</p>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <SectionHeading title="Pending approvals" detail="Edits waiting for Icefall to review." />
          {pending.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-muted">Nothing awaiting review.</p>
          ) : (
            <div className="space-y-2.5">
              {pending.map((v) => (
                <div key={v.id} className="flex items-start gap-2.5">
                  <Clock size={13} className="mt-0.5 shrink-0 text-pending" aria-hidden />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-ink">
                      {v.entityType === "company"
                        ? "Company profile"
                        : (products.find((p) => p.id === v.entityId)?.name ?? "A trip")}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-snug text-muted">
                      Submitted {formatDay(v.submittedAt?.slice(0, 10) ?? null)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/*
            The banner under the list. "Your profile is not live" is a CLAIM and
            renders only when a required section is genuinely absent from the
            company record; a complete profile with an edit in review gets the
            pending-edit statement the data actually supports.
          */}
          {profileMissing.length > 0 ? (
            <div className="mt-3">
              <Notice tone="pending" title="Your profile is not live">
                <p>Your public profile still needs {profileMissing.join(", ")} before it can go live.</p>
                <div className="mt-2">
                  <Button variant="primary" onClick={() => navigate("/operator/company")}>
                    Continue setup
                  </Button>
                </div>
              </Notice>
            </div>
          ) : pendingCompanyEdit ? (
            <div className="mt-3">
              <Notice tone="pending" title="Profile edit awaiting review">
                <p>{OPERATOR_NOTICES.PENDING_LIVE_UNCHANGED}</p>
                <div className="mt-2">
                  <Button variant="secondary" onClick={() => navigate("/operator/company")}>
                    Review
                  </Button>
                </div>
              </Notice>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
