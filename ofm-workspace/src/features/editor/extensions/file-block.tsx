import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { Paperclip } from "lucide-react";

import { openExternal } from "@/lib/open-external";
import { signedAssetUrl } from "../upload";

function humanSize(n: number | null): string {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB"];
  let s = n;
  let i = 0;
  while (s >= 1024 && i < units.length - 1) {
    s /= 1024;
    i++;
  }
  return `${s.toFixed(i > 0 && s < 10 ? 1 : 0)} ${units[i]}`;
}

function FileView({ node }: NodeViewProps) {
  const path = node.attrs.path as string | null;
  const url = node.attrs.url as string | null;
  const name = (node.attrs.name as string | null) ?? "Attachment";
  const size = node.attrs.size as number | null;

  async function open(e: React.MouseEvent) {
    e.preventDefault();
    // Resolve a fresh signed URL from the stored path (short-lived, RLS-gated).
    const resolved = path ? await signedAssetUrl(path) : url;
    if (resolved) openExternal(resolved);
  }

  return (
    <NodeViewWrapper className="file-block" contentEditable={false}>
      <a href="#" onClick={open} className="file-card">
        <Paperclip className="size-4 shrink-0 opacity-70" />
        <span className="file-name">{name}</span>
        {size ? <span className="file-size">{humanSize(size)}</span> : null}
      </a>
    </NodeViewWrapper>
  );
}

export const FileBlock = Node.create({
  name: "fileBlock",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      path: { default: null },
      url: { default: null },
      name: { default: null },
      size: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="file"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "file" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileView);
  },
});
