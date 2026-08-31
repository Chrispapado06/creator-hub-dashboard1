import { Database, KeyRound, ShieldCheck, Users } from "lucide-react";
import { Card, Label, PageHead, Pill } from "@/components/ui";

export default function Settings() {
  return (
    <>
      <PageHead title="Settings" subtitle="Workspace, team and connection." />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Row icon={Database} title="Database" status="Schema ready" tone="green"
          body="Phases 1–5 are migrated and tenant-isolation-tested (19 checks). Link a Supabase project to run on live data — see cadence-crm/db." />
        <Row icon={ShieldCheck} title="Multi-tenancy" status="Enforced" tone="green"
          body="Every record is scoped to your workspace by row-level security at the database, not the frontend. Cross-tenant access is refused by the engine." />
        <Row icon={Users} title="Team & roles" status="RBAC floor" tone="accent"
          body="Owner, admin, manager and member roles are modelled. Granular per-object permissions layer on in a later phase." />
        <Row icon={KeyRound} title="Authentication" status="Not connected" tone="amber"
          body="Sign-in, OAuth and 2FA come from Supabase Auth once the project is linked. This build runs on demo data." />
      </div>
    </>
  );
}

function Row({ icon: Icon, title, status, tone, body }: {
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  title: string; status: string; tone: "green" | "amber" | "accent"; body: string;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <Icon size={17} strokeWidth={1.8} className="mt-px shrink-0 text-faint" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><Label>{title}</Label><Pill tone={tone}>{status}</Pill></div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{body}</p>
        </div>
      </div>
    </Card>
  );
}
