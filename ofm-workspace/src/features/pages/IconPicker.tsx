import { useState, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { BRAND_ICONS, brandValue } from "./icons";

const EMOJIS = [
  "📄","📝","📁","📌","⭐","🔥","💡","✅","📅","📊","📈","💰",
  "🎯","🚀","👥","💬","🔔","🎬","📸","🎥","💎","👑","🌟","❤️",
  "🧾","🗂️","🏷️","🔑","⚙️","📋","🗓️","🧠","🤝","📣","🛠️","🧩",
  "🗒️","📎","🔒","🌐","🎨","🧭","🏁","✨","🧵","🗃️","🕒","📦",
];

export function IconPicker({
  value,
  onPick,
  onRemove,
  children,
}: {
  value?: string | null;
  onPick: (icon: string) => void;
  onRemove?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"emoji" | "brands">("emoji");

  const choose = (v: string) => {
    onPick(v);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-2">
        <div className="mb-2 flex gap-1 rounded-md bg-muted p-0.5 text-sm">
          {(["emoji", "brands"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded px-2 py-1 capitalize transition-colors",
                tab === t
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "emoji" ? (
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="flex size-8 items-center justify-center rounded text-lg hover:bg-accent"
                onClick={() => choose(e)}
              >
                {e}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto">
            {BRAND_ICONS.map((b) => (
              <button
                key={b.slug}
                type="button"
                title={b.title}
                aria-label={b.title}
                className="flex size-8 items-center justify-center rounded hover:bg-accent"
                onClick={() => choose(brandValue(b.slug))}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
                  <path d={b.path} />
                </svg>
              </button>
            ))}
          </div>
        )}

        {value && onRemove ? (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              className="w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                onRemove();
                setOpen(false);
              }}
            >
              Remove icon
            </button>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
