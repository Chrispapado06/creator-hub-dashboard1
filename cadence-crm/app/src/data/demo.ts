/**
 * Demo data — shaped exactly like the Postgres schema in `cadence-crm/db`.
 *
 * Money is minor units (cents), as in the DB. Every record carries the fields
 * its table does, so swapping this module for live Supabase queries later
 * touches no screen. Nothing here is real.
 */

export const CURRENCY = "EUR";
export const eur = (whole: number) => Math.round(whole * 100); // → minor units

export function fmtEur(cents: number, opts?: { compact?: boolean }): string {
  if (opts?.compact && Math.abs(cents) >= 100000) {
    return `€${(cents / 100000).toFixed(cents % 100000 === 0 ? 0 : 1)}k`;
  }
  const n = cents / 100;
  return `€${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export const NOW = new Date("2026-08-18T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

/* -------------------------------------------------------------------------- */

export interface Person {
  id: string;
  name: string;
  initials: string;
}
export const USERS: Person[] = [
  { id: "u1", name: "You", initials: "YO" },
  { id: "u2", name: "Lena Ortiz", initials: "LO" },
  { id: "u3", name: "Marcus Webb", initials: "MW" },
];
export const userById = (id: string) => USERS.find((u) => u.id === id);

export interface Company {
  id: string;
  name: string;
  domain: string;
  industry: string;
  employees: number;
  ownerId: string;
}
export const COMPANIES: Company[] = [
  { id: "co1", name: "Northwind Logistics", domain: "northwind.com", industry: "Logistics", employees: 240, ownerId: "u1" },
  { id: "co2", name: "Brightpath Health", domain: "brightpath.io", industry: "Healthcare", employees: 1200, ownerId: "u2" },
  { id: "co3", name: "Vellum Studios", domain: "vellum.co", industry: "Media", employees: 45, ownerId: "u1" },
  { id: "co4", name: "Kestrel Robotics", domain: "kestrel.ai", industry: "Manufacturing", employees: 88, ownerId: "u3" },
  { id: "co5", name: "Anodyne Foods", domain: "anodyne.com", industry: "Retail", employees: 610, ownerId: "u2" },
];
export const companyById = (id?: string) => COMPANIES.find((c) => c.id === id);

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  companyId: string;
  ownerId: string;
  lastActivityAt: string;
}
export const CONTACTS: Contact[] = [
  { id: "c1", firstName: "Priya", lastName: "Raman", email: "priya@northwind.com", jobTitle: "VP Operations", companyId: "co1", ownerId: "u1", lastActivityAt: daysAgo(1) },
  { id: "c2", firstName: "Jonas", lastName: "Lindqvist", email: "jonas@brightpath.io", jobTitle: "CTO", companyId: "co2", ownerId: "u2", lastActivityAt: daysAgo(3) },
  { id: "c3", firstName: "Marta", lastName: "Ruiz", email: "marta@vellum.co", jobTitle: "Head of Growth", companyId: "co3", ownerId: "u1", lastActivityAt: daysAgo(9) },
  { id: "c4", firstName: "Diego", lastName: "Salas", email: "diego@kestrel.ai", jobTitle: "COO", companyId: "co4", ownerId: "u3", lastActivityAt: daysAgo(2) },
  { id: "c5", firstName: "Hanne", lastName: "Bakke", email: "hanne@anodyne.com", jobTitle: "Procurement Lead", companyId: "co5", ownerId: "u2", lastActivityAt: daysAgo(21) },
  { id: "c6", firstName: "Tomas", lastName: "Novak", email: "tomas@northwind.com", jobTitle: "IT Director", companyId: "co1", ownerId: "u1", lastActivityAt: daysAgo(5) },
];
export const contactById = (id?: string) => CONTACTS.find((c) => c.id === id);
export const contactName = (c: Contact) => `${c.firstName} ${c.lastName}`;

export type LeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "converted" | "lost";
export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  source: string;
  value: number;
  status: LeadStatus;
  score: number;
  ownerId: string;
  createdAt: string;
}
export const LEADS: Lead[] = [
  { id: "l1", firstName: "Aoife", lastName: "Byrne", companyName: "Tidewater Marine", email: "aoife@tidewater.com", source: "Website", value: eur(24000), status: "new", score: 62, ownerId: "u1", createdAt: daysAgo(1) },
  { id: "l2", firstName: "Ravi", lastName: "Menon", companyName: "Cobalt Analytics", email: "ravi@cobalt.io", source: "Referral", value: eur(48000), status: "contacted", score: 78, ownerId: "u2", createdAt: daysAgo(2) },
  { id: "l3", firstName: "Sofia", lastName: "Klein", companyName: "Meridian Legal", email: "sofia@meridian.law", source: "Event", value: eur(12000), status: "qualified", score: 84, ownerId: "u1", createdAt: daysAgo(4) },
  { id: "l4", firstName: "Owen", lastName: "Frost", companyName: "Harbor Freight Co", email: "owen@harborfreight.com", source: "Cold outreach", value: eur(9000), status: "new", score: 41, ownerId: "u3", createdAt: daysAgo(1) },
  { id: "l5", firstName: "Nadia", lastName: "Haddad", companyName: "Selene Cosmetics", email: "nadia@selene.com", source: "Website", value: eur(31000), status: "unqualified", score: 22, ownerId: "u2", createdAt: daysAgo(6) },
];

export interface Stage {
  id: string;
  name: string;
  probability: number;
  color: string;
}
export const STAGES: Stage[] = [
  { id: "s1", name: "Lead in", probability: 10, color: "oklch(0.6 0.13 252)" },
  { id: "s2", name: "Contact made", probability: 25, color: "oklch(0.58 0.14 292)" },
  { id: "s3", name: "Proposal sent", probability: 45, color: "oklch(0.68 0.13 68)" },
  { id: "s4", name: "Negotiation", probability: 70, color: "oklch(0.64 0.13 32)" },
  { id: "s5", name: "Won", probability: 100, color: "oklch(0.58 0.12 152)" },
];

export type DealStatus = "open" | "won" | "lost";
export interface Deal {
  id: string;
  title: string;
  value: number;
  stageId: string;
  status: DealStatus;
  companyId: string;
  contactId: string;
  ownerId: string;
  expectedClose: string;
  lastActivityAt: string;
  createdAt: string;
}
export const DEALS: Deal[] = [
  { id: "d1", title: "Northwind — fleet rollout", value: eur(64000), stageId: "s4", status: "open", companyId: "co1", contactId: "c1", ownerId: "u1", expectedClose: daysAhead(20), lastActivityAt: daysAgo(1), createdAt: daysAgo(40) },
  { id: "d2", title: "Brightpath — platform licence", value: eur(120000), stageId: "s3", status: "open", companyId: "co2", contactId: "c2", ownerId: "u2", expectedClose: daysAhead(35), lastActivityAt: daysAgo(2), createdAt: daysAgo(28) },
  { id: "d3", title: "Vellum — retainer", value: eur(18000), stageId: "s2", status: "open", companyId: "co3", contactId: "c3", ownerId: "u1", expectedClose: daysAhead(14), lastActivityAt: daysAgo(11), createdAt: daysAgo(22) },
  { id: "d4", title: "Kestrel — pilot", value: eur(42000), stageId: "s1", status: "open", companyId: "co4", contactId: "c4", ownerId: "u3", expectedClose: daysAhead(50), lastActivityAt: daysAgo(2), createdAt: daysAgo(9) },
  { id: "d5", title: "Anodyne — supply deal", value: eur(88000), stageId: "s4", status: "open", companyId: "co5", contactId: "c5", ownerId: "u2", expectedClose: daysAhead(8), lastActivityAt: daysAgo(19), createdAt: daysAgo(60) },
  { id: "d6", title: "Northwind — analytics add-on", value: eur(26500), stageId: "s3", status: "open", companyId: "co1", contactId: "c6", ownerId: "u1", expectedClose: daysAhead(25), lastActivityAt: daysAgo(4), createdAt: daysAgo(16) },
  { id: "d7", title: "Vellum — campaign", value: eur(12500), stageId: "s5", status: "won", companyId: "co3", contactId: "c3", ownerId: "u1", expectedClose: daysAgo(5), lastActivityAt: daysAgo(5), createdAt: daysAgo(48) },
  { id: "d8", title: "Kestrel — maintenance", value: eur(38000), stageId: "s5", status: "won", companyId: "co4", contactId: "c4", ownerId: "u3", expectedClose: daysAgo(12), lastActivityAt: daysAgo(12), createdAt: daysAgo(70) },
  { id: "d9", title: "Brightpath — expansion", value: eur(54000), stageId: "s2", status: "open", companyId: "co2", contactId: "c2", ownerId: "u2", expectedClose: daysAhead(60), lastActivityAt: daysAgo(1), createdAt: daysAgo(6) },
];

/** Deal rotting (§7): no activity for longer than the threshold. */
export const ROT_THRESHOLD_DAYS = 7;
export function daysSinceActivity(d: Deal): number {
  return Math.floor((NOW.getTime() - new Date(d.lastActivityAt).getTime()) / 86_400_000);
}
export function isRotting(d: Deal): boolean {
  return d.status === "open" && daysSinceActivity(d) >= ROT_THRESHOLD_DAYS;
}

export type ActivityType = "call" | "meeting" | "task" | "deadline" | "email";
export type ActivityStatus = "planned" | "done" | "cancelled";
export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  dueAt: string;
  status: ActivityStatus;
  dealId?: string;
  contactId?: string;
  ownerId: string;
}
export const ACTIVITIES: Activity[] = [
  { id: "a1", type: "call", title: "Follow up on proposal", dueAt: daysAgo(1), status: "planned", dealId: "d1", contactId: "c1", ownerId: "u1" },
  { id: "a2", type: "meeting", title: "Technical deep-dive", dueAt: daysAhead(1), status: "planned", dealId: "d2", contactId: "c2", ownerId: "u2" },
  { id: "a3", type: "task", title: "Send pricing breakdown", dueAt: daysAgo(3), status: "planned", dealId: "d5", contactId: "c5", ownerId: "u2" },
  { id: "a4", type: "email", title: "Intro to procurement", dueAt: daysAhead(2), status: "planned", dealId: "d6", contactId: "c6", ownerId: "u1" },
  { id: "a5", type: "deadline", title: "Contract signature", dueAt: daysAhead(6), status: "planned", dealId: "d5", contactId: "c5", ownerId: "u2" },
  { id: "a6", type: "call", title: "Discovery call", dueAt: daysAgo(2), status: "done", dealId: "d4", contactId: "c4", ownerId: "u3" },
];

/** Revenue booked by month — from won deals; here as a small series for the chart. */
export const REVENUE_BY_MONTH = [
  { month: "Mar", cents: eur(84000) },
  { month: "Apr", cents: eur(112000) },
  { month: "May", cents: eur(96000) },
  { month: "Jun", cents: eur(148000) },
  { month: "Jul", cents: eur(176000) },
  { month: "Aug", cents: eur(131000) },
];
