import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { SegmentedTabs } from "@/components/layout/chrome";
import { Loader2 } from "lucide-react";

const Community = lazy(() => import("./Community"));
const Leaderboard = lazy(() => import("./Leaderboard"));
const People = lazy(() => import("./People"));
const Groups = lazy(() => import("./Groups"));

/**
 * SOCIAL — people and groups, under one tab.
 *
 * They were two tabs of six across the top of Explore, which pushed the tab
 * strip past the edge of the screen and buried Guides and Expeditions off-frame.
 * They are also the same question asked twice: who else is out there, and who
 * are you going with.
 *
 * The sub-tab lives in the query string rather than in state, so a link to
 * `?tab=groups` opens on groups and the back button steps between them. Both
 * old paths still resolve — see `App.tsx` — so nothing anyone has bookmarked or
 * linked to breaks.
 */

type Sub = "community" | "leaderboard" | "people" | "groups";

/**
 * Four sections, one question each — and never two answering the same one:
 *   FEED         what are mountaineers doing
 *   LEADERBOARD  how am I progressing against the community
 *   PEOPLE       who else is doing my mountain
 *   GROUPS       who am I going with
 *
 * FEED and LEADERBOARD are the two primary views; People and Groups keep their
 * places rather than becoming a second navigation layer. The `community` value
 * is unchanged so every existing link and bookmark still resolves.
 */
const SUBS = [
  { value: "community", label: "Feed" },
  { value: "leaderboard", label: "Leaderboard" },
  { value: "people", label: "People" },
  { value: "groups", label: "Groups" },
] as const;

const isSub = (v: string | null): v is Sub =>
  v === "community" || v === "leaderboard" || v === "people" || v === "groups";

export default function Social() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const sub: Sub = isSub(raw) ? raw : "community";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pb-1 pt-3">
        <SegmentedTabs
          tabs={SUBS}
          value={sub}
          onChange={(v) => setParams(v === "community" ? {} : { tab: v }, { replace: true })}
        />
      </div>

      <Suspense
        fallback={
          <div className="grid flex-1 place-items-center">
            <Loader2 size={16} className="animate-spin text-mist-dim" />
          </div>
        }
      >
        {sub === "community" ? (
          <Community />
        ) : sub === "leaderboard" ? (
          <Leaderboard />
        ) : sub === "people" ? (
          <People />
        ) : (
          <Groups />
        )}
      </Suspense>
    </div>
  );
}
