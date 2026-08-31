import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Avatar, Button, PageHead, Pill, Table } from "@/components/ui";
import { CONTACTS, companyById, contactName, userById } from "@/data/demo";

export default function Contacts() {
  const [q, setQ] = useState("");
  const list = CONTACTS.filter((c) => {
    const hay = `${contactName(c)} ${c.email} ${c.jobTitle} ${companyById(c.companyId)?.name ?? ""}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });
  return (
    <>
      <PageHead title="Contacts" subtitle={`${CONTACTS.length} people`}
        actions={<Button size="sm"><Plus size={15} strokeWidth={2} />New contact</Button>} />
      <div className="mb-3 flex max-w-sm items-center gap-2.5 rounded-tile border border-line bg-surface px-3 py-2">
        <Search size={15} strokeWidth={1.9} className="text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts"
          className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" />
      </div>
      <Table head={["Name", "Title", "Organization", "Email", "Owner", "Last activity"]}>
        {list.map((c) => (
          <tr key={c.id} className="hover:bg-raised">
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <Avatar name={contactName(c)} size={28} />
                <span className="text-[13px] font-medium text-ink">{contactName(c)}</span>
              </div>
            </td>
            <td className="px-4 py-2.5 text-[12.5px] text-muted">{c.jobTitle}</td>
            <td className="px-4 py-2.5 text-[12.5px] text-muted">{companyById(c.companyId)?.name}</td>
            <td className="px-4 py-2.5 text-[12.5px] text-muted">{c.email}</td>
            <td className="px-4 py-2.5"><Pill>{userById(c.ownerId)?.initials}</Pill></td>
            <td className="tnum px-4 py-2.5 text-[12px] text-faint">{new Date(c.lastActivityAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
