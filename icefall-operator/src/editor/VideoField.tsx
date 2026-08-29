/**
 * The promotional film control, and the player the preview uses.
 *
 * THE PLAYER IS THE PART THAT MATTERS. `icefall-web/src/app/TripDetail.tsx`
 * embeds from **youtube-nocookie.com** and mounts the iframe **only after a
 * click**, with this reasoning in the source:
 *
 *   > Rendering the iframe up front would contact Google — and set its cookies —
 *   > for every reader who opens the page, including everyone who never watches.
 *
 * A preview that rendered the embed immediately would quietly regress that: the
 * operator would be looking at a page whose privacy behaviour is not the page
 * climbers get, and whoever copied the preview's markup later would ship the
 * regression. So the poster-then-click gate is reproduced here exactly, and the
 * iframe is mounted by the same condition.
 *
 * `youtubeId` is stored as an ID, never a URL, so nothing downstream can be
 * tempted to render a link directly.
 */

import { Play, Video } from "lucide-react";
import { useState } from "react";
import { MediaDrop, type StagedFile } from "./MediaDrop";
import type { PromoVideo } from "@/domain/types";

/**
 * Pull the id out of whatever an operator pastes.
 *
 * They will paste a full watch URL, a share link, an embed URL, or the bare id,
 * and all four are the same intent. Rejecting three of them to be strict about a
 * format would just teach them to fight the field.
 */
export function youtubeIdFrom(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if (/^[\w-]{11}$/.test(t)) return t;
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) return m[1];
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The player, as a climber gets it                                           */
/* -------------------------------------------------------------------------- */

export function PromoPlayer({
  video,
  staged,
  className = "",
}: {
  video: PromoVideo;
  staged: StagedFile | null;
  className?: string;
}) {
  const [asked, setAsked] = useState(false);

  if (video.source === "none" && !staged) return null;

  if (video.source === "upload" || staged) {
    return (
      <div className={`relative overflow-hidden rounded-card bg-canvas ${className}`}>
        {staged ? (
          <video src={staged.objectUrl} controls className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-[11.5px] text-faint">
            Uploaded film — not connected yet
          </div>
        )}
      </div>
    );
  }

  if (video.source !== "youtube") return null;
  const youtubeId = video.youtubeId;

  return (
    <div className={`relative overflow-hidden rounded-card bg-canvas ${className}`}>
      {asked ? (
        /*
         * Mounted ONLY after the click above. Same host, same params and same
         * referrer policy as the consumer app, so the preview's privacy
         * behaviour is the page's privacy behaviour.
         */
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`}
          title="Company film"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0 bg-canvas"
        />
      ) : (
        <button
          onClick={() => setAsked(true)}
          className="group absolute inset-0 grid place-items-center bg-elevated"
          aria-label="Play the company film"
        >
          <span className="grid h-11 w-11 place-items-center rounded-pill bg-azure text-canvas transition-transform group-hover:scale-105">
            <Play size={17} fill="currentColor" aria-hidden />
          </span>
          <span className="absolute right-2.5 bottom-2 text-[10px] text-faint">
            Nothing loads from YouTube until you press play
          </span>
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The control                                                                */
/* -------------------------------------------------------------------------- */

export function VideoField({
  video,
  onChange,
  staged,
  onStage,
  onClearStaged,
  disabled,
}: {
  video: PromoVideo;
  onChange: (v: PromoVideo) => void;
  staged: StagedFile | null;
  onStage: (f: StagedFile) => void;
  onClearStaged: () => void;
  disabled?: boolean;
}) {
  const [link, setLink] = useState(video.source === "youtube" ? video.youtubeId : "");
  const [linkError, setLinkError] = useState<string | null>(null);

  const pick = (source: PromoVideo["source"]) => {
    if (source === "none") {
      onClearStaged();
      onChange({ source: "none" });
      return;
    }
    if (source === "youtube") {
      const id = youtubeIdFrom(link);
      onChange(id ? { source: "youtube", youtubeId: id } : { source: "none" });
      return;
    }
    onChange(staged ? { source: "upload", mediaId: "staged" } : { source: "none" });
  };

  const current: PromoVideo["source"] = staged ? "upload" : video.source;

  return (
    <div>
      <div className="lbl mb-1.5">Promotional film</div>

      <div className="flex gap-1 rounded-tile bg-elevated p-1">
        {(
          [
            ["none", "None"],
            ["youtube", "YouTube link"],
            ["upload", "Upload a file"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => pick(key)}
            disabled={disabled}
            className={`flex-1 rounded-[7px] px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 ${
              current === key ? "bg-azure text-canvas" : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {current === "youtube" && (
        <div className="mt-2.5">
          <input
            className="w-full rounded-tile border border-line bg-elevated px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-azure"
            placeholder="Paste a YouTube link"
            value={link}
            disabled={disabled}
            onChange={(e) => {
              setLink(e.target.value);
              const id = youtubeIdFrom(e.target.value);
              setLinkError(e.target.value.trim() && !id ? "That does not look like a YouTube link." : null);
              if (id) onChange({ source: "youtube", youtubeId: id });
            }}
          />
          {linkError && <p className="mt-1 text-[10.5px] text-rejected">{linkError}</p>}
          <p className="mt-1.5 text-[10.5px] leading-snug text-faint">
            Embedded from youtube-nocookie.com, and only after a climber presses play — so nothing is requested
            from Google for the majority who never watch.
          </p>
        </div>
      )}

      {current === "upload" && (
        <div className="mt-2.5">
          <MediaDrop
            kind="video"
            label="Film"
            staged={staged}
            onStage={(f) => {
              onStage(f);
              onChange({ source: "upload", mediaId: "staged" });
            }}
            onClear={() => {
              onClearStaged();
              onChange({ source: "none" });
            }}
            disabled={disabled}
          />
        </div>
      )}

      {current === "none" && (
        <p className="mt-2 flex items-start gap-1.5 text-[10.5px] leading-snug text-faint">
          <Video size={12} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            No film on your profile. That is a choice Icefall records as such — your page simply does not show
            a video block.
          </span>
        </p>
      )}
    </div>
  );
}
