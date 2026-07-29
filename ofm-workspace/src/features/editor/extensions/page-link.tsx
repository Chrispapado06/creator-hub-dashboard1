import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { PageIcon } from "@/features/pages/PageIcon";
import { PageMenu } from "@/features/pages/PageMenu";
import { usePages } from "@/features/pages/use-pages";

/** A Notion-style inline link to a sub-page. Shows the sub-page's live title. */
function PageLinkView({ node, editor, deleteNode }: NodeViewProps) {
  const navigate = useNavigate();
  const pageId = node.attrs.pageId as string | null;
  const { data: pages = [] } = usePages();
  const page = pages.find((p) => p.id === pageId);
  const title = page?.title || (node.attrs.title as string) || "Untitled";
  const icon = page?.icon ?? (node.attrs.icon as string | null);

  return (
    <NodeViewWrapper className="page-link group" contentEditable={false}>
      <div className="flex items-center gap-0.5">
        <div className="min-w-0 flex-1">
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
        </div>
        {editor.isEditable && pageId && (
          <PageMenu
            page={{
              id: pageId,
              title,
              icon,
              parentId: page?.parentId ?? null,
            }}
            onDeleted={() => deleteNode()}
            triggerClassName="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
          />
        )}
      </div>
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
