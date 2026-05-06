import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BUCKET = "creator-avatars";
const MAX_BYTES = 5 * 1024 * 1024;

type CreatorAvatarUploadProps = {
  value: string | null;
  onChange: (url: string | null) => void;
  /** Shown when there is no image */
  name: string;
  /** Storage path prefix; omit for one-off uploads (e.g. before a row exists) */
  creatorId?: string;
  className?: string;
};

function buildObjectPath(creatorId: string | undefined, ext: string) {
  const folder = creatorId?.replace(/[^a-zA-Z0-9-_]/g, "") || "draft";
  return `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

export function CreatorAvatarUpload({
  value,
  onChange,
  name,
  creatorId,
  className,
}: CreatorAvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be 5 MB or smaller");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = buildObjectPath(creatorId, ext);
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      toast.error(error.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
  };

  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start", className)}>
      <div
        className={cn(
          "relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-muted",
          dragging && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) void uploadFile(f);
        }}
      >
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-lg font-semibold text-muted-foreground">{initial}</span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void uploadFile(f);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Remove
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">JPG, PNG, WebP, or GIF · max 5 MB</p>
      </div>
    </div>
  );
}
