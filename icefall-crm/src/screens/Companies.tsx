import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  Plus,
} from "lucide-react";
import { Button, PageHead, StatusChip, TableCard } from "@/components/ui";
import { Resolve } from "@/components/states";
import { CompanyLogo } from "@/components/CompanyLogo";
import { OFFLINE } from "@/offline/offline";
import { cn, formatDay } from "@/lib/utils";
import { listCompanies, listRevenue } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import { Select } from "@/components/controls";
import type { Company, RevenueRecord } from "@/data/types";

/**
 * Companies — the mockup's design on the REAL query layer.
 *
 * This page rendered a fixture roster for a few hours on 30 Aug 2026 while its
 * sibling screens read the live database, which meant it showed 48 companies
 * that did not exist beside 21 screens showing the 8 that do. Same design,
 * honest data source: `listCompanies()` with the `Result` wrapper, so "no
 * database", "query failed" and "genuinely no companies" each say what they
 * are instead of all rendering as an empty table.
 *
 * The tiles are COUNTED from the rows. Revenue YTD is summed from
 * `revenue_records` for the current year — a company with no revenue rows says
 * "None recorded", because an empty ledger is an absence, not a euro amount.
 *
 * THE SQUARE LOGOS STAY (owner: "real company logos … in square not circle").
 * `OPERATOR_DOMAINS` maps a company slug to its real website, and the logo is
 * fetched live from that domain. The live database holds invented companies
 * today, so today you see initials; the moment a real operator's record exists
 * under one of these slugs, its own mark appears. Nothing is copied into the
 * repo either way.
 */

export const companyStatusTone = (s: Company["status"]) =>
  s === "active" ? "green" : s === "suspended" || s === "churned" ? "red" : "amber";

/**
 * The same three-way reading of a lifecycle state, for the mockup's status
 * control. It mirrors `companyStatusTone` exactly — active is settled, suspended
 * and churned are refusals, everything else is still on its way — so the two
 * cannot drift into disagreeing about the same row.
 */
export const companyStatusState = (s: Company["status"]): "ok" | "pending" | "bad" | "neutral" =>
  s === "active" ? "ok" : s === "suspended" || s === "churned" ? "bad" : "pending";

/**
 * What "verified" is allowed to say on a screen.
 *
 * ICEFALL checks documents. It does not contact the issuing association, and it
 * must never print anything a reader could take as meaning it did. The date
 * comes from `documents_checked_at`, which is NULL until a real staff review
 * recorded one — so an unchecked company shows the absence, not a placeholder.
 */
export function VerificationChip({ company }: { company: Company }) {
  if (company.verification_status !== "verified") {
    return (
      <StatusChip
        state={
          company.verification_status === "rejected" || company.verification_status === "suspended"
            ? "bad"
            : company.verification_status === "pending"
              ? "pending"
              : "neutral"
        }
        label={company.verification_status}
      />
    );
  }
  const on = formatDay(company.documents_checked_at);
  return <StatusChip state="ok" label={on ? `Documents checked ${on}` : "Documents checked"} />;
}

/** Real operators' websites, by the slug their record would use. Public facts. */
export const OPERATOR_DOMAINS: Record<string, string> = {
  "elite-exped": "eliteexped.com",
  "seven-summit-treks": "sevensummittreks.com",
  "14-peaks-expedition": "14peaksexpedition.com",
  "alpine-ascents-international": "alpineascents.com",
  "adventure-consultants": "adventureconsultants.com",
  "madison-mountaineering": "madisonmountaineering.com",
  "furtenbach-adventures": "furtenbachadventures.com",
  "imagine-nepal": "imagine-nepal.com",
  "8k-expeditions": "8kexpeditions.com",
  "climbing-the-seven-summits": "climbingthesevensummits.com",
  "international-mountain-guides": "mountainguides.com",
  "jagged-globe": "jagged-globe.co.uk",
  "pioneer-adventure": "pioneeradventure.com",
  "mountain-professionals": "mtnprofessionals.com",
  "kobler-partner": "kobler-partner.ch",
  "summitclimb": "summitclimb.com",
};

