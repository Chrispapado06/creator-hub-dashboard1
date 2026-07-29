import { useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { Link2 } from "lucide-react";

/** A Notion-style bookmark / link-preview card (a saved URL rendered as a card). */
function BookmarkView({ node, updateAttributes, editor }: NodeViewProps) {
  const url = (node.attrs.url as string | null) ?? null;
  const title = (node.attrs.title as string | null) ?? null;
  const description = (node.attrs.description as string | null) ?? null;
  const [draft, setDraft] = useState("");

  if (url) {
    let host = url;
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      /* keep raw */
    }
    return (
      <NodeViewWrapper className="bookmark-block" contentEditable={false}>
        <a className="bookmark-card" href={url} target="_blank" rel="noreferrer noopener">
          <span className="bookmark-text">
            <span className="bookmark-title">{title || host}</span>
            {description && <span className="bookmark-desc">{description}</span>}
            <span className="bookmark-url">{url}</span>
          </span>
          <Link2 className="bookmark-icon size-4" />
        </a>
      </NodeViewWrapper>
    );
  }

  if (!editor.isEditable) {
    return (
      <NodeViewWrapper className="bookmark-block" contentEditable={false}>
        <div className="bookmark-card">Empty bookmark</div>
      </NodeViewWrapper>
    );
  }

  const commit = () => {
    const v = draft.trim();
    if (v) updateAttributes({ url: v });
  };

  return (
    <NodeViewWrapper className="bookmark-block" contentEditable={false}>
      <div className="bookmark-empty">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Paste a link to bookmark"
        />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); commit(); }}>
          Save
        </button>
      </div>
    </NodeViewWrapper>
  );
}

export const Bookmark = Node.create({
  name: "bookmark",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-url"),
        renderHTML: (attrs) => (attrs.url ? { "data-url": attrs.url } : {}),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-title"),
        renderHTML: (attrs) => (attrs.title ? { "data-title": attrs.title } : {}),
      },
      description: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-description"),
        renderHTML: (attrs) =>
          attrs.description ? { "data-description": attrs.description } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="bookmark"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "bookmark" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BookmarkView);
  },
});
