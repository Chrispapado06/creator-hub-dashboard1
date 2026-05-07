import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, X, Link as LinkIcon, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const BUCKET = "agency-logos";
const MAX_BYTES = 5 * 1024 * 1024;

type Props = {
  value: string | null;
  onChange: (url: string | null) => void;
};

function buildPath(ext: string) {
  return `logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

export function AgencyLogoUpload({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Logo must be 5 MB or smaller");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = buildPath(ext);
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      const msg = error.message;
      if (msg.toLowerCase().includes("bucket not found") || msg.toLowerCase().includes("not found")) {
        toast.error("Storage bucket missing — run the agency logo migration in Supabase first");
      } else {
        toast.error(msg);
      }
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
    toast.success("Logo uploaded");
  };

  const onPickFile = () => inputRef.current?.click();

  const onSaveUrl = () => {
    const u = urlInput.trim();
    if (!u) return;
    onChange(u);
    setUrlInput("");
    setShowUrlInput(false);
  };

  return (
    <div className="space-y-3">
      <div
        className={`flex items-center gap-4 rounded-xl border-2 border-dashed p-4 transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-card/50 hover:bg-card"
        }`}
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
        {/* Preview */}
        <div className="h-20 w-20 shrink-0 rounded-xl border border-border bg-background flex items-center justify-center overflow-hidden">
          {value ? (
            <img
              src={value}
              alt="Agency logo"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
          )}
        </div>

        {/* Actions */}
        <div className="flex-1 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void uploadFile(f);
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onPickFile} disabled={uploading}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {uploading ? "Uploading…" : value ? "Replace" : "Upload logo"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowUrlInput((v) => !v)}
              disabled={uploading}
            >
              <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
              Paste URL
            </Button>
            {value && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange(null)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Remove
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Drop an image here or click upload · JPG, PNG, WebP, GIF, SVG · max 5 MB
          </p>
        </div>
      </div>

      {showUrlInput && (
        <div className="flex gap-2">
          <Input
            placeholder="https://example.com/logo.png"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSaveUrl();
              }
            }}
            autoFocus
          />
          <Button size="sm" onClick={onSaveUrl} disabled={!urlInput.trim()}>
            Use URL
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowUrlInput(false); setUrlInput(""); }}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
