import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Search, Table2 } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PageIcon } from "@/features/pages/PageIcon";
import { usePages } from "@/features/pages/use-pages";
import { useDatabases } from "@/features/databases/use-databases";

/** Custom event so anything (e.g. a sidebar button) can open the palette. */
export const openCommandPalette = () =>
  window.dispatchEvent(new Event("ofm:command-palette"));

type Result = {
  kind: "page" | "db";
  id: string;
  title: string;
  icon: string | null;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const navigate = useNavigate();
  const { data: pages = [] } = usePages();
  const { data: dbs = [] } = useDatabases();

  // Cmd/Ctrl+K toggles; custom event opens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onEvt = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ofm:command-palette", onEvt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ofm:command-palette", onEvt);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const query = q.trim().toLowerCase();
    const all: Result[] = [
      ...pages.map((p) => ({
        kind: "page" as const,
        id: p.id,
        title: p.title || "Untitled",
        icon: p.icon,
      })),
      ...dbs.map((d) => ({
        kind: "db" as const,
        id: d.id,
        title: d.title || "Untitled database",
        icon: d.icon,
      })),
    ];
    const filtered = query
      ? all.filter((x) => x.title.toLowerCase().includes(query))
      : all;
    return filtered.slice(0, 50);
  }, [q, pages, dbs]);

  useEffect(() => setSel(0), [q]);

  function go(r: Result) {
    setOpen(false);
    navigate(r.kind === "page" ? `/page/${r.id}` : `/db/${r.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[15%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const r = results[sel];
                if (r) go(r);
              }
            }}
            placeholder="Search pages and databases…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No results
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.kind + r.id}
                type="button"
                onMouseEnter={() => setSel(i)}
                onClick={() => go(r)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
                  i === sel && "bg-accent",
                )}
              >
                <span className="flex size-5 shrink-0 items-center justify-center">
                  {r.icon ? (
                    <PageIcon icon={r.icon} />
                  ) : r.kind === "db" ? (
                    <Table2 className="size-4 opacity-70" />
                  ) : (
                    <FileText className="size-4 opacity-70" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {r.kind === "db" ? "Database" : "Page"}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
