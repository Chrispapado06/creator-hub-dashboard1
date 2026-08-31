"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Creators" },
  { href: "/decisions", label: "Decisions" },
  { href: "/digest", label: "Digest" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-white">
            E
          </span>
          <span className="text-sm font-semibold text-white">OnlyFinder Experiments</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-surface-2 text-white" : "text-muted hover:bg-surface-2/60 hover:text-white"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
