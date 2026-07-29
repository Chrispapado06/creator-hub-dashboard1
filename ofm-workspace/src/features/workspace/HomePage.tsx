import { useCurrentMember } from "@/features/auth/use-current-member";
import { RoleBadge } from "./role-badge";

export default function HomePage() {
  const { data: member } = useCurrentMember();
  const firstName = member?.fullName ? member.fullName.split(/\s+/)[0] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-muted-foreground">Your shared OFM agency workspace.</p>
      </header>

      <div className="space-y-3 rounded-lg border p-5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Your role:</span>
          {member ? <RoleBadge role={member.role} /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          The foundation is in place — accounts, roles, and secure access. The
          block editor and the OFM databases (creators, content calendar,
          shifts &amp; handoffs, tasks, revenue, templates, and team chat) arrive
          in the next build steps.
        </p>
      </div>
    </div>
  );
}
