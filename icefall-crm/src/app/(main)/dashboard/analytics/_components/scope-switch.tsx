"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Web ⇄ App.
 *
 * ICEFALL is two products sharing a brand — the marketing site and the phone
 * app — and their traffic answers different questions. The pages behind these
 * two links are SEPARATE COPIES so each can diverge as we learn what each one
 * needs; this switch is deliberately NOT duplicated, so the way you move
 * between them cannot drift apart.
 *
 * Two routes rather than client-side state: a scope you can send someone a
 * link to, and one the back button understands.
 */
export function AnalyticsScopeSwitch({ active }: { active: "web" | "app" }) {
  const options = [
    { key: "web", label: "Web", href: "/dashboard/analytics/web" },
    { key: "app", label: "App", href: "/dashboard/analytics/app" },
  ] as const;

  return (
    <div
      aria-label="Analytics scope"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1"
      role="group"
    >
      {options.map((o) => (
        <Link
          aria-current={active === o.key ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 text-sm transition-colors",
            active === o.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          href={o.href}
          key={o.key}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
