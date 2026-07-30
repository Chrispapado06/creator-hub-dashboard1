import { useCallback, useEffect, useState } from "react";

/** Remembers the active view per database (client-only, localStorage). */
export function useActiveView(
  databaseId: string,
  viewIds: string[],
): [string | null, (id: string) => void] {
  const storeKey = `ofm-db-view-${databaseId}`;
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storeKey);
    if (saved && viewIds.includes(saved)) setActive(saved);
    else setActive(viewIds[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [databaseId, viewIds.join(",")]);

  const set = useCallback(
    (id: string) => {
      setActive(id);
      localStorage.setItem(storeKey, id);
    },
    [storeKey],
  );

  return [active, set];
}
