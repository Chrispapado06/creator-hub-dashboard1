import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Notion-style multi-column layout: a `columnList` holds two-or-more `column`
 * nodes laid out side by side (flex). Content-only nodes (no custom attrs) —
 * the CSS in index.css does the layout. Insert via the "Columns" slash command
 * or the Notion importer (column_list -> columnList, column -> column).
 */
export const Column = Node.create({
  name: "column",
  group: "column",
  content: "block+",
  isolating: true,
  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "column", class: "column" }),
      0,
    ];
  },
});

export const ColumnList = Node.create({
  name: "columnList",
  group: "block",
  // one-or-more for resilience on import (Notion always has >=2, but never drop
  // a malformed single-column list silently).
  content: "column+",
  parseHTML() {
    return [{ tag: 'div[data-type="column-list"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "column-list",
        class: "column-list",
      }),
      0,
    ];
  },
});
