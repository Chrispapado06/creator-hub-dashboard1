import { useEffect, useRef } from "react";

import { BoardView } from "./BoardView";
import { CalendarView } from "./CalendarView";
import { GalleryView } from "./GalleryView";
import { ListView } from "./ListView";
import { TableView } from "./TableView";
import { ViewBar } from "./ViewBar";
import { PeekProvider } from "./peek-context";
import { RecordPeek } from "./RecordPeek";
import { useActiveView } from "./use-active-view";
import { useCreateView, useViews, type DbView } from "./use-db-views";

function renderView(databaseId: string, view: DbView) {
  switch (view.type) {
    case "board":
      return <BoardView databaseId={databaseId} view={view} />;
    case "calendar":
      return <CalendarView databaseId={databaseId} view={view} />;
    case "gallery":
      return <GalleryView databaseId={databaseId} view={view} />;
    case "list":
      return <ListView databaseId={databaseId} view={view} />;
    default:
      return <TableView databaseId={databaseId} view={view} />;
  }
}

export function DatabaseViews({ databaseId }: { databaseId: string }) {
  const { data: views = [], isLoading } = useViews(databaseId);
  const createView = useCreateView(databaseId);
  const [activeId, setActiveId] = useActiveView(
    databaseId,
    views.map((v) => v.id),
  );
  const seeded = useRef(false);

  // Legacy databases with no view row get a default Table view.
  useEffect(() => {
    if (!isLoading && views.length === 0 && !seeded.current) {
      seeded.current = true;
      createView.mutate({ name: "Table", type: "table", position: 0 });
    }
  }, [isLoading, views.length, createView]);

  const active = views.find((v) => v.id === activeId) ?? views[0];

  return (
    <PeekProvider>
      <ViewBar
        databaseId={databaseId}
        views={views}
        activeId={active?.id ?? null}
        onSelect={setActiveId}
      />
      <div className="mt-3">
        {active ? (
          renderView(databaseId, active)
        ) : (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        )}
      </div>
      <RecordPeek databaseId={databaseId} />
    </PeekProvider>
  );
}
