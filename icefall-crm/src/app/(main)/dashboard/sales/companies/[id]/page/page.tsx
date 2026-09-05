import Link from "next/link";

import { Button } from "@/components/ui/button";

import { companies } from "../../_components/data";
import { CompanyEditor } from "./_components/company-editor";

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

  return <CompanyEditor key={company.id} company={company} />;
}
