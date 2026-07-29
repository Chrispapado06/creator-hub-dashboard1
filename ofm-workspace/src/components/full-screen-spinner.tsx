import { Loader2 } from "lucide-react";

export function FullScreenSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      {label ? <p className="text-sm">{label}</p> : null}
    </div>
  );
}
