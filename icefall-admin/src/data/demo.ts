/**
 * Placeholder data for the visual build.
 *
 * NONE OF THIS IS REAL. No booking below happened, no money moved, and the
 * people and companies named are invented. It exists so the layout can be judged
 * with a populated screen instead of an empty one, and every screen that renders
 * it carries a banner saying so.
 *
 * When the backend lands this whole module is deleted, not "kept as a fallback"
 * — a CRM that quietly falls back to invented revenue is a CRM that lies to the
 * person deciding what the business is worth.
 */

export const DEMO_NOTICE =
  "Placeholder data. Nothing here is real: these bookings never happened, no money has moved, and the people and companies are invented. The database is built but not yet connected — real figures appear here once it is.";

export type StageId = "new" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

export interface Stage {
  id: StageId;
  label: string;
  /**
   * A CSS variable reference, NOT a Tailwind class fragment.
   *
   * `bg-${stage.tone}` cannot work: Tailwind scans source text for complete
   * class names, so a class assembled at runtime is never generated and the
   * element renders with no colour at all. Inline `style` with a var is the
   * honest way to colour something the data decides.
   */
  colour: string;
}

export const STAGES: Stage[] = [
  { id: "new", label: "Enquiry", colour: "var(--adm-stage-new)" },
  { id: "qualified", label: "Qualified", colour: "var(--adm-stage-qualified)" },
  { id: "proposal", label: "Quote sent", colour: "var(--adm-stage-proposal)" },
  { id: "negotiation", label: "Negotiating", colour: "var(--adm-stage-negotiation)" },
  { id: "won", label: "Booked", colour: "var(--adm-stage-won)" },
];

export const stageById = (id: StageId) => STAGES.find((s) => s.id === id);

export type PartnerKind = "guide" | "company";

export interface Organisation {
  id: string;
  name: string;
  kind: PartnerKind;
  country: string;
  /** ICEFALL's cut of a booking, as a percentage. */
  commissionPct: number;
  guides: number;
  since: string;
  status: "active" | "onboarding" | "paused";
}

export const ORGANISATIONS: Organisation[] = [
  { id: "o1", name: "Chamonix Alpine Guides", kind: "company", country: "France", commissionPct: 12, guides: 14, since: "2026-02-11", status: "active" },
  { id: "o2", name: "Solukhumbu Expeditions", kind: "company", country: "Nepal", commissionPct: 10, guides: 22, since: "2026-03-02", status: "active" },
  { id: "o3", name: "Valais Bergführer", kind: "company", country: "Switzerland", commissionPct: 12, guides: 9, since: "2026-04-19", status: "active" },
  { id: "o4", name: "Cordillera Ascents", kind: "company", country: "Argentina", commissionPct: 14, guides: 6, since: "2026-06-01", status: "onboarding" },
  { id: "o5", name: "Atlas Mountain Collective", kind: "company", country: "Morocco", commissionPct: 12, guides: 4, since: "2026-06-24", status: "onboarding" },
  { id: "o6", name: "Julian Alps Guiding", kind: "company", country: "Slovenia", commissionPct: 12, guides: 3, since: "2026-05-08", status: "paused" },
];

export interface Contact {
  id: string;
  name: string;
  role: "athlete" | "guide" | "operator";
  orgId?: string;
  email: string;
  country: string;
  objective?: string;
  lastActive: string;
}

export const CONTACTS: Contact[] = [
  { id: "c1", name: "Marta Ruiz", role: "athlete", email: "m.ruiz@example.com", country: "Spain", objective: "Mont Blanc", lastActive: "2026-08-16" },
  { id: "c2", name: "Jonas Lindqvist", role: "athlete", email: "j.lindqvist@example.com", country: "Sweden", objective: "Matterhorn", lastActive: "2026-08-17" },
  { id: "c3", name: "Priya Raman", role: "athlete", email: "p.raman@example.com", country: "United Kingdom", objective: "Ama Dablam", lastActive: "2026-08-15" },
  { id: "c4", name: "Tobias Frei", role: "guide", orgId: "o3", email: "t.frei@example.com", country: "Switzerland", lastActive: "2026-08-17" },
  { id: "c5", name: "Pemba Sherpa", role: "guide", orgId: "o2", email: "p.sherpa@example.com", country: "Nepal", lastActive: "2026-08-14" },
  { id: "c6", name: "Camille Roux", role: "operator", orgId: "o1", email: "c.roux@example.com", country: "France", lastActive: "2026-08-17" },
  { id: "c7", name: "Diego Salas", role: "athlete", email: "d.salas@example.com", country: "Chile", objective: "Aconcagua", lastActive: "2026-08-12" },
  { id: "c8", name: "Hanne Bakke", role: "athlete", email: "h.bakke@example.com", country: "Norway", objective: "Denali", lastActive: "2026-08-17" },
];

