/**
 * A banner image control that refuses bad files AT THE DROP.
 *
 * The rule this exists to enforce: a drop that accepts a file the reviewer must
 * later reject is worse than one that refuses it immediately and says why. The
 * operator has already done the work by then, and the refusal arrives days later
 * attached to a queue position rather than to the thing they just did.
 *
 * So the validation here is the SAME validation the database performs, not a
 * looser client-side approximation — `validateFile` mirrors the shipped CHECK
 * constraints exactly. SVG is refused (a script vector, not a logo format), the
 * per-kind ceilings apply, and a listing photograph under 1200×800 is caught
 * before it can be submitted.
 *
 * WHAT IS HONEST ABOUT THE PREVIEW: the image shown in the centre pane comes
 * from the operator's own machine via an object URL. ICEFALL's media store is
 * not connected yet, so the panel says the file is not saved rather than
 * implying an upload happened. Dimensions are read from the decoded image, which
 * is the only way to check them without a server.
 */

import { ImageUp, TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MEDIA_RULES, acceptAttribute, validateFile, type MediaProblem } from "@/domain/media";
import type { MediaKind } from "@/domain/types";

export interface StagedFile {
  name: string;
  mimeType: string;
  byteSize: number;
  widthPx: number | null;
  heightPx: number | null;
  /** Object URL, for the preview only. Revoked when it is replaced. */
  objectUrl: string;
}

const mb = (b: number) => `${(b / (1024 * 1024)).toFixed(b < 1024 * 1024 ? 2 : 1)} MB`;

/** Decode enough of the image to know its dimensions. Never throws. */
function measure(file: File): Promise<{ width: number | null; height: number | null; url: string }> {
  const url = URL.createObjectURL(file);
  if (!file.type.startsWith("image/")) return Promise.resolve({ width: null, height: null, url });
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, url });
    // A file we cannot decode has UNKNOWN dimensions, not zero ones — the
    // validator treats unmeasured as "no verdict" rather than as a failure.
    img.onerror = () => resolve({ width: null, height: null, url });
    img.src = url;
  });
}

export function MediaDrop({
  kind = "image",
  label,
  hint,
  staged,
  onStage,
  onClear,
  disabled,
}: {
  kind?: MediaKind;
  label: string;
  hint?: string;
  staged: StagedFile | null;
  onStage: (f: StagedFile) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [problems, setProblems] = useState<MediaProblem[]>([]);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );

  const take = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      const { width, height, url } = await measure(file);
      const candidate = {
        name: file.name,
        mimeType: file.type,
        byteSize: file.size,
        widthPx: width,
        heightPx: height,
      };
      const found = validateFile(kind, candidate);
      setProblems(found);
      if (found.length > 0) {
        // Refused. Nothing is staged and nothing reaches the preview, so the
        // operator never sees a page built from a file that cannot be published.
        URL.revokeObjectURL(url);
        return;
      }
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      lastUrl.current = url;
      onStage({ ...candidate, objectUrl: url });
    },
    [kind, onStage],
  );

  const rules = MEDIA_RULES[kind];
  const accepted = rules.mimeTypes.map((m) => m.split("/")[1].toUpperCase()).join(", ");

  return (
    <div>
      <div className="lbl mb-1.5">{label}</div>

      {staged ? (
        <div className="hairline overflow-hidden rounded-tile">
          <img src={staged.objectUrl} alt="" className="h-24 w-full object-cover" />
          <div className="flex items-center gap-2 px-2.5 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] text-ink">{staged.name}</span>
              <span className="tnum block text-[10.5px] text-faint">
                {staged.widthPx && staged.heightPx ? `${staged.widthPx}×${staged.heightPx} · ` : ""}
                {mb(staged.byteSize)}
              </span>
            </span>
            <button
              onClick={() => {
                if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
                lastUrl.current = null;
                setProblems([]);
                onClear();
              }}
              disabled={disabled}
              className="shrink-0 text-faint hover:text-ink disabled:opacity-40"
              aria-label="Remove image"
            >
              <X size={13} aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void take(e.dataTransfer.files?.[0]);
          }}
          className={`flex w-full flex-col items-center gap-1.5 rounded-tile border border-dashed px-3 py-5 transition-colors disabled:opacity-40 ${
            over ? "border-azure bg-azure-soft" : "border-line hover:border-line-soft hover:bg-raised"
          }`}
        >
          <ImageUp size={17} className="text-faint" aria-hidden />
          <span className="text-[11.5px] text-muted">Drop an image, or choose one</span>
          <span className="text-[10.5px] text-faint">
            {accepted} · up to {mb(rules.maxBytes)}
            {rules.minWidthPx ? ` · ${rules.minWidthPx}×${rules.minHeightPx} minimum` : ""}
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={acceptAttribute(kind)}
        className="hidden"
        onChange={(e) => void take(e.target.files?.[0])}
      />

      {/* Refused, at the drop, with the reason and what to do about it. */}
      {problems.length > 0 && (
        <div className="mt-2 rounded-tile bg-rejected-soft px-2.5 py-2">
          {problems.map((p) => (
            <div key={p.field} className="flex items-start gap-1.5 text-[11px] leading-snug text-rejected">
              <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden />
              <span>{p.message}</span>
            </div>
          ))}
        </div>
      )}

      {hint && <p className="mt-1.5 text-[10.5px] leading-snug text-faint">{hint}</p>}

      {staged && (
        <p className="mt-1.5 text-[10.5px] leading-snug text-faint">
          Shown from your own machine. Icefall's media store is not connected yet, so this image is not saved
          and will not survive a reload.
        </p>
      )}
    </div>
  );
}
