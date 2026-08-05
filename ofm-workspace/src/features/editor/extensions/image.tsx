import { useEffect, useState } from "react";
import Image from "@tiptap/extension-image";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

import { signedAssetUrl } from "../upload";
import { ResizableFrame } from "./resizable-frame";

/**
 * Image node that stores the storage `path` and resolves a short-lived signed
 * URL on render (refreshing before it expires), instead of persisting a
 * long-lived URL in the document. Falls back to a plain `src` for external URLs.
 * Draggable width (persisted in the `width` attr).
 */
function ImageView({ node, updateAttributes, editor }: NodeViewProps) {
  const path = (node.attrs.path as string | null) ?? null;
  const src = (node.attrs.src as string | null) ?? null;
  const alt = (node.attrs.alt as string | null) ?? "";
  const width = (node.attrs.width as number | null) ?? null;
  const [url, setUrl] = useState<string | null>(path ? null : src);

  useEffect(() => {
    if (!path) {
      setUrl(src);
      return;
    }
    let active = true;
    const resolve = () =>
      signedAssetUrl(path).then((u) => {
        if (active) setUrl(u);
      });
    resolve();
    const timer = setInterval(resolve, 50 * 60 * 1000); // refresh before 1h TTL
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, src]);

  return (
    <NodeViewWrapper className="image-block">
      <ResizableFrame
        width={width}
        editable={editor.isEditable}
        onResize={(w) => updateAttributes({ width: w })}
      >
        {url ? (
          <img src={url} alt={alt} />
        ) : (
          <div className="image-loading">Loading image…</div>
        )}
      </ResizableFrame>
    </NodeViewWrapper>
  );
}

export const PageImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      path: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-path"),
        renderHTML: (attrs) => (attrs.path ? { "data-path": attrs.path } : {}),
      },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute("data-width");
          return w ? Number(w) : null;
        },
        renderHTML: (attrs) => (attrs.width ? { "data-width": attrs.width } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
