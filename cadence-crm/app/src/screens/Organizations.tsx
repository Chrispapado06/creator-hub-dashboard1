import { Plus } from "lucide-react";
import { Button, PageHead, Pill, Table } from "@/components/ui";
import { COMPANIES, CONTACTS, DEALS, fmtEur, userById } from "@/data/demo";

export default function Organizations() {
  return (
    <>
      <PageHead title="Organizations" subtitle={`${COMPANIES.length} companies`}
        actions={<Button size="sm"><Plus size={15} strokeWidth={2} />New organization</Button>} />
      <Table head={["Company", "Industry", "People", "Open deals", "Owner"]}>
        {COMPANIES.map((c) => {
          const people = CONTACTS.filter((p) => p.companyId === c.id).length;
          const deals = DEALS.filter((d) => d.companyId === c.id && d.status === "open");
          const value = deals.reduce((a, d) => a + d.value, 0);
          return (
            <tr key={c.id} className="hover:bg-raised">
              <td className="px-4 py-2.5">
                <p className="text-[13px] font-medium text-ink">{c.name}</p>
                <p className="text-[11.5px] text-faint">{c.domain}</p>
              </td>
              <td className="px-4 py-2.5 text-[12.5px] text-muted">{c.industry}</td>
              <td className="tnum px-4 py-2.5 text-[12.5px] text-muted">{people}</td>
              <td className="tnum px-4 py-2.5 text-[12.5px] text-muted">{deals.length ? `${deals.length} · ${fmtEur(value, { compact: true })}` : "—"}</td>
              <td className="px-4 py-2.5"><Pill>{userById(c.ownerId)?.initials}</Pill></td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
