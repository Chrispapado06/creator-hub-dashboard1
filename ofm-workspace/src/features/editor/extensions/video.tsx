import { useEffect, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { toast } from "sonner";

import { signedAssetUrl, uploadAsset } from "../upload";

/** Turn a pasted URL into an embeddable iframe URL, or flag it as a direct file. */
function embedInfo(raw: string): { kind: "iframe" | "file"; url: string } | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v");
    if (id) return { kind: "iframe", url: `https://www.youtube.com/embed/${id}` };
    const m = u.pathname.match(/\/(embed|shorts)\/([\w-]+)/);
    if (m) return { kind: "iframe", url: `https://www.youtube.com/embed/${m[2]}` };
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    if (id) return { kind: "iframe", url: `https://www.youtube.com/embed/${id}` };
  }
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    if (id && /^\d+$/.test(id))
      return { kind: "iframe", url: `https://player.vimeo.com/video/${id}` };
  }
  if (host === "loom.com") {
    const m = u.pathname.match(/\/(share|embed)\/([\w-]+)/);
    if (m) return { kind: "iframe", url: `https://www.loom.com/embed/${m[2]}` };
  }
  if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(u.pathname))
    return { kind: "file", url: raw };
  // Unknown provider: still try an iframe embed.
  return { kind: "iframe", url: raw };
}

function VideoView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const path = (node.attrs.path as string | null) ?? null;
  const src = (node.attrs.src as string | null) ?? null;
  const [resolved, setResolved] = useState<string | null>(path ? null : src);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!path) {
      setResolved(src);
      return;
    }
    let active = true;
    const go = () => signedAssetUrl(path).then((u) => active && setResolved(u));
    go();
    const timer = setInterval(go, 50 * 60 * 1000); // refresh before 1h TTL
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, src]);

  // Uploaded video (stored in our bucket) always renders as a <video>.
  if (path) {
    return (
      <NodeViewWrapper className="video-block" contentEditable={false}>
        {resolved ? (
          <video src={resolved} controls />
        ) : (
          <div className="image-loading">Loading video…</div>
        )}
      </NodeViewWrapper>
    );
  }

  const info = src ? embedInfo(src) : null;
  if (src && info) {
    return (
      <NodeViewWrapper className="video-block" contentEditable={false}>
        {info.kind === "iframe" ? (
          <div className="video-embed">
            <iframe
              src={info.url}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              title="Embedded video"
            />
          </div>
        ) : (
          <video src={info.url} controls />
        )}
      </NodeViewWrapper>
    );
  }

  // Empty state.
  if (!editor.isEditable) {
    return (
      <NodeViewWrapper className="video-block" contentEditable={false}>
        <div className="video-empty">No video</div>
      </NodeViewWrapper>
    );
  }

  const commit = () => {
    const v = draft.trim();
    if (v) updateAttributes({ src: v });
  };
  const upload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const id = toast.loading(`Uploading ${f.name}…`);
      try {
        const { path: p } = await uploadAsset(f);
        updateAttributes({ path: p });
        toast.success("Video added", { id });
      } catch (e) {
        toast.error((e as Error).message, { id });
      }
    };
    input.click();
  };

  return (
    <NodeViewWrapper className="video-block" contentEditable={false}>
      <div className="video-empty">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Paste a YouTube, Loom, Vimeo, or video URL"
        />
        <div className="video-empty-actions">
          <button type="button" onMouseDown={(e) => { e.preventDefault(); commit(); }}>
            Embed
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); upload(); }}>
            Upload
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); deleteNode(); }}>
            Remove
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-src"),
        renderHTML: (attrs) => (attrs.src ? { "data-src": attrs.src } : {}),
      },
      path: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-path"),
        renderHTML: (attrs) => (attrs.path ? { "data-path": attrs.path } : {}),
      },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="video"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "video" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(VideoView);
  },
});
