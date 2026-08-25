import { useState } from "react";
import { Avatar, Card, DemoBanner, PageHead, Pill } from "@/components/ui";
import { CONTACTS, DEALS, DEMO_NOTICE, eur, fmtDate, orgById } from "@/data/demo";
import { cn } from "@/lib/utils";

type RoleFilter = "all" | "athlete" | "guide" | "operator";

export default function Contacts() {
  const [role, setRole] = useState<RoleFilter>("all");
  const list = role === "all" ? CONTACTS : CONTACTS.filter((c) => c.role === role);

  return (
    <>
      <PageHead title="People" subtitle="Athletes, guides and company contacts." />
      <DemoBanner>{DEMO_NOTICE}</DemoBanner>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "athlete", "guide", "operator"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={cn(
              "h-8 rounded-pill px-3 text-[12.5px] capitalize transition-colors",
              role === r
                ? "bg-accent-soft font-medium text-accent-ink"
                : "border border-line bg-surface text-muted hover:text-ink",
            )}
          >
            {r === "all" ? `Everyone ${CONTACTS.length}` : `${r}s ${CONTACTS.filter((c) => c.role === r).length}`}
          </button>
        ))}
      </div>

      <Card pad={false} className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              {["Name", "Role", "Objective / company", "Country", "Deals", "Last active"].map((h) => (
                <th key={h} className="label px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {list.map((c) => {
              const theirs = DEALS.filter((d) => d.contactId === c.id);
              const value = theirs.reduce((a, d) => a + d.valueEur, 0);
              return (
                <tr key={c.id} className="hover:bg-raised">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={c.name} size={28} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-ink">{c.name}</p>
                        <p className="truncate text-[11.5px] text-faint">{c.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={c.role === "athlete" ? "neutral" : "accent"}>{c.role}</Pill>
                  </td>
                  <td className="px-4 py-3 text-[12.5px] text-muted">
                    {c.objective ?? orgById(c.orgId ?? "")?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[12.5px] text-muted">{c.country}</td>
                  <td className="tnum px-4 py-3 text-[12.5px] text-muted">
                    {theirs.length ? `${theirs.length} · ${eur(value)}` : "—"}
                  </td>
                  <td className="tnum px-4 py-3 text-[12.5px] text-faint">{fmtDate(c.lastActive)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