const STATUS_META: Record<Company["status"], { label: string; dot: string; text: string }> = {
  prospect: { label: "Prospect", dot: "bg-[oklch(0.65_0.015_260)]", text: "text-muted" },
  onboarding: { label: "Onboarding", dot: "bg-[oklch(0.75_0.14_70)]", text: "text-[oklch(0.55_0.12_70)]" },
  active: { label: "Active", dot: "bg-ok", text: "text-ok" },
  suspended: { label: "Suspended", dot: "bg-bad", text: "text-bad" },
  churned: { label: "Churned", dot: "bg-bad", text: "text-bad" },
};

function StatTile({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: number;
  caption: string;
  tone: "plain" | "blue" | "amber" | "red" | "grey";
}) {
  return (
    <div
      className={cn(
        "rounded-card p-4",
        tone === "plain" && "bg-surface shadow-soft",
        tone === "blue" && "bg-accent-soft",
        tone === "amber" && "bg-butter",
        tone === "red" && "bg-[oklch(0.955_0.03_25)]",
        tone === "grey" && "bg-panel",
      )}
    >
      <p
        className={cn(
          "text-[12.5px] font-semibold",
          tone === "blue" && "text-accent-ink",
          tone === "amber" && "text-[oklch(0.5_0.11_75)]",
          tone === "red" && "text-[oklch(0.5_0.16_25)]",
          (tone === "plain" || tone === "grey") && "text-muted",
        )}
      >
        {label}
      </p>
      <p className="tnum mt-1 text-[24px] font-extrabold leading-tight text-ink">{value}</p>
      <p className="mt-0.5 text-[11.5px] text-faint">{caption}</p>
    </div>
  );
}

/** Recognised revenue this calendar year, per company — or null for "no rows". */
function revenueYtdByCompany(records: RevenueRecord[]): Map<string, number> {
  const year = new Date().getFullYear();
  const sums = new Map<string, number>();
  for (const r of records) {
    if (r.company_id === null) continue;
    if (new Date(r.recognised_on).getFullYear() !== year) continue;
    if (r.status === "written_off") continue;
    sums.set(r.company_id, (sums.get(r.company_id) ?? 0) + r.amount_cents);
  }
  return sums;
}