export interface Deal {
  id: string;
  title: string;
  contactId: string;
  orgId: string;
  peak: string;
  stage: StageId;
  /** Total booking value in EUR. ICEFALL earns commissionPct of this. */
  valueEur: number;
  departs: string;
  updated: string;
  owner: string;
}

export const DEALS: Deal[] = [
  { id: "d1", title: "Mont Blanc — 3 day, guided", contactId: "c1", orgId: "o1", peak: "Mont Blanc", stage: "negotiation", valueEur: 2400, departs: "2027-04-17", updated: "2026-08-17", owner: "CP" },
  { id: "d2", title: "Matterhorn — Hörnli ridge", contactId: "c2", orgId: "o3", peak: "Matterhorn", stage: "proposal", valueEur: 3100, departs: "2027-07-02", updated: "2026-08-17", owner: "CP" },
  { id: "d3", title: "Ama Dablam — full expedition", contactId: "c3", orgId: "o2", peak: "Ama Dablam", stage: "qualified", valueEur: 8600, departs: "2027-10-28", updated: "2026-08-16", owner: "LM" },
  { id: "d4", title: "Aconcagua — Normal route", contactId: "c7", orgId: "o4", peak: "Aconcagua", stage: "new", valueEur: 4200, departs: "2027-01-12", updated: "2026-08-15", owner: "LM" },
  { id: "d5", title: "Denali — West Buttress", contactId: "c8", orgId: "o2", peak: "Denali", stage: "new", valueEur: 9800, departs: "2027-06-04", updated: "2026-08-17", owner: "CP" },
  { id: "d6", title: "Gran Paradiso — 2 day", contactId: "c1", orgId: "o1", peak: "Gran Paradiso", stage: "won", valueEur: 1250, departs: "2026-09-19", updated: "2026-08-11", owner: "CP" },
  { id: "d7", title: "Eiger — Mittellegi", contactId: "c2", orgId: "o3", peak: "Eiger", stage: "won", valueEur: 3800, departs: "2026-09-30", updated: "2026-08-09", owner: "LM" },
  { id: "d8", title: "Toubkal — winter ascent", contactId: "c7", orgId: "o5", peak: "Toubkal", stage: "qualified", valueEur: 1400, departs: "2027-02-08", updated: "2026-08-14", owner: "LM" },
  { id: "d9", title: "Mont Blanc — Trois Monts", contactId: "c8", orgId: "o1", peak: "Mont Blanc", stage: "proposal", valueEur: 2650, departs: "2027-06-21", updated: "2026-08-16", owner: "CP" },
  { id: "d10", title: "Triglav — north face", contactId: "c3", orgId: "o6", peak: "Triglav", stage: "negotiation", valueEur: 980, departs: "2026-10-05", updated: "2026-08-13", owner: "LM" },
];

export interface Conversation {
  id: string;
  athleteId: string;
  partnerId: string;
  peak: string;
  lastMessage: string;
  at: string;
  unreplied: boolean;
  messages: number;
}

export const CONVERSATIONS: Conversation[] = [
  { id: "t1", athleteId: "c1", partnerId: "c6", peak: "Mont Blanc", lastMessage: "That window works for us — I'll hold the hut for 48 hours.", at: "2026-08-17T09:12:00Z", unreplied: false, messages: 14 },
  { id: "t2", athleteId: "c2", partnerId: "c4", peak: "Matterhorn", lastMessage: "Could you send the quote with the acclimatisation days included?", at: "2026-08-17T07:41:00Z", unreplied: true, messages: 6 },
  { id: "t3", athleteId: "c3", partnerId: "c5", peak: "Ama Dablam", lastMessage: "We usually run a 4-day rotation before the summit push.", at: "2026-08-16T16:03:00Z", unreplied: false, messages: 21 },
  { id: "t4", athleteId: "c8", partnerId: "c5", peak: "Denali", lastMessage: "What's your longest carry with 25 kg?", at: "2026-08-17T11:28:00Z", unreplied: true, messages: 3 },
  { id: "t5", athleteId: "c7", partnerId: "c6", peak: "Aconcagua", lastMessage: "Thanks — I'll confirm once my leave is approved.", at: "2026-08-15T18:55:00Z", unreplied: false, messages: 9 },
];

