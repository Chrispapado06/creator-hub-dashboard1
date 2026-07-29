import { arrayMove } from "@dnd-kit/sortable";
import type { TreeNode } from "./tree";

export const INDENT_WIDTH = 12;

export interface FlatItem {
  id: string;
  parentId: string | null;
  depth: number;
  title: string;
  icon: string | null;
  position: number;
  hasChildren: boolean;
  collapsed: boolean;
}

/** Flatten the tree into an ordered list with depth, skipping collapsed subtrees. */
export function flattenTree(
  nodes: TreeNode[],
  expanded: Set<string>,
  depth = 0,
  parentId: string | null = null,
): FlatItem[] {
  const out: FlatItem[] = [];
  for (const n of nodes) {
    const hasChildren = n.children.length > 0;
    const collapsed = hasChildren && !expanded.has(n.id);
    out.push({
      id: n.id,
      parentId,
      depth,
      title: n.title,
      icon: n.icon,
      position: n.position,
      hasChildren,
      collapsed,
    });
    if (hasChildren && !collapsed) {
      out.push(...flattenTree(n.children, expanded, depth + 1, n.id));
    }
  }
  return out;
}

/** Drop the descendants of the given ids (so you can't drop a node into itself). */
export function removeChildrenOf(items: FlatItem[], ids: string[]): FlatItem[] {
  const exclude = new Set(ids);
  return items.filter((item) => {
    if (item.parentId && exclude.has(item.parentId)) {
      exclude.add(item.id);
      return false;
    }
    return true;
  });
}

export interface Projection {
  depth: number;
  parentId: string | null;
}

/** Compute the target depth + parent for a drag, from the horizontal offset. */
export function getProjection(
  items: FlatItem[],
  activeId: string,
  overId: string,
  dragOffset: number,
  indentWidth: number,
): Projection {
  const overIndex = items.findIndex((i) => i.id === overId);
  const activeIndex = items.findIndex((i) => i.id === activeId);
  if (overIndex === -1 || activeIndex === -1) return { depth: 0, parentId: null };

  const newItems = arrayMove(items, activeIndex, overIndex);
  const prevItem = newItems[overIndex - 1];
  const nextItem = newItems[overIndex + 1];
  const activeItem = items[activeIndex];

  const projectedDepth = activeItem.depth + Math.round(dragOffset / indentWidth);
  const maxDepth = prevItem ? prevItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;

  let depth = projectedDepth;
  if (depth > maxDepth) depth = maxDepth;
  else if (depth < minDepth) depth = minDepth;

  let parentId: string | null = null;
  if (depth !== 0 && prevItem) {
    if (depth === prevItem.depth) parentId = prevItem.parentId;
    else if (depth > prevItem.depth) parentId = prevItem.id;
    else {
      parentId =
        newItems
          .slice(0, overIndex)
          .reverse()
          .find((i) => i.depth === depth)?.parentId ?? null;
    }
  }
  return { depth, parentId };
}

/** New fractional position for `activeId` under `parentId`, given the reordered list. */
export function computePosition(
  items: FlatItem[],
  activeId: string,
  overId: string,
  parentId: string | null,
): number {
  const activeIndex = items.findIndex((i) => i.id === activeId);
  const overIndex = items.findIndex((i) => i.id === overId);
  if (activeIndex === -1 || overIndex === -1) return 0;

  const newOrder = arrayMove(items, activeIndex, overIndex);
  const siblings = newOrder.filter(
    (i) => i.id === activeId || i.parentId === parentId,
  );
  const idx = siblings.findIndex((i) => i.id === activeId);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];

  if (prev && next) return (prev.position + next.position) / 2;
  if (prev) return prev.position + 1;
  if (next) return next.position - 1;
  return 0;
}
