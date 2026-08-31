import { CalendarClock, Check, Mail, Phone, Users } from "lucide-react";
import { Card, Label, PageHead, Pill } from "@/components/ui";
import { ACTIVITIES, NOW, contactById, contactName, userById, type ActivityType } from "@/data/demo";
import { cn } from "@/lib/utils";

const icon: Record<ActivityType, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  call: Phone, meeting: Users, task: Check, deadline: CalendarClock, email: Mail,
};

export default function Activities() {
  const planned = ACTIVITIES.filter((a) => a.status === "planned").sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));
  const done = ACTIVITIES.filter((a) => a.status === "done");
  return (
    <>
      <PageHead title="Activities" subtitle={`${planned.length} planned · ${planned.filter((a) => new Date(a.dueAt) < NOW).length} overdue`} />
      <Label>To do</Label>
      <Card className="mt-3" pad={false}>
        <ul className="divide-y divide-line-soft">
          {planned.map((a) => {
            const Icon = icon[a.type]; const overdue = new Date(a.dueAt) < NOW; const contact = contactById(a.contactId);
            return (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-8 w-8 place-items-center rounded-tile bg-raised text-muted ring-1 ring-line"><Icon size={15} strokeWidth={1.9} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">{a.title}</p>
                  <p className="truncate text-[11.5px] text-faint capitalize">{a.type}{contact && ` · ${contactName(contact)}`}</p>
                </div>
                <span className={cn("tnum text-[12px]", overdue ? "text-[oklch(0.55_0.16_25)]" : "text-faint")}>
                  {new Date(a.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                {overdue && <Pill tone="red">overdue</Pill>}
                <Pill>{userById(a.ownerId)?.initials}</Pill>
              </li>
            );
          })}
        </ul>
      </Card>
      {done.length > 0 && (
        <>
          <Label className="mt-6">Done</Label>
          <Card className="mt-3" pad={false}>
            <ul className="divide-y divide-line-soft">
              {done.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3 opacity-60">
                  <span className="grid h-8 w-8 place-items-center rounded-tile bg-[oklch(0.955_0.04_155)] text-[oklch(0.44_0.11_155)]"><Check size={15} strokeWidth={2.2} /></span>
                  <p className="flex-1 truncate text-[13px] text-ink line-through">{a.title}</p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
