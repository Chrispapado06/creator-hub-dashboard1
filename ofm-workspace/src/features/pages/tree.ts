import type { PageNode } from "./use-pages";

export interface TreeNode extends PageNode {
  children: TreeNode[];
}

/** Build a nested, position-sorted tree from a flat list of pages. */
export function buildTree(pages: PageNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const p of pages) byId.set(p.id, { ...p, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (!node.parentId) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(node.parentId);
    // Orphans (parent missing from the active set, e.g. archived) are hidden
    // rather than promoted to root, so an archived subtree can't resurface.
    if (parent) parent.children.push(node);
  }

  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/** Ids of all ancestors of `pageId` (for auto-expanding the path to it). */
export function ancestorsOf(pages: PageNode[], pageId: string): string[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const out: string[] = [];
  let cur = byId.get(pageId)?.parentId ?? null;
  while (cur) {
    out.push(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return out;
}