export default function Companies() {
  const navigate = useNavigate();
  const [result, setResult] = useState<Result<Company[]>>(loading);
  const [revenue, setRevenue] = useState<Result<RevenueRecord[]>>(loading);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(8);

  useEffect(() => {
    void listCompanies().then(setResult);
    void listRevenue().then(setRevenue);
  }, []);

  const ytd = useMemo(
    () => (revenue.state === "ok" ? revenueYtdByCompany(revenue.value) : null),
    [revenue],
  );

  return (
    <>
      <PageHead
        title="Companies"
        subtitle="Every expedition company ICEFALL sells to or works with. One canonical record — the operator portal edits this same row."
        actions={
          <Button
            className="!bg-accent text-white hover:opacity-90"
            onClick={() => navigate("/admin/companies/page/new")}
          >
            <Plus size={15} strokeWidth={2.25} /> Add company
          </Button>
        }
      />

      <Resolve
        result={result}
        what="companies"
        empty="No companies yet. The first operator ICEFALL signs appears here."
        isEmpty={(rows) => rows.length === 0}
      >
        {(rows) => {
          const counts = {
            total: rows.length,
            active: rows.filter((r) => r.status === "active").length,
            onboarding: rows.filter((r) => r.status === "onboarding").length,
            suspended: rows.filter((r) => r.status === "suspended").length,
            unverified: rows.filter((r) => r.verification_status === "unverified").length,
          };
          const pages = Math.max(1, Math.ceil(rows.length / perPage));
          const safePage = Math.min(page, pages);
          const visible = rows.slice((safePage - 1) * perPage, safePage * perPage);
          const from = (safePage - 1) * perPage + 1;
          const to = Math.min(safePage * perPage, rows.length);
          const pageItems: (number | "…")[] =
            pages <= 5 ? Array.from({ length: pages }, (_, i) => i + 1) : [1, 2, 3, "…", pages];

          return (
            <>
              <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <StatTile label="Companies" value={counts.total} caption="Total companies" tone="plain" />
                <StatTile label="Active accounts" value={counts.active} caption="Active and onboarded" tone="blue" />
                <StatTile label="Onboarding" value={counts.onboarding} caption="In the onboarding flow" tone="amber" />
                <StatTile label="Suspended" value={counts.suspended} caption="Access suspended" tone="red" />
                <StatTile label="Unverified" value={counts.unverified} caption="Awaiting verification" tone="grey" />
              </div>

              <TableCard>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11.5px] uppercase tracking-[0.06em] text-faint">
                      <th className="px-5 py-3 font-medium">Company</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Countries</th>
                      <th className="px-3 py-3 font-medium">Trust</th>
                      <th className="px-3 py-3 font-medium">Joined</th>
                      <th className="px-3 py-3 text-right font-medium">Revenue YTD</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const status = STATUS_META[r.status];
                      const earned = ytd?.get(r.id);
                      return (
                        <tr
                          key={r.id}
                          onClick={() => navigate(`/admin/companies/${r.id}`)}
                          className="cursor-pointer border-t border-line-soft hover:bg-raised/60"
                        >
                          <td className="px-5 py-3">
                            <span className="flex items-center gap-3">
                              {/* Offline the logo chain is skipped entirely:
                                  it fetches each operator's mark from their own
                                  site, which is a network call with nothing to
                                  reach. Initials render instead — a missing
                                  logo is a cosmetic absence, not information. */}
                              <CompanyLogo
                                name={r.name}
                                domain={OFFLINE ? null : OPERATOR_DOMAINS[r.slug]}
                                size={34}
                              />
                              <span className="font-semibold text-ink">{r.name}</span>
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn("flex items-center gap-2 text-[12.5px] font-medium", status.text)}>
                              <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} aria-hidden />
                              {status.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-muted">
                            {r.countries.length > 0 ? (
                              r.countries.join(", ")
                            ) : (
                              <span className="text-faint">Not recorded</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <VerificationChip company={r} />
                          </td>
                          <td className="tnum px-3 py-3 text-muted">{formatDay(r.created_at)}</td>
                          <td className="tnum px-3 py-3 text-right font-semibold text-ink">
                            {revenue.state !== "ok" ? (
                              <span className="font-normal text-faint">
                                {revenue.state === "loading" ? "…" : "Ledger unavailable"}
                              </span>
                            ) : earned === undefined ? (
                              <span className="font-normal text-faint">None recorded</span>
                            ) : (
                              `€${(earned / 100).toLocaleString("en-GB")}`
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <EllipsisVertical size={15} strokeWidth={2} className="inline text-faint" aria-hidden />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-5 py-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="grid h-8 w-8 place-items-center rounded-[8px] text-muted hover:bg-raised"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={15} strokeWidth={2} />
                    </button>
                    {pageItems.map((it, i) =>
                      it === "…" ? (
                        <span key={`e${i}`} className="px-1 text-[12.5px] text-faint">
                          …
                        </span>
                      ) : (
                        <button
                          key={it}
                          type="button"
                          onClick={() => setPage(it)}
                          className={cn(
                            "grid h-8 w-8 place-items-center rounded-[8px] text-[12.5px] font-medium",
                            it === safePage ? "bg-accent text-white" : "text-muted hover:bg-raised",
                          )}
                        >
                          {it}
                        </button>
                      ),
                    )}
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(pages, p + 1))}
                      className="grid h-8 w-8 place-items-center rounded-[8px] text-muted hover:bg-raised"
                      aria-label="Next page"
                    >
                      <ChevronRight size={15} strokeWidth={2} />
                    </button>
                  </div>
                  <p className="text-[12px] text-faint">
                    Showing {from} to {to} of {rows.length} results
                  </p>
                  <Select
                    value={String(perPage)}
                    onChange={(v: string) => { setPerPage(Number(v)); setPage(1); }}
                    ariaLabel="Results per page"
                    className="w-[130px]"
                    options={[
                      { value: "8", label: "8 per page" },
                      { value: "16", label: "16 per page" },
                      { value: "24", label: "24 per page" },
                    ]}
                  />
                </div>
              </TableCard>
            </>
          );
        }}
      </Resolve>
    </>
  );
}
