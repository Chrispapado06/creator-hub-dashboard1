import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, Building2, CornerDownLeft, Handshake, Plus, Search, User, Zap,
} from "lucide-react";
import { COMPANIES, CONTACTS, DEALS, companyById, contactName, fmtEur } from "@/data/demo";
import { cn } from "@/lib/utils";

/**
 * The command palette (§47) — Cmd/Ctrl+K.
 *
 * Two kinds of result in one list: ACTIONS ("Create deal", "Go to Forecast") and
 * RECORDS matched from the demo data (§34: deals, people, organizations). Typing
 * filters both; Enter runs the highlighted one. Arrow keys move; Escape closes.
 */
type Item = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  run: () => void;
  group: string;
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const go = (to: string) => { navigate(to); onClose(); };

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: "new-deal", label: "Create deal", icon: Plus, group: "Actions", run: () => go("/deals") },
      { id: "new-lead", label: "Create lead", icon: Plus, group: "Actions", run: () => go("/leads") },
      { id: "new-contact", label: "Create contact", icon: Plus, group: "Actions", run: () => go("/contacts") },
      { id: "go-forecast", label: "Go to Forecast", icon: ArrowRight, group: "Actions", run: () => go("/forecast") },
      { id: "go-reports", label: "Go to Reports", icon: ArrowRight, group: "Actions", run: () => go("/reports") },
      { id: "go-auto", label: "Go to Automations", icon: Zap, group: "Actions", run: () => go("/automations") },
    ];
    const deals: Item[] = DEALS.map((d) => ({
      id: `deal-${d.id}`, label: d.title, hint: fmtEur(d.value, { compact: true }),
      icon: Handshake, group: "Deals", run: () => go("/deals"),
    }));
    const people: Item[] = CONTACTS.map((c) => ({
      id: `contact-${c.id}`, label: contactName(c), hint: companyById(c.companyId)?.name,
      icon: User, group: "People", run: () => go("/contacts"),
    }));
    const orgs: Item[] = COMPANIES.map((c) => ({
      id: `org-${c.id}`, label: c.name, hint: c.industry, icon: Building2, group: "Organizations", run: () => go("/organizations"),
    }));
    return [...actions, ...deals, ...people, ...orgs];
  }, [navigate, onClose]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.filter((i) => i.group === "Actions");
    return items.filter((i) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(s)).slice(0, 24);
  }, [q, items]);

  useEffect(() => {
    if (open) {
      setQ(""); setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);
  useEffect(() => setActive(0), [q]);

  if (!open) return null;

  const groups = [...new Set(results.map((r) => r.group))];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[oklch(0.3_0.02_265_/_0.35)] backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-[560px] overflow-hidden rounded-card border border-line bg-surface shadow-[0_30px_80px_-20px_rgba(20,20,40,0.35)]"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); results[active]?.run(); }
          else if (e.key === "Escape") onClose();
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} strokeWidth={2} className="text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search deals, people, organizations — or type a command"
            className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
          />
        </div>

        <div className="no-scrollbar max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-faint">No matches for “{q}”.</p>
          )}
          {groups.map((g) => (
            <div key={g} className="mb-1">
              <p className="label px-2.5 py-1.5">{g}</p>
              {results.filter((r) => r.group === g).map((r) => {
                const idx = results.indexOf(r);
                const on = idx === active;
                const Icon = r.icon;
                return (
                  <button
                    key={r.id}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => r.run()}
                    className={cn("flex w-full items-center gap-3 rounded-tile px-2.5 py-2 text-left", on ? "bg-accent-soft" : "hover:bg-raised")}
                  >
                    <Icon size={15} strokeWidth={1.9} className={on ? "text-accent-ink" : "text-faint"} />
                    <span className={cn("flex-1 truncate text-[13px]", on ? "text-accent-ink" : "text-ink")}>{r.label}</span>
                    {r.hint && <span className="tnum text-[11.5px] text-faint">{r.hint}</span>}
                    {on && <CornerDownLeft size={13} strokeWidth={2} className="text-accent-ink" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
