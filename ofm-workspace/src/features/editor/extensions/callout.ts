import { Node, mergeAttributes } from "@tiptap/core";

/** A Notion-style callout: an emoji + a coloured box of block content. */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      emoji: {
        default: "💡",
        parseHTML: (el) => el.getAttribute("data-emoji") || "💡",
        renderHTML: (attrs) => ({ "data-emoji": attrs.emoji }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "callout", class: "callout" }),
      ["div", { class: "callout-body" }, 0],
    ];
  },
});
