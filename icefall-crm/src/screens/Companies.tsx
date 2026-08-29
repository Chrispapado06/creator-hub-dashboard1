import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, PageHead, Pill, Stat, StatusChip, TableCard } from "@/components/ui";
import { Resolve } from "@/components/states";
import { listCompanies } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company } from "@/data/types";
import { formatDay } from "@/lib/utils";

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

export default function Companies() {
  const [result, setResult] = useState<Result<Company[]>>(loading);
  useEffect(() => {
    void listCompanies().then(setResult);
  }, []);

  return (
    <>
      <PageHead
        title="Companies"
        subtitle="Every expedition company ICEFALL sells to or works with. One canonical record — the operator portal edits this same row."
      />
      <Resolve
        result={result}
        what="companies"
        isEmpty={(v) => v.length === 0}
        empty="No company records exist yet. Sales or Operations create the first one."
      >
        {(companies) => {
          // Counted over the rows in the table below and nothing else, so the
          // tiles and the list can never disagree. Every one of these is a real
          // measurement of a set that was read, which is why they are allowed to
          // print a figure — including a zero.
          const count = (of: (c: Company) => boolean) =>
            companies.filter(of).length.toLocaleString("en-GB");

          return (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat
                  tone="butter"
                  label="Companies"
                  value={companies.length.toLocaleString("en-GB")}
                />
                <Stat
                  tone="sky"
                  label="Active accounts"
                  value={count((c) => c.status === "active")}
                  hint="The rest are prospects, onboarding, suspended or churned."
                />
                <Stat
                  tone="lilac"
                  label="Documents checked"
                  value={count((c) => c.verification_status === "verified")}
                  hint="Checked means a member of ICEFALL staff read the documents; it never means the issuing body was contacted."
                />
                <Stat
                  tone="mint"
                  label="Awaiting a check"
                  value={count((c) => c.verification_status === "pending")}
                  hint="Companies whose verification status is still unverified are not counted here — nothing has been submitted for anyone to read."
                />
              </div>

              <div className="mt-5">
                <TableCard>
                  <table className="w-full min-w-[760px] text-[13.5px]">
                    <thead>
                      <tr className="border-b border-line-soft text-left">
                        <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Company</th>
                        <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Status</th>
                        <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Countries</th>
                        <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Trust</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.map((c) => (
                        <tr key={c.id} className="border-b border-line-soft last:border-0 hover:bg-raised">
                          <td className="px-5 py-3.5">
                            <Link
                              to={`/admin/companies/${c.id}`}
                              className="group inline-flex items-center gap-3"
                            >
                              <Avatar name={c.name} size={34} />
                              <span className="font-medium text-ink group-hover:text-accent">
                                {c.name}
                              </span>
                            </Link>
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusChip state={companyStatusState(c.status)} label={c.status} />
                          </td>
                          <td className="px-5 py-3.5">
                            {c.countries.length ? (
                              <span className="flex flex-wrap gap-1.5">
                                {c.countries.map((country) => (
                                  <Pill key={country}>{country}</Pill>
                                ))}
                              </span>
                            ) : (
                              <span className="text-faint">Not recorded</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <VerificationChip company={c} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableCard>
              </div>
            </>
          );
        }}
      </Resolve>
    </>
  );
}
