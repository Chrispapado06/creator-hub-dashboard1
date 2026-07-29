import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { PageIcon } from "@/features/pages/PageIcon";
import { usePages } from "@/features/pages/use-pages";

/** A Notion-style inline link to a sub-page. Shows the sub-page's live title. */
function PageLinkView({ node }: NodeViewProps) {
  const navigate = useNavigate();
  const pageId = node.attrs.pageId as string | null;
  const { data: pages = [] } = usePages();
  const page = pages.find((p) => p.id === pageId);
  const title = page?.title || (node.attrs.title as string) || "Untitled";
  const icon = page?.icon ?? (node.attrs.icon as string | null);

  return (
    <NodeViewWrapper className="page-link" contentEditable={false}>
      <button
        type="button"
        className="page-link-btn"
        onClick={() => pageId && navigate(`/page/${pageId}`)}
      >
        <span className="page-link-icon">
          <PageIcon icon={icon} />
        </span>
        <span className="page-link-title">{title}</span>
        <ChevronRight className="page-link-chevron size-4" />
      </button>
    </NodeViewWrapper>
  );
}

export const PageLink = Node.create({
  name: "pageLink",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      pageId: { default: null },
      title: { default: null },
      icon: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="page-link"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "page-link" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageLinkView);
  },
});