/** Revenue by month — ICEFALL's commission, not booking value. */
export const REVENUE_BY_MONTH = [
  { month: "Mar", bookings: 3, grossEur: 6400 },
  { month: "Apr", bookings: 5, grossEur: 11200 },
  { month: "May", bookings: 4, grossEur: 9800 },
  { month: "Jun", bookings: 8, grossEur: 19400 },
  { month: "Jul", bookings: 11, grossEur: 27600 },
  { month: "Aug", bookings: 9, grossEur: 22100 },
];

export const SIGNUPS_BY_WEEK = [18, 24, 21, 33, 29, 41, 38, 52, 47, 61, 58, 74];

export const contactById = (id: string) => CONTACTS.find((c) => c.id === id);
export const orgById = (id: string) => ORGANISATIONS.find((o) => o.id === id);

export const eur = (n: number) =>
  n >= 1000 ? `€${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `€${n}`;

export const eurFull = (n: number) => `€${n.toLocaleString("en-GB")}`;

export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "··";
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/* -------------------------------------------------------------------------- */
/* Referrals — expedition companies (money settles off-platform)              */
/* -------------------------------------------------------------------------- */

import { eur as toCents, referralFee, type Cents, type ReferralStatus } from "@/money/model";

export interface Referral {
  id: string;
  client: string;
  orgId: string;
  objective: string;
  /** When ICEFALL passed the qualified, readiness-verified client to the company. */
  introducedAt: string;
  status: ReferralStatus;
  referralPct: number;
  /** Present once a booking is reported. The fee is computed from it. */
  bookingValue?: Cents;
  bookedAt?: string;
}

// Deliberately spans every state, and leans on the payout-blocked companies
// (Solukhumbu/Nepal, Atlas/Morocco) — for those, a referral fee is the ONLY
// revenue ICEFALL can earn, since it cannot process their bookings at all.
export const REFERRALS: Referral[] = [
  { id: "r1", client: "Priya Raman", orgId: "o2", objective: "Ama Dablam", introducedAt: "2026-07-02T00:00:00Z", status: "paid", referralPct: 10, bookingValue: toCents(8600), bookedAt: "2026-07-20T00:00:00Z" },
  { id: "r2", client: "Diego Salas", orgId: "o4", objective: "Aconcagua", introducedAt: "2026-08-01T00:00:00Z", status: "invoiced", referralPct: 12, bookingValue: toCents(4200), bookedAt: "2026-08-14T00:00:00Z" },
  { id: "r3", client: "Hanne Bakke", orgId: "o2", objective: "Everest", introducedAt: "2026-08-10T00:00:00Z", status: "booked", referralPct: 10, bookingValue: toCents(62000), bookedAt: "2026-08-16T00:00:00Z" },
  { id: "r4", client: "Jonas Lindqvist", orgId: "o5", objective: "Toubkal winter", introducedAt: "2026-08-12T00:00:00Z", status: "introduced", referralPct: 12 },
  { id: "r5", client: "Marta Ruiz", orgId: "o1", objective: "Mont Blanc", introducedAt: "2026-08-15T00:00:00Z", status: "introduced", referralPct: 12 },
  { id: "r6", client: "Tomas Novak", orgId: "o2", objective: "Manaslu", introducedAt: "2026-05-04T00:00:00Z", status: "disputed", referralPct: 10, bookingValue: toCents(11500), bookedAt: "2026-06-01T00:00:00Z" },
  { id: "r7", client: "Ana Costa", orgId: "o4", objective: "Aconcagua", introducedAt: "2025-06-01T00:00:00Z", status: "expired", referralPct: 12 },
];

export function referralAmount(r: Referral): Cents {
  return r.bookingValue ? referralFee(r.bookingValue, r.referralPct) : 0;
}
