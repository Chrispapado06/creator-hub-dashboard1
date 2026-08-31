import { Plus } from "lucide-react";
import { Button, PageHead, Pill, Table } from "@/components/ui";
import { eur, fmtEur } from "@/data/demo";

const PRODUCTS = [
  { id: "p1", name: "Platform licence — Growth", code: "LIC-GRW", price: eur(1200), unit: "seat / mo", tax: 20, active: true, category: "Software" },
  { id: "p2", name: "Platform licence — Scale", code: "LIC-SCL", price: eur(2400), unit: "seat / mo", tax: 20, active: true, category: "Software" },
  { id: "p3", name: "Onboarding — Standard", code: "SVC-ONB", price: eur(3500), unit: "one-off", tax: 20, active: true, category: "Services" },
  { id: "p4", name: "Priority support", code: "SVC-SUP", price: eur(600), unit: "mo", tax: 20, active: true, category: "Services" },
  { id: "p5", name: "Data migration", code: "SVC-MIG", price: eur(5000), unit: "one-off", tax: 20, active: false, category: "Services" },
];

export default function Products() {
  return (
    <>
      <PageHead title="Products" subtitle={`${PRODUCTS.length} products & services`}
        actions={<Button size="sm"><Plus size={15} strokeWidth={2} />New product</Button>} />
      <Table head={["Product", "Code", "Category", "Price", "Tax", "Status"]}>
        {PRODUCTS.map((p) => (
          <tr key={p.id} className="hover:bg-raised">
            <td className="px-4 py-2.5 text-[13px] font-medium text-ink">{p.name}</td>
            <td className="tnum px-4 py-2.5 text-[12px] text-faint">{p.code}</td>
            <td className="px-4 py-2.5 text-[12.5px] text-muted">{p.category}</td>
            <td className="tnum px-4 py-2.5 text-[12.5px] text-ink">{fmtEur(p.price)} <span className="text-faint">/ {p.unit}</span></td>
            <td className="tnum px-4 py-2.5 text-[12.5px] text-muted">{p.tax}%</td>
            <td className="px-4 py-2.5">{p.active ? <Pill tone="green">Active</Pill> : <Pill>Archived</Pill>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
