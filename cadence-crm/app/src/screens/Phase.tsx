import {
  Blocks, CalendarDays, FileText, FolderKanban, GitBranch, LayoutGrid, Mail,
  TrendingUp, Workflow,
} from "lucide-react";
import { EmptyState, PageHead } from "@/components/ui";

/**
 * Screens whose data model is built (schema + RLS) but whose UI lands in a later
 * phase. Honest empty states (§43): they say what the section does and which
 * phase brings it, rather than faking a feature that does not work yet (§48).
 */
function Phase({ title, sub, body, icon, phase }: {
  title: string; sub: string; body: string; phase: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
}) {
  return (
    <>
      <PageHead title={title} subtitle={sub} />
      <EmptyState icon={icon} title={`${title} — Phase ${phase}`} body={body} />
    </>
  );
}

export const Calendar = () => <Phase title="Calendar" sub="Day, week, month, agenda" phase="5" icon={CalendarDays}
  body="Activities render on a drag-to-reschedule calendar with Google and Microsoft sync. The activity model is built; the calendar view lands in Phase 5." />;
export const Mailbox = () => <Phase title="Mail" sub="Connected inbox" phase="6" icon={Mail}
  body="A connected sales inbox — send, track opens and clicks, and thread email onto the deal timeline. Needs your Gmail/Microsoft OAuth to go live." />;
export const Automations = () => <Phase title="Automations" sub="Trigger → condition → action" phase="8" icon={Workflow}
  body="A visual builder: when a deal enters a stage, if its value clears a threshold, then create a task and notify a manager. Runs on the deal and activity events already modelled." />;
export const Sequences = () => <Phase title="Sequences" sub="Multi-step follow-up" phase="9" icon={GitBranch}
  body="Enroll a contact in a cadence of emails, calls and waits, and watch sent/opened/replied. Email steps need the mail connection from Phase 6." />;
export const Reports = () => <Phase title="Reports" sub="Build any view of your data" phase="10" icon={LayoutGrid}
  body="Custom reports over deals, leads, activities and revenue — grouped by owner, stage, source or month, exportable to CSV. Reads the same isolated tables as everything else." />;
export const Forecast = () => <Phase title="Forecast" sub="Weighted revenue and gap to target" phase="10" icon={TrendingUp}
  body="Pipeline, weighted pipeline, won revenue and gap-to-target, by salesperson, team and quarter. Computed from the deal and stage-probability data." />;
export const Projects = () => <Phase title="Projects" sub="Post-sale delivery" phase="11" icon={FolderKanban}
  body="Turn a won deal into a delivery project with tasks, milestones and a Kanban. Linked to the customer and the deal that started it." />;
export const Documents = () => <Phase title="Documents" sub="Quotes, proposals, contracts" phase="11" icon={FileText}
  body="Generate quotes and proposals from templates with live CRM variables, export to PDF, and attach them to the deal. Line-item pricing comes from Products." />;
export const Marketplace = () => <Phase title="Marketplace" sub="Integrations" phase="13" icon={Blocks}
  body="Connect email, calendar, accounting and storage. The integration and webhook tables are modelled; each connection needs its provider's credentials." />;
