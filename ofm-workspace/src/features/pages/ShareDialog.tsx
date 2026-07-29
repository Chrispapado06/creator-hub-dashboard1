import { Copy, ExternalLink, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { openExternal } from "@/lib/open-external";
import { useSetPublished } from "./use-pages";

export function ShareDialog({
  pageId,
  published,
  publicToken,
}: {
  pageId: string;
  published: boolean;
  publicToken: string | null;
}) {
  const setPublished = useSetPublished();
  // Prefer the styled Vercel viewer when configured; else the Supabase text view.
  const viewerBase = import.meta.env.VITE_PUBLIC_VIEWER_URL?.replace(/\/$/, "");
  const url = publicToken
    ? viewerBase
      ? `${viewerBase}/${publicToken}`
      : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-page/${publicToken}`
    : "";

  async function setPublish(next: boolean) {
    try {
      await setPublished.mutateAsync({
        id: pageId,
        publish: next,
        currentToken: publicToken,
      });
      toast.success(next ? "Published to the web" : "Unpublished");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Globe className="size-4" />
          Share
          {published && (
            <span className="ml-0.5 size-2 rounded-full bg-emerald-500" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share to web</DialogTitle>
          <DialogDescription>
            {published
              ? "Anyone with this link can view this page, read-only."
              : "Publish this page to get a public, read-only link — like Notion."}
          </DialogDescription>
        </DialogHeader>

        {published ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copy}
                title="Copy link"
              >
                <Copy className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => openExternal(url)}
                title="Open in browser"
              >
                <ExternalLink className="size-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setPublish(false)}
              disabled={setPublished.isPending}
            >
              {setPublished.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Unpublish
            </Button>
          </div>
        ) : (
          <Button
            className={cn("w-full")}
            onClick={() => setPublish(true)}
            disabled={setPublished.isPending}
          >
            {setPublished.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Globe className="size-4" />
            )}
            Publish to web
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
