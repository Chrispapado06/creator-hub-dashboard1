import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { ChevronRight } from "lucide-react";

/**
 * A collapsible toggle. Holds `block+`; the first child is the always-visible
 * title, the rest collapse under the caret (CSS-driven off `data-open`).
 */
function ToggleView({ node, updateAttributes }: NodeViewProps) {
  const open = Boolean(node.attrs.open);
  return (
    <NodeViewWrapper className="toggle" data-open={open ? "true" : "false"}>
      <button
        type="button"
        contentEditable={false}
        className="toggle-caret"
        onClick={() => updateAttributes({ open: !open })}
        aria-label={open ? "Collapse" : "Expand"}
      >
        <ChevronRight className="size-4" />
      </button>
      <NodeViewContent className="toggle-content" />
    </NodeViewWrapper>
  );
}

export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-open") !== "false",
        renderHTML: (attrs) => ({ "data-open": attrs.open ? "true" : "false" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toggle" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },
});
