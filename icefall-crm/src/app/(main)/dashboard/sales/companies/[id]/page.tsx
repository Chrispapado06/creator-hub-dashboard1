import Link from "next/link";

import { Button } from "@/components/ui/button";

import { companies, companyInvitations, companyMembers, placements } from "../_components/data";
import { ok } from "../_components/states";
import { CompanyDetail } from "./_components/company-detail";

/**
 * One company's staff record.
 *
 * The lists are read whole and filtered here the way the queries will be —
 * placements by company, members and invitations by company — so the screen
 * below already handles a company that appears in none of them.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = companies.find((c) => c.id === id) ?? null;

  if (!company) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium text-3xl leading-none tracking-tight">Company record</h1>
          <p className="max-w-2xl text-muted-foreground text-sm">
            No company matches this address. Open one from the Companies roster.
          </p>
        </div>
        <div>
          <Button variant="outline" asChild>
            <Link href="/dashboard/sales/companies">Back to companies</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <CompanyDetail
      company={company}
      placements={ok(placements)}
      members={ok(companyMembers.filter((m) => m.company_id === company.id))}
      invitations={ok(companyInvitations.filter((i) => i.company_id === company.id))}
    />
  );
}
