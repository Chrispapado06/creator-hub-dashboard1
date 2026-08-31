import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, PageHead, Pill, Table } from "@/components/ui";
import { LEADS, fmtEur, userById, type LeadStatus } from "@/data/demo";
import { cn } from "@/lib/utils";

const TABS: (LeadStatus | "all")[] = ["all", "new", "contacted", "qualified", "unqualified"];
const tone: Record<LeadStatus, "neutral" | "accent" | "green" | "amber" | "red"> = {
  new: "accent", contacted: "amber", qualified: "green", unqualified: "red", converted: "green", lost: "neutral",
};

export default function Leads() {
  const [tab, setTab] = useState<LeadStatus | "all">("all");
  const list = tab === "all" ? LEADS : LEADS.filter((l) => l.status === tab);
  return (
    <>
      <PageHead title="Leads" subtitle={`${LEADS.length} leads`}
        actions={<Button size="sm"><Plus size={15} strokeWidth={2} />New lead</Button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("h-8 rounded-pill px-3 text-[12.5px] capitalize",
              tab === t ? "bg-accent-soft font-medium text-accent-ink" : "border border-line bg-surface text-muted hover:text-ink")}>
            {t === "all" ? `All ${LEADS.length}` : `${t} ${LEADS.filter((l) => l.status === t).length}`}
          </button>
        ))}
      </div>
      <Table head={["Name", "Company", "Source", "Value", "Score", "Status", "Owner"]}>
        {list.map((l) => (
          <tr key={l.id} className="hover:bg-raised">
            <td className="px-4 py-2.5 text-[13px] font-medium text-ink">{l.firstName} {l.lastName}</td>
            <td className="px-4 py-2.5 text-[12.5px] text-muted">{l.companyName}</td>
            <td className="px-4 py-2.5 text-[12.5px] text-muted">{l.source}</td>
            <td className="tnum px-4 py-2.5 text-[12.5px] text-ink">{fmtEur(l.value, { compact: true })}</td>
            <td className="px-4 py-2.5">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-14 overflow-hidden rounded-pill bg-raised">
                  <span className="block h-full rounded-pill bg-accent" style={{ width: `${l.score}%` }} />
                </span>
                <span className="tnum text-[11.5px] text-faint">{l.score}</span>
              </span>
            </td>
            <td className="px-4 py-2.5"><Pill tone={tone[l.status]} className="capitalize">{l.status}</Pill></td>
            <td className="px-4 py-2.5"><Pill>{userById(l.ownerId)?.initials}</Pill></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
