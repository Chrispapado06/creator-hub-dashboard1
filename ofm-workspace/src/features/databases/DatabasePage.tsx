import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { FullScreenSpinner } from "@/components/full-screen-spinner";
import { IconPicker } from "@/features/pages/IconPicker";
import { PageIcon } from "@/features/pages/PageIcon";
import { DatabaseViews } from "./DatabaseViews";
import { useDatabase, useUpdateDatabase } from "./use-databases";

export default function DatabasePage() {
  const { databaseId } = useParams();
  const { data: db, isLoading, isError } = useDatabase(databaseId);
  const update = useUpdateDatabase();

  const [title, setTitle] = useState("");
  useEffect(() => setTitle(db?.title ?? ""), [db?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const titleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function onTitle(v: string) {
    setTitle(v);
    if (!databaseId) return;
    clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(
      () => update.mutate({ id: databaseId, patch: { title: v } }),
      500,
    );
  }

  if (isLoading) return <FullScreenSpinner />;
  if (isError || !db)
    return (
      <div className="p-10 text-muted-foreground">
        This database doesn't exist or you don't have access.
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-5 flex items-center gap-2">
        <IconPicker
          value={db.icon}
          onPick={(e) => update.mutate({ id: databaseId!, patch: { icon: e } })}
          onRemove={() => update.mutate({ id: databaseId!, patch: { icon: null } })}
        >
          <button className="flex size-9 items-center justify-center rounded hover:bg-accent">
            <PageIcon
              icon={db.icon}
              className="size-7"
              emojiClassName="text-3xl leading-none"
            />
          </button>
        </IconPicker>
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Untitled database"
          className="flex-1 bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
        />
      </div>

      <DatabaseViews databaseId={databaseId!} />
    </div>
  );
}
