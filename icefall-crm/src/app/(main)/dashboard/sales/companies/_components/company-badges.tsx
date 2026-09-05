"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { CompanyRow, CompanyStatus, VerificationStatus } from "./data";
import { formatDay } from "./format";

/**
 * ONE definition of each company badge, used by the roster, the record and the
 * editor — so no two surfaces can disagree about the same row.
 */

const STATUS_META: Record<CompanyStatus, { label: string; badge: string; dot: string }> = {
  prospect: {
    label: "Prospect",
    badge: "border-border bg-muted/50 text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  onboarding: {
    label: "Onboarding",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  active: {
    label: "Active",
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  suspended: {
    label: "Suspended",
    badge: "border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  churned: {
    label: "Churned",
    badge: "border-destructive/20 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
};

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium", meta.badge)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

/**
 * The four states that are not a verification, each in its own tone: a refusal
 * is destructive, a review under way is amber, and "nobody has looked" is
 * neutral — because an unreviewed company has not failed anything.
 */
const UNVERIFIED_META: Record<Exclude<VerificationStatus, "verified">, { badge: string; dot: string }> = {
  unverified: { badge: "border-border bg-muted/50 text-muted-foreground", dot: "bg-muted-foreground" },
  pending: {
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  rejected: { badge: "border-destructive/20 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  suspended: { badge: "border-destructive/20 bg-destructive/10 text-destructive", dot: "bg-destructive" },
};

/**
 * What "verified" is allowed to say on a screen.
 *
 * ICEFALL checks documents. It does not contact the issuing association, and it
 * must never print anything a reader could take as meaning it did. The date
 * comes from `documents_checked_at`, which is NULL until a real staff review
 * recorded one — so an unchecked company shows the absence, not a placeholder.
 *
 * The unverified / pending / rejected / suspended cases print the RAW status
 * word rather than a friendlier synonym.
 */
export function VerificationChip({ company }: { company: CompanyRow }) {
  if (company.verification_status !== "verified") {
    const meta = UNVERIFIED_META[company.verification_status];
    return (
      <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium capitalize", meta.badge)}>
        <span className={cn("size-1.5 rounded-full", meta.dot)} />
        {company.verification_status}
      </Badge>
    );
  }
  const on = formatDay(company.documents_checked_at);
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-600 dark:text-emerald-400"
    >
      <span className="size-1.5 rounded-full bg-emerald-500" />
      {on ? `Documents checked ${on}` : "Documents checked"}
    </Badge>
  );
}

/**
 * ═══ THE DISCLOSURE BADGE IS LOAD-BEARING ═══
 *
 * What this listing claims about itself. TRUE carries the public disclosure;
 * FALSE is the default every company is born with. NEITHER BRANCH MAY BE
 * DROPPED, and on the record header this is the LAST badge in the row so
 * nothing can push it off. Losing it in a re-skin is a legal problem, not a
 * cosmetic one — grep `real_business` before and after any work here.
 */
export function RealBusinessBadge({ real }: { real: boolean }) {
  return real ? (
    <Badge
      variant="outline"
      className="border-amber-500/20 bg-amber-500/10 px-2 py-1 font-medium text-amber-600 dark:text-amber-400"
    >
      Real business — disclosure shown
    </Badge>
  ) : (
    <Badge variant="outline" className="border-border bg-muted/50 px-2 py-1 font-medium text-muted-foreground">
      Invented company
    </Badge>
  );
}

/**
 * A company mark in a SQUARE — the owner's instruction ("real company logos …
 * in square not circle"), so this exists beside `Avatar` rather than replacing
 * it: people stay round, businesses go square.
 *
 * There is no network layer in this build and no logo is stored in the
 * repository, so the mark is the company's initials. Fetching a real operator's
 * mark from its own site arrives with the network layer; nothing here pretends
 * to have tried.
 */
export function CompanyLogo({ name, size = 34, className }: { name: string; size?: number; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      className={cn("grid shrink-0 place-items-center rounded-md bg-muted font-bold text-muted-foreground", className)}
    >
      {letters}
    </span>
  );
}
