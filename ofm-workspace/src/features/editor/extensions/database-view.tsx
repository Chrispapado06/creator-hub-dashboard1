import { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, Table2 } from "lucide-react";

import { PageIcon } from "@/features/pages/PageIcon";
import { DatabaseViews } from "@/features/databases/DatabaseViews";
import { useDatabase, useUpdateDatabase } from "@/features/databases/use-databases";

/** A Notion-style database embedded inside a page. Stores just the databaseId
 *  and renders the live database (shared with the standalone /db/:id view). */
function DatabaseViewNode({ node }: NodeViewProps) {
  const databaseId = (node.attrs.databaseId as string | null) ?? null;
  const { data: db } = useDatabase(databaseId ?? undefined);
  const update = useUpdateDatabase();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setTitle(db?.title ?? ""), [db?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function onTitle(v: string) {
    setTitle(v);
    if (!databaseId) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => update.mutate({ id: databaseId, patch: { title: v } }),
      500,
    );
  }

  if (!databaseId) {
    return (
      <NodeViewWrapper className="inline-db" contentEditable={false}>
        <div className="inline-db-empty">Database unavailable</div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="inline-db" contentEditable={false}>
      <div className="inline-db-head">
        <span className="inline-db-icon">
          {db?.icon ? <PageIcon icon={db.icon} /> : <Table2 className="size-4 opacity-70" />}
        </span>
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Untitled database"
          className="inline-db-title"
        />
        <button
          type="button"
          className="inline-db-open"
          title="Open as full page"
          onClick={() => navigate(`/db/${databaseId}`)}
        >
          <ArrowUpRight className="size-4" />
        </button>
      </div>
      <DatabaseViews databaseId={databaseId} />
    </NodeViewWrapper>
  );
}

export const DatabaseView = Node.create({
  name: "databaseView",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      databaseId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-database-id"),
        renderHTML: (attrs) =>
          attrs.databaseId ? { "data-database-id": attrs.databaseId } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="database-view"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "database-view" }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DatabaseViewNode);
  },
});
