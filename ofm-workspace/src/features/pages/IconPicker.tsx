import { useState, type ReactNode } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { uploadIcon } from "@/features/editor/upload";
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
  const [tab, setTab] = useState<"emoji" | "brands" | "upload">("emoji");
  const [uploading, setUploading] = useState(false);

  const choose = (v: string) => {
    onPick(v);
    setOpen(false);
  };

  function pickImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setUploading(true);
      try {
        const url = await uploadIcon(f);
        choose(`img:${url}`);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-2">
        <div className="mb-2 flex gap-1 rounded-md bg-muted p-0.5 text-sm">
          {(["emoji", "brands", "upload"] as const).map((t) => (
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

        {tab === "emoji" && (
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
        )}

        {tab === "brands" && (
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

        {tab === "upload" && (
          <div className="flex flex-col items-center gap-2 py-5">
            <button
              type="button"
              onClick={pickImage}
              disabled={uploading}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              {uploading ? "Uploading…" : "Choose image"}
            </button>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, or SVG — a square image works best.
            </p>
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
